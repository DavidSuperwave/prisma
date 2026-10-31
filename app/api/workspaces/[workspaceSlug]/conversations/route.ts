import {
  authorizeWorkspaceMember,
  canAccessConversation,
  mapConversation,
  normalizeRuntimeConversationId,
  requireSupabaseAdmin,
  type ConversationRow,
} from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreateConversationRequest = {
  agentId?: string;
  title?: string;
  source?: string;
  runtimeConversationId?: string;
  channelType?: string | null;
  channelIdentity?: string | null;
  metadata?: Record<string, unknown>;
  seedMessages?: Array<{
    role?: string;
    content?: string;
    blocks?: unknown[];
    attachments?: unknown[];
    metadata?: Record<string, unknown>;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSource(raw: unknown) {
  const source = typeof raw === "string" ? raw.trim() : "";
  if (!source) {
    return "workspace_chat";
  }
  return source;
}

function isValidRole(raw: unknown) {
  if (typeof raw !== "string") {
    return false;
  }
  return raw === "user" || raw === "assistant" || raw === "system" || raw === "tool";
}

function conversationRecencyScore(row: ConversationRow) {
  const messageCount = Number(row.message_count ?? 0);
  const lastMessageAtMs = row.last_message_at && Number.isFinite(Date.parse(row.last_message_at))
    ? Date.parse(row.last_message_at)
    : 0;
  const updatedAtMs = Number.isFinite(Date.parse(row.updated_at))
    ? Date.parse(row.updated_at)
    : 0;
  return { messageCount, lastMessageAtMs, updatedAtMs };
}

function preferConversationRow(a: ConversationRow, b: ConversationRow) {
  const aScore = conversationRecencyScore(a);
  const bScore = conversationRecencyScore(b);
  if (aScore.messageCount !== bScore.messageCount) {
    return aScore.messageCount > bScore.messageCount ? a : b;
  }
  if (aScore.lastMessageAtMs !== bScore.lastMessageAtMs) {
    return aScore.lastMessageAtMs > bScore.lastMessageAtMs ? a : b;
  }
  return aScore.updatedAtMs >= bScore.updatedAtMs ? a : b;
}

function dedupeByRuntimeConversationId(rows: ConversationRow[]) {
  const byRuntime = new Map<string, ConversationRow>();
  for (const row of rows) {
    const key = typeof row.runtime_conversation_id === "string" && row.runtime_conversation_id.trim().length > 0
      ? row.runtime_conversation_id.trim()
      : String(row.id);
    const existing = byRuntime.get(key);
    byRuntime.set(key, existing ? preferConversationRow(existing, row) : row);
  }
  return Array.from(byRuntime.values()).sort(
    (left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at),
  );
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) {
      return auth.error;
    }
    const workspaceContext = auth.context;
    const supabase = requireSupabaseAdmin();
    const searchParams = new URL(request.url).searchParams;
    const requestedAgentId = searchParams.get("agentId");
    const requestedSource = normalizeSource(searchParams.get("source"));
    const includeShared = searchParams.get("includeShared") === "true";
    const limitRaw = Number(searchParams.get("limit") ?? "40");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 120) : 40;

    if (includeShared && workspaceContext.role === "viewer") {
      return Response.json({ error: "You do not have permission to view shared conversations." }, { status: 403 });
    }

    let query = supabase
      .from("workspace_conversations")
      .select("id, workspace_id, agent_id, title, source, runtime_conversation_id, channel_type, channel_identity, metadata, agent_paused, message_count, last_message_at, created_by, created_at, updated_at")
      .eq("workspace_id", workspaceContext.workspaceId)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (requestedAgentId) {
      query = query.eq("agent_id", requestedAgentId);
    }
    if (requestedSource) {
      query = query.eq("source", requestedSource);
    }
    if (!includeShared) {
      query = query.eq("created_by", workspaceContext.user.id);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as ConversationRow[];
    const visibleRowsRaw = includeShared
      ? rows.filter((row) => canAccessConversation(workspaceContext, row, includeShared))
      : rows;
    const visibleRows = dedupeByRuntimeConversationId(visibleRowsRaw);

    const agentIds = Array.from(new Set(visibleRows.map((row) => String(row.agent_id))));
    const agentById = new Map<string, { id: string; name: string; type: string; status: string }>();
    if (agentIds.length > 0) {
      const { data: agentRows, error: agentError } = await supabase
        .from("workspace_agents")
        .select("id, name, type, status")
        .in("id", agentIds);
      if (agentError) {
        throw new Error(agentError.message);
      }
      for (const agentRow of agentRows ?? []) {
        agentById.set(String(agentRow.id), {
          id: String(agentRow.id),
          name: String(agentRow.name),
          type: String(agentRow.type),
          status: String(agentRow.status),
        });
      }
    }

    return Response.json({
      conversations: visibleRows.map((row) => {
        const mapped = mapConversation(row);
        const agent = agentById.get(mapped.agentId) ?? null;
        return {
          ...mapped,
          agent,
        };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list conversations.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) {
      return auth.error;
    }
    const workspaceContext = auth.context;
    const supabase = requireSupabaseAdmin();
    const payload = (await request.json().catch(() => ({}))) as CreateConversationRequest;
    const agentId = typeof payload.agentId === "string" ? payload.agentId.trim() : "";
    if (!agentId) {
      return Response.json({ error: "agentId is required." }, { status: 400 });
    }

    const { data: agentRow, error: agentError } = await supabase
      .from("workspace_agents")
      .select("id, workspace_id, status")
      .eq("id", agentId)
      .eq("workspace_id", workspaceContext.workspaceId)
      .maybeSingle();
    if (agentError) {
      throw new Error(agentError.message);
    }
    if (!agentRow) {
      return Response.json({ error: "Agent not found." }, { status: 404 });
    }

    const source = normalizeSource(payload.source);
    const isSharedSource = source !== "workspace_chat";
    if (isSharedSource && workspaceContext.role === "viewer") {
      return Response.json({ error: "You do not have permission to create shared conversations." }, { status: 403 });
    }

    const title = typeof payload.title === "string" && payload.title.trim().length > 0
      ? payload.title.trim().slice(0, 120)
      : "Nuevo chat";
    const metadata = isRecord(payload.metadata) ? payload.metadata : {};
    const runtimeConversationId = normalizeRuntimeConversationId(payload.runtimeConversationId);

    const { data: existingConversation, error: existingConversationError } = await supabase
      .from("workspace_conversations")
      .select(
        "id, workspace_id, agent_id, title, source, runtime_conversation_id, channel_type, channel_identity, metadata, agent_paused, message_count, last_message_at, created_by, created_at, updated_at",
      )
      .eq("workspace_id", workspaceContext.workspaceId)
      .eq("runtime_conversation_id", runtimeConversationId)
      .order("message_count", { ascending: false })
      .order("last_message_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingConversationError) {
      throw new Error(existingConversationError.message);
    }
    if (existingConversation) {
      return Response.json({ conversation: mapConversation(existingConversation as ConversationRow) }, { status: 200 });
    }

    const { data: insertedConversation, error: insertError } = await supabase
      .from("workspace_conversations")
      .insert({
        workspace_id: workspaceContext.workspaceId,
        agent_id: agentId,
        title,
        source,
        runtime_conversation_id: runtimeConversationId,
        channel_type: payload.channelType?.trim() || null,
        channel_identity: payload.channelIdentity?.trim() || null,
        metadata,
        created_by: workspaceContext.user.id,
      })
      .select("id, workspace_id, agent_id, title, source, runtime_conversation_id, channel_type, channel_identity, metadata, agent_paused, message_count, last_message_at, created_by, created_at, updated_at")
      .single();

    let conversation: ConversationRow;
    let insertedNew = true;
    if (insertError) {
      if (insertError.code === "23505") {
        const { data: existingRow, error: existingError } = await supabase
          .from("workspace_conversations")
          .select(
            "id, workspace_id, agent_id, title, source, runtime_conversation_id, channel_type, channel_identity, metadata, agent_paused, message_count, last_message_at, created_by, created_at, updated_at",
          )
          .eq("workspace_id", workspaceContext.workspaceId)
          .eq("runtime_conversation_id", runtimeConversationId)
          .order("message_count", { ascending: false })
          .order("last_message_at", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(1)
          .single();
        if (existingError || !existingRow) {
          throw new Error(insertError.message);
        }
        conversation = existingRow as ConversationRow;
        insertedNew = false;
      } else {
        throw new Error(insertError.message);
      }
    } else {
      conversation = insertedConversation as ConversationRow;
    }
    const seedMessages = Array.isArray(payload.seedMessages) ? payload.seedMessages : [];
    if (insertedNew && seedMessages.length > 0) {
      const normalizedMessages = seedMessages
        .map((entry) => {
          const role = isValidRole(entry.role) ? entry.role : null;
          const content = typeof entry.content === "string" ? entry.content : "";
          if (!role || (!content && !Array.isArray(entry.blocks))) {
            return null;
          }
          return {
            conversation_id: conversation.id,
            workspace_id: workspaceContext.workspaceId,
            agent_id: agentId,
            role,
            content,
            blocks: Array.isArray(entry.blocks) ? entry.blocks : [],
            attachments: Array.isArray(entry.attachments) ? entry.attachments : [],
            metadata: isRecord(entry.metadata) ? entry.metadata : {},
            created_by: workspaceContext.user.id,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

      if (normalizedMessages.length > 0) {
        const { error: messagesError } = await supabase
          .from("workspace_conversation_messages")
          .insert(normalizedMessages);
        if (messagesError) {
          throw new Error(messagesError.message);
        }
      }
    }

    return Response.json(
      {
        conversation: mapConversation(conversation),
      },
      { status: insertedNew ? 201 : 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create conversation.";
    return Response.json({ error: message }, { status: 400 });
  }
}

