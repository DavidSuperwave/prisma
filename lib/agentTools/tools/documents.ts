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

const DEFAULT_MAX_CHARS = 24_000;
const HARD_MAX_CHARS = 120_000;

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

    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) {
      return { ok: false, error: "Workspace not found.", status: 404 };
    }

    const supabaseMod = await import("@/lib/supabaseAdmin");
    const supabase = supabaseMod.getSupabaseAdmin();
    if (!supabase) {
      return { ok: false, error: "Supabase admin client unavailable.", status: 500 };
    }

    const { data: recordRow, error: recordError } = await supabase
      .from("records")
      .select("id, workspace_id, data")
      .eq("id", recordId)
      .eq("workspace_id", workspaceId)
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

    const requestedMax = typeof args.maxChars === "number" ? args.maxChars : DEFAULT_MAX_CHARS;
    const maxChars = Math.max(500, Math.min(requestedMax, HARD_MAX_CHARS));

    if (!storagePath) {
      return {
        ok: false,
        error: "This document has no stored file to analyze.",
        status: 400,
      };
    }

    const bucket = supabaseMod.getAssetBucketName();
    const { data: downloaded, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(storagePath);
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
      mimeType.startsWith("text/") ||
      extension === "txt" ||
      extension === "md" ||
      extension === "json";

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
  },
});
