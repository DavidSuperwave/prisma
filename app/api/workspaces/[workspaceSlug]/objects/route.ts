import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceFields, listWorkspaceObjects } from "@/lib/workspaceStore";
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
