"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Paperclip, Send, Sparkles, X } from "lucide-react";
import { consumeCompleteSseDataLines } from "@/lib/chatSseClient";

export type OperatorAgentSummary = {
  id: string;
  name: string;
  type: "copilot" | "channel" | "worker";
  status: string;
  isPrimaryCopilot?: boolean;
};

export type OperatorAppContext = {
  current_tab?: string;
  current_object?: string | null;
  current_view?: string | null;
  current_record_title?: string | null;
  queue_preview?: string[];
  dataset_object_id?: string | null;
  dataset_object_slug?: string | null;
  dataset_search_query?: string | null;
  visible_record_count?: number;
  dataset_field_summary?: string;
  dataset_field_catalog?: Array<{
    key: string;
    name: string;
    type: string;
    required?: boolean;
    hidden?: boolean;
  }>;
};

type OperatorAttachmentRef = { kind: "record" | "folder"; id: string };

type OperatorMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: Array<{ id: string; fileName: string; publicUrl: string; contentType: string }>;
};

type OperatorSession = {
  id: string;
  runtimeConversationId: string;
  agentId: string;
  title: string;
  messages: OperatorMessage[];
  updatedAt: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  agents: OperatorAgentSummary[];
  primaryAgentId: string | null;
  appContext: OperatorAppContext;
};

function generateId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function toTimeLabel(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function pickDefaultAgent(agents: OperatorAgentSummary[], primaryAgentId: string | null) {
  const byPrimary =
    primaryAgentId && agents.find((agent) => agent.id === primaryAgentId) ? primaryAgentId : null;
  return (
    byPrimary ??
    agents.find((agent) => agent.isPrimaryCopilot)?.id ??
    agents.find((agent) => agent.type === "copilot" && agent.status === "active")?.id ??
    agents.find((agent) => agent.type === "copilot")?.id ??
    agents.find((agent) => agent.status === "active")?.id ??
    agents[0]?.id ??
    ""
  );
}

export function OperatorCopilotSidebar({
  open,
  onClose,
  workspaceId,
  workspaceSlug,
  userId,
  agents,
  primaryAgentId,
  appContext,
}: Props) {
  const defaultAgentId = useMemo(
    () => pickDefaultAgent(agents, primaryAgentId),
    [agents, primaryAgentId],
  );
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === defaultAgentId) ?? null,
    [agents, defaultAgentId],
  );

  const [session, setSession] = useState<OperatorSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAttachmentRefs, setPendingAttachmentRefs] = useState<OperatorAttachmentRef[]>([]);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    // Sidebar is fixed; don't lock body scroll on desktop.
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const ensureSession = useCallback(async (): Promise<OperatorSession | null> => {
    if (!defaultAgentId) return null;
    if (session && session.agentId === defaultAgentId) return session;

    setSessionLoading(true);
    setError(null);
    try {
      const listResponse = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/conversations?agentId=${encodeURIComponent(defaultAgentId)}&source=operator_sidebar`,
      );
      const listPayload = (await listResponse.json().catch(() => ({}))) as {
        error?: string;
        conversations?: Array<{
          id: string;
          title: string;
          source: string;
          runtimeConversationId: string;
          updatedAt: string;
        }>;
      };
      if (!listResponse.ok) {
        throw new Error(listPayload.error ?? "No se pudo cargar la conversación del operador.");
      }

      let conversation = listPayload.conversations?.[0] ?? null;
      if (!conversation) {
        const createResponse = await fetch(
          `/api/workspaces/${encodeURIComponent(workspaceSlug)}/conversations`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId: defaultAgentId,
              source: "operator_sidebar",
              title: "Operador",
            }),
          },
        );
        const createPayload = (await createResponse.json().catch(() => ({}))) as {
          error?: string;
          conversation?: {
            id: string;
            title: string;
            source: string;
            runtimeConversationId: string;
            updatedAt: string;
          };
        };
        if (!createResponse.ok || !createPayload.conversation) {
          throw new Error(createPayload.error ?? "No se pudo crear la conversación del operador.");
        }
        conversation = createPayload.conversation;
      }

      let messages: OperatorMessage[] = [];
      try {
        const msgResponse = await fetch(
          `/api/workspaces/${encodeURIComponent(workspaceSlug)}/conversations/${encodeURIComponent(conversation.id)}/messages`,
        );
        if (msgResponse.ok) {
          const msgPayload = (await msgResponse.json().catch(() => ({}))) as {
            messages?: Array<{
              id: string;
              role: string;
              content: string;
              attachments?: unknown[];
              createdAt: string;
            }>;
          };
          messages = (msgPayload.messages ?? []).map((message) => ({
            id: message.id,
            role: message.role === "assistant" ? "assistant" : "user",
            content: message.content ?? "",
            timestamp: toTimeLabel(message.createdAt),
            attachments: Array.isArray(message.attachments)
              ? (message.attachments as Array<{
                  id: string;
                  fileName: string;
                  publicUrl: string;
                  contentType: string;
                }>)
              : [],
          }));
        }
      } catch {
        // ignore; start with an empty thread
      }

      const nextSession: OperatorSession = {
        id: conversation.id,
        runtimeConversationId: conversation.runtimeConversationId,
        agentId: defaultAgentId,
        title: conversation.title || "Operador",
        messages,
        updatedAt: conversation.updatedAt,
      };
      setSession(nextSession);
      return nextSession;
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo iniciar la conversación con el operador.",
      );
      return null;
    } finally {
      setSessionLoading(false);
    }
  }, [defaultAgentId, session, workspaceSlug]);

  useEffect(() => {
    if (open && defaultAgentId && (!session || session.agentId !== defaultAgentId)) {
      void ensureSession();
    }
  }, [open, defaultAgentId, ensureSession, session]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [session?.messages.length, isSending]);

  const updateMessages = useCallback(
    (updater: (messages: OperatorMessage[]) => OperatorMessage[]) => {
      setSession((current) =>
        current
          ? {
              ...current,
              messages: updater(current.messages),
              updatedAt: new Date().toISOString(),
            }
          : current,
      );
    },
    [],
  );

  function classifyFile(file: File): "pdf" | "spreadsheet" | "image" | "other" {
    const mime = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
    if (
      mime.startsWith("image/") ||
      /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)
    ) {
      return "image";
    }
    if (
      mime.includes("spreadsheet") ||
      mime === "text/csv" ||
      /\.(csv|xlsx?|tsv)$/i.test(name)
    ) {
      return "spreadsheet";
    }
    return "other";
  }

  async function handleAttach(file: File) {
    const active = await ensureSession();
    if (!active || !selectedAgent) return;
    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sessionTitle", active.title);
      formData.append("conversationId", active.runtimeConversationId);
      formData.append("workspaceConversationId", active.id);
      formData.append("agentId", selectedAgent.id);
      formData.append("kind", classifyFile(file));

      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/documents`,
        {
          method: "POST",
          body: formData,
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        recordId?: string;
        documentName?: string;
        publicUrl?: string;
        contentType?: string;
      };
      if (!response.ok || !payload.recordId || !payload.documentName || !payload.publicUrl) {
        throw new Error(payload.error ?? "No se pudo adjuntar el archivo.");
      }

      const attachment = {
        id: payload.recordId,
        fileName: payload.documentName,
        publicUrl: payload.publicUrl,
        contentType: payload.contentType ?? file.type ?? "application/octet-stream",
      };
      setPendingAttachmentRefs((current) =>
        current.some((entry) => entry.kind === "record" && entry.id === attachment.id)
          ? current
          : [...current, { kind: "record", id: attachment.id }],
      );
      const systemMessage: OperatorMessage = {
        id: generateId("attach"),
        role: "user",
        content: `Adjunté el archivo ${attachment.fileName}. Úsalo para la siguiente acción.`,
        timestamp: toTimeLabel(new Date().toISOString()),
        attachments: [attachment],
      };
      updateMessages((messages) => [...messages, systemMessage]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "No se pudo adjuntar el archivo.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    if (!selectedAgent) {
      setError("No hay un copilot disponible en este workspace.");
      return;
    }
    const active = await ensureSession();
    if (!active) return;

    setError(null);
    setIsSending(true);
    const userMessage: OperatorMessage = {
      id: generateId("u"),
      role: "user",
      content: trimmed,
      timestamp: toTimeLabel(new Date().toISOString()),
    };
    const assistantId = generateId("a");
    const assistantMessage: OperatorMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: toTimeLabel(new Date().toISOString()),
    };
    updateMessages((messages) => [...messages, userMessage, assistantMessage]);
    setInput("");

    const attachmentRefsSnapshot = pendingAttachmentRefs.map((entry) => ({
      kind: entry.kind,
      id: entry.id,
    }));
    const attachmentRecordIds = attachmentRefsSnapshot
      .filter((entry) => entry.kind === "record")
      .map((entry) => entry.id);
    const attachmentFolderIds = attachmentRefsSnapshot
      .filter((entry) => entry.kind === "folder")
      .map((entry) => entry.id);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          agentId: selectedAgent.id,
          conversationId: active.runtimeConversationId,
          appContext: {
            ...appContext,
            current_tab: appContext.current_tab ?? "data",
          },
          message: trimmed,
          attachmentRefs: attachmentRefsSnapshot,
        }),
      });

      // Persist the user message in the conversation store (best-effort).
      void fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/conversations/${encodeURIComponent(active.id)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "user",
            content: trimmed,
            metadata: {
              origin: "operator_sidebar",
              attachment_refs: {
                records: attachmentRecordIds,
                folders: attachmentFolderIds,
              },
              attachment_record_ids: attachmentRecordIds,
              attachment_folder_ids: attachmentFolderIds,
            },
          }),
        },
      );

      setPendingAttachmentRefs([]);

      if (!response.ok || !response.body) {
        const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorPayload.error ?? "No se pudo conectar con el copilot.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let streamError: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { remainder, dataLines } = consumeCompleteSseDataLines(buffer);
        buffer = remainder;

        for (const raw of dataLines) {
          if (raw === "[DONE]") continue;
          let payload: {
            type?: string;
            content?: string;
            text?: string;
            error?: string;
            name?: string;
            result?: { ok?: boolean; error?: string; data?: unknown };
          };
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
            assistantContent = `${assistantContent}${deltaPiece}`;
            updateMessages((messages) =>
              messages.map((message) =>
                message.id === assistantId
                  ? { ...message, content: `${message.content}${deltaPiece}` }
                  : message,
              ),
            );
          }
          if (payload.type === "tool_result") {
            const toolName = typeof payload.name === "string" ? payload.name : "tool";
            const ok = payload.result?.ok !== false;
            const note = ok
              ? `\n\n_Ejecutó la herramienta ${toolName}._`
              : `\n\n_La herramienta ${toolName} no está disponible: ${payload.result?.error ?? "error desconocido"}_`;
            assistantContent = `${assistantContent}${note}`;
            updateMessages((messages) =>
              messages.map((message) =>
                message.id === assistantId
                  ? { ...message, content: `${message.content}${note}` }
                  : message,
              ),
            );
          }
          if (payload.type === "error" && typeof payload.error === "string") {
            streamError = payload.error;
          }
        }
      }

      if (streamError) {
        throw new Error(streamError);
      }

      if (assistantContent.trim().length === 0) {
        updateMessages((messages) =>
          messages.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content:
                    "No recibí respuesta del copilot. Intenta de nuevo en unos segundos.",
                }
              : message,
          ),
        );
      } else {
        // Persist assistant reply (best-effort).
        void fetch(
          `/api/workspaces/${encodeURIComponent(workspaceSlug)}/conversations/${encodeURIComponent(active.id)}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: "assistant",
              content: assistantContent,
              metadata: { origin: "operator_sidebar" },
            }),
          },
        );
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo conectar con el copilot.";
      setError(message);
      updateMessages((messages) =>
        messages.map((msg) =>
          msg.id === assistantId && msg.content.length === 0
            ? { ...msg, content: `(${message})` }
            : msg,
        ),
      );
    } finally {
      setIsSending(false);
    }
  }

  if (!open) return null;

  const quickPrompts = [
    "Actualiza los precios usando este PDF",
    "Crea un registro nuevo en esta tabla",
    "Configura una automatización semanal",
    "Resume los registros visibles",
  ];

  const renderAttachments = (attachments?: OperatorMessage["attachments"]) => {
    if (!attachments || attachments.length === 0) return null;
    return (
      <div style={attachmentRowStyle}>
        {attachments.map((attachment) => (
          <a
            key={attachment.id}
            href={attachment.publicUrl}
            target="_blank"
            rel="noreferrer"
            style={attachmentChipStyle}
          >
            <Paperclip size={12} />
            {attachment.fileName}
          </a>
        ))}
      </div>
    );
  };

  const messages = session?.messages ?? [];
  const isEmpty = messages.length === 0 && !sessionLoading;

  return (
    <>
      <div style={backdropStyle} onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Habla con Operador"
        style={sidebarStyle}
      >
        <header style={headerStyle}>
          <div style={headerTextStyle}>
            <span style={eyebrowStyle}>Copilot</span>
            <h3 style={titleStyle}>
              <Sparkles size={14} aria-hidden style={{ color: "var(--workspace-accent-strong, #2563eb)" }} />
              {selectedAgent?.name ?? "Operador"}
            </h3>
            <p style={subtitleStyle}>
              {appContext.current_object
                ? `Trabajando sobre ${appContext.current_object}${appContext.current_view ? ` · ${appContext.current_view}` : ""}`
                : "Pide cambios, automatizaciones o cargas de datos."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={closeButtonStyle}
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div ref={messagesRef} style={messagesStyle}>
          {sessionLoading && messages.length === 0 ? (
            <div style={hintStyle}>Cargando conversación…</div>
          ) : null}

          {isEmpty ? (
            <div style={emptyStateStyle}>
              <p style={emptyTitleStyle}>
                Habla con el operador como lo harías con un compañero de equipo.
              </p>
              <p style={emptyDescriptionStyle}>
                Puede modificar, agregar o eliminar registros, configurar automatizaciones y
                procesar archivos como PDFs de lista de precios. Usa el clip para adjuntar.
              </p>
              <div style={quickRowStyle}>
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setInput(prompt);
                      inputRef.current?.focus();
                    }}
                    style={quickPillStyle}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message) => (
            <div
              key={message.id}
              style={message.role === "user" ? bubbleUserStyle : bubbleAssistantStyle}
            >
              <div style={bubbleMetaStyle}>
                {message.role === "user" ? "Tú" : selectedAgent?.name ?? "Operador"}
                {message.timestamp ? ` · ${message.timestamp}` : ""}
              </div>
              <div style={bubbleContentStyle}>
                {message.content || (message.role === "assistant" && isSending ? "Escribiendo…" : "")}
              </div>
              {renderAttachments(message.attachments)}
            </div>
          ))}
        </div>

        {error ? <div style={errorBannerStyle}>{error}</div> : null}

        <div style={composerStyle}>
          <div style={composerInnerStyle}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isSending || !selectedAgent}
              style={iconButtonStyle}
              aria-label="Adjuntar archivo"
              title="Adjuntar archivo (PDF, imagen, CSV...)"
            >
              <Paperclip size={14} aria-hidden />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.csv,.xlsx,.xls,image/*"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleAttach(file);
                }
                event.target.value = "";
              }}
            />
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={
                selectedAgent
                  ? "Pídele al operador que actualice precios, cree automatizaciones, etc."
                  : "No hay un copilot disponible."
              }
              rows={2}
              style={textareaStyle}
              disabled={!selectedAgent}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim() || isSending || !selectedAgent}
              style={sendButtonStyle}
              aria-label="Enviar"
              title="Enviar (Enter)"
            >
              <Send size={14} aria-hidden />
            </button>
          </div>
          {isUploading ? <p style={hintStyle}>Subiendo archivo…</p> : null}
        </div>
      </aside>
    </>
  );
}

const Z_BACKDROP = 60;
const Z_SIDEBAR = 61;

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.35)",
  zIndex: Z_BACKDROP,
  backdropFilter: "blur(2px)",
};

const sidebarStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  height: "100vh",
  width: "min(440px, 92vw)",
  background: "#ffffff",
  borderLeft: "1px solid var(--workspace-border)",
  boxShadow: "-12px 0 40px rgba(15, 23, 42, 0.18)",
  display: "flex",
  flexDirection: "column",
  zIndex: Z_SIDEBAR,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px",
  borderBottom: "1px solid var(--workspace-border)",
  background: "#ffffff",
};

const headerTextStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--workspace-muted)",
};

const titleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const closeButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--workspace-border)",
  background: "#ffffff",
  color: "var(--workspace-muted)",
  cursor: "pointer",
};

const messagesStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  background: "#f7f8fb",
};

const emptyStateStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 14,
  background: "#ffffff",
  border: "1px dashed var(--workspace-border)",
  borderRadius: "var(--radius-lg)",
};

const emptyTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const emptyDescriptionStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--workspace-muted)",
};

const quickRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 4,
};

const quickPillStyle: CSSProperties = {
  fontSize: 11,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  background: "#ffffff",
  color: "var(--workspace-text)",
  cursor: "pointer",
};

const bubbleBase: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "8px 10px",
  borderRadius: "var(--radius-md)",
  fontSize: 13,
  maxWidth: "100%",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const bubbleUserStyle: CSSProperties = {
  ...bubbleBase,
  alignSelf: "flex-end",
  background: "var(--workspace-accent-strong, #2563eb)",
  color: "#ffffff",
  maxWidth: "85%",
};

const bubbleAssistantStyle: CSSProperties = {
  ...bubbleBase,
  alignSelf: "flex-start",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  color: "var(--workspace-text)",
  maxWidth: "90%",
};

const bubbleMetaStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  opacity: 0.7,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const bubbleContentStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
};

const attachmentRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 4,
};

const attachmentChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  background: "rgba(15, 23, 42, 0.06)",
  color: "var(--workspace-text)",
  textDecoration: "none",
};

const composerStyle: CSSProperties = {
  padding: "10px 14px 14px",
  borderTop: "1px solid var(--workspace-border)",
  background: "#ffffff",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const composerInnerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 6,
};

const iconButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--workspace-border)",
  background: "#ffffff",
  color: "var(--workspace-muted)",
  cursor: "pointer",
  flex: "0 0 auto",
};

const textareaStyle: CSSProperties = {
  flex: 1,
  minHeight: 36,
  maxHeight: 140,
  resize: "none",
  padding: "8px 10px",
  fontSize: 13,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--workspace-border)",
  background: "#ffffff",
  color: "var(--workspace-text)",
  outline: "none",
  fontFamily: "inherit",
};

const sendButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--workspace-accent-strong, #2563eb)",
  background: "var(--workspace-accent-strong, #2563eb)",
  color: "#ffffff",
  cursor: "pointer",
  flex: "0 0 auto",
};

const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: "var(--workspace-muted)",
};

const errorBannerStyle: CSSProperties = {
  margin: "0 14px",
  padding: "8px 10px",
  fontSize: 12,
  color: "#b91c1c",
  background: "rgba(239, 68, 68, 0.08)",
  border: "1px solid rgba(239, 68, 68, 0.25)",
  borderRadius: "var(--radius-md)",
};
