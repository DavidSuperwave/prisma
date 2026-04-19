import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getWorkspaceMembershipForSlug, listWorkspaceFields, listWorkspaceObjects } from "@/lib/workspaceStore";
import {
  evaluateFilter,
  isGroup,
  matchesSearch,
  normalizeFilterInput,
  projectRow,
  sortRows,
  type FilterNode,
  type SortRule,
} from "@/lib/recordsQuery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { resolveField as resolveFieldReference, resolveObject } from "@/lib/objectResolver";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type QueryBody = {
  objectId?: string;
  objectSlug?: string;
  objectName?: string;
  filter?: unknown;
  filters?: unknown;
  search?: string;
  sort?: SortRule[] | string;
  limit?: number;
  offset?: number;
  projection?: string[];
  includeDeleted?: boolean;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

const MAX_SCAN = 5000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

// Detect whether the filter is simple enough that we can translate it into
// a Postgres JSONB containment query and paginate at the DB level. Only
// top-level AND-chains of `equals` rules on known field keys qualify.
function extractContainmentPushdown(
  filter: FilterNode | null,
  fields: Array<{ key: string }>,
): Record<string, unknown> | null {
  if (!filter) return {};
  if (!isGroup(filter)) {
    // A single leaf equality on a known key is also pushable.
    if (filter.op !== "eq") return null;
    const ref = typeof filter.field === "string" ? filter.field.trim() : "";
    const known = new Set(fields.map((f) => f.key));
    if (!ref || !known.has(ref)) return null;
    if (typeof filter.value === "object" && filter.value !== null) return null;
    return { [ref]: filter.value ?? null };
  }
  if (filter.logical !== "and") return null;
  const known = new Set(fields.map((f) => f.key));
  const out: Record<string, unknown> = {};
  for (const rule of filter.rules) {
    if (isGroup(rule)) return null;
    if (rule.op !== "eq") return null;
    const ref = typeof rule.field === "string" ? rule.field.trim() : "";
    if (!ref || !known.has(ref)) return null;
    if (typeof rule.value === "object" && rule.value !== null) return null;
    out[ref] = rule.value ?? null;
  }
  return out;
}

// Whitelist of top-level sort keys we can push down to the DB.
const PUSHDOWN_SORT_COLUMNS: Record<string, string> = {
  created_at: "created_at",
  createdAt: "created_at",
  updated_at: "updated_at",
  updatedAt: "updated_at",
};

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const user = await getCurrentAppUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    const membership = await getWorkspaceMembershipForSlug(
      user.id,
      workspaceSlug,
      user.isPlatformAdmin,
    );
    if (!membership) {
      return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as QueryBody;
    const objects = await listWorkspaceObjects(membership.workspaceId);

    // Preference order: objectId > objectSlug > objectName. Slug is the
    // rename-proof identifier the agent should use once it has learned it from
    // the catalog / an earlier resolution response.
    const reference = body.objectId || body.objectSlug || body.objectName;
    const resolution = resolveObject(objects, reference);
    if (!resolution.ok) {
      const retryWith = resolution.suggestions
        .slice(0, 3)
        .map((s) => {
          const obj = objects.find((o) => o.id === s.id);
          return obj?.slug ?? obj?.id ?? s.id;
        })
        .filter(Boolean);
      return Response.json(
        {
          reason: "object_not_found",
          error: `No encontré "${reference ?? ""}". Reintenta inmediatamente con objectSlug igual a uno de retryWith; si ninguna te sirve, pregunta al usuario.`,
          reference: reference ?? null,
          retryWith,
          suggestions: resolution.suggestions,
          availableObjects: objects.map((o) => ({
            id: o.id,
            slug: o.slug,
            name: o.name,
            singularName: o.singularName,
            pluralName: o.pluralName,
          })),
        },
        { status: 404 },
      );
    }
    const targetObject = resolution.object;
    const resolutionMeta =
      resolution.matched === "id" || resolution.matched === "slug" || resolution.matched === "exact"
        ? undefined
        : {
            matched: resolution.matched,
            reference: reference ?? null,
            resolvedTo: { id: targetObject.id, slug: targetObject.slug, name: targetObject.name },
            alternatives: resolution.suggestions,
          };

    const allFields = await listWorkspaceFields(membership.workspaceId);
    const fields = allFields.filter((f) => f.objectId === targetObject!.id);

    // Validate the caller's filter references against the actual object
    // schema. If they reference an unknown column, return a structured error
    // with repair suggestions so the agent can retry with the right key
    // (e.g. the user label drifted, a rename changed a key, etc.).
    const filterInput = body.filter ?? body.filters;
    const filterNode = normalizeFilterInput(filterInput);
    const unknownFields = filterNode ? collectUnknownFields(filterNode, fields) : [];
    if (unknownFields.length > 0) {
      return Response.json(
        {
          error:
            `No reconozco ${unknownFields.length === 1 ? "el campo" : "los campos"} ` +
            unknownFields.map((u) => `"${u.reference}"`).join(", ") +
            ` en "${targetObject.name}". Usa uno de los campos disponibles o prueba la sugerencia incluida.`,
          reason: "unknown_fields",
          unknownFields,
          availableFields: fields.map((f) => ({ key: f.key, name: f.name, type: f.type })),
          object: {
            id: targetObject.id,
            slug: targetObject.slug,
            name: targetObject.name,
          },
          resolution: resolutionMeta,
        },
        { status: 422 },
      );
    }

    const supabase = requireSupabaseAdmin();
    const includeDeleted = body.includeDeleted === true;

    const filter = filterNode;
    const search = typeof body.search === "string" ? body.search.trim() : "";

    const sortRules: SortRule[] = Array.isArray(body.sort)
      ? body.sort
      : typeof body.sort === "string" && body.sort.trim()
        ? [{ field: body.sort.trim(), direction: "asc" }]
        : [];

    const offset = Math.max(0, Number(body.offset ?? 0));
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number(body.limit ?? DEFAULT_LIMIT)));

    // Fast path: no free-text search, no custom sort, and filter either
    // empty or translatable to a single JSONB containment expression that
    // the GIN index on records.data (jsonb_path_ops) can serve. Pagination
    // and total count happen at the database.
    const containment = !search && sortRules.length === 0
      ? extractContainmentPushdown(filter, fields)
      : null;

    let pushdownSortColumn: string | null = null;
    if (sortRules.length === 1) {
      const first = sortRules[0];
      if (first && typeof first.field === "string" && PUSHDOWN_SORT_COLUMNS[first.field]) {
        pushdownSortColumn = PUSHDOWN_SORT_COLUMNS[first.field] ?? null;
      }
    }

    if (containment !== null && (sortRules.length === 0 || pushdownSortColumn)) {
      let qb = supabase
        .from("records")
        .select(
          "id, workspace_id, object_id, data, created_at, updated_at, deleted_at",
          { count: "exact" },
        )
        .eq("workspace_id", membership.workspaceId)
        .eq("object_id", targetObject.id);
      if (!includeDeleted) qb = qb.is("deleted_at", null);
      if (Object.keys(containment).length > 0) {
        qb = qb.contains("data", containment);
      }
      const sortColumn = pushdownSortColumn ?? "updated_at";
      const ascending = pushdownSortColumn
        ? sortRules[0]?.direction === "asc"
        : false;
      qb = qb.order(sortColumn, { ascending }).range(offset, offset + limit - 1);
      const { data: pageRows, count, error: pageErr } = await qb;
      if (pageErr) throw new Error(pageErr.message);
      const records = (pageRows ?? []).map((row) => {
        const r = row as {
          id: unknown;
          workspace_id: unknown;
          object_id: unknown;
          data?: unknown;
          created_at: unknown;
          updated_at: unknown;
          deleted_at?: string | null;
        };
        const data = (r.data ?? {}) as Record<string, unknown>;
        return {
          id: String(r.id),
          workspaceId: String(r.workspace_id),
          objectId: String(r.object_id),
          data: body.projection ? projectRow(data, body.projection) : data,
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at),
          deletedAt: r.deleted_at ?? null,
        };
      });
      return Response.json({
        object: {
          id: targetObject.id,
          slug: targetObject.slug,
          name: targetObject.name,
          singularName: targetObject.singularName,
          pluralName: targetObject.pluralName,
        },
        resolution: resolutionMeta,
        fields: fields.map((f) => ({
          id: f.id,
          name: f.name,
          key: f.key,
          type: f.type,
          required: f.required,
        })),
        records,
        total: typeof count === "number" ? count : records.length,
        scanned: records.length,
        truncated: false,
        limit,
        offset,
      });
    }

    // Slow path: complex filters or free-text search. Scan up to MAX_SCAN
    // rows ordered by updated_at desc so the newest data fits in the
    // window, then filter / sort in memory.
    let qb = supabase
      .from("records")
      .select("id, workspace_id, object_id, data, created_at, updated_at, deleted_at")
      .eq("workspace_id", membership.workspaceId)
      .eq("object_id", targetObject.id)
      .order("updated_at", { ascending: false })
      .limit(MAX_SCAN);
    if (!includeDeleted) qb = qb.is("deleted_at", null);

    const { data: rows, error } = await qb;
    if (error) throw new Error(error.message);

    const matched = (rows ?? []).filter((row) => {
      const data = ((row as { data?: unknown }).data ?? {}) as Record<string, unknown>;
      return evaluateFilter(filter, data) && matchesSearch(data, search || undefined);
    });

    const sorted = sortRules.length
      ? sortRows(
          matched.map((row) => ({
            id: String((row as { id: unknown }).id),
            objectId: String((row as { object_id: unknown }).object_id),
            workspaceId: String((row as { workspace_id: unknown }).workspace_id),
            data: ((row as { data?: unknown }).data ?? {}) as Record<string, unknown>,
            createdAt: String((row as { created_at: unknown }).created_at),
            updatedAt: String((row as { updated_at: unknown }).updated_at),
            deletedAt: (row as { deleted_at?: string | null }).deleted_at ?? null,
          })),
          sortRules,
        )
      : matched.map((row) => ({
          id: String((row as { id: unknown }).id),
          objectId: String((row as { object_id: unknown }).object_id),
          workspaceId: String((row as { workspace_id: unknown }).workspace_id),
          data: ((row as { data?: unknown }).data ?? {}) as Record<string, unknown>,
          createdAt: String((row as { created_at: unknown }).created_at),
          updatedAt: String((row as { updated_at: unknown }).updated_at),
          deletedAt: (row as { deleted_at?: string | null }).deleted_at ?? null,
        }));

    const total = sorted.length;
    const page = sorted.slice(offset, offset + limit);

    const records = page.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      objectId: r.objectId,
      data: body.projection ? projectRow(r.data, body.projection) : r.data,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      deletedAt: r.deletedAt,
    }));

    return Response.json({
      object: {
        id: targetObject.id,
        slug: targetObject.slug,
        name: targetObject.name,
        singularName: targetObject.singularName,
        pluralName: targetObject.pluralName,
      },
      resolution: resolutionMeta,
      fields: fields.map((f) => ({
        id: f.id,
        name: f.name,
        key: f.key,
        type: f.type,
        required: f.required,
      })),
      records,
      total,
      scanned: rows?.length ?? 0,
      truncated: (rows?.length ?? 0) >= MAX_SCAN,
      limit,
      offset,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to query records.";
    return Response.json({ error: message }, { status: 400 });
  }
}

type FieldLike = { id: string; key: string; name: string; type: string };

function collectUnknownFields(
  node: FilterNode,
  fields: FieldLike[],
): Array<{ reference: string; suggestions: Array<{ key: string; name: string | null; score: number }> }> {
  const out: Array<{ reference: string; suggestions: Array<{ key: string; name: string | null; score: number }> }> = [];
  const seen = new Set<string>();
  const walk = (n: FilterNode) => {
    if (isGroup(n)) {
      for (const rule of n.rules) walk(rule);
      return;
    }
    const ref = typeof n.field === "string" ? n.field.trim() : "";
    if (!ref || seen.has(ref)) return;
    seen.add(ref);
    // Evaluator already tolerates key/name/case-insensitive/space→underscore
    // matches, so only flag truly unknown references that wouldn't match at
    // evaluation time either. We treat any field matched by resolveField with
    // reason "key" or "name" as known.
    const resolution = resolveFieldReference(fields, ref);
    if (resolution.ok && (resolution.matched === "key" || resolution.matched === "name")) return;
    // Also accept the runtime's case-insensitive / space→underscore tolerance
    // so pre-existing calls using display labels continue to work.
    const lower = ref.toLowerCase();
    const fuzzyKey = ref.replace(/\s+/g, "_").toLowerCase();
    const runtimeHit = fields.some((f) => {
      return (
        f.key.toLowerCase() === lower ||
        f.key.replace(/\s+/g, "_").toLowerCase() === fuzzyKey ||
        (typeof f.name === "string" &&
          (f.name.toLowerCase() === lower || f.name.replace(/\s+/g, "_").toLowerCase() === fuzzyKey))
      );
    });
    if (runtimeHit) return;

    out.push({
      reference: ref,
      suggestions: resolution.ok
        ? [
            {
              key: resolution.field.key,
              name: resolution.field.name ?? null,
              score: 1,
            },
          ]
        : resolution.suggestions.map((s) => ({ key: s.key, name: s.name, score: s.score })),
    });
  };
  walk(node);
  return out;
}
