import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";
import { parseFilterDsl } from "@/lib/crm/filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ workspaceSlug: string; viewId: string }> };

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

async function authorizeView(workspaceSlug: string) {
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

const ALLOWED_SCOPES = new Set(["private", "team", "org"]);
const ALLOWED_VIEW_MODES = new Set(["table", "board", "kpi", "pipeline"]);

async function loadView(workspaceId: string, viewId: string) {
  const supabase = requireSupabaseAdmin();
  const smartSelect =
    "id, workspace_id, object_id, name, filters, sort_by, sort_order, columns, group_by_field_id, scope, filter_dsl, sort_config, column_config, is_pinned, view_mode, created_by_user_id";
  const smart = await supabase
    .from("workspace_views")
    .select(smartSelect)
    .eq("id", viewId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!smart.error) return { row: smart.data as Record<string, unknown> | null, hasSmart: true };
  const fallback = await supabase
    .from("workspace_views")
    .select("id, workspace_id, object_id, name, filters, sort_by, sort_order, columns")
    .eq("id", viewId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (fallback.error) throw new Error(fallback.error.message);
  return { row: fallback.data as Record<string, unknown> | null, hasSmart: false };
}

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug, viewId } = await context.params;
    const authorization = await authorizeView(workspaceSlug);
    if ("error" in authorization) return authorization.error;

    const { row } = await loadView(authorization.membership.workspaceId, viewId);
    if (!row) return Response.json({ error: "View not found." }, { status: 404 });

    const scope = typeof row.scope === "string" ? row.scope : "private";
    const createdBy = row.created_by_user_id ? String(row.created_by_user_id) : null;
    if (scope === "private" && createdBy && createdBy !== authorization.user.id) {
      return Response.json({ error: "View not accessible." }, { status: 403 });
    }

    return Response.json({ view: row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load view.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, viewId } = await context.params;
    const authorization = await authorizeView(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    if (authorization.membership.role === "viewer" && !authorization.membership.isPlatformAdmin) {
      return Response.json({ error: "You do not have permission to edit views." }, { status: 403 });
    }

    const { row } = await loadView(authorization.membership.workspaceId, viewId);
    if (!row) return Response.json({ error: "View not found." }, { status: 404 });

    const existingScope = typeof row.scope === "string" ? row.scope : "private";
    const createdBy = row.created_by_user_id ? String(row.created_by_user_id) : null;

    if (existingScope === "private" && createdBy && createdBy !== authorization.user.id) {
      return Response.json({ error: "View not accessible." }, { status: 403 });
    }
    if (existingScope === "org" && authorization.membership.role !== "admin" && !authorization.membership.isPlatformAdmin) {
      return Response.json({ error: "Only admins can edit org-scope views." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      scope?: string;
      filterDsl?: unknown;
      sortConfig?: unknown;
      columnConfig?: unknown;
      columns?: unknown;
      isPinned?: boolean;
      viewMode?: string;
    };

    const updates: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim().length > 0) {
      updates.name = body.name.trim();
    }
    if (typeof body.scope === "string" && ALLOWED_SCOPES.has(body.scope)) {
      if (body.scope === "org" && authorization.membership.role !== "admin" && !authorization.membership.isPlatformAdmin) {
        return Response.json({ error: "Only admins can set org scope." }, { status: 403 });
      }
      updates.scope = body.scope;
    }
    if (body.filterDsl !== undefined) {
      const parsed = parseFilterDsl(body.filterDsl);
      if (parsed === null) {
        return Response.json({ error: "Invalid filter DSL." }, { status: 400 });
      }
      updates.filter_dsl = parsed;
    }
    if (Array.isArray(body.sortConfig)) updates.sort_config = body.sortConfig;
    if (Array.isArray(body.columnConfig)) updates.column_config = body.columnConfig;
    if (Array.isArray(body.columns)) updates.columns = body.columns;
    if (typeof body.isPinned === "boolean") updates.is_pinned = body.isPinned;
    if (typeof body.viewMode === "string" && ALLOWED_VIEW_MODES.has(body.viewMode)) {
      updates.view_mode = body.viewMode;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No updatable fields provided." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { error } = await supabase
      .from("workspace_views")
      .update(updates)
      .eq("id", viewId)
      .eq("workspace_id", authorization.membership.workspaceId);

    if (error) throw new Error(error.message);

    return Response.json({ viewId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update view.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, viewId } = await context.params;
    const authorization = await authorizeView(workspaceSlug);
    if ("error" in authorization) return authorization.error;
    if (authorization.membership.role === "viewer" && !authorization.membership.isPlatformAdmin) {
      return Response.json({ error: "You do not have permission to delete views." }, { status: 403 });
    }

    const { row } = await loadView(authorization.membership.workspaceId, viewId);
    if (!row) return Response.json({ error: "View not found." }, { status: 404 });
    const scope = typeof row.scope === "string" ? row.scope : "private";
    const createdBy = row.created_by_user_id ? String(row.created_by_user_id) : null;
    if (scope === "private" && createdBy && createdBy !== authorization.user.id) {
      return Response.json({ error: "View not accessible." }, { status: 403 });
    }
    if (scope === "org" && authorization.membership.role !== "admin" && !authorization.membership.isPlatformAdmin) {
      return Response.json({ error: "Only admins can delete org-scope views." }, { status: 403 });
    }

    const supabase = requireSupabaseAdmin();
    const { error } = await supabase
      .from("workspace_views")
      .delete()
      .eq("id", viewId)
      .eq("workspace_id", authorization.membership.workspaceId);

    if (error) throw new Error(error.message);
    return Response.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete view.";
    return Response.json({ error: message }, { status: 400 });
  }
}
