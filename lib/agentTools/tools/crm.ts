import { registerTool, type ToolResult } from "../registry";
import { fetchInternalJson } from "../executor";
import { signProposal, verifyProposal } from "../confirmToken";
import { appendDocumentProvenance } from "@/lib/documents/provenance";

const slug = (ctx: { workspaceSlug: string }) => encodeURIComponent(ctx.workspaceSlug);

/**
 * Thread an optional `sourceDocumentId` into the `data` field of a CRM
 * upsert/update payload so the provenance is appended server-side when the
 * record merges its data JSONB. Returns a shallow copy with sourceDocumentId
 * stripped from the top level (endpoints don't know that arg).
 */
function attachProvenance(
  args: Record<string, unknown>,
  action: string,
): Record<string, unknown> {
  const sourceDocumentId =
    typeof args.sourceDocumentId === "string" && args.sourceDocumentId.trim().length > 0
      ? args.sourceDocumentId.trim()
      : null;
  const { sourceDocumentId: _omit, ...rest } = args;
  void _omit;
  if (!sourceDocumentId) {
    return rest;
  }
  const existingData =
    rest.data && typeof rest.data === "object" && !Array.isArray(rest.data)
      ? (rest.data as Record<string, unknown>)
      : {};
  const nextData = appendDocumentProvenance(existingData, sourceDocumentId, action);
  return { ...rest, data: nextData };
}

function required(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`Missing required string \`${key}\`.`);
  }
  return v.trim();
}

/** Wrap a destructive CRM tool with dryRun+confirmToken semantics. */
function confirmGate(
  action: string,
  args: Record<string, unknown>,
  summary: string,
): ToolResult | null {
  const dryRun = args.dryRun !== false;
  const proposal = { action, targets: [args.recordId], summary, count: 1, diff: [{ id: args.recordId }] };
  if (dryRun) {
    const token = signProposal(proposal);
    return { ok: true, data: { proposal, confirmToken: token.token, expiresAt: token.expiresAt, dryRun: true } };
  }
  const verification = verifyProposal(args.confirmToken, proposal);
  if (!verification.ok) {
    return {
      ok: false,
      error: `Confirmation token invalid (${verification.reason}). Re-run with dryRun:true to get a fresh token.`,
      status: 409,
    };
  }
  return null;
}

// ---------- Person ----------
registerTool({
  name: "crm.create_person",
  description: "Create or upsert a CRM person. Dedupes by email + phone.",
  args: {
    fullName: { type: "string", description: "Full name" },
    email: { type: "string", description: "Email (used for dedupe)" },
    phone: { type: "string", description: "Phone (used for dedupe)" },
    stage: { type: "string", description: "Stage (lead|qualified|opportunity|customer|unqualified)" },
    source: { type: "string" },
    ownerUserId: { type: "string" },
    companyId: { type: "string", description: "Linked company record id" },
    data: { type: "object", description: "Additional field values" },
    sourceDocumentId: {
      type: "string",
      description: "Optional recordId of an attached document (e.g. PDF) that motivated this change.",
    },
  },
  handler: async (args, ctx) => {
    const payload = attachProvenance(args, "crm.create_person");
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/crm/people`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "crm.update_person",
  description: "Update a CRM person by record id. Useful for stage change, owner reassignment, etc.",
  args: {
    recordId: { type: "string", required: true },
    fullName: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    stage: { type: "string" },
    source: { type: "string" },
    ownerUserId: { type: "string" },
    companyId: { type: "string" },
    score: { type: "number" },
    data: { type: "object" },
    sourceDocumentId: {
      type: "string",
      description: "Optional recordId of an attached document (e.g. PDF) that motivated this update.",
    },
  },
  handler: async (args, ctx) => {
    const recordId = required(args, "recordId");
    const tagged = attachProvenance(args, "crm.update_person");
    const { recordId: _omit, ...rest } = tagged;
    void _omit;
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/crm/people/${encodeURIComponent(recordId)}`, {
      method: "PATCH",
      body: JSON.stringify(rest),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "crm.delete_person",
  description:
    "Soft-delete a CRM person record. Defaults to dryRun:true — returns a proposal. Re-issue with dryRun:false and confirmToken to commit.",
  args: {
    recordId: { type: "string", required: true },
    dryRun: { type: "boolean" },
    confirmToken: { type: "string" },
  },
  handler: async (args, ctx) => {
    const recordId = required(args, "recordId");
    const gate = confirmGate("crm.delete_person", { ...args, recordId }, `Delete CRM person ${recordId}.`);
    if (gate) return gate;
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/records/${encodeURIComponent(recordId)}`, {
      method: "DELETE",
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: { recordId } };
  },
});

// ---------- Company ----------
registerTool({
  name: "crm.create_company",
  description: "Create or upsert a CRM company. Dedupes by domain + name.",
  args: {
    name: { type: "string" },
    domain: { type: "string" },
    industry: { type: "string" },
    size: { type: "string" },
    ownerUserId: { type: "string" },
    data: { type: "object" },
    sourceDocumentId: {
      type: "string",
      description: "Optional recordId of an attached document (e.g. PDF) that motivated this change.",
    },
  },
  handler: async (args, ctx) => {
    const payload = attachProvenance(args, "crm.create_company");
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/crm/companies`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "crm.update_company",
  description: "Update a CRM company by record id.",
  args: {
    recordId: { type: "string", required: true },
    name: { type: "string" },
    domain: { type: "string" },
    industry: { type: "string" },
    size: { type: "string" },
    ownerUserId: { type: "string" },
    data: { type: "object" },
    sourceDocumentId: {
      type: "string",
      description: "Optional recordId of an attached document (e.g. PDF) that motivated this update.",
    },
  },
  handler: async (args, ctx) => {
    const recordId = required(args, "recordId");
    const tagged = attachProvenance(args, "crm.update_company");
    const { recordId: _omit, ...rest } = tagged;
    void _omit;
    const res = await fetchInternalJson(
      ctx,
      `/api/workspaces/${slug(ctx)}/crm/companies/${encodeURIComponent(recordId)}`,
      { method: "PATCH", body: JSON.stringify(rest) },
    );
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "crm.delete_company",
  description:
    "Soft-delete a CRM company record. Defaults to dryRun:true. Re-issue with dryRun:false and confirmToken to commit.",
  args: {
    recordId: { type: "string", required: true },
    dryRun: { type: "boolean" },
    confirmToken: { type: "string" },
  },
  handler: async (args, ctx) => {
    const recordId = required(args, "recordId");
    const gate = confirmGate("crm.delete_company", { ...args, recordId }, `Delete CRM company ${recordId}.`);
    if (gate) return gate;
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/records/${encodeURIComponent(recordId)}`, {
      method: "DELETE",
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: { recordId } };
  },
});

// ---------- Deal ----------
registerTool({
  name: "crm.create_deal",
  description: "Create a CRM deal.",
  args: {
    title: { type: "string" },
    name: { type: "string" },
    amount: { type: "number" },
    currency: { type: "string" },
    stageId: { type: "string" },
    ownerUserId: { type: "string" },
    primaryContactId: { type: "string" },
    companyId: { type: "string" },
    closeDate: { type: "string" },
    data: { type: "object" },
    sourceDocumentId: {
      type: "string",
      description: "Optional recordId of an attached document (e.g. PDF) that motivated this change.",
    },
  },
  handler: async (args, ctx) => {
    const payload = attachProvenance(args, "crm.create_deal");
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/crm/deals`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "crm.update_deal",
  description: "Update a CRM deal (arbitrary fields).",
  args: {
    recordId: { type: "string", required: true },
    stageId: { type: "string" },
    data: { type: "object" },
    sourceDocumentId: {
      type: "string",
      description: "Optional recordId of an attached document (e.g. PDF) that motivated this update.",
    },
  },
  handler: async (args, ctx) => {
    const recordId = required(args, "recordId");
    const tagged = attachProvenance(args, "crm.update_deal");
    const { recordId: _omit, ...rest } = tagged;
    void _omit;
    const res = await fetchInternalJson(
      ctx,
      `/api/workspaces/${slug(ctx)}/crm/deals/${encodeURIComponent(recordId)}`,
      { method: "PATCH", body: JSON.stringify(rest) },
    );
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "crm.change_stage",
  description: "Move a deal to a different pipeline stage.",
  args: {
    recordId: { type: "string", required: true },
    stageId: { type: "string", required: true },
  },
  handler: async (args, ctx) => {
    const recordId = required(args, "recordId");
    const stageId = required(args, "stageId");
    const res = await fetchInternalJson(
      ctx,
      `/api/workspaces/${slug(ctx)}/crm/deals/${encodeURIComponent(recordId)}`,
      { method: "PATCH", body: JSON.stringify({ stageId }) },
    );
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "crm.delete_deal",
  description:
    "Soft-delete a CRM deal. Defaults to dryRun:true. Re-issue with dryRun:false and confirmToken to commit.",
  args: {
    recordId: { type: "string", required: true },
    dryRun: { type: "boolean" },
    confirmToken: { type: "string" },
  },
  handler: async (args, ctx) => {
    const recordId = required(args, "recordId");
    const gate = confirmGate("crm.delete_deal", { ...args, recordId }, `Delete CRM deal ${recordId}.`);
    if (gate) return gate;
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/records/${encodeURIComponent(recordId)}`, {
      method: "DELETE",
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: { recordId } };
  },
});

// ---------- Query / read ----------
registerTool({
  name: "crm.query",
  description: "Read CRM records with filter DSL, search, pagination, and projection.",
  args: {
    kind: { type: "string", description: "crm_people | crm_companies | crm_deals" },
    objectId: { type: "string" },
    filter: { type: "object", description: "Filter DSL: { logical, rules: [...] }" },
    search: { type: "string" },
    projection: { type: "array" },
    sort: { type: "array" },
    limit: { type: "number" },
    offset: { type: "number" },
  },
  handler: async (args, ctx) => {
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/crm/query`, {
      method: "POST",
      body: JSON.stringify(args),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

// ---------- Bulk / assign / sequences ----------
registerTool({
  name: "crm.assign_owner",
  description: "Assign an owner (user id) to one or more CRM records.",
  args: {
    objectId: { type: "string", required: true },
    recordIds: { type: "array", required: true },
    ownerUserId: { type: "string", required: true },
  },
  handler: async (args, ctx) => {
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/crm/bulk`, {
      method: "POST",
      body: JSON.stringify({
        action: "change-owner",
        objectId: args.objectId,
        recordIds: args.recordIds,
        ownerUserId: args.ownerUserId,
      }),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "crm.enroll_in_sequence",
  description: "Enroll a CRM record in a sequence.",
  args: {
    sequenceId: { type: "string", required: true },
    recordIds: { type: "array", required: true },
  },
  handler: async (args, ctx) => {
    const sequenceId = required(args, "sequenceId");
    const res = await fetchInternalJson(
      ctx,
      `/api/workspaces/${slug(ctx)}/sequences/${encodeURIComponent(sequenceId)}/enrollments`,
      { method: "POST", body: JSON.stringify({ recordIds: args.recordIds }) },
    );
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

// ---------- Save view (agent-driven table customization) ----------
registerTool({
  name: "crm.save_view",
  description:
    "Create or update a saved smart view for a CRM entity, including column layout, sort, and filter.",
  args: {
    viewId: { type: "string", description: "Omit to create a new view" },
    name: { type: "string", required: true },
    objectId: { type: "string", required: true },
    scope: { type: "string", description: "private|workspace" },
    filter: { type: "object" },
    sort: { type: "array" },
    columnConfig: { type: "object" },
    viewMode: { type: "string", description: "table|board|kpi" },
    isPinned: { type: "boolean" },
  },
  handler: async (args, ctx) => {
    const viewId = typeof args.viewId === "string" ? args.viewId : null;
    const path = viewId
      ? `/api/workspaces/${slug(ctx)}/views/${encodeURIComponent(viewId)}`
      : `/api/workspaces/${slug(ctx)}/views`;
    const method = viewId ? "PATCH" : "POST";
    const { viewId: _omit, ...rest } = args;
    const res = await fetchInternalJson(ctx, path, { method, body: JSON.stringify(rest) });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

// ---------- Activities / tasks ----------
registerTool({
  name: "crm.add_activity",
  description: "Add an activity (note/call/meeting/email) to a record.",
  args: {
    recordId: { type: "string", required: true },
    type: { type: "string", required: true },
    subject: { type: "string" },
    body: { type: "string" },
    data: { type: "object" },
  },
  handler: async (args, ctx) => {
    const recordId = required(args, "recordId");
    const res = await fetchInternalJson(
      ctx,
      `/api/workspaces/${slug(ctx)}/records/${encodeURIComponent(recordId)}/activities`,
      { method: "POST", body: JSON.stringify(args) },
    );
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "crm.add_task",
  description: "Create a task tied to a record.",
  args: {
    title: { type: "string", required: true },
    recordId: { type: "string" },
    dueAt: { type: "string" },
    assigneeUserId: { type: "string" },
    data: { type: "object" },
  },
  handler: async (args, ctx) => {
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/tasks`, {
      method: "POST",
      body: JSON.stringify(args),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

registerTool({
  name: "crm.complete_task",
  description: "Mark a task as completed.",
  args: { taskId: { type: "string", required: true } },
  handler: async (args, ctx) => {
    const taskId = required(args, "taskId");
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Failed", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});

// ---------- Imports (Excel/CSV from chat) ----------
registerTool({
  name: "crm.import_attachment",
  description:
    "Parse a document record (XLSX/CSV) and import rows as CRM records. If `dryRun` is true, returns a proposed column mapping + preview (no writes). Otherwise inserts rows via the imports API.",
  args: {
    documentRecordId: { type: "string", required: true },
    kind: { type: "string", description: "crm_people | crm_companies | crm_deals" },
    objectId: { type: "string" },
    mapping: { type: "object", description: "Column->field key map. If omitted, guessed heuristically." },
    dedupeFieldKey: { type: "string", description: "Field key used to dedupe. Defaults: email (people) / domain (companies)." },
    dryRun: { type: "boolean" },
    mode: { type: "string", description: "skip|update|upsert (default upsert)" },
  },
  handler: async (args, ctx) => {
    const docId = required(args, "documentRecordId");
    const kind =
      typeof args.kind === "string" ? (args.kind as "crm_people" | "crm_companies" | "crm_deals") : null;
    const mode = typeof args.mode === "string" ? args.mode : "upsert";
    const dryRun = args.dryRun === true;

    // 1. Load and parse the document with full rows (direct Supabase access).
    const mod = await import("@/lib/supabaseAdmin");
    const supabase = mod.getSupabaseAdmin();
    if (!supabase) {
      return { ok: false, error: "Supabase admin client not configured.", status: 500 };
    }
    const { data: record } = await supabase
      .from("records")
      .select("id, workspace_id, data")
      .eq("id", docId)
      .maybeSingle();
    if (!record) {
      return { ok: false, error: "Document record not found.", status: 404 };
    }
    const data = (record.data as Record<string, unknown>) ?? {};
    const storagePath = typeof data.storage_path === "string" ? data.storage_path : null;
    const fileName = typeof data.document_name === "string" ? data.document_name : "document.xlsx";
    const mimeType = typeof data.mime_type === "string" ? data.mime_type : "";
    if (!storagePath) {
      return { ok: false, error: "Document has no storage_path.", status: 400 };
    }
    const bucket = mod.getAssetBucketName();
    const { data: downloaded, error: dlError } = await supabase.storage.from(bucket).download(storagePath);
    if (dlError || !downloaded) {
      return { ok: false, error: dlError?.message ?? "Unable to download file.", status: 500 };
    }
    const parser = await import("@/lib/spreadsheetParser");
    const buffer = await downloaded.arrayBuffer();
    const { headers, rows } = parser.extractAllRowsFromBuffer(buffer, fileName, mimeType);
    if (headers.length === 0) {
      return { ok: false, error: "Could not detect columns in the document.", status: 400 };
    }

    // 2. Build a mapping proposal: column header -> field key.
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const KNOWN_KEYS: Record<string, string[]> = {
      email: ["email", "e_mail", "correo", "mail"],
      phone: ["phone", "telefono", "telefono_celular", "tel", "movil"],
      full_name: ["name", "full_name", "nombre", "nombre_completo", "contacto"],
      name: ["name", "nombre", "empresa", "company", "company_name"],
      domain: ["domain", "website", "sitio", "web", "url"],
      industry: ["industry", "industria", "sector"],
      size: ["size", "tamano", "empleados"],
      stage: ["stage", "etapa", "status"],
      source: ["source", "origen", "fuente"],
      title: ["title", "titulo", "deal_name"],
      amount: ["amount", "monto", "value", "importe", "total"],
      currency: ["currency", "moneda"],
      close_date: ["close_date", "cierre", "fecha_cierre", "closing_date"],
    };
    const mapping: Record<string, string> = (args.mapping as Record<string, string> | undefined) ?? {};
    for (const header of headers) {
      if (mapping[header]) continue;
      const n = normalize(header);
      for (const [key, aliases] of Object.entries(KNOWN_KEYS)) {
        if (aliases.some((alias) => n === alias || n.includes(alias))) {
          mapping[header] = key;
          break;
        }
      }
    }

    const dedupeFieldKey =
      typeof args.dedupeFieldKey === "string"
        ? args.dedupeFieldKey
        : kind === "crm_people"
          ? "email"
          : kind === "crm_companies"
            ? "domain"
            : null;

    const mappedRows = rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const header of headers) {
        const target = mapping[header] ?? header;
        const value = row[header];
        if (value === "" || value === null || value === undefined) continue;
        out[target] = value;
      }
      return out;
    });

    if (dryRun) {
      return {
        ok: true,
        data: {
          proposal: {
            kind,
            objectId: args.objectId ?? null,
            headers,
            mapping,
            dedupeFieldKey,
            totalRows: mappedRows.length,
            preview: mappedRows.slice(0, 5),
          },
        },
      };
    }

    // 3. Resolve objectId if missing.
    let objectId = typeof args.objectId === "string" ? args.objectId : null;
    if (!objectId && kind) {
      const { data: obj } = await supabase
        .from("workspace_objects")
        .select("id")
        .eq("workspace_id", String(record.workspace_id))
        .eq("kind", kind)
        .maybeSingle();
      objectId = obj ? String(obj.id) : null;
    }
    if (!objectId) {
      return { ok: false, error: "Missing `objectId` or `kind`.", status: 400 };
    }

    // 4. Submit to imports API.
    const res = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/imports`, {
      method: "POST",
      body: JSON.stringify({
        objectId,
        rows: mappedRows,
        dedupeFieldKey,
        mode,
        fileName,
      }),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Import failed.", status: res.status };
    return { ok: true, data: res.data as Record<string, unknown> };
  },
});
