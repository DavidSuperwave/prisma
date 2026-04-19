import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreateTaskRequest = {
  sourceRecordId?: string | null;
  sourceObjectId?: string | null;
  recordId?: string | null;
  listId?: string | null;
  parentTaskId?: string | null;
  type?: string;
  title?: string;
  description?: string | null;
  ownerUserId?: string | null;
  ownerAgentId?: string | null;
  assignedToUserId?: string | null;
  status?: string;
  priority?: string;
  dueAt?: string | null;
  reminderAt?: string | null;
  approvalRequired?: boolean;
  approvalStatus?: string;
  blockingReason?: string | null;
  metadata?: Record<string, unknown>;
  customData?: Record<string, unknown>;
  sortOrder?: number;
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
    recordId: row.record_id ? String(row.record_id) : null,
    listId: row.list_id ? String(row.list_id) : null,
    parentTaskId: row.parent_task_id ? String(row.parent_task_id) : null,
    type: String(row.type ?? "follow_up"),
    title: String(row.title ?? "Task"),
    description: row.description ? String(row.description) : null,
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
    ownerAgentId: row.owner_agent_id ? String(row.owner_agent_id) : null,
    assignedToUserId: row.assigned_to_user_id ? String(row.assigned_to_user_id) : null,
    status: String(row.status ?? "pending"),
    priority: String(row.priority ?? "normal"),
    dueAt: row.due_at ? String(row.due_at) : null,
    reminderAt: row.reminder_at ? String(row.reminder_at) : null,
    approvalRequired: Boolean(row.approval_required),
    approvalStatus: String(row.approval_status ?? "not_required"),
    blockingReason: row.blocking_reason ? String(row.blocking_reason) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    customData: (row.custom_data as Record<string, unknown>) ?? {},
    sortOrder: Number(row.sort_order ?? 0),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const TASK_SELECT_COLS =
  "id, workspace_id, source_record_id, source_object_id, record_id, list_id, parent_task_id, type, title, description, owner_user_id, owner_agent_id, assigned_to_user_id, status, priority, due_at, reminder_at, approval_required, approval_status, blocking_reason, metadata, custom_data, sort_order, completed_at, created_by, created_at, updated_at";

const TASK_SELECT_COLS_LEGACY =
  "id, workspace_id, source_record_id, source_object_id, type, title, owner_user_id, owner_agent_id, status, priority, due_at, approval_required, approval_status, blocking_reason, metadata, completed_at, created_by, created_at, updated_at";

const TASK_LEGACY_COLUMN_RE = /(record_id|list_id|parent_task_id|custom_data|sort_order|reminder_at|assigned_to_user_id|description)/;

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

    const recordId = searchParams.get("recordId");
    const listId = searchParams.get("listId");
    const parentTaskId = searchParams.get("parentTaskId");
    const assignedTo = searchParams.get("assignedToUserId");
    const topLevel = searchParams.get("topLevel");

    let query = supabase
      .from("workspace_tasks")
      .select(TASK_SELECT_COLS)
      .eq("workspace_id", authorization.membership.workspaceId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }
    if (recordId) {
      query = query.eq("record_id", recordId);
    }
    if (listId) {
      query = query.eq("list_id", listId);
    }
    if (parentTaskId) {
      query = query.eq("parent_task_id", parentTaskId);
    } else if (topLevel === "1" || topLevel === "true") {
      query = query.is("parent_task_id", null);
    }
    if (assignedTo) {
      query = query.eq("assigned_to_user_id", assignedTo);
    }

    const primary = await query;
    let data: Array<Record<string, unknown>> | null = (primary.data as unknown as Array<Record<string, unknown>>) ?? null;
    let error = primary.error;
    if (error && TASK_LEGACY_COLUMN_RE.test(error.message)) {
      const legacy = await supabase
        .from("workspace_tasks")
        .select(TASK_SELECT_COLS_LEGACY)
        .eq("workspace_id", authorization.membership.workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);
      data = (legacy.data as unknown as Array<Record<string, unknown>>) ?? null;
      error = legacy.error;
    }
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

    const linkedRecordId = body.recordId ?? body.sourceRecordId ?? null;
    const customData =
      body.customData && typeof body.customData === "object" && !Array.isArray(body.customData) ? body.customData : {};

    // Resolve listId: explicit > existing default > null.
    let resolvedListId: string | null = body.listId ?? null;
    if (!resolvedListId) {
      const { data: defaultList } = await supabase
        .from("workspace_task_lists")
        .select("id")
        .eq("workspace_id", authorization.membership.workspaceId)
        .eq("is_default", true)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      resolvedListId = defaultList?.id ? String(defaultList.id) : null;
    }

    const insertPayload: Record<string, unknown> = {
      workspace_id: authorization.membership.workspaceId,
      source_record_id: body.sourceRecordId ?? linkedRecordId,
      source_object_id: body.sourceObjectId ?? null,
      record_id: linkedRecordId,
      list_id: resolvedListId,
      parent_task_id: body.parentTaskId ?? null,
      type: body.type?.trim() || "follow_up",
      title,
      description: body.description ?? null,
      owner_user_id: body.ownerUserId ?? null,
      owner_agent_id: body.ownerAgentId ?? null,
      assigned_to_user_id: body.assignedToUserId ?? null,
      status,
      priority,
      due_at: body.dueAt ?? null,
      reminder_at: body.reminderAt ?? null,
      approval_required: approvalRequired,
      approval_status: approvalStatus,
      blocking_reason: body.blockingReason ?? null,
      metadata,
      custom_data: customData,
      sort_order: Number.isInteger(body.sortOrder) ? Number(body.sortOrder) : 0,
      completed_at: status === "completed" ? new Date().toISOString() : null,
      created_by: authorization.user.id,
    };

    let insertResult = await supabase
      .from("workspace_tasks")
      .insert(insertPayload)
      .select(TASK_SELECT_COLS)
      .single();

    if (insertResult.error && TASK_LEGACY_COLUMN_RE.test(insertResult.error.message)) {
      delete insertPayload.record_id;
      delete insertPayload.reminder_at;
      delete insertPayload.assigned_to_user_id;
      delete insertPayload.list_id;
      delete insertPayload.parent_task_id;
      delete insertPayload.custom_data;
      delete insertPayload.sort_order;
      delete insertPayload.description;
      insertResult = await supabase
        .from("workspace_tasks")
        .insert(insertPayload)
        .select(TASK_SELECT_COLS_LEGACY)
        .single();
    }

    const { data: createdTask, error } = insertResult;

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
