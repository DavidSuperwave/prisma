const defaultSystemPrompt = `Eres agente de Prisma. Hablas en espanol para negocios mexicanos con tono claro, cercano y orientado a conversion. Tu trabajo es ayudar al visitante a entender como un agente IA por WhatsApp puede resolver su caso y mover la conversacion al siguiente paso.

Empieza con respuestas cortas y utiles. Despues de responder, empuja el workflow con una siguiente pregunta concreta que ayude a calificar la oportunidad, por ejemplo:
- que tipo de negocio tiene
- que proceso quiere automatizar
- si busca leads, soporte, citas, seguimiento o cobranza
- si quiere una demo, propuesta o implementacion por vertical

Evita buzzwords, evita exagerar y no des respuestas vagas. Si te preguntan por industrias, explica que la misma base se adapta para legal, salud, belleza, ventas, operaciones y otros servicios. Siempre intenta cerrar cada respuesta con un siguiente paso accionable.`;

type ChatHistoryMessage = { role: string; content: string };

type ChatRequest = {
  message?: string;
  history?: ChatHistoryMessage[];
  conversation_id?: string;
  conversationId?: string;
  agent_id?: string;
  agentId?: string;
};

type ChatProvider = "hermes" | "openrouter";

const sseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

function formatSse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function resolveProvider() {
  const configured = (process.env.PRISMA_CHAT_PROVIDER ?? "auto").toLowerCase();
  if (configured === "hermes") {
    return "hermes" as ChatProvider;
  }
  if (configured === "openrouter") {
    return "openrouter" as ChatProvider;
  }

  return process.env.HERMES_API_BASE_URL && process.env.HERMES_API_KEY ? "hermes" : "openrouter";
}

function extractDeltaText(parsed: Record<string, unknown>) {
  const choices = parsed.choices as Array<{ delta?: { content?: string } }> | undefined;
  const messageChoices = parsed.choices as Array<{ message?: { content?: string } }> | undefined;
  const delta = choices?.[0]?.delta?.content;
  if (typeof delta === "string" && delta.length > 0) {
    return delta;
  }

  if (typeof parsed.delta === "string" && parsed.delta.length > 0) {
    return parsed.delta;
  }

  if (typeof parsed.output_text === "string" && parsed.output_text.length > 0) {
    return parsed.output_text;
  }

  const messageContent = messageChoices?.[0]?.message?.content;
  if (typeof messageContent === "string" && messageContent.length > 0) {
    return messageContent;
  }

  return "";
}

function extractErrorText(parsed: Record<string, unknown>) {
  const withError = parsed.error as { message?: string } | undefined;
  if (typeof withError?.message === "string" && withError.message.length > 0) {
    return withError.message;
  }

  if (parsed.type === "error" && typeof parsed.message === "string") {
    return parsed.message;
  }

  return "";
}

function isDonePayload(rawPayload: string, parsed: Record<string, unknown>) {
  if (rawPayload === "[DONE]") {
    return true;
  }

  const payloadType = typeof parsed.type === "string" ? parsed.type : "";
  return payloadType === "response.completed" || payloadType === "response.output_text.done";
}

function streamFromSseUpstream(upstream: Response) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.body?.getReader();
      if (!reader) {
        controller.enqueue(encoder.encode(formatSse({ type: "error", error: "No upstream stream available." })));
        controller.enqueue(encoder.encode(formatSse({ type: "done" })));
        controller.close();
        return;
      }

      let buffer = "";
      let sentDone = false;

      const emitDone = () => {
        if (sentDone) {
          return;
        }
        sentDone = true;
        controller.enqueue(encoder.encode(formatSse({ type: "done" })));
      };

      const flushPart = (part: string) => {
        const lines = part
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("data:"));

        for (const line of lines) {
          const payload = line.slice(5).trim();
          if (!payload) {
            continue;
          }

          if (payload === "[DONE]") {
            emitDone();
            continue;
          }

          try {
            const parsed = JSON.parse(payload) as Record<string, unknown>;
            const errorText = extractErrorText(parsed);
            if (errorText) {
              controller.enqueue(encoder.encode(formatSse({ type: "error", error: errorText })));
              continue;
            }

            if (isDonePayload(payload, parsed)) {
              emitDone();
              continue;
            }

            const delta = extractDeltaText(parsed);
            if (delta) {
              controller.enqueue(encoder.encode(formatSse({ type: "delta", content: delta })));
            }
          } catch {
            controller.enqueue(encoder.encode(formatSse({ type: "error", error: "No se pudo leer la respuesta del modelo." })));
          }
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          flushPart(part);
        }
      }

      if (buffer) {
        flushPart(buffer);
      }

      emitDone();
      controller.close();
    },
  });
}

async function streamFromJsonUpstream(upstream: Response) {
  const payload = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
  const text = payload ? extractDeltaText(payload) : "";

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const content = text || "No se recibio texto del agente.";
      controller.enqueue(encoder.encode(formatSse({ type: "delta", content })));
      controller.enqueue(encoder.encode(formatSse({ type: "done" })));
      controller.close();
    },
  });

  return new Response(stream, { headers: sseHeaders });
}

function buildHermesInput(message: string, history: ChatHistoryMessage[]) {
  if (!history.length) {
    return message.trim();
  }

  const transcript = history
    .slice(-10)
    .map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`)
    .join("\n");

  return `${transcript}\nUser: ${message.trim()}`;
}

async function callHermes(payload: ChatRequest) {
  const baseUrl = process.env.HERMES_API_BASE_URL;
  const apiKey = process.env.HERMES_API_KEY;
  const model = process.env.HERMES_MODEL ?? "hermes-agent";
  const conversationId =
    payload.conversation_id ??
    payload.conversationId ??
    process.env.HERMES_DEFAULT_CONVERSATION ??
    undefined;

  if (!baseUrl || !apiKey) {
    return Response.json(
      { error: "HERMES_API_BASE_URL or HERMES_API_KEY is missing for hErmes mode." },
      { status: 500 },
    );
  }

  const hermesResponse = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: buildHermesInput(payload.message ?? "", payload.history ?? []),
      conversation: conversationId,
      stream: true,
      store: true,
      metadata: payload.agent_id || payload.agentId ? { agent_id: payload.agent_id ?? payload.agentId } : undefined,
    }),
  });

  if (!hermesResponse.ok || !hermesResponse.body) {
    const errorText = await hermesResponse.text();
    return Response.json({ error: errorText || "Unable to reach hErmes runtime." }, { status: 502 });
  }

  const contentType = hermesResponse.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    return new Response(streamFromSseUpstream(hermesResponse), { headers: sseHeaders });
  }

  return streamFromJsonUpstream(hermesResponse);
}

async function callOpenRouter(payload: ChatRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

  if (!apiKey) {
    return Response.json({ error: "OPENROUTER_API_KEY is missing for OpenRouter mode." }, { status: 500 });
  }

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: "system", content: defaultSystemPrompt },
        ...(payload.history ?? []).slice(-10).map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content,
        })),
        { role: "user", content: payload.message?.trim() },
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errorText = await upstream.text();
    return Response.json(
      {
        error: errorText || "Unable to reach OpenRouter",
      },
      { status: 502 },
    );
  }

  return new Response(streamFromSseUpstream(upstream), { headers: sseHeaders });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as ChatRequest;
  const message = payload.message?.trim();
  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  const provider = resolveProvider();
  if (provider === "hermes") {
    return callHermes({ ...payload, message });
  }

  return callOpenRouter({ ...payload, message });
}
