import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreateFieldRequest = {
  objectId?: string;
  name?: string;
  key?: string;
  type?: string;
  required?: boolean;
  options?: Record<string, unknown>;
  defaultValue?: string | null;
  sortOrder?: number;
};

const allowedFieldTypes = new Set([
  "text",
  "number",
  "currency",
  "date",
  "boolean",
  "select",
  "relation",
  "file",
  "status",
]);

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

function normalizeFieldKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function authorizeWorkspaceAdmin(workspaceSlug: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
  if (!membership) {
    return { error: Response.json({ error: "You do not have access to this workspace." }, { status: 403 }) };
  }

  if (!user.isPlatformAdmin && membership.role !== "admin") {
    return {
      error: Response.json({ error: "Only workspace admins can manage fields." }, { status: 403 }),
    };
  }

  return { user, membership };
}

function mapFieldRow(row: Record<string, unknown>) {
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
  };
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const payload = (await request.json().catch(() => ({}))) as CreateFieldRequest;
    const objectId = payload.objectId?.trim();
    const name = payload.name?.trim();
    const key = (payload.key?.trim() || (name ? normalizeFieldKey(name) : "")).toLowerCase();
    const type = payload.type?.trim().toLowerCase();
    const options = payload.options && typeof payload.options === "object" ? payload.options : {};
    const required = Boolean(payload.required);
    const defaultValue = payload.defaultValue === undefined ? null : payload.defaultValue;
    const sortOrder = Number.isFinite(payload.sortOrder) ? Number(payload.sortOrder) : null;

    if (!objectId) {
      return Response.json({ error: "objectId is required." }, { status: 400 });
    }
    if (!name) {
      return Response.json({ error: "name is required." }, { status: 400 });
    }
    if (!key) {
      return Response.json({ error: "key is required." }, { status: 400 });
    }
    if (!/^[a-z0-9_]+$/.test(key)) {
      return Response.json({ error: "key can only include lowercase letters, numbers, and underscores." }, { status: 400 });
    }
    if (!type || !allowedFieldTypes.has(type)) {
      return Response.json({ error: "type is invalid." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { data: objectRow, error: objectError } = await supabase
      .from("workspace_objects")
      .select("id")
      .eq("workspace_id", authorization.membership.workspaceId)
      .eq("id", objectId)
      .maybeSingle();
    if (objectError) {
      throw new Error(objectError.message);
    }
    if (!objectRow) {
      return Response.json({ error: "Object not found in this workspace." }, { status: 404 });
    }

    let nextSortOrder = sortOrder;
    if (nextSortOrder === null) {
      const { data: maxRow, error: maxError } = await supabase
        .from("workspace_fields")
        .select("sort_order")
        .eq("workspace_id", authorization.membership.workspaceId)
        .eq("object_id", objectId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxError) {
        throw new Error(maxError.message);
      }
      nextSortOrder = Number(maxRow?.sort_order ?? 0) + 1;
    }

    const { data: createdField, error: createError } = await supabase
      .from("workspace_fields")
      .insert({
        workspace_id: authorization.membership.workspaceId,
        object_id: objectId,
        name,
        key,
        type,
        required,
        options,
        default_value: defaultValue,
        sort_order: nextSortOrder,
      })
      .select("id, workspace_id, object_id, name, key, type, required, options, default_value, sort_order")
      .single();

    if (createError) {
      if (createError.code === "23505") {
        return Response.json({ error: "A field with this key already exists for this object." }, { status: 409 });
      }
      throw new Error(createError.message);
    }

    return Response.json({ field: mapFieldRow(createdField as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create field.";
    return Response.json({ error: message }, { status: 400 });
  }
}
