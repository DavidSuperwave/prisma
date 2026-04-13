import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

function parseDateRange(value: string | null, fallback: Date) {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function GET(request: Request, context: Context) {
  try {
    const user = await getCurrentAppUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const { workspaceSlug } = await context.params;
    const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
    const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
    if (!membership) {
      return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
    }

    const searchParams = new URL(request.url).searchParams;
    const agentId = searchParams.get("agentId")?.trim() || null;
    const actionFilters = (searchParams.get("actions") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 14);
    const fromDate = parseDateRange(searchParams.get("from"), defaultFrom);
    const toDate = parseDateRange(searchParams.get("to"), now);
    const limitRaw = Number(searchParams.get("limit") ?? "80");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 80;

    const supabase = requireSupabaseAdmin();
    let query = supabase
      .from("agent_activity")
      .select("id, workspace_id, agent_id, action, details, created_at")
      .eq("workspace_id", membership.workspaceId)
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (agentId) {
      query = query.eq("agent_id", agentId);
    }
    if (actionFilters.length > 0) {
      query = query.in("action", actionFilters);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    return Response.json({
      activity: (data ?? []).map((row) => ({
        id: Number(row.id),
        workspaceId: String(row.workspace_id),
        agentId: String(row.agent_id),
        action: String(row.action),
        details: (row.details as Record<string, unknown>) ?? {},
        createdAt: String(row.created_at),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list activity.";
    return Response.json({ error: message }, { status: 400 });
  }
}
