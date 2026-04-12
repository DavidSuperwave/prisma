"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CircleDot,
  FileStack,
  Filter,
  Layers3,
  LoaderCircle,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import type {
  PrismaWorkspaceActivity,
  PrismaWorkspaceAgent,
  PrismaWorkspaceField,
  PrismaWorkspaceObject,
  PrismaWorkspaceRecord,
  PrismaWorkspaceView,
} from "@/lib/workspaceStore";
import { applyViewToRecords, deriveQueueItems, getRecordFieldValue } from "@/lib/workspaceStore";

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

function Panel({
  title,
  eyebrow,
  description,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        {eyebrow ? <p style={eyebrowStyle}>{eyebrow}</p> : null}
        <div>
          <h2 style={panelTitleStyle}>{title}</h2>
          {description ? <p style={panelDescriptionStyle}>{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function createSession(userId: string) {
  const sessionId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return {
    id: sessionId,
    title: "New chat",
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

export function OverviewPanel({ metrics, queueItems, activity, suggestions, agents }: OverviewProps) {
  const stats = [
    { icon: Layers3, ...metrics[0] },
    { icon: Building2, ...metrics[1] },
    { icon: Bot, ...metrics[2] },
    { icon: ShieldCheck, ...metrics[3] },
  ].filter((item) => item.label && item.value);

  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Home"
        title="Workspace operativo"
        description="Un tablero claro, premium y centrado en decisiones, no en ruido."
      >
        <div style={metricGridStyle}>
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <article key={stat.label} style={metricCardStyle}>
                <div style={metricIconWrapStyle}>
                  <Icon size={18} />
                </div>
                <p style={metricLabelStyle}>{stat.label}</p>
                <p style={metricValueStyle}>{stat.value}</p>
                <p style={metricHintStyle}>{stat.caption}</p>
              </article>
            );
          })}
        </div>
      </Panel>

      <div style={overviewGridStyle}>
        <Panel
          eyebrow="Queue"
          title="Prioridades que requieren intervención"
          description="La cola diaria debe sentirse como un centro de mando sereno y accionable."
        >
          {queueItems.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No hay items urgentes"
              description="Cuando los agentes detecten bloqueos, aprobaciones o seguimientos, aparecerán aquí."
            />
          ) : (
            <div style={queueListStyle}>
              {queueItems.map((item) => (
                <div key={item.id} style={queueItemStyle}>
                  <div>
                    <p style={queueTitleStyle}>{item.title}</p>
                    <p style={queueSubtitleStyle}>{item.subtitle}</p>
                  </div>
                  <div style={queueRightStyle}>
                    <StatusPill tone={item.status.toLowerCase()}>{item.status}</StatusPill>
                    <ArrowRight size={16} color="var(--workspace-muted)" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          eyebrow="Activity"
          title="Lo último que hicieron los agentes"
          description="Actividad legible y confiable para supervisión humana."
        >
          {activity.length === 0 ? (
            <EmptyState
              icon={CircleDot}
              title="Sin actividad todavía"
              description="El feed se llenará con acciones reales de agentes y operadores."
            />
          ) : (
            <div style={activityListStyle}>
              {activity.slice(0, 8).map((entry) => (
                <div key={entry.id} style={activityRowStyle}>
                  <div style={activityIconStyle}>
                    {entry.action.includes("flagged") ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
                  </div>
                  <div>
                    <p style={activityActionStyle}>{entry.action}</p>
                    <p style={activityDetailStyle}>
                      {typeof entry.details.title === "string"
                        ? entry.details.title
                        : typeof entry.details.lead === "string"
                          ? entry.details.lead
                          : typeof entry.details.debtor === "string"
                            ? entry.details.debtor
                            : "Evento registrado"}
                    </p>
                  </div>
                  <p style={activityDateStyle}>{new Date(entry.createdAt).toLocaleString("es-MX")}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div style={overviewGridStyle}>
        <Panel
          eyebrow="CEO Agent"
          title="Suggested next actions"
          description="The intelligence layer should propose crisp, operational next steps."
        >
          <div style={detailListStyle}>
            {suggestions.map((suggestion) => (
              <div key={suggestion} style={queueItemStyle}>
                <div>
                  <p style={queueTitleStyle}>{suggestion}</p>
                </div>
                <ArrowRight size={16} color="var(--workspace-muted)" />
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          eyebrow="Agent coverage"
          title="Visible responsibilities"
          description="Agents should feel explicit, constrained, and easy to inspect."
        >
          <div style={detailListStyle}>
            {agents.slice(0, 4).map((agent) => (
              <div key={agent.id} style={queueItemStyle}>
                <div>
                  <p style={queueTitleStyle}>{agent.name}</p>
                  <p style={queueSubtitleStyle}>{agent.description ?? "No description available."}</p>
                </div>
                <StatusPill tone={agent.status.toLowerCase()}>{agent.type}</StatusPill>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function QueuePanel({ queueItems }: QueuePanelProps) {
  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Queue"
        title="Centro de decisiones humano"
        description="La cola diaria debe mostrar excepciones, bloqueos y tareas operativas con claridad inmediata."
      >
        {queueItems.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No hay tareas urgentes"
            description="Cuando los agentes detecten aprobaciones pendientes o seguimientos bloqueados, aparecerán aquí."
          />
        ) : (
          <div style={queueTableStyle}>
            {queueItems.map((item) => (
              <div key={item.id} style={queueTableRowStyle}>
                <div>
                  <p style={queueTitleStyle}>{item.title}</p>
                  <p style={queueSubtitleStyle}>{item.subtitle}</p>
                </div>
                <StatusPill tone={item.status.toLowerCase()}>{item.status}</StatusPill>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export function ChatPanel({ workspaceId, workspaceSlug, userId, contextSummary, copilotAgent, askPrompt }: ChatPanelProps) {
  const storageKey = `prisma-chat:${workspaceSlug}:${userId}:${copilotAgent?.id ?? "copilot"}`;
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

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
    if (typeof window === "undefined" || sessions.length === 0) {
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(sessions));
  }, [sessions, storageKey]);

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0] ?? null;
  const selectedSessionTitle = selectedSession?.title ?? "";
  const selectedSessionMessageCount = selectedSession?.messages.length ?? 0;

  useEffect(() => {
    if (!selectedSession) {
      return;
    }
    setRenameDraft(selectedSessionTitle);
  }, [selectedSession?.id, selectedSessionTitle]);

  useEffect(() => {
    if (!askPrompt || !selectedSession) {
      return;
    }
    if (selectedSessionMessageCount === 0 && !input.trim()) {
      setInput(askPrompt);
    }
  }, [askPrompt, input, selectedSession?.id, selectedSessionMessageCount]);

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
    if (!trimmed) {
      return;
    }
    updateSession(sessionId, (session) => ({
      ...session,
      title: trimmed,
      updatedAt: new Date().toISOString(),
    }));
  }

  async function uploadDocument(file: File) {
    if (!selectedSession || isUploading) {
      return;
    }

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
            id: payload.recordId,
            fileName: payload.documentName,
            publicUrl: payload.publicUrl,
            contentType: payload.contentType ?? file.type ?? "application/octet-stream",
          },
          ...session.attachments,
        ],
        messages: [
          ...session.messages,
          {
            id: `upload-${Date.now()}`,
            role: "assistant",
            content: `Documento subido: ${payload.documentName}. Se agregó al dataset Documents y el workspace se actualizará.`,
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
      window.setTimeout(() => { if (typeof window !== "undefined") { router.replace(`${window.location.pathname}${window.location.search}`); router.refresh(); } }, 400);
    }
  }

  function deleteSession(sessionId: string) {
    setSessions((current) => {
      const next = current.filter((session) => session.id !== sessionId);
      if (next.length > 0) {
        return next;
      }
      return [createSession(userId)];
    });
    setSelectedSessionId((current) => {
      if (current !== sessionId) {
        return current;
      }
      return "";
    });
  }

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || !selectedSession || !copilotAgent || isLoading) {
      return;
    }

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
        throw new Error("No se pudo conectar con el CEO agent.");
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
                content: "No pude responder en este momento. Intenta de nuevo o revisa la configuracion del runtime.",
              }
            : message,
        ),
        updatedAt: new Date().toISOString(),
      }));
    } finally {
      setIsLoading(false);
      window.setTimeout(() => { if (typeof window !== "undefined") { router.replace(`${window.location.pathname}${window.location.search}`); router.refresh(); } }, 400);
    }
  }

  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Chat"
        title="CEO agent chat"
        description="Conversation-first workspace intelligence with persistent named sessions for the current user."
      >
        {!copilotAgent ? (
          <EmptyState
            icon={Bot}
            title="No CEO agent available"
            description="Seed or deploy a copilot agent before using the workspace chat surface."
          />
        ) : (
          <div style={chatLayoutStyle}>
            <div style={chatSidebarStyle}>
              <div style={chatSidebarHeaderStyle}>
                <div>
                  <p style={eyebrowStyle}>Sessions</p>
                  <p style={chatSidebarCopyStyle}>{copilotAgent.name}</p>
                </div>
                <button type="button" onClick={createNewChat} style={chatActionButtonStyle}>
                  New chat
                </button>
              </div>

              <div style={chatSessionListStyle}>
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    style={{
                      ...chatSessionCardStyle,
                      borderColor:
                        selectedSession?.id === session.id ? "rgba(51, 92, 255, 0.22)" : "var(--workspace-border)",
                      background:
                        selectedSession?.id === session.id ? "rgba(51, 92, 255, 0.05)" : "var(--workspace-panel)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedSessionId(session.id)}
                      style={chatSessionButtonStyle}
                    >
                      <strong style={chatSessionTitleStyle}>{session.title}</strong>
                      <span style={chatSessionMetaStyle}>
                        {session.messages.length ? `${session.messages.length} messages` : "Fresh session"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSession(session.id)}
                      style={chatDeleteButtonStyle}
                      aria-label={`Delete ${session.title}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div style={chatMainStyle}>
              <div style={chatHeaderStyle}>
                <div>
                  <p style={eyebrowStyle}>Current conversation</p>
                  <h3 style={chatTitleStyle}>{selectedSession?.title ?? "New chat"}</h3>
                </div>
                <StatusPill tone={copilotAgent.status.toLowerCase()}>{copilotAgent.status}</StatusPill>
              </div>

              <div style={chatRenameRowStyle}>
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
                  style={chatRenameInputStyle}
                  aria-label="Rename current chat"
                />
                <label style={chatUploadLabelStyle}>
                  {isUploading ? "Uploading..." : "Upload document"}
                  <input
                    type="file"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void uploadDocument(file);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              <div style={chatMessagesStyle}>
                {selectedSession?.messages.length ? (
                  selectedSession.messages.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        ...chatBubbleStyle,
                        alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                        background:
                          message.role === "user" ? "rgba(17, 24, 39, 0.94)" : "rgba(255, 255, 255, 0.96)",
                        color: message.role === "user" ? "#fff" : "var(--workspace-text)",
                      }}
                    >
                      <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{message.content || "..."}</p>
                      <span style={{ ...chatTimestampStyle, color: message.role === "user" ? "rgba(255,255,255,0.7)" : "var(--workspace-muted)" }}>
                        {message.timestamp}
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    icon={MessageSquare}
                    title="Start the first conversation"
                    description="Ask the CEO agent about this workspace, what changed today, or what dataset needs attention next."
                  />
                )}
              </div>

              {selectedSession?.attachments.length ? (
                <div style={chatAttachmentListStyle}>
                  {selectedSession.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={chatAttachmentCardStyle}
                    >
                      <div>
                        <strong style={chatAttachmentTitleStyle}>{attachment.fileName}</strong>
                        <p style={chatAttachmentMetaStyle}>Documents record · {attachment.id.slice(0, 8)}…</p>
                      </div>
                      <ArrowRight size={16} color="var(--workspace-muted)" />
                    </a>
                  ))}
                </div>
              ) : null}

              <div style={chatComposerStyle}>
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask the CEO agent about this workspace..."
                  rows={4}
                  style={chatTextareaStyle}
                />
                <div style={chatComposerFooterStyle}>
                  <span style={chatHintStyle}>
                    Sessions persist locally per user/workspace and include the current tab, dataset, record, queue context, and uploaded documents.
                  </span>
                  <button type="button" onClick={sendMessage} disabled={isLoading || !input.trim()} style={chatSendButtonStyle}>
                    {isLoading ? <LoaderCircle size={16} className="workspace-spin" /> : "Send"}
                  </button>
                </div>
                {error ? <p style={chatErrorStyle}>{error}</p> : null}
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
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
  const visibleRecords = applyViewToRecords(scopedRecords, currentView).filter((record) =>
    query.trim()
      ? Object.values(record.data).some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
      : true,
  );

  const summary = object
    ? `${visibleRecords.length} registros visibles · ${objectFields.length} campos activos · ${objectViews.length} vistas guardadas`
    : "Selecciona un objeto para empezar.";

  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Data Views"
        title="Vistas dinámicas del negocio"
        description="La base de datos es el centro del producto; las vistas deben sentirse operativas, claras y vivas."
      >
        <div style={toolbarStyle}>
          <div style={pickerGroupStyle}>
            <label style={inputLabelStyle}>
              Objeto
              <select
                value={selectedObjectId}
                onChange={(event) => {
                  setSelectedObjectId(event.target.value);
                  setSelectedViewId("all");
                }}
                style={inputStyle}
              >
                {objects.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={inputLabelStyle}>
              Vista
              <select value={selectedViewId} onChange={(event) => setSelectedViewId(event.target.value)} style={inputStyle}>
                <option value="all">Todas</option>
                {objectViews.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label style={{ ...inputLabelStyle, minWidth: 280 }}>
            Buscar
            <div style={searchWrapStyle}>
              <Search size={16} color="var(--workspace-muted)" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por cualquier campo"
                style={searchInputStyle}
              />
            </div>
          </label>
        </div>

        <div style={metaBarStyle}>
          <div style={metaLeftStyle}>
            <StatusPill tone="info">{object?.name ?? "Objeto"}</StatusPill>
            {currentView ? (
              <StatusPill tone="neutral">
                <Filter size={12} />
                {currentView.name}
              </StatusPill>
            ) : null}
            {askHref ? (
              <a href={askHref} style={metaActionLinkStyle}>
                Ask CEO about this dataset
              </a>
            ) : null}
          </div>
          <p style={metaCopyStyle}>{summary}</p>
        </div>

        {object && visibleRecords.length > 0 ? (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {objectFields.map((field) => (
                    <th key={field.id} style={tableHeadStyle}>
                      <span>{field.name}</span>
                      <small style={tableHeadMetaStyle}>{field.type}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((record) => (
                  <tr key={record.id}>
                    {objectFields.map((field) => {
                      const value = getRecordFieldValue(record, field.key);
                      return (
                        <td key={`${record.id}-${field.id}`} style={tableCellStyle}>
                          {field.key === "status" ? (
                            <StatusPill tone={String(value ?? "").toLowerCase()}>{String(value ?? "—")}</StatusPill>
                          ) : (
                            <span>{value ? String(value) : "—"}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={FileStack}
            title={object ? "No hay registros visibles" : "No hay objetos configurados"}
            description={
              object
                ? "Ajusta la vista o la búsqueda, o usa el CEO agent para crear los primeros registros."
                : "Primero crea objetos y campos para que la vista dinámica tenga estructura."
            }
          />
        )}
      </Panel>
    </div>
  );
}

export function AgentsPanel({ agents, activity }: AgentPanelProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id ?? "");
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content: "Use this test chat to validate the selected agent without leaving the workspace.",
    },
  ]);
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null;
  const selectedActivity = activity.filter((entry) => entry.agentId === selectedAgent?.id).slice(0, 10);

  async function sendTestMessage() {
    const trimmed = chatInput.trim();
    if (!trimmed || !selectedAgent || isSending) {
      return;
    }

    const nextMessages = [...chatMessages, { role: "user" as const, content: trimmed }];
    setChatMessages([...nextMessages, { role: "assistant", content: "" }]);
    setChatInput("");
    setChatError(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_id: selectedAgent.id,
          message: trimmed,
          history: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          conversation_id: `workspace-agent-${selectedAgent.id}`,
        }),
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(errorText || "Unable to reach the selected agent.");
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
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const payloads = event
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .filter(Boolean);

          for (const raw of payloads) {
            const parsed = JSON.parse(raw) as { type?: string; content?: string; error?: string };
            if (parsed.type === "delta" && parsed.content) {
              setChatMessages((current) => {
                const updated = [...current];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: `${updated[updated.length - 1]?.content ?? ""}${parsed.content}`,
                };
                return updated;
              });
            }

            if (parsed.type === "error") {
              throw new Error(parsed.error ?? "Agent request failed.");
            }
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error while contacting the agent.";
      setChatError(message);
      setChatMessages((current) => {
        const updated = [...current];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "The selected agent could not answer right now. Check runtime configuration and try again.",
        };
        return updated;
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Agents"
        title="Agentes transparentes y con alcance visible"
        description="Cada agente debe sentirse legible: misión, acceso, herramientas, memoria y límites."
      >
        <div style={agentGridStyle}>
          <div style={agentListStyle}>
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => setSelectedAgentId(agent.id)}
                style={{
                  ...agentCardStyle,
                  borderColor: agent.id === selectedAgent?.id ? "rgba(51, 92, 255, 0.24)" : "var(--workspace-border)",
                  background: agent.id === selectedAgent?.id ? "rgba(51, 92, 255, 0.05)" : "var(--workspace-panel)",
                }}
              >
                <div style={agentCardTopStyle}>
                  <div style={agentAvatarStyle}>
                    {agent.type === "copilot" ? (
                      <Sparkles size={16} />
                    ) : agent.type === "channel" ? (
                      <MessageSquare size={16} />
                    ) : (
                      <Bot size={16} />
                    )}
                  </div>
                  <StatusPill tone={agent.status.toLowerCase()}>{agent.status}</StatusPill>
                </div>
                <div>
                  <p style={agentNameStyle}>{agent.name}</p>
                  <p style={agentDescriptionStyle}>{agent.description ?? "Sin descripción"}</p>
                </div>
                <div style={agentMetaWrapStyle}>
                  <StatusPill tone="neutral">{agent.type}</StatusPill>
                  <StatusPill tone="neutral">{agent.tools.length} skills</StatusPill>
                </div>
              </button>
            ))}
          </div>

          <div style={agentDetailCardStyle}>
            {selectedAgent ? (
              <>
                <div style={agentDetailHeaderStyle}>
                  <div>
                    <p style={eyebrowStyle}>Agent detail</p>
                    <h3 style={agentDetailTitleStyle}>{selectedAgent.name}</h3>
                    <p style={agentDescriptionStyle}>{selectedAgent.description ?? "Sin descripción"}</p>
                  </div>
                  <StatusPill tone={selectedAgent.status.toLowerCase()}>{selectedAgent.status}</StatusPill>
                </div>

                <div style={agentSectionGridStyle}>
                  <DetailBlock
                    title="Responsabilidad"
                    icon={Bot}
                    items={[
                      selectedAgent.type === "copilot"
                        ? "Coordina el workspace, resume estado y propone cambios."
                        : selectedAgent.type === "channel"
                          ? "Opera en un canal externo y califica o responde con límites claros."
                          : "Ejecuta trabajo operativo específico en segundo plano.",
                    ]}
                  />
                  <DetailBlock
                    title="Acceso"
                    icon={ShieldCheck}
                    items={[
                      `Lectura: ${selectedAgent.read.length ? selectedAgent.read.join(", ") : "—"}`,
                      `Escritura: ${selectedAgent.write.length ? selectedAgent.write.join(", ") : "—"}`,
                      `Canales: ${selectedAgent.channels.length ? selectedAgent.channels.join(", ") : "Ninguno"}`,
                    ]}
                  />
                  <DetailBlock
                    title="Skills y herramientas"
                    icon={Sparkles}
                    items={selectedAgent.tools.length ? selectedAgent.tools : ["Sin skills adjuntas"]}
                  />
                  <DetailBlock
                    title="Memoria y jobs"
                    icon={CircleDot}
                    items={[
                      `Memoria: ${selectedAgent.memoryLabel}`,
                      `Cron jobs: ${selectedAgent.cronJobs.length || 0}`,
                    ]}
                  />
                </div>

                <div style={agentFooterGridStyle}>
                  <div style={detailRailStyle}>
                    <h4 style={detailRailTitleStyle}>SOUL.md</h4>
                    <p style={detailRailCopyStyle}>{selectedAgent.soulMd ?? "Sin instrucciones cargadas."}</p>
                    {selectedAgent.runtimeLabel ? (
                      <p style={detailRailMetaStyle}>Runtime: {selectedAgent.runtimeLabel}</p>
                    ) : null}
                  </div>

                  <div style={detailRailStyle}>
                    <h4 style={detailRailTitleStyle}>Actividad reciente</h4>
                    {selectedActivity.length ? (
                      <div style={activityListStyle}>
                        {selectedActivity.map((entry) => (
                          <div key={entry.id} style={agentActivityRowStyle}>
                            <p style={activityActionStyle}>{entry.action}</p>
                            <p style={activityDetailStyle}>
                              {typeof entry.details.title === "string"
                                ? entry.details.title
                                : typeof entry.details.lead === "string"
                                  ? entry.details.lead
                                  : typeof entry.details.debtor === "string"
                                    ? entry.details.debtor
                                    : "Acción registrada"}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={detailRailCopyStyle}>Todavía no hay actividad registrada para este agente.</p>
                    )}
                  </div>
                </div>

                <div style={detailRailStyle}>
                  <h4 style={detailRailTitleStyle}>Test chat</h4>
                  <p style={detailRailCopyStyle}>
                    Validate the selected agent from the workspace surface before wiring broader operator chat.
                  </p>
                  <div style={agentChatThreadStyle}>
                    {chatMessages.map((message, index) => (
                      <div
                        key={`${message.role}-${index}`}
                        style={{
                          ...agentChatBubbleStyle,
                          justifySelf: message.role === "user" ? "end" : "start",
                          background:
                            message.role === "user" ? "rgba(51, 92, 255, 0.12)" : "rgba(15, 23, 42, 0.05)",
                        }}
                      >
                        <strong style={agentChatRoleStyle}>
                          {message.role === "user" ? "You" : selectedAgent.name}
                        </strong>
                        <p style={agentChatCopyStyle}>{message.content || (isSending ? "Thinking..." : "")}</p>
                      </div>
                    ))}
                  </div>
                  <div style={agentChatComposerStyle}>
                    <input
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      placeholder={`Message ${selectedAgent.name}`}
                      style={chatInputStyle}
                    />
                    <button type="button" onClick={sendTestMessage} style={chatButtonStyle} disabled={isSending}>
                      {isSending ? "Sending..." : "Send"}
                    </button>
                  </div>
                  {chatError ? <p style={agentChatErrorStyle}>{chatError}</p> : null}
                </div>
              </>
            ) : (
              <EmptyState
                icon={Bot}
                title="No hay agentes configurados"
                description="Cuando registremos el CEO agent y el primer intake agent, aparecerán aquí."
              />
            )}
          </div>
        </div>
      </Panel>
    </div>
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
    <div style={stackStyle}>
      <Panel
        eyebrow="Record Detail"
        title={title}
        description="El registro debe sentirse como un espacio operativo: contexto, estado, responsable y trazabilidad cerca del trabajo."
      >
        <div style={recordHeroStyle}>
          <div>
            <p style={recordSummaryStyle}>{summary}</p>
            <div style={recordMetaStyle}>
              <StatusPill tone={status.toLowerCase()}>{status}</StatusPill>
              <StatusPill tone="neutral">{owner}</StatusPill>
              {askHref ? (
                <a href={askHref} style={metaActionLinkStyle}>
                  Ask CEO about this record
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div style={recordGridStyle}>
          <div style={recordFieldListStyle}>
            {fields.map((field) => (
              <div key={field.label} style={recordFieldStyle}>
                <p style={eyebrowStyle}>{field.label}</p>
                {field.tone ? (
                  <StatusPill tone={field.tone === "positive" ? "active" : "neutral"}>{field.value}</StatusPill>
                ) : (
                  <strong style={recordFieldValueStyle}>{field.value}</strong>
                )}
              </div>
            ))}
          </div>

          <div style={detailRailStyle}>
            <h4 style={detailRailTitleStyle}>Timeline</h4>
            {activity.length ? (
              <div style={activityListStyle}>
                {activity.map((item) => (
                  <div key={`${item.title}-${item.timestamp}`} style={agentActivityRowStyle}>
                    <p style={activityActionStyle}>{item.title}</p>
                    <p style={activityDetailStyle}>{item.detail}</p>
                    <p style={activityDateStyle}>{item.timestamp}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={detailRailCopyStyle}>Todavía no hay historial visible para este registro.</p>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

export const HomeOverviewPanel = OverviewPanel;
export const DatasetPanel = DataPanel;
export const AgentOverviewPanel = AgentsPanel;

function DetailBlock({
  icon: Icon,
  title,
  items,
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  items: string[];
}) {
  return (
    <div style={detailBlockStyle}>
      <div style={detailBlockHeaderStyle}>
        <div style={metricIconWrapStyle}>
          <Icon size={16} />
        </div>
        <h4 style={detailBlockTitleStyle}>{title}</h4>
      </div>
      <ul style={detailListStyle}>
        {items.map((item) => (
          <li key={item} style={detailListItemStyle}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  description: string;
}) {
  return (
    <div style={emptyStateStyle}>
      <div style={emptyIconStyle}>
        <Icon size={18} />
      </div>
      <div>
        <p style={emptyTitleStyle}>{title}</p>
        <p style={emptyCopyStyle}>{description}</p>
      </div>
    </div>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: string;
}) {
  const resolvedTone =
    tone === "active" || tone === "success" || tone === "qualified"
      ? "rgba(23, 164, 102, 0.14)"
      : tone === "warning" || tone === "pending" || tone === "pending_docs" || tone === "needs_review" || tone === "follow_up"
        ? "rgba(245, 158, 11, 0.14)"
        : tone === "error" || tone === "blocked" || tone === "overdue"
          ? "rgba(220, 38, 38, 0.12)"
          : tone === "info"
            ? "rgba(51, 92, 255, 0.08)"
            : "rgba(15, 23, 42, 0.06)";

  const resolvedText =
    tone === "active" || tone === "success" || tone === "qualified"
      ? "#0f8a52"
      : tone === "warning" || tone === "pending" || tone === "pending_docs" || tone === "needs_review" || tone === "follow_up"
        ? "#b15e05"
        : tone === "error" || tone === "blocked" || tone === "overdue"
          ? "#b42318"
          : tone === "info"
            ? "#335cff"
            : "var(--workspace-text)";

  return (
    <span
      style={{
        ...pillStyle,
        background: resolvedTone,
        color: resolvedText,
      }}
    >
      {children}
    </span>
  );
}

const stackStyle: React.CSSProperties = {
  display: "grid",
  gap: 24,
};

const panelStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 26,
  background: "var(--workspace-panel)",
  padding: 24,
  boxShadow: "var(--workspace-shadow)",
  display: "grid",
  gap: 20,
};

const panelHeaderStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--workspace-muted)",
  fontWeight: 700,
};

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  lineHeight: 1.15,
  color: "var(--workspace-text)",
  fontFamily: "var(--font-display)",
};

const panelDescriptionStyle: React.CSSProperties = {
  margin: 0,
  maxWidth: 720,
  color: "var(--workspace-muted)",
  fontSize: 15,
};

const metricGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 16,
};

const metricCardStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 22,
  background: "var(--workspace-panel-soft)",
  padding: 18,
  display: "grid",
  gap: 10,
};

const metricIconWrapStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 12,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(51, 92, 255, 0.08)",
  color: "#335cff",
};

const metricLabelStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "var(--workspace-muted)",
};

const metricValueStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 32,
  lineHeight: 1,
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const metricHintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "var(--workspace-muted)",
};

const overviewGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.85fr)",
  gap: 24,
};

const queueListStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const queueItemStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 18,
  padding: "14px 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
};

const queueTitleStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const queueSubtitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--workspace-muted)",
  fontSize: 13,
};

const queueRightStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const queueTableStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const queueTableRowStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 18,
  background: "var(--workspace-panel-soft)",
  padding: "14px 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
};

const chatLayoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "300px minmax(0, 1fr)",
  gap: 20,
};

const chatSidebarStyle: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel-soft)",
  padding: 16,
  display: "grid",
  gap: 14,
  alignContent: "start",
};

const chatSidebarHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const chatSidebarCopyStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--workspace-muted)",
  fontSize: 13,
};

const chatActionButtonStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel)",
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--workspace-text)",
  cursor: "pointer",
};

const chatSessionListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const chatSessionCardStyle: React.CSSProperties = {
  borderRadius: 16,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel)",
  padding: 10,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
  alignItems: "center",
};

const chatSessionButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  display: "grid",
  gap: 4,
  padding: 0,
};

const chatSessionTitleStyle: React.CSSProperties = {
  color: "var(--workspace-text)",
  fontSize: 14,
  lineHeight: 1.3,
};

const chatSessionMetaStyle: React.CSSProperties = {
  color: "var(--workspace-muted)",
  fontSize: 12,
};

const chatRenameRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const chatRenameInputStyle: React.CSSProperties = {
  flex: 1,
  borderRadius: 12,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  color: "var(--workspace-text)",
  padding: "8px 10px",
  font: "inherit",
};

const chatUploadLabelStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel)",
  color: "var(--workspace-text)",
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const chatAttachmentListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const chatAttachmentCardStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 16,
  background: "var(--workspace-panel-soft)",
  padding: "12px 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  textDecoration: "none",
};

const chatAttachmentTitleStyle: React.CSSProperties = {
  color: "var(--workspace-text)",
  fontSize: 14,
  lineHeight: 1.4,
};

const chatAttachmentMetaStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--workspace-muted)",
  fontSize: 12,
};

const chatDeleteButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--workspace-muted)",
  cursor: "pointer",
  fontSize: 20,
  lineHeight: 1,
  width: 28,
  height: 28,
};

const chatMainStyle: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel)",
  padding: 18,
  display: "grid",
  gap: 16,
  minHeight: 640,
};

const chatHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 14,
};

const chatTitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontFamily: "var(--font-display)",
  fontSize: 28,
  lineHeight: 1.1,
  color: "var(--workspace-text)",
};

const chatMessagesStyle: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid var(--workspace-border)",
  background: "rgba(247, 247, 242, 0.6)",
  padding: 16,
  minHeight: 360,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  overflowY: "auto",
};

const chatBubbleStyle: React.CSSProperties = {
  maxWidth: "78%",
  borderRadius: 18,
  padding: "12px 14px",
  display: "grid",
  gap: 8,
  boxShadow: "0 12px 28px rgba(15, 23, 42, 0.06)",
};

const chatTimestampStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--workspace-muted)",
};

const chatComposerStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const chatTextareaStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 18,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  padding: "14px 16px",
  font: "inherit",
  color: "var(--workspace-text)",
  resize: "vertical",
  outline: "none",
};

const chatComposerFooterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
};

const chatHintStyle: React.CSSProperties = {
  color: "var(--workspace-muted)",
  fontSize: 12,
  lineHeight: 1.5,
};

const chatSendButtonStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "none",
  padding: "10px 16px",
  background: "#111827",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const agentChatErrorStyle: React.CSSProperties = {
  margin: 0,
  color: "#b42318",
  fontSize: 13,
};

const activityListStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const activityRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "36px minmax(0, 1fr) auto",
  gap: 12,
  alignItems: "center",
  paddingBottom: 12,
  borderBottom: "1px solid var(--workspace-border)",
};

const activityIconStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(15, 23, 42, 0.06)",
  color: "var(--workspace-text)",
};

const activityActionStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const activityDetailStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--workspace-muted)",
  fontSize: 13,
};

const activityDateStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--workspace-muted)",
  whiteSpace: "nowrap",
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

const pickerGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const inputLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  fontSize: 13,
  color: "var(--workspace-muted)",
};

const inputStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  color: "var(--workspace-text)",
  padding: "10px 12px",
  minWidth: 180,
  font: "inherit",
};

const searchWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  border: "1px solid var(--workspace-border)",
  borderRadius: 14,
  background: "var(--workspace-surface)",
  padding: "0 12px",
};

const searchInputStyle: React.CSSProperties = {
  border: "none",
  outline: "none",
  background: "transparent",
  width: "100%",
  minWidth: 180,
  color: "var(--workspace-text)",
  padding: "10px 0",
  font: "inherit",
};

const metaBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const metaLeftStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const metaCopyStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-muted)",
  fontSize: 13,
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid var(--workspace-border)",
  borderRadius: 18,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 760,
};

const tableHeadStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: 13,
  color: "var(--workspace-muted)",
  fontWeight: 600,
  borderBottom: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel-soft)",
};

const tableHeadMetaStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 500,
  marginTop: 2,
  color: "var(--workspace-faint)",
};

const tableCellStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid var(--workspace-border)",
  color: "var(--workspace-text)",
  fontSize: 14,
  verticalAlign: "top",
};

const agentGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "320px minmax(0, 1fr)",
  gap: 20,
};

const agentListStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  alignContent: "start",
};

const agentCardStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 20,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel)",
  padding: 16,
  display: "grid",
  gap: 14,
  textAlign: "left",
  cursor: "pointer",
};

const agentCardTopStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const agentAvatarStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(51, 92, 255, 0.08)",
  color: "#335cff",
};

const agentNameStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const agentDescriptionStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "var(--workspace-muted)",
  fontSize: 13,
  lineHeight: 1.5,
};

const agentMetaWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const agentDetailCardStyle: React.CSSProperties = {
  borderRadius: 24,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel-soft)",
  padding: 20,
  display: "grid",
  gap: 18,
};

const agentDetailHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

const agentDetailTitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontFamily: "var(--font-display)",
  fontSize: 28,
  lineHeight: 1.1,
  color: "var(--workspace-text)",
};

const agentSectionGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
};

const detailBlockStyle: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel)",
  padding: 16,
  display: "grid",
  gap: 14,
};

const detailBlockHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const detailBlockTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const detailListStyle: React.CSSProperties = {
  listStyle: "none",
  display: "grid",
  gap: 8,
  padding: 0,
  margin: 0,
};

const detailListItemStyle: React.CSSProperties = {
  color: "var(--workspace-muted)",
  fontSize: 13,
  lineHeight: 1.5,
};

const agentFooterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)",
  gap: 16,
};

const detailRailStyle: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel)",
  padding: 16,
  display: "grid",
  gap: 12,
};

const detailRailTitleStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const detailRailCopyStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-muted)",
  fontSize: 14,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
};

const detailRailMetaStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-faint)",
  fontSize: 12,
};

const agentActivityRowStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  paddingBottom: 10,
  borderBottom: "1px solid var(--workspace-border)",
};

const recordHeroStyle: React.CSSProperties = {
  borderRadius: 20,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel-soft)",
  padding: 18,
};

const recordSummaryStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-muted)",
  fontSize: 15,
  lineHeight: 1.6,
};

const recordMetaStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 14,
};

const metaActionLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  border: "1px solid rgba(51, 92, 255, 0.16)",
  background: "rgba(51, 92, 255, 0.08)",
  color: "#2947cc",
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
};

const recordGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 320px",
  gap: 16,
};

const recordFieldListStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
};

const recordFieldStyle: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel)",
  padding: 16,
  display: "grid",
  gap: 8,
};

const recordFieldValueStyle: React.CSSProperties = {
  color: "var(--workspace-text)",
  fontSize: 16,
  lineHeight: 1.4,
};

const agentChatThreadStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  maxHeight: 260,
  overflowY: "auto",
  paddingRight: 4,
};

const agentChatBubbleStyle: React.CSSProperties = {
  maxWidth: "92%",
  borderRadius: 16,
  padding: "12px 14px",
  display: "grid",
  gap: 6,
};

const agentChatRoleStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--workspace-faint)",
};

const agentChatCopyStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-text)",
  fontSize: 14,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
};

const agentChatComposerStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 4,
};

const chatInputStyle: React.CSSProperties = {
  flex: 1,
  borderRadius: 14,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  color: "var(--workspace-text)",
  padding: "10px 12px",
  font: "inherit",
};

const chatButtonStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(51, 92, 255, 0.16)",
  background: "rgba(51, 92, 255, 0.12)",
  color: "#2947cc",
  padding: "10px 14px",
  fontWeight: 700,
  font: "inherit",
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  lineHeight: 1,
  fontWeight: 700,
};

const emptyStateStyle: React.CSSProperties = {
  display: "grid",
  justifyItems: "start",
  gap: 12,
  border: "1px dashed var(--workspace-border)",
  borderRadius: 18,
  padding: 18,
  background: "rgba(255,255,255,0.35)",
};

const emptyIconStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(15, 23, 42, 0.06)",
  color: "var(--workspace-text)",
};

const emptyTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-text)",
  fontWeight: 700,
};

const emptyCopyStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--workspace-muted)",
  fontSize: 14,
  lineHeight: 1.6,
};
