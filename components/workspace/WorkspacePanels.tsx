"use client";

import { useEffect, useState } from "react";
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
  dashboardCards?: Array<{
    id: string;
    cardType: "metric" | "table" | "queue" | "activity" | "status" | "chart";
    title: string;
    subtitle?: string;
    gridWidth: number;
    config: Record<string, unknown>;
  }>;
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
  workspaceSlug: string;
  currentRole: "admin" | "operator" | "viewer";
  initialObjectId?: string;
  initialViewId?: string;
  recordBaseHref?: string;
  askHref?: string;
};

type AgentPanelProps = {
  workspaceId: string;
  workspaceSlug: string;
  currentRole: "admin" | "operator" | "viewer";
  agentLimit: number;
  agentTemplates: Array<{
    id: string;
    name: string;
    description?: string;
    type: "copilot" | "channel" | "worker" | "chatbot";
    category?: string;
    defaultSoulMd?: string;
    defaultSkills: string[];
    defaultKnowledgeScope: Record<string, unknown>;
    defaultCronJobs: unknown[];
    defaultMemoryConfig: Record<string, unknown>;
  }>;
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
    apiEndpoint?: string;
    apiKey?: string;
    containerName?: string;
    lastHealthCheckAt?: string | null;
  }>;
  activity: PrismaWorkspaceActivity[];
};

type QueuePanelProps = {
  recordBaseHref?: string;
  queueItems: Array<{
    id: string;
    title: string;
    subtitle: string;
    status: string;
    objectId: string;
  }>;
};

type ChatPanelProps = {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  connectedApps: Array<{
    label: string;
    status: "connected" | "available";
  }>;
  quickActions: Array<{
    label: string;
    href?: string;
    prompt?: string;
    action?: "bootstrap-crm" | "bootstrap-dashboard";
    preset?: "operations" | "sales" | "crm" | "custom";
  }>;
  suggestedPrompts: string[];
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

type TeamChatPanelProps = {
  workspaceSlug: string;
  workspaceName: string;
  currentUserEmail?: string | null;
  channels: Array<{
    id: string;
    name: string;
    description?: string;
    isDefault: boolean;
    isPrivate: boolean;
  }>;
  directMessages: Array<{
    id: string;
    participantIds: string[];
    lastMessageAt?: string;
  }>;
  messages: Array<{
    id: string;
    channelId?: string;
    directMessageId?: string;
    senderLabel: string;
    content: string;
    createdAt: string;
    mentions: string[];
    recordLinks: Array<{ title: string; href: string }>;
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

export function OverviewPanel({ dashboardCards, metrics, queueItems, activity, suggestions, agents }: OverviewProps) {
  const stats = [
    { icon: Layers3, ...metrics[0] },
    { icon: Building2, ...metrics[1] },
    { icon: Bot, ...metrics[2] },
    { icon: ShieldCheck, ...metrics[3] },
  ].filter((item) => item.label && item.value);
  const cards = dashboardCards?.length ? [...dashboardCards].sort((left, right) => left.config.position as number - (right.config.position as number)) : [];

  if (cards.length > 0) {
    return (
      <div style={stackStyle}>
        <Panel eyebrow="Home" title="Resumen operativo" description="Panel compuesto desde bloques del workspace.">
          <div style={dashboardGridStyle}>
            {cards.map((card) => {
              if (card.cardType === "metric") {
                const metric = stats.find((entry) => entry.label === String(card.config.metricKey ?? ""));
                const Icon = metric?.icon ?? Layers3;
                return (
                  <article
                    key={card.id}
                    style={{
                      ...metricCardStyle,
                      gridColumn: card.gridWidth > 1 ? "span 2" : "span 1",
                    }}
                  >
                    <div style={metricIconWrapStyle}>
                      <Icon size={18} />
                    </div>
                    <p style={metricLabelStyle}>{card.title}</p>
                    <p style={metricValueStyle}>{metric?.value ?? String(card.config.value ?? "—")}</p>
                    <p style={metricHintStyle}>{card.subtitle ?? metric?.caption ?? ""}</p>
                  </article>
                );
              }

              if (card.cardType === "queue") {
                return (
                  <div key={card.id} style={{ ...panelStyle, gridColumn: card.gridWidth > 1 ? "span 2" : "span 1" }}>
                    <div style={panelHeaderStyle}>
                      <div>
                        <p style={eyebrowStyle}>Queue</p>
                        <h2 style={panelTitleStyle}>{card.title}</h2>
                        {card.subtitle ? <p style={panelDescriptionStyle}>{card.subtitle}</p> : null}
                      </div>
                    </div>
                    <div style={queueListStyle}>
                      {queueItems.slice(0, Number(card.config.limit ?? 4)).map((item) => (
                        <div key={item.id} style={queueItemStyle}>
                          <div>
                            <p style={queueTitleStyle}>{item.title}</p>
                            <p style={queueSubtitleStyle}>{item.subtitle}</p>
                          </div>
                          <StatusPill tone={item.status.toLowerCase()}>{formatStatusLabel(item.status)}</StatusPill>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              if (card.cardType === "activity") {
                return (
                  <div key={card.id} style={{ ...panelStyle, gridColumn: card.gridWidth > 1 ? "span 2" : "span 1" }}>
                    <div style={panelHeaderStyle}>
                      <div>
                        <p style={eyebrowStyle}>Actividad</p>
                        <h2 style={panelTitleStyle}>{card.title}</h2>
                        {card.subtitle ? <p style={panelDescriptionStyle}>{card.subtitle}</p> : null}
                      </div>
                    </div>
                    <div style={activityListStyle}>
                      {activity.slice(0, Number(card.config.limit ?? 6)).map((entry) => (
                        <div key={entry.id} style={agentActivityRowStyle}>
                          <p style={activityActionStyle}>{formatActivityLabel(entry.action)}</p>
                          <p style={activityDetailStyle}>{formatActivityDetails(entry.details)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              if (card.cardType === "status") {
                const activeAgents = agents.filter((agent) => agent.status === "active").length;
                return (
                  <div key={card.id} style={{ ...panelStyle, gridColumn: card.gridWidth > 1 ? "span 2" : "span 1" }}>
                    <div style={panelHeaderStyle}>
                      <div>
                        <p style={eyebrowStyle}>Estado</p>
                        <h2 style={panelTitleStyle}>{card.title}</h2>
                        {card.subtitle ? <p style={panelDescriptionStyle}>{card.subtitle}</p> : null}
                      </div>
                    </div>
                    <div style={detailListStyle}>
                      <div style={queueItemStyle}>
                        <div>
                          <p style={queueTitleStyle}>Agentes activos</p>
                          <p style={queueSubtitleStyle}>{activeAgents} disponibles</p>
                        </div>
                        <StatusPill tone="active">{activeAgents > 0 ? "Estable" : "Sin agentes"}</StatusPill>
                      </div>
                      <div style={queueItemStyle}>
                        <div>
                          <p style={queueTitleStyle}>Seguimientos</p>
                          <p style={queueSubtitleStyle}>{queueItems.length} items en cola</p>
                        </div>
                        <StatusPill tone={queueItems.length > 0 ? "pending" : "active"}>{queueItems.length > 0 ? "Atencion" : "Al dia"}</StatusPill>
                      </div>
                    </div>
                  </div>
                );
              }

              if (card.cardType === "table") {
                const rows = (card.config.rows as Array<{ title: string; value: string; meta?: string }> | undefined) ?? [];
                return (
                  <div key={card.id} style={{ ...panelStyle, gridColumn: card.gridWidth > 1 ? "span 2" : "span 1" }}>
                    <div style={panelHeaderStyle}>
                      <div>
                        <p style={eyebrowStyle}>Vista</p>
                        <h2 style={panelTitleStyle}>{card.title}</h2>
                        {card.subtitle ? <p style={panelDescriptionStyle}>{card.subtitle}</p> : null}
                      </div>
                    </div>
                    <div style={detailListStyle}>
                      {rows.map((row) => (
                        <div key={`${card.id}-${row.title}`} style={queueItemStyle}>
                          <div>
                            <p style={queueTitleStyle}>{row.title}</p>
                            {row.meta ? <p style={queueSubtitleStyle}>{row.meta}</p> : null}
                          </div>
                          <strong style={recordFieldValueStyle}>{row.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Home"
        title="Resumen operativo"
        description="Lo importante del dia en un solo lugar."
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
          description={`${queueItems.length} items requieren seguimiento.`}
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
          title="Actividad reciente"
          description="Cambios recientes en lenguaje claro."
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
                    <p style={activityActionStyle}>{formatActivityLabel(entry.action)}</p>
                    <p style={activityDetailStyle}>
                      {formatActivityDetails(entry.details)}
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
        eyebrow="Copilot"
          title="Siguientes pasos sugeridos"
          description="Recomendaciones concretas para avanzar."
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
          eyebrow="Agents"
          title="Cobertura del equipo"
          description="Quien esta activo y que esta cubriendo."
        >
          <div style={detailListStyle}>
            {agents.slice(0, 4).map((agent) => (
              <div key={agent.id} style={queueItemStyle}>
                <div>
                  <p style={queueTitleStyle}>{agent.name}</p>
                  <p style={queueSubtitleStyle}>{agent.description ?? "Sin descripcion."}</p>
                </div>
                <StatusPill tone={agent.status.toLowerCase()}>{formatAgentTypeLabel(agent.type)}</StatusPill>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function QueuePanel({ queueItems, recordBaseHref }: QueuePanelProps) {
  const [filter, setFilter] = useState<string>("all");
  const filteredQueueItems =
    filter === "all" ? queueItems : queueItems.filter((item) => item.status.toLowerCase() === filter);
  const filters = [
    { id: "all", label: "Todas" },
    { id: "pending", label: "Pendientes" },
    { id: "needs_review", label: "Por revisar" },
    { id: "follow_up", label: "Seguimiento" },
  ];

  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Queue"
        title="Queue"
        description={`${queueItems.length} items requieren accion.`}
      >
        <div style={filterRowStyle}>
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              style={{
                ...filterButtonStyle,
                background: filter === item.id ? "rgba(51, 92, 255, 0.12)" : "var(--workspace-panel)",
                borderColor: filter === item.id ? "rgba(51, 92, 255, 0.2)" : "var(--workspace-border)",
                color: filter === item.id ? "#2947cc" : "var(--workspace-text)",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {filteredQueueItems.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No hay tareas urgentes"
            description="Cuando los agentes detecten aprobaciones pendientes o seguimientos bloqueados, aparecerán aquí."
          />
        ) : (
          <div style={queueTableStyle}>
            {filteredQueueItems.map((item) => (
              <a
                key={item.id}
                href={recordBaseHref ? `${recordBaseHref}&object=${item.objectId}&record=${item.id}` : undefined}
                style={{
                  ...queueTableRowStyle,
                  borderLeft: `4px solid ${resolvePriorityColor(item.status)}`,
                  textDecoration: "none",
                }}
              >
                <div>
                  <p style={queueTitleStyle}>{item.title}</p>
                  <p style={queueSubtitleStyle}>
                    {item.subtitle} · {formatQueueAction(item.status)}
                  </p>
                </div>
                <div style={queueRightStyle}>
                  <StatusPill tone={item.status.toLowerCase()}>{formatStatusLabel(item.status)}</StatusPill>
                  <ArrowRight size={16} color="var(--workspace-muted)" />
                </div>
              </a>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export function ChatPanel({
  workspaceId,
  workspaceSlug,
  userId,
  connectedApps,
  quickActions,
  suggestedPrompts,
  contextSummary,
  copilotAgent,
  askPrompt,
}: ChatPanelProps) {
  const storageKey = `prisma-chat:${workspaceSlug}:${userId}:${copilotAgent?.id ?? "copilot"}`;
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

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
    if (!selectedSessionId) {
      return;
    }
    setRenameDraft(selectedSessionTitle);
  }, [selectedSessionId, selectedSessionTitle]);

  useEffect(() => {
    if (!askPrompt || !selectedSessionId) {
      return;
    }
    if (selectedSessionMessageCount === 0 && !input.trim()) {
      setInput(askPrompt);
    }
  }, [askPrompt, input, selectedSessionId, selectedSessionMessageCount]);

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

      const uploadedRecordId = payload.recordId;
      const uploadedDocumentName = payload.documentName;
      const uploadedPublicUrl = payload.publicUrl;

      updateSession(selectedSession.id, (session) => ({
        ...session,
        attachments: [
          {
            id: uploadedRecordId,
            fileName: uploadedDocumentName,
            publicUrl: uploadedPublicUrl,
            contentType: payload.contentType ?? file.type ?? "application/octet-stream",
          },
          ...session.attachments,
        ],
        messages: [
          ...session.messages,
          {
            id: `upload-${Date.now()}`,
            role: "assistant",
            content: `Documento subido: ${uploadedDocumentName}. Se agregó al dataset Documents y el workspace se actualizará.`,
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
        throw new Error("No se pudo conectar con el copilot.");
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

  async function runWorkspaceAction(action: "bootstrap-crm" | "bootstrap-dashboard", preset?: "operations" | "sales" | "crm" | "custom") {
    setError(null);
    setActionFeedback(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action === "bootstrap-dashboard" ? "create-dashboard" : action,
          preset,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo ejecutar la acción.");
      }
      setActionFeedback(
        action === "bootstrap-crm"
          ? "CRM inicial creado. Recarga el workspace para ver tablas, vistas y datos base."
          : "Dashboard inicial creado. Regresa a Home para ver las nuevas tarjetas.",
      );
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo ejecutar la acción.");
    }
  }

  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Chat"
        title="Chat con CEO"
        description="Conversaciones separadas por usuario dentro del workspace."
      >
        {!copilotAgent ? (
          <EmptyState
            icon={Bot}
            title="No hay copilot disponible"
            description="Activa un agente copilot para usar el chat del workspace."
          />
        ) : (
          <div style={chatLayoutStyle}>
            <div style={chatSidebarStyle}>
              <div style={chatSidebarHeaderStyle}>
                <div>
                  <p style={eyebrowStyle}>Sesiones</p>
                  <p style={chatSidebarCopyStyle}>{copilotAgent.name}</p>
                </div>
                <button type="button" onClick={createNewChat} style={chatActionButtonStyle}>
                  Nuevo chat
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
                        {session.messages.length ? `${session.messages.length} mensajes` : "Sesión nueva"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSession(session.id)}
                      style={chatDeleteButtonStyle}
                      aria-label={`Eliminar ${session.title}`}
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
                  <p style={eyebrowStyle}>Conversación actual</p>
                  <h3 style={chatTitleStyle}>{selectedSession?.title ?? "Nuevo chat"}</h3>
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
                  aria-label="Renombrar conversación actual"
                />
                <label style={chatUploadLabelStyle}>
                  {isUploading ? "Subiendo..." : "Subir documento"}
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
                  <div style={chatEmptyStateStyle}>
                    <div style={chatEmptyHeroStyle}>
                      <div style={chatEmptyAvatarStyle}>
                        <Sparkles size={20} />
                      </div>
                      <div>
                        <p style={chatEmptyTitleStyle}>Hola, ¿cómo te ayudo hoy?</p>
                        <p style={chatEmptyCopyStyle}>Pregúntame por tu workspace o dime qué necesitas construir.</p>
                      </div>
                    </div>

                    <div style={chatCapabilityRowStyle}>
                      {connectedApps.map((app) => (
                        <span key={app.label} style={chatCapabilityChipStyle}>
                          {app.label} {app.status === "connected" ? "✓" : "+"}
                        </span>
                      ))}
                    </div>

                    <div style={chatEmptySectionStyle}>
                      <p style={chatEmptySectionTitleStyle}>Sugerido</p>
                      <div style={chatActionListStyle}>
                        {suggestedPrompts.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            style={chatPromptCardStyle}
                            onClick={() => setInput(prompt)}
                          >
                            <Sparkles size={16} />
                            <span>{prompt}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={chatEmptySectionStyle}>
                      <p style={chatEmptySectionTitleStyle}>Acciones rápidas</p>
                      <div style={chatActionListStyle}>
                        {quickActions.map((action) =>
                          action.href ? (
                            <a key={action.label} href={action.href} style={chatPromptCardStyle}>
                              <ArrowRight size={16} />
                              <span>{action.label}</span>
                            </a>
                          ) : action.action ? (
                            <button
                              key={action.label}
                              type="button"
                              style={chatPromptCardStyle}
                              onClick={() => void runWorkspaceAction(action.action!, action.preset)}
                            >
                              <ArrowRight size={16} />
                              <span>{action.label}</span>
                            </button>
                          ) : (
                            <button
                              key={action.label}
                              type="button"
                              style={chatPromptCardStyle}
                              onClick={() => setInput(action.prompt ?? action.label)}
                            >
                              <ArrowRight size={16} />
                              <span>{action.label}</span>
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
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
                        <p style={chatAttachmentMetaStyle}>Registro en documentos · {attachment.id.slice(0, 8)}…</p>
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
                  placeholder="Escribe una pregunta sobre este workspace..."
                  rows={4}
                  style={chatTextareaStyle}
                />
                <div style={chatComposerFooterStyle}>
                  <button type="button" onClick={sendMessage} disabled={isLoading || !input.trim()} style={chatSendButtonStyle}>
                    {isLoading ? <LoaderCircle size={16} className="workspace-spin" /> : "Enviar"}
                  </button>
                </div>
                {actionFeedback ? <p style={inlineSuccessStyle}>{actionFeedback}</p> : null}
                {error ? <p style={chatErrorStyle}>{error}</p> : null}
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function DataPanel({
  objects,
  fields,
  views,
  records,
  workspaceSlug,
  currentRole,
  initialObjectId,
  initialViewId,
  recordBaseHref,
  askHref,
}: DataPanelProps) {
  const [selectedObjectId, setSelectedObjectId] = useState<string>(initialObjectId ?? objects[0]?.id ?? "");
  const [selectedViewId, setSelectedViewId] = useState<string>(initialViewId ?? "all");
  const [query, setQuery] = useState("");
  const [localRecords, setLocalRecords] = useState<PrismaWorkspaceRecord[]>(records);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreatingRecord, setIsCreatingRecord] = useState(false);
  const [recordDraft, setRecordDraft] = useState<Record<string, unknown>>({});
  const [editingCell, setEditingCell] = useState<{ recordId: string; fieldKey: string } | null>(null);
  const [editingValue, setEditingValue] = useState<unknown>("");
  const [isSavingCell, setIsSavingCell] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [tableError, setTableError] = useState("");
  const [tableSuccess, setTableSuccess] = useState("");

  const canWrite = currentRole === "admin" || currentRole === "operator";
  const object = objects.find((entry) => entry.id === selectedObjectId) ?? objects[0] ?? null;
  const objectFields = fields
    .filter((field) => field.objectId === object?.id)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const objectViews = views.filter((view) => view.objectId === object?.id);
  const currentView = selectedViewId === "all" ? null : objectViews.find((view) => view.id === selectedViewId) ?? null;
  const scopedRecords = localRecords.filter((record) => record.objectId === object?.id);
  const visibleRecords = applyViewToRecords(scopedRecords, currentView).filter((record) =>
    query.trim()
      ? Object.values(record.data).some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
      : true,
  );

  useEffect(() => {
    setLocalRecords(records);
  }, [records]);

  useEffect(() => {
    if (!object) {
      return;
    }
    if (selectedObjectId) {
      return;
    }
    setSelectedObjectId(object.id);
  }, [object, selectedObjectId]);

  useEffect(() => {
    if (!initialObjectId || initialObjectId === selectedObjectId) {
      return;
    }
    setSelectedObjectId(initialObjectId);
    setSelectedViewId("all");
    setEditingCell(null);
    setTableError("");
    setTableSuccess("");
  }, [initialObjectId, selectedObjectId]);

  useEffect(() => {
    if (!initialViewId) {
      if (selectedViewId !== "all") {
        setSelectedViewId("all");
      }
      return;
    }
    if (initialViewId !== selectedViewId) {
      setSelectedViewId(initialViewId);
    }
  }, [initialViewId, selectedViewId]);

  function parseSelectOptions(field: PrismaWorkspaceField) {
    const rawValues =
      Array.isArray(field.options.values) ? field.options.values : Array.isArray(field.options.options) ? field.options.options : [];
    return rawValues
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean);
  }

  function initialValueForField(field: PrismaWorkspaceField) {
    if (field.defaultValue !== null && field.defaultValue !== undefined) {
      if (field.type === "boolean") {
        return field.defaultValue === "true";
      }
      return field.defaultValue;
    }
    if (field.type === "boolean") {
      return false;
    }
    return "";
  }

  function normalizeFieldValue(field: PrismaWorkspaceField, value: unknown) {
    if (field.type === "boolean") {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return value.toLowerCase() === "true";
      return Boolean(value);
    }

    if (value === null || value === undefined) {
      return field.required ? "" : null;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return field.required ? "" : null;
      }
      if (field.type === "number") {
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : trimmed;
      }
      return trimmed;
    }

    if (field.type === "number" && typeof value === "number") {
      return Number.isFinite(value) ? value : field.required ? "" : null;
    }

    return value;
  }

  function buildRecordDataFromDraft(draft: Record<string, unknown>) {
    return objectFields.reduce<Record<string, unknown>>((accumulator, field) => {
      accumulator[field.key] = normalizeFieldValue(field, draft[field.key]);
      return accumulator;
    }, {});
  }

  function isMissingRequiredValue(value: unknown) {
    return value === null || value === undefined || value === "";
  }

  function resetDraftForCurrentObject() {
    const nextDraft = objectFields.reduce<Record<string, unknown>>((accumulator, field) => {
      accumulator[field.key] = initialValueForField(field);
      return accumulator;
    }, {});
    setRecordDraft(nextDraft);
  }

  function openCreatePanel() {
    if (!canWrite || !object) {
      return;
    }
    resetDraftForCurrentObject();
    setTableError("");
    setTableSuccess("");
    setIsCreateOpen(true);
  }

  async function createRecord() {
    if (!object || !canWrite || isCreatingRecord) {
      return;
    }

    const data = buildRecordDataFromDraft(recordDraft);
    const missingRequiredFields = objectFields.filter(
      (field) => field.required && isMissingRequiredValue(data[field.key]),
    );
    if (missingRequiredFields.length > 0) {
      setTableError(`Completa los campos obligatorios: ${missingRequiredFields.map((field) => field.name).join(", ")}.`);
      return;
    }

    setIsCreatingRecord(true);
    setTableError("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectId: object.id,
          data,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        record?: PrismaWorkspaceRecord;
      };

      if (!response.ok || !payload.record) {
        throw new Error(payload.error ?? "No se pudo crear el registro.");
      }

      setLocalRecords((current) => [payload.record!, ...current.filter((entry) => entry.id !== payload.record!.id)]);
      setTableSuccess("Registro creado.");
      setIsCreateOpen(false);
      setRecordDraft({});
    } catch (error) {
      setTableError(error instanceof Error ? error.message : "No se pudo crear el registro.");
    } finally {
      setIsCreatingRecord(false);
    }
  }

  function startInlineEdit(record: PrismaWorkspaceRecord, field: PrismaWorkspaceField) {
    if (!canWrite) {
      return;
    }
    const rawValue = getRecordFieldValue(record, field.key);
    setEditingCell({ recordId: record.id, fieldKey: field.key });
    if (field.type === "boolean") {
      setEditingValue(Boolean(rawValue));
      return;
    }
    setEditingValue(rawValue === null || rawValue === undefined ? "" : String(rawValue));
  }

  function cancelInlineEdit() {
    setEditingCell(null);
    setEditingValue("");
  }

  async function saveInlineEdit(record: PrismaWorkspaceRecord, field: PrismaWorkspaceField) {
    if (!canWrite || isSavingCell) {
      return;
    }

    const nextValue = normalizeFieldValue(field, editingValue);
    const existingValue = record.data[field.key];
    if (JSON.stringify(existingValue) === JSON.stringify(nextValue)) {
      cancelInlineEdit();
      return;
    }

    const nextData = { ...record.data, [field.key]: nextValue };
    const previousSnapshot = localRecords;

    setIsSavingCell(true);
    setTableError("");
    setLocalRecords((current) =>
      current.map((entry) =>
        entry.id === record.id
          ? {
              ...entry,
              data: nextData,
            }
          : entry,
      ),
    );

    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: nextData }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        record?: PrismaWorkspaceRecord;
      };

      if (!response.ok || !payload.record) {
        throw new Error(payload.error ?? "No se pudo actualizar el registro.");
      }

      setLocalRecords((current) =>
        current.map((entry) => (entry.id === payload.record!.id ? payload.record! : entry)),
      );
      setTableSuccess("Registro actualizado.");
    } catch (error) {
      setLocalRecords(previousSnapshot);
      setTableError(error instanceof Error ? error.message : "No se pudo actualizar el registro.");
    } finally {
      setIsSavingCell(false);
      cancelInlineEdit();
    }
  }

  async function deleteRecord(recordId: string) {
    if (!canWrite || isDeletingRecord) {
      return;
    }
    const previousSnapshot = localRecords;

    setIsDeletingRecord(true);
    setTableError("");
    setLocalRecords((current) => current.filter((entry) => entry.id !== recordId));
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/records/${recordId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo eliminar el registro.");
      }
      setDeleteTargetId(null);
      setTableSuccess("Registro eliminado.");
    } catch (error) {
      setLocalRecords(previousSnapshot);
      setTableError(error instanceof Error ? error.message : "No se pudo eliminar el registro.");
    } finally {
      setIsDeletingRecord(false);
    }
  }

  const summary = object
    ? `${visibleRecords.length} registros visibles · ${objectFields.length} campos activos · ${objectViews.length} vistas guardadas`
    : "Selecciona un objeto para empezar.";

  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Data"
        title={object?.name ?? "Datos"}
        description={object ? `${visibleRecords.length} registros visibles en esta vista.` : "Selecciona un objeto para empezar."}
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
                  setEditingCell(null);
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

            {canWrite ? (
              <button type="button" style={primaryButtonStyle} onClick={openCreatePanel}>
                Nuevo registro
              </button>
            ) : null}
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
                Consultar con CEO
              </a>
            ) : null}
            {!canWrite ? <StatusPill tone="neutral">Solo lectura</StatusPill> : null}
          </div>
          <p style={metaCopyStyle}>{summary.replace("campos activos", "columnas").replace("1 vistas guardadas", "1 vista guardada")}</p>
        </div>

        {tableError ? <p style={inlineErrorStyle}>{tableError}</p> : null}
        {tableSuccess ? <p style={inlineSuccessStyle}>{tableSuccess}</p> : null}

        {object && visibleRecords.length > 0 ? (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {objectFields.map((field) => (
                    <th key={field.id} style={tableHeadStyle}>
                      <span>{field.name}</span>
                    </th>
                  ))}
                  {canWrite ? <th style={tableHeadStyle}>Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((record) => (
                  <tr
                    key={record.id}
                    style={recordBaseHref ? clickableRowStyle : undefined}
                    onClick={() => {
                      if (editingCell) {
                        return;
                      }
                      if (!recordBaseHref || !object?.id) {
                        return;
                      }
                      window.location.href = `${recordBaseHref}&object=${object.id}&record=${record.id}`;
                    }}
                  >
                    {objectFields.map((field) => {
                      const value = getRecordFieldValue(record, field.key);
                      const isEditing =
                        editingCell?.recordId === record.id && editingCell.fieldKey === field.key;
                      const options = parseSelectOptions(field);

                      return (
                        <td
                          key={`${record.id}-${field.id}`}
                          style={tableCellStyle}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!canWrite) return;
                            startInlineEdit(record, field);
                          }}
                        >
                          {isEditing ? (
                            field.type === "status" || field.type === "select" ? (
                              <select
                                autoFocus
                                value={String(editingValue ?? "")}
                                onChange={(event) => setEditingValue(event.target.value)}
                                onBlur={() => void saveInlineEdit(record, field)}
                                style={inlineInputStyle}
                              >
                                <option value="">Selecciona</option>
                                {options.map((option) => (
                                  <option key={option} value={option}>
                                    {formatStatusLabel(option)}
                                  </option>
                                ))}
                              </select>
                            ) : field.type === "boolean" ? (
                              <select
                                autoFocus
                                value={String(Boolean(editingValue))}
                                onChange={(event) => setEditingValue(event.target.value === "true")}
                                onBlur={() => void saveInlineEdit(record, field)}
                                style={inlineInputStyle}
                              >
                                <option value="true">Sí</option>
                                <option value="false">No</option>
                              </select>
                            ) : (
                              <input
                                autoFocus
                                type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                                value={String(editingValue ?? "")}
                                onChange={(event) => setEditingValue(event.target.value)}
                                onBlur={() => void saveInlineEdit(record, field)}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    cancelInlineEdit();
                                  }
                                  if (event.key === "Enter") {
                                    event.currentTarget.blur();
                                  }
                                }}
                                style={inlineInputStyle}
                              />
                            )
                          ) : field.key === "status" ? (
                            <StatusPill tone={String(value ?? "").toLowerCase()}>
                              {formatStatusLabel(String(value ?? "—"))}
                            </StatusPill>
                          ) : field.type === "boolean" ? (
                            <span>{Boolean(value) ? "Sí" : "No"}</span>
                          ) : (
                            <span>{value !== null && value !== undefined && String(value).length > 0 ? String(value) : "—"}</span>
                          )}
                        </td>
                      );
                    })}
                    {canWrite ? (
                      <td style={tableCellStyle} onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          style={dangerButtonStyle}
                          onClick={() => setDeleteTargetId(record.id)}
                          disabled={isDeletingRecord}
                        >
                          Eliminar
                        </button>
                      </td>
                    ) : null}
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
                ? "Ajusta la vista o la búsqueda, o usa el copilot para crear los primeros registros."
                : "Primero crea objetos y campos para que la vista dinámica tenga estructura."
            }
          />
        )}
      </Panel>

      {isCreateOpen && object ? (
        <div style={modalOverlayStyle} role="presentation" onClick={() => setIsCreateOpen(false)}>
          <div style={modalCardStyle} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <div>
                <p style={eyebrowStyle}>Nuevo registro</p>
                <h3 style={agentDetailTitleStyle}>{object.name}</h3>
              </div>
              <button type="button" style={chatActionButtonStyle} onClick={() => setIsCreateOpen(false)}>
                Cerrar
              </button>
            </div>

            <div style={modalFieldsGridStyle}>
              {objectFields.map((field) => {
                const options = parseSelectOptions(field);
                const value = recordDraft[field.key] ?? "";
                return (
                  <label key={field.id} style={fieldStyle}>
                    {field.name}
                    {field.required ? " *" : ""}
                    {field.type === "status" || field.type === "select" ? (
                      <select
                        value={String(value ?? "")}
                        onChange={(event) =>
                          setRecordDraft((current) => ({ ...current, [field.key]: event.target.value }))
                        }
                        style={inputStyle}
                      >
                        <option value="">{field.required ? "Selecciona una opción" : "Sin valor"}</option>
                        {options.map((option) => (
                          <option key={option} value={option}>
                            {formatStatusLabel(option)}
                          </option>
                        ))}
                      </select>
                    ) : field.type === "boolean" ? (
                      <label style={toggleStyle}>
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(event) =>
                            setRecordDraft((current) => ({ ...current, [field.key]: event.target.checked }))
                          }
                        />
                        Activo
                      </label>
                    ) : (
                      <input
                        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                        value={String(value ?? "")}
                        onChange={(event) =>
                          setRecordDraft((current) => ({ ...current, [field.key]: event.target.value }))
                        }
                        style={inputStyle}
                      />
                    )}
                  </label>
                );
              })}
            </div>

            <div style={actionsStyle}>
              <button type="button" style={primaryButtonStyle} onClick={() => void createRecord()} disabled={isCreatingRecord}>
                {isCreatingRecord ? "Guardando..." : "Guardar"}
              </button>
              <button type="button" style={chatActionButtonStyle} onClick={() => setIsCreateOpen(false)} disabled={isCreatingRecord}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTargetId ? (
        <div style={modalOverlayStyle} role="presentation" onClick={() => setDeleteTargetId(null)}>
          <div style={confirmCardStyle} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <p style={agentNameStyle}>¿Eliminar este registro?</p>
            <p style={queueSubtitleStyle}>Esta acción no se puede deshacer.</p>
            <div style={actionsStyle}>
              <button
                type="button"
                style={dangerButtonStyle}
                onClick={() => void deleteRecord(deleteTargetId)}
                disabled={isDeletingRecord}
              >
                {isDeletingRecord ? "Eliminando..." : "Eliminar"}
              </button>
              <button type="button" style={chatActionButtonStyle} onClick={() => setDeleteTargetId(null)} disabled={isDeletingRecord}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AgentsPanel({
  workspaceId,
  currentRole,
  workspaceSlug,
  agentLimit,
  agentTemplates,
  agents,
  activity,
}: AgentPanelProps) {
  const [localAgents, setLocalAgents] = useState(agents);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(agentTemplates[0]?.id ?? "");
  const [isCreateMode, setIsCreateMode] = useState(agents.length === 0);
  const [draft, setDraft] = useState<{
    id?: string;
    name: string;
    role: string;
    description: string;
    soulMd: string;
    skills: string;
    read: string;
    write: string;
    channels: string;
    cronJobs: string;
    isActive: boolean;
  }>({
    name: "",
    role: "custom",
    description: "",
    soulMd: "",
    skills: "",
    read: "",
    write: "",
    channels: "",
    cronJobs: "[]",
    isActive: true,
  });
  const [builderError, setBuilderError] = useState<string>("");
  const [builderSuccess, setBuilderSuccess] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [deploymentDraft, setDeploymentDraft] = useState({
    apiEndpoint: "",
    apiKey: "",
    containerName: "",
  });
  const [isSavingDeployment, setIsSavingDeployment] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [deploymentFeedback, setDeploymentFeedback] = useState<string>("");
  const [lastHealthCheckAt, setLastHealthCheckAt] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content: "Usa este chat para validar el agente seleccionado sin salir del workspace.",
    },
  ]);
  const selectedAgent = localAgents.find((agent) => agent.id === selectedAgentId) ?? localAgents[0] ?? null;
  const selectedActivity = activity.filter((entry) => entry.agentId === selectedAgent?.id).slice(0, 10);
  const activeAgentCount = localAgents.length;
  const canManageDeployment = currentRole === "admin";

  useEffect(() => {
    setLocalAgents(agents);
  }, [agents]);

  useEffect(() => {
    const current = localAgents.find((agent) => agent.id === selectedAgentId) ?? null;
    if (!current) {
      if (localAgents.length === 0) {
        setIsCreateMode(true);
      }
      return;
    }

    setDraft({
      id: current.id,
      name: current.name,
      role: mapAgentTypeToRole(current.type),
      description: current.description ?? "",
      soulMd: current.soulMd ?? "",
      skills: current.tools.join(", "),
      read: current.read.join(", "),
      write: current.write.join(", "),
      channels: current.channels.join(", "),
      cronJobs: JSON.stringify(current.cronJobs ?? [], null, 2),
      isActive: current.status !== "paused",
    });
    setDeploymentDraft({
      apiEndpoint: current.apiEndpoint ?? "",
      apiKey: current.apiKey ?? "",
      containerName: current.containerName ?? "",
    });
    setIsCreateMode(false);
  }, [localAgents, selectedAgentId]);

  function applyTemplate(templateId: string) {
    const template = agentTemplates.find((entry) => entry.id === templateId);
    setSelectedTemplateId(templateId);
    if (!template) {
      return;
    }

    setDraft({
      id: undefined,
      name: template.name,
      role: mapTemplateTypeToRole(template.type),
      description: template.description ?? "",
      soulMd: template.defaultSoulMd ?? "",
      skills: template.defaultSkills.join(", "),
      read: Array.isArray(template.defaultKnowledgeScope.read) ? (template.defaultKnowledgeScope.read as string[]).join(", ") : "",
      write: Array.isArray(template.defaultKnowledgeScope.write) ? (template.defaultKnowledgeScope.write as string[]).join(", ") : "",
      channels: Array.isArray(template.defaultKnowledgeScope.channels) ? (template.defaultKnowledgeScope.channels as string[]).join(", ") : "",
      cronJobs: JSON.stringify(template.defaultCronJobs ?? [], null, 2),
      isActive: true,
    });
    setBuilderError("");
    setBuilderSuccess("");
    setIsCreateMode(true);
  }

  function startBlankAgent() {
    setSelectedAgentId("");
    setDraft({
      id: undefined,
      name: "",
      role: "custom",
      description: "",
      soulMd: "",
      skills: "",
      read: "",
      write: "",
      channels: "",
      cronJobs: "[]",
      isActive: true,
    });
    setBuilderError("");
    setBuilderSuccess("");
    setIsCreateMode(true);
  }

  async function saveDeploymentSettings() {
    if (!selectedAgent || !canManageDeployment || isSavingDeployment) {
      return;
    }

    if (!deploymentDraft.apiEndpoint.trim()) {
      setDeploymentFeedback("El endpoint del agente es obligatorio.");
      return;
    }

    if (!deploymentDraft.apiKey.trim()) {
      setDeploymentFeedback("La API key del agente es obligatoria.");
      return;
    }

    if (!deploymentDraft.containerName.trim()) {
      setDeploymentFeedback("El nombre del contenedor es obligatorio.");
      return;
    }

    setIsSavingDeployment(true);
    setDeploymentFeedback("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/agents/${selectedAgent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiEndpoint: deploymentDraft.apiEndpoint.trim(),
          apiKey: deploymentDraft.apiKey.trim(),
          containerName: deploymentDraft.containerName.trim(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        agent?: {
          id: string;
          apiEndpoint?: string;
          containerName?: string;
          status?: string;
          lastHealthCheckAt?: string | null;
        };
      };
      if (!response.ok || !payload.agent) {
        throw new Error(payload.error ?? "No se pudo guardar el despliegue.");
      }

      setLocalAgents((current) =>
        current.map((agent) =>
          agent.id === payload.agent!.id
            ? {
                ...agent,
                apiEndpoint: payload.agent!.apiEndpoint ?? agent.apiEndpoint,
                containerName: payload.agent!.containerName ?? agent.containerName,
                status: payload.agent!.status ?? agent.status,
                lastHealthCheckAt: payload.agent!.lastHealthCheckAt ?? agent.lastHealthCheckAt,
              }
            : agent,
        ),
      );

      if (payload.agent.lastHealthCheckAt) {
        setLastHealthCheckAt(payload.agent.lastHealthCheckAt);
      }

      setDeploymentFeedback("Configuración de despliegue guardada.");
    } catch (error) {
      setDeploymentFeedback(error instanceof Error ? error.message : "No se pudo guardar el despliegue.");
    } finally {
      setIsSavingDeployment(false);
    }
  }

  async function checkAgentHealth() {
    if (!selectedAgent || !canManageDeployment || isCheckingHealth) {
      return;
    }

    setIsCheckingHealth(true);
    setDeploymentFeedback("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/agents/${selectedAgent.id}`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
        healthy?: boolean;
        lastHealthCheckAt?: string | null;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo verificar conexión.");
      }

      setLocalAgents((current) =>
        current.map((agent) =>
          agent.id === selectedAgent.id
            ? {
                ...agent,
                status: payload.status ?? agent.status,
                lastHealthCheckAt: payload.lastHealthCheckAt ?? agent.lastHealthCheckAt,
              }
            : agent,
        ),
      );

      if (payload.lastHealthCheckAt) {
        setLastHealthCheckAt(payload.lastHealthCheckAt);
      }

      setDeploymentFeedback(payload.healthy ? "Agente en línea." : "No se puede conectar con el agente.");
    } catch (error) {
      setDeploymentFeedback(error instanceof Error ? error.message : "No se pudo verificar conexión.");
    } finally {
      setIsCheckingHealth(false);
    }
  }

  async function saveAgent() {
    setBuilderError("");
    setBuilderSuccess("");

    if (!draft.name.trim()) {
      setBuilderError("El nombre del agente es obligatorio.");
      return;
    }

    if (isCreateMode && activeAgentCount >= agentLimit) {
      setBuilderError(`Este workspace ya usa ${activeAgentCount} de ${agentLimit} agentes. Contacta a Superwave para ampliar el plan.`);
      return;
    }

    setIsSaving(true);
    try {
      const parsedCronJobs = draft.cronJobs.trim() ? JSON.parse(draft.cronJobs) : [];
      const payload = {
        id: draft.id,
        workspaceId,
        name: draft.name,
        role: draft.role,
        promptPack: {
          objective: draft.description,
          soulMd: draft.soulMd,
        },
        toolsConfig: {
          skills: parseCsvList(draft.skills),
          knowledgeScope: {
            read: parseCsvList(draft.read),
            write: parseCsvList(draft.write),
            channels: parseCsvList(draft.channels),
          },
        },
        integrationConfig: {
          knowledgeScope: {
            read: parseCsvList(draft.read),
            write: parseCsvList(draft.write),
            channels: parseCsvList(draft.channels),
          },
          cronJobs: Array.isArray(parsedCronJobs) ? parsedCronJobs : [],
        },
        isActive: draft.isActive,
      };

      const response = await fetch("/api/admin/agents", {
        method: isCreateMode ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        agent?: {
          id: string;
          name: string;
          role: string;
          promptPack?: Record<string, unknown>;
          toolsConfig?: Record<string, unknown>;
          integrationConfig?: Record<string, unknown>;
          isActive?: boolean;
        };
      };

      if (!response.ok || !data.agent) {
        throw new Error(data.error ?? "No se pudo guardar el agente.");
      }

      const mappedAgent = {
        id: data.agent.id,
        name: data.agent.name,
        type: mapRoleToAgentType(data.agent.role),
        status: data.agent.isActive === false ? "paused" : "active",
        description:
          typeof data.agent.promptPack?.objective === "string" ? data.agent.promptPack.objective : draft.description,
        tools: Array.isArray(data.agent.toolsConfig?.skills) ? (data.agent.toolsConfig?.skills as string[]) : parseCsvList(draft.skills),
        read: parseCsvList(draft.read),
        write: parseCsvList(draft.write),
        channels: parseCsvList(draft.channels),
        cronJobs: Array.isArray(data.agent.integrationConfig?.cronJobs) ? (data.agent.integrationConfig?.cronJobs as unknown[]) : Array.isArray(parsedCronJobs) ? parsedCronJobs : [],
        memoryLabel: "Activada",
        soulMd: typeof data.agent.promptPack?.soulMd === "string" ? data.agent.promptPack.soulMd : draft.soulMd,
        runtimeLabel: draft.id ? selectedAgent?.runtimeLabel ?? `hermes-${workspaceSlug}-${draft.role}` : `hermes-${workspaceSlug}-${draft.role}`,
      };

      setLocalAgents((current) => {
        if (isCreateMode) {
          return [mappedAgent, ...current];
        }
        return current.map((agent) => (agent.id === mappedAgent.id ? mappedAgent : agent));
      });
      setSelectedAgentId(mappedAgent.id);
      setIsCreateMode(false);
      setBuilderSuccess(isCreateMode ? "Agente creado." : "Agente actualizado.");
    } catch (caughtError) {
      setBuilderError(caughtError instanceof Error ? caughtError.message : "No se pudo guardar el agente.");
    } finally {
      setIsSaving(false);
    }
  }

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
          workspaceId,
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
        throw new Error(errorText || "No se pudo contactar al agente seleccionado.");
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
              throw new Error(parsed.error ?? "La solicitud al agente falló.");
            }
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido al contactar al agente.";
      setChatError(message);
      setChatMessages((current) => {
        const updated = [...current];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "El agente seleccionado no pudo responder en este momento. Revisa la configuración e inténtalo de nuevo.",
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
        title="Agentes"
        description={`${activeAgentCount} de ${agentLimit} agentes en uso. Crea o edita agentes desde este canvas.`}
      >
        <div style={agentToolbarStyle}>
          <div style={agentTemplateChooserStyle}>
            <select
              value={selectedTemplateId}
              onChange={(event) => applyTemplate(event.target.value)}
              style={inputStyle}
            >
              {agentTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <button type="button" style={chatActionButtonStyle} onClick={() => applyTemplate(selectedTemplateId)}>
              Usar plantilla
            </button>
            <button type="button" style={chatActionButtonStyle} onClick={startBlankAgent}>
              Agente en blanco
            </button>
          </div>
          <StatusPill tone={activeAgentCount < agentLimit ? "active" : "pending"}>
            {activeAgentCount}/{agentLimit} agentes
          </StatusPill>
        </div>

        <div style={agentGridStyle}>
          <div style={agentListStyle}>
            {localAgents.map((agent) => (
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
                  <StatusPill tone={agent.status.toLowerCase()}>{formatStatusLabel(agent.status)}</StatusPill>
                </div>
                <div>
                  <p style={agentNameStyle}>{agent.name}</p>
                  <p style={agentDescriptionStyle}>{agent.description ?? "Sin descripción"}</p>
                </div>
                <div style={agentMetaWrapStyle}>
                  <StatusPill tone={resolveAgentTypeTone(agent.type)}>{formatAgentTypeLabel(agent.type)}</StatusPill>
                  <StatusPill tone="neutral">{agent.tools.length} herramientas</StatusPill>
                </div>
              </button>
            ))}
          </div>

          <div style={agentDetailCardStyle}>
            <div style={agentDetailHeaderStyle}>
              <div>
                <p style={eyebrowStyle}>{isCreateMode ? "Nuevo agente" : "Canvas"}</p>
                <h3 style={agentDetailTitleStyle}>{isCreateMode ? "Crear agente" : draft.name || "Editar agente"}</h3>
                <p style={agentDescriptionStyle}>
                  Define identidad, instrucciones, permisos y ejecución desde el workspace.
                </p>
              </div>
              {!isCreateMode && selectedAgent ? (
                <StatusPill tone={selectedAgent.status.toLowerCase()}>{formatStatusLabel(selectedAgent.status)}</StatusPill>
              ) : null}
            </div>

            <div style={agentCanvasGridStyle}>
              <label style={fieldStyle}>
                Nombre
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={fieldStyle}>
                Tipo
                <select
                  value={draft.role}
                  onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))}
                  style={inputStyle}
                >
                  <option value="intake_assistant">Copilot</option>
                  <option value="lead_qualifier">Canal</option>
                  <option value="crm_updater">CRM monitor</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="ops_assistant">Operativo</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                Descripción / responsabilidad
                <textarea
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  rows={3}
                  style={textAreaStyle}
                />
              </label>
              <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                Instrucciones (SOUL.md)
                <textarea
                  value={draft.soulMd}
                  onChange={(event) => setDraft((current) => ({ ...current, soulMd: event.target.value }))}
                  rows={8}
                  style={textAreaStyle}
                />
              </label>
              <label style={fieldStyle}>
                Skills (CSV)
                <input
                  value={draft.skills}
                  onChange={(event) => setDraft((current) => ({ ...current, skills: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={fieldStyle}>
                Lectura (CSV)
                <input
                  value={draft.read}
                  onChange={(event) => setDraft((current) => ({ ...current, read: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={fieldStyle}>
                Escritura (CSV)
                <input
                  value={draft.write}
                  onChange={(event) => setDraft((current) => ({ ...current, write: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={fieldStyle}>
                Canales (CSV)
                <input
                  value={draft.channels}
                  onChange={(event) => setDraft((current) => ({ ...current, channels: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                Cron jobs (JSON array)
                <textarea
                  value={draft.cronJobs}
                  onChange={(event) => setDraft((current) => ({ ...current, cronJobs: event.target.value }))}
                  rows={4}
                  style={textAreaStyle}
                />
              </label>
              <label style={toggleStyle}>
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
                />
                Activo
              </label>
            </div>

            <div style={actionsStyle}>
              <button type="button" style={primaryButtonStyle} onClick={saveAgent} disabled={isSaving}>
                {isSaving ? "Guardando..." : isCreateMode ? "Crear agente" : "Guardar cambios"}
              </button>
              {!isCreateMode ? (
                <button type="button" style={chatActionButtonStyle} onClick={startBlankAgent}>
                  Nuevo desde cero
                </button>
              ) : null}
              {builderError ? <p style={inlineErrorStyle}>{builderError}</p> : null}
              {builderSuccess ? <p style={inlineSuccessStyle}>{builderSuccess}</p> : null}
            </div>

            {selectedAgent ? (
              <>
                <div style={agentFooterGridStyle}>
                  <div style={detailRailStyle}>
                    <h4 style={detailRailTitleStyle}>Actividad reciente</h4>
                    {selectedActivity.length ? (
                      <div style={activityListStyle}>
                        {selectedActivity.map((entry) => (
                          <div key={entry.id} style={agentActivityRowStyle}>
                            <p style={activityActionStyle}>{formatActivityLabel(entry.action)}</p>
                            <p style={activityDetailStyle}>{formatActivityDetails(entry.details)}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={detailRailCopyStyle}>Todavía no hay actividad registrada para este agente.</p>
                    )}
                  </div>

                  <div style={detailRailStyle}>
                    <h4 style={detailRailTitleStyle}>Despliegue</h4>
                    <label style={fieldStyle}>
                      Endpoint del agente
                      <input
                        value={deploymentDraft.apiEndpoint}
                        onChange={(event) =>
                          setDeploymentDraft((current) => ({ ...current, apiEndpoint: event.target.value }))
                        }
                        placeholder="https://hermes-bbc.prisma.com.mx/copilot"
                        style={inputStyle}
                        disabled={!canManageDeployment || isSavingDeployment}
                      />
                    </label>
                    <label style={fieldStyle}>
                      API key
                      <input
                        type="password"
                        value={deploymentDraft.apiKey}
                        onChange={(event) =>
                          setDeploymentDraft((current) => ({ ...current, apiKey: event.target.value }))
                        }
                        placeholder="sk_live_xxx"
                        style={inputStyle}
                        disabled={!canManageDeployment || isSavingDeployment}
                      />
                    </label>
                    <label style={fieldStyle}>
                      Nombre de contenedor
                      <input
                        value={deploymentDraft.containerName}
                        onChange={(event) =>
                          setDeploymentDraft((current) => ({ ...current, containerName: event.target.value }))
                        }
                        placeholder={`hermes-${workspaceSlug}-copilot`}
                        style={inputStyle}
                        disabled={!canManageDeployment || isSavingDeployment}
                      />
                    </label>
                    <div style={actionsStyle}>
                      <button
                        type="button"
                        style={primaryButtonStyle}
                        onClick={() => void saveDeploymentSettings()}
                        disabled={!canManageDeployment || isSavingDeployment}
                      >
                        {isSavingDeployment ? "Guardando..." : "Guardar despliegue"}
                      </button>
                      <button
                        type="button"
                        style={chatActionButtonStyle}
                        onClick={() => void checkAgentHealth()}
                        disabled={!canManageDeployment || isCheckingHealth}
                      >
                        {isCheckingHealth ? "Verificando..." : "Verificar conexión"}
                      </button>
                    </div>
                    <p style={detailRailCopyStyle}>
                      Runtime: {selectedAgent.runtimeLabel ?? `hermes-${workspaceSlug}`}
                    </p>
                    <p style={detailRailCopyStyle}>
                      Estado: {formatStatusLabel(selectedAgent.status)}
                    </p>
                    {lastHealthCheckAt ? (
                      <p style={detailRailMetaStyle}>
                        Última verificación: {new Date(lastHealthCheckAt).toLocaleString("es-MX")}
                      </p>
                    ) : null}
                    {!canManageDeployment ? (
                      <p style={detailRailMetaStyle}>Solo administradores pueden editar el despliegue.</p>
                    ) : null}
                    {deploymentFeedback ? <p style={inlineSuccessStyle}>{deploymentFeedback}</p> : null}
                  </div>
                </div>

                <div style={detailRailStyle}>
                  <h4 style={detailRailTitleStyle}>Chat de prueba</h4>
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
                          {message.role === "user" ? "Tu" : selectedAgent.name}
                        </strong>
                        <p style={agentChatCopyStyle}>{message.content || (isSending ? "Pensando..." : "")}</p>
                      </div>
                    ))}
                  </div>
                  <div style={agentChatComposerStyle}>
                    <input
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      placeholder={`Escribe a ${selectedAgent.name}`}
                      style={chatInputStyle}
                    />
                    <button type="button" onClick={sendTestMessage} style={chatButtonStyle} disabled={isSending}>
                      {isSending ? "Enviando..." : "Enviar"}
                    </button>
                  </div>
                  {chatError ? <p style={agentChatErrorStyle}>{chatError}</p> : null}
                </div>
              </>
            ) : (
              <EmptyState
                icon={Bot}
                title="No hay agentes configurados"
                description="Selecciona una plantilla o crea un agente en blanco para empezar."
              />
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

export function TeamChatPanel({ workspaceSlug, workspaceName, currentUserEmail }: TeamChatPanelProps) {
  const [channels, setChannels] = useState<Array<{ id: string; name: string; description?: string; isPrivate: boolean }>>([]);
  const [directMessages, setDirectMessages] = useState<Array<{ id: string; title: string; participantEmails: string[] }>>([]);
  const [selectedScope, setSelectedScope] = useState<{ type: "channel" | "dm"; id: string } | null>(null);
  const [messages, setMessages] = useState<
    Array<{
      id: string;
      senderEmail: string;
      content: string;
      messageType: "message" | "post" | "system";
      createdAt: string;
      mentions: string[];
    }>
  >([]);
  const [input, setInput] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [newDmEmails, setNewDmEmails] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadThread(scope?: { type: "channel" | "dm"; id: string } | null) {
    const target = scope ?? selectedScope;
    if (!target) return;
    setIsLoading(true);
    setError("");
    try {
      const query =
        target.type === "channel"
          ? `channelId=${encodeURIComponent(target.id)}`
          : `directMessageId=${encodeURIComponent(target.id)}`;
      const response = await fetch(`/api/workspaces/${workspaceSlug}/team-chat?${query}`);
      const data = (await response.json()) as {
        error?: string;
        channels?: Array<{ id: string; name: string; description?: string; isPrivate: boolean }>;
        directMessages?: Array<{ id: string; title: string; participantEmails: string[] }>;
        messages?: Array<{
          id: string;
          senderEmail: string;
          content: string;
          messageType: "message" | "post" | "system";
          createdAt: string;
          mentions: string[];
        }>;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo cargar el chat.");
      }
      setChannels(data.channels ?? []);
      setDirectMessages(data.directMessages ?? []);
      setMessages(data.messages ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo cargar el chat.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const initialScope = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/workspaces/${workspaceSlug}/team-chat`);
        const data = (await response.json()) as {
          error?: string;
          channels?: Array<{ id: string; name: string; description?: string; isPrivate: boolean }>;
          directMessages?: Array<{ id: string; title: string; participantEmails: string[] }>;
        };
        if (!response.ok) {
          throw new Error(data.error ?? "No se pudo cargar los canales.");
        }
        const loadedChannels = data.channels ?? [];
        const loadedDms = data.directMessages ?? [];
        setChannels(loadedChannels);
        setDirectMessages(loadedDms);
        if (loadedChannels[0]) {
          const nextScope = { type: "channel" as const, id: loadedChannels[0].id };
          setSelectedScope(nextScope);
          await loadThread(nextScope);
        } else if (loadedDms[0]) {
          const nextScope = { type: "dm" as const, id: loadedDms[0].id };
          setSelectedScope(nextScope);
          await loadThread(nextScope);
        }
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "No se pudo cargar los canales.");
      } finally {
        setIsLoading(false);
      }
    };
    void initialScope();
  }, [workspaceSlug]);

  async function createChannel() {
    if (!newChannelName.trim()) return;
    setError("");
    const response = await fetch(`/api/workspaces/${workspaceSlug}/team-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-channel", name: newChannelName, description: `Canal de ${newChannelName}` }),
    });
    const data = (await response.json()) as { error?: string; channel?: { id: string; name: string } };
    if (!response.ok || !data.channel) {
      setError(data.error ?? "No se pudo crear el canal.");
      return;
    }
    setNewChannelName("");
    const nextScope = { type: "channel" as const, id: data.channel.id };
    setSelectedScope(nextScope);
    await loadThread(nextScope);
  }

  async function createDirectMessage() {
    const participants = newDmEmails
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!participants.length) return;
    setError("");
    const response = await fetch(`/api/workspaces/${workspaceSlug}/team-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-dm", participantIds: participants }),
    });
    const data = (await response.json()) as { error?: string; directMessage?: { id: string } };
    if (!response.ok || !data.directMessage) {
      setError(data.error ?? "No se pudo crear el mensaje directo.");
      return;
    }
    setNewDmEmails("");
    const nextScope = { type: "dm" as const, id: data.directMessage.id };
    setSelectedScope(nextScope);
    await loadThread(nextScope);
  }

  async function sendMessage() {
    if (!selectedScope || !input.trim()) return;
    const response = await fetch(`/api/workspaces/${workspaceSlug}/team-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "post-message",
        channelId: selectedScope.type === "channel" ? selectedScope.id : undefined,
        directMessageId: selectedScope.type === "dm" ? selectedScope.id : undefined,
        content: input,
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "No se pudo enviar el mensaje.");
      return;
    }
    setInput("");
    await loadThread(selectedScope);
  }

  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Team chat"
        title="Colaboración del equipo"
        description={`Canales y mensajes directos conectados al contexto de ${workspaceName}.`}
      >
        <div style={teamChatLayoutStyle}>
          <aside style={teamChatSidebarStyle}>
            <div style={detailRailStyle}>
              <h4 style={detailRailTitleStyle}>Canales</h4>
              <div style={teamChatCreateRowStyle}>
                <input
                  value={newChannelName}
                  onChange={(event) => setNewChannelName(event.target.value)}
                  placeholder="Nuevo canal"
                  style={chatInputStyle}
                />
                <button type="button" onClick={createChannel} style={chatButtonStyle}>
                  Crear
                </button>
              </div>
              <div style={detailListStyle}>
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => {
                      const nextScope = { type: "channel" as const, id: channel.id };
                      setSelectedScope(nextScope);
                      void loadThread(nextScope);
                    }}
                    style={{
                      ...teamChatThreadButtonStyle,
                      borderColor:
                        selectedScope?.type === "channel" && selectedScope.id === channel.id
                          ? "rgba(51, 92, 255, 0.24)"
                          : "var(--workspace-border)",
                    }}
                  >
                    <span style={teamChatThreadTitleStyle}>#{channel.name}</span>
                    {channel.description ? <span style={queueSubtitleStyle}>{channel.description}</span> : null}
                  </button>
                ))}
              </div>
            </div>

            <div style={detailRailStyle}>
              <h4 style={detailRailTitleStyle}>Mensajes directos</h4>
              <div style={teamChatCreateRowStyle}>
                <input
                  value={newDmEmails}
                  onChange={(event) => setNewDmEmails(event.target.value)}
                  placeholder="correo1@x.com, correo2@x.com"
                  style={chatInputStyle}
                />
                <button type="button" onClick={createDirectMessage} style={chatButtonStyle}>
                  Crear
                </button>
              </div>
              <div style={detailListStyle}>
                {directMessages.map((dm) => (
                  <button
                    key={dm.id}
                    type="button"
                    onClick={() => {
                      const nextScope = { type: "dm" as const, id: dm.id };
                      setSelectedScope(nextScope);
                      void loadThread(nextScope);
                    }}
                    style={{
                      ...teamChatThreadButtonStyle,
                      borderColor:
                        selectedScope?.type === "dm" && selectedScope.id === dm.id
                          ? "rgba(51, 92, 255, 0.24)"
                          : "var(--workspace-border)",
                    }}
                  >
                    <span style={teamChatThreadTitleStyle}>{dm.title}</span>
                    <span style={queueSubtitleStyle}>{(dm.participantEmails ?? []).join(", ")}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section style={teamChatMainStyle}>
            <div style={chatHeaderStyle}>
              <div>
                <p style={eyebrowStyle}>{selectedScope?.type === "dm" ? "Directo" : "Canal"}</p>
                <h3 style={chatTitleStyle}>
                  {selectedScope
                    ? selectedScope.type === "dm"
                      ? directMessages.find((entry) => entry.id === selectedScope.id)?.title ?? "Mensaje directo"
                      : `#${channels.find((entry) => entry.id === selectedScope.id)?.name ?? "general"}`
                    : "Selecciona una conversación"}
                </h3>
              </div>
              {currentUserEmail ? <StatusPill tone="info">{currentUserEmail}</StatusPill> : null}
            </div>

            <div style={chatMessagesStyle}>
              {messages.length ? (
                messages.map((message) => {
                  const senderLabel = message.senderEmail ?? "Miembro del equipo";
                  const isCurrentUser =
                    Boolean(currentUserEmail) &&
                    senderLabel.toLowerCase() === String(currentUserEmail).toLowerCase();
                  return (
                  <div
                    key={message.id}
                    style={{
                      ...chatBubbleStyle,
                      alignSelf: isCurrentUser ? "flex-end" : "flex-start",
                      background: isCurrentUser ? "rgba(17, 24, 39, 0.94)" : "rgba(255, 255, 255, 0.96)",
                      color: isCurrentUser ? "#fff" : "var(--workspace-text)",
                    }}
                  >
                    <strong style={agentChatRoleStyle}>{senderLabel}</strong>
                    <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{message.content}</p>
                    {message.mentions.length ? (
                      <span style={queueSubtitleStyle}>Menciones: {message.mentions.join(", ")}</span>
                    ) : null}
                    <span style={chatTimestampStyle}>{new Date(message.createdAt).toLocaleString("es-MX")}</span>
                  </div>
                )})
              ) : (
                <EmptyState
                  icon={MessageSquare}
                  title="Sin mensajes todavía"
                  description="Empieza una conversación del equipo, menciona a alguien con @correo o crea un canal nuevo."
                />
              )}
            </div>

            <div style={chatComposerStyle}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Escribe un mensaje, usa @correo para mencionar, o pega links a registros..."
                rows={4}
                style={chatTextareaStyle}
              />
              <div style={chatComposerFooterStyle}>
                <button type="button" onClick={sendMessage} style={chatSendButtonStyle} disabled={!selectedScope || !input.trim()}>
                  Enviar
                </button>
              </div>
              {error ? <p style={chatErrorStyle}>{error}</p> : null}
              {isLoading ? <p style={queueSubtitleStyle}>Cargando conversación...</p> : null}
            </div>
          </section>
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
        description="Contexto, estado y trazabilidad del registro actual."
      >
        <div style={recordHeroStyle}>
          <div>
            <p style={recordSummaryStyle}>{summary}</p>
            <div style={recordMetaStyle}>
              <StatusPill tone={status.toLowerCase()}>{formatStatusLabel(status)}</StatusPill>
              <StatusPill tone="neutral">{owner}</StatusPill>
              {askHref ? (
                <a href={askHref} style={metaActionLinkStyle}>
                  Consultar con CEO
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
                  <StatusPill tone={field.tone === "positive" ? "active" : "neutral"}>
                    {field.label.toLowerCase() === "status" ? formatStatusLabel(field.value) : field.value}
                  </StatusPill>
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

function formatStatusLabel(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "pending") return "Pendiente";
  if (normalized === "needs_review") return "Por revisar";
  if (normalized === "follow_up") return "Seguimiento";
  if (normalized === "pending_docs") return "Faltan documentos";
  if (normalized === "awaiting_approval") return "Esperando aprobacion";
  if (normalized === "active") return "Activo";
  if (normalized === "review") return "En revision";
  if (normalized === "deploying") return "Desplegando";
  if (normalized === "paused") return "Pausado";
  if (normalized === "error") return "Con error";
  if (normalized === "qualified") return "Calificado";
  if (normalized === "copilot") return "Copilot";
  if (normalized === "channel") return "Canal";
  if (normalized === "worker") return "Operativo";
  return status.replace(/_/g, " ");
}

function formatActivityLabel(action: string) {
  if (action === "receivable.flagged") return "Cobranza marcada para revision";
  if (action === "lead.qualified") return "Lead calificado";
  if (action === "document.uploaded_via_chat") return "Documento agregado desde chat";
  if (action === "workspace.seeded") return "Workspace inicializado";
  return action.replace(/[._]/g, " ").replace(/^\w/, (value) => value.toUpperCase());
}

function formatActivityDetails(details: Record<string, unknown>) {
  if (typeof details.title === "string") {
    return details.title;
  }
  if (typeof details.lead === "string") {
    return details.lead;
  }
  if (typeof details.debtor === "string") {
    return details.debtor;
  }
  if (typeof details.recommendation === "string") {
    return details.recommendation;
  }
  if (typeof details.next_step === "string") {
    return details.next_step;
  }

  const entries = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 3)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`);

  return entries.join(" · ") || "Actividad registrada";
}

function formatAgentTypeLabel(type: string) {
  if (type === "copilot") return "Copilot";
  if (type === "channel") return "Canal";
  if (type === "worker") return "Operativo";
  return type;
}

function resolveAgentTypeTone(type: string) {
  if (type === "copilot") return "info";
  if (type === "channel") return "warning";
  return "neutral";
}

function formatKnowledgeLabel(value: string) {
  if (value === "workspace_views") return "Vistas";
  return value.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function parseCsvList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mapAgentTypeToRole(type: string) {
  if (type === "copilot") return "intake_assistant";
  if (type === "channel") return "lead_qualifier";
  if (type === "worker") return "crm_updater";
  return "custom";
}

function mapTemplateTypeToRole(type: string) {
  if (type === "copilot") return "intake_assistant";
  if (type === "channel" || type === "chatbot") return "lead_qualifier";
  if (type === "worker") return "crm_updater";
  return "custom";
}

function mapRoleToAgentType(role: string) {
  if (role === "intake_assistant" || role === "ops_assistant") return "copilot";
  if (role === "lead_qualifier" || role === "follow_up") return "channel";
  return "worker";
}

function resolvePriorityColor(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "needs_review") return "#f59e0b";
  if (normalized === "follow_up") return "#335cff";
  if (normalized === "pending_docs") return "#c2410c";
  if (normalized === "blocked") return "#b42318";
  return "#d0d5dd";
}

function formatQueueAction(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "needs_review") return "Requiere revisión humana";
  if (normalized === "follow_up") return "Da seguimiento hoy";
  if (normalized === "pending_docs") return "Solicita documentos faltantes";
  if (normalized === "pending") return "Confirma el siguiente paso";
  if (normalized === "blocked") return "Desbloquea este proceso";
  return "Abrir para revisar";
}

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

const dashboardGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 16,
};

const dashboardCardShellStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 22,
  background: "var(--workspace-panel-soft)",
  padding: 18,
  display: "grid",
  gap: 14,
};

const dashboardCardShellFullStyle: React.CSSProperties = {
  gridColumn: "1 / -1",
};

const dashboardSectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const dashboardSectionSubtitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--workspace-muted)",
  fontSize: 13,
  lineHeight: 1.5,
};

const connectedAppsRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const connectedAppChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel)",
  color: "var(--workspace-text)",
  fontSize: 13,
  fontWeight: 600,
};

const suggestionGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const suggestionButtonStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--workspace-border)",
  borderRadius: 16,
  background: "var(--workspace-panel)",
  padding: "12px 14px",
  textAlign: "left",
  font: "inherit",
  color: "var(--workspace-text)",
  cursor: "pointer",
};

const quickActionGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const quickActionCardStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 18,
  background: "var(--workspace-panel)",
  padding: "14px 16px",
  textAlign: "left",
  color: "var(--workspace-text)",
  textDecoration: "none",
  display: "grid",
  gap: 6,
};

const chatEmptyStateStyle: React.CSSProperties = {
  display: "grid",
  gap: 18,
  alignContent: "start",
};

const chatEmptyHeroStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const chatEmptyAvatarStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(51, 92, 255, 0.1)",
  color: "#335cff",
};

const chatEmptyTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  lineHeight: 1.1,
  color: "var(--workspace-text)",
  fontFamily: "var(--font-display)",
};

const chatEmptyCopyStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "var(--workspace-muted)",
  fontSize: 15,
  lineHeight: 1.7,
  maxWidth: 560,
};

const chatCapabilityRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const chatCapabilityChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel)",
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const chatSearchCardStyle: React.CSSProperties = {
  border: "1px dashed var(--workspace-border)",
  borderRadius: 18,
  background: "rgba(255,255,255,0.55)",
  padding: "14px 16px",
  color: "var(--workspace-muted)",
  fontSize: 14,
};

const teamChatLayoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "320px minmax(0, 1fr)",
  gap: 20,
};

const teamChatSidebarStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
  alignContent: "start",
};

const teamChatCreateRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const teamChatListButtonStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--workspace-border)",
  borderRadius: 14,
  background: "var(--workspace-panel)",
  color: "var(--workspace-text)",
  padding: "12px 14px",
  textAlign: "left",
  cursor: "pointer",
  display: "grid",
  gap: 4,
};

const teamChatThreadButtonStyle: React.CSSProperties = {
  ...teamChatListButtonStyle,
  background: "var(--workspace-panel-soft)",
};

const teamChatThreadTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const teamChatMainStyle: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel)",
  padding: 18,
  display: "grid",
  gap: 16,
  minHeight: 620,
};

const teamChatHeaderMetaStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--workspace-muted)",
  fontSize: 13,
};

const teamChatMessageListStyle: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid var(--workspace-border)",
  background: "rgba(247, 247, 242, 0.6)",
  padding: 16,
  minHeight: 360,
  display: "grid",
  gap: 10,
  alignContent: "start",
  overflowY: "auto",
};

const teamChatMessageBubbleStyle: React.CSSProperties = {
  maxWidth: "88%",
  borderRadius: 16,
  padding: "12px 14px",
  display: "grid",
  gap: 6,
};

const teamChatComposerBoxStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
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

const agentToolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const agentTemplateChooserStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const agentCanvasGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  color: "var(--workspace-muted)",
};

const textAreaStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  color: "var(--workspace-text)",
  padding: "10px 12px",
  font: "inherit",
  minWidth: 0,
  resize: "vertical",
};

const toggleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "var(--workspace-text)",
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const primaryButtonStyle: React.CSSProperties = {
  appearance: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
  alignSelf: "end",
  minHeight: 40,
  borderRadius: 14,
  border: "1px solid rgba(51, 92, 255, 0.16)",
  background: "rgba(51, 92, 255, 0.12)",
  color: "#2947cc",
  padding: "10px 14px",
  fontWeight: 700,
  font: "inherit",
  cursor: "pointer",
};

const inlineErrorStyle: React.CSSProperties = {
  margin: 0,
  color: "#b42318",
  fontSize: 13,
};

const inlineSuccessStyle: React.CSSProperties = {
  margin: 0,
  color: "#0f8a52",
  fontSize: 13,
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

const filterRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const filterButtonStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
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

const clickableRowStyle: React.CSSProperties = {
  cursor: "pointer",
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

const chatEmptySectionStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const chatEmptySectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--workspace-muted)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontWeight: 700,
};

const chatActionListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const chatPromptCardStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 18,
  background: "var(--workspace-panel)",
  padding: "14px 16px",
  color: "var(--workspace-text)",
  display: "grid",
  gap: 8,
  textAlign: "left",
  textDecoration: "none",
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

const chatErrorStyle: React.CSSProperties = {
  margin: 0,
  color: "#b42318",
  fontSize: 13,
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

const tableCellStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid var(--workspace-border)",
  color: "var(--workspace-text)",
  fontSize: 14,
  verticalAlign: "top",
};

const inlineInputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  color: "var(--workspace-text)",
  padding: "8px 10px",
  font: "inherit",
};

const dangerButtonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(220, 38, 38, 0.22)",
  background: "rgba(220, 38, 38, 0.12)",
  color: "#b42318",
  padding: "8px 10px",
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.4)",
  display: "grid",
  placeItems: "center",
  zIndex: 90,
  padding: 16,
};

const modalCardStyle: React.CSSProperties = {
  width: "min(880px, 100%)",
  maxHeight: "85vh",
  overflowY: "auto",
  borderRadius: 18,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel)",
  padding: 18,
  display: "grid",
  gap: 16,
};

const modalHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const modalFieldsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const confirmCardStyle: React.CSSProperties = {
  width: "min(420px, 100%)",
  borderRadius: 16,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel)",
  padding: 18,
  display: "grid",
  gap: 12,
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
