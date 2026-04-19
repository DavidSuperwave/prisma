import {
  authorizeWorkspaceMember,
  canAccessConversation,
  requireSupabaseAdmin,
  type ConversationRow,
} from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { scrubAndStoreSecrets } from "@/lib/secretScrubber";
import { stripInlineToolCallsFromText } from "@/lib/stripInlineToolCalls";

type Context = {
  params: Promise<{ workspaceSlug: string; conversationId: string }>;
};

type CreateMessageRequest = {
  role?: "user" | "assistant" | "system" | "tool";
  content?: string;
  blocks?: unknown[];
  attachments?: unknown[];
  metadata?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function loadConversation(workspaceId: string, conversationId: string) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_conversations")
    .select("id, workspace_id, agent_id, title, source, runtime_conversation_id, channel_type, channel_identity, metadata, agent_paused, message_count, last_message_at, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return (data as ConversationRow | null) ?? null;
}

function mapMessage(row: Record<string, unknown>) {
  const role = String(row.role);
  const rawContent = String(row.content ?? "");
  // Sanitize historical assistant messages that were persisted before the
  // chat pipeline learned to strip inline tool_call envelopes. Without this
  // refreshing the thread re-renders raw `{"type":"toolcall",...}` JSON.
  const content = role === "assistant" ? stripInlineToolCallsFromText(rawContent) : rawContent;
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    workspaceId: String(row.workspace_id),
    agentId: row.agent_id ? String(row.agent_id) : null,
    role,
    content,
    blocks: Array.isArray(row.blocks) ? row.blocks : [],
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
  };
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

    const searchParams = new URL(request.url).searchParams;
    const limitRaw = Number(searchParams.get("limit") ?? "200");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 400) : 200;

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_conversation_messages")
      .select("id, conversation_id, workspace_id, agent_id, role, content, blocks, attachments, metadata, created_by, created_at")
      .eq("workspace_id", workspaceContext.workspaceId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({
      messages: (data ?? []).map((row) => mapMessage(row as Record<string, unknown>)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list messages.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug, conversationId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) {
      return auth.error;
    }
    const workspaceContext = auth.context;
    const conversation = await loadConversation(workspaceContext.workspaceId, conversationId);
    if (!conversation) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }
    const canWriteConversation =
      conversation.created_by === workspaceContext.user.id ||
      (conversation.source !== "workspace_chat" && workspaceContext.role !== "viewer");
    if (!canWriteConversation) {
      return Response.json({ error: "You do not have access to this conversation." }, { status: 403 });
    }

    const payload = (await request.json().catch(() => ({}))) as CreateMessageRequest;
    const role = payload.role;
    if (!role || !["user", "assistant", "system", "tool"].includes(role)) {
      return Response.json({ error: "role is required." }, { status: 400 });
    }
    let content = typeof payload.content === "string" ? payload.content : "";
    if (!content.trim() && !Array.isArray(payload.blocks) && !Array.isArray(payload.attachments)) {
      return Response.json({ error: "content, blocks, or attachments are required." }, { status: 400 });
    }
    const scrubMetadata: Record<string, unknown> = isRecord(payload.metadata) ? { ...payload.metadata } : {};
    if (role === "user" && content) {
      try {
        const scrubbed = await scrubAndStoreSecrets(content, {
          workspaceId: workspaceContext.workspaceId,
          createdBy: workspaceContext.user.id,
        });
        if (scrubbed.detected) {
          content = scrubbed.scrubbedContent;
          scrubMetadata.redactedSecrets = scrubbed.createdIntegrations;
        }
      } catch (error) {
        console.error("secretScrubber (messages POST) failed", error);
      }
    }

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_conversation_messages")
      .insert({
        conversation_id: conversationId,
        workspace_id: workspaceContext.workspaceId,
        agent_id: conversation.agent_id,
        role,
        content,
        blocks: Array.isArray(payload.blocks) ? payload.blocks : [],
        attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
        metadata: scrubMetadata,
        created_by: workspaceContext.user.id,
      })
      .select("id, conversation_id, workspace_id, agent_id, role, content, blocks, attachments, metadata, created_by, created_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({ message: mapMessage(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create message.";
    return Response.json({ error: message }, { status: 400 });
  }
}

