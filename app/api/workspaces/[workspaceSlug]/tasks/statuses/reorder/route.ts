import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type ReorderRequest = {
  order?: string[];
  listId?: string | null;
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

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (!auth.user.isPlatformAdmin && auth.membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to reorder statuses." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as ReorderRequest;
    const order = Array.isArray(body.order) ? body.order.filter((id) => typeof id === "string") : [];
    if (order.length === 0) {
      return Response.json({ error: "order must be a non-empty array of status ids." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();

    const { data: rows, error: fetchError } = await supabase
      .from("workspace_task_statuses")
      .select("id, workspace_id")
      .in("id", order);
    if (fetchError) throw new Error(fetchError.message);

    const belong = (rows ?? []).every((row) => String(row.workspace_id) === auth.membership.workspaceId);
    if (!belong) {
      return Response.json({ error: "Some statuses do not belong to this workspace." }, { status: 403 });
    }
    if ((rows ?? []).length !== order.length) {
      return Response.json({ error: "One or more statuses could not be found." }, { status: 404 });
    }

    await Promise.all(
      order.map((id, index) =>
        supabase
          .from("workspace_task_statuses")
          .update({ sort_order: (index + 1) * 10 })
          .eq("id", id)
          .eq("workspace_id", auth.membership.workspaceId),
      ),
    );

    await supabase.from("agent_events").insert({
      workspace_id: auth.membership.workspaceId,
      source_agent_id: null,
      event_type: "task_status.reordered",
      payload: { order, listId: body.listId ?? null },
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reorder statuses.";
    return Response.json({ error: message }, { status: 400 });
  }
}
