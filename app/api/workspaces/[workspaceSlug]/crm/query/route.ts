import {
  authorizeCrmRead,
  findCrmObjectIdByKind,
  mapRecordRow,
  requireSupabaseAdmin,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { filterRecords, parseFilterDsl, type FilterDsl } from "@/lib/crm/filters";
import type { PrismaCrmKind } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

const CRM_KINDS: PrismaCrmKind[] = ["crm_people", "crm_companies", "crm_deals"];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

type QueryBody = {
  kind?: string;
  objectId?: string;
  filter?: unknown;
  limit?: number;
  offset?: number;
  projection?: string[];
  sort?: Array<{ field: string; direction?: "asc" | "desc" }>;
  search?: string;
};

function extractKind(value: unknown): PrismaCrmKind | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  if (CRM_KINDS.includes(normalized as PrismaCrmKind)) return normalized as PrismaCrmKind;
  if (normalized === "people" || normalized === "person") return "crm_people";
  if (normalized === "company" || normalized === "companies") return "crm_companies";
  if (normalized === "deal" || normalized === "deals" || normalized === "opportunity") return "crm_deals";
  return null;
}

function project(
  records: Array<{ id: string; data: Record<string, unknown>; createdAt: string | null; updatedAt: string | null }>,
  projection: string[] | null,
) {
  if (!projection || projection.length === 0) return records;
  return records.map((r) => {
    const out: Record<string, unknown> = {};
    for (const key of projection) out[key] = r.data[key];
    return { id: r.id, data: out, createdAt: r.createdAt, updatedAt: r.updatedAt };
  });
}

function sortRecords<T extends { data: Record<string, unknown>; updatedAt: string | null }>(
  records: T[],
  sort: Array<{ field: string; direction?: "asc" | "desc" }> | null,
): T[] {
  if (!sort || sort.length === 0) return records;
  const copy = [...records];
  copy.sort((a, b) => {
    for (const key of sort) {
      const dir = key.direction === "desc" ? -1 : 1;
      const av = key.field === "updated_at" ? a.updatedAt : a.data[key.field];
      const bv = key.field === "updated_at" ? b.updatedAt : b.data[key.field];
      if (av == null && bv == null) continue;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
    }
    return 0;
  });
  return copy;
}

async function runQuery(workspaceSlug: string, body: QueryBody) {
  const authorization = await authorizeCrmRead(workspaceSlug);
  if ("error" in authorization) return authorization.error;

  const supabase = requireSupabaseAdmin();

  const kind = extractKind(body.kind);
  let objectId: string | null = body.objectId ?? null;
  if (!objectId && kind) {
    objectId = await findCrmObjectIdByKind(supabase, authorization.workspaceId, kind);
  }
  if (!objectId) {
    return Response.json(
      { error: "Provide a CRM `kind` (crm_people | crm_companies | crm_deals) or `objectId`." },
      { status: 400 },
    );
  }

  const filter: FilterDsl | null = body.filter !== undefined ? parseFilterDsl(body.filter) : {};
  if (body.filter !== undefined && filter === null) {
    return Response.json({ error: "Invalid filter DSL." }, { status: 400 });
  }

  const limit = Math.min(Math.max(1, body.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, body.offset ?? 0);

  const { data, error } = await supabase
    .from("records")
    .select("id, workspace_id, object_id, data, created_at, updated_at")
    .eq("workspace_id", authorization.workspaceId)
    .eq("object_id", objectId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(2000);

  if (error) throw new Error(error.message);

  let records = (data ?? []).map((row) => mapRecordRow(row as Record<string, unknown>));

  if (body.search && body.search.trim().length > 0) {
    const needle = body.search.trim().toLowerCase();
    records = records.filter((r) => {
      try {
        return JSON.stringify(r.data).toLowerCase().includes(needle);
      } catch {
        return false;
      }
    });
  }

  const filtered = filterRecords(records, filter);
  const sorted = sortRecords(filtered, body.sort ?? null);
  const paged = sorted.slice(offset, offset + limit);
  const projected = project(paged, body.projection ?? null);

  return Response.json({
    records: projected,
    total: filtered.length,
    limit,
    offset,
    objectId,
    kind: kind ?? null,
  });
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const body = (await request.json().catch(() => ({}))) as QueryBody;
    return await runQuery(workspaceSlug, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to query CRM.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") ?? undefined;
    const objectId = url.searchParams.get("objectId") ?? undefined;
    const search = url.searchParams.get("search") ?? undefined;
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;
    const offset = url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined;
    const projection = url.searchParams.get("projection")
      ? url.searchParams
          .get("projection")!
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    const sortParam = url.searchParams.get("sort");
    const sort = sortParam
      ? sortParam
          .split(",")
          .map((entry) => {
            const trimmed = entry.trim();
            if (!trimmed) return null;
            if (trimmed.startsWith("-")) return { field: trimmed.slice(1), direction: "desc" as const };
            return { field: trimmed, direction: "asc" as const };
          })
          .filter((entry): entry is { field: string; direction: "asc" | "desc" } => entry !== null)
      : undefined;
    const filterParam = url.searchParams.get("filter");
    const filter = filterParam ? JSON.parse(filterParam) : undefined;

    return await runQuery(workspaceSlug, {
      kind,
      objectId,
      search,
      limit,
      offset,
      projection,
      sort,
      filter,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to query CRM.";
    return Response.json({ error: message }, { status: 400 });
  }
}
