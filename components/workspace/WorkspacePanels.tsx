"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowUp,
  ArrowRight,
  Bot,
  Building2,
  CircleDot,
  FileStack,
  Globe,
  Layers3,
  LoaderCircle,
  MessageSquare,
  Mic,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import type {
  PrismaWorkspaceActivity,
  PrismaWorkspaceAgent,
  PrismaWorkspaceField,
  PrismaWorkspaceObject,
} from "@/lib/workspaceStore";
import { deriveQueueItems } from "@/lib/workspaceStore";
import { consumeCompleteSseDataLines } from "@/lib/chatSseClient";
import { parseCsvForPreview, smartExtractSheet } from "@/lib/spreadsheetParser";
import { ImagePickerCard, type ImagePickerCandidate } from "@/components/workspace/chat/ImagePickerCard";
import { WriteProposalCard, type WriteProposalPayload } from "@/components/workspace/chat/WriteProposalCard";
// TableView / KanbanView / KpiPanel were used by the old BaseDataPanel.
// They are no longer referenced here (Data panel moved to components/workspace/data/DataPanel.tsx).

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

// DataPanelProps / BoardColumn / BoardDropTarget moved to components/workspace/data/DataPanel.tsx

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
};

type QueuePanelProps = {
  recordBaseHref?: string;
  workspaceSlug?: string;
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
    skills: string[];
    capabilities?: {
      webSearch: boolean;
      browser: boolean;
      integration: boolean;
      ingestion: boolean;
      workspaceActions: boolean;
    };
    isPrimaryCopilot?: boolean;
    readinessState?: "ready" | "draft";
    readinessIssues?: string[];
    isReadyForExecution?: boolean;
  }>;
  primaryAgentId?: string | null;
  canSetPrimaryAgent?: boolean;
  askPrompt?: string | null;
  objects?: PrismaWorkspaceObject[];
  fields?: PrismaWorkspaceField[];
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

type ChatComposerMode = "chat" | "web" | "image_search";

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

type DocumentPreviewSheet = {
  name: string;
  headers: string[];
  sampleRows: Array<Record<string, unknown>>;
  rowCount: number;
};

type DocumentPreview = {
  kind: "spreadsheet" | "pdf" | "image" | "other";
  sheets?: DocumentPreviewSheet[];
};

type DocumentActionId = "create-object" | "import-existing" | "extract" | "attach-only";

type DocumentActionBlock = {
  kind: "document_actions";
  recordId: string;
  fileName: string;
  fileKind: DocumentPreview["kind"];
  summary: string;
  preview?: DocumentPreview;
  actions: Array<{ id: DocumentActionId; label: string }>;
  resolvedAction?: DocumentActionId;
  resolutionState?: "idle" | "working" | "done" | "failed";
  resolutionMessage?: string;
};

type ImagePickerBlock = {
  kind: "image_picker";
  mode: "search" | "generate";
  prompt: string;
  candidates: ImagePickerCandidate[];
  recordId?: string | null;
  savedPath?: string | null;
  savedUrl?: string | null;
};

type WriteProposalBlock = {
  kind: "write_proposal";
  toolName: string;
  proposal: WriteProposalPayload;
  confirmToken: string;
  expiresAt?: string | null;
  state: "pending" | "confirmed" | "cancelled";
};

type ChatMessageBlock =
  | {
      kind: "schema_proposal";
      proposal: ChatSchemaProposal;
      approvalState?: "pending" | "approved" | "failed";
      approvalMessage?: string;
      documentRecordId?: string;
    }
  | DocumentActionBlock
  | ImagePickerBlock
  | WriteProposalBlock;

type ChatAttachment = {
  id: string;
  fileName: string;
  publicUrl: string;
  contentType: string;
  fileKind?: DocumentPreview["kind"];
};

type ChatSession = {
  id: string;
  agentId: string;
  title: string;
  source: string;
  runtimeConversationId: string;
  agentPaused: boolean;
  messages: ChatMessage[];
  attachments: ChatAttachment[];
  updatedAt: string;
};

const defaultChatSessionTitle = "Nuevo chat";

function normalizeCapabilityToken(value: string) {
  return value.trim().toLowerCase().replace(/[\s._-]+/g, "");
}

function renderInlineAssistantMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)/g);
  return parts
    .filter((part) => part.length > 0)
    .map((part, index) => {
      if (
        (part.startsWith("**") && part.endsWith("**")) ||
        (part.startsWith("__") && part.endsWith("__"))
      ) {
        return <strong key={`md-strong-${index}`}>{part.slice(2, -2)}</strong>;
      }
      if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
        return <em key={`md-em-${index}`}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={`md-code-${index}`} style={chatInlineCodeStyle}>
            {part.slice(1, -1)}
          </code>
        );
      }
      return <span key={`md-span-${index}`}>{part}</span>;
    });
}

function renderAssistantMessageContent(content: string) {
  const lines = content.split("\n");
  const blocks: Array<
    | { kind: "paragraph"; value: string }
    | { kind: "unordered-list"; items: string[] }
    | { kind: "ordered-list"; items: string[] }
  > = [];

  let paragraphBuffer: string[] = [];
  let listKind: "unordered-list" | "ordered-list" | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) {
      return;
    }
    blocks.push({ kind: "paragraph", value: paragraphBuffer.join("\n") });
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listKind || listItems.length === 0) {
      listKind = null;
      listItems = [];
      return;
    }
    blocks.push({ kind: listKind, items: [...listItems] });
    listKind = null;
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    const unorderedMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listKind !== "ordered-list") {
        flushList();
        listKind = "ordered-list";
      }
      listItems.push(orderedMatch[1]);
      continue;
    }
    if (unorderedMatch) {
      flushParagraph();
      if (listKind !== "unordered-list") {
        flushList();
        listKind = "unordered-list";
      }
      listItems.push(unorderedMatch[1]);
      continue;
    }
    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraphBuffer.push(line);
  }

  flushParagraph();
  flushList();

  if (blocks.length === 0) {
    return (
      <p style={assistantMessageParagraphStyle}>
        {renderInlineAssistantMarkdown(content)}
      </p>
    );
  }

  return blocks.map((block, blockIndex) => {
    if (block.kind === "paragraph") {
      return (
        <p key={`assistant-paragraph-${blockIndex}`} style={assistantMessageParagraphStyle}>
          {renderInlineAssistantMarkdown(block.value)}
        </p>
      );
    }
    if (block.kind === "ordered-list") {
      return (
        <ol key={`assistant-ol-${blockIndex}`} style={assistantMessageListStyle}>
          {block.items.map((item, itemIndex) => (
            <li key={`assistant-ol-item-${blockIndex}-${itemIndex}`}>
              {renderInlineAssistantMarkdown(item)}
            </li>
          ))}
        </ol>
      );
    }
    return (
      <ul key={`assistant-ul-${blockIndex}`} style={assistantMessageListStyle}>
        {block.items.map((item, itemIndex) => (
          <li key={`assistant-ul-item-${blockIndex}-${itemIndex}`}>
            {renderInlineAssistantMarkdown(item)}
          </li>
        ))}
      </ul>
    );
  });
}

function Panel({
  title,
  eyebrow,
  description,
  children,
  actions,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section style={panelStyle}>
      <div
        style={{
          ...panelHeaderStyle,
          ...(actions
            ? { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }
            : {}),
        }}
      >
        <div>
          {eyebrow ? <p style={eyebrowStyle}>{eyebrow}</p> : null}
          <h2 style={panelTitleStyle}>{title}</h2>
          {description ? <p style={panelDescriptionStyle}>{description}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
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
    title: defaultChatSessionTitle,
    source: "workspace_chat",
    runtimeConversationId: `user-${userId}-${agentId}-${sessionId}`,
    agentPaused: false,
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

const SPREADSHEET_EXTENSIONS = ["xlsx", "xls", "csv"];
const SAMPLE_ROW_LIMIT = 50;

// xlsx is ~400KB gzipped; only load it when we actually need to read a
// spreadsheet file. The module is cached by the bundler after the first call.
type XlsxModule = typeof import("xlsx");
let xlsxModulePromise: Promise<XlsxModule> | null = null;
function loadXlsx(): Promise<XlsxModule> {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import("xlsx");
  }
  return xlsxModulePromise;
}

function classifyDocumentFile(file: File): DocumentPreview["kind"] {
  const mime = (file.type ?? "").toLowerCase();
  const name = (file.name ?? "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() ?? "" : "";
  if (SPREADSHEET_EXTENSIONS.includes(ext)) return "spreadsheet";
  if (mime.includes("spreadsheet") || mime === "text/csv") return "spreadsheet";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  return "other";
}


async function buildDocumentPreview(file: File): Promise<DocumentPreview | null> {
  const kind = classifyDocumentFile(file);
  if (kind !== "spreadsheet") {
    return { kind };
  }
  try {
    const buffer = await file.arrayBuffer();
    const ext = (file.name ?? "").toLowerCase().split(".").pop() ?? "";
    if (ext === "csv") {
      const text = new TextDecoder("utf-8").decode(buffer);
      const { headers, rows, rowCount } = parseCsvForPreview(text);
      if (headers.length === 0) {
        return { kind };
      }
      return {
        kind,
        sheets: [
          {
            name: "Sheet1",
            headers,
            sampleRows: rows.slice(0, SAMPLE_ROW_LIMIT),
            rowCount,
          },
        ],
      };
    }
    const XLSX = await loadXlsx();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheets: DocumentPreviewSheet[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const { headers, rows: cleanedRows } = smartExtractSheet(sheet);
      sheets.push({
        name: sheetName,
        headers,
        sampleRows: cleanedRows.slice(0, SAMPLE_ROW_LIMIT),
        rowCount: cleanedRows.length,
      });
    }
    if (sheets.length === 0) {
      return { kind };
    }
    return { kind, sheets };
  } catch {
    return { kind };
  }
}

async function extractAllSpreadsheetRows(file: File, sheetName?: string): Promise<Array<Record<string, unknown>>> {
  const buffer = await file.arrayBuffer();
  const ext = (file.name ?? "").toLowerCase().split(".").pop() ?? "";
  if (ext === "csv") {
    const text = new TextDecoder("utf-8").decode(buffer);
    return parseCsvForPreview(text).rows;
  }
  const XLSX = await loadXlsx();
  const workbook = XLSX.read(buffer, { type: "array" });
  const targetSheet = sheetName && workbook.Sheets[sheetName] ? sheetName : workbook.SheetNames[0];
  if (!targetSheet) return [];
  const sheet = workbook.Sheets[targetSheet];
  if (!sheet) return [];
  return smartExtractSheet(sheet).rows;
}

function summarizeDocumentPreview(fileName: string, preview: DocumentPreview | null | undefined, fileKind: DocumentPreview["kind"]): string {
  if (fileKind === "spreadsheet" && preview?.sheets && preview.sheets.length > 0) {
    const sheet = preview.sheets[0];
    const headerSample = sheet.headers.slice(0, 5).join(", ");
    const extra = sheet.headers.length > 5 ? `, +${sheet.headers.length - 5} mas` : "";
    return `Detecté ${sheet.headers.length} columnas y ${sheet.rowCount} filas en "${sheet.name}" de ${fileName}${headerSample ? `: ${headerSample}${extra}` : ""}.`;
  }
  if (fileKind === "pdf") {
    return `Documento PDF cargado: ${fileName}. Puedo extraer información clave o adjuntarlo sin procesar.`;
  }
  if (fileKind === "image") {
    return `Imagen cargada: ${fileName}. Puedo intentar extraer texto o adjuntarla sin procesar.`;
  }
  return `Archivo cargado: ${fileName}.`;
}

function buildDocumentActionsForKind(kind: DocumentPreview["kind"]): DocumentActionBlock["actions"] {
  if (kind === "spreadsheet") {
    return [
      { id: "create-object", label: "Crear tabla con estos datos" },
      { id: "import-existing", label: "Importar a una tabla existente" },
      { id: "attach-only", label: "Solo adjuntar" },
    ];
  }
  return [
    { id: "extract", label: "Extraer información" },
    { id: "attach-only", label: "Solo adjuntar" },
  ];
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

export function QueuePanel({ queueItems, recordBaseHref, workspaceSlug }: QueuePanelProps) {
  const [filter, setFilter] = useState<string>("all");
  const filteredQueueItems =
    filter === "all" ? queueItems : queueItems.filter((item) => item.status.toLowerCase() === filter);
  const topItems = filteredQueueItems.slice(0, 5);
  const tasksHref = workspaceSlug ? `/workspaces/${workspaceSlug}/tasks?view=queue` : null;
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
        title="Vista previa de tareas urgentes"
        description={`${queueItems.length} tareas en total · mostrando las primeras ${topItems.length}.`}
        actions={
          tasksHref ? (
            <a
              href={tasksHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: "var(--radius-md)",
                background: "var(--workspace-accent-strong, #2563eb)",
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Abrir tareas
              <ArrowRight size={14} />
            </a>
          ) : null
        }
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

        {topItems.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No hay tareas urgentes"
            description="Cuando los agentes detecten aprobaciones pendientes o seguimientos bloqueados, aparecerán aquí."
          />
        ) : (
          <div style={queueTableStyle}>
            {topItems.map((item) => {
              const preferTasks = tasksHref && !item.recordId;
              const href = preferTasks
                ? `${tasksHref}&task=${item.id}`
                : recordBaseHref && item.objectId && (item.recordId ?? item.id)
                  ? `${recordBaseHref}&object=${item.objectId}&record=${item.recordId ?? item.id}`
                  : tasksHref ?? undefined;
              return (
                <a
                  key={item.id}
                  href={href}
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
              );
            })}
            {filteredQueueItems.length > topItems.length && tasksHref ? (
              <a
                href={tasksHref}
                style={{
                  ...queueTableRowStyle,
                  justifyContent: "center",
                  textDecoration: "none",
                  color: "var(--workspace-accent-strong, #2563eb)",
                  fontWeight: 600,
                }}
              >
                Ver las {filteredQueueItems.length - topItems.length} tareas restantes →
              </a>
            ) : null}
          </div>
        )}
      </Panel>
    </div>
  );
}

/** Set to `true` to show the human takeover toggle in the chat header. */
const SHOW_HUMAN_TAKEOVER_BUTTON = false;

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
  objects = [],
  fields = [],
}: ChatPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  const [isTogglingTakeover, setIsTogglingTakeover] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [composerMode, setComposerMode] = useState<ChatComposerMode>("chat");
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [pendingProposalId, setPendingProposalId] = useState<string | null>(null);
  const [isDocumentsFinderOpen, setIsDocumentsFinderOpen] = useState(false);
  const [documentsFinderQuery, setDocumentsFinderQuery] = useState("");
  const [workspaceDocuments, setWorkspaceDocuments] = useState<Array<{
    id: string;
    fileName: string;
    publicUrl: string;
    mimeType: string;
    fileKind: DocumentPreview["kind"];
    preview?: DocumentPreview;
    createdAt: string;
  }>>([]);
  const [isDocumentsLoading, setIsDocumentsLoading] = useState(false);
  const [workspaceFolders, setWorkspaceFolders] = useState<Array<{
    id: string;
    name: string;
    parentId: string | null;
    fileCount: number;
  }>>([]);
  const [mentionPickerState, setMentionPickerState] = useState<{
    open: boolean;
    query: string;
    triggerIndex: number;
  }>({ open: false, query: "", triggerIndex: -1 });
  type PendingAttachmentRef =
    | { kind: "record"; id: string }
    | { kind: "folder"; id: string; name: string; fileCount: number };
  const [pendingAttachmentRefs, setPendingAttachmentRefs] = useState<PendingAttachmentRef[]>([]);
  const addPendingRecordRef = useCallback(
    (recordId: string) => {
      setPendingAttachmentRefs((current) =>
        current.some((entry) => entry.kind === "record" && entry.id === recordId)
          ? current
          : [...current, { kind: "record", id: recordId }],
      );
    },
    [],
  );
  const addPendingFolderRef = useCallback(
    (folder: { id: string; name: string; fileCount: number }) => {
      setPendingAttachmentRefs((current) =>
        current.some((entry) => entry.kind === "folder" && entry.id === folder.id)
          ? current
          : [...current, { kind: "folder", ...folder }],
      );
    },
    [],
  );
  const removePendingRef = useCallback((predicate: (ref: PendingAttachmentRef) => boolean) => {
    setPendingAttachmentRefs((current) => current.filter((entry) => !predicate(entry)));
  }, []);
  const [existingTableImport, setExistingTableImport] = useState<{
    recordId: string;
    messageId: string;
    blockKey: string;
    fileName: string;
    headers: string[];
    rows: Array<Record<string, unknown>>;
    objectId: string;
    mapping: Record<string, string>;
  } | null>(null);
  const [isRunningExistingImport, setIsRunningExistingImport] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const documentsFinderRef = useRef<HTMLDivElement | null>(null);
  const uploadedFileCacheRef = useRef<Map<string, File>>(new Map());

  const normalizedSkillTokens = (selectedAgent?.skills ?? []).map(normalizeCapabilityToken);
  const webCapabilityEnabled =
    Boolean(selectedAgent?.capabilities?.webSearch || selectedAgent?.capabilities?.browser) ||
    normalizedSkillTokens.some((token) =>
      [
        "web",
        "websearch",
        "webextract",
        "browser",
        "browsernavigate",
        "browservision",
      ].includes(token),
    );
  const integrationsCapabilityEnabled =
    Boolean(selectedAgent?.capabilities?.integration) || webCapabilityEnabled;
  const ingestionCapabilityEnabled =
    Boolean(selectedAgent?.capabilities?.ingestion) || normalizedSkillTokens.some((token) => token.includes("import"));
  const workspaceActionCapabilityEnabled = Boolean(selectedAgent?.capabilities?.workspaceActions ?? true);

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
          fileKind:
            typeof typed.fileKind === "string"
              ? (typed.fileKind as DocumentPreview["kind"])
              : undefined,
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

  async function importLegacySessions(agentId: string, signal: AbortSignal) {
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
      if (signal.aborted) {
        break;
      }
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
        signal,
      });
      if (response.ok) {
        imported += 1;
      }
    }
    return imported > 0;
  }

  async function loadConversations(agentId: string, controller: AbortController) {
    setIsSessionsLoading(true);
    setError(null);
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20000);
    const { signal } = controller;
    try {
      const fetchConversations = async () => {
        const response = await fetch(
          `/api/workspaces/${workspaceSlug}/conversations?agentId=${encodeURIComponent(agentId)}&source=workspace_chat`,
          { signal },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          conversations?: Array<{
            id: string;
            title: string;
            source: string;
            runtimeConversationId: string;
            agentPaused?: boolean;
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
        const imported = await importLegacySessions(agentId, signal);
        if (imported) {
          conversationRows = await fetchConversations();
        }
      }

      if (conversationRows.length === 0) {
        const createResponse = await fetch(`/api/workspaces/${workspaceSlug}/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId }),
          signal,
        });
        const createPayload = (await createResponse.json().catch(() => ({}))) as {
          error?: string;
          conversation?: {
            id: string;
            title: string;
            source: string;
            runtimeConversationId: string;
            agentPaused?: boolean;
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
        agentPaused: Boolean(conversation.agentPaused),
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
      const isAbort = caughtError instanceof DOMException && caughtError.name === "AbortError";
      if (isAbort && !timedOut) {
        return;
      }
      const fallback = createSession(userId, agentId);
      setSessions([fallback]);
      setSelectedSessionId(fallback.id);
      const message = isAbort
        ? "El servidor no respondió en 20s. Revisa la conexión o recarga la página."
        : caughtError instanceof Error
          ? caughtError.message
          : "No se pudo cargar el historial de chat.";
      setError(message);
    } finally {
      clearTimeout(timeoutId);
      const externallyAborted = signal.aborted && !timedOut;
      if (!externallyAborted) {
        setIsSessionsLoading(false);
      }
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
    setComposerMode("chat");
    setIsToolsOpen(false);
    const controller = new AbortController();
    void loadConversations(selectedAgentId, controller);
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentId, workspaceSlug, userId]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!toolsMenuRef.current) {
        return;
      }
      if (!toolsMenuRef.current.contains(event.target as Node)) {
        setIsToolsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

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
    setTitleDraft(selectedSessionTitle);
    setIsEditingTitle(false);
  }, [selectedSessionId, selectedSessionTitle]);

  useEffect(() => {
    if (!isEditingTitle || !titleInputRef.current) {
      return;
    }
    titleInputRef.current.focus();
    titleInputRef.current.select();
  }, [isEditingTitle]);

  useEffect(() => {
    if (!askPrompt || !selectedSessionId) {
      return;
    }
    if (selectedSessionMessageCount !== 0 || input.trim()) {
      return;
    }
    setInput(askPrompt);
    if (!searchParams.has("prompt")) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("prompt");
    const nextUrl = nextParams.size ? `${pathname}?${nextParams.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [askPrompt, input, pathname, router, searchParams, selectedSessionId, selectedSessionMessageCount]);

  useEffect(() => {
    if (!chatMessagesRef.current) {
      return;
    }
    chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
  }, [selectedSession?.id, selectedSessionMessageCount]);

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
          agentPaused?: boolean;
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
        agentPaused: Boolean(payload.conversation.agentPaused),
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

  function applyFallbackTitle(sessionId: string, fallbackTitle: string) {
    const trimmed = fallbackTitle.trim();
    if (!trimmed) {
      return;
    }

    let shouldPersist = false;
    updateSession(sessionId, (session) => {
      if (session.title.trim() !== defaultChatSessionTitle) {
        return session;
      }
      shouldPersist = true;
      return {
        ...session,
        title: trimmed,
        updatedAt: new Date().toISOString(),
      };
    });

    if (!shouldPersist) {
      return;
    }

    void fetch(`/api/workspaces/${workspaceSlug}/conversations/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
  }

  async function generateSessionTitle(sessionId: string, fallbackTitle: string) {
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/conversations/${sessionId}/generate-title`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        conversation?: { title?: string };
      };
      if (!response.ok || !payload.conversation?.title) {
        applyFallbackTitle(sessionId, fallbackTitle);
        return;
      }

      const generatedTitle = payload.conversation.title.trim();
      if (!generatedTitle) {
        applyFallbackTitle(sessionId, fallbackTitle);
        return;
      }

      updateSession(sessionId, (session) => ({
        ...session,
        title: generatedTitle,
        updatedAt: new Date().toISOString(),
      }));
    } catch {
      applyFallbackTitle(sessionId, fallbackTitle);
    }
  }

  function startTitleEditing() {
    if (!selectedSession) {
      return;
    }
    setTitleDraft(selectedSession.title);
    setIsEditingTitle(true);
  }

  async function commitTitleEditing() {
    if (!selectedSession) {
      setIsEditingTitle(false);
      return;
    }
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(selectedSession.title);
      setIsEditingTitle(false);
      return;
    }
    await renameSession(selectedSession.id, trimmed);
    setTitleDraft(trimmed);
    setIsEditingTitle(false);
  }

  function cancelTitleEditing() {
    setTitleDraft(selectedSession?.title ?? "");
    setIsEditingTitle(false);
  }

  async function toggleHumanTakeover(nextPaused: boolean) {
    if (!selectedSession || isTogglingTakeover) {
      return;
    }
    const previous = selectedSession.agentPaused;
    updateSession(selectedSession.id, (session) => ({
      ...session,
      agentPaused: nextPaused,
      updatedAt: new Date().toISOString(),
    }));
    setIsTogglingTakeover(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/conversations/${selectedSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentPaused: nextPaused }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        conversation?: { agentPaused?: boolean };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo actualizar el takeover humano.");
      }
      updateSession(selectedSession.id, (session) => ({
        ...session,
        agentPaused: Boolean(payload.conversation?.agentPaused ?? nextPaused),
        updatedAt: new Date().toISOString(),
      }));
    } catch (caughtError) {
      updateSession(selectedSession.id, (session) => ({
        ...session,
        agentPaused: previous,
        updatedAt: new Date().toISOString(),
      }));
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo actualizar el takeover humano.");
    } finally {
      setIsTogglingTakeover(false);
    }
  }

  async function uploadDocument(file: File) {
    if (!selectedSession || !selectedAgent || isUploading) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const fileKind = classifyDocumentFile(file);
      const preview = await buildDocumentPreview(file);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("sessionTitle", selectedSession.title);
      formData.append("conversationId", selectedSession.runtimeConversationId);
      formData.append("workspaceConversationId", selectedSession.id);
      formData.append("agentId", selectedAgent.id);
      formData.append("kind", fileKind);
      if (preview) {
        formData.append("preview", JSON.stringify(preview));
      }

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
        fileKind?: DocumentPreview["kind"];
        preview?: DocumentPreview | null;
      };

      if (!response.ok || !payload.recordId || !payload.documentName || !payload.publicUrl) {
        throw new Error(payload.error ?? "No se pudo subir el documento.");
      }

      const uploadedRecordId = payload.recordId;
      const uploadedDocumentName = payload.documentName;
      const uploadedPublicUrl = payload.publicUrl;
      const resolvedKind = (payload.fileKind ?? fileKind) as DocumentPreview["kind"];
      const resolvedPreview = payload.preview ?? preview ?? undefined;
      const summary = summarizeDocumentPreview(uploadedDocumentName, resolvedPreview, resolvedKind);

      uploadedFileCacheRef.current.set(uploadedRecordId, file);

      const attachmentPayload = {
        id: uploadedRecordId,
        fileName: uploadedDocumentName,
        publicUrl: uploadedPublicUrl,
        contentType: payload.contentType ?? file.type ?? "application/octet-stream",
        fileKind: resolvedKind,
      };

      const actionBlock: DocumentActionBlock = {
        kind: "document_actions",
        recordId: uploadedRecordId,
        fileName: uploadedDocumentName,
        fileKind: resolvedKind,
        summary,
        preview: resolvedPreview ?? undefined,
        actions: buildDocumentActionsForKind(resolvedKind),
        resolutionState: "idle",
      };

      const assistantMessage: ChatMessage = {
        id: `upload-${Date.now()}`,
        role: "assistant",
        content: summary,
        timestamp: currentTimeLabel(),
        blocks: [actionBlock],
        attachments: [attachmentPayload],
      };

      updateSession(selectedSession.id, (session) => ({
        ...session,
        attachments: [attachmentPayload, ...session.attachments.filter((item) => item.id !== uploadedRecordId)],
        messages: [...session.messages, assistantMessage],
        updatedAt: new Date().toISOString(),
      }));

      void fetch(`/api/workspaces/${workspaceSlug}/conversations/${selectedSession.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "assistant",
          content: summary,
          blocks: [actionBlock],
          attachments: [attachmentPayload],
          metadata: {
            uploaded_via: "chat",
            file_kind: resolvedKind,
          },
        }),
      });

      void loadWorkspaceDocuments();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "No se pudo subir el documento.";
      setError(message);
    } finally {
      setIsUploading(false);
      window.setTimeout(() => { if (typeof window !== "undefined") { router.replace(`${window.location.pathname}${window.location.search}`); router.refresh(); } }, 400);
    }
  }

  function openUploadPicker() {
    if (isUploading) {
      return;
    }
    uploadInputRef.current?.click();
  }

  const loadWorkspaceDocuments = useCallback(async () => {
    setIsDocumentsLoading(true);
    try {
      const [docsResponse, foldersResponse] = await Promise.all([
        fetch(`/api/workspaces/${workspaceSlug}/documents?limit=80`),
        fetch(`/api/workspaces/${workspaceSlug}/folders`),
      ]);
      if (docsResponse.ok) {
        const payload = (await docsResponse.json().catch(() => ({}))) as {
          documents?: Array<{
            id: string;
            fileName: string;
            publicUrl: string;
            mimeType: string;
            fileKind: DocumentPreview["kind"];
            preview?: DocumentPreview | null;
            createdAt: string;
          }>;
        };
        setWorkspaceDocuments(
          (payload.documents ?? []).map((entry) => ({
            id: entry.id,
            fileName: entry.fileName,
            publicUrl: entry.publicUrl,
            mimeType: entry.mimeType,
            fileKind: entry.fileKind ?? "other",
            preview: entry.preview ?? undefined,
            createdAt: entry.createdAt,
          })),
        );
      }
      if (foldersResponse.ok) {
        const payload = (await foldersResponse.json().catch(() => ({}))) as {
          folders?: Array<{ id: string; name: string; parentId: string | null; fileCount: number }>;
        };
        setWorkspaceFolders(payload.folders ?? []);
      }
    } catch {
      // Ignore transient errors; finder will simply show what we have.
    } finally {
      setIsDocumentsLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void loadWorkspaceDocuments();
  }, [loadWorkspaceDocuments]);

  useEffect(() => {
    if (!isDocumentsFinderOpen) return;
    function handleClick(event: MouseEvent) {
      if (!documentsFinderRef.current) return;
      if (documentsFinderRef.current.contains(event.target as Node)) return;
      setIsDocumentsFinderOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [isDocumentsFinderOpen]);

  function updateDocumentActionBlock(
    messageId: string,
    recordId: string,
    updater: (block: DocumentActionBlock) => DocumentActionBlock,
  ) {
    if (!selectedSession) return;
    updateSession(selectedSession.id, (session) => ({
      ...session,
      messages: session.messages.map((message) => {
        if (message.id !== messageId) return message;
        return {
          ...message,
          blocks: (message.blocks ?? []).map((block) =>
            block.kind === "document_actions" && block.recordId === recordId ? updater(block) : block,
          ),
        };
      }),
      updatedAt: new Date().toISOString(),
    }));
  }

  async function handleDocumentAction(
    messageId: string,
    block: DocumentActionBlock,
    actionId: DocumentActionId,
  ) {
    if (!selectedSession || !selectedAgent) return;
    if (actionId === "attach-only") {
      updateDocumentActionBlock(messageId, block.recordId, (current) => ({
        ...current,
        resolvedAction: actionId,
        resolutionState: "done",
        resolutionMessage: "Archivo adjuntado. Puedes referenciarlo con @ en cualquier momento.",
      }));
      return;
    }

    if (actionId === "extract") {
      updateDocumentActionBlock(messageId, block.recordId, (current) => ({
        ...current,
        resolvedAction: actionId,
        resolutionState: "working",
        resolutionMessage: "Procesando documento...",
      }));
      try {
        const response = await fetch(
          `/api/workspaces/${workspaceSlug}/documents/${block.recordId}/analyze`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "extract" }) },
        );
        const data = (await response.json().catch(() => ({}))) as { error?: string; summary?: string };
        if (!response.ok) throw new Error(data.error ?? "No se pudo procesar el documento.");
        updateDocumentActionBlock(messageId, block.recordId, (current) => ({
          ...current,
          resolutionState: "done",
          resolutionMessage: data.summary ?? "Extracción en cola.",
        }));
      } catch (caughtError) {
        const messageText = caughtError instanceof Error ? caughtError.message : "No se pudo procesar.";
        updateDocumentActionBlock(messageId, block.recordId, (current) => ({
          ...current,
          resolutionState: "failed",
          resolutionMessage: messageText,
        }));
      }
      return;
    }

    if (actionId === "create-object") {
      updateDocumentActionBlock(messageId, block.recordId, (current) => ({
        ...current,
        resolvedAction: actionId,
        resolutionState: "working",
        resolutionMessage: "Generando propuesta de tabla...",
      }));
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            agentId: selectedAgent.id,
            conversationId: selectedSession.runtimeConversationId,
            message: `Crea una tabla a partir del documento ${block.fileName}.`,
            toolIntent: {
              kind: "create_object_from_document",
              documentRecordId: block.recordId,
            },
          }),
        });
        if (!response.ok || !response.body) {
          const failurePayload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(failurePayload.error ?? "No se pudo generar la propuesta.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let receivedProposal: ChatSchemaProposal | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { remainder, dataLines } = consumeCompleteSseDataLines(buffer);
          buffer = remainder;
          for (const raw of dataLines) {
            if (raw === "[DONE]") continue;
            try {
              const parsed = JSON.parse(raw) as { type: string; proposal?: ChatSchemaProposal };
              if (parsed.type === "schema_proposal" && parsed.proposal) {
                receivedProposal = parsed.proposal;
              }
            } catch {
              // Ignore malformed frames.
            }
          }
        }

        if (!receivedProposal) {
          throw new Error("No recibí una propuesta de esquema.");
        }

        const proposalBlock: ChatMessageBlock = {
          kind: "schema_proposal",
          proposal: receivedProposal,
          documentRecordId: block.recordId,
        };
        updateSession(selectedSession.id, (session) => ({
          ...session,
          messages: [
            ...session.messages,
            {
              id: `proposal-${Date.now()}`,
              role: "assistant",
              content: "Preparé una propuesta de tabla a partir del documento. Revisa columnas y apruébala para crearla y cargar las filas.",
              timestamp: currentTimeLabel(),
              blocks: [proposalBlock],
            },
          ],
          updatedAt: new Date().toISOString(),
        }));
        updateDocumentActionBlock(messageId, block.recordId, (current) => ({
          ...current,
          resolutionState: "done",
          resolutionMessage: "Propuesta lista. Revísala abajo y apruébala.",
        }));
      } catch (caughtError) {
        const messageText = caughtError instanceof Error ? caughtError.message : "No se pudo generar la propuesta.";
        updateDocumentActionBlock(messageId, block.recordId, (current) => ({
          ...current,
          resolutionState: "failed",
          resolutionMessage: messageText,
        }));
      }
      return;
    }

    if (actionId === "import-existing") {
      const sheet = block.preview?.sheets?.[0];
      if (!sheet || sheet.headers.length === 0) {
        updateDocumentActionBlock(messageId, block.recordId, (current) => ({
          ...current,
          resolvedAction: actionId,
          resolutionState: "failed",
          resolutionMessage: "No pude detectar columnas en este archivo.",
        }));
        return;
      }
      const cachedFile = uploadedFileCacheRef.current.get(block.recordId);
      let rows: Array<Record<string, unknown>> = sheet.sampleRows;
      if (cachedFile && sheet.rowCount > sheet.sampleRows.length) {
        try {
          rows = await extractAllSpreadsheetRows(cachedFile, sheet.name);
        } catch {
          rows = sheet.sampleRows;
        }
      }
      const firstObject = objects[0] ?? null;
      const mapping: Record<string, string> = {};
      if (firstObject) {
        const objectFieldList = fields.filter((entry) => entry.objectId === firstObject.id);
        for (const header of sheet.headers) {
          const normalized = header
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, "_")
            .replace(/^_+|_+$/g, "");
          const match = objectFieldList.find((entry) => entry.key === normalized || entry.name.toLowerCase() === header.toLowerCase());
          mapping[header] = match?.key ?? "skip";
        }
      }
      setExistingTableImport({
        recordId: block.recordId,
        messageId,
        blockKey: `${messageId}-${block.recordId}`,
        fileName: block.fileName,
        headers: sheet.headers,
        rows,
        objectId: firstObject?.id ?? "",
        mapping,
      });
      updateDocumentActionBlock(messageId, block.recordId, (current) => ({
        ...current,
        resolvedAction: actionId,
        resolutionState: "working",
        resolutionMessage: "Selecciona la tabla destino y mapea las columnas.",
      }));
    }
  }

  async function commitExistingTableImport() {
    if (!existingTableImport || isRunningExistingImport) return;
    if (!existingTableImport.objectId) {
      setError("Selecciona una tabla destino antes de importar.");
      return;
    }
    const activeMapping = Object.entries(existingTableImport.mapping).filter(([, fieldKey]) => fieldKey && fieldKey !== "skip");
    if (activeMapping.length === 0) {
      setError("Mapea al menos una columna a un campo de la tabla.");
      return;
    }
    setIsRunningExistingImport(true);
    setError(null);
    try {
      const mappedRows = existingTableImport.rows.map((row) =>
        activeMapping.reduce<Record<string, unknown>>((accumulator, [sourceKey, fieldKey]) => {
          accumulator[fieldKey] = row[sourceKey];
          return accumulator;
        }, {}),
      );
      let imported = 0;
      let skipped = 0;
      const BATCH = 500;
      for (let index = 0; index < mappedRows.length; index += BATCH) {
        const batch = mappedRows.slice(index, index + BATCH);
        const response = await fetch(`/api/workspaces/${workspaceSlug}/imports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectId: existingTableImport.objectId,
            rows: batch,
            fileName: existingTableImport.fileName,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          import?: { rowsImported: number; rowsSkipped: number };
        };
        if (!response.ok || !payload.import) {
          throw new Error(payload.error ?? "No se pudo importar el archivo.");
        }
        imported += payload.import.rowsImported;
        skipped += payload.import.rowsSkipped;
      }
      const selectedObject = objects.find((entry) => entry.id === existingTableImport.objectId);
      const doneMessage = `Importados ${imported} registros en ${selectedObject?.name ?? "la tabla"} (${skipped} omitidos).`;
      updateDocumentActionBlock(existingTableImport.messageId, existingTableImport.recordId, (current) => ({
        ...current,
        resolutionState: "done",
        resolutionMessage: doneMessage,
      }));
      setExistingTableImport(null);
      router.refresh();
    } catch (caughtError) {
      const messageText = caughtError instanceof Error ? caughtError.message : "No se pudo importar el archivo.";
      setError(messageText);
      updateDocumentActionBlock(existingTableImport.messageId, existingTableImport.recordId, (current) => ({
        ...current,
        resolutionState: "failed",
        resolutionMessage: messageText,
      }));
    } finally {
      setIsRunningExistingImport(false);
    }
  }

  function enableWebLookupMode() {
    if (!webCapabilityEnabled) {
      setError("Este agente no tiene herramientas web habilitadas.");
      return;
    }
    setError(null);
    setComposerMode((current) => (current === "web" ? "chat" : "web"));
    if (!input.trim()) {
      setInput("Busca en la web y dame un resumen con hallazgos accionables para este workspace.");
    }
  }

  function enableImageSearchMode() {
    setError(null);
    setComposerMode((current) => (current === "image_search" ? "chat" : "image_search"));
  }

  function handleToolPrompt(prompt: string, mode: ChatComposerMode = "chat") {
    setInput(prompt);
    setComposerMode(mode);
    setIsToolsOpen(false);
  }

  function runQuickActionFromTools(
    action:
      | "bootstrap-crm"
      | "bootstrap-dashboard"
      | "scenario-close-import"
      | "scenario-seasonal-analysis"
      | "scenario-quote-approval"
      | "scenario-calendar-scheduling",
    preset?: "operations" | "sales" | "crm" | "custom",
  ) {
    setIsToolsOpen(false);
    void runWorkspaceAction(action, preset);
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

  async function approveSchemaProposal(messageId: string, proposal: ChatSchemaProposal, documentRecordId?: string | null) {
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
        result?: { createdObjects?: Array<{ objectName: string; objectId?: string; fieldCount: number; fieldKeys?: string[] }> };
      };
      if (!response.ok) {
        const fallbackError =
          response.status === 403
            ? "No tienes permisos para aprobar esquemas. Necesitas rol admin."
            : response.status === 400
              ? "La propuesta de esquema es invalida o incompleta."
              : "No se pudo aplicar el esquema.";
        throw new Error(payload.error ?? fallbackError);
      }

      const createdObjects = payload.result?.createdObjects ?? [];
      let summary =
        createdObjects.length > 0
          ? `[Workspace action] Esquema aplicado: ${createdObjects.map((entry) => `${entry.objectName} (${entry.fieldCount} campos)`).join(", ")}.`
          : "[Workspace action] Esquema aplicado correctamente.";

      if (documentRecordId && createdObjects.length > 0 && proposal.objects[0]) {
        try {
          const objectDef = proposal.objects[0];
          const sheetHeaders = objectDef.fields.map((field) => ({ key: field.key, name: field.name }));
          const createdObject = createdObjects[0];
          const createdObjectId = createdObject.objectId ?? null;

          let sourceRows: Array<Record<string, unknown>> = [];
          const cachedFile = uploadedFileCacheRef.current.get(documentRecordId);
          if (cachedFile) {
            sourceRows = await extractAllSpreadsheetRows(cachedFile);
          }
          if (sourceRows.length === 0) {
            const analyzeResponse = await fetch(
              `/api/workspaces/${workspaceSlug}/documents/${documentRecordId}/analyze`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "reparse" }),
              },
            );
            const analyzePayload = (await analyzeResponse.json().catch(() => ({}))) as {
              preview?: { sheets?: Array<{ sampleRows?: Array<Record<string, unknown>> }> };
            };
            const reparsedSheet = analyzePayload.preview?.sheets?.[0];
            if (reparsedSheet?.sampleRows) {
              sourceRows = reparsedSheet.sampleRows;
            }
          }
          if (createdObjectId && sourceRows.length > 0) {
            const mappedRows = sourceRows.map((row) =>
              sheetHeaders.reduce<Record<string, unknown>>((accumulator, header) => {
                accumulator[header.key] = row[header.name];
                return accumulator;
              }, {}),
            );
            const BATCH = 500;
            let imported = 0;
            let skipped = 0;
            for (let index = 0; index < mappedRows.length; index += BATCH) {
              const batch = mappedRows.slice(index, index + BATCH);
              const importResponse = await fetch(`/api/workspaces/${workspaceSlug}/imports`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  objectId: createdObjectId,
                  rows: batch,
                  fileName: `documento-${documentRecordId.slice(0, 8)}.xlsx`,
                }),
              });
              const importPayload = (await importResponse.json().catch(() => ({}))) as {
                error?: string;
                import?: { rowsImported: number; rowsSkipped: number };
              };
              if (importResponse.ok && importPayload.import) {
                imported += importPayload.import.rowsImported;
                skipped += importPayload.import.rowsSkipped;
              }
            }
            summary = `${summary} Se importaron ${imported} registros (${skipped} omitidos).`;
          }
        } catch {
          summary = `${summary} No pude importar los datos automáticamente; usa Importar para hacerlo manualmente.`;
        }
      }

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
      void fetch(`/api/workspaces/${workspaceSlug}/conversations/${selectedSession.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "assistant",
          content: summary,
          metadata: {
            origin: "schema_approval",
            proposalId: proposal.proposalId,
          },
        }),
      });
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
    if (selectedSession.agentPaused) {
      setError("Modo humano activo: desactiva takeover para reanudar respuestas del agente.");
      return;
    }

    setIsLoading(true);
    setError(null);
    const isWebLookup = composerMode === "web";
    const isImageSearch = composerMode === "image_search";
    const userContent = isWebLookup
      ? `[Integrations] ${trimmed}`
      : isImageSearch
        ? `[Image search] ${trimmed}`
        : trimmed;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userContent,
      timestamp: currentTimeLabel(),
    };
    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "Pensando…",
      timestamp: currentTimeLabel(),
      blocks: [],
    };
    const isFirstExchange = selectedSession.messages.length === 0;
    const fallbackTitle = trimmed.slice(0, 36);

    const optimisticMessages = [...selectedSession.messages, userMessage, assistantMessage];
    updateSession(selectedSession.id, (session) => ({
      ...session,
      messages: optimisticMessages,
      updatedAt: new Date().toISOString(),
    }));
    setInput("");
    setComposerMode("chat");
    setIsToolsOpen(false);

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
          toolIntent: isWebLookup
            ? {
                kind: "web_lookup",
                mode: webCapabilityEnabled ? "web" : "none",
                query: trimmed,
              }
            : isImageSearch
              ? {
                  kind: "image_search",
                  mode: "web",
                  query: trimmed,
                }
              : null,
          message: trimmed,
          attachmentRefs: pendingAttachmentRefs.map((entry) => ({ kind: entry.kind, id: entry.id })),
        }),
      });
      const attachmentRefsSnapshot = pendingAttachmentRefs.map((entry) => ({ kind: entry.kind, id: entry.id }));
      const attachmentRecordIds = attachmentRefsSnapshot.filter((e) => e.kind === "record").map((e) => e.id);
      const attachmentFolderIds = attachmentRefsSnapshot.filter((e) => e.kind === "folder").map((e) => e.id);
      void fetch(`/api/workspaces/${workspaceSlug}/conversations/${selectedSession.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          content: userContent,
          metadata: {
            origin: "workspace_chat",
            composer_mode: isWebLookup ? "web" : isImageSearch ? "image_search" : "chat",
            tool_intent: isWebLookup ? "web_lookup" : isImageSearch ? "image_search" : null,
            // New shape: structured refs for records and folders.
            attachment_refs: { records: attachmentRecordIds, folders: attachmentFolderIds },
            // Back-compat: keep legacy flat list of record IDs for older readers.
            attachment_record_ids: attachmentRecordIds,
            attachment_folder_ids: attachmentFolderIds,
          },
        }),
      });
      setPendingAttachmentRefs([]);

      if (!response.ok || !response.body) {
        const failurePayload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(failurePayload.error ?? "No se pudo conectar con el copilot.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let assistantBlocks: ChatMessageBlock[] = [];
      let receivedFirstDelta = false;

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
            proposal?: ChatSchemaProposal | WriteProposalPayload;
            id?: string;
            name?: string;
            toolName?: string;
            confirmToken?: string;
            expiresAt?: string | null;
            result?: {
              ok?: boolean;
              error?: string;
              data?: {
                prompt?: string;
                query?: string;
                mode?: "search" | "generate" | "text2img" | "img2img";
                candidates?: ImagePickerCandidate[];
              };
            };
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
            const isFirstDelta = !receivedFirstDelta;
            receivedFirstDelta = true;
            updateSession(selectedSession.id, (session) => ({
              ...session,
              messages: session.messages.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: isFirstDelta ? deltaPiece : `${message.content}${deltaPiece}`,
                    }
                  : message,
              ),
              updatedAt: new Date().toISOString(),
            }));
          }

          if (payload.type === "schema_proposal" && payload.proposal) {
            const schemaProposal = payload.proposal as ChatSchemaProposal;
            updateSession(selectedSession.id, (session) => ({
              ...session,
              messages: session.messages.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: receivedFirstDelta ? message.content : "",
                      blocks: [
                        ...(message.blocks ?? []),
                        {
                          kind: "schema_proposal" as const,
                          proposal: schemaProposal,
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
                kind: "schema_proposal" as const,
                proposal: schemaProposal,
              },
            ];
          }

          if (
            payload.type === "tool_result" &&
            (payload.name === "images.search" || payload.name === "images.generate") &&
            payload.result?.ok &&
            payload.result.data &&
            Array.isArray(payload.result.data.candidates) &&
            payload.result.data.candidates.length > 0
          ) {
            const toolName = payload.name;
            const data = payload.result.data;
            const candidates: ImagePickerCandidate[] = Array.isArray(data.candidates) ? data.candidates : [];
            const mode: "search" | "generate" = toolName === "images.search" ? "search" : "generate";
            const pickerBlock: ImagePickerBlock = {
              kind: "image_picker",
              mode,
              prompt:
                (typeof data.prompt === "string" && data.prompt) ||
                (typeof data.query === "string" && data.query) ||
                "",
              candidates,
              recordId: null,
              savedPath: null,
              savedUrl: null,
            };
            updateSession(selectedSession.id, (session) => ({
              ...session,
              messages: session.messages.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      blocks: [...(message.blocks ?? []), pickerBlock],
                    }
                  : message,
              ),
              updatedAt: new Date().toISOString(),
            }));
            assistantBlocks = [...assistantBlocks, pickerBlock];
          }

          if (
            payload.type === "write_proposal" &&
            payload.proposal &&
            typeof payload.confirmToken === "string" &&
            (typeof payload.toolName === "string" || typeof payload.name === "string")
          ) {
            const toolName = (payload.toolName ?? payload.name) as string;
            const proposal = payload.proposal as WriteProposalPayload;
            const block: WriteProposalBlock = {
              kind: "write_proposal",
              toolName,
              proposal,
              confirmToken: payload.confirmToken,
              expiresAt: payload.expiresAt ?? null,
              state: "pending",
            };
            updateSession(selectedSession.id, (session) => ({
              ...session,
              messages: session.messages.map((message) =>
                message.id === assistantId
                  ? { ...message, blocks: [...(message.blocks ?? []), block] }
                  : message,
              ),
              updatedAt: new Date().toISOString(),
            }));
            assistantBlocks = [...assistantBlocks, block];
          }

          if (payload.type === "error") {
            throw new Error(payload.error ?? "Error al generar respuesta.");
          }
        }
      }

      if (!assistantContent.trim() && assistantBlocks.length === 0) {
        const fallbackAssistantContent = "No recibi texto del agente. Intenta de nuevo en unos segundos.";
        assistantContent = fallbackAssistantContent;
        updateSession(selectedSession.id, (session) => ({
          ...session,
          messages: session.messages.map((message) =>
            message.id === assistantId ? { ...message, content: fallbackAssistantContent } : message,
          ),
          updatedAt: new Date().toISOString(),
        }));
      }

      void fetch(`/api/workspaces/${workspaceSlug}/conversations/${selectedSession.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "assistant",
          content: assistantContent || "Listo.",
          blocks: assistantBlocks,
          metadata: {
            origin: "workspace_chat",
          },
        }),
      });
      if (isFirstExchange) {
        void generateSessionTitle(selectedSession.id, fallbackTitle);
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
        setActionFeedback(`[Workspace action] Escenario en cola. Task creada: ${data.task?.id?.slice(0, 8) ?? "n/a"}…`);
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
          ? "[Workspace action] CRM inicial creado. Recarga el workspace para ver tablas, vistas y datos base."
          : "[Workspace action] Dashboard inicial creado. Regresa a Home para ver las nuevas tarjetas.",
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
      setActionFeedback(`[Workspace action] ${selectedAgent.name} ahora es el CEO principal del workspace.`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo definir el CEO principal.");
    }
  }

  return (
    <div style={chatWorkspaceShellStyle}>
      <header style={chatWorkspaceHeaderStyle}>
        <p style={eyebrowStyle}>Chat</p>
        <div>
          <h2 style={panelTitleStyle}>Chat con agentes</h2>
          <p style={panelDescriptionStyle}>Conversaciones separadas por usuario, con CEO principal por defecto.</p>
        </div>
      </header>
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
                  <div style={chatTitleRowStyle}>
                    {isEditingTitle ? (
                      <input
                        ref={titleInputRef}
                        value={titleDraft}
                        onChange={(event) => setTitleDraft(event.target.value)}
                        onBlur={() => void commitTitleEditing()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void commitTitleEditing();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelTitleEditing();
                          }
                        }}
                        style={chatInlineTitleInputStyle}
                        aria-label="Renombrar conversación actual"
                      />
                    ) : (
                      <h3 style={chatTitleStyle}>{selectedSession?.title ?? "Nuevo chat"}</h3>
                    )}
                    <button
                      type="button"
                      style={chatTitleEditButtonStyle}
                      onMouseDown={(event) => {
                        if (isEditingTitle) {
                          event.preventDefault();
                        }
                      }}
                      onClick={() => {
                        if (isEditingTitle) {
                          void commitTitleEditing();
                          return;
                        }
                        startTitleEditing();
                      }}
                      disabled={!selectedSession}
                      aria-label={isEditingTitle ? "Guardar título de conversación" : "Editar título de conversación"}
                    >
                      {isEditingTitle ? "OK" : <Pencil size={14} />}
                    </button>
                  </div>
                </div>
                <div style={chatSessionMetaRowStyle}>
                  <StatusPill tone={selectedAgent.type === "copilot" ? "active" : "neutral"}>
                    {selectedAgent.type === "copilot"
                      ? selectedAgent.isPrimaryCopilot
                        ? "CEO principal"
                        : "Copilot"
                      : selectedAgent.type === "channel"
                        ? "Canal"
                        : "Worker"}
                  </StatusPill>
                  {selectedSession?.agentPaused ? <StatusPill tone="warning">Humano al mando</StatusPill> : null}
                  <div ref={documentsFinderRef} style={{ position: "relative" }}>
                    <button
                      type="button"
                      style={documentsFinderTriggerStyle}
                      onClick={() => {
                        setIsDocumentsFinderOpen((current) => !current);
                        if (!isDocumentsFinderOpen) {
                          void loadWorkspaceDocuments();
                        }
                      }}
                      aria-label="Abrir buscador de documentos"
                    >
                      <FileStack size={12} />
                      <span>Documentos</span>
                    </button>
                    {isDocumentsFinderOpen ? (
                      <div style={documentsFinderPopoverStyle}>
                        <input
                          type="search"
                          value={documentsFinderQuery}
                          onChange={(event) => setDocumentsFinderQuery(event.target.value)}
                          placeholder="Buscar documento..."
                          style={documentsFinderSearchStyle}
                          autoFocus
                        />
                        <div style={documentsFinderListStyle}>
                          {(() => {
                            const query = documentsFinderQuery.trim().toLowerCase();
                            const attachmentIds = new Set(
                              (selectedSession?.attachments ?? []).map((entry) => entry.id),
                            );
                            const pendingFolderIds = new Set(
                              pendingAttachmentRefs
                                .filter((entry) => entry.kind === "folder")
                                .map((entry) => entry.id),
                            );
                            const sessionDocs = workspaceDocuments.filter((doc) => attachmentIds.has(doc.id));
                            const otherDocs = workspaceDocuments.filter((doc) => !attachmentIds.has(doc.id));
                            const matches = (doc: typeof workspaceDocuments[number]) =>
                              !query || doc.fileName.toLowerCase().includes(query);
                            const sessionVisible = sessionDocs.filter(matches);
                            const otherVisible = otherDocs.filter(matches);
                            const folderVisible = workspaceFolders
                              .filter((folder) => !pendingFolderIds.has(folder.id))
                              .filter((folder) => !query || folder.name.toLowerCase().includes(query));
                            const renderRow = (doc: typeof workspaceDocuments[number]) => (
                              <button
                                key={doc.id}
                                type="button"
                                style={documentsFinderRowStyle}
                                onClick={() => {
                                  addPendingRecordRef(doc.id);
                                  setIsDocumentsFinderOpen(false);
                                }}
                                title={doc.fileName}
                              >
                                <FileStack size={14} />
                                <span style={documentsFinderRowNameStyle}>{doc.fileName}</span>
                                <span style={documentsFinderRowMetaStyle}>
                                  {doc.fileKind === "spreadsheet"
                                    ? "Hoja"
                                    : doc.fileKind === "pdf"
                                      ? "PDF"
                                      : doc.fileKind === "image"
                                        ? "Imagen"
                                        : "Doc"}
                                </span>
                              </button>
                            );
                            const renderFolderRow = (folder: typeof workspaceFolders[number]) => (
                              <button
                                key={`folder:${folder.id}`}
                                type="button"
                                style={documentsFinderRowStyle}
                                onClick={() => {
                                  addPendingFolderRef({
                                    id: folder.id,
                                    name: folder.name,
                                    fileCount: folder.fileCount,
                                  });
                                  setIsDocumentsFinderOpen(false);
                                }}
                                title={folder.name}
                              >
                                <span aria-hidden>📁</span>
                                <span style={documentsFinderRowNameStyle}>{folder.name}</span>
                                <span style={documentsFinderRowMetaStyle}>
                                  {folder.fileCount} {folder.fileCount === 1 ? "archivo" : "archivos"}
                                </span>
                              </button>
                            );
                            if (
                              isDocumentsLoading
                              && workspaceDocuments.length === 0
                              && workspaceFolders.length === 0
                            ) {
                              return (
                                <p style={{ margin: 0, padding: 12, fontSize: 12, color: "var(--workspace-muted)" }}>
                                  Cargando documentos...
                                </p>
                              );
                            }
                            if (workspaceDocuments.length === 0 && workspaceFolders.length === 0) {
                              return (
                                <p style={{ margin: 0, padding: 12, fontSize: 12, color: "var(--workspace-muted)" }}>
                                  Aún no hay documentos en este workspace.
                                </p>
                              );
                            }
                            return (
                              <>
                                {folderVisible.length > 0 ? (
                                  <>
                                    <p style={documentsFinderSectionTitleStyle}>Carpetas</p>
                                    {folderVisible.map(renderFolderRow)}
                                  </>
                                ) : null}
                                {sessionVisible.length > 0 ? (
                                  <>
                                    <p style={documentsFinderSectionTitleStyle}>En este chat</p>
                                    {sessionVisible.map(renderRow)}
                                  </>
                                ) : null}
                                {otherVisible.length > 0 ? (
                                  <>
                                    <p style={documentsFinderSectionTitleStyle}>Workspace</p>
                                    {otherVisible.map(renderRow)}
                                  </>
                                ) : null}
                                {sessionVisible.length === 0
                                && otherVisible.length === 0
                                && folderVisible.length === 0 ? (
                                  <p style={{ margin: 0, padding: 12, fontSize: 12, color: "var(--workspace-muted)" }}>
                                    Ningún documento coincide con tu búsqueda.
                                  </p>
                                ) : null}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {SHOW_HUMAN_TAKEOVER_BUTTON ? (
                <div style={chatTakeoverRowStyle}>
                  <button
                    type="button"
                    style={chatActionButtonStyle}
                    onClick={() => void toggleHumanTakeover(!(selectedSession?.agentPaused ?? false))}
                    disabled={!selectedSession || isTogglingTakeover}
                  >
                    {isTogglingTakeover
                      ? "Actualizando..."
                      : selectedSession?.agentPaused
                        ? "Reanudar agente"
                        : "Tomar control humano"}
                  </button>
                </div>
              ) : null}

              <div ref={chatMessagesRef} className="workspace-chat-messages" style={chatMessagesStyle}>
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
                      {message.role === "assistant" ? (
                        <div style={assistantMessageContentStyle}>
                          {renderAssistantMessageContent(message.content || "...")}
                        </div>
                      ) : (
                        <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{message.content || "..."}</p>
                      )}
                      {Array.isArray(message.attachments) && message.attachments.length > 0 ? (
                        <div style={chatAttachmentPillRowStyle}>
                          {(message.attachments as Array<{ id?: string; fileName?: string; publicUrl?: string; fileKind?: DocumentPreview["kind"] }>).map((attachment, index) => {
                            const attachmentId = typeof attachment?.id === "string" ? attachment.id : `${message.id}-att-${index}`;
                            const fileName = typeof attachment?.fileName === "string" ? attachment.fileName : "Archivo";
                            return (
                              <button
                                key={attachmentId}
                                type="button"
                                style={chatAttachmentPillStyle}
                                onClick={() => {
                                  setDocumentsFinderQuery(fileName);
                                  setIsDocumentsFinderOpen(true);
                                }}
                                title={fileName}
                              >
                                <FileStack size={12} />
                                <span style={chatAttachmentPillLabelStyle}>{fileName}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                      {message.blocks?.map((block, blockIndex) => {
                        if (block.kind === "document_actions") {
                          const firstSheet = block.preview?.sheets?.[0];
                          const sheetHeaders = firstSheet?.headers ?? [];
                          const headerCount = sheetHeaders.length;
                          const sheetRowCount = firstSheet?.rowCount ?? 0;
                          const kindLabel =
                            block.fileKind === "spreadsheet"
                              ? "Hoja de cálculo"
                              : block.fileKind === "pdf"
                                ? "PDF"
                                : block.fileKind === "image"
                                  ? "Imagen"
                                  : "Documento";
                          return (
                            <div
                              key={`${message.id}-doc-${block.recordId}-${blockIndex}`}
                              style={documentActionsCardStyle}
                            >
                              <div style={documentActionsHeaderStyle}>
                                <div style={documentActionsFileStyle}>
                                  <FileStack size={14} />
                                  <span style={documentActionsFileNameStyle} title={block.fileName}>
                                    {block.fileName}
                                  </span>
                                </div>
                                <span style={documentActionsKindStyle}>{kindLabel}</span>
                              </div>

                              {block.fileKind === "spreadsheet" && headerCount > 0 ? (
                                <div style={documentActionsStatsRowStyle}>
                                  <span>
                                    <strong>{headerCount}</strong> columna{headerCount === 1 ? "" : "s"}
                                  </span>
                                  <span style={documentActionsDotStyle} />
                                  <span>
                                    <strong>{sheetRowCount}</strong> fila{sheetRowCount === 1 ? "" : "s"}
                                  </span>
                                  {firstSheet?.name ? (
                                    <>
                                      <span style={documentActionsDotStyle} />
                                      <span>hoja &quot;{firstSheet.name}&quot;</span>
                                    </>
                                  ) : null}
                                </div>
                              ) : null}

                              {block.fileKind === "spreadsheet" && headerCount > 0 ? (
                                <div style={documentActionsColumnsBlockStyle}>
                                  <p style={documentActionsColumnsLabelStyle}>Columnas detectadas</p>
                                  <div style={documentActionsColumnsRowStyle}>
                                    {sheetHeaders.slice(0, 12).map((header) => (
                                      <span key={header} style={documentActionsColumnChipStyle} title={header}>
                                        {header}
                                      </span>
                                    ))}
                                    {headerCount > 12 ? (
                                      <span style={documentActionsMoreLabelStyle}>+{headerCount - 12} más</span>
                                    ) : null}
                                  </div>
                                </div>
                              ) : (
                                <p style={{ margin: 0, fontSize: 13, color: "var(--workspace-text)" }}>
                                  {block.summary}
                                </p>
                              )}

                              <div style={documentActionsButtonsRowStyle}>
                                {block.actions.map((action) => {
                                  const isWorking = block.resolutionState === "working" && block.resolvedAction === action.id;
                                  const isDone = block.resolutionState === "done" && block.resolvedAction === action.id;
                                  return (
                                    <button
                                      key={action.id}
                                      type="button"
                                      style={{
                                        ...chatActionButtonStyle,
                                        opacity: block.resolutionState === "working" && !isWorking ? 0.55 : 1,
                                      }}
                                      disabled={block.resolutionState === "working" && !isWorking}
                                      onClick={() => void handleDocumentAction(message.id, block, action.id)}
                                    >
                                      {isWorking ? "Procesando..." : isDone ? `✓ ${action.label}` : action.label}
                                    </button>
                                  );
                                })}
                              </div>
                              {block.resolutionMessage ? (
                                <p style={{ margin: 0, fontSize: 12, color: block.resolutionState === "failed" ? "#b42318" : "var(--workspace-muted)" }}>
                                  {block.resolutionMessage}
                                </p>
                              ) : null}
                            </div>
                          );
                        }
                        if (block.kind === "image_picker") {
                          return (
                            <div
                              key={`${message.id}-images-${blockIndex}`}
                              style={{ marginTop: 12 }}
                            >
                              <ImagePickerCard
                                workspaceSlug={workspaceSlug}
                                mode={block.mode}
                                prompt={block.prompt}
                                candidates={block.candidates}
                                recordId={block.recordId ?? undefined}
                                conversationId={selectedSession.runtimeConversationId}
                                onSaved={(result) => {
                                  updateSession(selectedSession.id, (session) => ({
                                    ...session,
                                    messages: session.messages.map((entry) =>
                                      entry.id === message.id
                                        ? {
                                            ...entry,
                                            blocks: (entry.blocks ?? []).map((existing, existingIndex) =>
                                              existingIndex === blockIndex && existing.kind === "image_picker"
                                                ? {
                                                    ...existing,
                                                    savedPath: result.path ?? null,
                                                    savedUrl: result.signedUrl ?? result.publicUrl ?? null,
                                                  }
                                                : existing,
                                            ),
                                          }
                                        : entry,
                                    ),
                                    updatedAt: new Date().toISOString(),
                                  }));
                                }}
                              />
                            </div>
                          );
                        }
                        if (block.kind === "write_proposal") {
                          const targetMessageId = message.id;
                          const targetBlockIndex = blockIndex;
                          const markState = (nextState: WriteProposalBlock["state"]) => {
                            updateSession(selectedSession.id, (session) => ({
                              ...session,
                              messages: session.messages.map((entry) =>
                                entry.id === targetMessageId
                                  ? {
                                      ...entry,
                                      blocks: (entry.blocks ?? []).map((existing, existingIndex) =>
                                        existingIndex === targetBlockIndex && existing.kind === "write_proposal"
                                          ? { ...existing, state: nextState }
                                          : existing,
                                      ),
                                    }
                                  : entry,
                              ),
                              updatedAt: new Date().toISOString(),
                            }));
                          };
                          const submitFollowUp = (text: string) => {
                            setInput(text);
                            requestAnimationFrame(() => {
                              void sendMessage();
                            });
                          };
                          return (
                            <div key={`${message.id}-write-${blockIndex}`}>
                              <WriteProposalCard
                                toolName={block.toolName}
                                proposal={block.proposal}
                                confirmToken={block.confirmToken}
                                expiresAt={block.expiresAt ?? null}
                                state={block.state}
                                onConfirm={(text) => {
                                  markState("confirmed");
                                  submitFollowUp(text);
                                }}
                                onCancel={(text) => {
                                  markState("cancelled");
                                  submitFollowUp(text);
                                }}
                              />
                            </div>
                          );
                        }
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
                                onClick={() => void approveSchemaProposal(message.id, block.proposal, block.documentRecordId ?? null)}
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

                    <div style={chatModeHintRowStyle}>
                      <span style={chatModeChipStyle}>Ingest data {ingestionCapabilityEnabled ? "✓" : "•"}</span>
                      <span style={chatModeChipStyle}>Integrations {integrationsCapabilityEnabled ? "✓" : "pendiente"}</span>
                      <span style={chatModeChipStyle}>Workspace actions {workspaceActionCapabilityEnabled ? "✓" : "•"}</span>
                    </div>
                    <p style={chatEmptyCopyStyle}>
                      Usa el chat para tres frentes: ingestar datos (docs/sheets), ejecutar acciones del workspace y, cuando el agente lo permita, correr integraciones externas.
                    </p>

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


              <div style={workspaceChatComposerColumnStyle}>
                <div style={workspaceChatComposerShellStyle}>
                  <div style={workspaceChatComposerModesRowStyle}>
                    <button
                      type="button"
                      style={composerMode === "chat" ? workspaceChatModeButtonActiveStyle : workspaceChatModeButtonStyle}
                      onClick={() => setComposerMode("chat")}
                    >
                      Workspace actions
                    </button>
                    <button
                      type="button"
                      style={composerMode === "web" ? workspaceChatModeButtonActiveStyle : workspaceChatModeButtonStyle}
                      onClick={enableWebLookupMode}
                      disabled={!webCapabilityEnabled}
                      title={
                        webCapabilityEnabled
                          ? "Modo integraciones web"
                          : "Este agente no tiene web/browser habilitado"
                      }
                    >
                      Integrations
                    </button>
                    <button
                      type="button"
                      style={workspaceChatModeButtonStyle}
                      onClick={() =>
                        handleToolPrompt(
                          "Subi un documento y ayudame a validarlo, estructurarlo y vincularlo al record correcto.",
                          "chat",
                        )
                      }
                    >
                      Ingest data
                    </button>
                  </div>
                  {pendingAttachmentRefs.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                      {pendingAttachmentRefs.map((ref) => {
                        let label: string;
                        let prefix: string;
                        if (ref.kind === "folder") {
                          label = `${ref.name} (${ref.fileCount} archivos)`;
                          prefix = "📁 ";
                        } else {
                          const doc = workspaceDocuments.find((entry) => entry.id === ref.id);
                          label = doc?.fileName ?? ref.id.slice(0, 8);
                          prefix = "@";
                        }
                        const key = `${ref.kind}:${ref.id}`;
                        return (
                          <span
                            key={key}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 8px",
                              borderRadius: 999,
                              background: "rgba(51, 92, 255, 0.12)",
                              border: "1px solid rgba(51, 92, 255, 0.22)",
                              color: "var(--workspace-text)",
                              fontSize: 12,
                            }}
                            title={`Referenciado: ${label}`}
                          >
                            {prefix}{label}
                            <button
                              type="button"
                              onClick={() =>
                                removePendingRef((entry) => entry.kind === ref.kind && entry.id === ref.id)
                              }
                              aria-label="Quitar referencia"
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                fontSize: 12,
                                lineHeight: 1,
                                padding: "0 2px",
                              }}
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                  <div style={workspaceChatTextareaRowStyle}>
                    <textarea
                      ref={composerTextareaRef}
                      value={input}
                      onChange={(event) => {
                        const value = event.target.value;
                        setInput(value);
                        const cursor = event.target.selectionStart ?? value.length;
                        const before = value.slice(0, cursor);
                        const atIndex = before.lastIndexOf("@");
                        if (atIndex >= 0) {
                          const precedingChar = atIndex === 0 ? "" : before.charAt(atIndex - 1);
                          const fragment = before.slice(atIndex + 1);
                          const hasWhitespace = /\s/.test(fragment);
                          if (!hasWhitespace && (precedingChar === "" || /\s/.test(precedingChar))) {
                            setMentionPickerState({ open: true, query: fragment, triggerIndex: atIndex });
                            if (workspaceDocuments.length === 0) {
                              void loadWorkspaceDocuments();
                            }
                            return;
                          }
                        }
                        if (mentionPickerState.open) {
                          setMentionPickerState({ open: false, query: "", triggerIndex: -1 });
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape" && mentionPickerState.open) {
                          event.preventDefault();
                          setMentionPickerState({ open: false, query: "", triggerIndex: -1 });
                          return;
                        }
                        if (event.key !== "Enter") {
                          return;
                        }
                        if (event.shiftKey) {
                          return;
                        }
                        if (mentionPickerState.open) {
                          return;
                        }
                        event.preventDefault();
                        void sendMessage();
                      }}
                      placeholder={
                        composerMode === "web"
                          ? `Consulta web para ${selectedAgent.name} (integrations)...`
                          : composerMode === "image_search"
                            ? `Describe la imagen que buscas (ej. "2025 Ford Bronco Sport Outer Banks press photo")...`
                            : `Escribe una pregunta para ${selectedAgent.name} (usa @ para referenciar documentos)...`
                      }
                      rows={2}
                      style={workspaceChatTextareaCompactStyle}
                    />
                    {mentionPickerState.open ? (
                      <div
                        style={{
                          position: "absolute",
                          bottom: "calc(100% + 6px)",
                          left: 0,
                          width: "min(420px, 96%)",
                          maxHeight: 260,
                          overflow: "auto",
                          background: "var(--workspace-panel)",
                          border: "1px solid var(--workspace-border)",
                          borderRadius: 12,
                          padding: 6,
                          boxShadow: "0 12px 28px rgba(15, 23, 42, 0.14)",
                          zIndex: 80,
                        }}
                      >
                        {(() => {
                          const q = mentionPickerState.query.toLowerCase();
                          const matches = workspaceDocuments
                            .filter((doc) => !q || doc.fileName.toLowerCase().includes(q))
                            .slice(0, 8);
                          if (matches.length === 0) {
                            return (
                              <p style={{ margin: 0, padding: 10, fontSize: 12, color: "var(--workspace-muted)" }}>
                                {isDocumentsLoading ? "Cargando documentos..." : "Sin coincidencias."}
                              </p>
                            );
                          }
                          return matches.map((doc) => (
                            <button
                              key={doc.id}
                              type="button"
                              style={documentsFinderRowStyle}
                              onClick={() => {
                                const trigger = mentionPickerState.triggerIndex;
                                if (trigger < 0) return;
                                const before = input.slice(0, trigger);
                                const afterCursor = input.slice(
                                  composerTextareaRef.current?.selectionStart ?? input.length,
                                );
                                const token = `@${doc.fileName} `;
                                const nextValue = `${before}${token}${afterCursor}`;
                                setInput(nextValue);
                                addPendingRecordRef(doc.id);
                                setMentionPickerState({ open: false, query: "", triggerIndex: -1 });
                                window.requestAnimationFrame(() => {
                                  const textarea = composerTextareaRef.current;
                                  if (textarea) {
                                    const caret = before.length + token.length;
                                    textarea.focus();
                                    textarea.setSelectionRange(caret, caret);
                                  }
                                });
                              }}
                            >
                              <FileStack size={14} />
                              <span style={documentsFinderRowNameStyle}>{doc.fileName}</span>
                              <span style={documentsFinderRowMetaStyle}>
                                {doc.fileKind === "spreadsheet"
                                  ? "Hoja"
                                  : doc.fileKind === "pdf"
                                    ? "PDF"
                                    : doc.fileKind === "image"
                                      ? "Imagen"
                                      : "Doc"}
                              </span>
                            </button>
                          ));
                        })()}
                      </div>
                    ) : null}
                  </div>
                  <div style={workspaceChatBottomRowStyle}>
                    <div ref={toolsMenuRef} style={workspaceChatToolsLeftStyle}>
                      <button
                        type="button"
                        style={{
                          ...homeToolButtonIconStyle,
                          opacity: isUploading ? 0.62 : 1,
                          cursor: isUploading ? "wait" : "pointer",
                        }}
                        onClick={openUploadPicker}
                        aria-label={isUploading ? "Subiendo documento" : "Subir documento"}
                      >
                        {isUploading ? <LoaderCircle size={14} className="workspace-spin" /> : <Plus size={14} />}
                      </button>
                      <button
                        type="button"
                        style={
                          composerMode === "image_search"
                            ? { ...homeToolButtonIconStyle, background: "rgba(51, 92, 255, 0.18)", borderColor: "rgba(51, 92, 255, 0.45)" }
                            : homeToolButtonIconStyle
                        }
                        aria-label={
                          composerMode === "image_search"
                            ? "Salir de búsqueda de imágenes"
                            : "Buscar imágenes en la web (SerpAPI)"
                        }
                        onClick={enableImageSearchMode}
                        title={
                          composerMode === "image_search"
                            ? "Búsqueda de imágenes activa — escribe qué buscar y envía"
                            : "Buscar imágenes en la web (SerpAPI)"
                        }
                      >
                        <Globe size={14} />
                      </button>
                      <button type="button" style={chatToolButtonLabelStyle} onClick={() => setIsToolsOpen((current) => !current)}>
                        Tools
                      </button>
                      {isToolsOpen ? (
                        <div style={chatToolsPopoverStyle}>
                          <p style={chatToolsSectionTitleStyle}>Tools de {selectedAgent.name}</p>
                          <div style={chatToolsTokenWrapStyle}>
                            {(selectedAgent.skills ?? []).length > 0 ? (
                              selectedAgent.skills.map((skill) => (
                                <span key={skill} style={chatToolsTokenStyle}>
                                  {skill}
                                </span>
                              ))
                            ) : (
                              <span style={chatToolsMutedCopyStyle}>Sin tools declarados en este agente.</span>
                            )}
                          </div>
                          <p style={chatToolsSectionTitleStyle}>Acciones rápidas</p>
                          <div style={chatToolsActionListStyle}>
                            <button
                              type="button"
                              style={chatToolsActionButtonStyle}
                              onClick={() =>
                                handleToolPrompt(
                                  "Crea un lead en Deals con solo el nombre y dime que datos opcionales faltan.",
                                  "chat",
                                )
                              }
                            >
                              Insertar prompt: crear lead
                            </button>
                            <button
                              type="button"
                              style={chatToolsActionButtonStyle}
                              onClick={() =>
                                handleToolPrompt(
                                  "Busca en la web cambios recientes de mi industria y resume riesgos y oportunidades para esta semana.",
                                  "web",
                                )
                              }
                              disabled={!webCapabilityEnabled}
                            >
                              Insertar prompt web
                            </button>
                            <button
                              type="button"
                              style={chatToolsActionButtonStyle}
                              onClick={() => runQuickActionFromTools("bootstrap-crm")}
                            >
                              Ejecutar: crear CRM base
                            </button>
                            <button
                              type="button"
                              style={chatToolsActionButtonStyle}
                              onClick={() => runQuickActionFromTools("scenario-close-import")}
                            >
                              Ejecutar: escenario close import
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div style={workspaceChatComposerFooterRightStyle}>
                      <button type="button" style={chatToolButtonDisabledStyle} disabled aria-label="Micrófono (próximamente)">
                        <Mic size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={sendMessage}
                        disabled={isLoading || !input.trim()}
                        style={{
                          ...homeChatButtonStyle,
                          opacity: isLoading || !input.trim() ? 0.62 : 1,
                          cursor: isLoading || !input.trim() ? "not-allowed" : "pointer",
                        }}
                        aria-label="Enviar mensaje"
                      >
                        {isLoading ? <LoaderCircle size={14} className="workspace-spin" /> : <ArrowUp size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
                <input
                  ref={uploadInputRef}
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
                {actionFeedback ? <p style={inlineSuccessStyle}>{actionFeedback}</p> : null}
                {error ? <p style={chatErrorStyle}>{error}</p> : null}
              </div>
            </div>
          </div>
        )}
      {existingTableImport ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 120,
          }}
          onClick={() => {
            if (!isRunningExistingImport) setExistingTableImport(null);
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(640px, 94vw)",
              maxHeight: "86vh",
              background: "var(--workspace-panel)",
              borderRadius: 16,
              border: "1px solid var(--workspace-border)",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              overflow: "auto",
            }}
          >
            <div>
              <p style={eyebrowStyle}>Importar documento</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 20 }}>{existingTableImport.fileName}</h3>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--workspace-muted)" }}>
                Selecciona la tabla destino y mapea cada columna del archivo.
              </p>
            </div>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--workspace-muted)" }}>Tabla destino</span>
              <select
                value={existingTableImport.objectId}
                onChange={(event) =>
                  setExistingTableImport((current) => {
                    if (!current) return current;
                    const nextObjectId = event.target.value;
                    const objectFieldList = fields.filter((entry) => entry.objectId === nextObjectId);
                    const nextMapping: Record<string, string> = {};
                    for (const header of current.headers) {
                      const normalized = header
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9_]+/g, "_")
                        .replace(/^_+|_+$/g, "");
                      const match = objectFieldList.find(
                        (entry) => entry.key === normalized || entry.name.toLowerCase() === header.toLowerCase(),
                      );
                      nextMapping[header] = match?.key ?? "skip";
                    }
                    return { ...current, objectId: nextObjectId, mapping: nextMapping };
                  })
                }
                style={chatRenameInputStyle}
              >
                <option value="">Selecciona una tabla</option>
                {objects.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "grid", gap: 6 }}>
              <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>Mapeo de columnas</p>
              <div style={{ display: "grid", gap: 6, maxHeight: 260, overflow: "auto" }}>
                {existingTableImport.headers.map((header) => {
                  const objectFieldList = fields.filter((entry) => entry.objectId === existingTableImport.objectId);
                  return (
                    <div
                      key={header}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{header}</span>
                      <select
                        value={existingTableImport.mapping[header] ?? "skip"}
                        onChange={(event) =>
                          setExistingTableImport((current) =>
                            current
                              ? {
                                  ...current,
                                  mapping: { ...current.mapping, [header]: event.target.value },
                                }
                              : current,
                          )
                        }
                        style={chatRenameInputStyle}
                      >
                        <option value="skip">Omitir columna</option>
                        {objectFieldList.map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.name} ({field.type})
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>
              Filas detectadas: {existingTableImport.rows.length}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                style={chatActionButtonStyle}
                disabled={isRunningExistingImport}
                onClick={() => setExistingTableImport(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                style={chatActionButtonStyle}
                disabled={isRunningExistingImport || !existingTableImport.objectId}
                onClick={() => void commitExistingTableImport()}
              >
                {isRunningExistingImport ? "Importando..." : "Importar filas"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// BaseDataPanel has been moved to components/workspace/data/DataPanel.tsx.
// Re-exported below so existing imports of DatasetPanel / DataPanel keep working.
export { DataPanel } from "@/components/workspace/data/DataPanel";

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
export { DataPanel as DatasetPanel } from "@/components/workspace/data/DataPanel";
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
  border: "1px solid var(--workspace-border)",
  borderRadius: 24,
  background: "var(--workspace-surface)",
  padding: 22,
  boxShadow: "var(--workspace-shadow)",
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
  background: "var(--workspace-well)",
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
  display: "flex",
  flexDirection: "column",
  gap: 16,
  minHeight: 460,
  height: "calc(100dvh - 160px)",
  maxHeight: "calc(100dvh - 120px)",
};

const teamChatHeaderMetaStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--workspace-muted)",
  fontSize: 13,
};

const teamChatMessageListStyle: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-well)",
  padding: "16px",
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
  borderRadius: 20,
  background: "var(--workspace-surface)",
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
  border: "1px solid var(--workspace-border)",
  borderRadius: 28,
  background: "var(--workspace-surface)",
  boxShadow: "var(--workspace-shadow)",
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
  border: "1px solid var(--workspace-border)",
  borderRadius: 30,
  background: "var(--workspace-surface)",
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

const workspaceChatTextareaRowStyle: React.CSSProperties = {
  display: "block",
  position: "relative",
};

const workspaceChatComposerFooterRightStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

/** ChatPanel-only: tighter composer chrome than `homeChatComposerStyle` (home page unchanged). */
const workspaceChatComposerColumnStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const workspaceChatComposerShellStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  borderRadius: 22,
  background: "var(--workspace-surface)",
  padding: "6px 10px",
  display: "grid",
  gap: 6,
};

const workspaceChatComposerModesRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const workspaceChatModeButtonStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  color: "var(--workspace-muted)",
  fontSize: 11,
  fontWeight: 600,
  padding: "4px 8px",
  cursor: "pointer",
};

const workspaceChatModeButtonActiveStyle: React.CSSProperties = {
  ...workspaceChatModeButtonStyle,
  color: "var(--workspace-text)",
  borderColor: "var(--workspace-accent-strong)",
  background: "var(--workspace-accent-soft)",
};

const homeChatBottomRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const workspaceChatBottomRowStyle: React.CSSProperties = {
  ...homeChatBottomRowStyle,
  gap: 6,
};

const homeChatToolsLeftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  position: "relative",
};

const workspaceChatToolsLeftStyle: React.CSSProperties = {
  ...homeChatToolsLeftStyle,
  gap: 6,
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
  border: "1px solid var(--workspace-border-strong)",
  background: "var(--workspace-surface)",
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
  border: "1px solid var(--workspace-border)",
  borderRadius: 18,
  background: "var(--workspace-surface)",
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

const chatWorkspaceShellStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  minWidth: 0,
};

const chatWorkspaceHeaderStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const chatSidebarStyle: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  boxShadow: "var(--workspace-shadow)",
  padding: 16,
  display: "grid",
  gap: 14,
  alignContent: "start",
  minHeight: 460,
  height: "calc(100dvh - 160px)",
  maxHeight: "calc(100dvh - 120px)",
  overflowY: "auto",
  overscrollBehavior: "contain",
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

const chatTakeoverRowStyle: React.CSSProperties = {
  ...chatRenameRowStyle,
  justifyContent: "flex-end",
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

const chatAttachmentPillRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 8,
};

const chatAttachmentPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid rgba(15, 23, 42, 0.12)",
  background: "rgba(255, 255, 255, 0.72)",
  color: "var(--workspace-text)",
  fontSize: 12,
  cursor: "pointer",
  maxWidth: 220,
};

const chatAttachmentPillLabelStyle: React.CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 180,
};

const documentActionsCardStyle: React.CSSProperties = {
  marginTop: 12,
  border: "1px solid rgba(15, 23, 42, 0.1)",
  borderRadius: 14,
  background: "#ffffff",
  padding: 14,
  display: "grid",
  gap: 12,
  boxShadow: "0 1px 0 rgba(15, 23, 42, 0.04)",
};

const documentActionsHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const documentActionsFileStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: "var(--workspace-text)",
  fontWeight: 600,
  fontSize: 13,
  minWidth: 0,
  flex: 1,
};

const documentActionsFileNameStyle: React.CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 260,
};

const documentActionsKindStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--workspace-muted)",
  background: "rgba(15, 23, 42, 0.04)",
  padding: "2px 8px",
  borderRadius: 999,
  whiteSpace: "nowrap",
};

const documentActionsStatsRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const documentActionsDotStyle: React.CSSProperties = {
  width: 3,
  height: 3,
  borderRadius: "50%",
  background: "rgba(15, 23, 42, 0.28)",
  display: "inline-block",
};

const documentActionsColumnsBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const documentActionsColumnsLabelStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--workspace-muted)",
};

const documentActionsColumnsRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
};

const documentActionsColumnChipStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  fontSize: 12,
  color: "var(--workspace-text)",
  background: "rgba(15, 23, 42, 0.05)",
  borderRadius: 6,
  maxWidth: 220,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  cursor: "default",
};

const documentActionsMoreLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--workspace-muted)",
  alignSelf: "center",
  padding: "0 4px",
};

const documentActionsButtonsRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  paddingTop: 2,
};

const documentsFinderTriggerStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel-soft)",
  color: "var(--workspace-text)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const documentsFinderPopoverStyle: React.CSSProperties = {
  position: "absolute",
  top: 36,
  left: 0,
  width: 360,
  maxWidth: "min(96vw, 420px)",
  background: "var(--workspace-panel)",
  border: "1px solid var(--workspace-border)",
  borderRadius: 14,
  boxShadow: "0 24px 52px rgba(15, 23, 42, 0.18)",
  padding: 12,
  zIndex: 40,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  maxHeight: 420,
  overflow: "hidden",
};

const documentsFinderSearchStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-panel-soft)",
  fontSize: 13,
  color: "var(--workspace-text)",
  outline: "none",
};

const documentsFinderSectionTitleStyle: React.CSSProperties = {
  margin: "6px 0 2px",
  fontSize: 10,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--workspace-muted)",
};

const documentsFinderRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--workspace-text)",
  textAlign: "left" as const,
  cursor: "pointer",
  alignItems: "flex-start",
};

const documentsFinderRowNameStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--workspace-text)",
  lineHeight: 1.3,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 260,
};

const documentsFinderRowMetaStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--workspace-muted)",
  marginTop: 2,
};

const documentsFinderListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  overflow: "auto",
  paddingRight: 4,
};

const mentionPickerStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 64,
  left: 16,
  width: 320,
  maxHeight: 220,
  overflow: "auto",
  background: "var(--workspace-panel)",
  border: "1px solid var(--workspace-border)",
  borderRadius: 12,
  boxShadow: "0 12px 36px rgba(15, 23, 42, 0.18)",
  padding: 6,
  zIndex: 50,
};

const mentionPickerRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "var(--workspace-text)",
  cursor: "pointer",
  width: "100%",
  textAlign: "left" as const,
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
  display: "flex",
  flexDirection: "column",
  gap: 16,
  minHeight: 460,
  height: "calc(100dvh - 160px)",
  maxHeight: "calc(100dvh - 120px)",
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

const chatTitleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 4,
};

const chatInlineTitleInputStyle: React.CSSProperties = {
  ...chatRenameInputStyle,
  minWidth: 220,
  maxWidth: "min(640px, 70vw)",
  fontFamily: "var(--font-display)",
  fontSize: 22,
  lineHeight: 1.1,
  padding: "6px 10px",
};

const chatTitleEditButtonStyle: React.CSSProperties = {
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  color: "var(--workspace-text)",
  borderRadius: 999,
  width: 30,
  height: 30,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 700,
  padding: 0,
  flexShrink: 0,
};

const chatMessagesStyle: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-well)",
  padding: 16,
  flex: "1 1 auto",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  overflowY: "auto",
  overscrollBehavior: "contain",
};

const chatBubbleStyle: React.CSSProperties = {
  maxWidth: "78%",
  borderRadius: 18,
  padding: "12px 14px",
  display: "grid",
  gap: 8,
  boxShadow: "0 12px 28px rgba(15, 23, 42, 0.06)",
};

const assistantMessageContentStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const assistantMessageParagraphStyle: React.CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const assistantMessageListStyle: React.CSSProperties = {
  margin: "0 0 0 18px",
  padding: 0,
  display: "grid",
  gap: 4,
  lineHeight: 1.6,
};

const chatInlineCodeStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "0.92em",
  background: "rgba(15, 23, 42, 0.08)",
  borderRadius: 6,
  padding: "1px 6px",
};

const chatTimestampStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--workspace-muted)",
};

const chatComposerStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const chatComposerModesRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const chatModeButtonStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  color: "var(--workspace-muted)",
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 10px",
  cursor: "pointer",
};

const chatModeButtonActiveStyle: React.CSSProperties = {
  ...chatModeButtonStyle,
  color: "var(--workspace-text)",
  borderColor: "var(--workspace-accent-strong)",
  background: "var(--workspace-accent-soft)",
};

const chatHomeTextareaStyle: React.CSSProperties = {
  ...homeChatInputStyle,
  minHeight: 68,
  maxHeight: 180,
  resize: "none",
  fontSize: 15,
  lineHeight: 1.45,
};

const workspaceChatTextareaCompactStyle: React.CSSProperties = {
  ...chatHomeTextareaStyle,
  minHeight: 56,
  maxHeight: 160,
  fontSize: 14,
  lineHeight: 1.4,
  padding: "6px 8px",
};

const chatToolButtonDisabledStyle: React.CSSProperties = {
  ...homeToolButtonIconStyle,
  opacity: 0.62,
  cursor: "not-allowed",
};

const chatToolButtonLabelDisabledStyle: React.CSSProperties = {
  ...homeToolButtonStyle,
  opacity: 0.62,
  cursor: "not-allowed",
};

const chatToolButtonLabelStyle: React.CSSProperties = {
  ...homeToolButtonStyle,
  cursor: "pointer",
};

const chatToolsPopoverStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 10px)",
  left: 0,
  zIndex: 20,
  width: 320,
  maxWidth: "min(88vw, 320px)",
  borderRadius: 14,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  boxShadow: "0 16px 38px rgba(15, 23, 42, 0.14)",
  padding: 12,
  display: "grid",
  gap: 10,
};

const chatToolsSectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--workspace-muted)",
};

const chatToolsTokenWrapStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const chatToolsTokenStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(15, 23, 42, 0.12)",
  background: "rgba(15, 23, 42, 0.04)",
  padding: "4px 8px",
  fontSize: 12,
};

const chatToolsMutedCopyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const chatToolsActionListStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const chatToolsActionButtonStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid var(--workspace-border)",
  background: "var(--workspace-surface)",
  color: "var(--workspace-text)",
  fontSize: 12,
  fontWeight: 600,
  textAlign: "left",
  padding: "7px 10px",
  cursor: "pointer",
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

const chatModeHintRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const chatModeChipStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(15, 23, 42, 0.12)",
  background: "rgba(15, 23, 42, 0.04)",
  padding: "4px 10px",
  fontSize: 12,
  color: "var(--workspace-muted)",
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
  background: "var(--workspace-accent-soft)",
  color: "var(--workspace-accent-strong)",
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
  background: "var(--workspace-well)",
};

const emptyIconStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--workspace-accent-soft)",
  color: "var(--workspace-accent-strong)",
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
