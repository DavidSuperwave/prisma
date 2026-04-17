import {
  authorizeWorkspaceMember,
  canAccessConversation,
  mapConversation,
  requireSupabaseAdmin,
  type ConversationRow,
} from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";

type Context = {
  params: Promise<{ workspaceSlug: string; conversationId: string }>;
};

type UpdateConversationRequest = {
  title?: string;
};

async function loadConversation(workspaceId: string, conversationId: string) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_conversations")
    .select("id, workspace_id, agent_id, title, source, runtime_conversation_id, channel_type, channel_identity, metadata, message_count, last_message_at, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return (data as ConversationRow | null) ?? null;
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug, conversationId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) {
      return auth.error;
    }
    const workspaceContext = auth.context;
    const includeShared = new URL(request.url).searchParams.get("includeShared") === "true";
    const conversation = await loadConversation(workspaceContext.workspaceId, conversationId);
    if (!conversation) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }
    if (!canAccessConversation(workspaceContext, conversation, includeShared)) {
      return Response.json({ error: "You do not have access to this conversation." }, { status: 403 });
    }

    return Response.json({ conversation: mapConversation(conversation) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load conversation.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, conversationId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) {
      return auth.error;
    }
    const workspaceContext = auth.context;
    const payload = (await request.json().catch(() => ({}))) as UpdateConversationRequest;
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    if (!title) {
      return Response.json({ error: "title is required." }, { status: 400 });
    }

    const conversation = await loadConversation(workspaceContext.workspaceId, conversationId);
    if (!conversation) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }
    if (!canAccessConversation(workspaceContext, conversation, true)) {
      return Response.json({ error: "You do not have access to this conversation." }, { status: 403 });
    }

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_conversations")
      .update({
        title: title.slice(0, 120),
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceContext.workspaceId)
      .eq("id", conversationId)
      .select("id, workspace_id, agent_id, title, source, runtime_conversation_id, channel_type, channel_identity, metadata, message_count, last_message_at, created_by, created_at, updated_at")
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }

    return Response.json({ conversation: mapConversation(data as ConversationRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update conversation.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { workspaceSlug, conversationId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) {
      return auth.error;
    }
    const workspaceContext = auth.context;
    const includeShared = new URL(request.url).searchParams.get("includeShared") === "true";
    const conversation = await loadConversation(workspaceContext.workspaceId, conversationId);
    if (!conversation) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }

    const canDeleteOwn = conversation.created_by === workspaceContext.user.id && conversation.source === "workspace_chat";
    const canDeleteShared = includeShared && workspaceContext.role === "admin";
    if (!canDeleteOwn && !canDeleteShared) {
      return Response.json({ error: "You do not have permission to delete this conversation." }, { status: 403 });
    }

    const supabase = requireSupabaseAdmin();
    const { error } = await supabase
      .from("workspace_conversations")
      .delete()
      .eq("workspace_id", workspaceContext.workspaceId)
      .eq("id", conversationId);
    if (error) {
      throw new Error(error.message);
    }

    return Response.json({ deletedConversationId: conversationId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete conversation.";
    return Response.json({ error: message }, { status: 400 });
  }
}

