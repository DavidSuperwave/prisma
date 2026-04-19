import * as XLSX from "xlsx";
import { getCurrentAppUser } from "@/lib/auth";
import { extractPdfText } from "@/lib/documents/pdfExtract";
import { parseCsvForPreview, smartExtractSheet } from "@/lib/spreadsheetParser";
import { getAssetBucketName, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; recordId: string }>;
};

type AnalyzeRequest = {
  mode?: "extract" | "reparse";
};

const SAMPLE_ROW_LIMIT = 50;
const PDF_EXCERPT_CHARS = 8_000;

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug, recordId } = await context.params;
    const user = await getCurrentAppUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
    const allowedWorkspace = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
    if (!allowedWorkspace) {
      return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as AnalyzeRequest;
    const mode = body.mode === "reparse" ? "reparse" : "extract";

    const supabase = requireSupabaseAdmin();
    const { data: recordRow, error: recordError } = await supabase
      .from("records")
      .select("id, workspace_id, data")
      .eq("id", recordId)
      .eq("workspace_id", allowedWorkspace.workspaceId)
      .maybeSingle();
    if (recordError) throw new Error(recordError.message);
    if (!recordRow) {
      return Response.json({ error: "Document record not found." }, { status: 404 });
    }

    const data = (recordRow.data as Record<string, unknown>) ?? {};
    const storagePath = typeof data.storage_path === "string" ? data.storage_path : null;
    const mimeType = typeof data.mime_type === "string" ? data.mime_type : "";
    const documentName = typeof data.document_name === "string" ? data.document_name : "";
    const fileKind = typeof data.kind === "string" ? data.kind : "other";

    if (mode === "reparse") {
      if (!storagePath) {
        return Response.json({ error: "No storage path available for this document." }, { status: 400 });
      }
      const bucket = getAssetBucketName();
      const { data: downloaded, error: downloadError } = await supabase.storage.from(bucket).download(storagePath);
      if (downloadError || !downloaded) {
        throw new Error(downloadError?.message ?? "Unable to download stored file.");
      }
      const buffer = await downloaded.arrayBuffer();

      const extension = documentName.toLowerCase().split(".").pop() ?? "";
      const isPdf = fileKind === "pdf" || mimeType === "application/pdf" || extension === "pdf";
      let preview: Record<string, unknown> | null = null;
      let summary = "Documento reanalizado.";

      if (extension === "csv" || mimeType === "text/csv") {
        const text = new TextDecoder("utf-8").decode(buffer);
        const parsed = parseCsvForPreview(text);
        preview = {
          kind: "spreadsheet",
          sheets:
            parsed.headers.length > 0
              ? [
                  {
                    name: "Sheet1",
                    headers: parsed.headers,
                    sampleRows: parsed.rows.slice(0, SAMPLE_ROW_LIMIT),
                    rowCount: parsed.rowCount,
                  },
                ]
              : [],
        };
      } else if (extension === "xlsx" || extension === "xls" || mimeType.includes("spreadsheet")) {
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheets = workbook.SheetNames.map((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) return null;
          const { headers, rows: cleanedRows } = smartExtractSheet(sheet);
          return {
            name: sheetName,
            headers,
            sampleRows: cleanedRows.slice(0, SAMPLE_ROW_LIMIT),
            rowCount: cleanedRows.length,
          };
        }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
        preview = { kind: "spreadsheet", sheets };
      } else if (isPdf) {
        const extraction = await extractPdfText(Buffer.from(buffer), { maxChars: PDF_EXCERPT_CHARS });
        preview = {
          kind: "pdf",
          pageCount: extraction.pageCount,
          textLength: extraction.textLength,
          excerpt: extraction.text,
          truncated: extraction.truncated,
          ocrUsed: extraction.ocrUsed,
          ocrError: extraction.ocrError ?? null,
          parseError: extraction.parseError ?? null,
          sheets: [],
          extractedAt: new Date().toISOString(),
        };
        const pageLabel = extraction.pageCount === 1 ? "página" : "páginas";
        if (extraction.textLength > 0) {
          summary = `PDF analizado · ${extraction.pageCount} ${pageLabel} · ${extraction.textLength.toLocaleString("es-MX")} caracteres${
            extraction.ocrUsed ? " (OCR con visión)" : ""
          }.`;
        } else {
          const reason = extraction.parseError ?? extraction.ocrError;
          summary = reason
            ? `No se pudo extraer texto del PDF: ${reason}`
            : "No se pudo extraer texto del PDF (puede estar vacío o cifrado).";
        }
      } else {
        preview = { kind: fileKind, sheets: [] };
      }

      const nextData = { ...data, preview };
      const { error: updateError } = await supabase
        .from("records")
        .update({ data: nextData })
        .eq("id", recordRow.id);
      if (updateError) throw new Error(updateError.message);

      return Response.json({ preview, summary });
    }

    // Extract mode — quick inline summary without persisting preview.
    if (fileKind === "pdf" || mimeType === "application/pdf" || documentName.toLowerCase().endsWith(".pdf")) {
      if (!storagePath) {
        return Response.json({
          summary: "PDF adjuntado sin archivo en storage. Vuelve a subirlo para analizarlo.",
        });
      }
      const bucket = getAssetBucketName();
      const { data: downloaded, error: downloadError } = await supabase.storage.from(bucket).download(storagePath);
      if (downloadError || !downloaded) {
        throw new Error(downloadError?.message ?? "Unable to download stored file.");
      }
      const buffer = await downloaded.arrayBuffer();
      const extraction = await extractPdfText(Buffer.from(buffer), { maxChars: PDF_EXCERPT_CHARS });
      const pageLabel = extraction.pageCount === 1 ? "página" : "páginas";
      const snippet = extraction.text.slice(0, 600);
      const reason = extraction.parseError ?? extraction.ocrError;
      const summary = extraction.textLength > 0
        ? `PDF · ${extraction.pageCount} ${pageLabel} · ${extraction.textLength.toLocaleString("es-MX")} caracteres extraídos${
            extraction.ocrUsed ? " con OCR de visión" : ""
          }.\n\n${snippet}${extraction.truncated || extraction.textLength > snippet.length ? "…" : ""}`
        : reason
          ? `No se pudo extraer texto del PDF: ${reason}`
          : "No se pudo extraer texto del PDF (puede estar vacío, escaneado sin OCR disponible o cifrado).";
      return Response.json({
        summary,
        pdf: {
          pageCount: extraction.pageCount,
          textLength: extraction.textLength,
          truncated: extraction.truncated,
          ocrUsed: extraction.ocrUsed,
          ocrError: extraction.ocrError ?? null,
          parseError: extraction.parseError ?? null,
          excerpt: snippet,
        },
      });
    }

    const summary =
      fileKind === "spreadsheet"
        ? "Puedo usar las columnas detectadas para proponer una tabla o mapearlas a una existente."
        : fileKind === "image"
          ? "Extracción de texto desde imagen programada. Quedó adjunto para referencia."
          : "Documento adjuntado. Aún no hay extracción automática para este tipo.";

    return Response.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to analyze document.";
    return Response.json({ error: message }, { status: 400 });
  }
}
