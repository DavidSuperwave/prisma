import { getAssetBucketName } from "@/lib/supabaseAdmin";
import {
  isAccessError,
  isUuid,
  requireSupabaseAdmin,
  resolveDocumentsAccess,
} from "@/app/api/workspaces/[workspaceSlug]/documents/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; recordId: string }>;
};

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug, recordId } = await context.params;
    if (!isUuid(recordId)) {
      return new Response("Invalid record id.", { status: 400 });
    }

    const access = await resolveDocumentsAccess(workspaceSlug);
    if (isAccessError(access)) {
      return new Response(access.error, { status: access.status });
    }

    const supabase = requireSupabaseAdmin();
    const { data: record } = await supabase
      .from("records")
      .select("id, data")
      .eq("id", recordId)
      .eq("workspace_id", access.workspace.id)
      .eq("object_id", access.documentsObjectId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!record) {
      return new Response("Document not found.", { status: 404 });
    }

    const data = (record.data as Record<string, unknown>) ?? {};
    const storagePath = typeof data.storage_path === "string" ? data.storage_path : null;
    const mimeType = typeof data.mime_type === "string" ? data.mime_type : "application/octet-stream";
    const fileName = typeof data.document_name === "string" ? data.document_name : "document";

    if (!storagePath) {
      return new Response("Document has no stored file.", { status: 410 });
    }

    const bucketName = getAssetBucketName();
    const { data: blob, error: downloadError } = await supabase.storage.from(bucketName).download(storagePath);
    if (downloadError || !blob) {
      return new Response("Unable to read stored file.", { status: 500 });
    }

    const arrayBuffer = await blob.arrayBuffer();
    const url = new URL(request.url);
    const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `${disposition}; filename="${fileName.replace(/"/g, "'")}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to stream document.";
    return new Response(message, { status: 500 });
  }
}
