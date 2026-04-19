import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreateListRequest = {
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

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_task_lists")
      .select(LIST_COLS)
      .eq("workspace_id", auth.membership.workspaceId)
      .order("sort_order", { ascending: true });
    if (error) {
      if (/workspace_task_lists/.test(error.message)) {
        return Response.json({ lists: [] });
      }
      throw new Error(error.message);
    }
    return Response.json({ lists: (data ?? []).map((row) => mapList(row as Record<string, unknown>)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list task lists.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (!auth.user.isPlatformAdmin && auth.membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to create task lists." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as CreateListRequest;
    const name = body.name?.trim();
    if (!name) {
      return Response.json({ error: "name is required." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_task_lists")
      .insert({
        workspace_id: auth.membership.workspaceId,
        name,
        description: body.description ?? null,
        icon: body.icon ?? null,
        color: body.color ?? null,
        is_default: Boolean(body.isDefault),
        sort_order: Number.isInteger(body.sortOrder) ? Number(body.sortOrder) : 0,
        created_by: auth.user.id,
      })
      .select(LIST_COLS)
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("agent_events").insert({
      workspace_id: auth.membership.workspaceId,
      source_agent_id: null,
      event_type: "task_list.created",
      payload: { list_id: String(data.id), name },
    });

    return Response.json({ list: mapList(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create task list.";
    return Response.json({ error: message }, { status: 400 });
  }
}
