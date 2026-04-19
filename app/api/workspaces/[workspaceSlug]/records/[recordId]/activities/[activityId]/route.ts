import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; recordId: string; activityId: string }>;
};

type PatchRequest = {
  subject?: string | null;
  body?: string | null;
  data?: Record<string, unknown>;
  isPinned?: boolean;
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
  if (!membership.isPlatformAdmin && membership.role === "viewer") {
    return { error: Response.json({ error: "Viewers cannot modify activities." }, { status: 403 }) };
  }
  return { user, membership };
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, recordId, activityId } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;

    const payload = (await request.json().catch(() => ({}))) as PatchRequest;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.subject !== undefined) update.subject = payload.subject;
    if (payload.body !== undefined) update.body = payload.body;
    if (payload.data !== undefined) update.data = payload.data;
    if (payload.isPinned !== undefined) update.is_pinned = Boolean(payload.isPinned);

    if (Object.keys(update).length === 1) {
      return Response.json({ error: "No updatable fields provided." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("record_activities")
      .update(update)
      .eq("id", activityId)
      .eq("record_id", recordId)
      .eq("workspace_id", auth.membership.workspaceId)
      .select("id")
      .maybeSingle();

    if (error) {
      if (error.message.includes("Max 5 pinned")) {
        return Response.json({ error: error.message }, { status: 409 });
      }
      throw new Error(error.message);
    }
    if (!data) {
      return Response.json({ error: "Activity not found." }, { status: 404 });
    }
    return Response.json({ updatedActivityId: String(data.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update activity.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, recordId, activityId } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("record_activities")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", activityId)
      .eq("record_id", recordId)
      .eq("workspace_id", auth.membership.workspaceId)
      .select("id")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return Response.json({ error: "Activity not found." }, { status: 404 });
    }
    return Response.json({ deletedActivityId: String(data.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete activity.";
    return Response.json({ error: message }, { status: 400 });
  }
}
