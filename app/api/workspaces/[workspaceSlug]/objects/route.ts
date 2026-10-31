import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import { getCurrentAppUser } from "@/lib/auth";
import { generateUniqueObjectSlug } from "@/lib/objectSlug";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceFields, listWorkspaceMembershipsForUser, listWorkspaceObjects } from "@/lib/workspaceStore";
import { resolveObject, suggestObjects } from "@/lib/objectResolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

function normalizeObjectKey(value: string) {
  return value.trim().replace(/\s+/g, " ");
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
    return { error: Response.json({ error: "Only workspace admins can manage objects." }, { status: 403 }) };
  }
  return { user, membership };
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const includeCounts = url.searchParams.get("includeCounts") === "true";
    const includeFields = url.searchParams.get("includeFields") === "true";
    const objectIdOrName = url.searchParams.get("object");

    const objects = await listWorkspaceObjects(auth.context.workspaceId);

    let filtered = objects;
    let resolutionMeta:
      | {
          matched: string;
          reference: string;
          resolvedTo: { id: string; slug: string | null; name: string | null };
          alternatives: ReturnType<typeof suggestObjects>;
        }
      | undefined;
    let suggestions: ReturnType<typeof suggestObjects> | undefined;
    if (objectIdOrName) {
      const resolution = resolveObject(objects, objectIdOrName);
      if (resolution.ok) {
        filtered = [resolution.object];
        if (
          resolution.matched !== "id" &&
          resolution.matched !== "slug" &&
          resolution.matched !== "exact"
        ) {
          resolutionMeta = {
            matched: resolution.matched,
            reference: objectIdOrName,
            resolvedTo: {
              id: resolution.object.id,
              slug: resolution.object.slug ?? null,
              name: resolution.object.name ?? null,
            },
            alternatives: resolution.suggestions,
          };
        }
      } else {
        filtered = [];
        suggestions = resolution.suggestions;
      }
    }

    let fieldsByObject: Record<string, Array<Record<string, unknown>>> = {};
    if (includeFields && filtered.length > 0) {
      const allFields = await listWorkspaceFields(auth.context.workspaceId);
      const wanted = new Set(filtered.map((o) => o.id));
      for (const field of allFields) {
        if (!wanted.has(field.objectId)) continue;
        const list = fieldsByObject[field.objectId] ?? [];
        list.push({
          id: field.id,
          name: field.name,
          key: field.key,
          type: field.type,
          required: field.required,
          options: field.options,
          defaultValue: field.defaultValue,
          sortOrder: field.sortOrder,
          isLocked: (field as { isLocked?: boolean }).isLocked ?? false,
        });
        fieldsByObject[field.objectId] = list;
      }
    }

    let counts: Record<string, number> = {};
    if (includeCounts && filtered.length > 0) {
      const supabase = requireSupabaseAdmin();
      const objectIds = filtered.map((o) => o.id);
      const { data, error } = await supabase
        .from("records")
        .select("object_id", { count: "exact", head: false })
        .eq("workspace_id", auth.context.workspaceId)
        .is("deleted_at", null)
        .in("object_id", objectIds);
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const key = String((row as { object_id: unknown }).object_id);
          counts[key] = (counts[key] ?? 0) + 1;
        }
      }
    }

    return Response.json({
      objects: filtered.map((o) => ({
        id: o.id,
        workspaceId: o.workspaceId,
        slug: o.slug,
        name: o.name,
        singularName: o.singularName,
        pluralName: o.pluralName,
        description: o.description,
        icon: o.icon,
        kind: (o as { kind?: string | null }).kind ?? null,
        isSystem: (o as { isSystem?: boolean }).isSystem ?? false,
        createdAt: o.createdAt,
        recordCount: includeCounts ? counts[o.id] ?? 0 : undefined,
        fields: includeFields ? fieldsByObject[o.id] ?? [] : undefined,
      })),
      resolution: resolutionMeta,
      suggestions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list objects.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) return authorization.error;

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      singularName?: string | null;
      pluralName?: string | null;
      description?: string | null;
      icon?: string | null;
      slug?: string | null;
    };
    const name = typeof body.name === "string" ? normalizeObjectKey(body.name) : "";
    if (!name) return Response.json({ error: "name is required." }, { status: 400 });

    const supabase = requireSupabaseAdmin();
    const preferredSlug =
      typeof body.slug === "string" && body.slug.trim().length > 0 ? body.slug.trim() : name;
    const slug = await generateUniqueObjectSlug(authorization.membership.workspaceId, preferredSlug);
    let { data, error } = await supabase
      .from("workspace_objects")
      .insert({
        workspace_id: authorization.membership.workspaceId,
        name,
        singular_name:
          typeof body.singularName === "string" && body.singularName.trim().length > 0
            ? normalizeObjectKey(body.singularName)
            : null,
        plural_name:
          typeof body.pluralName === "string" && body.pluralName.trim().length > 0
            ? normalizeObjectKey(body.pluralName)
            : null,
        description:
          typeof body.description === "string" && body.description.trim().length > 0
            ? body.description.trim()
            : null,
        icon:
          typeof body.icon === "string" && body.icon.trim().length > 0
            ? body.icon.trim()
            : null,
        slug,
      })
      .select("id, workspace_id, slug, name, singular_name, plural_name, description, icon, kind, is_system, created_at")
      .single();

    if (error && error.message.includes("slug")) {
      const retry = await supabase
        .from("workspace_objects")
        .insert({
          workspace_id: authorization.membership.workspaceId,
          name,
          singular_name:
            typeof body.singularName === "string" && body.singularName.trim().length > 0
              ? normalizeObjectKey(body.singularName)
              : null,
          plural_name:
            typeof body.pluralName === "string" && body.pluralName.trim().length > 0
              ? normalizeObjectKey(body.pluralName)
              : null,
          description:
            typeof body.description === "string" && body.description.trim().length > 0
              ? body.description.trim()
              : null,
          icon:
            typeof body.icon === "string" && body.icon.trim().length > 0
              ? body.icon.trim()
              : null,
        })
        .select("id, workspace_id, name, singular_name, plural_name, description, icon, kind, is_system, created_at")
        .single();
      data = retry.data as typeof data;
      error = retry.error;
    }
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Object was not created.");
    const objectRow = data;

    return Response.json(
      {
        object: {
          id: String(objectRow.id),
          workspaceId: String(objectRow.workspace_id),
          slug: typeof objectRow.slug === "string" && objectRow.slug.length > 0 ? String(objectRow.slug) : slug,
          name: String(objectRow.name),
          singularName: objectRow.singular_name ? String(objectRow.singular_name) : null,
          pluralName: objectRow.plural_name ? String(objectRow.plural_name) : null,
          description: objectRow.description ? String(objectRow.description) : null,
          icon: objectRow.icon ? String(objectRow.icon) : null,
          kind: objectRow.kind ? String(objectRow.kind) : null,
          isSystem: Boolean(objectRow.is_system),
          createdAt: String(objectRow.created_at),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create object.";
    return Response.json({ error: message }, { status: 400 });
  }
}
