/**
 * Money helpers for the `leads.opportunity_value` column.
 *
 * Storage contract:
 *   - INTEGER representing cents (USD by default).
 *   - NULL means "unset" — excluded from pipeline totals; displayed as "—".
 *   - 0 is a valid value — displayed as "$0.00" and included in totals.
 *   - Negative values are rejected at the API layer and by the DB CHECK
 *     constraint in migration 20260420_000002.
 */

export type CurrencyFormatOptions = {
  locale?: string;
  currency?: string;
};

/**
 * Format cents as a currency string.
 *
 *   formatCurrency(150000) === "$1,500.00"
 *   formatCurrency(0)      === "$0.00"
 *   formatCurrency(null)   === "—"
 */
export function formatCurrency(
  cents: number | null | undefined,
  options: CurrencyFormatOptions = {},
): string {
  if (cents === null || cents === undefined) return "—";
  if (!Number.isFinite(cents)) return "—";
  const locale = options.locale ?? "en-US";
  const currency = options.currency ?? "USD";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/**
 * Parse a user-entered dollar value (string or number) into integer cents.
 * Returns null for empty / falsy input. Throws on invalid input.
 *
 *   parseDollarsToCents("1,500.00") === 150000
 *   parseDollarsToCents(1500)       === 150000
 *   parseDollarsToCents("")         === null
 *   parseDollarsToCents("abc")      throws
 *   parseDollarsToCents(-10)        throws
 */
export function parseDollarsToCents(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const cleaned = trimmed.replace(/[$,\s]/g, "");
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
      throw new Error(`Invalid dollar amount: "${input}"`);
    }
    const asFloat = Number(cleaned);
    return toCents(asFloat);
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new Error("Invalid dollar amount: not finite");
    }
    return toCents(input);
  }
  throw new Error(`Invalid dollar amount: ${typeof input}`);
}

function toCents(dollars: number): number {
  if (dollars < 0) {
    throw new Error(`opportunity_value must be non-negative, got ${dollars}`);
  }
  return Math.round(dollars * 100);
}

/**
 * Validate that a value is a storable cents amount (non-negative integer)
 * or null. Used by API routes accepting opportunity_value directly.
 */
export function validateCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("opportunity_value must be an integer number of cents or null");
  }
  if (value < 0) {
    throw new Error("opportunity_value must be non-negative");
  }
  return value;
}

/**
 * Sum a list of cents amounts, skipping null entries.
 */
export function sumCents(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) {
      total += v;
    }
  }
  return total;
}
