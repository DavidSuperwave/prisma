"use client";

import { useCallback, useState } from "react";
import { consumeCompleteSseDataLines } from "@/lib/chatSseClient";
import type { ChatMessage } from "./types";

type ApiHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

function currentTimeLabel() {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export function useLiveChat(isActive: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "live-welcome",
      role: "agent",
      content: "Hola soy agente de prisma con que te puedo ayudar.",
      timestamp: currentTimeLabel(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || !isActive) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: currentTimeLabel(),
    };

    const assistantId = `assistant-${Date.now()}`;
    const nextMessages = [...messages, userMessage];

    setMessages([
      ...nextMessages,
      {
        id: assistantId,
        role: "agent",
        content: "",
        timestamp: currentTimeLabel(),
      },
    ]);
    setInput("");
    setIsLoading(true);
    setError(null);

    const history: ApiHistoryMessage[] = nextMessages.map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
    }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          history,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("No se pudo conectar con el agente.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const { remainder, dataLines } = consumeCompleteSseDataLines(buffer);
        buffer = remainder;

        for (const raw of dataLines) {
          if (raw === "[DONE]") {
            continue;
          }
          let payload: { type: string; content?: string; text?: string; error?: string };
          try {
            payload = JSON.parse(raw) as typeof payload;
          } catch {
            continue;
          }
          const deltaPiece =
            typeof payload.content === "string"
              ? payload.content
              : typeof payload.text === "string"
                ? payload.text
                : "";
          if (payload.type === "delta" && deltaPiece) {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, content: `${message.content}${deltaPiece}` }
                  : message,
              ),
            );
          }

          if (payload.type === "error") {
            throw new Error(payload.error ?? "Error al generar respuesta.");
          }
        }
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Error desconocido";
      setError(message);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: "No pude responder en este momento. Intenta de nuevo o revisa la configuracion del API key.",
              }
            : item,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [input, isActive, isLoading, messages]);

  return {
    messages,
    input,
    setInput,
    sendMessage,
    isLoading,
    error,
  };
}