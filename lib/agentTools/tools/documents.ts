/**
 * Document analysis tools:
 *   documents.analyze -> extract text from an uploaded document record (PDF, spreadsheet,
 *                        text). Returns the text plus spreadsheet preview if present.
 *
 * The model gets one or more `attachmentRefs` (document recordIds) via the chat route's
 * appContext / prompt; it should call documents.analyze with that recordId to actually
 * read the contents instead of trying to use a vision-only tool against a PDF URL.
 */

import * as XLSX from "xlsx";
import { extractPdfText } from "@/lib/documents/pdfExtract";
import { hermesStructured } from "@/lib/extraction/structuredField";
import { parseFieldOptionValues } from "@/lib/fieldPropertyBuilder";
import { fetchInternalJson } from "../executor";
import { registerTool, type ToolContext, type ToolResult } from "../registry";

async function resolveWorkspaceId(ctx: ToolContext): Promise<string | null> {
  const mod = await import("@/lib/supabaseAdmin");
  const supabase = mod.getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("subdomain", ctx.workspaceSlug)
    .maybeSingle();
  return data ? String(data.id) : null;
}

type AnalyzeArgs = {
  recordId?: string;
  documentRecordId?: string;
  maxChars?: number;
};

type ExtractCollectionArgs = {
  recordId?: string;
  documentRecordId?: string;
  parentRecordId?: string;
  collectionFieldId?: string;
  maxItems?: number;
  dryRun?: boolean;
  confirmToken?: string;
};

type ExtractFieldArgs = {
  recordId?: string;
  documentRecordId?: string;
  targetRecordId?: string;
  fieldId?: string;
  dryRun?: boolean;
  confirmToken?: string;
};

const DEFAULT_MAX_CHARS = 24_000;
const HARD_MAX_CHARS = 120_000;

type AnalyzedDocumentData = {
  recordId: string;
  documentName: string;
  kind: string;
  mimeType: string;
  publicUrl: string;
  text?: string;
  pageCount?: number;
  textLength?: number;
  truncated?: boolean;
  ocrUsed?: boolean;
  ocrError?: string | null;
  parseError?: string | null;
  sheets?: Array<{
    name: string;
    headers: string[];
    sampleRows: Record<string, unknown>[];
    rowCount: number;
  }>;
};

async function getSupabaseForWorkspace(ctx: ToolContext) {
  const workspaceId = await resolveWorkspaceId(ctx);
  if (!workspaceId) {
    return { workspaceId: null, supabase: null };
  }
  const supabaseMod = await import("@/lib/supabaseAdmin");
  return {
    workspaceId,
    supabase: supabaseMod.getSupabaseAdmin(),
  };
}

async function analyzeDocumentRecord(
  ctx: ToolContext,
  recordId: string,
  maxChars = HARD_MAX_CHARS,
): Promise<ToolResult<AnalyzedDocumentData>> {
  const workspace = await getSupabaseForWorkspace(ctx);
  if (!workspace.workspaceId || !workspace.supabase) {
    return { ok: false, error: "Workspace not found.", status: 404 };
  }

  const supabase = workspace.supabase;
  const { data: recordRow, error: recordError } = await supabase
    .from("records")
    .select("id, workspace_id, data")
    .eq("id", recordId)
    .eq("workspace_id", workspace.workspaceId)
    .maybeSingle();
  if (recordError) {
    return { ok: false, error: recordError.message, status: 500 };
  }
  if (!recordRow) {
    return { ok: false, error: "Document record not found.", status: 404 };
  }

  const data = ((recordRow.data as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const storagePath = typeof data.storage_path === "string" ? data.storage_path : null;
  const documentName = typeof data.document_name === "string" ? data.document_name : "";
  const mimeType = typeof data.mime_type === "string" ? data.mime_type : "";
  const kind = typeof data.kind === "string" ? data.kind : "other";
  const publicUrl = typeof data.public_url === "string" ? data.public_url : "";

  if (!storagePath) {
    return { ok: false, error: "This document has no stored file to analyze.", status: 400 };
  }

  const supabaseMod = await import("@/lib/supabaseAdmin");
  const bucket = supabaseMod.getAssetBucketName();
  const { data: downloaded, error: downloadError } = await supabase.storage.from(bucket).download(storagePath);
  if (downloadError || !downloaded) {
    return {
      ok: false,
      error: downloadError?.message ?? "Unable to download stored file.",
      status: 500,
    };
  }

  const buffer = await downloaded.arrayBuffer();
  const extension = documentName.toLowerCase().split(".").pop() ?? "";
  const isPdf = kind === "pdf" || mimeType === "application/pdf" || extension === "pdf";
  const isSpreadsheet =
    kind === "spreadsheet" ||
    mimeType.includes("spreadsheet") ||
    mimeType === "text/csv" ||
    extension === "xlsx" ||
    extension === "xls" ||
    extension === "csv";
  const isTextLike =
    mimeType.startsWith("text/") || extension === "txt" || extension === "md" || extension === "json";

  try {
    if (isPdf) {
      const extraction = await extractPdfText(Buffer.from(buffer), { maxChars });
      return {
        ok: true,
        data: {
          recordId,
          documentName,
          kind: "pdf",
          mimeType,
          publicUrl,
          pageCount: extraction.pageCount,
          textLength: extraction.textLength,
          truncated: extraction.truncated,
          ocrUsed: extraction.ocrUsed,
          ocrError: extraction.ocrError ?? null,
          parseError: extraction.parseError ?? null,
          text: extraction.text,
        },
      };
    }

    if (isSpreadsheet) {
      let sheets: Array<{
        name: string;
        headers: string[];
        sampleRows: Record<string, unknown>[];
        rowCount: number;
      }> = [];
      if (extension === "csv" || mimeType === "text/csv") {
        const raw = new TextDecoder("utf-8").decode(buffer);
        const { parseCsvForPreview } = await import("@/lib/spreadsheetParser");
        const parsed = parseCsvForPreview(raw);
        sheets = [
          {
            name: "Sheet1",
            headers: parsed.headers,
            sampleRows: parsed.rows.slice(0, 200),
            rowCount: parsed.rowCount,
          },
        ];
      } else {
        const workbook = XLSX.read(buffer, { type: "array" });
        const { smartExtractSheet } = await import("@/lib/spreadsheetParser");
        sheets = workbook.SheetNames.map((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) return null;
          const { headers, rows } = smartExtractSheet(sheet);
          return {
            name: sheetName,
            headers,
            sampleRows: rows.slice(0, 200),
            rowCount: rows.length,
          };
        }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      }
      return {
        ok: true,
        data: {
          recordId,
          documentName,
          kind: "spreadsheet",
          mimeType,
          publicUrl,
          sheets,
        },
      };
    }

    if (isTextLike) {
      const raw = new TextDecoder("utf-8").decode(buffer);
      const truncated = raw.length > maxChars;
      return {
        ok: true,
        data: {
          recordId,
          documentName,
          kind: kind || "text",
          mimeType,
          publicUrl,
          textLength: raw.length,
          truncated,
          text: truncated ? raw.slice(0, maxChars) : raw,
        },
      };
    }

    return {
      ok: false,
      error: `documents.analyze does not yet support kind="${kind || "other"}" (mime=${mimeType}). Ask the user to re-upload as PDF, spreadsheet, or text.`,
      status: 415,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Document analysis failed.",
      status: 500,
    };
  }
}

registerTool({
  name: "documents.analyze",
  description:
    "Extract text from a previously uploaded document record (PDF, spreadsheet, plain text). Use this when the user asks you to read, summarize, or extract values from an attached file. Input: recordId of the document (provided in attachment lines). Returns extracted text plus spreadsheet preview when applicable. Prefer this over any vision/image tool for PDFs.",
  args: {
    recordId: {
      type: "string",
      required: true,
      description:
        "The document record id, as provided in the attachment lines of the prompt (e.g. 'recordId: <uuid>').",
    },
    maxChars: {
      type: "number",
      description:
        "Optional cap on characters returned (default 24000, max 120000). Use smaller values for large docs if you only need a summary slice.",
    },
  },
  handler: async (rawArgs, ctx): Promise<ToolResult<Record<string, unknown>>> => {
    const args = rawArgs as AnalyzeArgs;
    const recordId = String(args.recordId ?? args.documentRecordId ?? "").trim();
    if (!recordId) {
      return { ok: false, error: "`recordId` is required.", status: 400 };
    }

    const requestedMax = typeof args.maxChars === "number" ? args.maxChars : DEFAULT_MAX_CHARS;
    const maxChars = Math.max(500, Math.min(requestedMax, HARD_MAX_CHARS));
    return analyzeDocumentRecord(ctx, recordId, maxChars);
  },
});

registerTool({
  name: "documents.extract_collection",
  description:
    "Extract repeated child rows from one uploaded document into a child object configured by a collection field. Use this for invoice line items, lease tenants, or similar one-parent-many-children extraction. Returns a dry-run preview by default; reissue with dryRun:false to create the child records and provenance rows.",
  args: {
    recordId: { type: "string", required: true },
    parentRecordId: { type: "string", required: true },
    collectionFieldId: { type: "string", required: true },
    maxItems: { type: "number", description: "Optional cap on extracted rows (default 25)." },
    dryRun: { type: "boolean", description: "Defaults to true; set false to commit child records." },
    confirmToken: { type: "string", description: "Reserved for future confirm flow." },
  },
  handler: async (rawArgs, ctx): Promise<ToolResult<Record<string, unknown>>> => {
    const args = rawArgs as ExtractCollectionArgs;
    const recordId = String(args.recordId ?? args.documentRecordId ?? "").trim();
    const parentRecordId = String(args.parentRecordId ?? "").trim();
    const collectionFieldId = String(args.collectionFieldId ?? "").trim();
    const maxItems = Math.max(1, Math.min(Number(args.maxItems ?? 25), 100));
    const dryRun = args.dryRun !== false;

    if (!recordId || !parentRecordId || !collectionFieldId) {
      return {
        ok: false,
        error: "recordId, parentRecordId, and collectionFieldId are required.",
        status: 400,
      };
    }

    const analysis = await analyzeDocumentRecord(ctx, recordId, HARD_MAX_CHARS);
    if (!analysis.ok) return analysis;
    const document = analysis.data;
    const documentText =
      typeof document.text === "string" && document.text.trim().length > 0
        ? document.text.trim()
        : Array.isArray(document.sheets)
          ? JSON.stringify(document.sheets, null, 2)
          : "";
    if (!documentText) {
      return { ok: false, error: "Document contains no analyzable text for collection extraction.", status: 400 };
    }

    const workspace = await getSupabaseForWorkspace(ctx);
    if (!workspace.workspaceId || !workspace.supabase) {
      return { ok: false, error: "Workspace not found.", status: 404 };
    }

    const supabase = workspace.supabase;
    const { data: parentRow, error: parentError } = await supabase
      .from("records")
      .select("id, object_id, data")
      .eq("workspace_id", workspace.workspaceId)
      .eq("id", parentRecordId)
      .maybeSingle();
    if (parentError) return { ok: false, error: parentError.message, status: 500 };
    if (!parentRow) return { ok: false, error: "Parent record not found.", status: 404 };

    const { data: fieldRow, error: fieldError } = await supabase
      .from("workspace_fields")
      .select("id, name, key, type, object_id, options")
      .eq("workspace_id", workspace.workspaceId)
      .eq("id", collectionFieldId)
      .maybeSingle();
    if (fieldError) return { ok: false, error: fieldError.message, status: 500 };
    if (!fieldRow) return { ok: false, error: "Collection field not found.", status: 404 };
    if (String(fieldRow.type) !== "collection") {
      return { ok: false, error: "The selected field is not a collection field.", status: 400 };
    }
    if (String(fieldRow.object_id) !== String(parentRow.object_id)) {
      return { ok: false, error: "Collection field does not belong to the parent record object.", status: 400 };
    }

    const fieldOptions =
      fieldRow.options && typeof fieldRow.options === "object" && !Array.isArray(fieldRow.options)
        ? (fieldRow.options as Record<string, unknown>)
        : {};
    const childObjectId =
      typeof fieldOptions.child_object_id === "string" ? fieldOptions.child_object_id.trim() : "";
    const childFieldMap =
      fieldOptions.child_field_map &&
      typeof fieldOptions.child_field_map === "object" &&
      !Array.isArray(fieldOptions.child_field_map)
        ? (fieldOptions.child_field_map as Record<string, unknown>)
        : {};
    if (!childObjectId) {
      return { ok: false, error: "Collection field is missing options.child_object_id.", status: 400 };
    }

    const { data: childObjectRow, error: childObjectError } = await supabase
      .from("workspace_objects")
      .select("id, name, slug")
      .eq("workspace_id", workspace.workspaceId)
      .eq("id", childObjectId)
      .maybeSingle();
    if (childObjectError) return { ok: false, error: childObjectError.message, status: 500 };
    if (!childObjectRow) return { ok: false, error: "Child object not found.", status: 404 };

    const { data: childFields, error: childFieldsError } = await supabase
      .from("workspace_fields")
      .select("id, key, name, type, required, options")
      .eq("workspace_id", workspace.workspaceId)
      .eq("object_id", childObjectId)
      .order("sort_order", { ascending: true });
    if (childFieldsError) return { ok: false, error: childFieldsError.message, status: 500 };

    const mappedFieldEntries = Object.entries(childFieldMap)
      .map(([targetFieldKey, sourceLabel]) => ({
        targetFieldKey: String(targetFieldKey ?? "").trim(),
        sourceLabel: String(sourceLabel ?? "").trim(),
      }))
      .filter((entry) => entry.targetFieldKey.length > 0 && entry.sourceLabel.length > 0);
    if (mappedFieldEntries.length === 0) {
      return { ok: false, error: "Collection field is missing a usable child_field_map.", status: 400 };
    }

    const childSchemaProperties: Record<string, unknown> = {};
    const requiredKeys: string[] = [];
    for (const mapping of mappedFieldEntries) {
      const childField = (childFields ?? []).find((entry) => String(entry.key) === mapping.targetFieldKey);
      if (!childField) continue;
      const options =
        childField.options && typeof childField.options === "object" && !Array.isArray(childField.options)
          ? (childField.options as Record<string, unknown>)
          : {};
      let propertySchema: Record<string, unknown> = { type: "string" };
      if (childField.type === "number" || childField.type === "currency") {
        propertySchema = { type: "number" };
      } else if (childField.type === "boolean") {
        propertySchema = { type: "boolean" };
      } else if (childField.type === "select" || childField.type === "status") {
        const enumValues = Array.isArray(options.values)
          ? options.values.map((entry) => String(entry ?? "").trim()).filter(Boolean)
          : [];
        propertySchema = enumValues.length > 0 ? { type: "string", enum: enumValues } : { type: "string" };
      }
      childSchemaProperties[mapping.targetFieldKey] = {
        ...propertySchema,
        description: `${childField.name} <- ${mapping.sourceLabel}`,
      };
      if (childField.required) requiredKeys.push(mapping.targetFieldKey);
    }

    const extraction = await hermesStructured<{
      items: Array<
        Record<string, unknown> & {
          _provenance?: {
            quotedSpan?: string;
            pageNumber?: number | null;
            confidence?: number | null;
            bbox?: {
              x?: number | null;
              y?: number | null;
              width?: number | null;
              height?: number | null;
            } | null;
          };
        }
      >;
    }>({
      schemaName: "document_collection_extract",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          items: {
            type: "array",
            maxItems,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                ...childSchemaProperties,
                _provenance: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    quotedSpan: { type: "string" },
                    pageNumber: { type: ["number", "null"] },
                    confidence: { type: ["number", "null"] },
                    bbox: {
                      type: ["object", "null"],
                      additionalProperties: false,
                      properties: {
                        x: { type: ["number", "null"] },
                        y: { type: ["number", "null"] },
                        width: { type: ["number", "null"] },
                        height: { type: ["number", "null"] },
                      },
                      required: ["x", "y", "width", "height"],
                    },
                  },
                  required: ["quotedSpan", "pageNumber", "confidence", "bbox"],
                },
              },
              required: [...requiredKeys, "_provenance"],
            },
          },
        },
        required: ["items"],
      },
      messages: [
        {
          role: "system",
          content: [
            "Extract repeated child rows from the provided document.",
            "Return only factual rows found in the document.",
            `Use at most ${maxItems} items.`,
            "Do not invent missing values; omit optional keys instead.",
            "For each item include `_provenance` with the exact `quotedSpan` supporting that row, the best `pageNumber` you can infer, and a confidence from 0 to 1.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Parent record id: ${parentRecordId}`,
            `Collection field: ${String(fieldRow.name)}`,
            `Child object: ${String(childObjectRow.name ?? childObjectId)}`,
            "Field mapping:",
            ...mappedFieldEntries.map((entry) => `- ${entry.sourceLabel} -> ${entry.targetFieldKey}`),
            "",
            `Document (${document.documentName}):`,
            documentText,
          ].join("\n"),
        },
      ],
      maxTokens: 5000,
    });

    const extractedItems = Array.isArray(extraction.data.items)
      ? extraction.data.items.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
      : [];
    const normalizedItems = extractedItems.slice(0, maxItems).map((entry) => {
      const payload: Record<string, unknown> = {
        parent_record_id: parentRecordId,
        source_document_id: recordId,
      };
      for (const mapping of mappedFieldEntries) {
        if (mapping.targetFieldKey in entry) {
          payload[mapping.targetFieldKey] = entry[mapping.targetFieldKey];
        }
      }
      const provenance =
        entry._provenance && typeof entry._provenance === "object" && !Array.isArray(entry._provenance)
          ? (entry._provenance as {
              quotedSpan?: string;
              pageNumber?: number | null;
              confidence?: number | null;
              bbox?: { x?: number | null; y?: number | null; width?: number | null; height?: number | null } | null;
            })
          : {};
      return {
        data: payload,
        provenance: {
          quotedSpan:
            typeof provenance.quotedSpan === "string" && provenance.quotedSpan.trim().length > 0
              ? provenance.quotedSpan.trim()
              : null,
          pageNumber:
            typeof provenance.pageNumber === "number" && Number.isInteger(provenance.pageNumber)
              ? provenance.pageNumber
              : null,
          confidence:
            typeof provenance.confidence === "number" && Number.isFinite(provenance.confidence)
              ? Math.max(0, Math.min(1, provenance.confidence))
              : null,
          bbox:
            provenance.bbox &&
            typeof provenance.bbox === "object" &&
            !Array.isArray(provenance.bbox)
              ? {
                  x: typeof provenance.bbox.x === "number" ? provenance.bbox.x : null,
                  y: typeof provenance.bbox.y === "number" ? provenance.bbox.y : null,
                  width: typeof provenance.bbox.width === "number" ? provenance.bbox.width : null,
                  height: typeof provenance.bbox.height === "number" ? provenance.bbox.height : null,
                }
              : null,
        },
      };
    });

    if (dryRun) {
      return {
        ok: true,
        data: {
          dryRun: true,
          parentRecordId,
          childObjectId,
          childObjectName: String(childObjectRow.name ?? ""),
          fieldKey: String(fieldRow.key),
          count: normalizedItems.length,
          items: normalizedItems,
          provider: extraction.provider,
          model: extraction.model,
        },
      };
    }

    const created: Array<{
      id: string;
      data: Record<string, unknown>;
      provenance: {
        quotedSpan: string | null;
        pageNumber: number | null;
        confidence: number | null;
        bbox: { x: number | null; y: number | null; width: number | null; height: number | null } | null;
      };
    }> = [];
    for (const item of normalizedItems) {
      const createResult = await fetchInternalJson<{
        record?: { id?: string; data?: Record<string, unknown> };
      }>(ctx, `/api/workspaces/${encodeURIComponent(ctx.workspaceSlug)}/records`, {
        method: "POST",
        body: JSON.stringify({
          objectId: childObjectId,
          data: item.data,
        }),
      });
      if (!createResult.ok || !createResult.data?.record?.id) {
        return {
          ok: false,
          error: createResult.error ?? "Failed to create extracted child record.",
          status: createResult.status || 400,
        };
      }
      created.push({
        id: String(createResult.data.record.id),
        data: (createResult.data.record.data as Record<string, unknown>) ?? item.data,
        provenance: item.provenance,
      });
    }

    const fieldIdByKey = new Map(
      (childFields ?? []).map((entry) => [String(entry.key), String(entry.id)]),
    );
    for (const record of created) {
      for (const mapping of mappedFieldEntries) {
        if (!(mapping.targetFieldKey in record.data)) continue;
        const fieldId = fieldIdByKey.get(mapping.targetFieldKey);
        if (!fieldId) continue;
        const { error: provenanceError } = await supabase.from("record_field_provenance").insert({
          workspace_id: workspace.workspaceId,
          record_id: record.id,
          object_id: childObjectId,
          field_id: fieldId,
          source_document_id: recordId,
          source_type: "document",
          value_snapshot: record.data[mapping.targetFieldKey] ?? null,
          source_quote:
            record.provenance.quotedSpan ??
            `${mapping.sourceLabel}: ${String(record.data[mapping.targetFieldKey] ?? "").slice(0, 500)}`,
          source_span: {
            field: mapping.sourceLabel,
            collection_field_id: collectionFieldId,
            page_number: record.provenance.pageNumber,
            quoted_span: record.provenance.quotedSpan,
          },
          source_bbox: record.provenance.bbox,
          metadata: {
            extraction_kind: "collection",
            parent_record_id: parentRecordId,
            quoted_span:
              record.provenance.quotedSpan ??
              `${mapping.sourceLabel}: ${String(record.data[mapping.targetFieldKey] ?? "").slice(0, 500)}`,
            page_number: record.provenance.pageNumber,
            bbox: record.provenance.bbox,
          },
          model: extraction.model,
          confidence: record.provenance.confidence,
        });
        if (provenanceError && provenanceError.code !== "42P01") {
          return { ok: false, error: provenanceError.message, status: 500 };
        }
      }
    }

    return {
      ok: true,
      data: {
        dryRun: false,
        parentRecordId,
        childObjectId,
        childObjectName: String(childObjectRow.name ?? ""),
        fieldKey: String(fieldRow.key),
        count: created.length,
        createdRecords: created,
        provider: extraction.provider,
        model: extraction.model,
      },
    };
  },
});

registerTool({
  name: "documents.extract_field",
  description:
    "Extract one structured field value from a document into an existing record, with quoted-span provenance and optional review-queue fallback when confidence is low. Defaults to dryRun:true.",
  args: {
    recordId: { type: "string", required: true },
    targetRecordId: { type: "string", required: true },
    fieldId: { type: "string", required: true },
    dryRun: { type: "boolean", description: "Defaults to true; set false to persist value/review item." },
    confirmToken: { type: "string", description: "Reserved for future confirm flow." },
  },
  handler: async (rawArgs, ctx): Promise<ToolResult<Record<string, unknown>>> => {
    const args = rawArgs as ExtractFieldArgs;
    const recordId = String(args.recordId ?? args.documentRecordId ?? "").trim();
    const targetRecordId = String(args.targetRecordId ?? "").trim();
    const fieldId = String(args.fieldId ?? "").trim();
    const dryRun = args.dryRun !== false;
    if (!recordId || !targetRecordId || !fieldId) {
      return { ok: false, error: "recordId, targetRecordId, and fieldId are required.", status: 400 };
    }

    const analysis = await analyzeDocumentRecord(ctx, recordId, HARD_MAX_CHARS);
    if (!analysis.ok) return analysis;
    const document = analysis.data;
    const documentText =
      typeof document.text === "string" && document.text.trim().length > 0
        ? document.text.trim()
        : Array.isArray(document.sheets)
          ? JSON.stringify(document.sheets, null, 2)
          : "";
    if (!documentText) {
      return { ok: false, error: "Document contains no analyzable text for field extraction.", status: 400 };
    }

    const workspace = await getSupabaseForWorkspace(ctx);
    if (!workspace.workspaceId || !workspace.supabase) {
      return { ok: false, error: "Workspace not found.", status: 404 };
    }
    const supabase = workspace.supabase;

    const { data: targetRecord, error: targetRecordError } = await supabase
      .from("records")
      .select("id, object_id, data")
      .eq("workspace_id", workspace.workspaceId)
      .eq("id", targetRecordId)
      .maybeSingle();
    if (targetRecordError) return { ok: false, error: targetRecordError.message, status: 500 };
    if (!targetRecord) return { ok: false, error: "Target record not found.", status: 404 };

    const { data: fieldRow, error: fieldError } = await supabase
      .from("workspace_fields")
      .select("id, object_id, name, key, type, required, options")
      .eq("workspace_id", workspace.workspaceId)
      .eq("id", fieldId)
      .maybeSingle();
    if (fieldError) return { ok: false, error: fieldError.message, status: 500 };
    if (!fieldRow) return { ok: false, error: "Field not found.", status: 404 };
    if (String(fieldRow.object_id) !== String(targetRecord.object_id)) {
      return { ok: false, error: "Field does not belong to the target record object.", status: 400 };
    }

    const { data: extractionConfig, error: extractionConfigError } = await supabase
      .from("field_extraction_configs")
      .select("id, prompt_template, validation_rule, confidence_threshold, enabled, version, metadata")
      .eq("workspace_id", workspace.workspaceId)
      .eq("field_id", fieldId)
      .maybeSingle();
    if (extractionConfigError && extractionConfigError.code !== "42P01") {
      return { ok: false, error: extractionConfigError.message, status: 500 };
    }

    const fieldOptions =
      fieldRow.options && typeof fieldRow.options === "object" && !Array.isArray(fieldRow.options)
        ? (fieldRow.options as Record<string, unknown>)
        : {};
    const enumValues =
      fieldRow.type === "select" || fieldRow.type === "status" ? parseFieldOptionValues(fieldOptions) : [];
    let valueSchema: Record<string, unknown> = { type: "string" };
    if (fieldRow.type === "number" || fieldRow.type === "currency") {
      valueSchema = { type: "number" };
    } else if (fieldRow.type === "boolean") {
      valueSchema = { type: "boolean" };
    } else if (enumValues.length > 0) {
      valueSchema = { type: "string", enum: enumValues };
    }

    const promptTemplate =
      typeof extractionConfig?.prompt_template === "string" && extractionConfig.prompt_template.trim().length > 0
        ? extractionConfig.prompt_template.trim()
        : `Extract the value for field "${String(fieldRow.name)}" from the document.`;
    const promptVersion =
      extractionConfig?.version !== null &&
      extractionConfig?.version !== undefined &&
      Number.isInteger(Number(extractionConfig.version))
        ? Number(extractionConfig.version)
        : 1;
    const confidenceThreshold =
      typeof extractionConfig?.confidence_threshold === "number"
        ? extractionConfig.confidence_threshold
        : Number(extractionConfig?.confidence_threshold ?? 0.7);

    const extraction = await hermesStructured<{
      value: unknown;
      provenance: {
        quotedSpan: string;
        pageNumber: number | null;
        confidence: number | null;
        bbox: {
          x: number | null;
          y: number | null;
          width: number | null;
          height: number | null;
        } | null;
      };
    }>({
      schemaName: "document_field_extract",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          value: valueSchema,
          provenance: {
            type: "object",
            additionalProperties: false,
            properties: {
              quotedSpan: { type: "string" },
              pageNumber: { type: ["number", "null"] },
              confidence: { type: ["number", "null"] },
              bbox: {
                type: ["object", "null"],
                additionalProperties: false,
                properties: {
                  x: { type: ["number", "null"] },
                  y: { type: ["number", "null"] },
                  width: { type: ["number", "null"] },
                  height: { type: ["number", "null"] },
                },
                required: ["x", "y", "width", "height"],
              },
            },
            required: ["quotedSpan", "pageNumber", "confidence", "bbox"],
          },
        },
        required: ["value", "provenance"],
      },
      messages: [
        {
          role: "system",
          content: [
            promptTemplate,
            "Return only the requested field value plus provenance.",
            "The provenance.quotedSpan must be the exact supporting text from the document.",
            "pageNumber may be null only if the page cannot be inferred.",
            "confidence must be a number from 0 to 1 or null.",
            "bbox is optional and should contain x, y, width, and height when visible layout coordinates are inferable.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Field name: ${String(fieldRow.name)}`,
            `Field key: ${String(fieldRow.key)}`,
            `Field type: ${String(fieldRow.type)}`,
            enumValues.length > 0 ? `Allowed values: ${enumValues.join(", ")}` : "",
            "",
            `Document (${document.documentName}):`,
            documentText,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      maxTokens: 3000,
    });

    const quotedSpan =
      typeof extraction.data.provenance?.quotedSpan === "string" && extraction.data.provenance.quotedSpan.trim().length > 0
        ? extraction.data.provenance.quotedSpan.trim()
        : null;
    const pageNumber =
      typeof extraction.data.provenance?.pageNumber === "number" && Number.isFinite(extraction.data.provenance.pageNumber)
        ? extraction.data.provenance.pageNumber
        : null;
    const confidence =
      typeof extraction.data.provenance?.confidence === "number" && Number.isFinite(extraction.data.provenance.confidence)
        ? Math.max(0, Math.min(1, extraction.data.provenance.confidence))
        : null;
    const bbox =
      extraction.data.provenance?.bbox &&
      typeof extraction.data.provenance.bbox === "object" &&
      !Array.isArray(extraction.data.provenance.bbox)
        ? {
            x:
              typeof extraction.data.provenance.bbox.x === "number"
                ? extraction.data.provenance.bbox.x
                : null,
            y:
              typeof extraction.data.provenance.bbox.y === "number"
                ? extraction.data.provenance.bbox.y
                : null,
            width:
              typeof extraction.data.provenance.bbox.width === "number"
                ? extraction.data.provenance.bbox.width
                : null,
            height:
              typeof extraction.data.provenance.bbox.height === "number"
                ? extraction.data.provenance.bbox.height
                : null,
          }
        : null;
    const shouldReview =
      extraction.data.value === null ||
      extraction.data.value === undefined ||
      (confidence !== null && Number.isFinite(confidenceThreshold) && confidence < confidenceThreshold);

    if (dryRun) {
      return {
        ok: true,
        data: {
          dryRun: true,
          targetRecordId,
          fieldId,
          fieldKey: String(fieldRow.key),
          value: extraction.data.value ?? null,
          reviewRequired: shouldReview,
          confidenceThreshold: Number.isFinite(confidenceThreshold) ? confidenceThreshold : null,
          provenance: {
            quotedSpan,
            pageNumber,
            confidence,
            bbox,
            promptVersion,
          },
          provider: extraction.provider,
          model: extraction.model,
        },
      };
    }

    if (shouldReview) {
      const { data: reviewItem, error: reviewError } = await supabase
        .from("extraction_review_items")
        .insert({
          workspace_id: workspace.workspaceId,
          record_id: targetRecordId,
          object_id: String(targetRecord.object_id),
          field_id: fieldId,
          extraction_config_id: extractionConfig?.id ? String(extractionConfig.id) : null,
          status: "pending",
          reason:
            extraction.data.value === null || extraction.data.value === undefined ? "missing_value" : "low_confidence",
          proposed_value: extraction.data.value ?? null,
          current_value:
            targetRecord.data &&
            typeof targetRecord.data === "object" &&
            !Array.isArray(targetRecord.data) &&
            String(fieldRow.key) in (targetRecord.data as Record<string, unknown>)
              ? (targetRecord.data as Record<string, unknown>)[String(fieldRow.key)]
              : null,
          confidence,
          notes: quotedSpan,
          metadata: {
            source_document_id: recordId,
            quoted_span: quotedSpan,
            page_number: pageNumber,
            bbox,
            prompt_version: promptVersion,
            extraction_model: extraction.model,
          },
        })
        .select("id")
        .maybeSingle();
      if (reviewError && reviewError.code !== "42P01") {
        return { ok: false, error: reviewError.message, status: 500 };
      }
      return {
        ok: true,
        data: {
          dryRun: false,
          queuedForReview: true,
          reviewItemId: reviewItem?.id ? String(reviewItem.id) : null,
          targetRecordId,
          fieldId,
          fieldKey: String(fieldRow.key),
          value: extraction.data.value ?? null,
          provenance: {
            quotedSpan,
            pageNumber,
            confidence,
            bbox,
            promptVersion,
          },
          provider: extraction.provider,
          model: extraction.model,
        },
      };
    }

    const currentData =
      targetRecord.data && typeof targetRecord.data === "object" && !Array.isArray(targetRecord.data)
        ? (targetRecord.data as Record<string, unknown>)
        : {};
    const patchResult = await fetchInternalJson<{ record?: { id?: string; data?: Record<string, unknown> } }>(
      ctx,
      `/api/workspaces/${encodeURIComponent(ctx.workspaceSlug)}/records/${encodeURIComponent(targetRecordId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          data: {
            ...currentData,
            [String(fieldRow.key)]: extraction.data.value ?? null,
          },
        }),
      },
    );
    if (!patchResult.ok || !patchResult.data?.record?.id) {
      return { ok: false, error: patchResult.error ?? "Failed to update target record.", status: patchResult.status };
    }

    const { data: provenanceRow, error: provenanceError } = await supabase
      .from("record_field_provenance")
      .insert({
        workspace_id: workspace.workspaceId,
        record_id: targetRecordId,
        object_id: String(targetRecord.object_id),
        field_id: fieldId,
        extraction_config_id: extractionConfig?.id ? String(extractionConfig.id) : null,
        source_document_id: recordId,
        source_type: "document",
        value_snapshot: extraction.data.value ?? null,
        source_quote: quotedSpan,
        source_span: {
          quoted_span: quotedSpan,
          page_number: pageNumber,
        },
        source_bbox: bbox,
        model: extraction.model,
        prompt_version: promptVersion,
        confidence,
        metadata: {
          prompt_version: promptVersion,
          page_number: pageNumber,
          quoted_span: quotedSpan,
          bbox,
        },
      })
      .select("id")
      .maybeSingle();
    if (provenanceError && provenanceError.code !== "42P01") {
      return { ok: false, error: provenanceError.message, status: 500 };
    }

    return {
      ok: true,
      data: {
        dryRun: false,
        queuedForReview: false,
        targetRecordId,
        fieldId,
        fieldKey: String(fieldRow.key),
        value: extraction.data.value ?? null,
        provenanceId: provenanceRow?.id ? String(provenanceRow.id) : null,
        provenance: {
          quotedSpan,
          pageNumber,
          confidence,
          bbox,
          promptVersion,
        },
        provider: extraction.provider,
        model: extraction.model,
      },
    };
  },
});
