import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; taskId: string }>;
};

type UpdateTaskRequest = {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  dueAt?: string | null;
  reminderAt?: string | null;
  ownerUserId?: string | null;
  ownerAgentId?: string | null;
  assignedToUserId?: string | null;
  listId?: string | null;
  parentTaskId?: string | null;
  customData?: Record<string, unknown>;
  sortOrder?: number;
  approvalStatus?: string;
  approvalRequired?: boolean;
  blockingReason?: string | null;
  metadata?: Record<string, unknown>;
};

const TASK_LEGACY_COLUMN_RE = /(record_id|list_id|parent_task_id|custom_data|sort_order|reminder_at|assigned_to_user_id|description)/;

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
    const previousTaskQuery = await supabase
      .from("workspace_tasks")
      .select(
        "id, status, approval_status, owner_agent_id, owner_user_id, record_id, source_record_id, source_object_id, title",
      )
      .eq("id", taskId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .maybeSingle();

    let previousTask: Record<string, unknown> | null =
      (previousTaskQuery.data as unknown as Record<string, unknown>) ?? null;
    let previousTaskError = previousTaskQuery.error;
    if (previousTaskError && previousTaskError.message.includes("record_id")) {
      const fallback = await supabase
        .from("workspace_tasks")
        .select("id, status, approval_status, owner_agent_id, owner_user_id, source_record_id, source_object_id, title")
        .eq("id", taskId)
        .eq("workspace_id", authorization.membership.workspaceId)
        .maybeSingle();
      previousTask = (fallback.data as unknown as Record<string, unknown>) ?? null;
      previousTaskError = fallback.error;
    }
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
    if (body.description !== undefined) {
      update.description = body.description;
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
    if (body.reminderAt !== undefined) {
      update.reminder_at = body.reminderAt;
    }
    if (body.listId !== undefined) {
      update.list_id = body.listId;
    }
    if (body.parentTaskId !== undefined) {
      update.parent_task_id = body.parentTaskId;
    }
    if (body.customData !== undefined) {
      if (!body.customData || typeof body.customData !== "object" || Array.isArray(body.customData)) {
        return Response.json({ error: "customData must be an object." }, { status: 400 });
      }
      update.custom_data = body.customData;
    }
    if (body.sortOrder !== undefined) {
      const parsed = Number(body.sortOrder);
      if (!Number.isInteger(parsed)) {
        return Response.json({ error: "sortOrder must be an integer." }, { status: 400 });
      }
      update.sort_order = parsed;
    }
    if (body.assignedToUserId !== undefined) {
      update.assigned_to_user_id = body.assignedToUserId;
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

    const SELECT_COLS =
      "id, workspace_id, source_record_id, source_object_id, record_id, list_id, parent_task_id, type, title, description, owner_user_id, owner_agent_id, assigned_to_user_id, status, priority, due_at, reminder_at, approval_required, approval_status, blocking_reason, metadata, custom_data, sort_order, completed_at, created_by, created_at, updated_at";
    const LEGACY_COLS =
      "id, workspace_id, source_record_id, source_object_id, type, title, owner_user_id, owner_agent_id, status, priority, due_at, approval_required, approval_status, blocking_reason, metadata, completed_at, created_by, created_at, updated_at";

    let updateResult = await supabase
      .from("workspace_tasks")
      .update(update)
      .eq("id", taskId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .select(SELECT_COLS)
      .maybeSingle();

    if (updateResult.error && TASK_LEGACY_COLUMN_RE.test(updateResult.error.message)) {
      delete update.reminder_at;
      delete update.assigned_to_user_id;
      delete update.list_id;
      delete update.parent_task_id;
      delete update.custom_data;
      delete update.sort_order;
      delete update.description;
      updateResult = await supabase
        .from("workspace_tasks")
        .update(update)
        .eq("id", taskId)
        .eq("workspace_id", authorization.membership.workspaceId)
        .select(LEGACY_COLS)
        .maybeSingle();
    }

    const { data: updatedTask, error } = updateResult;

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

    const completedNow = statusChanged && nextStatus.toLowerCase() === "completed";
    const linkedRecordId =
      (updatedTask as Record<string, unknown>).record_id ??
      (updatedTask as Record<string, unknown>).source_record_id ??
      null;
    const linkedObjectId = (updatedTask as Record<string, unknown>).source_object_id ?? null;
    if (completedNow && linkedRecordId && linkedObjectId) {
      await supabase.from("record_activities").insert({
        workspace_id: authorization.membership.workspaceId,
        record_id: String(linkedRecordId),
        object_id: String(linkedObjectId),
        type: "task_completed",
        subject: `Tarea completada: ${String(updatedTask.title)}`,
        data: { task_id: String(updatedTask.id) },
        author_user_id: authorization.user.id,
      });
    }

    return Response.json({ task: mapTask(updatedTask as Record<string, unknown>) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update task.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, taskId } = await context.params;
    const authorization = await authorizeWorkspaceWrite(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }
    if (!authorization.user.isPlatformAdmin && authorization.membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to delete tasks." }, { status: 403 });
    }

    const supabase = requireSupabaseAdmin();
    const { data: existing } = await supabase
      .from("workspace_tasks")
      .select("id, title, owner_agent_id")
      .eq("id", taskId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .maybeSingle();

    if (!existing) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }

    const { error } = await supabase
      .from("workspace_tasks")
      .delete()
      .eq("id", taskId)
      .eq("workspace_id", authorization.membership.workspaceId);
    if (error) {
      throw new Error(error.message);
    }

    await supabase.from("agent_events").insert({
      workspace_id: authorization.membership.workspaceId,
      source_agent_id: existing.owner_agent_id ? String(existing.owner_agent_id) : null,
      event_type: "task.deleted",
      payload: {
        task_id: String(existing.id),
        title: String(existing.title ?? ""),
      },
    });

    return Response.json({ deletedTaskId: String(existing.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete task.";
    return Response.json({ error: message }, { status: 400 });
  }
}
