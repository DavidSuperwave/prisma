const FORBIDDEN = /(\beval\b|\bFunction\b|require\(|import\s|__proto|constructor)/i;

/**
 * Safely evaluate a numeric expression with `$field` references to row keys.
 * No eval/Function. Supports + - * / % parentheses and unary minus.
 */
export function safeEvaluateRowExpression(
  expression: string,
  row: Record<string, unknown>,
): number {
  if (FORBIDDEN.test(expression)) {
    throw new Error("Expression contains disallowed tokens.");
  }
  const filled = expression.replace(/\$([a-zA-Z0-9_]+)/g, (_m, key) => {
    const v = row[key as string];
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) {
      return "NaN";
    }
    return String(n);
  });
  if (/\$/.test(filled)) {
    throw new Error("Unresolved $field reference in expression.");
  }
  const compact = filled.replace(/\s+/g, "");
  if (!/^[0-9+\-*/%().Na]+$/.test(compact)) {
    throw new Error("Expression has invalid characters.");
  }
  const { value, next } = parseExpr(compact, 0);
  if (next !== compact.length) {
    throw new Error("Trailing characters in expression.");
  }
  return value;
}

function parseExpr(s: string, i: number): { value: number; next: number } {
  let { value: left, next } = parseTerm(s, i);
  while (next < s.length && (s[next] === "+" || s[next] === "-")) {
    const op = s[next]!;
    const r = parseTerm(s, next + 1);
    left = op === "+" ? left + r.value : left - r.value;
    next = r.next;
  }
  return { value: left, next };
}

function parseTerm(s: string, i: number): { value: number; next: number } {
  let { value: left, next } = parseFactor(s, i);
  while (next < s.length && (s[next] === "*" || s[next] === "/" || s[next] === "%")) {
    const op = s[next]!;
    const r = parseFactor(s, next + 1);
    if (op === "*") left = left * r.value;
    else if (op === "/") left = left / r.value;
    else left = left % r.value;
    next = r.next;
  }
  return { value: left, next };
}

function parseFactor(s: string, i: number): { value: number; next: number } {
  if (i >= s.length) throw new Error("Unexpected end of expression");
  if (s[i] === "+") {
    return parseFactor(s, i + 1);
  }
  if (s[i] === "-") {
    const r = parseFactor(s, i + 1);
    return { value: -r.value, next: r.next };
  }
  if (s[i] === "(") {
    const inner = parseExpr(s, i + 1);
    if (inner.next >= s.length || s[inner.next] !== ")") {
      throw new Error("Missing closing )");
    }
    return { value: inner.value, next: inner.next + 1 };
  }
  if (s.slice(i, i + 3) === "NaN") {
    return { value: NaN, next: i + 3 };
  }
  let j = i;
  while (j < s.length && /[0-9.]/.test(s[j]!)) j += 1;
  if (j === i) throw new Error("Expected number");
  const n = parseFloat(s.slice(i, j));
  if (!Number.isFinite(n) && s.slice(i, j) !== "NaN") throw new Error("Invalid number");
  return { value: n, next: j };
}

export function isExpressionSafeToTry(expression: string): boolean {
  if (FORBIDDEN.test(expression)) return false;
  if (expression.length > 200) return false;
  return true;
}
