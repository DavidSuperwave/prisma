import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreateObjectRequest = {
  name?: string;
  singularName?: string | null;
  pluralName?: string | null;
  description?: string | null;
  icon?: string | null;
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
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    singularName: row.singular_name ? String(row.singular_name) : null,
    pluralName: row.plural_name ? String(row.plural_name) : null,
    description: row.description ? String(row.description) : null,
    icon: row.icon ? String(row.icon) : null,
    createdAt: String(row.created_at),
  };
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const body = (await request.json().catch(() => ({}))) as CreateObjectRequest;
    const name = body.name?.trim();
    if (!name) {
      return Response.json({ error: "name is required." }, { status: 400 });
    }

    const normalizedName = normalizeName(name);
    const supabase = requireSupabaseAdmin();
    const { data: createdObject, error } = await supabase
      .from("workspace_objects")
      .insert({
        workspace_id: authorization.membership.workspaceId,
        name: normalizedName,
        singular_name: body.singularName?.trim() || null,
        plural_name: body.pluralName?.trim() || null,
        description: body.description?.trim() || null,
        icon: body.icon?.trim() || null,
      })
      .select("id, workspace_id, name, singular_name, plural_name, description, icon, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return Response.json({ error: "An object with this name already exists in this workspace." }, { status: 409 });
      }
      throw new Error(error.message);
    }

    return Response.json({ object: mapObjectRow(createdObject as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create object.";
    return Response.json({ error: message }, { status: 400 });
  }
}
