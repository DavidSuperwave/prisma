import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; listId: string }>;
};

type UpdateListRequest = {
  name?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  isDefault?: boolean;
  sortOrder?: number;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

async function authorize(workspaceSlug: string) {
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

function mapList(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    icon: row.icon ? String(row.icon) : null,
    color: row.color ? String(row.color) : null,
    isDefault: Boolean(row.is_default),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const LIST_COLS =
  "id, workspace_id, name, description, icon, color, is_default, sort_order, created_at, updated_at";

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, listId } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (!auth.user.isPlatformAdmin && auth.membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to update task lists." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as UpdateListRequest;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
      const trimmed = body.name.trim();
      if (!trimmed) return Response.json({ error: "name cannot be empty." }, { status: 400 });
      update.name = trimmed;
    }
    if (body.description !== undefined) update.description = body.description;
    if (body.icon !== undefined) update.icon = body.icon;
    if (body.color !== undefined) update.color = body.color;
    if (body.isDefault !== undefined) update.is_default = Boolean(body.isDefault);
    if (body.sortOrder !== undefined) {
      const parsed = Number(body.sortOrder);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return Response.json({ error: "sortOrder must be a non-negative integer." }, { status: 400 });
      }
      update.sort_order = parsed;
    }

    if (Object.keys(update).length === 1) {
      return Response.json({ error: "At least one list field must be provided." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_task_lists")
      .update(update)
      .eq("id", listId)
      .eq("workspace_id", auth.membership.workspaceId)
      .select(LIST_COLS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return Response.json({ error: "List not found." }, { status: 404 });

    await supabase.from("agent_events").insert({
      workspace_id: auth.membership.workspaceId,
      source_agent_id: null,
      event_type: "task_list.updated",
      payload: { list_id: String(data.id), fields: Object.keys(update).filter((key) => key !== "updated_at") },
    });

    return Response.json({ list: mapList(data as Record<string, unknown>) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update task list.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, listId } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (!auth.user.isPlatformAdmin && auth.membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to delete task lists." }, { status: 403 });
    }

    const supabase = requireSupabaseAdmin();
    const { data: existing } = await supabase
      .from("workspace_task_lists")
      .select("id, name, is_default")
      .eq("id", listId)
      .eq("workspace_id", auth.membership.workspaceId)
      .maybeSingle();
    if (!existing) return Response.json({ error: "List not found." }, { status: 404 });
    if (existing.is_default) {
      return Response.json({ error: "Cannot delete the default list." }, { status: 400 });
    }

    const { error } = await supabase
      .from("workspace_task_lists")
      .delete()
      .eq("id", listId)
      .eq("workspace_id", auth.membership.workspaceId);
    if (error) throw new Error(error.message);

    await supabase.from("agent_events").insert({
      workspace_id: auth.membership.workspaceId,
      source_agent_id: null,
      event_type: "task_list.deleted",
      payload: { list_id: String(existing.id), name: String(existing.name ?? "") },
    });

    return Response.json({ deletedListId: String(existing.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete task list.";
    return Response.json({ error: message }, { status: 400 });
  }
}
