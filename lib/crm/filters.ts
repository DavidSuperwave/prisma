/**
 * Smart View filter DSL evaluator.
 *
 * Supports rule groups with logical `all` / `any`, nested groups,
 * per-field operators, and relative-date semantics against a plain JSONB
 * record (typically `record.data`).
 *
 * @example Simple `all` match
 *   matchesFilter({ stage: "customer", score: 85 }, {
 *     logical: "all",
 *     rules: [
 *       { field: "stage", op: "eq", value: "customer" },
 *       { field: "score", op: "gt", value: 80 },
 *     ],
 *   });
 *   // => true
 *
 * @example Nested groups
 *   matchesFilter({ stage: "qualified", owner: "alice" }, {
 *     logical: "any",
 *     rules: [
 *       { field: "owner", op: "eq", value: "bob" },
 *       { logical: "all", rules: [
 *         { field: "stage", op: "in", value: ["qualified", "customer"] },
 *         { field: "owner", op: "eq", value: "alice" },
 *       ] },
 *     ],
 *   });
 *   // => true
 *
 * @example Text contains
 *   matchesFilter({ email: "Ana@Acme.com" }, {
 *     logical: "all",
 *     rules: [{ field: "email", op: "contains", value: "acme" }],
 *   });
 *   // => true
 *
 * @example Empty check
 *   matchesFilter({ phone: "" }, {
 *     logical: "all",
 *     rules: [{ field: "phone", op: "is_empty" }],
 *   });
 *   // => true
 *
 * @example Relative date (last 7 days)
 *   matchesFilter({ created_at: new Date().toISOString() }, {
 *     logical: "all",
 *     rules: [{ field: "created_at", op: "relative_date", value: "last_7_days" }],
 *   });
 *   // => true
 */

export type FilterOp =
  | "eq"
  | "ne"
  | "in"
  | "contains"
  | "starts_with"
  | "gt"
  | "lt"
  | "between"
  | "is_empty"
  | "is_not_empty"
  | "relative_date";

export type FilterRule = {
  field: string;
  op: FilterOp;
  value?: unknown;
};

export type FilterGroup = {
  logical: "all" | "any";
  rules: Array<FilterRule | FilterGroup>;
};

export type FilterDsl = FilterGroup | Record<string, never>;

export const RELATIVE_DATE_KEYWORDS = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "next_7_days",
] as const;

export type RelativeDateKeyword = (typeof RELATIVE_DATE_KEYWORDS)[number];

const FILTER_OPS: FilterOp[] = [
  "eq",
  "ne",
  "in",
  "contains",
  "starts_with",
  "gt",
  "lt",
  "between",
  "is_empty",
  "is_not_empty",
  "relative_date",
];

function isFilterGroup(value: unknown): value is FilterGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as { logical?: unknown; rules?: unknown };
  if (group.logical !== "all" && group.logical !== "any") return false;
  return Array.isArray(group.rules);
}

function isFilterRule(value: unknown): value is FilterRule {
  if (!value || typeof value !== "object") return false;
  const rule = value as { field?: unknown; op?: unknown };
  return typeof rule.field === "string" && typeof rule.op === "string" && FILTER_OPS.includes(rule.op as FilterOp);
}

/**
 * Validate a raw value coming from an API payload and narrow it to FilterDsl.
 * Returns null when the shape is invalid.
 */
export function parseFilterDsl(value: unknown): FilterDsl | null {
  if (value === null || value === undefined) return {};
  if (typeof value !== "object") return null;
  if (Array.isArray(value)) return null;
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length === 0) return {};
  if (!isFilterGroup(value)) return null;
  return normalizeGroup(value) ?? null;
}

function normalizeGroup(group: FilterGroup): FilterGroup | null {
  const rules: Array<FilterRule | FilterGroup> = [];
  for (const entry of group.rules) {
    if (isFilterGroup(entry)) {
      const normalized = normalizeGroup(entry);
      if (normalized) rules.push(normalized);
    } else if (isFilterRule(entry)) {
      rules.push({ field: entry.field, op: entry.op, value: entry.value });
    } else {
      return null;
    }
  }
  return { logical: group.logical, rules };
}

function getNestedValue(record: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  if (path in record) return record[path];
  const segments = path.split(".");
  let current: unknown = record;
  for (const segment of segments) {
    if (current && typeof current === "object" && !Array.isArray(current) && segment in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function relativeDateRange(keyword: string, reference: Date = new Date()): { start: Date; end: Date } | null {
  if (keyword === "today") {
    return { start: startOfDay(reference), end: endOfDay(reference) };
  }
  if (keyword === "yesterday") {
    const y = new Date(reference);
    y.setDate(reference.getDate() - 1);
    return { start: startOfDay(y), end: endOfDay(y) };
  }
  if (keyword === "last_7_days") {
    const start = new Date(reference);
    start.setDate(reference.getDate() - 7);
    return { start: startOfDay(start), end: endOfDay(reference) };
  }
  if (keyword === "last_30_days") {
    const start = new Date(reference);
    start.setDate(reference.getDate() - 30);
    return { start: startOfDay(start), end: endOfDay(reference) };
  }
  if (keyword === "next_7_days") {
    const end = new Date(reference);
    end.setDate(reference.getDate() + 7);
    return { start: startOfDay(reference), end: endOfDay(end) };
  }
  return null;
}

function matchesRule(record: Record<string, unknown>, rule: FilterRule): boolean {
  const actual = getNestedValue(record, rule.field);

  switch (rule.op) {
    case "is_empty":
      return isEmptyValue(actual);
    case "is_not_empty":
      return !isEmptyValue(actual);
    case "eq": {
      if (actual === rule.value) return true;
      const leftNum = asNumber(actual);
      const rightNum = asNumber(rule.value);
      if (leftNum !== null && rightNum !== null) return leftNum === rightNum;
      return asText(actual).toLowerCase() === asText(rule.value).toLowerCase();
    }
    case "ne": {
      if (actual === rule.value) return false;
      const leftNum = asNumber(actual);
      const rightNum = asNumber(rule.value);
      if (leftNum !== null && rightNum !== null) return leftNum !== rightNum;
      return asText(actual).toLowerCase() !== asText(rule.value).toLowerCase();
    }
    case "in": {
      const values = Array.isArray(rule.value) ? rule.value : [rule.value];
      const actualText = asText(actual).toLowerCase();
      return values.some((candidate) => asText(candidate).toLowerCase() === actualText);
    }
    case "contains":
      return asText(actual).toLowerCase().includes(asText(rule.value).toLowerCase());
    case "starts_with":
      return asText(actual).toLowerCase().startsWith(asText(rule.value).toLowerCase());
    case "gt": {
      const leftNum = asNumber(actual);
      const rightNum = asNumber(rule.value);
      if (leftNum !== null && rightNum !== null) return leftNum > rightNum;
      const leftDate = asDate(actual);
      const rightDate = asDate(rule.value);
      if (leftDate && rightDate) return leftDate.getTime() > rightDate.getTime();
      return false;
    }
    case "lt": {
      const leftNum = asNumber(actual);
      const rightNum = asNumber(rule.value);
      if (leftNum !== null && rightNum !== null) return leftNum < rightNum;
      const leftDate = asDate(actual);
      const rightDate = asDate(rule.value);
      if (leftDate && rightDate) return leftDate.getTime() < rightDate.getTime();
      return false;
    }
    case "between": {
      const bounds = Array.isArray(rule.value) ? rule.value : null;
      if (!bounds || bounds.length < 2) return false;
      const leftNum = asNumber(actual);
      const lowNum = asNumber(bounds[0]);
      const highNum = asNumber(bounds[1]);
      if (leftNum !== null && lowNum !== null && highNum !== null) {
        return leftNum >= lowNum && leftNum <= highNum;
      }
      const leftDate = asDate(actual);
      const lowDate = asDate(bounds[0]);
      const highDate = asDate(bounds[1]);
      if (leftDate && lowDate && highDate) {
        return leftDate.getTime() >= lowDate.getTime() && leftDate.getTime() <= highDate.getTime();
      }
      return false;
    }
    case "relative_date": {
      const keyword = typeof rule.value === "string" ? rule.value : "";
      const range = relativeDateRange(keyword);
      if (!range) return false;
      const actualDate = asDate(actual);
      if (!actualDate) return false;
      return actualDate.getTime() >= range.start.getTime() && actualDate.getTime() <= range.end.getTime();
    }
    default:
      return false;
  }
}

function matchesGroup(record: Record<string, unknown>, group: FilterGroup): boolean {
  if (!group.rules || group.rules.length === 0) return true;
  if (group.logical === "all") {
    return group.rules.every((entry) =>
      isFilterGroup(entry) ? matchesGroup(record, entry) : matchesRule(record, entry),
    );
  }
  return group.rules.some((entry) =>
    isFilterGroup(entry) ? matchesGroup(record, entry) : matchesRule(record, entry),
  );
}

/**
 * Returns true if `record` satisfies the filter DSL.
 * An empty filter (`{}` or `{ rules: [] }`) returns true for every record.
 */
export function matchesFilter(record: Record<string, unknown>, filter: FilterDsl | null | undefined): boolean {
  if (!filter) return true;
  if (!isFilterGroup(filter)) return true;
  return matchesGroup(record, filter);
}

/**
 * Filter a list of JSONB-like records against the filter DSL.
 * Skips records that throw during evaluation (treated as non-matches).
 */
export function filterRecords<T extends { data: Record<string, unknown> }>(
  records: T[],
  filter: FilterDsl | null | undefined,
): T[] {
  if (!filter || !isFilterGroup(filter) || filter.rules.length === 0) {
    return [...records];
  }
  return records.filter((record) => {
    try {
      return matchesFilter(record.data, filter);
    } catch {
      return false;
    }
  });
}

/**
 * Returns the set of fields referenced by the filter DSL. Useful for column
 * selection when saving a smart view.
 */
export function listReferencedFields(filter: FilterDsl | null | undefined): string[] {
  const acc = new Set<string>();
  const walk = (group: FilterGroup) => {
    for (const entry of group.rules) {
      if (isFilterGroup(entry)) walk(entry);
      else if (isFilterRule(entry)) acc.add(entry.field);
    }
  };
  if (filter && isFilterGroup(filter)) walk(filter);
  return Array.from(acc);
}
