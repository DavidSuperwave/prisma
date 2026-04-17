import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreateTaskRequest = {
  sourceRecordId?: string | null;
  sourceObjectId?: string | null;
  type?: string;
  title?: string;
  ownerUserId?: string | null;
  ownerAgentId?: string | null;
  status?: string;
  priority?: string;
  dueAt?: string | null;
  approvalRequired?: boolean;
  approvalStatus?: string;
  blockingReason?: string | null;
  metadata?: Record<string, unknown>;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

async function authorizeWorkspaceWrite(workspaceSlug: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
  if (!membership) {
    return { error: Response.json({ error: "You do not have access to this workspace." }, { status: 403 }) };
  }
  return { user, membership };
}

function mapTask(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    sourceRecordId: row.source_record_id ? String(row.source_record_id) : null,
    sourceObjectId: row.source_object_id ? String(row.source_object_id) : null,
    type: String(row.type ?? "follow_up"),
    title: String(row.title ?? "Task"),
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
    ownerAgentId: row.owner_agent_id ? String(row.owner_agent_id) : null,
    status: String(row.status ?? "pending"),
    priority: String(row.priority ?? "normal"),
    dueAt: row.due_at ? String(row.due_at) : null,
    approvalRequired: Boolean(row.approval_required),
    approvalStatus: String(row.approval_status ?? "not_required"),
    blockingReason: row.blocking_reason ? String(row.blocking_reason) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeWorkspaceWrite(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const searchParams = new URL(request.url).searchParams;
    const status = searchParams.get("status");
    const limitRaw = Number(searchParams.get("limit") ?? "80");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 80;
    const supabase = requireSupabaseAdmin();

    let query = supabase
      .from("workspace_tasks")
      .select("id, workspace_id, source_record_id, source_object_id, type, title, owner_user_id, owner_agent_id, status, priority, due_at, approval_required, approval_status, blocking_reason, metadata, completed_at, created_by, created_at, updated_at")
      .eq("workspace_id", authorization.membership.workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    return Response.json({ tasks: (data ?? []).map((row) => mapTask(row as Record<string, unknown>)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list tasks.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeWorkspaceWrite(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }
    if (!authorization.user.isPlatformAdmin && authorization.membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to create tasks." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as CreateTaskRequest;
    const title = body.title?.trim();
    if (!title) {
      return Response.json({ error: "title is required." }, { status: 400 });
    }

    const status = body.status?.trim() || "pending";
    const priority = body.priority?.trim() || "normal";
    const approvalRequired = Boolean(body.approvalRequired);
    const approvalStatus = body.approvalStatus?.trim() || (approvalRequired ? "pending" : "not_required");
    const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};

    const supabase = requireSupabaseAdmin();
    if (body.ownerAgentId) {
      const { data: ownerAgent, error: ownerAgentError } = await supabase
        .from("workspace_agents")
        .select("id")
        .eq("workspace_id", authorization.membership.workspaceId)
        .eq("id", body.ownerAgentId)
        .maybeSingle();
      if (ownerAgentError) {
        throw new Error(ownerAgentError.message);
      }
      if (!ownerAgent) {
        return Response.json({ error: "ownerAgentId is invalid for this workspace." }, { status: 400 });
      }
    }

    const { data: createdTask, error } = await supabase
      .from("workspace_tasks")
      .insert({
        workspace_id: authorization.membership.workspaceId,
        source_record_id: body.sourceRecordId ?? null,
        source_object_id: body.sourceObjectId ?? null,
        type: body.type?.trim() || "follow_up",
        title,
        owner_user_id: body.ownerUserId ?? null,
        owner_agent_id: body.ownerAgentId ?? null,
        status,
        priority,
        due_at: body.dueAt ?? null,
        approval_required: approvalRequired,
        approval_status: approvalStatus,
        blocking_reason: body.blockingReason ?? null,
        metadata,
        completed_at: status === "completed" ? new Date().toISOString() : null,
        created_by: authorization.user.id,
      })
      .select("id, workspace_id, source_record_id, source_object_id, type, title, owner_user_id, owner_agent_id, status, priority, due_at, approval_required, approval_status, blocking_reason, metadata, completed_at, created_by, created_at, updated_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    let actorAgentId = createdTask.owner_agent_id ? String(createdTask.owner_agent_id) : null;
    if (!actorAgentId) {
      const { data: fallbackAgent } = await supabase
        .from("workspace_agents")
        .select("id")
        .eq("workspace_id", authorization.membership.workspaceId)
        .in("type", ["worker", "copilot"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      actorAgentId = fallbackAgent?.id ? String(fallbackAgent.id) : null;
    }

    if (actorAgentId) {
      await supabase.from("agent_activity").insert({
        workspace_id: authorization.membership.workspaceId,
        agent_id: actorAgentId,
        action: "task.created",
        details: {
          task_id: String(createdTask.id),
          title,
          type: String(createdTask.type),
          status: String(createdTask.status),
          owner_agent_id: createdTask.owner_agent_id ? String(createdTask.owner_agent_id) : null,
          owner_user_id: createdTask.owner_user_id ? String(createdTask.owner_user_id) : null,
          source_record_id: createdTask.source_record_id ? String(createdTask.source_record_id) : null,
        },
      });
    }

    await supabase.from("agent_events").insert({
      workspace_id: authorization.membership.workspaceId,
      source_agent_id: actorAgentId,
      event_type: "task.created",
      payload: {
        task_id: String(createdTask.id),
        status: String(createdTask.status),
        owner_agent_id: createdTask.owner_agent_id ? String(createdTask.owner_agent_id) : null,
        owner_user_id: createdTask.owner_user_id ? String(createdTask.owner_user_id) : null,
      },
    });

    return Response.json({ task: mapTask(createdTask as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create task.";
    return Response.json({ error: message }, { status: 400 });
  }
}
