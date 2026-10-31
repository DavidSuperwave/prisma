import {
  authorizeWorkspaceMember,
  canAccessConversation,
  mapConversation,
  requireSupabaseAdmin,
  type ConversationRow,
} from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; conversationId: string }>;
};

type ConversationMessageRow = {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
};

const conversationSelect =
  "id, workspace_id, agent_id, title, source, runtime_conversation_id, channel_type, channel_identity, metadata, agent_paused, message_count, last_message_at, created_by, created_at, updated_at";
const defaultConversationTitle = "Nuevo chat";
const titleLimit = 120;

async function loadConversation(workspaceId: string, conversationId: string) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_conversations")
    .select(conversationSelect)
    .eq("workspace_id", workspaceId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return (data as ConversationRow | null) ?? null;
}

async function loadRecentMessages(workspaceId: string, conversationId: string) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_conversation_messages")
    .select("role, content")
    .eq("workspace_id", workspaceId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as ConversationMessageRow[]).reverse();
}

function extractHermesText(payload: unknown) {
  const parsed = payload as Record<string, unknown>;
  if (typeof parsed.output_text === "string" && parsed.output_text.trim().length > 0) {
    return parsed.output_text;
  }

  const output = parsed.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown[] }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string" && text.trim().length > 0) {
          return text;
        }
      }
    }
  }

  const choices = parsed.choices;
  if (Array.isArray(choices)) {
    const choice = choices[0] as { message?: { content?: unknown } } | undefined;
    const content = choice?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((chunk) => {
          if (typeof chunk === "string") return chunk;
          if (chunk && typeof chunk === "object" && "text" in chunk && typeof chunk.text === "string") {
            return chunk.text;
          }
          return "";
        })
        .join(" ");
    }
  }

  return "";
}

function normalizeTitle(rawTitle: string) {
  const collapsed = rawTitle.replace(/\s+/g, " ").trim();
  const unquoted = collapsed.replace(/^["'`]+|["'`]+$/g, "").trim();
  return unquoted.slice(0, titleLimit);
}

function buildTranscript(messages: ConversationMessageRow[]) {
  return messages
    .map((message) => ({
      role: message.role,
      content: typeof message.content === "string" ? message.content.trim() : "",
    }))
    .filter((message) => Boolean(message.content))
    .slice(-8)
    .map((message) => `${message.role}: ${message.content.slice(0, 400)}`)
    .join("\n");
}

async function generateTitleWithHermes(transcript: string) {
  const baseUrl = process.env.HERMES_API_BASE_URL?.trim();
  const apiKey = process.env.HERMES_API_KEY?.trim();
  const model =
    process.env.HERMES_LIGHT_MODEL?.trim() ||
    process.env.HERMES_MODEL?.trim() ||
    process.env.HERMES_DEFAULT_MODEL?.trim() ||
    "hermes-agent";
  if (!baseUrl || !apiKey) {
    return { error: "Hermes runtime is required for automatic titles." as const };
  }

  const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      store: false,
      max_output_tokens: 48,
      input: [
        "Eres un asistente que resume conversaciones en un titulo corto.",
        "Devuelve una sola linea, clara, en espanol neutro, sin comillas y de maximo 8 palabras.",
        `Genera un titulo para esta conversacion:\n${transcript}`,
      ].join("\n"),
    }),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    return {
      error: errorText || "Unable to reach Hermes for title generation." as const,
    };
  }

  const payload = (await upstream.json().catch(() => ({}))) as unknown;
  const title = normalizeTitle(extractHermesText(payload));
  if (!title) {
    return { error: "Hermes did not return a valid conversation title." as const };
  }
  return { title };
}

export async function POST(_request: Request, context: Context) {
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
    if (!canAccessConversation(workspaceContext, conversation, true)) {
      return Response.json({ error: "You do not have access to this conversation." }, { status: 403 });
    }

    if (conversation.title.trim() && conversation.title.trim() !== defaultConversationTitle) {
      return Response.json({ conversation: mapConversation(conversation), generated: false, skipped: "title_locked" });
    }

    const transcript = buildTranscript(await loadRecentMessages(workspaceContext.workspaceId, conversationId));
    if (!transcript) {
      return Response.json({ error: "Not enough conversation content to generate a title." }, { status: 400 });
    }

    const generated = await generateTitleWithHermes(transcript);
    if ("error" in generated) {
      return Response.json({ error: generated.error }, { status: 503 });
    }

    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("workspace_conversations")
      .update({
        title: generated.title,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceContext.workspaceId)
      .eq("id", conversationId)
      .eq("title", conversation.title)
      .select(conversationSelect)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      const latest = await loadConversation(workspaceContext.workspaceId, conversationId);
      if (!latest) {
        return Response.json({ error: "Conversation not found." }, { status: 404 });
      }
      return Response.json({ conversation: mapConversation(latest), generated: false, skipped: "title_changed" });
    }

    return Response.json({ conversation: mapConversation(data as ConversationRow), generated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate conversation title.";
    return Response.json({ error: message }, { status: 400 });
  }
}
