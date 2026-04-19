import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

/**
 * High-level ClickUp-style field types accepted by the Tasks UI.
 * We store them as the closest supported workspace_fields.type + a
 * `widget` hint in options so the UI can render the right editor while
 * keeping the DB schema unchanged.
 */
const WIDGET_TO_BASE_TYPE: Record<string, { type: string; optionsExtra?: Record<string, unknown> }> = {
  text: { type: "text" },
  long_text: { type: "text", optionsExtra: { multiline: true } },
  number: { type: "number" },
  money: { type: "currency" },
  date: { type: "date" },
  datetime: { type: "date", optionsExtra: { time: true } },
  checkbox: { type: "boolean" },
  dropdown: { type: "select" },
  labels: { type: "select", optionsExtra: { multiple: true } },
  status: { type: "status" },
  relation: { type: "relation" },
  people: { type: "relation", optionsExtra: { relation_kind: "users" } },
  files: { type: "file" },
  email: { type: "text", optionsExtra: { format: "email" } },
  phone: { type: "text", optionsExtra: { format: "phone" } },
  website: { type: "text", optionsExtra: { format: "url" } },
  rating: { type: "number", optionsExtra: { format: "rating", max: 5 } },
  rollup: { type: "text", optionsExtra: { format: "rollup" } },
  formula: { type: "text", optionsExtra: { format: "formula" } },
  location: { type: "text", optionsExtra: { format: "location" } },
  signature: { type: "file", optionsExtra: { format: "signature" } },
  progress: { type: "number", optionsExtra: { format: "progress" } },
};

type CreateFieldRequest = {
  name?: string;
  key?: string;
  widget?: string;
  required?: boolean;
  options?: Record<string, unknown>;
  defaultValue?: string | null;
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

async function getTasksObjectId(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  workspaceId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("workspace_objects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("kind", "tasks")
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

function mapField(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    objectId: String(row.object_id),
    name: String(row.name),
    key: String(row.key),
    type: String(row.type),
    required: Boolean(row.required),
    options: (row.options as Record<string, unknown>) ?? {},
    defaultValue: row.default_value ? String(row.default_value) : null,
    sortOrder: Number(row.sort_order ?? 0),
    isLocked: Boolean(row.is_locked),
  };
}

const FIELD_COLS = "id, workspace_id, object_id, name, key, type, required, options, default_value, sort_order, is_locked";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;

    const supabase = requireSupabaseAdmin();
    const tasksObjectId = await getTasksObjectId(supabase, auth.membership.workspaceId);
    if (!tasksObjectId) {
      return Response.json({ tasksObjectId: null, fields: [] });
    }

    const { data, error } = await supabase
      .from("workspace_fields")
      .select(FIELD_COLS)
      .eq("workspace_id", auth.membership.workspaceId)
      .eq("object_id", tasksObjectId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    return Response.json({
      tasksObjectId,
      fields: (data ?? []).map((row) => mapField(row as Record<string, unknown>)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list task fields.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorize(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (!auth.user.isPlatformAdmin && auth.membership.role !== "admin") {
      return Response.json({ error: "Only workspace admins can manage task fields." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as CreateFieldRequest;
    const name = body.name?.trim();
    if (!name) return Response.json({ error: "name is required." }, { status: 400 });
    const widget = (body.widget ?? "text").toLowerCase();
    const mapping = WIDGET_TO_BASE_TYPE[widget];
    if (!mapping) {
      return Response.json(
        { error: `Unsupported widget '${widget}'. Supported: ${Object.keys(WIDGET_TO_BASE_TYPE).join(", ")}.` },
        { status: 400 },
      );
    }

    const key = body.key?.trim() || slugify(name);
    if (!key) return Response.json({ error: "key could not be derived from name." }, { status: 400 });

    const supabase = requireSupabaseAdmin();
    const tasksObjectId = await getTasksObjectId(supabase, auth.membership.workspaceId);
    if (!tasksObjectId) {
      return Response.json(
        { error: "Tasks virtual object not found for workspace. Run the M12 migration." },
        { status: 500 },
      );
    }

    const baseOptions =
      body.options && typeof body.options === "object" && !Array.isArray(body.options) ? body.options : {};
    const options = {
      ...baseOptions,
      ...(mapping.optionsExtra ?? {}),
      widget,
    };

    const { data, error } = await supabase
      .from("workspace_fields")
      .insert({
        workspace_id: auth.membership.workspaceId,
        object_id: tasksObjectId,
        name,
        key,
        type: mapping.type,
        required: Boolean(body.required),
        options,
        default_value: body.defaultValue ?? null,
        sort_order: Number.isInteger(body.sortOrder) ? Number(body.sortOrder) : 1000,
        is_locked: false,
      })
      .select(FIELD_COLS)
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("agent_events").insert({
      workspace_id: auth.membership.workspaceId,
      source_agent_id: null,
      event_type: "task_field.created",
      payload: { field_id: String(data.id), key, widget },
    });

    return Response.json({ field: mapField(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create task field.";
    return Response.json({ error: message }, { status: 400 });
  }
}
