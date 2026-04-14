import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string; fieldId: string }>;
};

type UpdateFieldRequest = {
  name?: string;
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
    return { error: Response.json({ error: "Only workspace admins can manage fields." }, { status: 403 }) };
  }

  return { membership };
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, fieldId } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const payload = (await request.json().catch(() => ({}))) as UpdateFieldRequest;
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.name !== undefined) {
      const trimmed = payload.name.trim();
      if (!trimmed) {
        return Response.json({ error: "name cannot be empty." }, { status: 400 });
      }
      update.name = trimmed;
    }
    if (payload.required !== undefined) {
      update.required = Boolean(payload.required);
    }
    if (payload.options !== undefined) {
      if (!payload.options || typeof payload.options !== "object" || Array.isArray(payload.options)) {
        return Response.json({ error: "options must be an object." }, { status: 400 });
      }
      update.options = payload.options;
    }
    if (payload.defaultValue !== undefined) {
      if (payload.defaultValue !== null && typeof payload.defaultValue !== "string") {
        return Response.json({ error: "defaultValue must be a string or null." }, { status: 400 });
      }
      update.default_value = payload.defaultValue;
    }
    if (payload.sortOrder !== undefined) {
      const parsedSortOrder = Number(payload.sortOrder);
      if (!Number.isInteger(parsedSortOrder) || parsedSortOrder < 0) {
        return Response.json({ error: "sortOrder must be a non-negative integer." }, { status: 400 });
      }
      update.sort_order = parsedSortOrder;
    }

    if (Object.keys(update).length === 1) {
      return Response.json(
        { error: "At least one update field is required: name, required, options, defaultValue, sortOrder." },
        { status: 400 },
      );
    }

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_fields")
      .update(update)
      .eq("id", fieldId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .select("id, workspace_id, object_id, name, key, type, required, options, default_value, sort_order")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      return Response.json({ error: "Field not found." }, { status: 404 });
    }

    return Response.json({ field: mapFieldRow(data as Record<string, unknown>) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update field.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, fieldId } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_fields")
      .delete()
      .eq("id", fieldId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      return Response.json({ error: "Field not found." }, { status: 404 });
    }

    return Response.json({ deletedFieldId: String(data.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete field.";
    return Response.json({ error: message }, { status: 400 });
  }
}
