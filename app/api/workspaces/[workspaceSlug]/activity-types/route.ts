import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreateActivityTypeRequest = {
  key?: string;
  name?: string;
  icon?: string | null;
  customFields?: unknown[];
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

async function authorize(workspaceSlug: string, requireAdmin = false) {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }
  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
  if (!membership) {
    return { error: Response.json({ error: "You do not have access to this workspace." }, { status: 403 }) };
  }
  if (requireAdmin && !user.isPlatformAdmin && membership.role !== "admin") {
    return { error: Response.json({ error: "Only admins can modify activity types." }, { status: 403 }) };
  }
  return { user, membership };
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    key: String(row.key),
    name: String(row.name),
    icon: row.icon ? String(row.icon) : null,
    customFields: Array.isArray(row.custom_fields) ? (row.custom_fields as unknown[]) : [],
    isSystem: Boolean(row.is_system),
  };
}

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_activity_types")
      .select("id, workspace_id, key, name, icon, custom_fields, is_system")
      .eq("workspace_id", auth.membership.workspaceId)
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    return Response.json({ activityTypes: (data ?? []).map((row) => mapRow(row as Record<string, unknown>)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load activity types.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorize(workspaceSlug, true);
    if ("error" in auth) return auth.error;

    const payload = (await request.json().catch(() => ({}))) as CreateActivityTypeRequest;
    const key = payload.key?.trim();
    const name = payload.name?.trim();
    if (!key || !name) {
      return Response.json({ error: "key and name are required." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_activity_types")
      .insert({
        workspace_id: auth.membership.workspaceId,
        key,
        name,
        icon: payload.icon ?? null,
        custom_fields: Array.isArray(payload.customFields) ? payload.customFields : [],
        is_system: false,
      })
      .select("id, workspace_id, key, name, icon, custom_fields, is_system")
      .single();

    if (error) {
      if (error.code === "23505") {
        return Response.json({ error: "An activity type with this key already exists." }, { status: 409 });
      }
      throw new Error(error.message);
    }

    return Response.json({ activityType: mapRow(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create activity type.";
    return Response.json({ error: message }, { status: 400 });
  }
}
