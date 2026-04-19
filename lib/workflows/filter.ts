// NOTE: shared with M10 smart views. Minimal operator set so workflow branches work
// before M10 lands a richer DSL. When M10 implements `lib/crm/filters.ts` this file
// can either remain (branch-specific subset) or be superseded.

export type FilterOperator =
  | "eq"
  | "ne"
  | "in"
  | "contains"
  | "is_empty"
  | "is_not_empty"
  | "gt"
  | "lt";

export type FilterRule = {
  field: string;
  op: FilterOperator;
  value?: unknown;
};

export type FilterGroup = {
  all?: FilterGroup[] | FilterRule[];
  any?: FilterGroup[] | FilterRule[];
};

export type Filter = FilterGroup | FilterRule | null | undefined;

function isRule(node: unknown): node is FilterRule {
  return (
    !!node &&
    typeof node === "object" &&
    !Array.isArray(node) &&
    typeof (node as FilterRule).field === "string" &&
    typeof (node as FilterRule).op === "string"
  );
}

function isGroup(node: unknown): node is FilterGroup {
  return (
    !!node &&
    typeof node === "object" &&
    !Array.isArray(node) &&
    (Array.isArray((node as FilterGroup).all) || Array.isArray((node as FilterGroup).any))
  );
}

function lookup(context: Record<string, unknown>, field: string): unknown {
  const parts = field.split(".");
  let current: unknown = context;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function coerceString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function evaluateRule(rule: FilterRule, context: Record<string, unknown>): boolean {
  const actual = lookup(context, rule.field);
  switch (rule.op) {
    case "eq":
      return coerceString(actual) === coerceString(rule.value);
    case "ne":
      return coerceString(actual) !== coerceString(rule.value);
    case "in": {
      const list = Array.isArray(rule.value) ? rule.value : [];
      return list.some((entry) => coerceString(entry) === coerceString(actual));
    }
    case "contains": {
      const needle = coerceString(rule.value).toLowerCase();
      return coerceString(actual).toLowerCase().includes(needle);
    }
    case "is_empty":
      return actual === null || actual === undefined || actual === "";
    case "is_not_empty":
      return !(actual === null || actual === undefined || actual === "");
    case "gt": {
      const a = coerceNumber(actual);
      const b = coerceNumber(rule.value);
      if (a === null || b === null) return false;
      return a > b;
    }
    case "lt": {
      const a = coerceNumber(actual);
      const b = coerceNumber(rule.value);
      if (a === null || b === null) return false;
      return a < b;
    }
    default:
      return false;
  }
}

export function evaluateFilter(filter: Filter, context: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (isRule(filter)) return evaluateRule(filter, context);
  if (isGroup(filter)) {
    if (Array.isArray(filter.all) && filter.all.length > 0) {
      return filter.all.every((child) => evaluateFilter(child as Filter, context));
    }
    if (Array.isArray(filter.any) && filter.any.length > 0) {
      return filter.any.some((child) => evaluateFilter(child as Filter, context));
    }
    return true;
  }
  return true;
}
