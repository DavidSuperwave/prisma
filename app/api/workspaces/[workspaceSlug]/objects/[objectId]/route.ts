import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; objectId: string }>;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
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
      error: Response.json({ error: "Only workspace admins can manage objects." }, { status: 403 }),
    };
  }

  return { user, membership };
}

function normalizeName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^./, (match) => match.toUpperCase());
}

function mapObjectRow(row: Record<string, unknown>) {
  const rawSlug = typeof row.slug === "string" ? row.slug.trim() : "";
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    slug: rawSlug.length > 0 ? rawSlug : null,
    singularName: row.singular_name ? String(row.singular_name) : null,
    pluralName: row.plural_name ? String(row.plural_name) : null,
    description: row.description ? String(row.description) : null,
    icon: row.icon ? String(row.icon) : null,
    createdAt: String(row.created_at),
  };
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, objectId } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
    };
    const rawName = typeof body.name === "string" ? body.name.trim() : "";
    if (!rawName) {
      return Response.json({ error: "name is required." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();

    const { data: existing, error: loadError } = await supabase
      .from("workspace_objects")
      .select("id, workspace_id, is_system")
      .eq("id", objectId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .maybeSingle();

    if (loadError) {
      throw new Error(loadError.message);
    }
    if (!existing) {
      return Response.json({ error: "Object not found." }, { status: 404 });
    }
    if (Boolean((existing as Record<string, unknown>).is_system)) {
      return Response.json(
        { error: "Los objetos del sistema no se pueden renombrar." },
        { status: 409 },
      );
    }

    const normalizedName = normalizeName(rawName);
    // Explicitly update `name` only — the `slug` column is a stable, rename-
    // proof identifier and MUST NOT change when the display name is edited.
    // This is what lets agents pin records.query / records.bulk_* calls to a
    // value that survives future renames.
    let updateAttempt = await supabase
      .from("workspace_objects")
      .update({ name: normalizedName })
      .eq("id", objectId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .select("id, workspace_id, name, slug, singular_name, plural_name, description, icon, created_at")
      .single();

    if (updateAttempt.error && updateAttempt.error.message.includes("slug")) {
      // Pre-migration environments: fall back to the legacy column list.
      updateAttempt = await supabase
        .from("workspace_objects")
        .update({ name: normalizedName })
        .eq("id", objectId)
        .eq("workspace_id", authorization.membership.workspaceId)
        .select("id, workspace_id, name, singular_name, plural_name, description, icon, created_at")
        .single();
    }

    if (updateAttempt.error) {
      if (updateAttempt.error.code === "23505") {
        return Response.json(
          { error: "Ya existe una tabla con ese nombre en este workspace." },
          { status: 409 },
        );
      }
      throw new Error(updateAttempt.error.message);
    }

    return Response.json({ object: mapObjectRow(updateAttempt.data as Record<string, unknown>) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update object.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, objectId } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const supabase = requireSupabaseAdmin();
    const { data: existing, error: loadError } = await supabase
      .from("workspace_objects")
      .select("id, workspace_id, kind, is_system")
      .eq("id", objectId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .maybeSingle();

    if (loadError) {
      throw new Error(loadError.message);
    }

    if (!existing) {
      return Response.json({ error: "Object not found." }, { status: 404 });
    }

    const isSystem = Boolean((existing as Record<string, unknown>).is_system);
    const kind = (existing as Record<string, unknown>).kind;
    if (isSystem || (typeof kind === "string" && kind.length > 0)) {
      return Response.json(
        { error: "Los objetos del CRM no se pueden eliminar." },
        { status: 409 },
      );
    }

    const { error: deleteError } = await supabase
      .from("workspace_objects")
      .delete()
      .eq("id", objectId)
      .eq("workspace_id", authorization.membership.workspaceId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return Response.json({ deletedObjectId: objectId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete object.";
    return Response.json({ error: message }, { status: 400 });
  }
}
