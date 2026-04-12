"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, CircleDot, Filter, LoaderCircle, MessageSquare, Search } from "lucide-react";
import type {
  PrismaWorkspaceActivity,
  PrismaWorkspaceField,
  PrismaWorkspaceObject,
  PrismaWorkspaceRecord,
  PrismaWorkspaceView,
} from "@/lib/workspaceStore";
import { applyViewToRecords, getRecordFieldValue } from "@/lib/workspaceStore";
import styles from "./workspace-panels.module.css";

type OverviewProps = {
  metrics: Array<{
    label: string;
    value: string;
    caption: string;
  }>;
  queueItems: Array<{
    id: string;
    title: string;
    subtitle: string;
    status: string;
  }>;
  activity: PrismaWorkspaceActivity[];
  suggestions: string[];
  agents: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    description: string | null;
    tools: string[];
    read: string[];
    write: string[];
    channels: string[];
    cronJobs: unknown[];
    memoryLabel: string;
  }>;
};

type DataPanelProps = {
  objects: PrismaWorkspaceObject[];
  fields: PrismaWorkspaceField[];
  views: PrismaWorkspaceView[];
  records: PrismaWorkspaceRecord[];
  askHref?: string;
};

type AgentPanelProps = {
  agents: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    description: string | null;
    tools: string[];
    read: string[];
    write: string[];
    channels: string[];
    cronJobs: unknown[];
    memoryLabel: string;
    soulMd?: string | null;
    runtimeLabel?: string;
  }>;
  activity: PrismaWorkspaceActivity[];
};

type QueuePanelProps = {
  queueItems: Array<{
    id: string;
    title: string;
    subtitle: string;
    status: string;
  }>;
};

type ChatPanelProps = {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  contextSummary: {
    activeTab: string;
    activeObjectName?: string | null;
    activeViewName?: string | null;
    activeRecordName?: string | null;
    queueTitles: string[];
  };
  copilotAgent: {
    id: string;
    name: string;
    status: string;
    description: string | null;
  } | null;
  askPrompt?: string | null;
};

type RecordDetailPanelProps = {
  title: string;
  status: string;
  owner: string;
  summary: string;
  askHref?: string | null;
  fields: Array<{
    label: string;
    value: string;
    tone?: "positive" | "neutral";
  }>;
  activity: Array<{
    title: string;
    detail: string;
    timestamp: string;
  }>;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type ChatAttachment = {
  id: string;
  fileName: string;
  publicUrl: string;
  contentType: string;
};

type ChatSession = {
  id: string;
  title: string;
  conversationId: string;
  messages: ChatMessage[];
  attachments: ChatAttachment[];
  updatedAt: string;
};

function createSession(userId: string) {
  const sessionId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return {
    id: sessionId,
    title: "Nuevo chat",
    conversationId: `user-${userId}-${sessionId}`,
    messages: [],
    attachments: [],
    updatedAt: new Date().toISOString(),
  } satisfies ChatSession;
}

function parseSseChunk(chunk: string) {
  return chunk
    .split("\n\n")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => part.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)));
}

function currentTimeLabel() {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function normalizeTone(status: string): StatusTone {
  const normalized = status.toLowerCase();
  if (["active", "success", "qualified", "completed", "online", "activo", "completado"].includes(normalized)) {
    return "active";
  }
  if (
    [
      "pending",
      "pending_docs",
      "follow_up",
      "awaiting_approval",
      "in_progress",
      "pendiente",
      "en_proceso",
    ].includes(normalized)
  ) {
    return "pending";
  }
  if (["needs_review", "review", "revisión", "revision", "partial"].includes(normalized)) {
    return "review";
  }
  if (["error", "blocked", "overdue", "failed", "vencido"].includes(normalized)) {
    return "error";
  }
  if (["info", "informativo", "cotizacion", "quote"].includes(normalized)) {
    return "info";
  }
  return "neutral";
}

function formatStatusLabel(status: string) {
  const tone = normalizeTone(status);
  if (tone === "active") return "Activo";
  if (tone === "pending") return "Pendiente";
  if (tone === "review") return "Revisión";
  if (tone === "error") return "Error";
  if (tone === "info") return "Info";
  return "Neutral";
}

function formatRelativeTime(dateInput: string) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "Ahora";
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMins < 60) return `hace ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays}d`;
}

export function OverviewPanel({ metrics, queueItems, activity, suggestions, agents }: OverviewProps) {
  return (
    <div className={styles.pageStack}>
      <section className={styles.statusStrip} aria-label="Resumen operativo">
        {metrics.slice(0, 4).map((metric) => (
          <article key={metric.label} className={styles.metricCard}>
            <p className={styles.metricValue}>{metric.value}</p>
            <p className={styles.metricLabel}>{metric.label}</p>
            <p className={styles.metricCaption}>{metric.caption}</p>
          </article>
        ))}
      </section>

      <section className={styles.homeGrid}>
        <div className={styles.priorityColumn}>
          <PanelTitle
            title="Cola de acción"
            description="Primero lo urgente: máximo cinco items para decidir rápido."
            actionLabel={queueItems.length > 5 ? "Ver todas" : undefined}
          />
          {queueItems.length === 0 ? (
            <EmptyState
              title="No hay items pendientes"
              description="Los agentes avisarán cuando algo requiera tu atención."
              icon={<CircleDot size={18} />}
            />
          ) : (
            <div className={styles.queueList}>
              {queueItems.slice(0, 5).map((item) => (
                <article key={item.id} className={styles.queueRow}>
                  <div className={styles.queueRowCopy}>
                    <p className={styles.queueRowTitle}>{item.title}</p>
                    <p className={styles.queueRowSubtitle}>{item.subtitle}</p>
                  </div>
                  <div className={styles.queueRowRight}>
                    <StatusBadge tone={normalizeTone(item.status)} label={formatStatusLabel(item.status)} />
                    <ArrowRight size={14} />
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className={styles.suggestionsBlock}>
            <PanelTitle title="Pasos sugeridos" description="Siguientes acciones propuestas por el agente CEO." />
            <div className={styles.suggestionsList}>
              {suggestions.slice(0, 3).map((suggestion) => (
                <button key={suggestion} type="button" className={styles.suggestionCard}>
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className={styles.contextColumn}>
          <div className={styles.contextPanel}>
            <PanelTitle title="Actividad reciente" description="Eventos más recientes del workspace." />
            {activity.length === 0 ? (
              <EmptyState title="Sin actividad" description="Aparecerá cuando inicie la operación." icon={<CircleDot size={18} />} />
            ) : (
              <div className={styles.activityList}>
                {activity.slice(0, 8).map((entry) => (
                  <div key={entry.id} className={styles.activityRow}>
                    <div className={styles.activityCopy}>
                      <p className={styles.activityTitle}>{entry.action}</p>
                      <p className={styles.activityDetail}>
                        {typeof entry.details.title === "string"
                          ? entry.details.title
                          : typeof entry.details.recommendation === "string"
                            ? entry.details.recommendation
                            : "Evento registrado"}
                      </p>
                    </div>
                    <span className={styles.activityDate}>{formatRelativeTime(entry.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.contextPanel}>
            <PanelTitle title="Cobertura del equipo" description="Estado de agentes visibles." />
            <div className={styles.coverageList}>
              {agents.slice(0, 4).map((agent) => (
                <div key={agent.id} className={styles.coverageRow}>
                  <div>
                    <p className={styles.coverageName}>{agent.name}</p>
                    <p className={styles.coverageMeta}>{agent.type}</p>
                  </div>
                  <StatusBadge tone={normalizeTone(agent.status)} label={formatStatusLabel(agent.status)} />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

export function QueuePanel({ queueItems }: QueuePanelProps) {
  return (
    <section className={styles.panelSection}>
      <PanelTitle
        title="Cola de prioridad"
        description="Opera por urgencia y contexto. Cada fila representa una decisión."
      />
      {queueItems.length === 0 ? (
        <EmptyState
          title="No hay tareas pendientes"
          description="Estado positivo: la cola está limpia por ahora."
          icon={<CircleDot size={18} />}
        />
      ) : (
        <div className={styles.tableLike}>
          <div className={styles.tableHeader}>
            <span>Registro</span>
            <span>Estado</span>
          </div>
          <div className={styles.tableBody}>
            {queueItems.map((item) => (
              <div key={item.id} className={styles.tableRow}>
                <div>
                  <p className={styles.tableRowTitle}>{item.title}</p>
                  <p className={styles.tableRowSubtitle}>{item.subtitle}</p>
                </div>
                <StatusBadge tone={normalizeTone(item.status)} label={formatStatusLabel(item.status)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function ChatPanel({ workspaceId, workspaceSlug, userId, contextSummary, copilotAgent, askPrompt }: ChatPanelProps) {
  const storageKey = `prisma-chat:${workspaceSlug}:${userId}:${copilotAgent?.id ?? "copilot"}`;
  const router = useRouter();
  const messageThreadRef = useRef<HTMLDivElement | null>(null);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const fallbackSession = createSession(userId);
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      setSessions([fallbackSession]);
      setSelectedSessionId(fallbackSession.id);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as ChatSession[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setSessions(parsed);
        setSelectedSessionId(parsed[0].id);
        return;
      }
    } catch {
      // ignore invalid cache
    }

    setSessions([fallbackSession]);
    setSelectedSessionId(fallbackSession.id);
  }, [storageKey, userId]);

  useEffect(() => {
    if (typeof window === "undefined" || sessions.length === 0) return;
    window.localStorage.setItem(storageKey, JSON.stringify(sessions));
  }, [sessions, storageKey]);

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0] ?? null;
  const selectedSessionTitle = selectedSession?.title ?? "";
  const selectedSessionMessageCount = selectedSession?.messages.length ?? 0;

  useEffect(() => {
    if (!selectedSession) return;
    setRenameDraft(selectedSessionTitle);
  }, [selectedSession?.id, selectedSessionTitle]);

  useEffect(() => {
    if (!askPrompt || !selectedSession) return;
    if (selectedSessionMessageCount === 0 && !input.trim()) {
      setInput(askPrompt);
    }
  }, [askPrompt, input, selectedSession?.id, selectedSessionMessageCount]);

  useEffect(() => {
    if (!messageThreadRef.current) return;
    messageThreadRef.current.scrollTop = messageThreadRef.current.scrollHeight;
  }, [selectedSession?.messages.length, selectedSession?.messages.at(-1)?.content, isLoading]);

  function updateSession(sessionId: string, updater: (session: ChatSession) => ChatSession) {
    setSessions((current) =>
      current
        .map((session) => (session.id === sessionId ? updater(session) : session))
        .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1)),
    );
  }

  function createNewChat() {
    const session = createSession(userId);
    setSessions((current) => [session, ...current]);
    setSelectedSessionId(session.id);
    setInput("");
    setError(null);
  }

  function renameSession(sessionId: string, nextTitle: string) {
    const trimmed = nextTitle.trim();
    if (!trimmed) return;
    updateSession(sessionId, (session) => ({
      ...session,
      title: trimmed,
      updatedAt: new Date().toISOString(),
    }));
  }

  async function uploadDocument(file: File) {
    if (!selectedSession || isUploading) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("conversationId", selectedSession.conversationId);

      const response = await fetch(`/api/workspaces/${workspaceSlug}/documents`, {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        recordId?: string;
        documentName?: string;
        publicUrl?: string;
        contentType?: string;
      };

      if (!response.ok || !payload.recordId || !payload.documentName || !payload.publicUrl) {
        throw new Error(payload.error ?? "No se pudo subir el documento.");
      }

      updateSession(selectedSession.id, (session) => ({
        ...session,
        attachments: [
          {
            id: payload.recordId as string,
            fileName: payload.documentName as string,
            publicUrl: payload.publicUrl as string,
            contentType: payload.contentType ?? file.type ?? "application/octet-stream",
          },
          ...session.attachments,
        ],
        messages: [
          ...session.messages,
          {
            id: `upload-${Date.now()}`,
            role: "assistant",
            content: `Documento subido: ${payload.documentName}. Se agregó al dataset Documentos.`,
            timestamp: currentTimeLabel(),
          },
        ],
        updatedAt: new Date().toISOString(),
      }));
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "No se pudo subir el documento.";
      setError(message);
    } finally {
      setIsUploading(false);
      window.setTimeout(() => {
        if (typeof window !== "undefined") {
          router.replace(`${window.location.pathname}${window.location.search}`);
          router.refresh();
        }
      }, 400);
    }
  }

  function deleteSession(sessionId: string) {
    setSessions((current) => {
      const next = current.filter((session) => session.id !== sessionId);
      if (next.length > 0) return next;
      return [createSession(userId)];
    });
    setSelectedSessionId((current) => {
      if (current !== sessionId) return current;
      return "";
    });
  }

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || !selectedSession || !copilotAgent || isLoading) return;

    setIsLoading(true);
    setError(null);

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: currentTimeLabel(),
    };
    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: currentTimeLabel(),
    };

    const optimisticMessages = [...selectedSession.messages, userMessage, assistantMessage];
    updateSession(selectedSession.id, (session) => ({
      ...session,
      title: session.messages.length === 0 ? trimmed.slice(0, 36) : session.title,
      messages: optimisticMessages,
      updatedAt: new Date().toISOString(),
    }));
    setInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          workspaceContext: contextSummary,
          agentId: copilotAgent.id,
          conversationId: selectedSession.conversationId,
          message: trimmed,
          history: selectedSession.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("No se pudo conectar con el agente CEO.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = parseSseChunk(buffer);
        const endedWithBoundary = buffer.endsWith("\n\n");
        buffer = endedWithBoundary ? "" : buffer.slice(buffer.lastIndexOf("\n\n") + 2);

        for (const part of parts) {
          const payload = JSON.parse(part) as { type: string; content?: string; error?: string };
          if (payload.type === "delta" && payload.content) {
            updateSession(selectedSession.id, (session) => ({
              ...session,
              messages: session.messages.map((message) =>
                message.id === assistantId ? { ...message, content: `${message.content}${payload.content}` } : message,
              ),
              updatedAt: new Date().toISOString(),
            }));
          }

          if (payload.type === "error") {
            throw new Error(payload.error ?? "Error al generar respuesta.");
          }
        }
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Error desconocido";
      setError(message);
      updateSession(selectedSession.id, (session) => ({
        ...session,
        messages: session.messages.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: "No pude responder en este momento. Intenta de nuevo o revisa la configuración del runtime.",
              }
            : message,
        ),
        updatedAt: new Date().toISOString(),
      }));
    } finally {
      setIsLoading(false);
      window.setTimeout(() => {
        if (typeof window !== "undefined") {
          router.replace(`${window.location.pathname}${window.location.search}`);
          router.refresh();
        }
      }, 400);
    }
  }

  return (
    <section className={styles.chatPage}>
      {!copilotAgent ? (
        <EmptyState
          title="No hay agente CEO disponible"
          description="Configura un agente copilot para habilitar esta superficie."
          icon={<Bot size={18} />}
        />
      ) : (
        <>
          <aside className={styles.chatSessions}>
            <div className={styles.chatSessionsHeader}>
              <div>
                <p className={styles.mutedOverline}>Sesiones</p>
                <p className={styles.chatSessionsAgent}>{copilotAgent.name}</p>
              </div>
              <button type="button" onClick={createNewChat} className={styles.ghostButton}>
                + Nuevo
              </button>
            </div>
            <div className={styles.chatSessionsList}>
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`${styles.chatSessionItem} ${
                    selectedSession?.id === session.id ? styles.chatSessionItemActive : ""
                  }`}
                >
                  <button type="button" onClick={() => setSelectedSessionId(session.id)} className={styles.chatSessionButton}>
                    <strong>{session.title}</strong>
                    <span>{session.messages.length ? `${session.messages.length} mensajes` : "Sin mensajes"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSession(session.id)}
                    className={styles.chatSessionDelete}
                    aria-label={`Eliminar ${session.title}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <div className={styles.chatMain}>
            <header className={styles.chatHeader}>
              <div>
                <p className={styles.mutedOverline}>Conversación</p>
                <h3>{selectedSession?.title ?? "Nuevo chat"}</h3>
              </div>
              <StatusBadge tone={normalizeTone(copilotAgent.status)} label={formatStatusLabel(copilotAgent.status)} />
            </header>

            <div className={styles.chatUtilities}>
              <input
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                onBlur={() => selectedSession && renameSession(selectedSession.id, renameDraft)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (selectedSession) renameSession(selectedSession.id, renameDraft);
                  }
                }}
                className={styles.textInput}
                aria-label="Renombrar chat"
              />
              <label className={styles.ghostButton}>
                {isUploading ? "Subiendo..." : "Subir documento"}
                <input
                  type="file"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadDocument(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            <div className={styles.chatMessages} ref={messageThreadRef}>
              {selectedSession?.messages.length ? (
                selectedSession.messages.map((message) => (
                  <article
                    key={message.id}
                    className={`${styles.chatBubble} ${
                      message.role === "user" ? styles.chatBubbleUser : styles.chatBubbleAssistant
                    }`}
                  >
                    <p>{message.content || "..."}</p>
                    <span>{message.timestamp}</span>
                  </article>
                ))
              ) : (
                <div className={styles.chatEmptyState}>
                  <div className={styles.chatEmptyStateIcon}>🤖</div>
                  <h4>Hola, ¿cómo te ayudo hoy?</h4>
                  <p>Puedes empezar con una de estas sugerencias.</p>
                  <div className={styles.chatPromptList}>
                    {[
                      "Revisa los pendientes de hoy y sugiere el orden de atención.",
                      "Resume el estado operativo por dataset en 5 bullets.",
                      "Detecta registros estancados en los últimos 7 días.",
                    ].map((prompt) => (
                      <button key={prompt} type="button" className={styles.chatPromptCard} onClick={() => setInput(prompt)}>
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedSession?.attachments.length ? (
              <div className={styles.chatAttachmentList}>
                {selectedSession.attachments.map((attachment) => (
                  <a key={attachment.id} href={attachment.publicUrl} target="_blank" rel="noreferrer" className={styles.chatAttachment}>
                    <div>
                      <strong>{attachment.fileName}</strong>
                      <span>Documento · {attachment.id.slice(0, 8)}…</span>
                    </div>
                    <ArrowRight size={14} />
                  </a>
                ))}
              </div>
            ) : null}

            <div className={styles.chatComposer}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Escribe una pregunta..."
                rows={4}
                className={styles.chatTextarea}
              />
              <div className={styles.chatComposerFooter}>
                <p>El contexto activo (vista, cola y registro) se envía automáticamente al agente.</p>
                <button type="button" onClick={sendMessage} disabled={isLoading || !input.trim()} className={styles.sendButton}>
                  {isLoading ? <LoaderCircle size={16} className={styles.spin} /> : "Enviar"}
                </button>
              </div>
              {error ? <p className={styles.errorText}>{error}</p> : null}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function DataPanel({ objects, fields, views, records, askHref }: DataPanelProps) {
  const [selectedObjectId, setSelectedObjectId] = useState<string>(objects[0]?.id ?? "");
  const [selectedViewId, setSelectedViewId] = useState<string>("all");
  const [query, setQuery] = useState("");

  const object = objects.find((entry) => entry.id === selectedObjectId) ?? objects[0] ?? null;
  const objectFields = fields
    .filter((field) => field.objectId === object?.id)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const objectViews = views.filter((view) => view.objectId === object?.id);
  const currentView = selectedViewId === "all" ? null : objectViews.find((view) => view.id === selectedViewId) ?? null;
  const scopedRecords = records.filter((record) => record.objectId === object?.id);

  const visibleRecords = useMemo(
    () =>
      applyViewToRecords(scopedRecords, currentView).filter((record) =>
        query.trim()
          ? Object.values(record.data).some((value) =>
              String(value ?? "")
                .toLowerCase()
                .includes(query.trim().toLowerCase()),
            )
          : true,
      ),
    [currentView, query, scopedRecords],
  );

  return (
    <section className={styles.panelSection}>
      <PanelTitle title="Datos operativos" description="Explora datasets con filtros y búsqueda unificada." />

      <div className={styles.filterBar}>
        <label>
          Objeto
          <select
            value={selectedObjectId}
            onChange={(event) => {
              setSelectedObjectId(event.target.value);
              setSelectedViewId("all");
            }}
          >
            {objects.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Vista
          <select value={selectedViewId} onChange={(event) => setSelectedViewId(event.target.value)}>
            <option value="all">Todas</option>
            {objectViews.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.searchField}>
          Buscar
          <span>
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por cualquier campo"
            />
          </span>
        </label>
      </div>

      <div className={styles.metaLine}>
        <div className={styles.metaBadges}>
          <StatusBadge tone="info" label={object?.name ?? "Objeto"} />
          {currentView ? <StatusBadge tone="neutral" label={currentView.name} icon={<Filter size={12} />} /> : null}
          {askHref ? (
            <a href={askHref} className={styles.askLink}>
              Consultar al agente CEO
            </a>
          ) : null}
        </div>
        <p>
          {visibleRecords.length} registros · {objectFields.length} campos · {objectViews.length} vistas
        </p>
      </div>

      {object && visibleRecords.length > 0 ? (
        <div className={styles.dataTableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                {objectFields.map((field) => (
                  <th key={field.id}>
                    <span>{field.name}</span>
                    <small>{field.type}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRecords.map((record) => (
                <tr key={record.id}>
                  {objectFields.map((field) => {
                    const value = getRecordFieldValue(record, field.key);
                    if (field.key === "status") {
                      const statusString = String(value ?? "neutral");
                      return (
                        <td key={`${record.id}-${field.id}`}>
                          <StatusBadge tone={normalizeTone(statusString)} label={formatStatusLabel(statusString)} />
                        </td>
                      );
                    }
                    return <td key={`${record.id}-${field.id}`}>{value ? String(value) : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={object ? "No hay registros visibles" : "No hay objetos configurados"}
          description={
            object
              ? "Ajusta filtros o usa el chat para crear los primeros registros."
              : "Primero crea objetos y campos para habilitar vistas."
          }
          icon={<MessageSquare size={18} />}
        />
      )}
    </section>
  );
}

export function AgentsPanel({ agents, activity }: AgentPanelProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id ?? "");
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null;
  const selectedActivity = activity.filter((entry) => entry.agentId === selectedAgent?.id).slice(0, 8);

  return (
    <section className={styles.panelSection}>
      <PanelTitle title="Monitoreo de agentes" description="Rol, alcance y actividad reciente por agente." />

      <div className={styles.agentsGrid}>
        <div className={styles.agentList}>
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => setSelectedAgentId(agent.id)}
              className={`${styles.agentCard} ${selectedAgent?.id === agent.id ? styles.agentCardActive : ""}`}
            >
              <div className={styles.agentCardHeader}>
                <p>{agent.name}</p>
                <StatusBadge tone={normalizeTone(agent.status)} label={formatStatusLabel(agent.status)} />
              </div>
              <p className={styles.agentCardDescription}>{agent.description ?? "Sin descripción"}</p>
              <div className={styles.agentCardMeta}>
                <span>{agent.type}</span>
                <span>{agent.tools.length} skills</span>
              </div>
            </button>
          ))}
        </div>

        <div className={styles.agentDetail}>
          {selectedAgent ? (
            <>
              <div className={styles.agentDetailHeader}>
                <div>
                  <p className={styles.mutedOverline}>Detalle</p>
                  <h3>{selectedAgent.name}</h3>
                  <p>{selectedAgent.description ?? "Sin descripción"}</p>
                </div>
                <StatusBadge tone={normalizeTone(selectedAgent.status)} label={formatStatusLabel(selectedAgent.status)} />
              </div>

              <div className={styles.agentDetailGrid}>
                <DetailList title="Accesos de lectura" items={selectedAgent.read.length ? selectedAgent.read : ["Sin acceso"]} />
                <DetailList title="Accesos de escritura" items={selectedAgent.write.length ? selectedAgent.write : ["Sin acceso"]} />
                <DetailList title="Canales" items={selectedAgent.channels.length ? selectedAgent.channels : ["Sin canales"]} />
                <DetailList
                  title="Recursos"
                  items={[`Memoria: ${selectedAgent.memoryLabel}`, `Cron jobs: ${selectedAgent.cronJobs.length || 0}`]}
                />
              </div>

              <div className={styles.agentActivityPanel}>
                <h4>Actividad reciente</h4>
                {selectedActivity.length ? (
                  <div className={styles.activityList}>
                    {selectedActivity.map((entry) => (
                      <div key={entry.id} className={styles.activityRow}>
                        <div className={styles.activityCopy}>
                          <p className={styles.activityTitle}>{entry.action}</p>
                          <p className={styles.activityDetail}>
                            {typeof entry.details.title === "string"
                              ? entry.details.title
                              : typeof entry.details.recommendation === "string"
                                ? entry.details.recommendation
                                : "Evento registrado"}
                          </p>
                        </div>
                        <span className={styles.activityDate}>{formatRelativeTime(entry.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.mutedParagraph}>Sin actividad visible para este agente.</p>
                )}
              </div>
            </>
          ) : (
            <EmptyState title="No hay agentes configurados" description="Cuando registres agentes aparecerán aquí." icon={<Bot size={18} />} />
          )}
        </div>
      </div>
    </section>
  );
}

export function RecordDetailPanel({
  title,
  status,
  owner,
  summary,
  askHref,
  fields,
  activity,
}: RecordDetailPanelProps) {
  return (
    <section className={styles.panelSection}>
      <div className={styles.recordHeader}>
        <div>
          <p className={styles.mutedOverline}>Detalle del registro</p>
          <h2>{title}</h2>
          <p>{summary}</p>
        </div>
        <div className={styles.recordHeaderTags}>
          <StatusBadge tone={normalizeTone(status)} label={formatStatusLabel(status)} />
          <StatusBadge tone="neutral" label={owner} />
          {askHref ? (
            <a href={askHref} className={styles.askLink}>
              Consultar al agente CEO
            </a>
          ) : null}
        </div>
      </div>

      <div className={styles.recordGrid}>
        <div className={styles.recordFields}>
          {fields.map((field) => (
            <article key={field.label} className={styles.recordFieldCard}>
              <p className={styles.mutedOverline}>{field.label}</p>
              {field.tone ? (
                <StatusBadge tone={field.tone === "positive" ? "active" : "neutral"} label={field.value} />
              ) : (
                <strong>{field.value}</strong>
              )}
            </article>
          ))}
        </div>

        <aside className={styles.recordTimeline}>
          <h3>Actividad</h3>
          {activity.length ? (
            <div className={styles.activityList}>
              {activity.map((item) => (
                <div key={`${item.title}-${item.timestamp}`} className={styles.activityRow}>
                  <div className={styles.activityCopy}>
                    <p className={styles.activityTitle}>{item.title}</p>
                    <p className={styles.activityDetail}>{item.detail}</p>
                  </div>
                  <span className={styles.activityDate}>{item.timestamp}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.mutedParagraph}>Todavía no hay historial visible para este registro.</p>
          )}
        </aside>
      </div>
    </section>
  );
}

export const HomeOverviewPanel = OverviewPanel;
export const DatasetPanel = DataPanel;
export const AgentOverviewPanel = AgentsPanel;

type StatusTone = "active" | "pending" | "review" | "error" | "info" | "neutral";

function StatusBadge({
  tone,
  label,
  icon,
}: {
  tone: StatusTone;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <span className={`${styles.statusBadge} ${styles[`status${capitalize(tone)}`]}`}>
      {icon ?? <span className={styles.statusDot} aria-hidden />}
      {label}
    </span>
  );
}

function PanelTitle({
  title,
  description,
  actionLabel,
}: {
  title: string;
  description: string;
  actionLabel?: string;
}) {
  return (
    <div className={styles.panelTitleRow}>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {actionLabel ? <button type="button" className={styles.inlineLinkButton}>{actionLabel}</button> : null}
    </div>
  );
}

function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>{icon}</div>
      <div>
        <p className={styles.emptyTitle}>{title}</p>
        <p className={styles.emptyDescription}>{description}</p>
      </div>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className={styles.detailListCard}>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
