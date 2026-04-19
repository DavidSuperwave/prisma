import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreateStatusRequest = {
  listId?: string | null;
  key?: string;
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

const STATUS_COLS =
  "id, workspace_id, list_id, key, label, color, category, sort_order, is_system";

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;

    const searchParams = new URL(request.url).searchParams;
    const listId = searchParams.get("listId");

    const supabase = requireSupabaseAdmin();
    let query = supabase
      .from("workspace_task_statuses")
      .select(STATUS_COLS)
      .eq("workspace_id", auth.membership.workspaceId)
      .order("sort_order", { ascending: true });

    if (listId) {
      query = query.or(`list_id.eq.${listId},list_id.is.null`);
    }

    const { data, error } = await query;
    if (error) {
      if (/workspace_task_statuses/.test(error.message)) {
        return Response.json({ statuses: [] });
      }
      throw new Error(error.message);
    }
    return Response.json({ statuses: (data ?? []).map((row) => mapStatus(row as Record<string, unknown>)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list task statuses.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (!auth.user.isPlatformAdmin && auth.membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to create statuses." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as CreateStatusRequest;
    const label = body.label?.trim();
    if (!label) return Response.json({ error: "label is required." }, { status: 400 });
    const rawKey = body.key?.trim().toLowerCase();
    const key = (rawKey && rawKey.length > 0 ? rawKey : label.toLowerCase())
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 48);
    if (!key) return Response.json({ error: "A valid key could not be derived from label." }, { status: 400 });
    const category = body.category ?? "todo";
    if (!VALID_CATEGORIES.has(category)) {
      return Response.json({ error: "category must be one of todo/in_progress/done/blocked." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_task_statuses")
      .insert({
        workspace_id: auth.membership.workspaceId,
        list_id: body.listId ?? null,
        key,
        label,
        color: body.color ?? null,
        category,
        sort_order: Number.isInteger(body.sortOrder) ? Number(body.sortOrder) : 0,
      })
      .select(STATUS_COLS)
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ status: mapStatus(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create status.";
    return Response.json({ error: message }, { status: 400 });
  }
}
