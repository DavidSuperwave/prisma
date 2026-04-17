import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin, getAssetBucketName } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

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

    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "A non-empty file is required." }, { status: 400 });
    }

    const user = await getCurrentAppUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
    const allowedWorkspace = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
    if (!allowedWorkspace) {
      return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
    }

    const supabase = requireSupabaseAdmin();
    const { data: workspaceRow, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("subdomain", workspaceSlug)
      .maybeSingle();

    if (workspaceError) {
      throw new Error(workspaceError.message);
    }

    if (!workspaceRow) {
      return Response.json({ error: "Workspace not found." }, { status: 404 });
    }

    const { data: documentsObject, error: objectError } = await supabase
      .from("workspace_objects")
      .select("id")
      .eq("workspace_id", workspaceRow.id)
      .eq("name", "Documents")
      .maybeSingle();

    if (objectError) {
      throw new Error(objectError.message);
    }

    if (!documentsObject) {
      return Response.json({ error: "Documents object not configured for this workspace." }, { status: 409 });
    }

    const safeFileName = `${Date.now()}-${sanitizeFileName(file.name)}`;
    const storagePath = `workspace-chat/${workspaceRow.id}/${safeFileName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const bucketName = getAssetBucketName();

    const { error: uploadError } = await supabase.storage.from(bucketName).upload(storagePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicAsset } = supabase.storage.from(bucketName).getPublicUrl(storagePath);

    const payload = {
      workspace_id: workspaceRow.id,
      object_id: documentsObject.id,
      data: {
        document_name: file.name,
        company_name: workspaceRow.name,
        owner: sessionTitle || "CEO chat upload",
        due_date: null,
        status: "pending",
        uploaded_via: "chat",
        runtime_conversation_id: runtimeConversationId,
        workspace_conversation_id: workspaceConversationId,
        public_url: publicAsset.publicUrl,
        storage_path: storagePath,
        mime_type: file.type || "application/octet-stream",
        indexing_state: "pending",
        extracted_text: "",
        source_anchors: [],
      },
    };

    const { data: recordRow, error: recordError } = await supabase
      .from("records")
      .insert(payload)
      .select("id, data")
      .single();

    if (recordError) {
      throw new Error(recordError.message);
    }

    let activityAgent: { id: string } | null = null;
    if (requestedAgentId) {
      const { data: requestedAgent } = await supabase
        .from("workspace_agents")
        .select("id")
        .eq("workspace_id", workspaceRow.id)
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
        .eq("workspace_id", workspaceRow.id)
        .in("type", ["copilot", "worker"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (fallbackAgent?.id) {
        activityAgent = { id: String(fallbackAgent.id) };
      }
    }

    const activityPayload = {
      workspace_id: workspaceRow.id,
      action: "document.uploaded_via_chat",
      details: {
        title: file.name,
        storage_path: storagePath,
        session_title: sessionTitle || "New chat",
        status: "pending",
        related_record_id: relatedRecordId,
        runtime_conversation_id: runtimeConversationId,
        workspace_conversation_id: workspaceConversationId,
      },
    };

    if (activityAgent?.id) {
      const { error: activityError } = await supabase.from("agent_activity").insert({
        ...activityPayload,
        agent_id: String(activityAgent.id),
      });
      if (activityError) {
        throw new Error(activityError.message);
      }
    } else {
      const fallbackEvent = {
        ...activityPayload,
        agent_id: null,
      };
      await supabase.from("agent_events").insert({
        workspace_id: workspaceRow.id,
        source_agent_id: null,
        event_type: "document.uploaded_via_chat",
        payload: fallbackEvent,
      });
    }

    const { data: reviewTask, error: taskError } = await supabase
      .from("workspace_tasks")
      .insert({
        workspace_id: workspaceRow.id,
        source_record_id: String(recordRow.id),
        source_object_id: documentsObject.id,
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
        },
        created_by: user.id,
      })
      .select("id")
      .single();

    if (taskError) {
      if (!taskError.message.includes("workspace_tasks")) {
        throw new Error(taskError.message);
      }
    }
    const reviewTaskId = reviewTask?.id ? String(reviewTask.id) : null;

    const evidenceInsert = {
      workspace_id: workspaceRow.id,
      document_record_id: String(recordRow.id),
      related_record_id: relatedRecordId,
      related_task_id: reviewTaskId,
      source_anchor: "upload:chat",
      quote: null,
      metadata: {
        document_name: file.name,
        mime_type: file.type || "application/octet-stream",
        runtime_conversation_id: runtimeConversationId,
        workspace_conversation_id: workspaceConversationId,
      },
      created_by: user.id,
    };

    const { error: evidenceError } = await supabase
      .from("workspace_evidence_links")
      .insert(evidenceInsert);

    if (evidenceError && !evidenceError.message.includes("workspace_evidence_links")) {
      throw new Error(evidenceError.message);
    }

    return Response.json({
      recordId: recordRow.id,
      taskId: reviewTaskId,
      documentName: file.name,
      publicUrl: publicAsset.publicUrl,
      contentType: file.type || "application/octet-stream",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload document.";
    return Response.json({ error: message }, { status: 400 });
  }
}
