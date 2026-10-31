import { isExpressionSafeToTry, safeEvaluateRowExpression } from "./safeExpr";

export type TransformOperation =
  | { kind: "filter"; field: string; op: string; value?: unknown }
  | { kind: "sort"; field: string; direction: "asc" | "desc" }
  | { kind: "map"; field: string; expression: string }
  | { kind: "aggregate"; field: string; op: "sum" | "avg" | "count" | "min" | "max" }
  | { kind: "formula"; outputField: string; expression: string };

function compareOp(
  a: unknown,
  b: unknown,
  op: string,
): boolean {
  const s = (x: unknown) => String(x ?? "");
  const n = (x: unknown) => (typeof x === "number" ? x : Number(x));
  switch (op) {
    case "eq":
      return s(a) === s(b);
    case "ne":
      return s(a) !== s(b);
    case "contains":
      return s(a).toLowerCase().includes(s(b).toLowerCase());
    case "gt":
      return n(a) > n(b);
    case "gte":
      return n(a) >= n(b);
    case "lt":
      return n(a) < n(b);
    case "lte":
      return n(a) <= n(b);
    default:
      return s(a) === s(b);
  }
}

/**
 * Apply a list of row-wise and aggregate operations to tabular data.
 * Starts from `rows` (array of record objects) and returns the transformed rows
 * and optional aggregate result when the last op is `aggregate`.
 */
export function applySpreadsheetOperations(
  rows: Array<Record<string, unknown>>,
  operations: TransformOperation[],
): { rows: Array<Record<string, unknown>>; aggregate: number | null; aggregateField: string | null } {
  let current = rows.map((r) => ({ ...r }));
  let aggregate: number | null = null;
  let aggregateField: string | null = null;

  for (const op of operations) {
    if (op.kind === "filter") {
      const { field, op: cop, value } = op;
      current = current.filter((row) => compareOp(row[field], value, cop));
    } else if (op.kind === "sort") {
      const dir = op.direction === "desc" ? -1 : 1;
      current = [...current].sort((a, b) => {
        const av = a[op.field];
        const bv = b[op.field];
        const an = typeof av === "number" ? av : Number(av);
        const bn = typeof bv === "number" ? bv : Number(bv);
        if (Number.isFinite(an) && Number.isFinite(bn)) {
          return (an - bn) * dir;
        }
        return String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true }) * dir;
      });
    } else if (op.kind === "map") {
      if (!isExpressionSafeToTry(op.expression)) {
        throw new Error(`Unsafe map expression: ${op.field}`);
      }
      current = current.map((row) => {
        const v = safeEvaluateRowExpression(op.expression, row);
        return { ...row, [op.field]: v };
      });
    } else if (op.kind === "formula") {
      if (!isExpressionSafeToTry(op.expression)) {
        throw new Error(`Unsafe formula: ${op.outputField}`);
      }
      current = current.map((row) => {
        const v = safeEvaluateRowExpression(op.expression, row);
        return { ...row, [op.outputField]: v };
      });
    } else if (op.kind === "aggregate") {
      const nums = current
        .map((r) => r[op.field])
        .map((v) => (typeof v === "number" ? v : Number(v)))
        .filter((n) => Number.isFinite(n));
      let out = 0;
      if (op.op === "sum" || op.op === "avg") {
        out = nums.reduce((a, b) => a + b, 0);
        if (op.op === "avg") out = nums.length ? out / nums.length : 0;
      } else if (op.op === "count") {
        out = current.length;
      } else if (op.op === "min") {
        out = nums.length ? Math.min(...nums) : 0;
      } else {
        out = nums.length ? Math.max(...nums) : 0;
      }
      aggregate = out;
      aggregateField = op.field;
    }
  }
  return { rows: current, aggregate, aggregateField };
}
