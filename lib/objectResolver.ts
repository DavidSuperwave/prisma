export type ResolvableObject = {
  id: string;
  slug?: string | null;
  name?: string | null;
  singularName?: string | null;
  pluralName?: string | null;
  description?: string | null;
};

export type ResolutionSuggestion = {
  id: string;
  slug?: string | null;
  name: string;
  singularName?: string | null;
  pluralName?: string | null;
  score: number;
  reason: "slug" | "exact" | "alias" | "token" | "fuzzy";
};

export type ResolutionResult<T extends ResolvableObject> =
  | {
      ok: true;
      object: T;
      matched: "id" | "slug" | "exact" | "alias" | "token" | "fuzzy";
      suggestions: ResolutionSuggestion[];
    }
  | { ok: false; suggestions: ResolutionSuggestion[] };

const DIACRITIC_RE = /[\u0300-\u036f]/g;

function normalize(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(DIACRITIC_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Slug-safe normalizer — same as normalize() but joins with `-` instead of spaces. */
function normalizeSlug(value: unknown): string {
  return normalize(value).replace(/\s+/g, "-");
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((tok) => tok.length > 0);
}

// Short-hand aliases commonly used by users in Spanish/English for common objects.
// These are loose: if any alias token appears in the user input, it boosts the match.
const ALIAS_GROUPS: Array<{ match: string[]; aliases: string[] }> = [
  {
    match: ["inventario", "carros", "vehiculos", "autos", "vehicles", "inventory", "cars", "auto", "seminuevos", "usados", "eas"],
    aliases: ["car inventory", "vehicle inventory", "inventario de carros", "inventario vehiculos", "eas 17"],
  },
  {
    match: ["personas", "contactos", "clientes", "people", "contacts"],
    aliases: ["crm people", "contacts", "personas"],
  },
  {
    match: ["empresas", "compañias", "companias", "companies"],
    aliases: ["crm companies", "empresas"],
  },
  {
    match: ["negocios", "oportunidades", "deals", "opportunities"],
    aliases: ["crm deals", "negocios"],
  },
];

function objectHaystack(obj: ResolvableObject): string {
  return [obj.name, obj.singularName, obj.pluralName, obj.description]
    .filter((s): s is string => typeof s === "string")
    .map(normalize)
    .join(" ");
}

function aliasScore(queryTokens: string[], obj: ResolvableObject): number {
  const hay = objectHaystack(obj);
  if (!hay) return 0;
  let best = 0;
  for (const group of ALIAS_GROUPS) {
    const queryHits = queryTokens.filter((t) => group.match.includes(t)).length;
    if (queryHits === 0) continue;
    const objectHits = group.match.filter((m) => hay.includes(m)).length;
    if (objectHits === 0) continue;
    // Both sides mention the same alias group -> strong hint.
    const score = Math.min(1, (queryHits * objectHits) / 3);
    if (score > best) best = score;
  }
  return best;
}

function tokenScore(queryTokens: string[], obj: ResolvableObject): number {
  if (queryTokens.length === 0) return 0;
  const objTokens = new Set([
    ...tokenize(obj.name ?? ""),
    ...tokenize(obj.singularName ?? ""),
    ...tokenize(obj.pluralName ?? ""),
  ]);
  if (objTokens.size === 0) return 0;
  const shared = queryTokens.filter((t) => objTokens.has(t)).length;
  return shared / Math.max(queryTokens.length, objTokens.size);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev: number[] = new Array(b.length + 1);
  const curr: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function fuzzyScore(query: string, obj: ResolvableObject): number {
  const q = normalize(query);
  if (!q) return 0;
  const candidates = [obj.name, obj.singularName, obj.pluralName]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map(normalize);
  let best = 0;
  for (const cand of candidates) {
    if (!cand) continue;
    const dist = levenshtein(q, cand);
    const maxLen = Math.max(q.length, cand.length);
    if (maxLen === 0) continue;
    const sim = 1 - dist / maxLen;
    if (sim > best) best = sim;
    if (cand.includes(q) || q.includes(cand)) {
      best = Math.max(best, 0.85);
    }
  }
  return best;
}

/**
 * Resolve a human-supplied object reference (id OR name OR fuzzy hint) against
 * a workspace's `workspace_objects` list.
 *
 * Returns the best match if the score is high enough, otherwise returns up to
 * `maxSuggestions` suggestions for the caller to surface to the agent/user.
 */
export function resolveObject<T extends ResolvableObject>(
  objects: T[],
  reference: string | undefined | null,
  {
    acceptThreshold = 0.6,
    suggestThreshold = 0.25,
    maxSuggestions = 5,
  }: { acceptThreshold?: number; suggestThreshold?: number; maxSuggestions?: number } = {},
): ResolutionResult<T> {
  const ref = typeof reference === "string" ? reference.trim() : "";
  if (!ref) return { ok: false, suggestions: [] };

  // 1) Exact UUID / id match.
  const byId = objects.find((o) => o.id === ref);
  if (byId) return { ok: true, object: byId, matched: "id", suggestions: [] };

  // 1.1) Unique UUID prefix match (>= 8 chars). The catalog used to show only
  // the first 8 chars of the id; some models copied that prefix verbatim. If
  // exactly one object's id starts with the reference, accept it.
  if (/^[0-9a-fA-F-]{8,}$/.test(ref) && ref.length < 36) {
    const prefixMatches = objects.filter((o) => o.id.toLowerCase().startsWith(ref.toLowerCase()));
    if (prefixMatches.length === 1) {
      return { ok: true, object: prefixMatches[0], matched: "id", suggestions: [] };
    }
  }

  // 1.5) Exact slug match. Slugs are the stable identifier the agent should
  // prefer after the first resolution; they survive renames.
  const slugNeedle = normalizeSlug(ref);
  if (slugNeedle.length > 0) {
    const bySlug = objects.find((o) => {
      if (typeof o.slug !== "string" || o.slug.length === 0) return false;
      return normalizeSlug(o.slug) === slugNeedle;
    });
    if (bySlug) return { ok: true, object: bySlug, matched: "slug", suggestions: [] };
  }

  const needle = normalize(ref);
  const queryTokens = tokenize(ref);

  // 2) Exact normalized name / singular / plural.
  const exact = objects.find((o) => {
    const n = normalize(o.name ?? "");
    const s = normalize(o.singularName ?? "");
    const p = normalize(o.pluralName ?? "");
    return n === needle || s === needle || p === needle;
  });
  if (exact) return { ok: true, object: exact, matched: "exact", suggestions: [] };

  // 3) Score every object with alias + token + fuzzy blend.
  const scored = objects.map((obj) => {
    const alias = aliasScore(queryTokens, obj);
    const token = tokenScore(queryTokens, obj);
    const fuzz = fuzzyScore(ref, obj);
    const score = Math.max(alias, token, fuzz, (alias + token + fuzz) / 2);
    let reason: ResolutionSuggestion["reason"] = "fuzzy";
    if (alias >= Math.max(token, fuzz)) reason = "alias";
    else if (token >= fuzz) reason = "token";
    return {
      obj,
      score,
      reason,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  const suggestions: ResolutionSuggestion[] = scored
    .filter((entry) => entry.score >= suggestThreshold)
    .slice(0, maxSuggestions)
    .map((entry) => ({
      id: entry.obj.id,
      slug: entry.obj.slug ?? null,
      name: String(entry.obj.name ?? entry.obj.pluralName ?? entry.obj.singularName ?? ""),
      singularName: entry.obj.singularName ?? null,
      pluralName: entry.obj.pluralName ?? null,
      score: Number(entry.score.toFixed(3)),
      reason: entry.reason,
    }));

  if (best && best.score >= acceptThreshold) {
    return {
      ok: true,
      object: best.obj,
      matched: best.reason,
      suggestions: suggestions.filter((s) => s.id !== best.obj.id),
    };
  }

  return { ok: false, suggestions };
}

/** Convenience helper: always produce suggestions, regardless of success. */
export function suggestObjects<T extends ResolvableObject>(
  objects: T[],
  reference: string | undefined | null,
  maxSuggestions = 5,
): ResolutionSuggestion[] {
  const result = resolveObject(objects, reference, { acceptThreshold: 1.1, maxSuggestions });
  return result.suggestions;
}

/* -------------------------------------------------------------------------- */
/* Field-level resolution                                                     */
/* -------------------------------------------------------------------------- */

export type ResolvableField = {
  id: string;
  name?: string | null;
  key: string;
  type?: string | null;
};

export type FieldSuggestion = {
  key: string;
  name: string | null;
  score: number;
  reason: "key" | "name" | "fuzzy";
};

export type FieldResolution =
  | { ok: true; field: ResolvableField; matched: "key" | "name" | "fuzzy" }
  | { ok: false; suggestions: FieldSuggestion[] };

/**
 * Resolve a field reference (either `key` or human `name`) against a list of
 * field definitions. Used by the records.query planner to detect filter rules
 * that point at columns the object does not have, and surface repair
 * suggestions instead of failing silently.
 */
export function resolveField<T extends ResolvableField>(
  fields: T[],
  reference: string | undefined | null,
): FieldResolution {
  const ref = typeof reference === "string" ? reference.trim() : "";
  if (!ref || fields.length === 0) {
    return { ok: false, suggestions: [] };
  }
  const needle = normalize(ref);
  const byKey = fields.find((f) => f.key === ref || normalize(f.key) === needle);
  if (byKey) return { ok: true, field: byKey, matched: "key" };
  const byName = fields.find((f) => typeof f.name === "string" && normalize(f.name) === needle);
  if (byName) return { ok: true, field: byName, matched: "name" };

  // Fuzzy fallback — single-pass Levenshtein over key and name.
  const scored = fields.map((field) => {
    const keyN = normalize(field.key);
    const nameN = normalize(field.name ?? "");
    const best = Math.max(similarity(needle, keyN), similarity(needle, nameN));
    return { field, score: best };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (top && top.score >= 0.75) {
    return { ok: true, field: top.field, matched: "fuzzy" };
  }
  const suggestions: FieldSuggestion[] = scored
    .filter((entry) => entry.score >= 0.35)
    .slice(0, 5)
    .map((entry) => ({
      key: entry.field.key,
      name: entry.field.name ?? null,
      score: Number(entry.score.toFixed(3)),
      reason: "fuzzy",
    }));
  return { ok: false, suggestions };
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 0 : 1 - dist / maxLen;
}
