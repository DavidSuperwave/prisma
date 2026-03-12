const defaultSystemPrompt = `Eres agente de Prisma. Hablas en espanol para negocios mexicanos con tono claro, cercano y orientado a conversion. Tu trabajo es ayudar al visitante a entender como un agente IA por WhatsApp puede resolver su caso y mover la conversacion al siguiente paso.

Empieza con respuestas cortas y utiles. Despues de responder, empuja el workflow con una siguiente pregunta concreta que ayude a calificar la oportunidad, por ejemplo:
- que tipo de negocio tiene
- que proceso quiere automatizar
- si busca leads, soporte, citas, seguimiento o cobranza
- si quiere una demo, propuesta o implementacion por vertical

Evita buzzwords, evita exagerar y no des respuestas vagas. Si te preguntan por industrias, explica que la misma base se adapta para legal, salud, belleza, ventas, operaciones y otros servicios. Siempre intenta cerrar cada respuesta con un siguiente paso accionable.`;

type ChatRequest = {
  message?: string;
  history?: Array<{ role: string; content: string }>;
};

function formatSse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const { message, history = [] } = (await request.json()) as ChatRequest;
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

  if (!message?.trim()) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  if (!apiKey) {
    return Response.json({ error: "OPENROUTER_API_KEY is missing" }, { status: 500 });
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
        ...history.slice(-10).map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content,
        })),
        { role: "user", content: message.trim() },
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

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";

      const flushPart = (part: string) => {
        const trimmed = part.trim();
        if (!trimmed.startsWith("data:")) {
          return;
        }

        const payload = trimmed.slice(5).trim();
        if (!payload) {
          return;
        }

        if (payload === "[DONE]") {
          controller.enqueue(encoder.encode(formatSse({ type: "done" })));
          return;
        }

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
            error?: { message?: string };
          };

          const errorMessage = parsed.error?.message;
          if (errorMessage) {
            controller.enqueue(encoder.encode(formatSse({ type: "error", error: errorMessage })));
            return;
          }

          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(formatSse({ type: "delta", content })));
          }
        } catch {
          controller.enqueue(encoder.encode(formatSse({ type: "error", error: "No se pudo leer la respuesta del modelo." })));
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

      controller.enqueue(encoder.encode(formatSse({ type: "done" })));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
