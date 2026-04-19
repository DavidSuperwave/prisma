type TemplateContext = Record<string, unknown>;

export type RenderOptions = {
  locale?: string;
  currency?: string;
};

const PIPE_FORMATTERS: Record<string, (value: unknown, opts: RenderOptions) => string> = {
  currency: (value, opts) => {
    const num = toNumber(value);
    if (num === null) return "";
    const currency = opts.currency ?? "USD";
    try {
      return new Intl.NumberFormat(opts.locale ?? "en-US", {
        style: "currency",
        currency,
      }).format(num);
    } catch {
      return `${num.toFixed(2)} ${currency}`;
    }
  },
  date: (value, opts) => {
    if (value === null || value === undefined || value === "") return "";
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value ?? "");
    try {
      return new Intl.DateTimeFormat(opts.locale ?? "en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  },
  uppercase: (value) => toStringSafe(value).toUpperCase(),
  lowercase: (value) => toStringSafe(value).toLowerCase(),
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toStringSafe(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function lookup(context: TemplateContext, path: string): unknown {
  const parts = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  let current: unknown = context;
  for (const segment of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Renders a merge-tag template. Supports `{{path.to.value}}` and simple pipes
 * like `{{deal.amount|currency}}`. Unknown tags render as empty strings.
 */
export function render(template: string, context: TemplateContext, options: RenderOptions = {}): string {
  if (typeof template !== "string" || template.length === 0) return "";

  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    const [pathPart, ...pipeParts] = trimmed.split("|").map((segment) => segment.trim());
    let value = lookup(context, pathPart);

    if (value === undefined) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[templates] unknown merge tag: {{${trimmed}}}`);
      }
      value = "";
    }

    for (const pipe of pipeParts) {
      const [name, ...rest] = pipe.split(":").map((segment) => segment.trim());
      const formatter = PIPE_FORMATTERS[name];
      if (!formatter) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[templates] unknown pipe: ${name}`);
        }
        continue;
      }
      const opts: RenderOptions = { ...options };
      if (name === "currency" && rest[0]) {
        opts.currency = rest[0];
      }
      value = formatter(value, opts);
    }

    return toStringSafe(value);
  });
}

export function extractMergeTags(template: string): string[] {
  if (typeof template !== "string") return [];
  const tags = new Set<string>();
  const regex = /\{\{\s*([^}]+?)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) {
    const [pathPart] = match[1].split("|").map((segment) => segment.trim());
    if (pathPart) tags.add(pathPart);
  }
  return Array.from(tags).sort();
}
