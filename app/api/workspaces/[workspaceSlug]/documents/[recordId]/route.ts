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

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, recordId } = await context.params;
    if (!isUuid(recordId)) {
      return Response.json({ error: "Invalid record id." }, { status: 400 });
    }

    const access = await resolveDocumentsAccess(workspaceSlug);
    if (isAccessError(access)) {
      return Response.json({ error: access.error }, { status: access.status });
    }
    if (access.role === "viewer") {
      return Response.json({ error: "Viewers cannot edit documents." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      folder_id?: unknown;
      folderId?: unknown;
    };

    const supabase = requireSupabaseAdmin();
    const { data: record } = await supabase
      .from("records")
      .select("id, data, folder_id")
      .eq("id", recordId)
      .eq("workspace_id", access.workspace.id)
      .eq("object_id", access.documentsObjectId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!record) {
      return Response.json({ error: "Document not found." }, { status: 404 });
    }

    const currentData = (record.data as Record<string, unknown>) ?? {};
    const nextData: Record<string, unknown> = { ...currentData };
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (!trimmed || trimmed.length > 240) {
        return Response.json({ error: "Document name must be 1-240 characters." }, { status: 400 });
      }
      nextData.document_name = trimmed;
    }

    if ("folder_id" in body || "folderId" in body) {
      const raw = body.folder_id ?? body.folderId;
      const nextFolderId = raw == null || raw === "" ? null : isUuid(raw) ? raw : null;
      if (nextFolderId) {
        const { data: folderRow } = await supabase
          .from("workspace_folders")
          .select("id")
          .eq("id", nextFolderId)
          .eq("workspace_id", access.workspace.id)
          .maybeSingle();
        if (!folderRow) {
          return Response.json({ error: "Folder not found." }, { status: 404 });
        }
      }
      updates.folder_id = nextFolderId;
      nextData.folder_id = nextFolderId;
    }

    updates.data = nextData;

    const { data: updated, error: updateError } = await supabase
      .from("records")
      .update(updates)
      .eq("id", recordId)
      .eq("workspace_id", access.workspace.id)
      .select("id, data, folder_id, created_at, updated_at")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return Response.json({
      document: {
        id: String(updated.id),
        folderId: updated.folder_id ? String(updated.folder_id) : null,
        data: updated.data,
        createdAt: String(updated.created_at),
        updatedAt: String(updated.updated_at),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update document.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, recordId } = await context.params;
    if (!isUuid(recordId)) {
      return Response.json({ error: "Invalid record id." }, { status: 400 });
    }
    const access = await resolveDocumentsAccess(workspaceSlug);
    if (isAccessError(access)) {
      return Response.json({ error: access.error }, { status: access.status });
    }
    if (access.role === "viewer") {
      return Response.json({ error: "Viewers cannot delete documents." }, { status: 403 });
    }

    const supabase = requireSupabaseAdmin();
    const { data: record } = await supabase
      .from("records")
      .select("id, data")
      .eq("id", recordId)
      .eq("workspace_id", access.workspace.id)
      .eq("object_id", access.documentsObjectId)
      .maybeSingle();
    if (!record) {
      return Response.json({ error: "Document not found." }, { status: 404 });
    }

    const data = (record.data as Record<string, unknown>) ?? {};
    const storagePath = typeof data.storage_path === "string" ? data.storage_path : null;

    if (storagePath) {
      const bucketName = getAssetBucketName();
      await supabase.storage.from(bucketName).remove([storagePath]);
    }

    await supabase
      .from("workspace_evidence_links")
      .delete()
      .eq("workspace_id", access.workspace.id)
      .eq("document_record_id", recordId);

    const { error: deleteError } = await supabase
      .from("records")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", recordId)
      .eq("workspace_id", access.workspace.id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete document.";
    return Response.json({ error: message }, { status: 400 });
  }
}
