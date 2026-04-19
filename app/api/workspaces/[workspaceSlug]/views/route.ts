import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser, listWorkspaceViews } from "@/lib/workspaceStore";
import { parseFilterDsl } from "@/lib/crm/filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ workspaceSlug: string }> };

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

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeView(workspaceSlug);
    if ("error" in authorization) return authorization.error;

    const url = new URL(request.url);
    const objectId = url.searchParams.get("objectId") ?? undefined;
    const allViews = await listWorkspaceViews(authorization.membership.workspaceId, objectId);

    const visible = allViews.filter((view) => {
      if (view.scope === "private") {
        return view.createdByUserId === authorization.user.id;
      }
      return true;
    });

    return Response.json({ views: visible });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list views.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeView(workspaceSlug);
    if ("error" in authorization) return authorization.error;

    if (authorization.membership.role === "viewer" && !authorization.membership.isPlatformAdmin) {
      return Response.json({ error: "You do not have permission to create views." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      objectId?: string;
      scope?: string;
      filterDsl?: unknown;
      sortConfig?: unknown;
      columnConfig?: unknown;
      columns?: unknown;
      isPinned?: boolean;
      viewMode?: string;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const objectId = typeof body.objectId === "string" ? body.objectId : "";
    if (!name) return Response.json({ error: "Name is required." }, { status: 400 });
    if (!objectId) return Response.json({ error: "objectId is required." }, { status: 400 });

    const scope = typeof body.scope === "string" && ALLOWED_SCOPES.has(body.scope) ? body.scope : "private";
    if (scope === "org" && authorization.membership.role !== "admin" && !authorization.membership.isPlatformAdmin) {
      return Response.json({ error: "Only admins can create org-scope views." }, { status: 403 });
    }

    const parsedFilterDsl = parseFilterDsl(body.filterDsl);
    if (parsedFilterDsl === null) {
      return Response.json({ error: "Invalid filter DSL." }, { status: 400 });
    }

    const viewMode =
      typeof body.viewMode === "string" && ALLOWED_VIEW_MODES.has(body.viewMode) ? body.viewMode : "table";

    const supabase = requireSupabaseAdmin();
    const { data: objectRow, error: objectError } = await supabase
      .from("workspace_objects")
      .select("id, workspace_id")
      .eq("id", objectId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .maybeSingle();
    if (objectError) throw new Error(objectError.message);
    if (!objectRow) return Response.json({ error: "Object not found." }, { status: 404 });

    const payload: Record<string, unknown> = {
      workspace_id: authorization.membership.workspaceId,
      object_id: objectId,
      name,
      filters: {},
      sort_by: null,
      sort_order: null,
      columns: Array.isArray(body.columns) ? body.columns : [],
      scope,
      filter_dsl: parsedFilterDsl,
      sort_config: Array.isArray(body.sortConfig) ? body.sortConfig : [],
      column_config: Array.isArray(body.columnConfig) ? body.columnConfig : [],
      is_pinned: Boolean(body.isPinned),
      view_mode: viewMode,
      created_by_user_id: authorization.user.id,
    };

    const { data, error } = await supabase
      .from("workspace_views")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      // Fallback for envs missing the smart-view columns: try with only legacy columns.
      if (
        error.message.includes("scope") ||
        error.message.includes("filter_dsl") ||
        error.message.includes("is_pinned") ||
        error.message.includes("view_mode") ||
        error.message.includes("column_config") ||
        error.message.includes("sort_config") ||
        error.message.includes("created_by_user_id")
      ) {
        const { data: legacyData, error: legacyError } = await supabase
          .from("workspace_views")
          .insert({
            workspace_id: authorization.membership.workspaceId,
            object_id: objectId,
            name,
            filters: {},
            columns: Array.isArray(body.columns) ? body.columns : [],
          })
          .select("id")
          .single();
        if (legacyError) throw new Error(legacyError.message);
        return Response.json({ viewId: legacyData?.id ?? null, degraded: true });
      }
      throw new Error(error.message);
    }

    return Response.json({ viewId: data?.id ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create view.";
    return Response.json({ error: message }, { status: 400 });
  }
}
