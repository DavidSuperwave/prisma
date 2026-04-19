import { registerTool } from "../registry";
import { fetchInternalJson } from "../executor";

const slug = (ctx: { workspaceSlug: string }) => encodeURIComponent(ctx.workspaceSlug);

function required(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`Missing required string \`${key}\`.`);
  }
  return v.trim();
}

/* -------------------------------------------------------------------------- */
/* Catalog + resolve                                                           */
/* -------------------------------------------------------------------------- */

type ObjectsPayload = {
  objects?: Array<{
    id: string;
    slug?: string | null;
    name: string;
    singularName?: string | null;
    pluralName?: string | null;
    kind?: string | null;
    isSystem?: boolean;
    recordCount?: number;
    fields?: Array<{
      key: string;
      name: string;
      type: string;
      required?: boolean;
      sortOrder?: number;
    }>;
  }>;
  suggestions?: unknown[];
  resolution?: unknown;
};

registerTool({
  name: "schema.catalog",
  description:
    "Return every workspace object with its stable slug, human name, id, record count, and field catalog (key + label + type). Call this when the inline #CATALOG in the prompt says it was truncated, when you need a field that isn't listed there, or after the user renames a page. The response is the canonical source of truth for object identity and field keys.",
  args: {
    includeFields: { type: "boolean", description: "Include each object's field catalog (default true)." },
    includeCounts: { type: "boolean", description: "Include recordCount per object (default true)." },
  },
  handler: async (args, ctx) => {
    const includeFields = args.includeFields !== false;
    const includeCounts = args.includeCounts !== false;
    const params = new URLSearchParams();
    if (includeFields) params.set("includeFields", "true");
    if (includeCounts) params.set("includeCounts", "true");
    const qs = params.toString();
    const res = await fetchInternalJson<ObjectsPayload>(
      ctx,
      `/api/workspaces/${slug(ctx)}/objects${qs ? `?${qs}` : ""}`,
    );
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    const objects = Array.isArray(res.data?.objects) ? res.data!.objects : [];
    const catalog = objects.map((obj) => ({
      id: obj.id,
      slug: obj.slug ?? null,
      name: obj.name,
      singularName: obj.singularName ?? null,
      pluralName: obj.pluralName ?? null,
      kind: obj.kind ?? null,
      isSystem: Boolean(obj.isSystem),
      recordCount: typeof obj.recordCount === "number" ? obj.recordCount : null,
      fields: includeFields && Array.isArray(obj.fields)
        ? obj.fields.map((f) => ({
            key: f.key,
            name: f.name,
            type: f.type,
            required: Boolean(f.required),
          }))
        : undefined,
    }));
    return {
      ok: true,
      data: {
        objects: catalog,
        totalObjects: catalog.length,
      },
    };
  },
});

registerTool({
  name: "schema.resolve",
  description:
    "Resolve any free-text reference the user gave (e.g. 'inventario', 'Eas 17', 'territories') to candidate workspace objects with {id, slug, name, score, reason}. Use this when #CATALOG doesn't clearly answer which object the user means, or before retrying after a records.query disambiguation error. Returns up to 5 matches ordered by score.",
  args: {
    reference: { type: "string", required: true, description: "The user's natural-language name for the object." },
    limit: { type: "number", description: "Maximum suggestions to return (default 5, max 10)." },
  },
  handler: async (args, ctx) => {
    const reference = required(args, "reference");
    const limit = Math.min(Math.max(Number(args.limit ?? 5) || 5, 1), 10);
    // Use the same /objects route with `object=<ref>` — it runs the production
    // resolver and returns either the matched object or suggestions. We
    // normalize both shapes into a single candidate list so the model can pick.
    const res = await fetchInternalJson<ObjectsPayload>(
      ctx,
      `/api/workspaces/${slug(ctx)}/objects?object=${encodeURIComponent(reference)}`,
    );
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };

    const matched = Array.isArray(res.data?.objects) ? res.data!.objects[0] ?? null : null;
    const alt = Array.isArray((res.data?.resolution as { alternatives?: unknown[] } | null | undefined)?.alternatives)
      ? ((res.data!.resolution as { alternatives: unknown[] }).alternatives as Array<{
          id: string;
          slug?: string | null;
          name: string;
          score?: number;
          reason?: string;
        }>)
      : [];
    const suggestions = Array.isArray(res.data?.suggestions)
      ? (res.data!.suggestions as Array<{
          id: string;
          slug?: string | null;
          name: string;
          score?: number;
          reason?: string;
        }>)
      : [];

    const candidates: Array<{
      id: string;
      slug: string | null;
      name: string;
      score: number;
      reason: string;
    }> = [];
    const seen = new Set<string>();
    const push = (
      candidate: { id: string; slug?: string | null; name: string; score?: number; reason?: string } | null,
      defaultReason: string,
      defaultScore: number,
    ) => {
      if (!candidate || !candidate.id || seen.has(candidate.id)) return;
      seen.add(candidate.id);
      candidates.push({
        id: candidate.id,
        slug: candidate.slug ?? null,
        name: candidate.name,
        score: typeof candidate.score === "number" ? candidate.score : defaultScore,
        reason: candidate.reason ?? defaultReason,
      });
    };
    if (matched) push({ id: matched.id, slug: matched.slug ?? null, name: matched.name }, "matched", 1);
    for (const item of alt) push(item, "alias", item.score ?? 0.5);
    for (const item of suggestions) push(item, "fuzzy", item.score ?? 0.5);

    return {
      ok: true,
      data: {
        reference,
        candidates: candidates.slice(0, limit),
        matched: matched ? { id: matched.id, slug: matched.slug ?? null, name: matched.name } : null,
      },
    };
  },
});

registerTool({
  name: "schema.add_field",
  description: "Add a custom field to a workspace object.",
  args: {
    objectId: { type: "string", required: true },
    key: { type: "string", required: true, description: "snake_case key" },
    label: { type: "string", required: true },
    type: {
      type: "string",
      required: true,
      description: "text|number|currency|date|boolean|select|relation|file|status",
    },
    options: { type: "array", description: "Options for select/status" },
    config: { type: "object", description: "Extra config (relation target etc.)" },
    isRequired: { type: "boolean" },
  },
  handler: async (args, ctx) => {
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/fields`, {
      method: "POST",
      body: JSON.stringify(args),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "schema.rename_field",
  description: "Rename or re-label a field (cannot rename locked system fields).",
  args: {
    fieldId: { type: "string", required: true },
    label: { type: "string" },
    key: { type: "string" },
  },
  handler: async (args, ctx) => {
    const fieldId = required(args, "fieldId");
    const { fieldId: _omit, ...rest } = args;
    const res = await fetchInternalJson(
      ctx,
      `/api/workspaces/${slug(ctx)}/fields/${encodeURIComponent(fieldId)}`,
      { method: "PATCH", body: JSON.stringify(rest) },
    );
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "schema.reorder_fields",
  description: "Reorder fields by providing the desired sequence of field ids.",
  args: {
    objectId: { type: "string", required: true },
    fieldIds: { type: "array", required: true },
  },
  handler: async (args, ctx) => {
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/fields`, {
      method: "PATCH",
      body: JSON.stringify({ objectId: args.objectId, order: args.fieldIds }),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "schema.hide_field",
  description: "Hide (soft) a field from the UI without deleting data.",
  args: { fieldId: { type: "string", required: true } },
  handler: async (args, ctx) => {
    const fieldId = required(args, "fieldId");
    const res = await fetchInternalJson(
      ctx,
      `/api/workspaces/${slug(ctx)}/fields/${encodeURIComponent(fieldId)}`,
      { method: "PATCH", body: JSON.stringify({ isHidden: true }) },
    );
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});
