import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getWorkspaceMembershipForSlug } from "@/lib/workspaceStore";
import { bootstrapDocuments } from "@/lib/documentsBootstrap";

export type DocumentsAccess = {
  workspace: { id: string; name: string; subdomain: string };
  role: "admin" | "operator" | "viewer";
  documentsObjectId: string;
  userId: string;
};

export type DocumentsAccessError = {
  error: string;
  status: number;
};

export function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

export async function resolveDocumentsAccess(
  workspaceSlug: string,
): Promise<DocumentsAccess | DocumentsAccessError> {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: "Authentication required.", status: 401 };
  }
  const membership = await getWorkspaceMembershipForSlug(
    user.id,
    workspaceSlug,
    user.isPlatformAdmin,
  );
  if (!membership) {
    return { error: "You do not have access to this workspace.", status: 403 };
  }

  const supabase = requireSupabaseAdmin();
  const workspaceId = membership.workspaceId;

  const { data: existingDocsObject } = await supabase
    .from("workspace_objects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", "Documents")
    .maybeSingle();

  let documentsObjectId = existingDocsObject?.id ? String(existingDocsObject.id) : null;
  if (!documentsObjectId) {
    const result = await bootstrapDocuments(workspaceId);
    documentsObjectId = result.documentsObjectId;
  }
  if (!documentsObjectId) {
    return { error: "Documents object could not be provisioned.", status: 500 };
  }

  return {
    workspace: {
      id: workspaceId,
      name: membership.workspace.name,
      subdomain: membership.workspace.subdomain,
    },
    role: membership.role as DocumentsAccess["role"],
    documentsObjectId,
    userId: user.id,
  };
}

export function isAccessError(value: unknown): value is DocumentsAccessError {
  return Boolean(value && typeof value === "object" && "error" in value && "status" in value);
}

export const ALLOWED_DOCUMENT_KINDS = new Set(["spreadsheet", "pdf", "image", "text", "markdown", "other"]);

export type DocumentKind = "spreadsheet" | "pdf" | "image" | "text" | "markdown" | "other";

export function sanitizeDocumentKind(value: unknown): DocumentKind {
  if (typeof value === "string" && ALLOWED_DOCUMENT_KINDS.has(value)) {
    return value as DocumentKind;
  }
  return "other";
}

export function inferDocumentKindFromMime(mimeType: string, fileName: string): DocumentKind {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.startsWith("image/")) return "image";
  if (lowerMime === "application/pdf" || lowerName.endsWith(".pdf")) return "pdf";
  if (
    lowerMime.includes("spreadsheet") ||
    lowerMime === "text/csv" ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls")
  ) {
    return "spreadsheet";
  }
  if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown") || lowerMime === "text/markdown") {
    return "markdown";
  }
  if (lowerMime.startsWith("text/") || lowerName.endsWith(".txt") || lowerName.endsWith(".log")) {
    return "text";
  }
  return "other";
}

export function sanitizeDocumentPreview(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const typed = raw as Record<string, unknown>;
  const kind = sanitizeDocumentKind(typed.kind);
  const sheetsRaw = Array.isArray(typed.sheets) ? typed.sheets : [];
  const sheets = sheetsRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const sheet = entry as Record<string, unknown>;
      const name = typeof sheet.name === "string" ? sheet.name.slice(0, 120) : "Sheet1";
      const headers = Array.isArray(sheet.headers)
        ? sheet.headers.map((header) => String(header)).slice(0, 200)
        : [];
      const sampleRowsRaw = Array.isArray(sheet.sampleRows) ? sheet.sampleRows : [];
      const sampleRows = sampleRowsRaw
        .slice(0, 50)
        .filter((row) => row && typeof row === "object" && !Array.isArray(row))
        .map((row) => row as Record<string, unknown>);
      const rowCount = typeof sheet.rowCount === "number" ? sheet.rowCount : sampleRows.length;
      return { name, headers, sampleRows, rowCount };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  return { kind, sheets };
}

export function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}
