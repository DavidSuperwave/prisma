"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CircleDot,
  FileStack,
  Filter,
  Layers3,
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
  agents: PrismaWorkspaceAgent[];
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

type RecordDetailPanelProps = {
  title: string;
  status: string;
  owner: string;
  summary: string;
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

export function DataPanel({ objects, fields, views, records }: DataPanelProps) {
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
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null;
  const selectedActivity = activity.filter((entry) => entry.agentId === selectedAgent?.id).slice(0, 10);

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
                      `Memoria: ${selectedAgent.memoryLimitMb} MB`,
                      `Cron jobs: ${selectedAgent.cronJobs.length || 0}`,
                    ]}
                  />
                </div>

                <div style={agentFooterGridStyle}>
                  <div style={detailRailStyle}>
                    <h4 style={detailRailTitleStyle}>SOUL.md</h4>
                    <p style={detailRailCopyStyle}>{selectedAgent.soulMd ?? "Sin instrucciones cargadas."}</p>
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
