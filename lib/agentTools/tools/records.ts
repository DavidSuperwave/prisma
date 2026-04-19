import { registerTool, type ToolResult } from "../registry";
import { fetchInternalJson } from "../executor";
import { signProposal } from "../confirmToken";
import { appendDocumentProvenance } from "@/lib/documents/provenance";

const slug = (ctx: { workspaceSlug: string }) => encodeURIComponent(ctx.workspaceSlug);

function required(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`Missing required string \`${key}\`.`);
  }
  return v.trim();
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

registerTool({
  name: "objects.list",
  description:
    "List every workspace object (Vehicles, Eas 17, custom ones) with optional record counts. Always call this first when the user mentions an object by human name so you can resolve its objectId.",
  args: {
    includeCounts: { type: "boolean", description: "Include record counts per object." },
    includeFields: { type: "boolean", description: "Include each object's fields inline." },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const params = new URLSearchParams();
    if (args.includeCounts === true) params.set("includeCounts", "true");
    if (args.includeFields === true) params.set("includeFields", "true");
    const qs = params.toString();
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/objects${qs ? `?${qs}` : ""}`);
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "objects.describe",
  description: "Describe a single workspace object and its fields. Accepts objectId, objectSlug, or objectName (prefer slug — it survives renames).",
  args: {
    objectId: { type: "string" },
    objectSlug: { type: "string", description: "Stable slug for the object (preferred over objectName)." },
    objectName: { type: "string" },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const ref =
      typeof args.objectId === "string"
        ? args.objectId
        : typeof args.objectSlug === "string"
          ? args.objectSlug
          : typeof args.objectName === "string"
            ? args.objectName
            : "";
    if (!ref) return { ok: false, error: "Provide objectId, objectSlug, or objectName.", status: 400 };
    const res = await fetchInternalJson(
      ctx,
      `/api/workspaces/${slug(ctx)}/objects?includeFields=true&includeCounts=true&object=${encodeURIComponent(ref)}`,
    );
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status, details: res.data };
    const payload = res.data as {
      objects?: unknown[];
      suggestions?: unknown[];
      resolution?: unknown;
    } | null;
    const first = Array.isArray(payload?.objects) ? payload!.objects[0] : null;
    if (!first) {
      return {
        ok: false,
        error: `No encontré el objeto "${ref}". Revisa las sugerencias y vuelve a intentarlo con el nombre o id correcto.`,
        status: 404,
        details: {
          reference: ref,
          suggestions: payload?.suggestions ?? [],
        },
      };
    }
    return {
      ok: true,
      data: {
        ...(first as Record<string, unknown>),
        resolution: payload?.resolution,
      },
    };
  },
});

registerTool({
  name: "records.query",
  description:
    "Generic read against any workspace object. Prefer objectSlug (rename-proof) or objectId; objectName is a legacy fallback. Filter uses {logical, rules:[{field, op, value}]} where op is eq|neq|contains|in|gt|gte|lt|lte|is_null|is_not_null|starts_with|ends_with. `field` should be the field's stable `key` — the server will still accept display `name` but keys survive label changes.",
  args: {
    objectId: { type: "string" },
    objectSlug: { type: "string", description: "Stable slug for the object (preferred over objectName)." },
    objectName: { type: "string" },
    filter: { type: "object" },
    search: { type: "string" },
    sort: { type: "array" },
    limit: { type: "number" },
    offset: { type: "number" },
    projection: { type: "array" },
    includeDeleted: { type: "boolean" },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const body = { ...args };
    const attempt = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/records/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (attempt.ok) {
      return { ok: true, data: attempt.data as Record<string, unknown> };
    }

    // Planner repair loop — the server returns structured errors for two
    // common miss cases. We can auto-retry once when the signal is strong
    // enough, and otherwise surface a rich error so the model can pick the
    // correct slug/key on its next turn.
    const details = attempt.data as {
      reason?: string;
      suggestions?: Array<{ id?: string; slug?: string; name?: string; score?: number }>;
      unknownFields?: Array<{
        reference?: string;
        suggestions?: Array<{ key?: string; name?: string | null; score?: number }>;
      }>;
      availableFields?: Array<{ key: string; name: string; type: string }>;
      object?: { id?: string; slug?: string; name?: string };
    } | null;

    // 404 with high-confidence object suggestion → retry with its id.
    if (attempt.status === 404 && Array.isArray(details?.suggestions) && details!.suggestions.length > 0) {
      const top = details!.suggestions[0];
      const score = typeof top?.score === "number" ? top.score : 0;
      const id = typeof top?.id === "string" ? top.id : "";
      if (score >= 0.75 && id) {
        const retryBody: Record<string, unknown> = {
          ...body,
          objectId: id,
        };
        delete retryBody.objectSlug;
        delete retryBody.objectName;
        const retry = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/records/query`, {
          method: "POST",
          body: JSON.stringify(retryBody),
        });
        if (retry.ok) {
          const data = (retry.data ?? {}) as Record<string, unknown>;
          return {
            ok: true,
            data: {
              ...data,
              plannerRepair: {
                kind: "auto_resolved_object",
                originalReference: body.objectSlug ?? body.objectName ?? body.objectId ?? null,
                resolvedTo: { id, slug: top.slug ?? null, name: top.name ?? null, score },
              },
            },
          };
        }
      }
      // Low confidence → surface disambiguation payload.
      return {
        ok: false,
        status: 404,
        error: `No pude identificar el objeto de forma inequívoca. Llama schema.catalog o schema.resolve con las sugerencias y reintenta con el objectSlug correcto.`,
        details: {
          reason: "needs_disambiguation",
          originalReference: body.objectSlug ?? body.objectName ?? body.objectId ?? null,
          suggestions: details!.suggestions.slice(0, 3),
        },
      };
    }

    // 422 with unknown_fields + single high-confidence suggestion per field → retry with the keys swapped.
    if (
      attempt.status === 422 &&
      details?.reason === "unknown_fields" &&
      Array.isArray(details.unknownFields) &&
      details.unknownFields.length > 0
    ) {
      const rewrites = new Map<string, string>();
      for (const entry of details.unknownFields) {
        const ref = typeof entry.reference === "string" ? entry.reference : "";
        const top = Array.isArray(entry.suggestions) ? entry.suggestions[0] : null;
        if (ref && top && typeof top.key === "string" && (top.score ?? 0) >= 0.75) {
          rewrites.set(ref, top.key);
        }
      }
      if (rewrites.size === details.unknownFields.length && rewrites.size > 0 && body.filter) {
        const rewritten = rewriteFilterFields(body.filter as unknown, rewrites);
        const retry = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/records/query`, {
          method: "POST",
          body: JSON.stringify({ ...body, filter: rewritten }),
        });
        if (retry.ok) {
          const data = (retry.data ?? {}) as Record<string, unknown>;
          return {
            ok: true,
            data: {
              ...data,
              plannerRepair: {
                kind: "auto_rewrote_fields",
                rewrites: Array.from(rewrites.entries()).map(([from, to]) => ({ from, to })),
              },
            },
          };
        }
      }
      // Surface structured repair hints.
      return {
        ok: false,
        status: 422,
        error: "Algunos campos del filtro no existen en este objeto. Reintenta con el `key` correcto.",
        details: {
          reason: "unknown_fields",
          object: details.object ?? null,
          unknownFields: details.unknownFields,
          availableFields: details.availableFields ?? [],
        },
      };
    }

    return {
      ok: false,
      error: attempt.error ?? "Failed",
      status: attempt.status,
      details: attempt.data ?? undefined,
    };
  },
});

// Walk a filter tree and replace rule.field values for any references the
// caller used that the server reports as unknown. Leaves unknown refs alone if
// there's no confident rewrite, so the original error can still surface.
function rewriteFilterFields(node: unknown, rewrites: Map<string, string>): unknown {
  if (!node || typeof node !== "object") return node;
  const anyNode = node as Record<string, unknown>;
  if (Array.isArray(anyNode.rules)) {
    return {
      ...anyNode,
      rules: (anyNode.rules as unknown[]).map((rule) => rewriteFilterFields(rule, rewrites)),
    };
  }
  if (typeof anyNode.field === "string") {
    const next = rewrites.get(anyNode.field);
    if (next) return { ...anyNode, field: next };
  }
  return anyNode;
}

registerTool({
  name: "records.get",
  description: "Fetch a single record by id. Optional includeHistory returns the record_history timeline.",
  args: {
    recordId: { type: "string", required: true },
    includeHistory: { type: "boolean" },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const recordId = required(args, "recordId");
    const params = new URLSearchParams();
    if (args.includeHistory === true) params.set("includeHistory", "true");
    const qs = params.toString();
    const res = await fetchInternalJson(
      ctx,
      `/api/workspaces/${slug(ctx)}/records/${encodeURIComponent(recordId)}${qs ? `?${qs}` : ""}`,
    );
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

/* -------------------------------------------------------------------------- */
/* Single-record writes (confirm-before-commit)                                */
/* -------------------------------------------------------------------------- */

registerTool({
  name: "records.create",
  description:
    "Create a record for any workspace object. Defaults to dryRun:true — returns a proposal with a confirmToken. Re-issue the same call with dryRun:false and the confirmToken to commit. Pass `sourceDocumentId` when the values came from an attached document (e.g. a PDF promo) so the record keeps an audit trail.",
  args: {
    objectId: { type: "string", required: true },
    data: { type: "object", required: true },
    dryRun: { type: "boolean", description: "If true (default), return a proposal instead of committing." },
    confirmToken: { type: "string", description: "Confirmation token from the prior dryRun proposal." },
    sourceDocumentId: {
      type: "string",
      description:
        "Optional recordId of an attached document (e.g. PDF) whose contents motivated this write. Gets appended to `data.provenance` on commit.",
    },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const dryRun = args.dryRun !== false;
    const sourceDocumentId =
      typeof args.sourceDocumentId === "string" && args.sourceDocumentId.trim().length > 0
        ? args.sourceDocumentId.trim()
        : null;
    if (dryRun) {
      const proposal = {
        action: "records.create",
        objectId: args.objectId,
        summary: sourceDocumentId
          ? `Create 1 record in object ${args.objectId} (source: document ${sourceDocumentId}).`
          : `Create 1 record in object ${args.objectId}.`,
        diff: [{ id: null, before: null, after: args.data }],
        targets: [],
        count: 1,
        ...(sourceDocumentId ? { sourceDocumentId } : {}),
      };
      const token = signProposal(proposal);
      return {
        ok: true,
        data: { proposal, confirmToken: token.token, expiresAt: token.expiresAt, dryRun: true },
      };
    }
    const payloadData = sourceDocumentId
      ? appendDocumentProvenance(
          (args.data as Record<string, unknown>) ?? {},
          sourceDocumentId,
          "records.create",
        )
      : args.data;
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/records`, {
      method: "POST",
      body: JSON.stringify({ objectId: args.objectId, data: payloadData }),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "records.update",
  description:
    "Update a record's data JSON. Defaults to dryRun:true (returns a proposal). Re-issue with dryRun:false and confirmToken to commit. Pass `sourceDocumentId` when the values came from an attached document (e.g. a PDF promo) so the change is tagged in `data.provenance`.",
  args: {
    recordId: { type: "string", required: true },
    data: { type: "object", required: true },
    dryRun: { type: "boolean" },
    confirmToken: { type: "string" },
    sourceDocumentId: {
      type: "string",
      description:
        "Optional recordId of an attached document (e.g. PDF) whose contents motivated this write. Gets appended to `data.provenance` on commit.",
    },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const recordId = required(args, "recordId");
    const dryRun = args.dryRun !== false;
    const sourceDocumentId =
      typeof args.sourceDocumentId === "string" && args.sourceDocumentId.trim().length > 0
        ? args.sourceDocumentId.trim()
        : null;
    if (dryRun) {
      const existing = await fetchInternalJson<{ record?: { data?: Record<string, unknown> } }>(
        ctx,
        `/api/workspaces/${slug(ctx)}/records/${encodeURIComponent(recordId)}`,
      );
      const before = existing.ok ? existing.data?.record?.data ?? {} : {};
      const proposal = {
        action: "records.update",
        recordId,
        summary: sourceDocumentId
          ? `Update record ${recordId} (source: document ${sourceDocumentId}).`
          : `Update record ${recordId}.`,
        diff: [{ id: recordId, before, after: { ...before, ...(args.data as Record<string, unknown>) } }],
        targets: [recordId],
        count: 1,
        ...(sourceDocumentId ? { sourceDocumentId } : {}),
      };
      const token = signProposal(proposal);
      return { ok: true, data: { proposal, confirmToken: token.token, expiresAt: token.expiresAt, dryRun: true } };
    }
    const payloadData = sourceDocumentId
      ? appendDocumentProvenance(
          (args.data as Record<string, unknown>) ?? {},
          sourceDocumentId,
          "records.update",
        )
      : args.data;
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/records/${encodeURIComponent(recordId)}`, {
      method: "PATCH",
      body: JSON.stringify({ data: payloadData }),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "records.delete",
  description:
    "Soft-delete a record. Defaults to dryRun:true. Re-issue with dryRun:false and confirmToken to commit.",
  args: {
    recordId: { type: "string", required: true },
    dryRun: { type: "boolean" },
    confirmToken: { type: "string" },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const recordId = required(args, "recordId");
    const dryRun = args.dryRun !== false;
    if (dryRun) {
      const proposal = {
        action: "records.delete",
        recordId,
        summary: `Delete record ${recordId} (soft).`,
        targets: [recordId],
        diff: [{ id: recordId, before: null, after: null }],
        count: 1,
      };
      const token = signProposal(proposal);
      return { ok: true, data: { proposal, confirmToken: token.token, expiresAt: token.expiresAt, dryRun: true } };
    }
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/records/${encodeURIComponent(recordId)}`, {
      method: "DELETE",
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: { recordId } };
  },
});

/* -------------------------------------------------------------------------- */
/* Bulk writes — routed to the /records/bulk route which signs its own token   */
/* -------------------------------------------------------------------------- */

registerTool({
  name: "records.bulk_update",
  description:
    "Apply a patch to every record matching recordIds[] or a filter. Defaults to dryRun:true and returns a proposal. Re-issue with dryRun:false and confirmToken to commit. Prefer objectSlug or objectId over objectName. Pass `sourceDocumentId` when the patch came from an attached document (PDF promo, etc.) so the change is tagged in `data.provenance`.",
  args: {
    objectId: { type: "string" },
    objectSlug: { type: "string" },
    objectName: { type: "string" },
    recordIds: { type: "array" },
    filter: { type: "object" },
    patch: { type: "object", required: true },
    dryRun: { type: "boolean" },
    confirmToken: { type: "string" },
    sourceDocumentId: {
      type: "string",
      description:
        "Optional recordId of an attached document (e.g. PDF) whose contents motivated the bulk patch.",
    },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/records/bulk`, {
      method: "POST",
      body: JSON.stringify({ ...args, action: "update", dryRun: args.dryRun !== false }),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status, details: res.data };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "records.bulk_delete",
  description:
    "Soft-delete every record matching recordIds[] or a filter. Defaults to dryRun:true and returns a proposal. Re-issue with dryRun:false and confirmToken to commit. Prefer objectSlug or objectId over objectName.",
  args: {
    objectId: { type: "string" },
    objectSlug: { type: "string" },
    objectName: { type: "string" },
    recordIds: { type: "array" },
    filter: { type: "object" },
    dryRun: { type: "boolean" },
    confirmToken: { type: "string" },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/records/bulk`, {
      method: "POST",
      body: JSON.stringify({ ...args, action: "delete", dryRun: args.dryRun !== false }),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status, details: res.data };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});
