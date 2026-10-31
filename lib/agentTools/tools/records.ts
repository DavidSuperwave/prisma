import { registerTool, type ToolResult } from "../registry";
import { fetchInternalJson } from "../executor";
import { signProposal, verifyProposal } from "../confirmToken";
import { appendDocumentProvenance } from "@/lib/documents/provenance";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const slug = (ctx: { workspaceSlug: string }) => encodeURIComponent(ctx.workspaceSlug);

type ObjectAccessRow = {
  id: string;
  slug: string;
  name: string;
};

type AgentKnowledgeAccess = {
  workspaceId: string;
  read: Set<string>;
  write: Set<string>;
};

function normalizeAccessValue(value: string) {
  return value.trim().toLowerCase();
}

async function resolveWorkspaceId(ctx: { workspaceSlug: string }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("workspaces")
    .select("id")
    .eq("subdomain", ctx.workspaceSlug)
    .maybeSingle();
  if (error || !data?.id) return null;
  return String(data.id);
}

async function loadAgentKnowledgeAccess(ctx: { workspaceSlug: string; agentId?: string | null }) {
  if (!ctx.agentId) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const workspaceId = await resolveWorkspaceId(ctx);
  if (!workspaceId) return null;
  const { data, error } = await supabase
    .from("workspace_agents")
    .select("knowledge_scope")
    .eq("workspace_id", workspaceId)
    .eq("id", ctx.agentId)
    .maybeSingle();
  if (error || !data) return null;
  const knowledgeScope =
    data.knowledge_scope && typeof data.knowledge_scope === "object" && !Array.isArray(data.knowledge_scope)
      ? (data.knowledge_scope as Record<string, unknown>)
      : {};
  const read = Array.isArray(knowledgeScope.read)
    ? new Set((knowledgeScope.read as unknown[]).map((entry) => normalizeAccessValue(String(entry ?? ""))).filter(Boolean))
    : new Set<string>();
  const write = Array.isArray(knowledgeScope.write)
    ? new Set((knowledgeScope.write as unknown[]).map((entry) => normalizeAccessValue(String(entry ?? ""))).filter(Boolean))
    : new Set<string>();
  return { workspaceId, read, write } satisfies AgentKnowledgeAccess;
}

async function resolveObjectForAccess(
  access: AgentKnowledgeAccess,
  selector: { objectId?: unknown; objectSlug?: unknown; objectName?: unknown },
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  let query = supabase
    .from("workspace_objects")
    .select("id, slug, name")
    .eq("workspace_id", access.workspaceId)
    .limit(1);
  const objectId = typeof selector.objectId === "string" ? selector.objectId.trim() : "";
  const objectSlug = typeof selector.objectSlug === "string" ? selector.objectSlug.trim() : "";
  const objectName = typeof selector.objectName === "string" ? selector.objectName.trim() : "";
  if (objectId) query = query.eq("id", objectId);
  else if (objectSlug) query = query.eq("slug", objectSlug);
  else if (objectName) query = query.eq("name", objectName);
  else return null;
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return {
    id: String(data.id),
    slug: String(data.slug ?? ""),
    name: String(data.name ?? ""),
  } satisfies ObjectAccessRow;
}

function hasAccess(set: Set<string>, objectRow: ObjectAccessRow) {
  if (set.size === 0) return true;
  const candidates = [
    normalizeAccessValue(objectRow.id),
    normalizeAccessValue(objectRow.slug),
    normalizeAccessValue(objectRow.name),
    "*",
  ];
  return candidates.some((candidate) => set.has(candidate));
}

async function enforceObjectScope(
  ctx: { workspaceSlug: string; agentId?: string | null },
  selector: { objectId?: unknown; objectSlug?: unknown; objectName?: unknown },
  mode: "read" | "write",
) {
  const access = await loadAgentKnowledgeAccess(ctx);
  if (!access) return;
  const objectRow = await resolveObjectForAccess(access, selector);
  if (!objectRow) return;
  const allowed = mode === "read" ? hasAccess(access.read, objectRow) : hasAccess(access.write, objectRow);
  if (!allowed) {
    throw new Error(
      `Agent scope blocks ${mode} access to object "${objectRow.slug || objectRow.name || objectRow.id}". Update knowledge scope before retrying.`,
    );
  }
}

async function enforceRecordScope(
  ctx: { workspaceSlug: string; agentId?: string | null },
  recordId: string,
  mode: "read" | "write",
) {
  const access = await loadAgentKnowledgeAccess(ctx);
  if (!access) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { data: recordRow, error: recordError } = await supabase
    .from("records")
    .select("id, object_id")
    .eq("workspace_id", access.workspaceId)
    .eq("id", recordId)
    .maybeSingle();
  if (recordError || !recordRow?.object_id) return;
  const { data: objectRow, error: objectError } = await supabase
    .from("workspace_objects")
    .select("id, slug, name")
    .eq("workspace_id", access.workspaceId)
    .eq("id", String(recordRow.object_id))
    .maybeSingle();
  if (objectError || !objectRow) return;
  const normalizedObject = {
    id: String(objectRow.id),
    slug: String(objectRow.slug ?? ""),
    name: String(objectRow.name ?? ""),
  } satisfies ObjectAccessRow;
  const allowed = mode === "read" ? hasAccess(access.read, normalizedObject) : hasAccess(access.write, normalizedObject);
  if (!allowed) {
    throw new Error(
      `Agent scope blocks ${mode} access to record ${recordId} (${normalizedObject.slug || normalizedObject.name}).`,
    );
  }
}

function required(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`Missing required string \`${key}\`.`);
  }
  return v.trim();
}

function normalizeFieldKey(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fieldAliasCandidates(value: string) {
  const normalized = normalizeFieldKey(value);
  const aliases: Record<string, string[]> = {
    precio: ["price", "precio", "cost", "amount", "monto", "importe"],
    price: ["price", "precio", "cost", "amount", "monto", "importe"],
    estado: ["status", "estado", "estatus"],
    estatus: ["status", "estado", "estatus"],
    status: ["status", "estado", "estatus"],
  };
  return new Set([normalized, ...(aliases[normalized] ?? [])]);
}

async function normalizeRecordPatchKeys(
  ctx: { workspaceSlug: string },
  recordId: string,
  patch: Record<string, unknown>,
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return patch;
  const workspaceId = await resolveWorkspaceId(ctx);
  if (!workspaceId) return patch;
  const { data: recordRow } = await supabase
    .from("records")
    .select("object_id")
    .eq("workspace_id", workspaceId)
    .eq("id", recordId)
    .maybeSingle();
  if (!recordRow?.object_id) return patch;
  const { data: fields } = await supabase
    .from("workspace_fields")
    .select("key, name")
    .eq("workspace_id", workspaceId)
    .eq("object_id", String(recordRow.object_id));
  if (!fields || fields.length === 0) return patch;

  const fieldMap = new Map<string, string>();
  for (const field of fields as Array<{ key?: unknown; name?: unknown }>) {
    const key = typeof field.key === "string" ? field.key : "";
    if (!key) continue;
    fieldMap.set(normalizeFieldKey(key), key);
    if (typeof field.name === "string") fieldMap.set(normalizeFieldKey(field.name), key);
  }

  const normalizedPatch: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(patch)) {
    const candidates = fieldAliasCandidates(rawKey);
    const resolvedKey = Array.from(candidates)
      .map((candidate) => fieldMap.get(candidate))
      .find((candidate): candidate is string => Boolean(candidate));
    normalizedPatch[resolvedKey ?? rawKey] = value;
  }
  return normalizedPatch;
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
    await enforceObjectScope(ctx, args, "read");
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
    await enforceRecordScope(ctx, recordId, "read");
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
    await enforceObjectScope(ctx, args, "write");
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
    await enforceRecordScope(ctx, recordId, "write");
    const patchData = await normalizeRecordPatchKeys(
      ctx,
      recordId,
      ((args.data as Record<string, unknown>) ?? {}) as Record<string, unknown>,
    );
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
        diff: [{ id: recordId, before, after: { ...before, ...patchData } }],
        targets: [recordId],
        count: 1,
        ...(sourceDocumentId ? { sourceDocumentId } : {}),
      };
      const token = signProposal(proposal);
      return { ok: true, data: { proposal, confirmToken: token.token, expiresAt: token.expiresAt, dryRun: true } };
    }
    const payloadData = sourceDocumentId
      ? appendDocumentProvenance(
          patchData,
          sourceDocumentId,
          "records.update",
        )
      : patchData;
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
    await enforceRecordScope(ctx, recordId, "write");
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
/* Spreadsheet imports                                                         */
/* -------------------------------------------------------------------------- */

const VEHICLE_IMPORT_FIELD_SPECS: Record<string, { label: string; type: string }> = {
  model: { label: "Model", type: "text" },
  year: { label: "Year", type: "number" },
  exterior_color: { label: "Exterior Color", type: "text" },
  trim: { label: "Trim", type: "text" },
  interior_color: { label: "Interior Color", type: "text" },
  quantity: { label: "Quantity", type: "number" },
  branch: { label: "Branch", type: "text" },
  source_file: { label: "Source File", type: "text" },
};

function normalizeImportHeader(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function guessVehicleImportMapping(headers: string[]) {
  const aliases: Record<string, string[]> = {
    model: ["tipo_de_vehiculo", "tipo_vehiculo", "modelo", "model", "vehicle_type"],
    year: ["ano_modelo", "anio_modelo", "year", "model_year"],
    exterior_color: ["color", "color_exterior", "exterior_color", "paint"],
    trim: ["version", "version_trim", "submodelo", "trim", "edition"],
    interior_color: ["color_interior", "interior_color", "interior"],
    quantity: ["uds_existencia", "unidades", "existencia", "cantidad", "quantity"],
    branch: ["sucursal", "branch", "location", "ubicacion"],
  };
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const normalized = normalizeImportHeader(header);
    for (const [fieldKey, candidates] of Object.entries(aliases)) {
      if (candidates.some((candidate) => normalized === candidate || normalized.endsWith(`_${candidate}`))) {
        mapping[header] = fieldKey;
        break;
      }
    }
  }
  return mapping;
}

function normalizeVehicleImportValue(fieldKey: string, value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim().length === 0) return null;
  if (fieldKey === "year" || fieldKey === "quantity") {
    const numeric = typeof value === "number" ? value : Number(String(value).replace(/[,\s]/g, ""));
    return Number.isFinite(numeric) ? numeric : value;
  }
  return typeof value === "string" ? value.trim() : value;
}

function stableInventoryImportKey(row: Record<string, unknown>) {
  return [row.model, row.year, row.exterior_color, row.trim, row.interior_color]
    .map((entry) => normalizeImportHeader(String(entry ?? "")))
    .filter(Boolean)
    .join("__");
}

registerTool({
  name: "records.import_attachment",
  description:
    "Parse an uploaded CSV/XLSX document and import it into an existing workspace object. For automotive inventory sheets, prefer the existing Vehicles object and map dealership columns like Tipo de Vehiculo, Año Modelo, Color, Version, Color Interior, and Uds Existencia. Defaults to dryRun:true and returns a confirmation proposal.",
  args: {
    documentRecordId: { type: "string", required: true },
    objectId: { type: "string" },
    objectName: { type: "string" },
    mapping: { type: "object", description: "Column header -> destination field key." },
    mode: { type: "string", description: "skip|update|upsert. Default upsert." },
    dedupeFieldKey: { type: "string" },
    dryRun: { type: "boolean" },
    confirmToken: { type: "string" },
  },
  handler: async (args, ctx): Promise<ToolResult> => {
    const docId = required(args, "documentRecordId");
    const dryRun = args.dryRun !== false;
    const mode =
      typeof args.mode === "string" && ["skip", "update", "upsert"].includes(args.mode)
        ? args.mode
        : "upsert";
    const supabase = getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin client not configured.", status: 500 };

    const { data: documentRecord } = await supabase
      .from("records")
      .select("id, workspace_id, data")
      .eq("id", docId)
      .maybeSingle();
    if (!documentRecord) return { ok: false, error: "Document record not found.", status: 404 };

    const documentData = (documentRecord.data as Record<string, unknown>) ?? {};
    const storagePath = typeof documentData.storage_path === "string" ? documentData.storage_path : null;
    const fileName = typeof documentData.document_name === "string" ? documentData.document_name : "inventory.csv";
    const mimeType = typeof documentData.mime_type === "string" ? documentData.mime_type : "";
    if (!storagePath) return { ok: false, error: "Document has no storage_path.", status: 400 };

    const bucketMod = await import("@/lib/supabaseAdmin");
    const { data: downloaded, error: downloadError } = await supabase.storage
      .from(bucketMod.getAssetBucketName())
      .download(storagePath);
    if (downloadError || !downloaded) {
      return { ok: false, error: downloadError?.message ?? "Unable to download file.", status: 500 };
    }

    const parser = await import("@/lib/spreadsheetParser");
    const buffer = await downloaded.arrayBuffer();
    const { headers, rows } = parser.extractAllRowsFromBuffer(buffer, fileName, mimeType);
    if (headers.length === 0 || rows.length === 0) {
      return { ok: false, error: "Could not detect inventory rows in the document.", status: 400 };
    }

    let objectId = typeof args.objectId === "string" && args.objectId.trim() ? args.objectId.trim() : null;
    if (!objectId) {
      const objectName =
        typeof args.objectName === "string" && args.objectName.trim() ? args.objectName.trim() : "Vehicles";
      const { data: objectRows } = await supabase
        .from("workspace_objects")
        .select("id, name")
        .eq("workspace_id", String(documentRecord.workspace_id))
        .ilike("name", `%${objectName}%`)
        .order("created_at", { ascending: true })
        .limit(1);
      objectId = objectRows?.[0]?.id ? String(objectRows[0].id) : null;
      if (!objectId && objectName !== "Vehicles") {
        const { data: vehicleRows } = await supabase
          .from("workspace_objects")
          .select("id, name")
          .eq("workspace_id", String(documentRecord.workspace_id))
          .or("name.ilike.%vehicle%,name.ilike.%vehiculo%,name.ilike.%inventario%")
          .order("created_at", { ascending: true })
          .limit(1);
        objectId = vehicleRows?.[0]?.id ? String(vehicleRows[0].id) : null;
      }
    }
    if (!objectId) return { ok: false, error: "No matching Vehicles object found.", status: 404 };
    await enforceObjectScope(ctx, { objectId }, "write");

    const suppliedMapping =
      args.mapping && typeof args.mapping === "object" && !Array.isArray(args.mapping)
        ? (args.mapping as Record<string, string>)
        : {};
    const mapping = { ...guessVehicleImportMapping(headers), ...suppliedMapping };
    const mappedRows = rows
      .map((row) => {
        const out: Record<string, unknown> = {};
        for (const header of headers) {
          const target = mapping[header];
          if (!target) continue;
          const normalizedValue = normalizeVehicleImportValue(target, (row as Record<string, unknown>)[header]);
          if (normalizedValue === null) continue;
          out[target] = normalizedValue;
        }
        out.source_file = fileName;
        const importKey = stableInventoryImportKey(out);
        if (importKey) out.inventory_import_key = importKey;
        return out;
      })
      .filter((row) => Object.keys(row).some((key) => key !== "source_file"));

    const fieldKeys = Array.from(new Set(mappedRows.flatMap((row) => Object.keys(row))));
    const { data: currentFields } = await supabase
      .from("workspace_fields")
      .select("key")
      .eq("workspace_id", String(documentRecord.workspace_id))
      .eq("object_id", objectId);
    const existingFieldKeys = new Set((currentFields ?? []).map((field) => String(field.key)));
    const missingFieldKeys = fieldKeys.filter(
      (key) => key !== "inventory_import_key" && !existingFieldKeys.has(key),
    );

    const proposal = {
      action: "records.import_attachment",
      objectId,
      documentRecordId: docId,
      summary: `Import ${mappedRows.length} vehicle inventory rows from ${fileName} into Vehicles (${mode}).`,
      count: mappedRows.length,
      targets: [objectId],
      mapping,
      mode,
      dedupeFieldKey: args.dedupeFieldKey ?? "inventory_import_key",
      missingFields: missingFieldKeys.map((key) => ({
        key,
        label: VEHICLE_IMPORT_FIELD_SPECS[key]?.label ?? key.replace(/_/g, " "),
        type: VEHICLE_IMPORT_FIELD_SPECS[key]?.type ?? "text",
      })),
      diff: mappedRows.slice(0, 8).map((row, index) => ({ id: `row-${index + 1}`, before: null, after: row })),
    };

    if (dryRun) {
      const token = signProposal(proposal);
      return {
        ok: true,
        data: { proposal, confirmToken: token.token, expiresAt: token.expiresAt, dryRun: true },
      };
    }

    const verified = verifyProposal(args.confirmToken, proposal);
    if (!verified.ok) {
      return { ok: false, error: `Confirmation token rejected: ${verified.reason}`, status: 403 };
    }

    if (missingFieldKeys.length > 0) {
      const { data: maxField } = await supabase
        .from("workspace_fields")
        .select("sort_order")
        .eq("workspace_id", String(documentRecord.workspace_id))
        .eq("object_id", objectId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      let nextSort = typeof maxField?.sort_order === "number" ? maxField.sort_order + 10 : 100;
      const inserts = missingFieldKeys.map((key) => {
        const spec = VEHICLE_IMPORT_FIELD_SPECS[key] ?? { label: key.replace(/_/g, " "), type: "text" };
        const row = {
          workspace_id: String(documentRecord.workspace_id),
          object_id: objectId,
          name: spec.label,
          key,
          type: spec.type,
          required: false,
          options: {},
          sort_order: nextSort,
        };
        nextSort += 10;
        return row;
      });
      const { error: fieldError } = await supabase.from("workspace_fields").insert(inserts);
      if (fieldError) return { ok: false, error: fieldError.message, status: 500 };
    }

    const dedupeFieldKey =
      typeof args.dedupeFieldKey === "string" && args.dedupeFieldKey.trim()
        ? args.dedupeFieldKey.trim()
        : "inventory_import_key";
    const { data: existingRecords, error: existingError } = await supabase
      .from("records")
      .select("id, data")
      .eq("workspace_id", String(documentRecord.workspace_id))
      .eq("object_id", objectId)
      .is("deleted_at", null);
    if (existingError) return { ok: false, error: existingError.message, status: 500 };

    const normalizeDedupe = (value: unknown) => normalizeImportHeader(String(value ?? ""));
    const existingByKey = new Map<string, { id: string; data: Record<string, unknown> }>();
    for (const entry of existingRecords ?? []) {
      const data = ((entry.data as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      const key = normalizeDedupe(data[dedupeFieldKey]);
      if (key) existingByKey.set(key, { id: String(entry.id), data });
    }

    const toInsert: Array<{
      workspace_id: string;
      object_id: string;
      data: Record<string, unknown>;
    }> = [];
    const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];
    let skipped = 0;
    for (const row of mappedRows) {
      const key = normalizeDedupe(row[dedupeFieldKey]);
      const match = key ? existingByKey.get(key) ?? null : null;
      if (match) {
        if (mode === "skip") {
          skipped += 1;
          continue;
        }
        toUpdate.push({ id: match.id, data: { ...match.data, ...row } });
        continue;
      }
      if (mode === "update") {
        skipped += 1;
        continue;
      }
      toInsert.push({
        workspace_id: String(documentRecord.workspace_id),
        object_id: objectId,
        data: row,
      });
    }

    let inserted = 0;
    let updated = 0;
    if (toInsert.length > 0) {
      for (let index = 0; index < toInsert.length; index += 500) {
        const batch = toInsert.slice(index, index + 500);
        const { error } = await supabase.from("records").insert(batch);
        if (error) return { ok: false, error: error.message, status: 500 };
        inserted += batch.length;
      }
    }
    for (const update of toUpdate) {
      const { error } = await supabase
        .from("records")
        .update({ data: update.data, updated_at: new Date().toISOString() })
        .eq("id", update.id)
        .eq("workspace_id", String(documentRecord.workspace_id));
      if (error) return { ok: false, error: error.message, status: 500 };
      updated += 1;
    }

    await supabase.from("workspace_import_history").insert({
      workspace_id: String(documentRecord.workspace_id),
      object_id: objectId,
      file_name: fileName,
      total_rows: mappedRows.length,
      imported_rows: inserted,
      skipped_rows: skipped,
      error_rows: 0,
      summary: {
        mode,
        dedupeFieldKey,
        inserted,
        updated,
        skipped,
        source: "records.import_attachment",
      },
    });

    return {
      ok: true,
      data: {
        import: {
          mode,
          dedupeKey: dedupeFieldKey,
          rowsTotal: mappedRows.length,
          rowsImported: inserted,
          rowsUpdated: updated,
          rowsSkipped: skipped,
        },
        inserted,
        updated,
        skipped,
      },
    };
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
    await enforceObjectScope(ctx, args, "write");
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
    await enforceObjectScope(ctx, args, "write");
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/records/bulk`, {
      method: "POST",
      body: JSON.stringify({ ...args, action: "delete", dryRun: args.dryRun !== false }),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status, details: res.data };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});
