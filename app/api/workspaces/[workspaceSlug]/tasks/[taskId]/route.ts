import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string; taskId: string }>;
};

type UpdateTaskRequest = {
  title?: string;
  status?: string;
  priority?: string;
  dueAt?: string | null;
  ownerUserId?: string | null;
  ownerAgentId?: string | null;
  approvalStatus?: string;
  approvalRequired?: boolean;
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

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, taskId } = await context.params;
    const authorization = await authorizeWorkspaceWrite(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }
    if (!authorization.user.isPlatformAdmin && authorization.membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to update tasks." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as UpdateTaskRequest;
    const supabase = requireSupabaseAdmin();
    const { data: previousTask, error: previousTaskError } = await supabase
      .from("workspace_tasks")
      .select("id, status, approval_status, owner_agent_id, owner_user_id")
      .eq("id", taskId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .maybeSingle();
    if (previousTaskError) {
      throw new Error(previousTaskError.message);
    }
    if (!previousTask) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.title !== undefined) {
      const title = body.title.trim();
      if (!title) {
        return Response.json({ error: "title cannot be empty." }, { status: 400 });
      }
      update.title = title;
    }
    if (body.status !== undefined) {
      update.status = body.status.trim();
      update.completed_at = body.status.trim().toLowerCase() === "completed" ? new Date().toISOString() : null;
    }
    if (body.priority !== undefined) {
      update.priority = body.priority.trim();
    }
    if (body.dueAt !== undefined) {
      update.due_at = body.dueAt;
    }
    if (body.ownerUserId !== undefined) {
      update.owner_user_id = body.ownerUserId;
    }
    if (body.ownerAgentId !== undefined) {
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
      update.owner_agent_id = body.ownerAgentId;
    }
    if (body.approvalStatus !== undefined) {
      update.approval_status = body.approvalStatus.trim();
    }
    if (body.approvalRequired !== undefined) {
      update.approval_required = Boolean(body.approvalRequired);
    }
    if (body.blockingReason !== undefined) {
      update.blocking_reason = body.blockingReason;
    }
    if (body.metadata !== undefined) {
      if (!body.metadata || typeof body.metadata !== "object" || Array.isArray(body.metadata)) {
        return Response.json({ error: "metadata must be an object." }, { status: 400 });
      }
      update.metadata = body.metadata;
    }

    if (Object.keys(update).length === 1) {
      return Response.json({ error: "At least one task field must be provided." }, { status: 400 });
    }

    const { data: updatedTask, error } = await supabase
      .from("workspace_tasks")
      .update(update)
      .eq("id", taskId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .select("id, workspace_id, source_record_id, source_object_id, type, title, owner_user_id, owner_agent_id, status, priority, due_at, approval_required, approval_status, blocking_reason, metadata, completed_at, created_by, created_at, updated_at")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    if (!updatedTask) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }

    let actorAgentId = updatedTask.owner_agent_id
      ? String(updatedTask.owner_agent_id)
      : previousTask.owner_agent_id
        ? String(previousTask.owner_agent_id)
        : null;
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

    const previousStatus = String(previousTask.status ?? "pending");
    const nextStatus = String(updatedTask.status ?? "pending");
    const statusChanged = previousStatus !== nextStatus;
    const eventType = statusChanged ? "task.status_changed" : "task.updated";

    if (actorAgentId) {
      await supabase.from("agent_activity").insert({
        workspace_id: authorization.membership.workspaceId,
        agent_id: actorAgentId,
        action: eventType,
        details: {
          task_id: String(updatedTask.id),
          previous_status: previousStatus,
          status: nextStatus,
          approval_status: String(updatedTask.approval_status ?? "not_required"),
          blocking_reason: updatedTask.blocking_reason ? String(updatedTask.blocking_reason) : null,
          owner_agent_id: updatedTask.owner_agent_id ? String(updatedTask.owner_agent_id) : null,
          owner_user_id: updatedTask.owner_user_id ? String(updatedTask.owner_user_id) : null,
        },
      });
    }

    await supabase.from("agent_events").insert({
      workspace_id: authorization.membership.workspaceId,
      source_agent_id: actorAgentId,
      event_type: eventType,
      payload: {
        task_id: String(updatedTask.id),
        previous_status: previousStatus,
        status: nextStatus,
        approval_status: String(updatedTask.approval_status ?? "not_required"),
        owner_agent_id: updatedTask.owner_agent_id ? String(updatedTask.owner_agent_id) : null,
        owner_user_id: updatedTask.owner_user_id ? String(updatedTask.owner_user_id) : null,
      },
    });

    return Response.json({ task: mapTask(updatedTask as Record<string, unknown>) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update task.";
    return Response.json({ error: message }, { status: 400 });
  }
}
