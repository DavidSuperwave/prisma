"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUp,
  ArrowRight,
  Bot,
  Building2,
  CircleDot,
  FileStack,
  Filter,
  Globe,
  Layers3,
  LoaderCircle,
  MessageSquare,
  Mic,
  Plus,
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
import { consumeCompleteSseDataLines } from "@/lib/chatSseClient";

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
    recordId?: string;
    title: string;
    subtitle: string;
    status: string;
    objectId: string;
  }>;
  greetingName?: string;
  chatHref: string;
  recordBaseHref?: string;
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

type BoardColumn = {
  key: string;
  value: string | null;
  label: string;
  records: PrismaWorkspaceRecord[];
};

type BoardDropTarget = {
  recordId: string;
  toValue: string | null;
};

type AgentPanelProps = {
  workspaceId: string;
  workspaceSlug: string;
  currentRole: "admin" | "operator" | "viewer";
  currentUserEmail?: string | null;
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
    legacyRole?: string | null;
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
    lastCronRunAt?: string | null;
    channelConfig?: Record<string, unknown>;
  }>;
  activity: PrismaWorkspaceActivity[];
};

type QueuePanelProps = {
  recordBaseHref?: string;
  queueItems: Array<{
    id: string;
    recordId?: string;
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
    action?:
      | "bootstrap-crm"
      | "bootstrap-dashboard"
      | "scenario-close-import"
      | "scenario-seasonal-analysis"
      | "scenario-quote-approval"
      | "scenario-calendar-scheduling";
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
  chatAgents: Array<{
    id: string;
    name: string;
    type: "copilot" | "channel" | "worker";
    status: string;
    description: string | null;
    isPrimaryCopilot?: boolean;
    readinessState?: "ready" | "draft";
    readinessIssues?: string[];
    isReadyForExecution?: boolean;
  }>;
  primaryAgentId?: string | null;
  canSetPrimaryAgent?: boolean;
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
  blocks?: ChatMessageBlock[];
  attachments?: unknown[];
};

type ChatSchemaProposalField = {
  name: string;
  key: string;
  type: string;
  required?: boolean;
};

type ChatSchemaProposalObject = {
  name: string;
  singularName?: string;
  pluralName?: string;
  description?: string;
  icon?: string;
  fields: ChatSchemaProposalField[];
};

type ChatSchemaProposal = {
  proposalId: string;
  title: string;
  rationale?: string;
  requiresApproval: boolean;
  sourcePrompt?: string;
  suggestedNextAction?: string;
  objects: ChatSchemaProposalObject[];
};

type ChatMessageBlock =
  | {
      kind: "schema_proposal";
      proposal: ChatSchemaProposal;
      approvalState?: "pending" | "approved" | "failed";
      approvalMessage?: string;
    };

type ChatAttachment = {
  id: string;
  fileName: string;
  publicUrl: string;
  contentType: string;
};

type ChatSession = {
  id: string;
  agentId: string;
  title: string;
  source: string;
  runtimeConversationId: string;
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

function createSession(userId: string, agentId: string) {
  const sessionId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return {
    id: sessionId,
    agentId,
    title: "Nuevo chat",
    source: "workspace_chat",
    runtimeConversationId: `user-${userId}-${agentId}-${sessionId}`,
    messages: [],
    attachments: [],
    updatedAt: new Date().toISOString(),
  } satisfies ChatSession;
}

function currentTimeLabel() {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function resolveGreetingPrefix() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos dias";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function buildRevealStyle(isVisible: boolean, delayMs = 0): React.CSSProperties {
  return {
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? "translateX(0px)" : "translateX(-22px)",
    transition: `opacity 420ms ease ${delayMs}ms, transform 420ms ease ${delayMs}ms`,
  };
}

export function OverviewPanel({
  dashboardCards,
  metrics,
  queueItems,
  greetingName,
  chatHref,
  recordBaseHref,
  activity,
  suggestions,
  agents,
}: OverviewProps) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [chatDraft, setChatDraft] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setIsVisible(true), 40);
    return () => window.clearTimeout(timer);
  }, []);

  const stats = [
    { icon: Layers3, ...metrics[0] },
    { icon: Building2, ...metrics[1] },
    { icon: Bot, ...metrics[2] },
    { icon: ShieldCheck, ...metrics[3] },
  ].filter((item) => item.label && item.value);
  const cards = dashboardCards?.length ? [...dashboardCards].sort((left, right) => left.config.position as number - (right.config.position as number)) : [];
  const activeAgentsMetric =
    stats.find((item) => item.label.toLowerCase().includes("agentes"))?.value ??
    String(agents.filter((agent) => agent.status === "active").length);
  const statusCards = queueItems.slice(0, 2).map((item) => ({
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    tone: item.status.toLowerCase(),
    label: formatStatusLabel(item.status),
  }));
  const latestActivity = activity[0];
  if (latestActivity) {
    statusCards.push({
      id: String(latestActivity.id),
      title: formatActivityLabel(latestActivity.action),
      subtitle: formatActivityDetails(latestActivity.details),
      tone: "active",
      label: "Reciente",
    });
  }
  if (statusCards.length === 0) {
    statusCards.push({
      id: "overview-empty",
      title: "Operacion al dia",
      subtitle: "No hay tareas urgentes en este momento.",
      tone: "active",
      label: "Estable",
    });
  }

  function handleStartChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = chatDraft.trim();
    if (prompt.length > 0) {
      router.push(`${chatHref}&prompt=${encodeURIComponent(prompt)}`);
      return;
    }
    router.push(chatHref);
  }

  function renderHomeHero() {
    return (
      <section style={{ ...homeHeroCardStyle, ...buildRevealStyle(isVisible, 0) }}>
        <div style={homeHeroHeadingStyle}>
          <p style={homeHeroLeadStyle}>{resolveGreetingPrefix()}, {greetingName ?? "equipo"}.</p>
          <h2 style={homeHeroTitleStyle}>Tengo el dia en movimiento.</h2>
          <p style={homeHeroMetaStyle}>
            {queueItems.length} pendientes · {activity.length} actualizaciones · {activeAgentsMetric} agentes activos · actualizado {currentTimeLabel()}
          </p>
        </div>
        <form onSubmit={handleStartChat} style={homeChatComposerStyle}>
          <div style={homeChatTopRowStyle}>
            <input
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value)}
              placeholder="Ask anything. O dime que quieres resolver hoy."
              style={homeChatInputStyle}
              aria-label="Escribe para abrir el chat"
            />
            <button type="submit" style={homeChatButtonStyle} aria-label="Abrir chat">
              <ArrowUp size={14} />
            </button>
          </div>
          <div style={homeChatBottomRowStyle}>
            <div style={homeChatToolsLeftStyle}>
              <button type="button" style={homeToolButtonIconStyle} aria-label="Agregar">
                <Plus size={14} />
              </button>
              <button type="button" style={homeToolButtonIconStyle} aria-label="Web">
                <Globe size={14} />
              </button>
              <button type="button" style={homeToolButtonStyle}>
                Tools
              </button>
            </div>
            <button type="button" style={homeToolButtonIconStyle} aria-label="Microfono">
              <Mic size={14} />
            </button>
          </div>
        </form>
        <div style={homeStatusStripStyle}>
          {statusCards.map((card) => (
            <article key={card.id} style={homeStatusCardStyle}>
              <div>
                <p style={homeStatusLabelStyle}>{card.label}</p>
                <p style={homeStatusTitleStyle}>{card.title}</p>
                <p style={homeStatusMetaStyle}>{card.subtitle}</p>
              </div>
              <StatusPill tone={card.tone}>{card.label}</StatusPill>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderQueueRow(item: OverviewProps["queueItems"][number], keyPrefix: string) {
    const rowContent = (
      <>
        <div>
          <p style={queueTitleStyle}>{item.title}</p>
          <p style={queueSubtitleStyle}>{item.subtitle}</p>
        </div>
        <div style={queueRightStyle}>
          <StatusPill tone={item.status.toLowerCase()}>{formatStatusLabel(item.status)}</StatusPill>
          <ArrowRight size={16} color="var(--workspace-muted)" />
        </div>
      </>
    );

    if (!recordBaseHref) {
      return (
        <div key={`${keyPrefix}-${item.id}`} style={queueItemStyle}>
          {rowContent}
        </div>
      );
    }

    return (
      <a
        key={`${keyPrefix}-${item.id}`}
        href={
          recordBaseHref && item.objectId && (item.recordId ?? item.id)
            ? `${recordBaseHref}&object=${item.objectId}&record=${item.recordId ?? item.id}`
            : undefined
        }
        style={queueItemLinkStyle}
      >
        {rowContent}
      </a>
    );
  }

  if (cards.length > 0) {
    return (
      <div style={stackStyle}>
        {renderHomeHero()}

        <div style={buildRevealStyle(isVisible, 130)}>
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
                        {queueItems.slice(0, Number(card.config.limit ?? 4)).map((item) => renderQueueRow(item, card.id))}
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
      </div>
    );
  }

  return (
    <div style={stackStyle}>
      {renderHomeHero()}

      <div style={buildRevealStyle(isVisible, 130)}>
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
      </div>

      <div style={{ ...overviewGridStyle, ...buildRevealStyle(isVisible, 210) }}>
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
              {queueItems.map((item) => renderQueueRow(item, "overview"))}
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

      <div style={{ ...overviewGridStyle, ...buildRevealStyle(isVisible, 290) }}>
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
                href={
                  recordBaseHref && item.objectId && (item.recordId ?? item.id)
                    ? `${recordBaseHref}&object=${item.objectId}&record=${item.recordId ?? item.id}`
                    : undefined
                }
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
  chatAgents,
  primaryAgentId,
  canSetPrimaryAgent = false,
  askPrompt,
}: ChatPanelProps) {
  const router = useRouter();
  const sortedAgents = [...chatAgents].sort((left, right) => {
    const leftPrimary = left.isPrimaryCopilot ? 1 : 0;
    const rightPrimary = right.isPrimaryCopilot ? 1 : 0;
    if (leftPrimary !== rightPrimary) {
      return rightPrimary - leftPrimary;
    }
    if (left.type === "copilot" && right.type !== "copilot") return -1;
    if (left.type !== "copilot" && right.type === "copilot") return 1;
    if (left.status === "active" && right.status !== "active") return -1;
    if (left.status !== "active" && right.status === "active") return 1;
    return left.name.localeCompare(right.name, "es");
  });
  const defaultAgentId =
    (primaryAgentId && sortedAgents.some((agent) => agent.id === primaryAgentId) ? primaryAgentId : null) ??
    sortedAgents.find((agent) => agent.isPrimaryCopilot)?.id ??
    sortedAgents.find((agent) => agent.type === "copilot" && agent.status === "active")?.id ??
    sortedAgents.find((agent) => agent.type === "copilot")?.id ??
    sortedAgents.find((agent) => agent.status === "active")?.id ??
    sortedAgents[0]?.id ??
    "";
  const [selectedAgentId, setSelectedAgentId] = useState<string>(defaultAgentId);
  const selectedAgent = sortedAgents.find((agent) => agent.id === selectedAgentId) ?? null;
  const storageKey = `prisma-chat:${workspaceSlug}:${userId}:${selectedAgentId || "none"}`;
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [pendingProposalId, setPendingProposalId] = useState<string | null>(null);

  function toTimeLabel(isoTimestamp: string) {
    return new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoTimestamp));
  }

  function normalizeAttachmentsFromMessages(messages: ChatMessage[]) {
    const map = new Map<string, ChatAttachment>();
    for (const message of messages) {
      const attachmentsFromMetadata = message.attachments;
      if (!Array.isArray(attachmentsFromMetadata)) {
        continue;
      }
      for (const item of attachmentsFromMetadata) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          continue;
        }
        const typed = item as Record<string, unknown>;
        const id = typeof typed.id === "string" ? typed.id : "";
        const fileName = typeof typed.fileName === "string" ? typed.fileName : "";
        const publicUrl = typeof typed.publicUrl === "string" ? typed.publicUrl : "";
        if (!id || !fileName || !publicUrl) {
          continue;
        }
        map.set(id, {
          id,
          fileName,
          publicUrl,
          contentType:
            typeof typed.contentType === "string" ? typed.contentType : "application/octet-stream",
        });
      }
    }
    return Array.from(map.values());
  }

  const fetchConversationMessages = useCallback(async (conversationId: string) => {
    const response = await fetch(
      `/api/workspaces/${workspaceSlug}/conversations/${conversationId}/messages`,
    );
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      messages?: Array<{
        id: string;
        role: string;
        content: string;
        blocks?: unknown[];
        attachments?: unknown[];
        createdAt: string;
      }>;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "No se pudo cargar la conversación.");
    }
    const mappedMessages: ChatMessage[] = (payload.messages ?? []).map((message) => ({
      id: message.id,
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content ?? "",
      timestamp: toTimeLabel(message.createdAt),
      blocks: Array.isArray(message.blocks) ? (message.blocks as ChatMessageBlock[]) : [],
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
    })) as ChatMessage[];
    return {
      messages: mappedMessages,
      attachments: normalizeAttachmentsFromMessages(mappedMessages),
    };
  }, [workspaceSlug]);

  async function importLegacySessions(agentId: string) {
    if (typeof window === "undefined") {
      return false;
    }
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return false;
    }
    let parsedSessions: ChatSession[] = [];
    try {
      parsedSessions = JSON.parse(raw) as ChatSession[];
    } catch {
      return false;
    }
    if (!Array.isArray(parsedSessions) || parsedSessions.length === 0) {
      return false;
    }

    let imported = 0;
    for (const legacy of parsedSessions.slice(0, 8)) {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          title: legacy.title,
          runtimeConversationId:
            typeof legacy.runtimeConversationId === "string"
              ? legacy.runtimeConversationId
              : (legacy as unknown as { conversationId?: string }).conversationId,
          source: "workspace_chat",
          metadata: {
            migrated_from_local_storage: true,
          },
          seedMessages: (Array.isArray(legacy.messages) ? legacy.messages : []).map((message) => ({
            role: message.role,
            content: message.content,
            blocks: message.blocks ?? [],
            metadata: {},
          })),
        }),
      });
      if (response.ok) {
        imported += 1;
      }
    }
    return imported > 0;
  }

  async function loadConversations(agentId: string) {
    setIsSessionsLoading(true);
    setError(null);
    try {
      const fetchConversations = async () => {
        const response = await fetch(
          `/api/workspaces/${workspaceSlug}/conversations?agentId=${encodeURIComponent(agentId)}&source=workspace_chat`,
        );
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          conversations?: Array<{
            id: string;
            title: string;
            source: string;
            runtimeConversationId: string;
            updatedAt: string;
          }>;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "No se pudieron cargar las conversaciones.");
        }
        return payload.conversations ?? [];
      };

      let conversationRows = await fetchConversations();
      if (conversationRows.length === 0) {
        const imported = await importLegacySessions(agentId);
        if (imported) {
          conversationRows = await fetchConversations();
        }
      }

      if (conversationRows.length === 0) {
        const createResponse = await fetch(`/api/workspaces/${workspaceSlug}/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId }),
        });
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
          throw new Error(createPayload.error ?? "No se pudo crear la conversación inicial.");
        }
        conversationRows = [createPayload.conversation];
      }

      const mappedSessions = conversationRows.map((conversation) => ({
        id: conversation.id,
        agentId,
        title: conversation.title,
        source: conversation.source,
        runtimeConversationId: conversation.runtimeConversationId,
        messages: [],
        attachments: [],
        updatedAt: conversation.updatedAt,
      })) satisfies ChatSession[];
      setSessions(mappedSessions);
      setSelectedSessionId((current) =>
        current && mappedSessions.some((session) => session.id === current)
          ? current
          : mappedSessions[0]?.id ?? "",
      );
    } catch (caughtError) {
      const fallback = createSession(userId, agentId);
      setSessions([fallback]);
      setSelectedSessionId(fallback.id);
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo cargar el historial de chat.");
    } finally {
      setIsSessionsLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedAgent && sortedAgents.length > 0) {
      setSelectedAgentId(defaultAgentId);
    }
  }, [defaultAgentId, selectedAgent, sortedAgents.length]);

  useEffect(() => {
    if (!selectedAgentId) {
      setSessions([]);
      setSelectedSessionId("");
      return;
    }
    void loadConversations(selectedAgentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentId, workspaceSlug, userId]);

  useEffect(() => {
    if (typeof window === "undefined" || sessions.length === 0) {
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(sessions));
  }, [sessions, storageKey]);

  useEffect(() => {
    if (!selectedSessionId || sessions.length === 0) {
      return;
    }
    const targetSession = sessions.find((session) => session.id === selectedSessionId);
    if (!targetSession || targetSession.messages.length > 0) {
      return;
    }

    let isCancelled = false;
    void (async () => {
      try {
        const hydrated = await fetchConversationMessages(targetSession.id);
        if (isCancelled) {
          return;
        }
        setSessions((current) =>
          current.map((session) =>
            session.id === targetSession.id
              ? {
                  ...session,
                  messages: hydrated.messages,
                  attachments: hydrated.attachments,
                  updatedAt: new Date().toISOString(),
                }
              : session,
          ),
        );
      } catch (caughtError) {
        if (!isCancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "No se pudo cargar la conversación.");
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [fetchConversationMessages, selectedSessionId, sessions]);

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

  async function createNewChat() {
    if (!selectedAgent) {
      return;
    }
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgent.id,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        conversation?: {
          id: string;
          title: string;
          source: string;
          runtimeConversationId: string;
          updatedAt: string;
        };
      };
      if (!response.ok || !payload.conversation) {
        throw new Error(payload.error ?? "No se pudo crear un nuevo chat.");
      }
      const session = {
        id: payload.conversation.id,
        agentId: selectedAgent.id,
        title: payload.conversation.title,
        source: payload.conversation.source,
        runtimeConversationId: payload.conversation.runtimeConversationId,
        messages: [],
        attachments: [],
        updatedAt: payload.conversation.updatedAt,
      } satisfies ChatSession;
      setSessions((current) => [session, ...current]);
      setSelectedSessionId(session.id);
      setInput("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo crear un nuevo chat.");
    }
  }

  async function renameSession(sessionId: string, nextTitle: string) {
    const trimmed = nextTitle.trim();
    if (!trimmed) {
      return;
    }
    updateSession(sessionId, (session) => ({ ...session, title: trimmed, updatedAt: new Date().toISOString() }));
    try {
      await fetch(`/api/workspaces/${workspaceSlug}/conversations/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
    } catch {
      // Keep optimistic rename in local cache.
    }
  }

  async function uploadDocument(file: File) {
    if (!selectedSession || !selectedAgent || isUploading) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sessionTitle", selectedSession.title);
      formData.append("conversationId", selectedSession.runtimeConversationId);
      formData.append("workspaceConversationId", selectedSession.id);
      formData.append("agentId", selectedAgent.id);

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
            attachments: [
              {
                id: uploadedRecordId,
                fileName: uploadedDocumentName,
                publicUrl: uploadedPublicUrl,
                contentType: payload.contentType ?? file.type ?? "application/octet-stream",
              },
            ],
          },
        ],
        updatedAt: new Date().toISOString(),
      }));
      void fetch(`/api/workspaces/${workspaceSlug}/conversations/${selectedSession.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "assistant",
          content: `Documento subido: ${uploadedDocumentName}. Se agregó al dataset Documents y el workspace se actualizará.`,
          attachments: [
            {
              id: uploadedRecordId,
              fileName: uploadedDocumentName,
              publicUrl: uploadedPublicUrl,
              contentType: payload.contentType ?? file.type ?? "application/octet-stream",
            },
          ],
          metadata: {
            uploaded_via: "chat",
          },
        }),
      });
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "No se pudo subir el documento.";
      setError(message);
    } finally {
      setIsUploading(false);
      window.setTimeout(() => { if (typeof window !== "undefined") { router.replace(`${window.location.pathname}${window.location.search}`); router.refresh(); } }, 400);
    }
  }

  async function deleteSession(sessionId: string) {
    try {
      await fetch(`/api/workspaces/${workspaceSlug}/conversations/${sessionId}`, {
        method: "DELETE",
      });
    } catch {
      // Ignore network errors and continue local cleanup.
    }
    setSessions((current) => {
      const next = current.filter((session) => session.id !== sessionId);
      if (next.length > 0) {
        return next;
      }
      return selectedAgent ? [createSession(userId, selectedAgent.id)] : [];
    });
    setSelectedSessionId((current) => {
      if (current !== sessionId) {
        return current;
      }
      return "";
    });
  }

  async function approveSchemaProposal(messageId: string, proposal: ChatSchemaProposal) {
    if (!selectedSession || pendingProposalId === proposal.proposalId) {
      return;
    }

    setPendingProposalId(proposal.proposalId);
    setError(null);
    setActionFeedback(null);

    updateSession(selectedSession.id, (session) => ({
      ...session,
      messages: session.messages.map((entry) => {
        if (entry.id !== messageId) return entry;
        return {
          ...entry,
          blocks: (entry.blocks ?? []).map((block) =>
            block.kind === "schema_proposal" && block.proposal.proposalId === proposal.proposalId
              ? { ...block, approvalState: "pending" as const, approvalMessage: "Aplicando esquema..." }
              : block,
          ),
        };
      }),
      updatedAt: new Date().toISOString(),
    }));

    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply-schema-proposal",
          proposal,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: { createdObjects?: Array<{ objectName: string; fieldCount: number }> };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo aplicar el esquema.");
      }

      const createdObjects = payload.result?.createdObjects ?? [];
      const summary =
        createdObjects.length > 0
          ? `Esquema aplicado: ${createdObjects.map((entry) => `${entry.objectName} (${entry.fieldCount} campos)`).join(", ")}.`
          : "Esquema aplicado correctamente.";

      updateSession(selectedSession.id, (session) => ({
        ...session,
        messages: [
          ...session.messages.map((entry) => {
            if (entry.id !== messageId) return entry;
            return {
              ...entry,
              blocks: (entry.blocks ?? []).map((block) =>
                block.kind === "schema_proposal" && block.proposal.proposalId === proposal.proposalId
                  ? { ...block, approvalState: "approved" as const, approvalMessage: summary }
                  : block,
              ),
            };
          }),
          {
            id: `schema-result-${Date.now()}`,
            role: "assistant",
            content: summary,
            timestamp: currentTimeLabel(),
          },
        ],
        updatedAt: new Date().toISOString(),
      }));

      setActionFeedback(summary);
      router.refresh();
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "No se pudo aplicar el esquema.";
      updateSession(selectedSession.id, (session) => ({
        ...session,
        messages: session.messages.map((entry) => {
          if (entry.id !== messageId) return entry;
          return {
            ...entry,
            blocks: (entry.blocks ?? []).map((block) =>
              block.kind === "schema_proposal" && block.proposal.proposalId === proposal.proposalId
                ? { ...block, approvalState: "failed" as const, approvalMessage: message }
                : block,
            ),
          };
        }),
        updatedAt: new Date().toISOString(),
      }));
      setError(message);
    } finally {
      setPendingProposalId(null);
    }
  }

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || !selectedSession || !selectedAgent || isLoading) {
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
      blocks: [],
    };

    const optimisticMessages = [...selectedSession.messages, userMessage, assistantMessage];
    updateSession(selectedSession.id, (session) => ({
      ...session,
      title: session.messages.length === 0 ? trimmed.slice(0, 36) : session.title,
      messages: optimisticMessages,
      updatedAt: new Date().toISOString(),
    }));
    if (selectedSession.messages.length === 0) {
      void fetch(`/api/workspaces/${workspaceSlug}/conversations/${selectedSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed.slice(0, 36),
        }),
      });
    }
    setInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          agentId: selectedAgent.id,
          conversationId: selectedSession.runtimeConversationId,
          appContext: {
            current_tab: contextSummary.activeTab,
            current_object: contextSummary.activeObjectName ?? null,
            current_view: contextSummary.activeViewName ?? null,
            current_record_title: contextSummary.activeRecordName ?? null,
            queue_preview: contextSummary.queueTitles,
          },
          message: trimmed,
        }),
      });
      void fetch(`/api/workspaces/${workspaceSlug}/conversations/${selectedSession.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          content: trimmed,
          metadata: {
            origin: "workspace_chat",
          },
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("No se pudo conectar con el copilot.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let assistantBlocks: ChatMessageBlock[] = [];

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
          let payload: {
            type: string;
            content?: string;
            text?: string;
            error?: string;
            proposal?: ChatSchemaProposal;
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
            updateSession(selectedSession.id, (session) => ({
              ...session,
              messages: session.messages.map((message) =>
                message.id === assistantId ? { ...message, content: `${message.content}${deltaPiece}` } : message,
              ),
              updatedAt: new Date().toISOString(),
            }));
          }

          if (payload.type === "schema_proposal" && payload.proposal) {
            updateSession(selectedSession.id, (session) => ({
              ...session,
              messages: session.messages.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      blocks: [
                        ...(message.blocks ?? []),
                        {
                          kind: "schema_proposal",
                          proposal: payload.proposal!,
                        },
                      ],
                    }
                  : message,
              ),
              updatedAt: new Date().toISOString(),
            }));
            assistantBlocks = [
              ...assistantBlocks,
              {
                kind: "schema_proposal",
                proposal: payload.proposal,
              },
            ];
          }

          if (payload.type === "error") {
            throw new Error(payload.error ?? "Error al generar respuesta.");
          }
        }
      }

      void fetch(`/api/workspaces/${workspaceSlug}/conversations/${selectedSession.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "assistant",
          content: assistantContent,
          blocks: assistantBlocks,
          metadata: {
            origin: "workspace_chat",
          },
        }),
      });
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
      void fetch(`/api/workspaces/${workspaceSlug}/conversations/${selectedSession.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "assistant",
          content: "No pude responder en este momento. Intenta de nuevo o revisa la configuracion del runtime.",
          metadata: {
            origin: "workspace_chat",
            error: message,
          },
        }),
      });
    } finally {
      setIsLoading(false);
      window.setTimeout(() => { if (typeof window !== "undefined") { router.replace(`${window.location.pathname}${window.location.search}`); router.refresh(); } }, 400);
    }
  }

  async function runWorkspaceAction(
    action:
      | "bootstrap-crm"
      | "bootstrap-dashboard"
      | "scenario-close-import"
      | "scenario-seasonal-analysis"
      | "scenario-quote-approval"
      | "scenario-calendar-scheduling",
    preset?: "operations" | "sales" | "crm" | "custom",
  ) {
    setError(null);
    setActionFeedback(null);
    try {
      if (action.startsWith("scenario-")) {
        const scenarioMap = {
          "scenario-close-import": {
            key: "close-import",
            title: "Ejecutar cierre de importación y validación",
          },
          "scenario-seasonal-analysis": {
            key: "seasonal-analysis",
            title: "Generar análisis estacional de cartera",
          },
          "scenario-quote-approval": {
            key: "quote-approval",
            title: "Preparar cotización para aprobación",
          },
          "scenario-calendar-scheduling": {
            key: "calendar-scheduling",
            title: "Coordinar ventana de agenda con cliente",
          },
        } as const;
        const scenario = scenarioMap[action as keyof typeof scenarioMap];
        const response = await fetch(`/api/workspaces/${workspaceSlug}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "run-scenario",
            scenario: {
              key: scenario.key,
              title: scenario.title,
              metadata: {
                source: "chat_quick_action",
              },
            },
          }),
        });
        const data = (await response.json().catch(() => ({}))) as { error?: string; task?: { id: string } };
        if (!response.ok) {
          throw new Error(data.error ?? "No se pudo ejecutar el escenario.");
        }
        setActionFeedback(`Escenario en cola. Task creada: ${data.task?.id?.slice(0, 8) ?? "n/a"}…`);
        router.refresh();
        return;
      }

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

  async function setAsPrimaryCeo() {
    if (!selectedAgent || selectedAgent.type !== "copilot") {
      return;
    }
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/agents/${selectedAgent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setAsPrimaryCopilot: true,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo definir el CEO principal.");
      }
      setActionFeedback(`${selectedAgent.name} ahora es el CEO principal del workspace.`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo definir el CEO principal.");
    }
  }

  return (
    <div style={stackStyle}>
      <Panel
        eyebrow="Chat"
        title="Chat con agentes"
        description="Conversaciones separadas por usuario, con CEO principal por defecto."
      >
        {!selectedAgent ? (
          <EmptyState
            icon={Bot}
            title="No hay agentes disponibles"
            description="Crea o activa un agente para usar el chat del workspace."
          />
        ) : (
          <div style={chatLayoutStyle}>
            <div style={chatSidebarStyle}>
              <div style={chatSidebarHeaderStyle}>
                <div>
                  <p style={eyebrowStyle}>Sesiones</p>
                  <p style={chatSidebarCopyStyle}>{selectedAgent.name}</p>
                </div>
                <button type="button" onClick={() => void createNewChat()} style={chatActionButtonStyle}>
                  Nuevo chat
                </button>
              </div>

              <label style={{ ...chatSidebarCopyStyle, display: "grid", gap: 6 }}>
                Agente
                <select
                  value={selectedAgentId}
                  onChange={(event) => setSelectedAgentId(event.target.value)}
                  style={chatRenameInputStyle}
                >
                  {sortedAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} · {formatStatusLabel(agent.status)}
                      {agent.isPrimaryCopilot ? " · CEO" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {canSetPrimaryAgent && selectedAgent.type === "copilot" && !selectedAgent.isPrimaryCopilot ? (
                <button type="button" style={chatActionButtonStyle} onClick={() => void setAsPrimaryCeo()}>
                  Definir como CEO principal
                </button>
              ) : null}

              <div style={chatSessionListStyle}>
                {isSessionsLoading ? (
                  <p style={chatSessionMetaStyle}>Cargando conversaciones...</p>
                ) : null}
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
                      onClick={() => void deleteSession(session.id)}
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
                <div style={chatSessionMetaRowStyle}>
                  <StatusPill tone={selectedAgent.status.toLowerCase()}>{selectedAgent.status}</StatusPill>
                  <StatusPill tone={selectedAgent.type === "copilot" ? "active" : "neutral"}>
                    {selectedAgent.type === "copilot"
                      ? selectedAgent.isPrimaryCopilot
                        ? "CEO principal"
                        : "Copilot"
                      : selectedAgent.type === "channel"
                        ? "Canal"
                        : "Worker"}
                  </StatusPill>
                  <StatusPill tone={selectedAgent.readinessState === "ready" ? "active" : "pending"}>
                    {selectedAgent.readinessState === "ready" ? "Listo" : "Draft"}
                  </StatusPill>
                </div>
              </div>

              <div style={chatRenameRowStyle}>
                <input
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onBlur={() => selectedSession && void renameSession(selectedSession.id, renameDraft)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (selectedSession) void renameSession(selectedSession.id, renameDraft);
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
                      {message.blocks?.map((block, blockIndex) => {
                        if (block.kind !== "schema_proposal") {
                          return null;
                        }
                        const isApplying = pendingProposalId === block.proposal.proposalId;
                        const canApprove =
                          block.proposal.requiresApproval &&
                          block.approvalState !== "approved" &&
                          !isApplying;
                        return (
                          <div
                            key={`${message.id}-proposal-${block.proposal.proposalId}-${blockIndex}`}
                            style={{
                              marginTop: 12,
                              border: "1px solid rgba(51, 92, 255, 0.25)",
                              borderRadius: 14,
                              background: "rgba(51, 92, 255, 0.06)",
                              padding: 12,
                              display: "grid",
                              gap: 8,
                            }}
                          >
                            <p style={{ margin: 0, fontWeight: 700 }}>{block.proposal.title}</p>
                            {block.proposal.rationale ? (
                              <p style={{ margin: 0, fontSize: 13, color: "var(--workspace-muted)" }}>
                                {block.proposal.rationale}
                              </p>
                            ) : null}
                            {block.proposal.sourcePrompt ? (
                              <div
                                style={{
                                  border: "1px dashed rgba(15, 23, 42, 0.2)",
                                  borderRadius: 10,
                                  padding: "8px 10px",
                                  background: "rgba(255,255,255,0.75)",
                                }}
                              >
                                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                  Evidencia fuente
                                </p>
                                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--workspace-muted)" }}>
                                  {block.proposal.sourcePrompt}
                                </p>
                              </div>
                            ) : null}
                            <div style={{ display: "grid", gap: 8 }}>
                              {block.proposal.objects.map((entry) => (
                                <div
                                  key={`${block.proposal.proposalId}-${entry.name}`}
                                  style={{
                                    border: "1px solid rgba(15, 23, 42, 0.08)",
                                    borderRadius: 10,
                                    padding: 10,
                                    background: "rgba(255,255,255,0.85)",
                                    display: "grid",
                                    gap: 6,
                                  }}
                                >
                                  <p style={{ margin: 0, fontWeight: 600 }}>{entry.name}</p>
                                  <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>
                                    {entry.fields.map((field) => `${field.name} (${field.type})`).join(" · ")}
                                  </p>
                                </div>
                              ))}
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <button
                                type="button"
                                style={chatActionButtonStyle}
                                disabled={!canApprove}
                                onClick={() => void approveSchemaProposal(message.id, block.proposal)}
                              >
                                {isApplying
                                  ? "Aplicando..."
                                  : block.approvalState === "approved"
                                    ? "Aplicado"
                                    : "Aprobar y crear esquema"}
                              </button>
                              {block.approvalMessage ? (
                                <span style={{ fontSize: 12, color: "var(--workspace-muted)" }}>
                                  {block.approvalMessage}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
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
                  placeholder={`Escribe una pregunta para ${selectedAgent.name}...`}
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

function BaseDataPanel({
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
  const [viewMode, setViewMode] = useState<"table" | "board">("table");
  const [query, setQuery] = useState("");
  const [localRecords, setLocalRecords] = useState<PrismaWorkspaceRecord[]>(records);
  const [draggingRecordId, setDraggingRecordId] = useState<string | null>(null);
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
  const boardGroupField =
    (currentView?.groupByFieldId
      ? objectFields.find(
          (field) =>
            field.id === currentView.groupByFieldId &&
            (field.type === "status" || field.type === "select"),
        )
      : null) ??
    objectFields.find((field) => field.type === "status" || field.type === "select") ??
    null;
  const boardPrimaryField =
    objectFields.find((field) => field.required && field.type === "text") ??
    objectFields.find((field) => field.type === "text") ??
    objectFields[0] ??
    null;
  const boardSecondaryFields = objectFields
    .filter(
      (field) =>
        field.id !== boardPrimaryField?.id && field.id !== boardGroupField?.id,
    )
    .slice(0, 2);

  function normalizeBoardValue(value: unknown) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    return String(value);
  }

  const boardColumns: BoardColumn[] = (() => {
    if (!boardGroupField) {
      return [];
    }
    const configuredOptions = parseSelectOptions(boardGroupField);
    const valuesFromRecords = Array.from(
      new Set(
        visibleRecords
          .map((record) =>
            normalizeBoardValue(getRecordFieldValue(record, boardGroupField.key)),
          )
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const allValues = [...configuredOptions];
    for (const value of valuesFromRecords) {
      if (!allValues.includes(value)) {
        allValues.push(value);
      }
    }
    const baseColumns: BoardColumn[] = [
      {
        key: "board-empty",
        value: null,
        label: "Sin estado",
        records: [],
      },
      ...allValues.map((value) => ({
        key: `board-${value}`,
        value,
        label: formatStatusLabel(value),
        records: [],
      })),
    ];
    return baseColumns.map((column) => ({
      ...column,
      records: visibleRecords.filter(
        (record) =>
          normalizeBoardValue(getRecordFieldValue(record, boardGroupField.key)) ===
          column.value,
      ),
    }));
  })();

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

  useEffect(() => {
    if (viewMode === "board" && !boardGroupField) {
      setViewMode("table");
    }
  }, [viewMode, boardGroupField]);

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

  function openCreatePanelForBoardColumn(targetValue: string | null) {
    if (!canWrite || !object) {
      return;
    }
    const nextDraft = objectFields.reduce<Record<string, unknown>>((accumulator, field) => {
      accumulator[field.key] = initialValueForField(field);
      return accumulator;
    }, {});
    if (boardGroupField) {
      nextDraft[boardGroupField.key] = targetValue ?? "";
    }
    setRecordDraft(nextDraft);
    setTableError("");
    setTableSuccess("");
    setIsCreateOpen(true);
  }

  function getBoardDropTarget(payload: string): BoardDropTarget | null {
    try {
      const parsed = JSON.parse(payload) as BoardDropTarget;
      if (!parsed || typeof parsed.recordId !== "string") {
        return null;
      }
      if (parsed.toValue !== null && parsed.toValue !== undefined && typeof parsed.toValue !== "string") {
        return null;
      }
      return {
        recordId: parsed.recordId,
        toValue: parsed.toValue ?? null,
      };
    } catch {
      return null;
    }
  }

  async function moveRecordToBoardColumn(
    record: PrismaWorkspaceRecord,
    targetValue: string | null,
  ) {
    if (!canWrite || !boardGroupField) {
      return;
    }

    const currentValue = normalizeBoardValue(getRecordFieldValue(record, boardGroupField.key));
    if (currentValue === targetValue) {
      return;
    }

    const nextData = {
      ...record.data,
      [boardGroupField.key]: targetValue ?? null,
    };
    const previousSnapshot = localRecords;

    setTableError("");
    setTableSuccess("");
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
        throw new Error(payload.error ?? "No se pudo mover la tarjeta.");
      }
      setLocalRecords((current) =>
        current.map((entry) => (entry.id === payload.record!.id ? payload.record! : entry)),
      );
      setTableSuccess("Estado actualizado.");
    } catch (error) {
      setLocalRecords(previousSnapshot);
      setTableError(error instanceof Error ? error.message : "No se pudo mover la tarjeta.");
    }
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
              <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" style={primaryButtonStyle} onClick={openCreatePanel}>
                  Nuevo registro
                </button>
                {currentRole === "admin" ? (
                  <a href={`/workspaces/${workspaceSlug}?tab=fields&object=${selectedObjectId}`} style={metaActionLinkStyle}>
                    ⚙ Gestionar campos
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          <div style={viewModeToggleStyle}>
            <button
              type="button"
              style={viewMode === "table" ? viewModeButtonActiveStyle : viewModeButtonStyle}
              onClick={() => setViewMode("table")}
            >
              Tabla
            </button>
            <button
              type="button"
              style={{
                ...(viewMode === "board" ? viewModeButtonActiveStyle : viewModeButtonStyle),
                borderRight: "none",
              }}
              onClick={() => setViewMode("board")}
              disabled={!boardGroupField}
            >
              Tablero
            </button>
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

        {object ? (
          viewMode === "table" ? (
            visibleRecords.length > 0 ? (
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
                                <span>
                                  {value !== null && value !== undefined && String(value).length > 0 ? String(value) : "—"}
                                </span>
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
                title="No hay registros visibles"
                description="Ajusta la vista o la búsqueda, o usa el copilot para crear los primeros registros."
              />
            )
          ) : boardGroupField ? (
            <div style={boardColumnsWrapStyle}>
              {boardColumns.map((column) => (
                <section
                  key={column.key}
                  style={{
                    ...boardColumnStyle,
                    borderColor:
                      draggingRecordId && canWrite
                        ? "rgba(51, 92, 255, 0.35)"
                        : "var(--workspace-border)",
                  }}
                  onDragOver={(event) => {
                    if (!canWrite) return;
                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    if (!canWrite) return;
                    event.preventDefault();
                    const payload = getBoardDropTarget(event.dataTransfer.getData("text/plain"));
                    setDraggingRecordId(null);
                    if (!payload) {
                      return;
                    }
                    const record = visibleRecords.find((entry) => entry.id === payload.recordId);
                    if (!record) {
                      return;
                    }
                    void moveRecordToBoardColumn(record, column.value);
                  }}
                >
                  <header style={boardColumnHeaderStyle}>
                    <h3 style={boardColumnTitleStyle}>{column.label}</h3>
                    <p style={boardColumnCountStyle}>{column.records.length}</p>
                  </header>

                  <div style={boardCardListStyle}>
                    {column.records.map((record) => (
                      <article
                        key={record.id}
                        draggable={canWrite}
                        onDragStart={(event) => {
                          if (!canWrite || !boardGroupField) {
                            return;
                          }
                          const payload: BoardDropTarget = {
                            recordId: record.id,
                            toValue: normalizeBoardValue(getRecordFieldValue(record, boardGroupField.key)),
                          };
                          event.dataTransfer.setData("text/plain", JSON.stringify(payload));
                          setDraggingRecordId(record.id);
                        }}
                        onDragEnd={() => setDraggingRecordId(null)}
                        style={{
                          ...boardCardStyle,
                          opacity: draggingRecordId === record.id ? 0.65 : 1,
                        }}
                        onClick={() => {
                          if (!recordBaseHref || !object?.id) {
                            return;
                          }
                          window.location.href = `${recordBaseHref}&object=${object.id}&record=${record.id}`;
                        }}
                      >
                        <p style={boardCardTitleStyle}>
                          {boardPrimaryField
                            ? String(getRecordFieldValue(record, boardPrimaryField.key) ?? "Sin título")
                            : "Sin título"}
                        </p>
                        {boardSecondaryFields.map((field) => (
                          <p key={field.id} style={boardCardMetaStyle}>
                            {field.name}: {String(getRecordFieldValue(record, field.key) ?? "—")}
                          </p>
                        ))}
                      </article>
                    ))}
                  </div>

                  {canWrite ? (
                    <button
                      type="button"
                      style={primaryButtonStyle}
                      onClick={() => openCreatePanelForBoardColumn(column.value)}
                    >
                      + Nuevo
                    </button>
                  ) : null}
                </section>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Layers3}
              title="Tablero no disponible"
              description="Este objeto no tiene un campo de tipo estado o selección para agrupar las columnas."
            />
          )
        ) : (
          <EmptyState
            icon={FileStack}
            title="No hay objetos configurados"
            description="Primero crea objetos y campos para que la vista dinámica tenga estructura."
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
                const draftOptionValue = String(value ?? "");
                const createSelectOptions =
                  draftOptionValue.length > 0 && !options.includes(draftOptionValue)
                    ? [draftOptionValue, ...options]
                    : options;
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
                        {createSelectOptions.map((option) => (
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

export function DataPanel(props: DataPanelProps) {
  return <BaseDataPanel {...props} />;
}

export function AgentsPanel({
  workspaceId,
  currentRole,
  workspaceSlug,
  currentUserEmail,
  agentLimit,
  agentTemplates,
  agents,
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
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content: "Crea el agente y luego usa este chat para definir su rol, responsabilidades y conexiones.",
    },
  ]);
  const selectedAgent = localAgents.find((agent) => agent.id === selectedAgentId) ?? localAgents[0] ?? null;
  const credentialEntries = getCredentialEnvEntries(selectedAgent?.channelConfig);
  const activeAgentCount = localAgents.length;
  const canManageAdvancedSettings = currentRole === "admin";
  const normalizedBuilderUser = currentUserEmail?.trim().toLowerCase() || "anonymous";
  const builderStorageKey = selectedAgentId
    ? `builder-thread:${workspaceSlug}:${selectedAgentId}:${normalizedBuilderUser}`
    : "";

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
      role: current.legacyRole ?? mapAgentTypeToRole(current.type),
      description: current.description ?? "",
      soulMd: current.soulMd ?? "",
      skills: current.tools.join(", "),
      read: current.read.join(", "),
      write: current.write.join(", "),
      channels: current.channels.join(", "),
      cronJobs: JSON.stringify(current.cronJobs ?? [], null, 2),
      isActive: current.status !== "paused",
    });
    setIsCreateMode(false);
  }, [localAgents, selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId) {
      setChatMessages([buildInitialChatMessage()]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(builderStorageKey);
      if (!raw) {
        setChatMessages([buildInitialChatMessage(selectedAgent?.name)]);
        return;
      }
      const parsed = JSON.parse(raw) as Array<{ role: "user" | "assistant"; content: string }>;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setChatMessages([buildInitialChatMessage(selectedAgent?.name)]);
        return;
      }
      setChatMessages(parsed);
    } catch {
      setChatMessages([buildInitialChatMessage(selectedAgent?.name)]);
    }
  }, [builderStorageKey, selectedAgent?.name, selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId) {
      return;
    }
    try {
      window.localStorage.setItem(builderStorageKey, JSON.stringify(chatMessages));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [builderStorageKey, chatMessages, selectedAgentId]);

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
    setChatMessages([buildInitialChatMessage()]);
    setIsCreateMode(true);
  }

  function buildInitialChatMessage(agentName?: string) {
    return {
      role: "assistant" as const,
      content: agentName
        ? `Estoy listo para configurar a ${agentName}. Cuéntame su rol, responsabilidades y conexiones.`
        : "Crea el agente y luego usa este chat para definir su rol, responsabilidades y conexiones.",
    };
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
        name: draft.name,
        role: draft.role,
        description: draft.description,
        soulMd: draft.soulMd,
        skills: parseCsvList(draft.skills),
        knowledgeScope: {
          read: parseCsvList(draft.read),
          write: parseCsvList(draft.write),
          channels: parseCsvList(draft.channels),
        },
        cronJobs: Array.isArray(parsedCronJobs) ? parsedCronJobs : [],
        isActive: draft.isActive,
      };

      const targetUrl = isCreateMode
        ? `/api/workspaces/${workspaceSlug}/agents`
        : `/api/workspaces/${workspaceSlug}/agents/${draft.id}`;
      if (!isCreateMode && !draft.id) {
        throw new Error("No se encontró el agente para actualizar.");
      }

      const response = await fetch(targetUrl, {
        method: isCreateMode ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        agent?: {
          id: string;
          name: string;
          legacyRole?: string | null;
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
          lastCronRunAt?: string | null;
          channelConfig?: Record<string, unknown>;
        };
      };

      if (!response.ok || !data.agent) {
        throw new Error(data.error ?? "No se pudo guardar el agente.");
      }

      const mappedAgent = data.agent;

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
      const response = await fetch(`/api/workspaces/${workspaceSlug}/agents/${selectedAgent.id}/builder-turn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          apply: true,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        assistantMessage?: string;
        applied?: boolean;
        appliedFields?: string[];
        agent?: {
          id: string;
          name: string;
          legacyRole?: string | null;
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
          lastCronRunAt?: string | null;
          channelConfig?: Record<string, unknown>;
        };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo contactar al builder del agente.");
      }

      if (payload.agent) {
        setLocalAgents((current) =>
          current.map((agent) => (agent.id === payload.agent!.id ? payload.agent! : agent)),
        );
      }

      const appliedSummary =
        payload.applied && Array.isArray(payload.appliedFields) && payload.appliedFields.length > 0
          ? `\n\nCambios aplicados: ${payload.appliedFields.join(", ")}.`
          : "";
      const assistantMessage =
        payload.assistantMessage?.trim() ||
        "Listo. Registré tus instrucciones en este agente.";
      setChatMessages((current) => {
        const updated = [...current];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `${assistantMessage}${appliedSummary}`,
        };
        return updated;
      });
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
        description={`${activeAgentCount} de ${agentLimit} agentes en uso. Configura responsabilidades desde chat y deja lo técnico en avanzado.`}
      >
        <div style={agentToolbarStyle}>
          <StatusPill tone={activeAgentCount < agentLimit ? "active" : "pending"}>
            {activeAgentCount}/{agentLimit} agentes
          </StatusPill>
          <div style={agentTemplateChooserStyle}>
            <button type="button" style={chatActionButtonStyle} onClick={startBlankAgent}>
              Nuevo agente
            </button>
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
          </div>
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
                  <StatusPill tone="neutral">{agent.tools.length} skills</StatusPill>
                </div>
              </button>
            ))}
          </div>

          <div style={agentDetailCardStyle}>
            <div style={agentDetailHeaderStyle}>
              <div>
                <p style={eyebrowStyle}>{isCreateMode ? "Nuevo agente" : "Builder"}</p>
                <h3 style={agentDetailTitleStyle}>{isCreateMode ? "Crear agente" : draft.name || "Editar agente"}</h3>
                <p style={agentDescriptionStyle}>
                  Habla con el builder para ajustar rol, responsabilidades, skills y conexiones.
                </p>
              </div>
              {!isCreateMode && selectedAgent ? (
                <StatusPill tone={selectedAgent.status.toLowerCase()}>{formatStatusLabel(selectedAgent.status)}</StatusPill>
              ) : null}
            </div>

            {selectedAgent || isCreateMode ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
                    gap: "1rem",
                    alignItems: "start",
                  }}
                >
                  <div style={detailRailStyle}>
                    <h4 style={detailRailTitleStyle}>Builder chat</h4>
                    <p style={detailRailCopyStyle}>
                      Describe el rol del agente en lenguaje natural. El builder aplica cambios de configuración automáticamente.
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
                            {message.role === "user" ? "Tu" : selectedAgent?.name ?? "Builder"}
                          </strong>
                          <p style={agentChatCopyStyle}>{message.content || (isSending ? "Pensando..." : "")}</p>
                        </div>
                      ))}
                    </div>
                    <div style={agentChatComposerStyle}>
                      <input
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        placeholder={
                          selectedAgent
                            ? `Ejemplo: “Quiero que ${selectedAgent.name} monitoree Close cada hora y cree follow-ups”.`
                            : "Primero crea el agente para habilitar el chat del builder."
                        }
                        style={chatInputStyle}
                        disabled={!selectedAgent}
                      />
                      <button
                        type="button"
                        onClick={sendTestMessage}
                        style={chatButtonStyle}
                        disabled={isSending || !selectedAgent}
                      >
                        {isSending ? "Aplicando..." : "Enviar"}
                      </button>
                    </div>
                    {chatError ? <p style={agentChatErrorStyle}>{chatError}</p> : null}
                  </div>

                  <div style={detailRailStyle}>
                    <h4 style={detailRailTitleStyle}>Resumen</h4>
                    <label style={fieldStyle}>
                      Nombre
                      <input
                        value={draft.name}
                        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldStyle}>
                      Responsabilidad principal
                      <textarea
                        value={draft.description}
                        onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                        rows={3}
                        style={textAreaStyle}
                      />
                    </label>
                    <div style={agentMetaWrapStyle}>
                      <StatusPill tone={resolveAgentTypeTone(selectedAgent?.type ?? mapRoleToAgentType(draft.role))}>
                        {formatAgentTypeLabel(selectedAgent?.type ?? mapRoleToAgentType(draft.role))}
                      </StatusPill>
                      <StatusPill tone="neutral">{parseCsvList(draft.skills).length} skills</StatusPill>
                    </div>

                    <div style={agentMetaWrapStyle}>
                      <StatusPill tone="neutral">
                        Rol: {draft.role.replace(/_/g, " ")}
                      </StatusPill>
                      <StatusPill tone="neutral">
                        Alcance: {draft.read ? parseCsvList(draft.read).length : 0}/{draft.write ? parseCsvList(draft.write).length : 0}/
                        {draft.channels ? parseCsvList(draft.channels).length : 0}
                      </StatusPill>
                    </div>

                    <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.5rem" }}>
                      <h4 style={detailRailTitleStyle}>Conexiones API</h4>
                      {credentialEntries.length === 0 ? (
                        <p style={detailRailCopyStyle}>
                          Todavía no hay conexiones. Puedes pedir por chat: “Guarda CLOSE_API_KEY=...”.
                        </p>
                      ) : (
                        <div style={{ display: "grid", gap: "0.6rem" }}>
                          {credentialEntries.map((entry, index) => {
                            const providerLabel = inferIntegrationProviderLabel(entry.key);
                            const docsUrl = inferIntegrationDocsUrl(entry.key);
                            return (
                              <div key={`${entry.key}-${index}`} style={connectionRowStyle}>
                                <div style={{ flex: 1 }}>
                                  <p style={agentNameStyle}>{providerLabel}</p>
                                  <p style={detailRailMetaStyle}>{entry.key}</p>
                                  <p style={detailRailCopyStyle}>{maskConnectionValue(entry.value)}</p>
                                </div>
                                {docsUrl ? (
                                  <a
                                    href={docsUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ ...chatActionButtonStyle, textDecoration: "none" }}
                                  >
                                    Docs
                                  </a>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {canManageAdvancedSettings && selectedAgent ? (
                        <a
                          href={`/admin/agents/${workspaceSlug}/${selectedAgent.id}`}
                          style={{ ...chatActionButtonStyle, textDecoration: "none", textAlign: "center" }}
                        >
                          Abrir configuración avanzada
                        </a>
                      ) : null}
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
                    </div>
                    {builderError ? <p style={inlineErrorStyle}>{builderError}</p> : null}
                    {builderSuccess ? <p style={inlineSuccessStyle}>{builderSuccess}</p> : null}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                icon={Bot}
                title="No hay agentes configurados"
                description="Crea un agente en blanco o usa una plantilla para comenzar."
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
  if (action === "cron.executed") return "Cron ejecutado";
  if (action === "rate_offer.generated") return "Oferta generada";
  if (action === "rate_offer.approved") return "Oferta aprobada";
  if (action === "workspace.seeded") return "Workspace inicializado";
  return action.replace(/[._]/g, " ").replace(/^\w/, (value) => value.toUpperCase());
}

function formatActivityDetails(details: Record<string, unknown>) {
  if (typeof details.title === "string") {
    return details.title;
  }
  if (typeof details.offer === "string") {
    return details.offer;
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

function parseConnectionEntries(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        return null;
      }
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (!key || !value) {
        return null;
      }
      return { key, value };
    })
    .filter((entry): entry is { key: string; value: string } => Boolean(entry));
}

function maskConnectionValue(value: string) {
  if (value.length <= 4) {
    return "••••";
  }
  return `${"•".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

function formatIsoDateToYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function replaceCronPromptVariables(prompt: string, values: { lastRun: string; today: string; workspaceId: string }) {
  return prompt
    .replace(/\{last_run\}/g, values.lastRun)
    .replace(/\{today\}/g, values.today)
    .replace(/\{workspace_id\}/g, values.workspaceId);
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

function getCredentialEnvEntries(channelConfig?: Record<string, unknown>) {
  const raw = channelConfig?.apiCredentials;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return Object.entries(raw as Record<string, unknown>)
    .filter(([key]) => key.trim().length > 0)
    .map(([key, value]) => ({
      key,
      value: typeof value === "string" ? value : String(value ?? ""),
    }));
}

function inferIntegrationProviderLabel(key: string) {
  const normalized = key.toUpperCase();
  if (normalized.includes("CLOSE")) return "Close";
  if (normalized.includes("CALENDLY")) return "Calendly";
  if (normalized.includes("HUBSPOT")) return "HubSpot";
  if (normalized.includes("SLACK")) return "Slack";
  if (normalized.includes("OPENAI")) return "OpenAI";
  return key;
}

function inferIntegrationDocsUrl(key: string) {
  const normalized = key.toUpperCase();
  if (normalized.includes("CLOSE")) return "https://developer.close.com/";
  if (normalized.includes("CALENDLY")) return "https://developer.calendly.com/";
  if (normalized.includes("HUBSPOT")) return "https://developers.hubspot.com/docs/api/overview";
  if (normalized.includes("SLACK")) return "https://api.slack.com/";
  if (normalized.includes("OPENAI")) return "https://platform.openai.com/docs/overview";
  return null;
}

function mapCronJobPromptVariables(jobs: unknown[], workspaceId: string, lastRunIso: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  return jobs.map((job) => {
    if (!job || typeof job !== "object" || Array.isArray(job)) {
      return job;
    }
    const typedJob = job as Record<string, unknown>;
    const prompt = typeof typedJob.prompt === "string" ? typedJob.prompt : null;
    if (!prompt) {
      return typedJob;
    }
    const mappedPrompt = prompt
      .replace(/\{workspace_id\}/g, workspaceId)
      .replace(/\{today\}/g, today)
      .replace(/\{last_run\}/g, lastRunIso ?? today);
    return {
      ...typedJob,
      prompt: mappedPrompt,
    };
  });
}

function parseApiConnections(input: string) {
  const lines = input
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const map: Record<string, string> = {};
  for (const line of lines) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`Formato inválido en conexión "${line}". Usa KEY=VALUE.`);
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) {
      throw new Error(`Clave inválida "${key}". Usa solo A-Z, 0-9 y _.`);
    }
    if (!value) {
      throw new Error(`La conexión "${key}" requiere un valor.`);
    }
    map[key] = value;
  }
  return map;
}

function serializeApiConnections(input: Record<string, unknown> | null | undefined) {
  if (!input) {
    return "";
  }
  return Object.entries(input)
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("\n");
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
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 24,
  background: "rgba(255, 255, 255, 0.96)",
  padding: 22,
  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.06)",
  display: "grid",
  gap: 18,
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
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 20,
  background: "rgba(255, 255, 255, 0.98)",
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

const homeHeroCardStyle: React.CSSProperties = {
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 28,
  background: "rgba(255, 255, 255, 0.98)",
  boxShadow: "0 14px 30px rgba(15, 23, 42, 0.05)",
  padding: 26,
  display: "grid",
  gap: 16,
};

const homeHeroHeadingStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const homeHeroLeadStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-muted)",
  fontSize: 30,
  fontWeight: 500,
};

const homeHeroTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 58,
  lineHeight: 1,
  fontFamily: "var(--font-display)",
  color: "var(--workspace-text)",
};

const homeHeroMetaStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-muted)",
  fontSize: 15,
};

const homeChatComposerStyle: React.CSSProperties = {
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 30,
  background: "rgba(255, 255, 255, 0.98)",
  padding: "10px 12px",
  display: "grid",
  gap: 8,
};

const homeChatTopRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 8,
};

const homeChatBottomRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const homeChatToolsLeftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const homeChatInputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--workspace-text)",
  padding: "8px 10px",
  font: "inherit",
  fontSize: 18,
};

const homeChatButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  border: "none",
  background: "#111827",
  color: "#ffffff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const homeToolButtonStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(15, 23, 42, 0.12)",
  background: "rgba(255, 255, 255, 0.98)",
  color: "var(--workspace-text)",
  font: "inherit",
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 12px",
  cursor: "pointer",
};

const homeToolButtonIconStyle: React.CSSProperties = {
  ...homeToolButtonStyle,
  width: 30,
  height: 30,
  borderRadius: "50%",
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const homeStatusStripStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

const homeStatusCardStyle: React.CSSProperties = {
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 18,
  background: "rgba(255, 255, 255, 0.98)",
  padding: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const homeStatusLabelStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--workspace-muted)",
  fontWeight: 700,
};

const homeStatusTitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 14,
  color: "var(--workspace-text)",
  fontWeight: 700,
};

const homeStatusMetaStyle: React.CSSProperties = {
  margin: "4px 0 0",
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

const queueItemLinkStyle: React.CSSProperties = {
  ...queueItemStyle,
  textDecoration: "none",
  color: "inherit",
  background: "var(--workspace-panel-soft)",
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

const chatSessionMetaRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
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

const viewModeToggleStyle: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid var(--workspace-border)",
  borderRadius: 12,
  overflow: "hidden",
  background: "var(--workspace-panel)",
};

const viewModeButtonStyle: React.CSSProperties = {
  border: "none",
  borderRight: "1px solid var(--workspace-border)",
  background: "transparent",
  color: "var(--workspace-text)",
  font: "inherit",
  fontWeight: 600,
  padding: "8px 12px",
  cursor: "pointer",
};

const viewModeButtonActiveStyle: React.CSSProperties = {
  ...viewModeButtonStyle,
  background: "rgba(51, 92, 255, 0.12)",
  color: "#2947cc",
};

const boardColumnsWrapStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
  alignItems: "start",
};

const boardColumnStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 16,
  background: "var(--workspace-panel-soft)",
  padding: 12,
  display: "grid",
  gap: 10,
  minHeight: 220,
};

const boardColumnHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const boardColumnTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-text)",
  fontSize: 14,
  fontWeight: 700,
};

const boardColumnCountStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-muted)",
  fontSize: 12,
  fontWeight: 600,
};

const boardCardListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const boardCardStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 12,
  background: "var(--workspace-panel)",
  padding: 10,
  display: "grid",
  gap: 6,
  cursor: "grab",
};

const boardCardTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-text)",
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.35,
};

const boardCardMetaStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--workspace-muted)",
  fontSize: 12,
  lineHeight: 1.4,
};

const cronVariableRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const cronVariablePreviewStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  border: "1px dashed var(--workspace-border)",
  borderRadius: 12,
  padding: 10,
  background: "var(--workspace-panel-soft)",
};

const connectionListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const connectionRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
  gap: 8,
  alignItems: "center",
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
