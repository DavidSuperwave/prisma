import { describe, expect, it } from "vitest";

import { isExpressionSafeToTry, safeEvaluateRowExpression } from "./safeExpr";

describe("safeEvaluateRowExpression", () => {
  it("evaluates arithmetic", () => {
    expect(safeEvaluateRowExpression("1+2*3", {})).toBe(7);
  });

  it("resolves $fields", () => {
    expect(safeEvaluateRowExpression("$a + $b", { a: 2, b: 3 })).toBe(5);
  });

  it("rejects eval", () => {
    expect(() => safeEvaluateRowExpression("eval(1)", {})).toThrow();
  });

  it("rejects disallowed substrings in raw expression", () => {
    expect(() => safeEvaluateRowExpression("import('x')", {})).toThrow();
  });
});

describe("isExpressionSafeToTry", () => {
  it("rejects when forbidden", () => {
    expect(isExpressionSafeToTry("Function('')")).toBe(false);
  });
});
