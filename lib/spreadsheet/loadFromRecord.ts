import * as XLSX from "xlsx";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { ToolContext, ToolResult } from "@/lib/agentTools/registry";
import { parseCsvForPreview, smartExtractSheet } from "@/lib/spreadsheetParser";

const MAX_TRANSFORM_ROWS = 5_000;

async function getWorkspaceIdForSlug(supabase: ReturnType<typeof getSupabaseAdmin>, slug: string) {
  if (!supabase) return null;
  const { data } = await supabase.from("workspaces").select("id").eq("subdomain", slug).maybeSingle();
  return data ? String((data as { id: string }).id) : null;
}

export type LoadedSheet = {
  sheetName: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
};

/**
 * Load full spreadsheet rows from a document record (up to MAX_TRANSFORM_ROWS per sheet).
 */
export async function loadSpreadsheetFromDocumentRecord(
  ctx: ToolContext,
  recordId: string,
  sheetName?: string | null,
): Promise<ToolResult<{ sheets: LoadedSheet[]; recordId: string; documentName: string }>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "Server storage not configured.", status: 500 };
  }
  const workspaceId = await getWorkspaceIdForSlug(supabase, ctx.workspaceSlug);
  if (!workspaceId) {
    return { ok: false, error: "Workspace not found.", status: 404 };
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
  if (!storagePath) {
    return { ok: false, error: "This document has no stored file.", status: 400 };
  }
  const bucket = (await import("@/lib/supabaseAdmin")).getAssetBucketName();
  const { data: downloaded, error: downloadError } = await supabase.storage.from(bucket).download(storagePath);
  if (downloadError || !downloaded) {
    return { ok: false, error: downloadError?.message ?? "Unable to download file.", status: 500 };
  }
  const buffer = await downloaded.arrayBuffer();
  const extension = documentName.toLowerCase().split(".").pop() ?? "";
  const isSpreadsheet =
    kind === "spreadsheet" ||
    mimeType.includes("spreadsheet") ||
    mimeType === "text/csv" ||
    extension === "xlsx" ||
    extension === "xls" ||
    extension === "csv";
  if (!isSpreadsheet) {
    return { ok: false, error: "Document is not a spreadsheet/CSV.", status: 415 };
  }
  if (extension === "csv" || mimeType === "text/csv") {
    const raw = new TextDecoder("utf-8").decode(buffer);
    const parsed = parseCsvForPreview(raw);
    const rows = parsed.rows.slice(0, MAX_TRANSFORM_ROWS);
    return {
      ok: true,
      data: {
        recordId,
        documentName,
        sheets: [
          {
            sheetName: "Sheet1",
            headers: parsed.headers,
            rows,
            rowCount: rows.length,
          },
        ],
      },
    };
  }
  const workbook = XLSX.read(buffer, { type: "array" });
  const targetName = String(sheetName ?? "").trim();
  const names = targetName
    ? workbook.SheetNames.filter((n) => n === targetName)
    : workbook.SheetNames;
  const sheets: LoadedSheet[] = [];
  for (const name of names) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const { headers, rows } = smartExtractSheet(sheet);
    const sliced = rows.slice(0, MAX_TRANSFORM_ROWS);
    sheets.push({ sheetName: name, headers, rows: sliced, rowCount: sliced.length });
  }
  if (sheets.length === 0) {
    return { ok: false, error: "No sheets could be read from the file.", status: 400 };
  }
  return { ok: true, data: { recordId, documentName, sheets } };
}
