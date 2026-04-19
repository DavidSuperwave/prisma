import * as XLSX from "xlsx";

import { parseCsvForPreview, smartExtractSheet } from "@/lib/spreadsheetParser";
import { getAssetBucketName } from "@/lib/supabaseAdmin";
import {
  inferDocumentKindFromMime,
  isAccessError,
  isUuid,
  requireSupabaseAdmin,
  resolveDocumentsAccess,
  sanitizeDocumentKind,
  sanitizeDocumentPreview,
  sanitizeFileName,
} from "@/app/api/workspaces/[workspaceSlug]/documents/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_ROW_LIMIT = 50;

function buildSpreadsheetPreview(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType: string,
): Record<string, unknown> | null {
  const extension = (fileName.toLowerCase().split(".").pop() ?? "").trim();
  try {
    if (extension === "csv" || mimeType === "text/csv") {
      const text = new TextDecoder("utf-8").decode(buffer);
      const parsed = parseCsvForPreview(text);
      if (parsed.headers.length === 0) return null;
      return {
        kind: "spreadsheet",
        sheets: [
          {
            name: "Sheet1",
            headers: parsed.headers,
            sampleRows: parsed.rows.slice(0, SAMPLE_ROW_LIMIT),
            rowCount: parsed.rowCount,
          },
        ],
      };
    }
    if (
      extension === "xlsx"
      || extension === "xls"
      || mimeType.includes("spreadsheet")
      || mimeType === "application/vnd.ms-excel"
    ) {
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheets = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return null;
        const { headers, rows } = smartExtractSheet(sheet);
        if (headers.length === 0) return null;
        return {
          name: sheetName,
          headers,
          sampleRows: rows.slice(0, SAMPLE_ROW_LIMIT),
          rowCount: rows.length,
        };
      }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      if (sheets.length === 0) return null;
      return { kind: "spreadsheet", sheets };
    }
  } catch {
    return null;
  }
  return null;
}

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");
    const sessionTitle = String(formData.get("sessionTitle") ?? "").trim();
    const relatedRecordId = String(formData.get("relatedRecordId") ?? "").trim() || null;
    const runtimeConversationId = String(formData.get("conversationId") ?? "").trim() || null;
    const workspaceConversationId = String(formData.get("workspaceConversationId") ?? "").trim() || null;
    const requestedAgentId = String(formData.get("agentId") ?? "").trim() || null;
    const rawFolderId = String(formData.get("folder_id") ?? formData.get("folderId") ?? "").trim();
    const folderId = rawFolderId && isUuid(rawFolderId) ? rawFolderId : null;
    const kindRaw = formData.get("kind");
    const previewRaw = formData.get("preview");

    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "A non-empty file is required." }, { status: 400 });
    }

    const access = await resolveDocumentsAccess(workspaceSlug);
    if (isAccessError(access)) {
      return Response.json({ error: access.error }, { status: access.status });
    }
    if (access.role === "viewer") {
      return Response.json({ error: "Viewers cannot upload documents." }, { status: 403 });
    }

    const supabase = requireSupabaseAdmin();

    if (folderId) {
      const { data: folderRow } = await supabase
        .from("workspace_folders")
        .select("id")
        .eq("id", folderId)
        .eq("workspace_id", access.workspace.id)
        .maybeSingle();
      if (!folderRow) {
        return Response.json({ error: "Folder not found in this workspace." }, { status: 404 });
      }
    }

    const mimeType = file.type || "application/octet-stream";
    const inferredKind = inferDocumentKindFromMime(mimeType, file.name);
    const uploadedKind = typeof kindRaw === "string" && kindRaw ? sanitizeDocumentKind(kindRaw) : inferredKind;

    let uploadedPreview: Record<string, unknown> | null = null;
    if (typeof previewRaw === "string" && previewRaw.trim()) {
      try {
        uploadedPreview = sanitizeDocumentPreview(JSON.parse(previewRaw));
      } catch {
        uploadedPreview = null;
      }
    }

    const safeFileName = `${Date.now()}-${sanitizeFileName(file.name)}`;
    const folderSegment = folderId ?? "root";
    const storagePath = `workspace-chat/${access.workspace.id}/${folderSegment}/${safeFileName}`;
    const fileArrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(fileArrayBuffer);
    const bucketName = getAssetBucketName();

    // If the client didn't ship a preview (e.g. library upload) but the file is
    // a spreadsheet, parse it server-side so the viewer shows real columns
    // instead of falling back to an empty card.
    if (!uploadedPreview && uploadedKind === "spreadsheet") {
      uploadedPreview = buildSpreadsheetPreview(fileArrayBuffer, file.name, mimeType);
    }

    const { error: uploadError } = await supabase.storage.from(bucketName).upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicAsset } = supabase.storage.from(bucketName).getPublicUrl(storagePath);

    const payload = {
      workspace_id: access.workspace.id,
      object_id: access.documentsObjectId,
      folder_id: folderId,
      data: {
        document_name: file.name,
        company_name: access.workspace.name,
        owner: sessionTitle || "Biblioteca",
        due_date: null,
        status: "pending",
        uploaded_via: sessionTitle ? "chat" : "library",
        runtime_conversation_id: runtimeConversationId,
        workspace_conversation_id: workspaceConversationId,
        public_url: publicAsset.publicUrl,
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: file.size,
        indexing_state: "pending",
        extracted_text: "",
        source_anchors: [],
        kind: uploadedKind,
        preview: uploadedPreview ?? null,
        folder_id: folderId,
      },
    };

    const { data: recordRow, error: recordError } = await supabase
      .from("records")
      .insert(payload)
      .select("id, data, folder_id, created_at, updated_at")
      .single();

    if (recordError) {
      throw new Error(recordError.message);
    }

    // Activity + evidence + indexing task (chat uploads only, to preserve legacy behavior)
    if (sessionTitle || runtimeConversationId || workspaceConversationId) {
      let activityAgent: { id: string } | null = null;
      if (requestedAgentId) {
        const { data: requestedAgent } = await supabase
          .from("workspace_agents")
          .select("id")
          .eq("workspace_id", access.workspace.id)
          .eq("id", requestedAgentId)
          .maybeSingle();
        if (requestedAgent?.id) {
          activityAgent = { id: String(requestedAgent.id) };
        }
      }

      if (!activityAgent) {
        const { data: fallbackAgent } = await supabase
          .from("workspace_agents")
          .select("id")
          .eq("workspace_id", access.workspace.id)
          .in("type", ["copilot", "worker"])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (fallbackAgent?.id) {
          activityAgent = { id: String(fallbackAgent.id) };
        }
      }

      const activityPayload = {
        workspace_id: access.workspace.id,
        action: "document.uploaded_via_chat",
        details: {
          title: file.name,
          storage_path: storagePath,
          session_title: sessionTitle || "New chat",
          status: "pending",
          related_record_id: relatedRecordId,
          runtime_conversation_id: runtimeConversationId,
          workspace_conversation_id: workspaceConversationId,
          folder_id: folderId,
        },
      };

      if (activityAgent?.id) {
        await supabase.from("agent_activity").insert({
          ...activityPayload,
          agent_id: String(activityAgent.id),
        });
      } else {
        await supabase.from("agent_events").insert({
          workspace_id: access.workspace.id,
          source_agent_id: null,
          event_type: "document.uploaded_via_chat",
          payload: { ...activityPayload, agent_id: null },
        });
      }

      const { data: reviewTask } = await supabase
        .from("workspace_tasks")
        .insert({
          workspace_id: access.workspace.id,
          source_record_id: String(recordRow.id),
          source_object_id: access.documentsObjectId,
          type: "document_indexing",
          title: `Indexar y vincular evidencia: ${file.name}`,
          owner_agent_id: activityAgent?.id ?? null,
          status: "pending",
          priority: "normal",
          approval_required: false,
          approval_status: "not_required",
          metadata: {
            document_record_id: String(recordRow.id),
            storage_path: storagePath,
            public_url: publicAsset.publicUrl,
            runtime_conversation_id: runtimeConversationId,
            workspace_conversation_id: workspaceConversationId,
            folder_id: folderId,
          },
          created_by: access.userId,
        })
        .select("id")
        .single();

      const reviewTaskId = reviewTask?.id ? String(reviewTask.id) : null;

      await supabase
        .from("workspace_evidence_links")
        .insert({
          workspace_id: access.workspace.id,
          document_record_id: String(recordRow.id),
          related_record_id: relatedRecordId,
          related_task_id: reviewTaskId,
          source_anchor: "upload:chat",
          quote: null,
          metadata: {
            document_name: file.name,
            mime_type: mimeType,
            runtime_conversation_id: runtimeConversationId,
            workspace_conversation_id: workspaceConversationId,
            folder_id: folderId,
          },
          created_by: access.userId,
        });

      return Response.json({
        recordId: recordRow.id,
        taskId: reviewTaskId,
        documentName: file.name,
        publicUrl: publicAsset.publicUrl,
        contentType: mimeType,
        fileKind: uploadedKind,
        preview: uploadedPreview,
        folderId,
      });
    }

    return Response.json({
      recordId: recordRow.id,
      documentName: file.name,
      publicUrl: publicAsset.publicUrl,
      contentType: mimeType,
      fileKind: uploadedKind,
      preview: uploadedPreview,
      folderId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload document.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const access = await resolveDocumentsAccess(workspaceSlug);
    if (isAccessError(access)) {
      return Response.json({ error: access.error }, { status: access.status });
    }

    const supabase = requireSupabaseAdmin();

    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "200");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const folderParam = url.searchParams.get("folder_id") ?? url.searchParams.get("folderId");

    let builder = supabase
      .from("records")
      .select("id, data, folder_id, created_at, updated_at")
      .eq("workspace_id", access.workspace.id)
      .eq("object_id", access.documentsObjectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 3, 50));

    if (folderParam != null) {
      if (folderParam === "" || folderParam === "root" || folderParam === "null") {
        builder = builder.is("folder_id", null);
      } else if (isUuid(folderParam)) {
        builder = builder.eq("folder_id", folderParam);
      }
    }

    const { data: recordRows, error: recordsError } = await builder;
    if (recordsError) throw new Error(recordsError.message);

    const documents = (recordRows ?? [])
      .map((row) => {
        const data = (row.data as Record<string, unknown>) ?? {};
        const fileName = typeof data.document_name === "string" ? data.document_name : "archivo";
        const publicUrl = typeof data.public_url === "string" ? data.public_url : "";
        const storagePath = typeof data.storage_path === "string" ? data.storage_path : "";
        const mimeType = typeof data.mime_type === "string" ? data.mime_type : "application/octet-stream";
        const sizeBytes = typeof data.size_bytes === "number" ? data.size_bytes : null;
        const fileKind = data.kind
          ? sanitizeDocumentKind(data.kind)
          : inferDocumentKindFromMime(mimeType, fileName);
        const previewValue = sanitizeDocumentPreview(data.preview);
        return {
          id: String(row.id),
          fileName,
          publicUrl,
          storagePath,
          mimeType,
          sizeBytes,
          fileKind,
          preview: previewValue,
          folderId: row.folder_id ? String(row.folder_id) : null,
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        };
      })
      .filter((doc) => (query ? doc.fileName.toLowerCase().includes(query) : true))
      .slice(0, limit);

    return Response.json({ documents });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list documents.";
    return Response.json({ error: message }, { status: 400 });
  }
}
