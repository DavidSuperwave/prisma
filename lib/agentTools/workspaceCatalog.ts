import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceFields, listWorkspaceObjects, type PrismaWorkspaceField, type PrismaWorkspaceObject } from "@/lib/workspaceStore";

export type CatalogField = {
  key: string;
  name: string;
  type: string;
};

export type CatalogObject = {
  id: string;
  slug: string | null;
  name: string;
  singularName: string | null;
  pluralName: string | null;
  kind: string | null;
  recordCount: number;
  topFields: CatalogField[];
  totalFields: number;
};

export type WorkspaceCatalog = {
  workspaceId: string;
  generatedAt: number;
  objects: CatalogObject[];
  /** Object ids that the caller can reveal later via schema.catalog if needed. */
  truncatedObjectIds: string[];
  totalObjects: number;
};

type CachedEntry = {
  expiresAt: number;
  value: WorkspaceCatalog;
};

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CachedEntry>();

const DEFAULT_MAX_OBJECTS = 20;
const DEFAULT_MAX_FIELDS = 8;

function toCatalogField(field: PrismaWorkspaceField): CatalogField {
  return { key: field.key, name: field.name, type: field.type };
}

async function loadRecordCounts(workspaceId: string, objectIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (objectIds.length === 0) return counts;
  const supabase = getSupabaseAdmin();
  if (!supabase) return counts;
  const { data, error } = await supabase
    .from("records")
    .select("object_id")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .in("object_id", objectIds);
  if (error || !Array.isArray(data)) return counts;
  for (const row of data) {
    const id = typeof (row as { object_id?: unknown }).object_id === "string"
      ? (row as { object_id: string }).object_id
      : String((row as { object_id: unknown }).object_id ?? "");
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function mapObjectWithFields(
  object: PrismaWorkspaceObject,
  fields: PrismaWorkspaceField[],
  recordCount: number,
  maxFields: number,
): CatalogObject {
  const sorted = fields.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    id: object.id,
    slug: object.slug,
    name: object.name,
    singularName: object.singularName,
    pluralName: object.pluralName,
    kind: object.kind,
    recordCount,
    topFields: sorted.slice(0, maxFields).map(toCatalogField),
    totalFields: sorted.length,
  };
}

export type BuildCatalogOptions = {
  /** Object id to always include at the top (e.g. the currently-open dataset). */
  focusObjectId?: string | null;
  maxObjects?: number;
  maxFieldsPerObject?: number;
  /** Skip the cache and rebuild from the latest data. */
  forceRefresh?: boolean;
};

/**
 * Build a compact catalog of the workspace's objects and their top fields for
 * injection into the chat prompt. Optimized for the `no_prompt_bloat`
 * constraint: caps the object list (default 20), caps fields per object
 * (default 8), and lists the remaining object ids separately so the agent can
 * fetch the full catalog on demand via `schema.catalog`.
 */
export async function buildWorkspaceCatalog(
  workspaceId: string,
  options: BuildCatalogOptions = {},
): Promise<WorkspaceCatalog> {
  const maxObjects = options.maxObjects ?? DEFAULT_MAX_OBJECTS;
  const maxFields = options.maxFieldsPerObject ?? DEFAULT_MAX_FIELDS;
  const cacheKey = `${workspaceId}::${options.focusObjectId ?? ""}::${maxObjects}::${maxFields}`;

  if (!options.forceRefresh) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  const [objects, fields] = await Promise.all([
    listWorkspaceObjects(workspaceId),
    listWorkspaceFields(workspaceId),
  ]);

  const fieldsByObject = new Map<string, PrismaWorkspaceField[]>();
  for (const field of fields) {
    const list = fieldsByObject.get(field.objectId) ?? [];
    list.push(field);
    fieldsByObject.set(field.objectId, list);
  }

  const counts = await loadRecordCounts(workspaceId, objects.map((o) => o.id));

  // Prioritize the focus object, then sort by record count desc (busy tables
  // are almost always what the agent needs), then by created_at asc. The
  // latter matches the order already used in the sidebar so the agent's view
  // of the workspace is stable session-to-session.
  const focusId = typeof options.focusObjectId === "string" && options.focusObjectId.length > 0
    ? options.focusObjectId
    : null;
  const sorted = objects.slice().sort((a, b) => {
    if (focusId) {
      if (a.id === focusId) return -1;
      if (b.id === focusId) return 1;
    }
    const ca = counts.get(a.id) ?? 0;
    const cb = counts.get(b.id) ?? 0;
    if (ca !== cb) return cb - ca;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const included = sorted.slice(0, maxObjects);
  const truncated = sorted.slice(maxObjects);

  const value: WorkspaceCatalog = {
    workspaceId,
    generatedAt: Date.now(),
    objects: included.map((object) =>
      mapObjectWithFields(
        object,
        fieldsByObject.get(object.id) ?? [],
        counts.get(object.id) ?? 0,
        maxFields,
      ),
    ),
    truncatedObjectIds: truncated.map((o) => o.id),
    totalObjects: objects.length,
  };

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

/**
 * Render the catalog as a compact prompt block. Designed to sit in the Hermes
 * system prompt right before the tool envelope examples. Each line is stable
 * across renames because every object is anchored on its slug+id.
 */
export function renderCatalogForPrompt(catalog: WorkspaceCatalog): string[] {
  if (catalog.objects.length === 0) {
    return ["#CATALOG (none — this workspace has no datasets yet)"];
  }
  const lines = [
    "#CATALOG (ALWAYS pass objectSlug to tools — slugs survive renames. Full id is shown so you can copy it verbatim if a tool rejects the slug, but NEVER use the id prefix alone):",
  ];
  for (const obj of catalog.objects) {
    const slug = obj.slug ?? "(no-slug)";
    const count = obj.recordCount;
    const fields = obj.topFields
      .map((f) => (f.type && f.type !== "text" ? `${f.key}:${f.type}` : f.key))
      .join(", ");
    const extra = obj.totalFields > obj.topFields.length ? `, +${obj.totalFields - obj.topFields.length}` : "";
    const displayName = obj.name && obj.name !== slug ? ` "${obj.name}"` : "";
    lines.push(`- ${slug}${displayName} (id:${obj.id}, ${count} rows) fields: ${fields}${extra}`);
  }
  if (catalog.truncatedObjectIds.length > 0) {
    lines.push(
      `(${catalog.truncatedObjectIds.length} more dataset${catalog.truncatedObjectIds.length === 1 ? "" : "s"} not shown — call schema.catalog for the full list.)`,
    );
  }
  return lines;
}

export function clearWorkspaceCatalogCache(workspaceId?: string) {
  if (!workspaceId) {
    cache.clear();
    return;
  }
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(`${workspaceId}::`)) {
      cache.delete(key);
    }
  }
}
