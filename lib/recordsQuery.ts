/**
 * Generic filter DSL for `records.data` JSONB, shared by the chat agent's
 * records.query / records.bulk_* tools and the /api/.../records/query route.
 *
 * Filter shape:
 *   { logical: "and" | "or", rules: [
 *       { field: "modelo", op: "contains", value: "TERRITORY" },
 *       { logical: "or", rules: [...] }          // nested group
 *   ] }
 *
 * Supported ops:
 *   eq | neq | contains | icontains | in | nin | gt | gte | lt | lte |
 *   is_null | is_not_null | starts_with | ends_with
 *
 * We evaluate in-memory after a single Supabase fetch. Rows per workspace
 * object are typically in the hundreds/low-thousands, so this is both
 * simple and safe. If you need millions of rows, add a Postgres view + RPC.
 */

export type FilterLeaf = {
  field: string;
  op:
    | "eq"
    | "neq"
    | "contains"
    | "icontains"
    | "in"
    | "nin"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "is_null"
    | "is_not_null"
    | "starts_with"
    | "ends_with";
  value?: unknown;
};

export type FilterGroup = {
  logical: "and" | "or";
  rules: Array<FilterLeaf | FilterGroup>;
};

export type FilterNode = FilterLeaf | FilterGroup;

export function isGroup(node: FilterNode): node is FilterGroup {
  return typeof (node as FilterGroup).logical === "string" && Array.isArray((node as FilterGroup).rules);
}

/** Normalize common agent aliases so calls are resilient to the LLM's guesses. */
export function normalizeFilterInput(input: unknown): FilterNode | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  if (Array.isArray(obj.rules)) {
    const logical = obj.logical === "or" ? "or" : "and";
    return {
      logical,
      rules: (obj.rules as unknown[])
        .map((rule) => normalizeFilterInput(rule) ?? normalizeLeaf(rule))
        .filter((r): r is FilterNode => r !== null),
    };
  }
  return normalizeLeaf(obj);
}

function normalizeLeaf(input: unknown): FilterLeaf | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  const field =
    typeof obj.field === "string"
      ? obj.field
      : typeof obj.key === "string"
        ? obj.key
        : typeof obj.name === "string"
          ? obj.name
          : null;
  const opRaw = typeof obj.op === "string" ? obj.op : typeof obj.operator === "string" ? obj.operator : "eq";
  if (!field) return null;
  const op = (opRaw as FilterLeaf["op"]) ?? "eq";
  const value = obj.value;
  return { field, op, value };
}

function stringifyValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

export function evaluateFilter(node: FilterNode | undefined | null, row: Record<string, unknown>): boolean {
  if (!node) return true;
  if (isGroup(node)) {
    if (node.rules.length === 0) return true;
    return node.logical === "or"
      ? node.rules.some((r) => evaluateFilter(r, row))
      : node.rules.every((r) => evaluateFilter(r, row));
  }
  const raw = resolveField(row, node.field);
  const lhs = stringifyValue(raw);
  const rhs = node.value;
  switch (node.op) {
    case "eq":
      return lhs === stringifyValue(rhs);
    case "neq":
      return lhs !== stringifyValue(rhs);
    case "contains":
    case "icontains":
      return lhs.toLowerCase().includes(stringifyValue(rhs).toLowerCase());
    case "starts_with":
      return lhs.toLowerCase().startsWith(stringifyValue(rhs).toLowerCase());
    case "ends_with":
      return lhs.toLowerCase().endsWith(stringifyValue(rhs).toLowerCase());
    case "in": {
      const arr = Array.isArray(rhs) ? rhs.map((v) => stringifyValue(v)) : [stringifyValue(rhs)];
      return arr.includes(lhs);
    }
    case "nin": {
      const arr = Array.isArray(rhs) ? rhs.map((v) => stringifyValue(v)) : [stringifyValue(rhs)];
      return !arr.includes(lhs);
    }
    case "gt":
      return Number(lhs) > Number(rhs ?? 0);
    case "gte":
      return Number(lhs) >= Number(rhs ?? 0);
    case "lt":
      return Number(lhs) < Number(rhs ?? 0);
    case "lte":
      return Number(lhs) <= Number(rhs ?? 0);
    case "is_null":
      return raw === null || raw === undefined || raw === "";
    case "is_not_null":
      return !(raw === null || raw === undefined || raw === "");
    default:
      return false;
  }
}

/**
 * Case-insensitive field lookup so the agent can write "Modelo" or "modelo".
 * Exact match first, then case-insensitive, then key-normalized (spaces →
 * underscores).
 */
function resolveField(row: Record<string, unknown>, field: string): unknown {
  if (field in row) return row[field];
  const lower = field.toLowerCase();
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase() === lower) return v;
  }
  const key = field.replace(/\s+/g, "_").toLowerCase();
  for (const [k, v] of Object.entries(row)) {
    if (k.replace(/\s+/g, "_").toLowerCase() === key) return v;
  }
  return undefined;
}

export function matchesSearch(row: Record<string, unknown>, search: string | undefined): boolean {
  if (!search || !search.trim()) return true;
  const needle = search.toLowerCase();
  for (const value of Object.values(row ?? {})) {
    if (typeof value === "string" && value.toLowerCase().includes(needle)) return true;
    if (typeof value === "number" && String(value).includes(needle)) return true;
  }
  return false;
}

export function compareValues(a: unknown, b: unknown): number {
  const sa = stringifyValue(a);
  const sb = stringifyValue(b);
  const na = Number(sa);
  const nb = Number(sb);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return sa.localeCompare(sb);
}

export type SortRule = { field: string; direction?: "asc" | "desc" };

export function sortRows<T extends { data: Record<string, unknown> }>(rows: T[], sort: SortRule[] | undefined): T[] {
  if (!sort || sort.length === 0) return rows;
  const out = [...rows];
  out.sort((ra, rb) => {
    for (const rule of sort) {
      const dir = rule.direction === "desc" ? -1 : 1;
      const cmp = compareValues(resolveField(ra.data, rule.field), resolveField(rb.data, rule.field));
      if (cmp !== 0) return cmp * dir;
    }
    return 0;
  });
  return out;
}

export function projectRow(row: Record<string, unknown>, projection: string[] | undefined): Record<string, unknown> {
  if (!projection || projection.length === 0) return row;
  const out: Record<string, unknown> = {};
  for (const key of projection) {
    out[key] = resolveField(row, key);
  }
  return out;
}
