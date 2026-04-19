import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const taskId = url.searchParams.get("taskId");
    const recordId = url.searchParams.get("recordId");
    const objectId = url.searchParams.get("objectId");
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 25)));

    const supabase = requireSupabaseAdmin();
    let query = supabase
      .from("agent_events")
      .select("id, event_type, payload, created_at, source_agent_id")
      .eq("workspace_id", auth.membership.workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (taskId) {
      query = query.contains("payload", { taskId });
    } else if (recordId) {
      // Legacy callers use camelCase; newer writes use snake_case. Match either.
      query = query.or(
        `payload->>recordId.eq.${recordId},payload->>record_id.eq.${recordId}`,
      );
    } else if (objectId) {
      query = query.eq("payload->>object_id", objectId);
    }

    const { data, error } = await query;
    if (error) {
      return Response.json({ events: [] }, { status: 200 });
    }

    const events = (data ?? []).map((row) => ({
      id: Number(row.id),
      event_type: String(row.event_type),
      payload: (row.payload as Record<string, unknown>) ?? {},
      created_at: String(row.created_at),
      source_agent_id: row.source_agent_id ? String(row.source_agent_id) : null,
    }));

    return Response.json({ events });
  } catch (error) {
    console.error("/activity GET", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
