import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; statusId: string }>;
};

type UpdateStatusRequest = {
  label?: string;
  color?: string | null;
  category?: "todo" | "in_progress" | "done" | "blocked";
  sortOrder?: number;
};

const VALID_CATEGORIES = new Set(["todo", "in_progress", "done", "blocked"]);

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

function mapStatus(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    listId: row.list_id ? String(row.list_id) : null,
    key: String(row.key),
    label: String(row.label),
    color: row.color ? String(row.color) : null,
    category: String(row.category ?? "todo"),
    sortOrder: Number(row.sort_order ?? 0),
    isSystem: Boolean(row.is_system),
  };
}

const STATUS_COLS = "id, workspace_id, list_id, key, label, color, category, sort_order, is_system";

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, statusId } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (!auth.user.isPlatformAdmin && auth.membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to update statuses." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as UpdateStatusRequest;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.label !== undefined) {
      const trimmed = body.label.trim();
      if (!trimmed) return Response.json({ error: "label cannot be empty." }, { status: 400 });
      update.label = trimmed;
    }
    if (body.color !== undefined) update.color = body.color;
    if (body.category !== undefined) {
      if (!VALID_CATEGORIES.has(body.category)) {
        return Response.json({ error: "Invalid category." }, { status: 400 });
      }
      update.category = body.category;
    }
    if (body.sortOrder !== undefined) {
      const parsed = Number(body.sortOrder);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return Response.json({ error: "sortOrder must be a non-negative integer." }, { status: 400 });
      }
      update.sort_order = parsed;
    }

    if (Object.keys(update).length === 1) {
      return Response.json({ error: "At least one status field must be provided." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_task_statuses")
      .update(update)
      .eq("id", statusId)
      .eq("workspace_id", auth.membership.workspaceId)
      .select(STATUS_COLS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return Response.json({ error: "Status not found." }, { status: 404 });
    return Response.json({ status: mapStatus(data as Record<string, unknown>) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update status.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, statusId } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (!auth.user.isPlatformAdmin && auth.membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to delete statuses." }, { status: 403 });
    }

    const supabase = requireSupabaseAdmin();
    const { data: existing } = await supabase
      .from("workspace_task_statuses")
      .select("id, is_system, list_id")
      .eq("id", statusId)
      .eq("workspace_id", auth.membership.workspaceId)
      .maybeSingle();
    if (!existing) return Response.json({ error: "Status not found." }, { status: 404 });
    if (existing.is_system && !existing.list_id) {
      return Response.json({ error: "Workspace-default system statuses cannot be deleted." }, { status: 400 });
    }

    const { error } = await supabase
      .from("workspace_task_statuses")
      .delete()
      .eq("id", statusId)
      .eq("workspace_id", auth.membership.workspaceId);
    if (error) throw new Error(error.message);
    return Response.json({ deletedStatusId: String(existing.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete status.";
    return Response.json({ error: message }, { status: 400 });
  }
}
