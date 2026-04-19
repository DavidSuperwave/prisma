import { smartExtractSheet } from "@/lib/spreadsheetParser";
import { getCurrentAppUser } from "@/lib/auth";
import {
  deriveReadinessFromKnowledgeScope,
  evaluateAgentReadiness,
  executionBlockReason,
} from "@/lib/agentReadiness";
import { getAssetBucketName, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";
import { scrubAndStoreSecrets } from "@/lib/secretScrubber";
// Side-effect import: register all agent tools into the registry so
// `describeToolsForPrompt` can enumerate them when building the system prompt.
import "@/lib/agentTools/executor";
import { describeToolsForPrompt, listTools } from "@/lib/agentTools/registry";
import { buildWorkspaceCatalog, renderCatalogForPrompt } from "@/lib/agentTools/workspaceCatalog";
import { hermesFetchInit } from "@/lib/hermesFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  workspace_id?: string;
  workspaceId?: string;
  app_context?: {
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
    dataset_field_catalog?: Array<{ key: string; name: string; type: string; required?: boolean; hidden?: boolean }>;
  };
  appContext?: {
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
    dataset_field_catalog?: Array<{ key: string; name: string; type: string; required?: boolean; hidden?: boolean }>;
  };
  tool_intent?: {
    kind?: string;
    mode?: string;
    query?: string;
    documentRecordId?: string;
    document_record_id?: string;
  } | null;
  toolIntent?: {
    kind?: string;
    mode?: string;
    query?: string;
    documentRecordId?: string;
    document_record_id?: string;
  } | null;
  attachment_refs?: Array<string | { kind?: string; id?: string }>;
  attachmentRefs?: Array<string | { kind?: string; id?: string }>;
};

type NormalizedAttachmentRefs = {
  recordIds: string[];
  folderIds: string[];
};

function normalizeAttachmentRefs(
  ...sources: Array<unknown>
): NormalizedAttachmentRefs {
  const recordIds = new Set<string>();
  const folderIds = new Set<string>();
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const entry of source) {
      if (typeof entry === "string") {
        const trimmed = entry.trim();
        if (trimmed) recordIds.add(trimmed);
        continue;
      }
      if (entry && typeof entry === "object") {
        const typed = entry as { kind?: unknown; id?: unknown };
        const kind = typeof typed.kind === "string" ? typed.kind : "record";
        const id = typeof typed.id === "string" ? typed.id.trim() : "";
        if (!id) continue;
        if (kind === "folder") folderIds.add(id);
        else recordIds.add(id);
      }
    }
  }
  return { recordIds: Array.from(recordIds), folderIds: Array.from(folderIds) };
}

type ChatProvider = "hermes" | "openrouter";

type SchemaProposalField = {
  name: string;
  key: string;
  type: string;
  required?: boolean;
};

type SchemaProposalObject = {
  name: string;
  singularName: string;
  pluralName: string;
  description: string;
  icon: string;
  fields: SchemaProposalField[];
};

type SchemaProposalPayload = {
  proposalId: string;
  title: string;
  rationale: string;
  requiresApproval: boolean;
  sourcePrompt: string;
  objects: SchemaProposalObject[];
  suggestedNextAction: string;
};

type AgentRuntimeRecord = {
  id: string;
  workspace_id: string;
  name: string;
  api_endpoint: string;
  api_key: string;
  status: string;
  soul_md: string | null;
  skills: string[] | null;
  knowledge_scope: Record<string, unknown> | null;
};

const sseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

const PUBLIC_CHAT_WINDOW_MS = 60_000;
const PUBLIC_CHAT_LIMIT = 20;
// Hard cap on distinct keys to avoid unbounded memory growth on long-lived
// Node processes seeing many unique IP/UA strings. Map preserves insertion
// order, so the oldest entry is the first key() yielded and we evict it when
// we grow past the cap. This is an LRU-on-insert approximation — callers that
// set() repeatedly for the same key get moved implicitly by delete+set below.
const PUBLIC_CHAT_COUNTERS_MAX = 10_000;
const publicChatCounters = new Map<string, { count: number; windowStart: number }>();

function touchPublicChatCounter(
  key: string,
  value: { count: number; windowStart: number },
): void {
  if (publicChatCounters.has(key)) {
    publicChatCounters.delete(key);
  }
  publicChatCounters.set(key, value);
  if (publicChatCounters.size > PUBLIC_CHAT_COUNTERS_MAX) {
    const oldest = publicChatCounters.keys().next().value;
    if (oldest !== undefined) publicChatCounters.delete(oldest);
  }
}

function formatSse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function consumeCompleteSseParts(buffer: string): { remainder: string; parts: string[] } {
  const delimiterPattern = /\r?\n\r?\n/g;
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = delimiterPattern.exec(buffer)) !== null) {
    parts.push(buffer.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;
  }

  return {
    remainder: buffer.slice(lastIndex),
    parts,
  };
}

function splitTextForProgressiveStream(content: string) {
  if (content.length < 80) {
    return [content];
  }
  const tokens = content.split(/(\s+)/).filter((token) => token.length > 0);
  const chunks: string[] = [];
  let current = "";
  for (const token of tokens) {
    if ((current + token).length > 32 && current.length > 0) {
      chunks.push(current);
      current = token;
      continue;
    }
    current += token;
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks.length > 0 ? chunks : [content];
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

function getClientFingerprint(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwardedFor.split(",")[0]?.trim() || "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  return `${ip}:${userAgent.slice(0, 120)}`;
}

function enforcePublicChatRateLimit(request: Request, payload: ChatRequest) {
  const isScoped = Boolean(payload.workspace_id ?? payload.workspaceId ?? payload.agent_id ?? payload.agentId);
  if (isScoped) {
    return null;
  }

  const key = getClientFingerprint(request);
  const now = Date.now();
  const existing = publicChatCounters.get(key);
  if (!existing || now - existing.windowStart >= PUBLIC_CHAT_WINDOW_MS) {
    touchPublicChatCounter(key, { count: 1, windowStart: now });
    return null;
  }

  if (existing.count >= PUBLIC_CHAT_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((PUBLIC_CHAT_WINDOW_MS - (now - existing.windowStart)) / 1000));
    return Response.json(
      { error: "Too many requests. Please wait a moment before sending another message." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  existing.count += 1;
  touchPublicChatCounter(key, existing);
  return null;
}

function slugifyFieldKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeObjectName(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0
    ? trimmed.slice(0, 1).toUpperCase() + trimmed.slice(1)
    : "Records";
}

type RecordIntentConfig = {
  target: "lead" | "deal" | "company" | "generic";
  kind: "crm_people" | "crm_companies" | "crm_deals" | null;
  singularLabel: string;
  objectCandidates: string[];
  optionalPrompt: string;
};

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const CREATE_VERB_PATTERN =
  /\b(crear|crea|genera|generar|agrega|agregar|anade|anadir|registra|registrar|alta|captura|add|create|insert|new|record|log)\b/;

function resolveRecordIntentConfig(message: string): RecordIntentConfig | null {
  const normalized = normalizeIntentText(message);
  if (!CREATE_VERB_PATTERN.test(normalized)) {
    return null;
  }

  if (/\b(lead|leads|prospecto|prospectos|contacto|contactos|persona|personas|people)\b/.test(normalized)) {
    return {
      target: "lead",
      kind: "crm_people",
      singularLabel: "contacto",
      objectCandidates: ["People", "Leads", "Lead", "Contacts", "Contactos", "Personas"],
      optionalPrompt: "email, telefono y etapa",
    };
  }
  if (/\b(deal|deals|oportunidad|oportunidades|venta|ventas)\b/.test(normalized)) {
    return {
      target: "deal",
      kind: "crm_deals",
      singularLabel: "oportunidad",
      objectCandidates: ["Deals", "Deal", "Opportunities", "Oportunidades"],
      optionalPrompt: "monto estimado, etapa y siguiente accion",
    };
  }
  if (/\b(company|companies|empresa|empresas|cliente|clientes|cuenta|cuentas|account|accounts)\b/.test(normalized)) {
    return {
      target: "company",
      kind: "crm_companies",
      singularLabel: "empresa",
      objectCandidates: ["Companies", "Company", "Clientes", "Accounts", "Empresas"],
      optionalPrompt: "industria, owner y status",
    };
  }

  // Generic: "add X to my Y table" / "crea un registro en Y" / similar.
  if (/\b(row|record|entry|item|registro|fila|entrada|linea)\b/.test(normalized) ||
      /\b(table|tabla|dataset|lista|list|sheet|hoja)\b/.test(normalized) ||
      /\b(to|a|en|in)\s+(my|mi|the|la|el)\b/.test(normalized)) {
    return {
      target: "generic",
      kind: null,
      singularLabel: "registro",
      objectCandidates: [],
      optionalPrompt: "los campos restantes",
    };
  }

  return null;
}

function extractEntityNameFromPrompt(message: string) {
  const patterns = [
    /(?:con\s+nombre|nombre\s*(?:es|:)?|llamad[oa]|called|named)\s+["“]?([^"”\n,.;]+)["”]?/i,
    /(?:lead|deal|oportunidad|empresa|cliente)\s+["“]([^"”]+)["”]/i,
    /"([^"\n]{2,120})"/,
    // "add/create a <thing> to/in my <table>"
    /\b(?:add|create|insert|new|agrega|agregar|crea|crear|registra|registrar)\s+(?:an?\s+|un[ao]?\s+|el\s+|la\s+|los\s+|las\s+)?([^"”\n.;]{2,120}?)\s+(?:to|into|in|a|en|al|on|para)\s+(?:my|mi|the|la|el|los|las)\b/i,
    // trailing fragment after verb
    /\b(?:add|create|insert|agrega|agregar|crea|crear)\s+(?:an?\s+|un[ao]?\s+)?([^"”\n.;]{2,120})$/i,
  ];
  for (const pattern of patterns) {
    const matched = message.match(pattern);
    if (!matched || typeof matched[1] !== "string") {
      continue;
    }
    const cleaned = matched[1]
      .replace(/\b(please|porfavor|por favor|pls|plz)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 2) {
      return cleaned;
    }
  }
  return null;
}

function extractTargetTableHintFromPrompt(message: string) {
  const patterns = [
    /\b(?:to|into|in|en|al|para)\s+(?:my|mi|the|la|el|los|las)\s+([a-z0-9 _-]{2,60}?)\s+(?:table|tabla|dataset|lista|list|sheet|hoja|object|objeto)\b/i,
    /\b(?:table|tabla|dataset|lista|sheet|hoja|object|objeto)\s+(?:named|called|llamad[oa])?\s*["“]?([a-z0-9 _-]{2,60})["”]?/i,
    /\b(?:to|into|in|en|al|para)\s+(?:my|mi|the|la|el)\s+([a-z0-9 _-]{2,60})\b/i,
  ];
  for (const pattern of patterns) {
    const matched = message.match(pattern);
    if (!matched || typeof matched[1] !== "string") {
      continue;
    }
    const cleaned = matched[1].replace(/\s+/g, " ").trim();
    if (cleaned.length >= 2) {
      return cleaned;
    }
  }
  return null;
}

function hasExplicitSchemaIntent(message: string) {
  const normalized = normalizeIntentText(message);
  const explicitPatterns = [
    /\b(crear|crea|define|definir|armar|disenar|disenar|inicializar|proponer)\b[\s\S]{0,24}\b(tabla|tablas|schema|esquema|database|base de datos|modelo de datos)\b/,
    /\b(crear|crea|inicializar|armar)\b[\s\S]{0,16}\bcrm\b(?:[\s\S]{0,16}\b(desde cero|nuevo|estructura|schema|esquema)\b)?/,
  ];
  return explicitPatterns.some((pattern) => pattern.test(normalized));
}

function streamActionResponse(content: string) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(formatSse({ type: "delta", content })));
      controller.enqueue(encoder.encode(formatSse({ type: "done" })));
      controller.close();
    },
  });
  return new Response(stream, { headers: sseHeaders });
}

function inferSchemaObjectsFromMessage(message: string): SchemaProposalObject[] {
  const lower = message.toLowerCase();
  const crmIntent =
    lower.includes("crm") ||
    lower.includes("pipeline") ||
    lower.includes("ventas") ||
    lower.includes("clientes");
  const receivablesIntent =
    lower.includes("cobranza") || lower.includes("cartera") || lower.includes("factura");
  const operationsIntent =
    lower.includes("operacion") || lower.includes("workflow") || lower.includes("proceso");

  if (crmIntent) {
    return [
      {
        name: "Companies",
        singularName: "Company",
        pluralName: "Companies",
        description: "Cuentas principales y su estado comercial.",
        icon: "building-2",
        fields: [
          { name: "Name", key: "name", type: "text", required: true },
          { name: "Industry", key: "industry", type: "text" },
          { name: "Status", key: "status", type: "status", required: true },
          { name: "Owner", key: "owner", type: "text" },
          { name: "Priority", key: "priority", type: "select" },
        ],
      },
      {
        name: "Leads",
        singularName: "Lead",
        pluralName: "Leads",
        description: "Pipeline comercial para calificación y seguimiento.",
        icon: "users",
        fields: [
          { name: "Full Name", key: "full_name", type: "text", required: true },
          { name: "Email", key: "email", type: "text" },
          { name: "Phone", key: "phone", type: "text" },
          { name: "Stage", key: "stage", type: "status", required: true },
          { name: "Next Action", key: "next_action", type: "text" },
          { name: "Due Date", key: "due_date", type: "date" },
        ],
      },
    ];
  }

  if (receivablesIntent) {
    return [
      {
        name: "Receivables",
        singularName: "Receivable",
        pluralName: "Receivables",
        description: "Control de cobranza y seguimiento de cuentas por cobrar.",
        icon: "wallet-cards",
        fields: [
          { name: "Debtor", key: "debtor", type: "text", required: true },
          { name: "Invoice Number", key: "invoice_number", type: "text", required: true },
          { name: "Amount", key: "amount", type: "currency", required: true },
          { name: "Status", key: "status", type: "status", required: true },
          { name: "Due Date", key: "due_date", type: "date", required: true },
          { name: "Assigned Collector", key: "assigned_collector", type: "text" },
        ],
      },
    ];
  }

  const guessedName = operationsIntent ? "Operations Queue" : "Core Records";
  const normalizedName = normalizeObjectName(guessedName);
  return [
    {
      name: normalizedName,
      singularName: normalizedName.endsWith("s") ? normalizedName.slice(0, -1) : normalizedName,
      pluralName: normalizedName.endsWith("s") ? normalizedName : `${normalizedName}s`,
      description: "Estructura inicial para operar el flujo solicitado desde chat.",
      icon: "file-stack",
      fields: [
        { name: "Title", key: "title", type: "text", required: true },
        { name: "Status", key: "status", type: "status", required: true },
        { name: "Owner", key: "owner", type: "text" },
        { name: "Priority", key: "priority", type: "select" },
        { name: "Due Date", key: "due_date", type: "date" },
      ],
    },
  ];
}

function shouldProposeSchema(message: string, hasWorkspaceContext: boolean) {
  if (!hasWorkspaceContext) {
    return false;
  }
  return hasExplicitSchemaIntent(message);
}

type DocumentPreviewSheet = {
  name: string;
  headers: string[];
  sampleRows: Array<Record<string, unknown>>;
  rowCount: number;
};

type DocumentPreviewShape = {
  kind?: string;
  sheets?: DocumentPreviewSheet[];
};

function inferFieldTypeFromSamples(header: string, samples: unknown[]): SchemaProposalField["type"] {
  const normalizedHeader = header.toLowerCase();
  if (/(price|amount|total|cost|precio|monto|importe|cargo)/i.test(normalizedHeader)) return "currency";
  if (/(date|fecha|created|updated)/i.test(normalizedHeader)) return "date";
  if (/(email|correo)/i.test(normalizedHeader)) return "text";
  if (/(phone|tel|mobile|celular)/i.test(normalizedHeader)) return "text";
  if (/(status|stage|etapa|estado)/i.test(normalizedHeader)) return "status";

  const nonEmpty = samples.filter((value) => value !== null && value !== undefined && String(value).trim().length > 0);
  if (nonEmpty.length === 0) return "text";

  const allNumbers = nonEmpty.every((value) => typeof value === "number" || (typeof value === "string" && !Number.isNaN(Number(value))));
  if (allNumbers) return "number";

  const allDates = nonEmpty.every((value) => {
    const asString = String(value);
    if (asString.length < 4) return false;
    const parsed = new Date(asString);
    return !Number.isNaN(parsed.getTime());
  });
  if (allDates) return "date";

  const allBoolean = nonEmpty.every((value) => {
    const normalized = String(value).toLowerCase().trim();
    return ["true", "false", "1", "0", "sí", "si", "no", "yes"].includes(normalized);
  });
  if (allBoolean) return "boolean";

  const unique = new Set(nonEmpty.map((value) => String(value).trim().toLowerCase()));
  if (unique.size > 1 && unique.size <= Math.max(4, Math.floor(nonEmpty.length * 0.25))) {
    return "select";
  }

  return "text";
}

function buildSchemaProposalFromPreview(
  preview: DocumentPreviewShape | null | undefined,
  fileName: string,
): SchemaProposalPayload | null {
  const sheet = preview?.sheets?.[0];
  if (!sheet || !Array.isArray(sheet.headers) || sheet.headers.length === 0) {
    return null;
  }
  const usableHeaders = sheet.headers.filter(
    (header) =>
      typeof header === "string" &&
      header.trim().length > 0 &&
      !/^__EMPTY(_\d+)?$/i.test(header.trim()) &&
      !/^column\s*\d+$/i.test(header.trim()),
  );
  if (usableHeaders.length === 0) {
    return null;
  }
  const baseName = (fileName || sheet.name || "Dataset")
    .replace(/\.(xlsx|xls|csv)$/i, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim();
  const objectName = normalizeObjectName(baseName || "Dataset");
  const singularName = objectName.endsWith("s") ? objectName.slice(0, -1) : objectName;
  const pluralName = objectName.endsWith("s") ? objectName : `${objectName}s`;

  const fields: SchemaProposalField[] = usableHeaders.map((header, index) => {
    const samples = sheet.sampleRows
      .map((row) => (row as Record<string, unknown>)[header])
      .filter((value) => value !== undefined);
    const type = inferFieldTypeFromSamples(header, samples);
    return {
      name: header,
      key: slugifyFieldKey(header) || `column_${index + 1}`,
      type,
      required: index === 0,
    };
  });

  const proposal: SchemaProposalPayload = {
    proposalId: `proposal-doc-${Date.now()}`,
    title: `Propuesta para ${objectName}`,
    rationale: `Inferí ${fields.length} columnas desde ${fileName} (hoja "${sheet.name}", ${sheet.rowCount} filas).`,
    requiresApproval: true,
    sourcePrompt: `Documento: ${fileName}`,
    objects: [
      {
        name: objectName,
        singularName,
        pluralName,
        description: `Dataset generado desde ${fileName}.`,
        icon: "file-stack",
        fields,
      },
    ],
    suggestedNextAction:
      "Al aprobar se creará la tabla con estos campos. Luego podrás cargar las filas del archivo con el flujo de importación.",
  };
  return proposal;
}

function buildSchemaProposal(message: string): SchemaProposalPayload {
  const objects = inferSchemaObjectsFromMessage(message).map((objectDef) => ({
    ...objectDef,
    fields: objectDef.fields.map((field) => ({
      ...field,
      key: slugifyFieldKey(field.key || field.name),
    })),
  }));
  const title =
    objects.length > 1
      ? `Propuesta inicial (${objects.length} objetos)`
      : `Propuesta para ${objects[0]?.name ?? "workspace"}`;
  return {
    proposalId: `proposal-${Date.now()}`,
    title,
    rationale:
      "Inferí la estructura mínima para operar tu flujo primero en datos y luego en automatización.",
    requiresApproval: true,
    sourcePrompt: message,
    objects,
    suggestedNextAction:
      "Si confirmas esta propuesta, crearé objetos y campos en el workspace y dejaré trazabilidad en actividad.",
  };
}

function streamSchemaProposalResponse(
  proposal: SchemaProposalPayload,
  introMessage = "Preparé una propuesta de esquema concreta para arrancar en modo database-first.",
) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          formatSse({
            type: "delta",
            content: introMessage,
          }),
        ),
      );
      controller.enqueue(encoder.encode(formatSse({ type: "schema_proposal", proposal })));
      controller.enqueue(encoder.encode(formatSse({ type: "done" })));
      controller.close();
    },
  });
  return new Response(stream, { headers: sseHeaders });
}

function streamImportProposalResponse(proposal: Record<string, unknown>, introMessage: string) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(formatSse({ type: "delta", content: introMessage })));
      controller.enqueue(encoder.encode(formatSse({ type: "import_proposal", proposal })));
      controller.enqueue(encoder.encode(formatSse({ type: "done" })));
      controller.close();
    },
  });
  return new Response(stream, { headers: sseHeaders });
}

async function logSchemaProposalActivity(
  workspaceId: string,
  agentId: string | null,
  proposal: SchemaProposalPayload,
) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !agentId || !workspaceId) {
    return;
  }

  await supabase.from("agent_activity").insert({
    workspace_id: workspaceId,
    agent_id: agentId,
    action: "schema.proposed",
    details: {
      proposal_id: proposal.proposalId,
      title: proposal.title,
      objects: proposal.objects.map((entry) => ({
        name: entry.name,
        fields: entry.fields.length,
      })),
      source_prompt: proposal.sourcePrompt,
    },
  });
}

type NormalizedToolEnvelope = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  notes: string[];
};

/** Strip non-alphanum + dot, lowercase, so the agent's typos match registry entries. */
function canonicalizeToolName(raw: string): string {
  return raw.replace(/[^A-Za-z0-9.]/g, "").toLowerCase();
}

let toolNameMap: Map<string, string> | null = null;
function buildToolNameMap() {
  if (toolNameMap) return toolNameMap;
  const map = new Map<string, string>();
  for (const t of listTools()) {
    map.set(canonicalizeToolName(t.name), t.name);
    // Also collapse the dot so `cms.listinventory` → `cms.list_inventory`.
    map.set(canonicalizeToolName(t.name).replace(/\./g, ""), t.name);
  }
  toolNameMap = map;
  return map;
}

// Known hallucinated / alternate names → real registry tool names.
// Canonicalized (lowercased, non-alphanum stripped) on both sides.
const TOOL_NAME_ALIASES: Record<string, string> = {
  visionanalyze: "documents.analyze",
  analyzedocument: "documents.analyze",
  analyzepdf: "documents.analyze",
  pdfextract: "documents.analyze",
  pdfparse: "documents.analyze",
  readdocument: "documents.analyze",
  readpdf: "documents.analyze",
  extracttext: "documents.analyze",
  documentextract: "documents.analyze",
  ocr: "documents.analyze",
};

function resolveToolName(raw: string): string | null {
  const map = buildToolNameMap();
  const canonical = canonicalizeToolName(raw);
  const direct = map.get(canonical) ?? map.get(canonical.replace(/\./g, ""));
  if (direct) return direct;
  const aliased = TOOL_NAME_ALIASES[canonical] ?? TOOL_NAME_ALIASES[canonical.replace(/\./g, "")];
  if (aliased && map.has(canonicalizeToolName(aliased))) {
    return aliased;
  }
  return null;
}

const ARG_ALIASES: Record<string, string> = {
  filters: "filter",
  object_id: "objectId",
  object_name: "objectName",
  record_id: "recordId",
  record_ids: "recordIds",
  include_counts: "includeCounts",
  include_fields: "includeFields",
  include_history: "includeHistory",
  include_deleted: "includeDeleted",
  dry_run: "dryRun",
  confirm_token: "confirmToken",
  workspace_slug: "workspaceSlug",
};

function normalizeArgs(raw: unknown): { args: Record<string, unknown>; notes: string[] } {
  const notes: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { args: {}, notes };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const canonical = ARG_ALIASES[k];
    if (canonical && !(canonical in out)) {
      out[canonical] = v;
      notes.push(`Renamed arg "${k}" → "${canonical}".`);
    } else {
      out[k] = v;
    }
  }
  return { args: out, notes };
}

function looksLikeToolCallEnvelope(parsed: Record<string, unknown>): boolean {
  const t = typeof parsed.type === "string" ? parsed.type.toLowerCase().replace(/[-_]/g, "") : "";
  return t === "toolcall" && typeof parsed.name === "string";
}

function normalizeToolEnvelope(parsed: Record<string, unknown>): NormalizedToolEnvelope | null {
  if (!looksLikeToolCallEnvelope(parsed)) return null;
  const rawName = typeof parsed.name === "string" ? parsed.name : "";
  const resolved = resolveToolName(rawName);
  const notes: string[] = [];
  if (!resolved) return null;
  if (resolved !== rawName) {
    notes.push(`Resolved tool name "${rawName}" → "${resolved}".`);
  }
  const typeField = typeof parsed.type === "string" ? parsed.type : "";
  if (typeField !== "tool_call") {
    notes.push(`Envelope type "${typeField}" normalized to "tool_call".`);
  }
  const id =
    (typeof parsed.id === "string" && parsed.id) ||
    (typeof parsed.tool_call_id === "string" && (parsed.tool_call_id as string)) ||
    `tc_${Math.random().toString(36).slice(2, 10)}`;
  const { args, notes: argNotes } = normalizeArgs(parsed.args);
  return { id, name: resolved, args, notes: [...notes, ...argNotes] };
}

/**
 * Walk the string starting at `start` (which must point at `{`) and return the
 * index just past the matching closing `}`, respecting nested objects and JSON
 * string escaping. Returns -1 if the braces don't balance.
 */
function findBalancedObjectEnd(text: string, start: number): number {
  if (text[start] !== "{") return -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  return -1;
}

/**
 * Extract inline tool_call JSON objects that the LLM embedded in its text
 * output. Returns the cleaned delta text and the parsed envelopes.
 *
 * Accepts the canonical `"type":"tool_call"` shape as well as the common LLM
 * mistakes `"tool-call"` and `"toolcall"`, and correctly handles arbitrarily
 * nested `args` objects (the old regex aborted at the first nested `}` which
 * meant envelopes like `{"type":"toolcall","args":{...}}` leaked as raw text).
 */
/**
 * Streaming-aware variant of `extractInlineToolCalls`. Takes the accumulated
 * assistant text, emits any *completed* tool_call envelopes it finds, and
 * returns `{ cleaned, pending }` where `pending` is the trailing text that
 * might still be an in-flight envelope (so the caller should hold it back
 * from user-visible deltas until more text arrives or the stream ends).
 *
 * This exists because the LLM streams a ~200-character tool_call envelope
 * across dozens of 1-5 char deltas; the non-streaming extractor never sees
 * a balanced `{...}` inside a single delta and leaks the whole JSON as text.
 */
function extractInlineToolCallsStreaming(
  text: string,
): { cleaned: string; pending: string; envelopes: Record<string, unknown>[] } {
  if (!text) return { cleaned: "", pending: "", envelopes: [] };
  const envelopes: Record<string, unknown>[] = [];
  const cleanedParts: string[] = [];
  let cursor = 0;
  const typeMarker = /"type"\s*:\s*"tool[_-]?call"/i;

  while (cursor < text.length) {
    const braceIdx = text.indexOf("{", cursor);
    if (braceIdx === -1) {
      cleanedParts.push(text.slice(cursor));
      cursor = text.length;
      break;
    }
    const endIdx = findBalancedObjectEnd(text, braceIdx);
    if (endIdx === -1) {
      // Incomplete object — flush text before the brace and hold the rest.
      cleanedParts.push(text.slice(cursor, braceIdx));
      return {
        cleaned: cleanedParts.join(""),
        pending: text.slice(braceIdx),
        envelopes,
      };
    }
    const candidate = text.slice(braceIdx, endIdx);
    if (typeMarker.test(candidate)) {
      try {
        const parsed = JSON.parse(candidate) as Record<string, unknown>;
        if (looksLikeToolCallEnvelope(parsed)) {
          cleanedParts.push(text.slice(cursor, braceIdx));
          envelopes.push(parsed);
          cursor = endIdx;
          continue;
        }
      } catch {
        // Not valid JSON yet — fall through and keep the text as-is.
      }
    }
    cleanedParts.push(text.slice(cursor, endIdx));
    cursor = endIdx;
  }

  return { cleaned: cleanedParts.join(""), pending: "", envelopes };
}

/**
 * Attempt to repair a truncated JSON object by appending the closing braces/
 * brackets the model failed to emit before hitting max_output_tokens.
 *
 * Returns the parsed envelope if it recovers a valid tool_call, or null.
 * Only tries a modest number of closers so we don't mask real junk.
 */
function tryRepairTruncatedToolCall(candidate: string): Record<string, unknown> | null {
  if (!candidate || candidate[0] !== "{") return null;
  if (!/"type"\s*:\s*"tool[_-]?call"/i.test(candidate)) return null;

  // Walk the candidate, tracking brace/bracket depth and ignoring chars inside
  // JSON strings. If we end inside a string, append a closing quote.
  let inString = false;
  let escape = false;
  const stack: Array<"}" | "]"> = [];
  for (let i = 0; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      stack.push("}");
    } else if (ch === "[") {
      stack.push("]");
    } else if (ch === "}" || ch === "]") {
      if (stack[stack.length - 1] === ch) stack.pop();
    }
  }
  if (!inString && stack.length === 0) return null; // already balanced — not truncated
  if (stack.length > 16) return null; // unreasonable — bail

  // Strip a trailing partial token (unterminated key/value) before closing.
  let tail = candidate;
  if (inString) {
    // Cut at the last complete quoted value/key so we can close cleanly.
    const lastQuote = tail.lastIndexOf('"');
    if (lastQuote > 0) {
      tail = tail.slice(0, lastQuote + 1);
    }
  }
  // Trim any trailing comma or partial colon fragment.
  tail = tail.replace(/[,:\s]+$/, "");

  const repaired = tail + stack.reverse().join("");
  try {
    const parsed = JSON.parse(repaired) as Record<string, unknown>;
    if (looksLikeToolCallEnvelope(parsed)) return parsed;
  } catch {
    return null;
  }
  return null;
}

function extractInlineToolCalls(text: string): { cleaned: string; envelopes: Record<string, unknown>[] } {
  if (!text || !text.includes('"type"') || !text.toLowerCase().includes("tool")) {
    return { cleaned: text, envelopes: [] };
  }
  const envelopes: Record<string, unknown>[] = [];
  const parts: string[] = [];
  const typeMarker = /"type"\s*:\s*"tool[_-]?call"/gi;

  let cursor = 0;
  while (cursor < text.length) {
    const braceIdx = text.indexOf("{", cursor);
    if (braceIdx === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    const endIdx = findBalancedObjectEnd(text, braceIdx);
    if (endIdx === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    const candidate = text.slice(braceIdx, endIdx);
    typeMarker.lastIndex = 0;
    if (typeMarker.test(candidate)) {
      try {
        const parsed = JSON.parse(candidate) as Record<string, unknown>;
        if (looksLikeToolCallEnvelope(parsed)) {
          parts.push(text.slice(cursor, braceIdx));
          envelopes.push(parsed);
          cursor = endIdx;
          continue;
        }
      } catch {
        // Fall through — not a valid envelope, leave the text alone.
      }
    }
    parts.push(text.slice(cursor, endIdx));
    cursor = endIdx;
  }

  return { cleaned: parts.join(""), envelopes };
}

function extractDeltaText(parsed: Record<string, unknown>) {
  const choices = parsed.choices as
    | Array<{ delta?: { content?: string | unknown[] | null; reasoning?: string | null } }>
    | undefined;
  const messageChoices = parsed.choices as Array<{ message?: { content?: string } }> | undefined;
  const d0 = choices?.[0]?.delta;
  const deltaContent = d0?.content;
  if (typeof deltaContent === "string" && deltaContent.length > 0) {
    return deltaContent;
  }
  if (Array.isArray(deltaContent)) {
    const joined = deltaContent
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item && typeof (item as { text?: string }).text === "string") {
          return (item as { text: string }).text;
        }
        return "";
      })
      .join("");
    if (joined.length > 0) {
      return joined;
    }
  }
  const reasoning = d0?.reasoning;
  if (typeof reasoning === "string" && reasoning.length > 0) {
    return reasoning;
  }

  if (typeof parsed.delta === "string" && parsed.delta.length > 0) {
    return parsed.delta;
  }

  const deltaObj = parsed.delta;
  if (deltaObj && typeof deltaObj === "object") {
    const rec = deltaObj as Record<string, unknown>;
    const nested = rec.text ?? rec.content;
    if (typeof nested === "string" && nested.length > 0) {
      return nested;
    }
  }

  if (typeof parsed.output_text === "string" && parsed.output_text.length > 0) {
    return parsed.output_text;
  }

  const output = parsed.output as Array<{ content?: Array<{ text?: string }> }> | undefined;
  const outputText = output?.flatMap((item) => item.content ?? []).map((item) => item.text).find(Boolean);
  if (typeof outputText === "string" && outputText.length > 0) {
    return outputText;
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

type AssistantMessagePersistor = (content: string) => Promise<void>;

function streamFromSseUpstream(
  upstream: Response,
  onAssistantMessage?: AssistantMessagePersistor,
  toolContext?: { workspaceSlug: string; origin: string; cookieHeader?: string },
  clientSignal?: AbortSignal,
) {
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
      // If the client disconnects, propagate cancellation to the upstream
      // reader so Hermes tokens/tool-calls stop being produced and we stop
      // writing to the DB.
      if (clientSignal) {
        const onAbort = () => {
          try {
            void reader.cancel("client disconnected");
          } catch {
            // noop
          }
        };
        if (clientSignal.aborted) {
          onAbort();
        } else {
          clientSignal.addEventListener("abort", onAbort, { once: true });
        }
      }

      let buffer = "";
      let sentDone = false;
      let assistantText = "";
      // Mirrors assistantText but excludes any tool_call envelope JSON the LLM
      // embedded inline. This is what we persist to the conversation so the
      // user never sees raw `{"type":"toolcall",...}` re-rendered on refresh.
      let cleanedAssistantText = "";
      // Streaming-aware buffer for inline tool_call JSON envelopes. The LLM
      // emits the envelope one tiny delta at a time, so extractInlineToolCalls
      // needs to see the accumulated text, not each delta in isolation.
      let toolCallStreamBuffer = "";

      const emitDone = () => {
        if (sentDone) {
          return;
        }
        sentDone = true;
        controller.enqueue(encoder.encode(formatSse({ type: "done" })));
      };

      const handleToolCall = async (parsed: Record<string, unknown>) => {
        if (!toolContext) return false;
        if (!looksLikeToolCallEnvelope(parsed)) return false;
        const normalizedEnvelope = normalizeToolEnvelope(parsed);
        if (!normalizedEnvelope) {
          // Tool name couldn't be resolved to a registered tool. Emit a structured
          // tool_result error so the model can retry with a valid tool, and so the
          // raw JSON envelope never leaks to the user as text.
          const requestedName = typeof parsed.name === "string" ? parsed.name : "unknown";
          const fallbackId =
            (typeof parsed.id === "string" && parsed.id) ||
            (typeof parsed.tool_call_id === "string" && (parsed.tool_call_id as string)) ||
            `tc_${Math.random().toString(36).slice(2, 10)}`;
          const available = listTools()
            .map((tool) => tool.name)
            .sort();
          const errorMessage = `Tool "${requestedName}" is not registered in this workspace. Pick one of the available tools and reissue the tool_call. Available tools: ${available.join(", ")}.`;
          controller.enqueue(
            encoder.encode(
              formatSse({
                type: "tool_result",
                id: fallbackId,
                name: requestedName,
                result: {
                  ok: false,
                  error: errorMessage,
                  availableTools: available,
                },
              }),
            ),
          );
          return true;
        }
        const { name, id, args, notes } = normalizedEnvelope;
        try {
          const mod = await import("@/lib/agentTools/executor");
          const result = await mod.runTool({ name, args, ctx: toolContext });
          // Attach normalization notes so the model sees corrections.
          const decorated =
            result.ok && notes.length > 0
              ? { ...result, data: { ...(result.data as Record<string, unknown>), _normalization: notes } }
              : result;

          // Emit write_proposal when the tool result carries a proposal + token.
          if (decorated.ok) {
            const data = decorated.data as Record<string, unknown> | null | undefined;
            if (
              data &&
              typeof data === "object" &&
              data.proposal &&
              typeof data.confirmToken === "string"
            ) {
              controller.enqueue(
                encoder.encode(
                  formatSse({
                    type: "write_proposal",
                    id,
                    toolName: name,
                    proposal: data.proposal,
                    confirmToken: data.confirmToken,
                    expiresAt: data.expiresAt ?? null,
                    originalArgs: args,
                  }),
                ),
              );
            }
          }

          controller.enqueue(
            encoder.encode(formatSse({ type: "tool_result", id, name, result: decorated })),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Tool execution failed.";
          controller.enqueue(
            encoder.encode(formatSse({ type: "tool_result", id, name, result: { ok: false, error: message } })),
          );
        }
        return true;
      };

      const parsePromises: Array<Promise<void>> = [];

      const flushPart = (part: string) => {
        const parsePayload = (payload: string) => {
          if (!payload) {
            return;
          }

          if (payload === "[DONE]") {
            emitDone();
            return;
          }

          try {
            const parsed = JSON.parse(payload) as Record<string, unknown>;
            const errorText = extractErrorText(parsed);
            if (errorText) {
              controller.enqueue(encoder.encode(formatSse({ type: "error", error: errorText })));
              return;
            }

            if (isDonePayload(payload, parsed)) {
              emitDone();
              return;
            }

            if (looksLikeToolCallEnvelope(parsed)) {
              parsePromises.push(
                handleToolCall(parsed).then(() => undefined),
              );
              return;
            }

            const delta = extractDeltaText(parsed);
            if (delta) {
              assistantText += delta;
              // Accumulate across deltas — a tool_call envelope is ~200 chars
              // and arrives in dozens of tiny chunks. Only emit user-visible
              // text once we know it is NOT inside an in-flight envelope.
              toolCallStreamBuffer += delta;
              const intercepted = extractInlineToolCallsStreaming(toolCallStreamBuffer);
              toolCallStreamBuffer = intercepted.pending;
              for (const envelope of intercepted.envelopes) {
                parsePromises.push(handleToolCall(envelope).then(() => undefined));
              }
              if (intercepted.cleaned.length > 0) {
                cleanedAssistantText += intercepted.cleaned;
                controller.enqueue(encoder.encode(formatSse({ type: "delta", content: intercepted.cleaned })));
              }
              // Safety valve: if pending text grows large without ever closing
              // a brace, it is almost certainly regular prose with a stray `{`.
              // Flush to the user so the chat doesn't appear frozen.
              if (toolCallStreamBuffer.length > 8192) {
                cleanedAssistantText += toolCallStreamBuffer;
                controller.enqueue(
                  encoder.encode(formatSse({ type: "delta", content: toolCallStreamBuffer })),
                );
                toolCallStreamBuffer = "";
              }
            }
          } catch {
            controller.enqueue(encoder.encode(formatSse({ type: "error", error: "No se pudo leer la respuesta del modelo." })));
          }
        };

        const lines = part
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.startsWith("data:"));

        if (lines.length > 0) {
          for (const line of lines) {
            parsePayload(line.slice(5).trim());
          }
          return;
        }

        const rawPart = part.trim();
        if (rawPart.startsWith("{") && rawPart.endsWith("}")) {
          parsePayload(rawPart);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const consumed = consumeCompleteSseParts(buffer);
        buffer = consumed.remainder;

        for (const part of consumed.parts) {
          flushPart(part);
        }
      }

      if (buffer) {
        flushPart(buffer);
      }

      // Stream ended — if anything remained in the tool_call buffer, try
      // repairing it (Hermes sometimes truncates the envelope when it hits
      // max_output_tokens). If repair yields a valid tool_call, execute it;
      // otherwise flush to the user as plain text so nothing is swallowed.
      if (toolCallStreamBuffer.length > 0) {
        const firstBrace = toolCallStreamBuffer.indexOf("{");
        let handled = false;
        if (firstBrace !== -1) {
          const before = toolCallStreamBuffer.slice(0, firstBrace);
          const candidate = toolCallStreamBuffer.slice(firstBrace);
          const repaired = tryRepairTruncatedToolCall(candidate);
          if (repaired) {
            if (before.length > 0) {
              cleanedAssistantText += before;
              controller.enqueue(encoder.encode(formatSse({ type: "delta", content: before })));
            }
            parsePromises.push(handleToolCall(repaired).then(() => undefined));
            handled = true;
          }
        }
        if (!handled) {
          cleanedAssistantText += toolCallStreamBuffer;
          controller.enqueue(
            encoder.encode(formatSse({ type: "delta", content: toolCallStreamBuffer })),
          );
        }
        toolCallStreamBuffer = "";
      }

      if (parsePromises.length > 0) {
        await Promise.allSettled(parsePromises);
      }

      // Persist the cleaned text (tool-call JSON stripped) so a page refresh or
      // a history read does not re-render the raw envelope as chat content.
      // Fall back to the raw text only if nothing survived cleaning (e.g. the
      // LLM never emitted any plain text, just a tool_call and a result).
      const persistedText = cleanedAssistantText.trim().length > 0 ? cleanedAssistantText : "";
      if (persistedText && onAssistantMessage) {
        await onAssistantMessage(persistedText);
      }
      emitDone();
      controller.close();
    },
  });
}

async function streamFromJsonUpstream(upstream: Response, onAssistantMessage?: AssistantMessagePersistor) {
  const payload = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
  const rawText = payload ? extractDeltaText(payload) : "";
  // Strip any inline tool_call JSON the LLM embedded in its text. We do NOT
  // execute these here (this path is the single-shot fallback for providers
  // that return JSON instead of SSE); we simply remove them so nothing leaks
  // into the chat bubble or the persisted conversation.
  const { cleaned } = extractInlineToolCalls(rawText);
  const text = cleaned.trim().length > 0 ? cleaned : rawText;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const content = text || "No se recibio texto del agente.";
      const chunks = splitTextForProgressiveStream(content);
      for (let index = 0; index < chunks.length; index += 1) {
        controller.enqueue(encoder.encode(formatSse({ type: "delta", content: chunks[index] })));
        if (chunks.length > 1 && index < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 14));
        }
      }
      if (content.trim() && onAssistantMessage) {
        await onAssistantMessage(content);
      }
      controller.enqueue(encoder.encode(formatSse({ type: "done" })));
      controller.close();
    },
  });

  return new Response(stream, { headers: sseHeaders });
}

type ConversationPersistContext = {
  workspaceId: string;
  agentId: string;
  runtimeConversationId: string;
  createdBy: string | null;
};

async function ensureWorkspaceConversation(context: ConversationPersistContext) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  const { data: existing, error: existingError } = await supabase
    .from("workspace_conversations")
    .select("id")
    .eq("workspace_id", context.workspaceId)
    .eq("runtime_conversation_id", context.runtimeConversationId)
    .maybeSingle();

  if (existingError) {
    return null;
  }
  if (existing?.id) {
    return String(existing.id);
  }

  const { data: created, error: createError } = await supabase
    .from("workspace_conversations")
    .insert({
      workspace_id: context.workspaceId,
      agent_id: context.agentId,
      title: "Nuevo chat",
      source: "workspace_chat",
      runtime_conversation_id: context.runtimeConversationId,
      created_by: context.createdBy,
    })
    .select("id")
    .single();

  if (createError) {
    return null;
  }
  return String(created.id);
}

async function persistConversationMessage(
  context: ConversationPersistContext | null,
  role: "user" | "assistant",
  content: string,
) {
  if (!context || !content.trim()) {
    return;
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return;
  }

  const conversationId = await ensureWorkspaceConversation(context);
  if (!conversationId) {
    return;
  }

  await supabase.from("workspace_conversation_messages").insert({
    conversation_id: conversationId,
    workspace_id: context.workspaceId,
    agent_id: context.agentId,
    role,
    content,
    created_by: context.createdBy,
  });
}

async function resolveWorkspaceContext(workspaceIdentifier?: string | null) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !workspaceIdentifier) {
    return null;
  }

  let workspaceId = workspaceIdentifier;
  let workspaceQuery = supabase
    .from("workspaces")
    .select("id, name, subdomain")
    .limit(1);

  if (/^[0-9a-fA-F-]{36}$/.test(workspaceIdentifier)) {
    workspaceQuery = workspaceQuery.eq("id", workspaceIdentifier);
  } else {
    workspaceQuery = workspaceQuery.eq("subdomain", workspaceIdentifier);
  }

  const { data: workspaceRow, error: workspaceError } = await workspaceQuery.maybeSingle();
  if (workspaceError) {
    throw new Error(workspaceError.message);
  }

  if (!workspaceRow) {
    return null;
  }

  workspaceId = String(workspaceRow.id);

  const [{ data: objectRows }, { data: agentRows }, { data: activityRows }] = await Promise.all([
    supabase
      .from("workspace_objects")
      .select("name")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    supabase
      .from("workspace_agents")
      .select("name, type, status")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    supabase
      .from("agent_activity")
      .select("action")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const objectNames = (objectRows ?? []).map((row) => String(row.name));
  const agentNames = (agentRows ?? []).map(
    (row) => `${String(row.name)} (${String(row.type)}, ${String(row.status)})`,
  );
  const recentActions = (activityRows ?? []).map((row) => String(row.action));

  return {
    workspaceId,
    workspaceName: String(workspaceRow.name),
    workspaceSlug: String(workspaceRow.subdomain),
    objectNames,
    agentNames,
    recentActions,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function listWorkspaceObjectsForIntent(workspaceId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [] as Array<{ id: string; name: string; kind: string | null }>;
  }
  const preferred = await supabase
    .from("workspace_objects")
    .select("id, name, kind")
    .eq("workspace_id", workspaceId);
  if (!preferred.error) {
    return (preferred.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      kind: typeof row.kind === "string" ? row.kind : null,
    }));
  }
  if (!preferred.error.message.includes("kind")) {
    throw new Error(preferred.error.message);
  }
  const fallback = await supabase
    .from("workspace_objects")
    .select("id, name")
    .eq("workspace_id", workspaceId);
  if (fallback.error) {
    throw new Error(fallback.error.message);
  }
  return (fallback.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    kind: null as string | null,
  }));
}

const CRM_OBJECT_KINDS = new Set(["crm_people", "crm_companies", "crm_deals"]);

function tokenizeIntentText(value: string) {
  return normalizeIntentText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

function scoreObjectNameAgainstHint(objectName: string, hint: string) {
  const objectTokens = tokenizeIntentText(objectName);
  const hintTokens = tokenizeIntentText(hint);
  if (objectTokens.length === 0 || hintTokens.length === 0) {
    return 0;
  }
  let score = 0;
  for (const hintToken of hintTokens) {
    if (objectTokens.includes(hintToken)) {
      score += 2;
      continue;
    }
    if (objectTokens.some((token) => token.startsWith(hintToken) || hintToken.startsWith(token))) {
      score += 1;
    }
  }
  return score;
}

function resolveWorkspaceObjectTarget({
  message,
  preferredObjectName,
  rows,
  candidates,
  kind,
  tableHint,
  excludeCrm,
}: {
  message: string;
  preferredObjectName?: string | null;
  rows: Array<{ id: string; name: string; kind?: string | null }>;
  candidates: string[];
  kind?: "crm_people" | "crm_companies" | "crm_deals" | null;
  tableHint?: string | null;
  excludeCrm?: boolean;
}) {
  const workingRows = excludeCrm
    ? rows.filter((row) => !row.kind || !CRM_OBJECT_KINDS.has(row.kind))
    : rows;

  if (kind) {
    const kindMatch = workingRows.find((row) => row.kind === kind);
    if (kindMatch) {
      return { id: String(kindMatch.id), name: String(kindMatch.name) };
    }
  }

  const normalizedMessage = normalizeIntentText(message);
  const explicitMentions = workingRows.filter((row) => {
    const normalizedObjectName = normalizeIntentText(String(row.name)).replace(/\s+/g, " ").trim();
    if (!normalizedObjectName) {
      return false;
    }
    const mentionPattern = new RegExp(
      `(?:^|\\s|\\b)${escapeRegExp(normalizedObjectName).replace(/\s+/g, "\\s+")}(?:\\b|\\s|$)`,
      "i",
    );
    return mentionPattern.test(normalizedMessage);
  });
  if (explicitMentions.length > 0) {
    return explicitMentions.sort((left, right) => String(right.name).length - String(left.name).length)[0];
  }

  if (tableHint && tableHint.trim().length > 0) {
    const scored = workingRows
      .map((row) => ({ row, score: scoreObjectNameAgainstHint(String(row.name), tableHint) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score);
    if (scored.length > 0) {
      return { id: String(scored[0].row.id), name: String(scored[0].row.name) };
    }
  }

  if (preferredObjectName && preferredObjectName.trim().length > 0) {
    const normalizedPreferred = normalizeIntentText(preferredObjectName);
    const preferredMatch = workingRows.find(
      (row) => normalizeIntentText(String(row.name)) === normalizedPreferred,
    );
    if (preferredMatch) {
      return preferredMatch;
    }
  }

  const normalizedCandidates = new Set(candidates.map((entry) => normalizeIntentText(entry)));
  if (normalizedCandidates.size > 0) {
    for (const row of workingRows) {
      if (normalizedCandidates.has(normalizeIntentText(String(row.name)))) {
        return { id: String(row.id), name: String(row.name) };
      }
    }
  }
  return null;
}

async function listWorkspaceObjectFields(workspaceId: string, objectId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase
    .from("workspace_fields")
    .select("key, name, type, required, sort_order")
    .eq("workspace_id", workspaceId)
    .eq("object_id", objectId)
    .order("sort_order", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as Array<{
    key: string;
    name: string;
    type: string;
    required: boolean;
    sort_order: number;
  }>;
}

type WorkspaceFieldRow = {
  key: string;
  name: string;
  type: string;
  required: boolean;
  sort_order: number;
};

const COLOR_TOKENS = new Set([
  "red",
  "blue",
  "green",
  "black",
  "white",
  "silver",
  "gray",
  "grey",
  "yellow",
  "orange",
  "purple",
  "pink",
  "brown",
  "gold",
  "rojo",
  "rojA",
  "azul",
  "verde",
  "negro",
  "negra",
  "blanco",
  "blanca",
  "plata",
  "plateado",
  "gris",
  "amarillo",
  "naranja",
  "morado",
  "rosa",
  "marron",
  "dorado",
]);

function buildGenericRecordPayload(
  requestedName: string,
  fields: WorkspaceFieldRow[],
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const tokens = requestedName.split(/\s+/).filter((token) => token.length > 0);
  const normalizedTokens = tokens.map((token) => normalizeIntentText(token));

  const takenKeys = new Set<string>();

  const tryAssign = (candidateKeys: string[], matcher: (field: WorkspaceFieldRow) => boolean, value: unknown) => {
    const field = fields.find(
      (entry) =>
        !takenKeys.has(String(entry.key)) &&
        (candidateKeys.includes(slugifyFieldKey(String(entry.key))) || matcher(entry)),
    );
    if (field) {
      payload[String(field.key)] = value;
      takenKeys.add(String(field.key));
      return true;
    }
    return false;
  };

  // Pull out color if present.
  const colorIndex = normalizedTokens.findIndex((token) => COLOR_TOKENS.has(token));
  let residualTokens = tokens;
  if (colorIndex >= 0) {
    const colorValue = tokens[colorIndex];
    const matched = tryAssign(
      ["color", "colour"],
      (field) => normalizeIntentText(field.name).includes("color"),
      colorValue,
    );
    if (matched) {
      residualTokens = tokens.filter((_, index) => index !== colorIndex);
    }
  }

  // Pull out a 4-digit year if present.
  const yearIndex = residualTokens.findIndex((token) => /^(19|20)\d{2}$/.test(token));
  if (yearIndex >= 0) {
    const yearValue = residualTokens[yearIndex];
    const matched = tryAssign(
      ["year", "ano", "anio", "model_year"],
      (field) => /year|ano|anio/i.test(field.name),
      Number.isFinite(Number(yearValue)) ? Number(yearValue) : yearValue,
    );
    if (matched) {
      residualTokens = residualTokens.filter((_, index) => index !== yearIndex);
    }
  }

  const residualName = residualTokens.join(" ").trim() || requestedName;

  // Find the best field for the remaining entity name (required text, then name-like, then first text).
  const nameField =
    fields.find(
      (field) => !takenKeys.has(String(field.key)) && field.required && field.type === "text",
    ) ??
    fields.find(
      (field) =>
        !takenKeys.has(String(field.key)) &&
        ["name", "full_name", "title", "company_name", "model", "product", "item", "descripcion", "description"].includes(
          slugifyFieldKey(String(field.key)),
        ),
    ) ??
    fields.find((field) => !takenKeys.has(String(field.key)) && field.type === "text") ??
    null;

  if (nameField?.key) {
    payload[String(nameField.key)] = residualName;
    takenKeys.add(String(nameField.key));
  } else if (!takenKeys.has("name")) {
    payload.name = residualName;
  }

  // Apply soft defaults for common status/stage enums when present.
  const statusField = fields.find((field) => slugifyFieldKey(String(field.key)) === "status");
  if (statusField && payload[String(statusField.key)] === undefined) {
    payload[String(statusField.key)] = "new";
  }
  const stageField = fields.find((field) => slugifyFieldKey(String(field.key)) === "stage");
  if (stageField && payload[String(stageField.key)] === undefined) {
    payload[String(stageField.key)] = "new";
  }

  return payload;
}

async function tryHandleRecordCreateIntent(
  message: string,
  workspaceIdentifier: string | null,
  preferredObjectName?: string | null,
  requestContext?: { origin: string; cookieHeader?: string } | null,
): Promise<Response | null> {
  if (!workspaceIdentifier) {
    return null;
  }
  const recordIntent = resolveRecordIntentConfig(message);
  if (!recordIntent) {
    return null;
  }

  const workspaceContext = await resolveWorkspaceContext(workspaceIdentifier);
  if (!workspaceContext) {
    return streamActionResponse("[Workspace action] No encontre el workspace para crear el registro.");
  }

  const requestedName = extractEntityNameFromPrompt(message);
  if (!requestedName) {
    return streamActionResponse(
      `[Workspace action] Puedo crear el ${recordIntent.singularLabel} con un solo dato: nombre. Mándame: "crear ${recordIntent.singularLabel} con nombre <nombre>".`,
    );
  }

  // CRM kinds must go through the CRM REST endpoints to preserve dedupe,
  // activity logging, and workflow events.
  if (recordIntent.kind && requestContext) {
    const slug = workspaceContext.workspaceSlug;
    const crmPath =
      recordIntent.kind === "crm_people"
        ? `/api/workspaces/${encodeURIComponent(slug)}/crm/people`
        : recordIntent.kind === "crm_companies"
          ? `/api/workspaces/${encodeURIComponent(slug)}/crm/companies`
          : `/api/workspaces/${encodeURIComponent(slug)}/crm/deals`;
    const body =
      recordIntent.kind === "crm_people"
        ? { fullName: requestedName }
        : recordIntent.kind === "crm_companies"
          ? { name: requestedName }
          : { title: requestedName };
    try {
      const response = await fetch(`${requestContext.origin.replace(/\/$/, "")}${crmPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(requestContext.cookieHeader ? { cookie: requestContext.cookieHeader } : {}),
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        const errorMessage =
          (payload && typeof payload.error === "string" ? payload.error : null) ?? response.statusText;
        return streamActionResponse(
          `[Workspace action] No pude crear el ${recordIntent.singularLabel}: ${errorMessage}`,
        );
      }
      const record = (payload?.record as Record<string, unknown> | undefined) ?? null;
      const matched = payload?.matched === true;
      const recordId = record && typeof record.id === "string" ? record.id : null;
      const idSuffix = recordId ? ` ID: ${recordId.slice(0, 8)}…` : "";
      return streamActionResponse(
        matched
          ? `[Workspace action] Coincidencia encontrada: actualicé el ${recordIntent.singularLabel} existente "${requestedName}".${idSuffix}`
          : `[Workspace action] ${recordIntent.singularLabel} "${requestedName}" creado via CRM (${recordIntent.kind}).${idSuffix} Puedes completar ${recordIntent.optionalPrompt} cuando quieras.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "desconocido";
      return streamActionResponse(`[Workspace action] Error llamando al CRM REST: ${message}`);
    }
  }

  const isGeneric = recordIntent.target === "generic";
  const tableHint = isGeneric ? extractTargetTableHintFromPrompt(message) : null;
  const workspaceObjects = await listWorkspaceObjectsForIntent(workspaceContext.workspaceId);
  const targetObject = resolveWorkspaceObjectTarget({
    message,
    preferredObjectName,
    rows: workspaceObjects,
    candidates: recordIntent.objectCandidates,
    kind: recordIntent.kind,
    tableHint,
    excludeCrm: isGeneric,
  });
  if (!targetObject) {
    if (isGeneric) {
      // Do not intercept: let Hermes answer if we can't confidently pick a table.
      return null;
    }
    const proposal = buildSchemaProposal(message);
    return streamSchemaProposalResponse(
      proposal,
      `[Workspace action] No encontre la tabla para ${recordIntent.singularLabel}. Preparé una propuesta de esquema inicial para continuar.`,
    );
  }

  const fields = (await listWorkspaceObjectFields(
    workspaceContext.workspaceId,
    targetObject.id,
  )) as WorkspaceFieldRow[];

  const payloadData = buildGenericRecordPayload(requestedName, fields);

  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json({ error: "Supabase admin client not configured." }, { status: 500 });
  }

  const { data: createdRecord, error: createError } = await supabase
    .from("records")
    .insert({
      workspace_id: workspaceContext.workspaceId,
      object_id: targetObject.id,
      data: payloadData,
      created_by: currentUser.id,
    })
    .select("id")
    .single();
  if (createError) {
    throw new Error(createError.message);
  }

  const assignedKeys = Object.keys(payloadData);
  const summary =
    assignedKeys.length > 0
      ? assignedKeys
          .map((key) => `${key}="${String(payloadData[key])}"`)
          .slice(0, 4)
          .join(", ")
      : `nombre "${requestedName}"`;

  return streamActionResponse(
    `[Workspace action] ${recordIntent.singularLabel} creado en ${targetObject.name} con ${summary}. Puedes completar ${recordIntent.optionalPrompt} cuando quieras. ID: ${String(createdRecord.id).slice(0, 8)}…`,
  );
}

const IMAGE_NOUN_PATTERN =
  /\b(imagen|imagenes|imágenes|foto|fotos|fotograf[íi]as?|picture|pictures|pic|pics|photo|photos|press photo|press photos|render|renders|mockup|mockups)\b/;
const IMAGE_FIND_VERB_PATTERN =
  /\b(busca|buscar|encuentra|encontrar|muestrame|muéstrame|dame|necesito|quiero|find|show|show me|pull|pull up|give me|get me|i need|i want|grab)\b/;
const IMAGE_GEN_VERB_PATTERN =
  /\b(genera|generar|crea|crear|haz|diseña|disena|render|create|generate|make|draw|produce|design)\b/;
const IMAGE_EDIT_HINT_PATTERN =
  /\b(cambia|cambiar|reemplaza|reemplazar|edita|editar|retoca|retocar|pon\s|ponla|ponlo|edit|change|swap|replace|put it|make it|with\s+(a|the)\s+background)\b/;

type ImageIntent =
  | { kind: "search"; query: string; count: number }
  | { kind: "generate"; prompt: string; refs: string[]; aspect?: "square" | "landscape" | "portrait" };

function extractAspectHint(message: string): "square" | "landscape" | "portrait" | undefined {
  const normalized = normalizeIntentText(message);
  if (/\b(landscape|horizontal|wide|panoramic|16\s*[:\/x]\s*9)\b/.test(normalized)) return "landscape";
  if (/\b(portrait|vertical|tall|9\s*[:\/x]\s*16)\b/.test(normalized)) return "portrait";
  if (/\b(square|cuadrad[oa]|1\s*[:\/x]\s*1)\b/.test(normalized)) return "square";
  return undefined;
}

function extractImageCount(message: string): number {
  const match = message.match(/\b(\d{1,2})\s*(?:pics?|pictures?|photos?|fotos?|im[aá]genes?)\b/i);
  if (match) {
    const n = Number.parseInt(match[1], 10);
    if (Number.isFinite(n) && n > 0) return Math.min(Math.max(n, 1), 16);
  }
  return 4;
}

function extractImageRefsFromHistory(history?: ChatHistoryMessage[]): string[] {
  if (!Array.isArray(history)) return [];
  const refs: string[] = [];
  const urlPattern = /https?:\/\/[^\s)"'<>]+/g;
  for (let i = history.length - 1; i >= 0 && refs.length < 2; i -= 1) {
    const entry = history[i];
    if (!entry || typeof entry.content !== "string") continue;
    const matches = entry.content.match(urlPattern);
    if (!matches) continue;
    for (const url of matches) {
      if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) || /supabase\.co\/storage/i.test(url)) {
        if (!refs.includes(url)) refs.push(url);
        if (refs.length >= 2) break;
      }
    }
  }
  return refs;
}

function detectImageIntent(message: string, history?: ChatHistoryMessage[]): ImageIntent | null {
  if (!IMAGE_NOUN_PATTERN.test(normalizeIntentText(message))) {
    return null;
  }
  const normalized = normalizeIntentText(message);
  const refs = extractImageRefsFromHistory(history);
  const aspect = extractAspectHint(message);
  const count = extractImageCount(message);

  // If the user references a prior image AND asks for an edit, generate img2img.
  if (refs.length > 0 && (IMAGE_EDIT_HINT_PATTERN.test(normalized) || IMAGE_GEN_VERB_PATTERN.test(normalized))) {
    return { kind: "generate", prompt: message.trim(), refs, aspect };
  }

  // Explicit "generate/create/render an image" without refs → text-to-image.
  if (
    IMAGE_GEN_VERB_PATTERN.test(normalized) &&
    !IMAGE_FIND_VERB_PATTERN.test(normalized) &&
    // Avoid hijacking "crea un registro / lead / oportunidad" even when image words appear nearby.
    !/\b(lead|leads|deal|deals|registro|tabla|empresa|company|task|tarea)\b/.test(normalized)
  ) {
    return { kind: "generate", prompt: message.trim(), refs, aspect };
  }

  // Default: treat as a web image search when the user clearly asks to find photos.
  if (IMAGE_FIND_VERB_PATTERN.test(normalized) || IMAGE_NOUN_PATTERN.test(normalized)) {
    return { kind: "search", query: message.trim(), count };
  }

  return null;
}

function streamImageToolResult({
  toolName,
  toolId,
  result,
  introMessage,
}: {
  toolName: "images.search" | "images.generate";
  toolId: string;
  result: { ok: boolean; data?: unknown; error?: string };
  introMessage: string;
}) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(formatSse({ type: "delta", content: introMessage })));
      controller.enqueue(
        encoder.encode(formatSse({ type: "tool_result", id: toolId, name: toolName, result })),
      );
      controller.enqueue(encoder.encode(formatSse({ type: "done" })));
      controller.close();
    },
  });
  return new Response(stream, { headers: sseHeaders });
}

type ExplicitImageIntent = {
  kind?: string;
  query?: string;
} | null | undefined;

function resolveImageIntentKind(toolIntent: ExplicitImageIntent): "search" | "generate" | null {
  if (!toolIntent || typeof toolIntent.kind !== "string") return null;
  const normalized = toolIntent.kind.toLowerCase().replace(/[\s._-]+/g, "");
  if (normalized === "imagesearch" || normalized === "imagesearchweb" || normalized === "searchimages") {
    return "search";
  }
  if (
    normalized === "imagegenerate" ||
    normalized === "imagegen" ||
    normalized === "generateimage" ||
    normalized === "imagegeneration"
  ) {
    return "generate";
  }
  return null;
}

async function tryHandleImageIntent(
  message: string,
  workspaceIdentifier: string | null,
  history: ChatHistoryMessage[] | undefined,
  requestContext: { origin: string; cookieHeader?: string },
  explicitIntent?: ExplicitImageIntent,
): Promise<Response | null> {
  if (!workspaceIdentifier) return null;

  const forced = resolveImageIntentKind(explicitIntent);
  let intent: ImageIntent | null;
  if (forced === "search") {
    const query =
      (typeof explicitIntent?.query === "string" && explicitIntent.query.trim()) || message.trim();
    if (!query) return null;
    intent = { kind: "search", query, count: extractImageCount(message) };
  } else if (forced === "generate") {
    const prompt =
      (typeof explicitIntent?.query === "string" && explicitIntent.query.trim()) || message.trim();
    if (!prompt) return null;
    intent = {
      kind: "generate",
      prompt,
      refs: extractImageRefsFromHistory(history),
      aspect: extractAspectHint(message),
    };
  } else {
    intent = detectImageIntent(message, history);
  }
  if (!intent) return null;

  const workspaceContext = await resolveWorkspaceContext(workspaceIdentifier);
  if (!workspaceContext) return null;

  const ctx = {
    workspaceSlug: workspaceContext.workspaceSlug,
    origin: requestContext.origin,
    cookieHeader: requestContext.cookieHeader,
  };

  try {
    const mod = await import("@/lib/agentTools/executor");
    if (intent.kind === "search") {
      const result = await mod.runTool({
        name: "images.search",
        args: { query: intent.query, count: intent.count },
        ctx,
      });
      if (!result.ok) {
        return streamActionResponse(
          `[Workspace action] No pude buscar imágenes: ${result.error ?? "error desconocido"}.`,
        );
      }
      return streamImageToolResult({
        toolName: "images.search",
        toolId: `fallback-search-${Date.now()}`,
        result,
        introMessage: `Busqué fotos para "${intent.query}". Elige una para guardarla.`,
      });
    }

    const result = await mod.runTool({
      name: "images.generate",
      args: {
        prompt: intent.prompt,
        refs: intent.refs.length > 0 ? intent.refs : undefined,
        n: 4,
        aspect: intent.aspect,
      },
      ctx,
    });
    if (!result.ok) {
      return streamActionResponse(
        `[Workspace action] No pude generar imágenes: ${result.error ?? "error desconocido"}.`,
      );
    }
    return streamImageToolResult({
      toolName: "images.generate",
      toolId: `fallback-generate-${Date.now()}`,
      result,
      introMessage:
        intent.refs.length > 0
          ? `Generé variantes usando la imagen de referencia. Elige una para guardarla.`
          : `Generé 4 imágenes para tu prompt. Elige una para guardarla.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error ejecutando herramienta de imágenes.";
    return streamActionResponse(`[Workspace action] ${errorMessage}`);
  }
}

async function resolveAgentRuntime(payload: ChatRequest) {
  const supabase = getSupabaseAdmin();
  const requestedAgentId = payload.agent_id ?? payload.agentId;
  const requestedWorkspaceId = payload.workspace_id ?? payload.workspaceId;

  if (!supabase || !requestedAgentId) {
    return null;
  }

  let scopedWorkspaceId = requestedWorkspaceId;

  if (requestedWorkspaceId && !/^[0-9a-fA-F-]{36}$/.test(requestedWorkspaceId)) {
    const { data: workspaceRow, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("subdomain", requestedWorkspaceId)
      .maybeSingle();

    if (workspaceError) {
      throw new Error(workspaceError.message);
    }

    scopedWorkspaceId = workspaceRow?.id ? String(workspaceRow.id) : requestedWorkspaceId;
  }

  let query = supabase
    .from("workspace_agents")
    .select("id, workspace_id, name, api_endpoint, api_key, status, soul_md, skills, knowledge_scope")
    .eq("id", requestedAgentId)
    .limit(1);

  if (scopedWorkspaceId && /^[0-9a-fA-F-]{36}$/.test(scopedWorkspaceId)) {
    query = query.eq("workspace_id", scopedWorkspaceId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return data as AgentRuntimeRecord;
}

function agentSupportsWebIntent(agent: AgentRuntimeRecord) {
  const skillTokens = (agent.skills ?? []).map((skill) => normalizeIntentText(String(skill))).map((value) =>
    value.replace(/[\s._-]+/g, ""),
  );
  const hasSkill =
    skillTokens.includes("web") ||
    skillTokens.includes("websearch") ||
    skillTokens.includes("webextract") ||
    skillTokens.includes("browser") ||
    skillTokens.includes("browsernavigate");
  const scope = (agent.knowledge_scope ?? {}) as Record<string, unknown>;
  const scopeWebEnabled = scope.web_enabled === true || scope.browser_enabled === true;
  return hasSkill || scopeWebEnabled;
}

async function proxyToHermes({
  payload,
  baseUrl,
  apiKey,
  model,
  agent,
  workspaceContext,
  conversationContext,
  toolContext,
  clientSignal,
}: {
  payload: ChatRequest & { message: string };
  baseUrl: string;
  apiKey: string;
  model?: string;
  agent?: AgentRuntimeRecord | null;
  workspaceContext?: {
    workspaceId: string;
    workspaceName: string;
    workspaceSlug: string;
    objectNames: string[];
    agentNames: string[];
    recentActions: string[];
  } | null;
  conversationContext?: ConversationPersistContext | null;
  toolContext?: { workspaceSlug: string; origin: string; cookieHeader?: string } | null;
  clientSignal?: AbortSignal;
}) {
  const appContext = payload.app_context ?? payload.appContext ?? null;
  const toolIntent = payload.tool_intent ?? payload.toolIntent ?? null;
  const scrubberNotes: string[] = [];
  if (conversationContext?.workspaceId && typeof payload.message === "string") {
    try {
      const scrubbed = await scrubAndStoreSecrets(payload.message, {
        workspaceId: conversationContext.workspaceId,
        createdBy: conversationContext.createdBy ?? null,
      });
      if (scrubbed.detected) {
        payload.message = scrubbed.scrubbedContent;
        scrubberNotes.push(...scrubbed.systemNotes);
      }
    } catch (error) {
      console.error("secretScrubber failed", error);
    }
  }
  const { recordIds: rawAttachmentRecordIds, folderIds: attachmentFolderIds } =
    normalizeAttachmentRefs(payload.attachment_refs, payload.attachmentRefs);
  const attachmentRecordIds = [...rawAttachmentRecordIds];
  const attachmentLines: string[] = [];
  const pdfAttachmentIds: string[] = [];
  if ((attachmentRecordIds.length > 0 || attachmentFolderIds.length > 0) && agent?.workspace_id) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const folderNameById = new Map<string, string>();
      if (attachmentFolderIds.length > 0) {
        const { data: folderRows } = await supabase
          .from("workspace_folders")
          .select("id, name")
          .in("id", attachmentFolderIds)
          .eq("workspace_id", agent.workspace_id);
        if (Array.isArray(folderRows)) {
          for (const row of folderRows) {
            if (typeof row.id === "string" && typeof row.name === "string") {
              folderNameById.set(row.id, row.name);
            }
          }
        }
        const { data: folderMemberRows } = await supabase
          .from("records")
          .select("id")
          .in("folder_id", attachmentFolderIds)
          .eq("workspace_id", agent.workspace_id)
          .is("deleted_at", null);
        if (Array.isArray(folderMemberRows)) {
          for (const row of folderMemberRows) {
            if (typeof row.id === "string" && !attachmentRecordIds.includes(row.id)) {
              attachmentRecordIds.push(row.id);
            }
          }
        }
        for (const folderId of attachmentFolderIds) {
          const label = folderNameById.get(folderId) ?? folderId;
          attachmentLines.push(`- Carpeta "${label}" [folderId: ${folderId}]`);
        }
      }
      const attachmentRowsResult = attachmentRecordIds.length > 0
        ? await supabase
            .from("records")
            .select("id, data")
            .in("id", attachmentRecordIds)
            .eq("workspace_id", agent.workspace_id)
        : { data: [] as Array<{ id: string; data: Record<string, unknown> | null }> };
      const attachmentRows = attachmentRowsResult.data;
      if (Array.isArray(attachmentRows)) {
        for (const row of attachmentRows) {
          const data = ((row.data as Record<string, unknown>) ?? {}) as Record<string, unknown>;
          const name = typeof data.document_name === "string" ? data.document_name : row.id;
          const kind = typeof data.kind === "string" ? data.kind : "other";
          const storagePath = typeof data.storage_path === "string" ? data.storage_path : null;
          const mimeType = typeof data.mime_type === "string" ? data.mime_type : "";

          type PreviewSheet = {
            name?: string;
            headers?: unknown;
            sampleRows?: unknown;
            rowCount?: unknown;
          };
          type PreviewShape = { kind?: string; sheets?: PreviewSheet[] } | null | undefined;
          let preview = data.preview as PreviewShape;
          const hasSheetContent =
            preview && Array.isArray(preview.sheets) && preview.sheets.some(
              (sheet) => Array.isArray(sheet?.headers) && (sheet.headers as unknown[]).length > 0,
            );

          // Fallback: legacy uploads (before the parsing pipeline) never populated data.preview.
          // Re-parse lazily from Storage the first time we reference them in chat.
          const looksLikeSpreadsheet =
            kind === "spreadsheet" ||
            (typeof name === "string" && /\.(xlsx|xls|csv)$/i.test(name)) ||
            mimeType.includes("spreadsheet") ||
            mimeType === "text/csv";

          if (!hasSheetContent && looksLikeSpreadsheet && storagePath) {
            try {
              const bucket = getAssetBucketName();
              const { data: downloaded } = await supabase.storage.from(bucket).download(storagePath);
              if (downloaded) {
                const buffer = await downloaded.arrayBuffer();
                const ext = (typeof name === "string" ? name : "").toLowerCase().split(".").pop() ?? "";
                let sheets: Array<{ name: string; headers: string[]; sampleRows: Record<string, unknown>[]; rowCount: number }> = [];
                if (ext === "csv" || mimeType === "text/csv") {
                  const text = new TextDecoder("utf-8").decode(buffer);
                  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
                  if (lines.length > 0) {
                    const headers = lines[0].split(",").map((entry) => entry.trim()).filter(Boolean);
                    const dataLines = lines.slice(1);
                    const sampleRows = dataLines.slice(0, 50).map((line) => {
                      const cells = line.split(",");
                      return headers.reduce<Record<string, unknown>>((acc, header, index) => {
                        acc[header] = cells[index]?.trim() ?? "";
                        return acc;
                      }, {});
                    });
                    sheets = [{ name: "Sheet1", headers, sampleRows, rowCount: dataLines.length }];
                  }
                } else {
                  // Lazy load XLSX only when a real spreadsheet is attached.
                  // This keeps the chat route module graph small for the
                  // common text-only case.
                  const XLSX = await import("xlsx");
                  const workbook = XLSX.read(buffer, { type: "array" });
                  type SheetPreview = { name: string; headers: string[]; sampleRows: Record<string, unknown>[]; rowCount: number };
                  sheets = workbook.SheetNames.map((sheetName: string): SheetPreview | null => {
                    const sheet = workbook.Sheets[sheetName];
                    if (!sheet) return null;
                    const { headers, rows: cleanedRows } = smartExtractSheet(sheet);
                    return {
                      name: sheetName,
                      headers,
                      sampleRows: cleanedRows.slice(0, 50),
                      rowCount: cleanedRows.length,
                    };
                  }).filter((entry): entry is SheetPreview => entry !== null);
                }
                if (sheets.length > 0) {
                  preview = { kind: "spreadsheet", sheets };
                  await supabase
                    .from("records")
                    .update({ data: { ...data, kind: "spreadsheet", preview } })
                    .eq("id", row.id);
                }
              }
            } catch {
              // Silent fallback: if reparse fails we still emit the name + id below.
            }
          }

          const firstSheet =
            preview && Array.isArray(preview.sheets) && preview.sheets.length > 0 ? preview.sheets[0] : null;
          const headers = Array.isArray(firstSheet?.headers)
            ? (firstSheet!.headers as unknown[]).filter((entry): entry is string => typeof entry === "string")
            : [];
          const sampleRows = Array.isArray(firstSheet?.sampleRows)
            ? (firstSheet!.sampleRows as unknown[])
                .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
                .slice(0, 8)
            : [];
          const rowCount = typeof firstSheet?.rowCount === "number" ? firstSheet.rowCount : null;

          attachmentLines.push(
            `- ${name} [recordId: ${row.id}] · tipo: ${kind}${
              headers.length > 0 ? ` · columnas: ${headers.slice(0, 16).join(", ")}` : ""
            }${rowCount !== null ? ` · filas totales: ${rowCount}` : ""}`,
          );

          const publicUrl = typeof data.public_url === "string" ? data.public_url : "";
          const isPdf = kind === "pdf" || mimeType === "application/pdf" || /\.pdf$/i.test(name);
          if (isPdf) {
            pdfAttachmentIds.push(row.id);
            if (publicUrl) {
              attachmentLines.push(`    Public URL (for tools): ${publicUrl}`);
            }
            const pdfPreview =
              preview && typeof preview === "object" && (preview as Record<string, unknown>).kind === "pdf"
                ? (preview as Record<string, unknown>)
                : null;
            if (pdfPreview) {
              const pageCount = typeof pdfPreview.pageCount === "number" ? pdfPreview.pageCount : null;
              const textLength = typeof pdfPreview.textLength === "number" ? pdfPreview.textLength : null;
              const ocrUsed = pdfPreview.ocrUsed === true;
              const excerpt = typeof pdfPreview.excerpt === "string" ? pdfPreview.excerpt.trim() : "";
              const metaParts: string[] = [];
              if (pageCount !== null) metaParts.push(`${pageCount} páginas`);
              if (textLength !== null) metaParts.push(`${textLength.toLocaleString("es-MX")} caracteres`);
              if (ocrUsed) metaParts.push("OCR con visión");
              if (metaParts.length > 0) {
                attachmentLines.push(`    PDF preanalizado: ${metaParts.join(" · ")}.`);
              }
              if (excerpt.length > 0) {
                const snippet = excerpt.slice(0, 1_500);
                attachmentLines.push(
                  `    Extracto del PDF (primeros ~${snippet.length} caracteres, usa documents.analyze para el texto completo):`,
                );
                for (const line of snippet.split(/\r?\n/).slice(0, 24)) {
                  const trimmed = line.trim();
                  if (trimmed.length > 0) attachmentLines.push(`      ${trimmed.slice(0, 200)}`);
                }
              }
            }
          }

          if (sampleRows.length > 0 && headers.length > 0) {
            const headerSubset = headers.slice(0, 8);
            const rendered = sampleRows.map((row, index) => {
              const parts = headerSubset
                .map((header) => {
                  const raw = row[header];
                  const value =
                    raw === null || raw === undefined
                      ? ""
                      : typeof raw === "string"
                        ? raw.slice(0, 80)
                        : typeof raw === "number" || typeof raw === "boolean"
                          ? String(raw)
                          : JSON.stringify(raw).slice(0, 80);
                  return `${header}=${value}`;
                })
                .join(" | ");
              return `    ${index + 1}. ${parts}`;
            });
            attachmentLines.push(`  Muestra de filas (primeras ${sampleRows.length}):`);
            attachmentLines.push(...rendered);
          }
        }
      }
    }
  }
  const conversationId =
    payload.conversation_id ??
    payload.conversationId ??
    (agent ? `${agent.workspace_id}:${agent.id}` : process.env.HERMES_DEFAULT_CONVERSATION) ??
    undefined;

  const appContextLines =
    appContext
      ? (() => {
          const base: string[] = [
            `Current UI tab: ${appContext.current_tab ?? "unknown"}`,
            `Current dataset: ${appContext.current_object ?? "none"}`,
            `Current view: ${appContext.current_view ?? "none"}`,
            `Current record: ${appContext.current_record_title ?? "none"}`,
            `Queue preview: ${appContext.queue_preview?.join(", ") || "none"}`,
          ];
          if (typeof appContext.dataset_object_id === "string" && appContext.dataset_object_id) {
            base.push(`Dataset object id: ${appContext.dataset_object_id}`);
          }
          if (typeof appContext.dataset_object_slug === "string" && appContext.dataset_object_slug) {
            base.push(`Dataset object slug (rename-proof — pass as objectSlug in records.*): ${appContext.dataset_object_slug}`);
          }
          if (typeof appContext.dataset_search_query === "string" && appContext.dataset_search_query) {
            base.push(`Active search filter: ${appContext.dataset_search_query}`);
          } else if (appContext.dataset_search_query === null) {
            base.push("Active search filter: none");
          }
          if (typeof appContext.visible_record_count === "number") {
            base.push(`Visible rows in current grid: ${appContext.visible_record_count}`);
          }
          if (Array.isArray(appContext.dataset_field_catalog) && appContext.dataset_field_catalog.length > 0) {
            const catalogLine = appContext.dataset_field_catalog
              .map((f) => {
                const flags = [f.required ? "*" : "", f.hidden ? "hidden" : ""].filter(Boolean).join(",");
                return flags ? `${f.key}:${f.type}(${flags})` : `${f.key}:${f.type}`;
              })
              .join(", ");
            base.push(`Field catalog (use these keys in filter.rules[].field): ${catalogLine}`);
          } else if (typeof appContext.dataset_field_summary === "string" && appContext.dataset_field_summary) {
            base.push(`Column schema: ${appContext.dataset_field_summary}`);
          }
          return base;
        })()
      : [];
  const soulInstructions =
    typeof agent?.soul_md === "string" && agent.soul_md.trim().length > 0
      ? [
          `Agent SOUL.md instructions (your persona and primary mission):\n${agent.soul_md.trim()}`,
          "Scope override: the SOUL.md describes your PRIMARY focus, not a hard restriction. The `images.*`, `integrations.*`, `recipes.*`, `automations.*`, `skills.*`, and `cms.*` tool namespaces are platform utilities that are ALWAYS in-scope for every agent in every workspace. When the user asks for a picture, an external API call, a website inventory update, or a scheduled automation, you MUST call the relevant tool — never refuse on persona grounds and never redirect the user back to your queue. After the utility task is done you can resume your primary workflow.",
        ]
      : [
          "Scope: the `images.*`, `integrations.*`, `recipes.*`, `automations.*`, `skills.*`, and `cms.*` tool namespaces are platform utilities available in every chat. Use them whenever the user asks for an image, an external API call, a saved-recipe replay, a scheduled automation, or a CMS update.",
        ];

  // Build a compact, rename-proof catalog of the workspace objects the agent
  // can reason about without guessing from memory. Kept small to respect the
  // no_prompt_bloat constraint: up to 20 objects (with the open dataset
  // prioritized) and up to 8 top fields per object. The agent can ask for the
  // full picture on demand via `schema.catalog`.
  const catalogLines: string[] = [];
  const datasetObjectIdForCatalog =
    typeof appContext?.dataset_object_id === "string" && appContext.dataset_object_id.length > 0
      ? appContext.dataset_object_id
      : null;
  let focusObjectSlug: string | null =
    typeof appContext?.dataset_object_slug === "string" && appContext.dataset_object_slug.length > 0
      ? appContext.dataset_object_slug
      : null;
  if (toolContext && workspaceContext?.workspaceId) {
    try {
      const catalog = await buildWorkspaceCatalog(workspaceContext.workspaceId, {
        focusObjectId: datasetObjectIdForCatalog,
      });
      catalogLines.push(...renderCatalogForPrompt(catalog));
      if (!focusObjectSlug && datasetObjectIdForCatalog) {
        const focused = catalog.objects.find((o) => o.id === datasetObjectIdForCatalog);
        if (focused?.slug) {
          focusObjectSlug = focused.slug;
        }
      }
    } catch (error) {
      console.warn("workspaceCatalog build failed", error);
    }
  }

  const toolEnvelopeLines =
    toolContext
      ? (() => {
          const registered = describeToolsForPrompt();
          const byNs = new Map<string, string[]>();
          for (const t of registered) {
            const ns = t.name.includes(".") ? t.name.split(".")[0] : "general";
            if (!byNs.has(ns)) byNs.set(ns, []);
            byNs.get(ns)!.push(t.name);
          }
          const groups = Array.from(byNs.entries())
            .map(([ns, names]) => `${ns}: ${names.sort().join(", ")}`)
            .join(" | ");

          // Build the tool-call examples off of the currently-open dataset when
          // we know its slug, so the agent has a concrete, always-correct
          // template instead of a generic one that depends on legacy aliases.
          const exampleSlug = focusObjectSlug ?? "<objectSlug-from-catalog>";
          const queryExample = {
            type: "tool_call",
            id: "tc_1",
            name: "records.query",
            args: {
              objectSlug: exampleSlug,
              filter: {
                logical: "and",
                rules: [
                  { field: "modelo", op: "contains", value: "TERRITORY" },
                  { field: "version", op: "contains", value: "TITANIUM" },
                ],
              },
              limit: 50,
            },
          };
          const bulkExample = {
            type: "tool_call",
            id: "tc_2",
            name: "records.bulk_update",
            args: {
              objectSlug: exampleSlug,
              filter: {
                logical: "and",
                rules: [{ field: "modelo", op: "contains", value: "TERRITORY" }],
              },
              patch: { precio: 650000 },
            },
          };

          return [
            "Tool envelope: you may invoke platform tools by emitting SSE data frames of the shape {\"type\":\"tool_call\",\"id\":\"<unique>\",\"name\":\"<tool>\",\"args\":{...}} before text. The platform executes each and replies with a tool_result frame containing {ok, data} or {ok:false, error}. Always emit `tool_call` with an underscore and the exact registry name (e.g. `cms.list_inventory`, not `cms.listinventory`). Prefer tool calls for any write (create/update/delete/stage/assign/import), for reading CRM or custom object lists, for searching/generating/saving images, and for calling configured third-party integrations.",
            `Available tools by namespace — ${groups}.`,
            ...catalogLines,
            "Datos query contract: when the user mentions a workspace object, use the #CATALOG above. ALWAYS pass `objectSlug` from the catalog (it survives renames and is the shortest stable reference). Pass the FULL 36-char `objectId` only if you're retrying a slug that was rejected; NEVER pass a partial/truncated id (e.g. the 8-char prefix — that's display-only). For filter rules, `field` should be the field's stable `key` from the catalog. If the user's phrase doesn't match any catalog slug clearly, STOP and ask the user a short clarifying question listing the top 3 candidate slugs from the catalog — do NOT guess, and do NOT emit multiple speculative tool_calls in the same turn. Only call `schema.catalog` when the catalog is marked truncated or the user named something that isn't in the catalog at all. If records.query returns `{reason:\"object_not_found\", retryWith:[slug, ...]}`, retry once with the first slug in retryWith; if it returns `{reason:\"unknown_fields\"}` or `{reason:\"needs_disambiguation\"}`, read the structured error and retry with the suggested `key` or `id`.",
            "Confirm-before-commit rule: EVERY write tool (records.create, records.update, records.delete, records.bulk_update, records.bulk_delete, cms.push_inventory, crm.delete_*) MUST be issued twice. FIRST call with `dryRun:true` (the default) — you will receive `{ proposal, confirmToken, expiresAt }` and the chat UI will show the user a confirmation card. WAIT for the user's confirmation (a follow-up user message that includes the confirmToken, usually prefixed \"user confirmed\"). THEN re-issue the SAME tool_call with `dryRun:false` and `confirmToken:\"<token>\"` to commit. If the user says cancel/no/stop, acknowledge and abandon the write. Never commit silently, never call a write tool with dryRun:false on your own.",
            `Example read: ${JSON.stringify(queryExample)}`,
            `Example propose-then-commit: first ${JSON.stringify(bulkExample)} → receive proposal+confirmToken → wait for user's Confirm → second {\"type\":\"tool_call\",\"id\":\"tc_3\",\"name\":\"records.bulk_update\",\"args\":{...same args...,\"dryRun\":false,\"confirmToken\":\"v1.abc...\"}}.`,
            "Notes: images.search uses SerpAPI and images.generate uses OpenRouter → google/gemini-2.5-flash-image-preview (nano-banana). integrations.call / integrations.sync_leads operate on credentials stored in the per-workspace vault; call integrations.list first to discover configured slugs. cms.push_inventory pushes to external sites like gb-automotriz over an HMAC-signed webhook.",
            "Integration learning loop: whenever you call an API for the first time, your workflow is (1) integrations.list to see what's configured, (2) integrations.probe a likely endpoint to see status/shape/sample, (3) once you have a known-good call, `recipes.save` it with a descriptive name and {{var}} placeholders for user-supplied values, (4) next time reuse it via `recipes.call` with `vars` — do NOT re-probe known endpoints. After saving, call `skills.publish_recipe` so future sessions inherit the SKILL.md. If the user pastes a fresh API key for a vendor we don't have a dedicated provider for, tell them to add it in Settings → Integrations using provider `custom_api` (or do it on their behalf by explaining the required config).",
            "Automations rule: when the user describes recurring work (\"check every 30 minutes\", \"every morning\", \"when X happens do Y\"), use `automations.create` to materialize it as a workflow. Cron schedules use 5-field cron (`*/30 * * * *` = every 30 min; tick granularity is 5 min). Steps can chain saved recipes via `{ \"type\": \"run_recipe\", \"integrationSlug\": \"...\", \"recipeSlug\": \"...\", \"vars\": { ... }, \"saveAs\": \"stepKey\" }` and later steps can reference prior step outputs via `{{steps.stepKey.data.<path>}}` in their own vars/templates. Offer `automations.run_now` to let the user smoke-test before waiting for the next tick. Use `automations.list` / `automations.update` / `automations.disable` to inspect and modify existing ones.",
            "Mandatory rule: if the user asks for an image, an online lookup, an API call against a configured integration, a CMS push, or any data exploration/modification of workspace records, you MUST emit the matching tool_call. Do NOT respond with 'I don't have image tools', 'searching is out of scope', or 'I'm focused on factoring/CRM/etc.' Tool availability is determined by the registry above, not by your persona. If a required integration is missing, call integrations.list first; if empty, instruct the user to add it in Settings → Integrations and tell them the exact provider+slug you need.",
            "Document extraction rule: when the user attaches a document (PDF, spreadsheet, CSV, text) and asks you to read, summarize, extract values from it, or use it to update records, your FIRST tool_call must be `documents.analyze` with `{ recordId: \"<the attachment recordId shown in the prompt>\" }`. Do NOT call any vision/image tool on PDFs. Do NOT ask the user to re-upload. Do NOT guess the contents. The attachment lines of this prompt include lines like `- <filename> [recordId: <uuid>] · tipo: pdf` — use that recordId. Example: {\"type\":\"tool_call\",\"id\":\"tc_1\",\"name\":\"documents.analyze\",\"args\":{\"recordId\":\"<uuid>\"}}. Only after you receive the tool_result with the extracted text should you propose follow-up writes (e.g. `records.bulk_update` with dryRun:true to change prices).",
          ];
        })()
      : [];

  const inputLines = [
    ...soulInstructions,
    ...(workspaceContext
      ? [
          `Workspace context: ${workspaceContext.workspaceName} (${workspaceContext.workspaceSlug})`,
          `Workspace ID: ${workspaceContext.workspaceId}`,
          `Objects: ${workspaceContext.objectNames.join(", ") || "none"}`,
          `Agents: ${workspaceContext.agentNames.join(", ") || "none"}`,
          `Recent activity: ${workspaceContext.recentActions.join(", ") || "none"}`,
          "Platform capability note: every object above (including datasets created from CSV/XLSX imports such as 'Eas 17') is writable through POST /api/workspaces/" +
            workspaceContext.workspaceSlug +
            "/records with { objectId, data }. Imported tables are NOT read-only, and record creation is NOT limited to CRM objects (Companies/Leads/Deals/Rate Offers). Only CRM kinds (crm_people/crm_companies/crm_deals) must go through the dedicated CRM endpoints to preserve dedupe and activity logging. Do not refuse a write request by claiming the table is imported.",
        ]
      : []),
    ...appContextLines,
    ...toolEnvelopeLines,
    ...(scrubberNotes.length > 0
      ? [
          "Security notice (agent-only, do not echo verbatim to user):",
          ...scrubberNotes.map((note) => `- ${note}`),
        ]
      : []),
    ...(toolIntent?.kind === "web_lookup"
      ? [
          `Tool intent: web_lookup (${toolIntent.mode ?? "web"})`,
          `User web query: ${typeof toolIntent.query === "string" ? toolIntent.query : payload.message.trim()}`,
          "Use web or browser tools if available and return concise, actionable findings.",
        ]
      : []),
    ...(attachmentLines.length > 0
      ? [
          "Documentos referenciados por el usuario (tienes acceso directo a sus columnas y una muestra de filas abajo; úsalos para responder preguntas concretas sin pedir que los vuelvan a subir):",
          ...attachmentLines,
        ]
      : []),
    ...(pdfAttachmentIds.length > 0
      ? [
          "Instrucciones para PDFs adjuntos:",
          "- Si necesitas el contenido completo del PDF (más allá del extracto mostrado), llama `documents.analyze` con el `recordId` del PDF antes de responder.",
          "- Si el usuario pide comparar, actualizar o insertar registros a partir del PDF (por ejemplo promos de autos, listas de precios, catálogos): primero localiza los registros existentes con `objects.list` + `records.query`, luego propone los cambios con `records.update` / `records.create` / `records.bulk_update` / `crm.*` usando `dryRun:true`.",
          `- Incluye SIEMPRE \`sourceDocumentId: "${pdfAttachmentIds[0]}"\`${pdfAttachmentIds.length > 1 ? " (o el recordId del PDF correspondiente)" : ""} en los args de la propuesta de escritura para que el cambio quede trazado al PDF fuente.`,
          "- NUNCA escribas directamente: siempre debe aparecer la tarjeta de confirmación (WriteProposalCard) y el usuario debe aprobar antes de volver a llamar el tool con `dryRun:false` + `confirmToken`.",
        ]
      : []),
    payload.message.trim(),
  ].filter((line) => line.length > 0);

  const requestBody: Record<string, unknown> = {
    input: inputLines.join("\n"),
    conversation: conversationId,
    stream: true,
    store: true,
    // Give Hermes enough headroom to finish tool_call envelopes. The default
    // was producing truncated JSON (missing final `}}`) which leaked as text.
    max_output_tokens: Number(process.env.HERMES_MAX_OUTPUT_TOKENS ?? 4096),
    metadata: {
      ...(agent ? { agent_id: agent.id, workspace_id: agent.workspace_id, agent_name: agent.name } : {}),
      ...(payload.agent_id || payload.agentId ? { requested_agent_id: payload.agent_id ?? payload.agentId } : {}),
    },
  };

  if (model) {
    requestBody.model = model;
  }

  await persistConversationMessage(conversationContext ?? null, "user", payload.message.trim());

  const hermesUrl = `${baseUrl.replace(/\/$/, "")}/v1/responses`;
  const hermesHeaders = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const hermesBody = JSON.stringify(requestBody);
  // Retry up to 3 times with linear backoff on connect/transient errors.
  // Covers cold starts and one-off UND_ERR_CONNECT_TIMEOUT flakes.
  // Timeout budget is generous: Hermes can take 20-60s on first response (large
  // system prompt + cold agent state). We only time the HEADERS/connect phase;
  // once fetch() resolves the stream is handed off and the timer is cleared.
  const firstAttemptTimeoutMs = Number(process.env.HERMES_CONNECT_TIMEOUT_MS ?? 90000);
  const retryTimeoutMs = Number(process.env.HERMES_RETRY_TIMEOUT_MS ?? 120000);
  let hermesResponse: Response | null = null;
  let lastError: unknown = null;
  const dispatcherInit = await hermesFetchInit();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        attempt === 1 ? firstAttemptTimeoutMs : retryTimeoutMs,
      );
      // Combine our connect/headers timeout with the caller's signal so a
      // client disconnect aborts the upstream request immediately.
      const signals: AbortSignal[] = [controller.signal];
      if (clientSignal) signals.push(clientSignal);
      const combinedSignal =
        signals.length === 1 ? signals[0] : (AbortSignal as unknown as { any: (list: AbortSignal[]) => AbortSignal }).any(signals);
      hermesResponse = await fetch(hermesUrl, {
        method: "POST",
        headers: hermesHeaders,
        body: hermesBody,
        signal: combinedSignal,
        ...dispatcherInit,
      });
      clearTimeout(timeout);
      break;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const isAbort = message.includes("aborted") || message.includes("AbortError");
      console.warn(
        `[chat] Hermes fetch attempt ${attempt}/3 failed${isAbort ? " (timeout)" : ""}:`,
        message.slice(0, 200),
      );
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }
  if (!hermesResponse) {
    const detail = lastError instanceof Error ? lastError.message : "network error";
    const isTimeout = detail.includes("aborted") || detail.includes("AbortError") || detail.includes("timeout");
    const message = isTimeout
      ? `Hermes tardó demasiado en responder (>${Math.round(retryTimeoutMs / 1000)}s tras 3 intentos). El runtime puede estar frío o saturado; intenta de nuevo en unos segundos.`
      : `Hermes runtime is unreachable (${detail}). Check HERMES_API_BASE_URL or try again in a moment.`;
    return Response.json({ error: message }, { status: 502 });
  }
  if (!hermesResponse.ok || !hermesResponse.body) {
    const errorText = await hermesResponse.text();
    return Response.json({ error: errorText || "Unable to reach hErmes runtime." }, { status: 502 });
  }

  const contentType = hermesResponse.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    return new Response(
      streamFromSseUpstream(
        hermesResponse,
        async (assistantContent) => {
          await persistConversationMessage(conversationContext ?? null, "assistant", assistantContent);
        },
        toolContext ?? undefined,
        clientSignal,
      ),
      { headers: sseHeaders },
    );
  }

  return streamFromJsonUpstream(hermesResponse, async (assistantContent) => {
    await persistConversationMessage(conversationContext ?? null, "assistant", assistantContent);
  });
}

async function callHermes(
  payload: ChatRequest & { message: string },
  toolContext?: { workspaceSlug: string; origin: string; cookieHeader?: string } | null,
  clientSignal?: AbortSignal,
) {
  const agent = await resolveAgentRuntime(payload);
  const toolIntent = payload.tool_intent ?? payload.toolIntent ?? null;
  if (agent) {
    if (toolIntent?.kind === "web_lookup" && !agentSupportsWebIntent(agent)) {
      return Response.json(
        { error: "El agente seleccionado no tiene herramientas web habilitadas." },
        { status: 409 },
      );
    }
    const computedReadiness = evaluateAgentReadiness({
      apiEndpoint: agent.api_endpoint,
      apiKey: agent.api_key,
      soulMd: agent.soul_md,
    });
    const readiness = deriveReadinessFromKnowledgeScope(agent.knowledge_scope, computedReadiness);
    const blockReason = executionBlockReason(agent.status, readiness);
    if (blockReason) {
      return Response.json(
        {
          error: blockReason,
          readiness: {
            state: readiness.state,
            issues: readiness.issues,
          },
        },
        { status: 409 },
      );
    }

    const runtimeConversationId =
      payload.conversation_id ?? payload.conversationId ?? `${agent.workspace_id}:${agent.id}`;
    const supabase = getSupabaseAdmin();
    if (supabase && runtimeConversationId) {
      const { data: conversationRow, error: conversationError } = await supabase
        .from("workspace_conversations")
        .select("id, agent_paused")
        .eq("workspace_id", agent.workspace_id)
        .eq("runtime_conversation_id", runtimeConversationId)
        .maybeSingle();
      if (conversationError) {
        throw new Error(conversationError.message);
      }
      if (conversationRow?.agent_paused) {
        return Response.json(
          {
            error: "Human takeover is active for this conversation.",
            humanTakeover: true,
          },
          { status: 409 },
        );
      }
    }
  }

  const workspaceContext = await resolveWorkspaceContext(payload.workspace_id ?? payload.workspaceId ?? null);

  const baseUrl = agent?.api_endpoint ?? process.env.HERMES_API_BASE_URL;
  const apiKey = agent?.api_key ?? process.env.HERMES_API_KEY;
  const model = agent ? undefined : process.env.HERMES_MODEL ?? undefined;
  const currentUser = await getCurrentAppUser();
  const conversationContext =
    agent && currentUser
      ? {
          workspaceId: agent.workspace_id,
          agentId: agent.id,
          runtimeConversationId:
            payload.conversation_id ?? payload.conversationId ?? `${agent.workspace_id}:${agent.id}`,
          createdBy: currentUser.id,
        }
      : null;

  if (!baseUrl || !apiKey) {
    return Response.json(
      { error: "HERMES_API_BASE_URL or HERMES_API_KEY is missing for hErmes mode." },
      { status: 500 },
    );
  }

  return proxyToHermes({
    payload,
    baseUrl,
    apiKey,
    model,
    agent,
    workspaceContext,
    conversationContext,
    toolContext: toolContext ?? null,
    clientSignal,
  });
}

async function authorizeWorkspaceRequest(payload: ChatRequest) {
  const requestedWorkspaceId = payload.workspace_id ?? payload.workspaceId;
  const requestedAgentId = payload.agent_id ?? payload.agentId;
  const requiresWorkspaceAccess = Boolean(requestedWorkspaceId || requestedAgentId);

  if (!requiresWorkspaceAccess) {
    return null;
  }

  const user = await getCurrentAppUser();
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membershipByWorkspaceId = new Map(memberships.map((entry) => [entry.workspaceId, entry]));
  const membershipBySlug = new Map(memberships.map((entry) => [entry.workspace.subdomain, entry]));

  if (requestedWorkspaceId) {
    const allowedMembership = membershipByWorkspaceId.get(requestedWorkspaceId) ?? membershipBySlug.get(requestedWorkspaceId);
    if (!allowedMembership) {
      return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
    }
  }

  if (requestedAgentId) {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return Response.json({ error: "Supabase admin client not configured." }, { status: 500 });
    }

    const { data: agentRow, error } = await supabase
      .from("workspace_agents")
      .select("id, workspace_id")
      .eq("id", requestedAgentId)
      .maybeSingle();

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (!agentRow) {
      return Response.json({ error: "Agent not found." }, { status: 404 });
    }

    if (!membershipByWorkspaceId.has(String(agentRow.workspace_id))) {
      return Response.json({ error: "You do not have access to this agent." }, { status: 403 });
    }
  }

  return null;
}

async function callOpenRouter(payload: ChatRequest & { message: string }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? "[REDACTED]";

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
        { role: "user", content: payload.message.trim() },
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

  const publicRateLimitFailure = enforcePublicChatRateLimit(request, payload);
  if (publicRateLimitFailure) {
    return publicRateLimitFailure;
  }

  const authorizationFailure = await authorizeWorkspaceRequest(payload);
  if (authorizationFailure) {
    return authorizationFailure;
  }

  const workspaceIdentifier = payload.workspace_id ?? payload.workspaceId ?? null;
  const toolIntent = payload.toolIntent ?? payload.tool_intent ?? null;
  const intentKind = toolIntent?.kind ?? null;
  const intentDocumentRecordId =
    toolIntent?.documentRecordId ?? toolIntent?.document_record_id ?? null;
  if (intentKind === "create_object_from_document" && intentDocumentRecordId && workspaceIdentifier) {
    const workspaceContext = await resolveWorkspaceContext(workspaceIdentifier);
    const supabase = getSupabaseAdmin();
    if (!workspaceContext || !supabase) {
      return streamActionResponse("No pude cargar el documento para generar la propuesta.");
    }
    const { data: recordRow } = await supabase
      .from("records")
      .select("id, data")
      .eq("id", intentDocumentRecordId)
      .eq("workspace_id", workspaceContext.workspaceId)
      .maybeSingle();
    if (!recordRow) {
      return streamActionResponse("No encontré el documento referenciado.");
    }
    const data = (recordRow.data as Record<string, unknown>) ?? {};
    const preview = (data.preview as DocumentPreviewShape | null | undefined) ?? null;
    const fileName = typeof data.document_name === "string" ? data.document_name : "documento";
    const proposal = buildSchemaProposalFromPreview(preview, fileName);
    if (!proposal) {
      return streamActionResponse(
        "No pude leer columnas en ese documento. Intenta reanalizarlo o sube el archivo de nuevo.",
      );
    }
    await logSchemaProposalActivity(
      workspaceContext.workspaceId,
      payload.agent_id ?? payload.agentId ?? null,
      proposal,
    );
    return streamSchemaProposalResponse(
      proposal,
      `Generé una propuesta de tabla desde ${fileName}.`,
    );
  }

  if (shouldProposeSchema(message, Boolean(workspaceIdentifier))) {
    const proposal = buildSchemaProposal(message);
    const workspaceContext = await resolveWorkspaceContext(workspaceIdentifier);
    await logSchemaProposalActivity(
      workspaceContext?.workspaceId ?? "",
      payload.agent_id ?? payload.agentId ?? null,
      proposal,
    );
    return streamSchemaProposalResponse(proposal);
  }

  // Excel/CSV import-from-chat intent: if the user asks to import contacts/companies
  // and there is a spreadsheet attachment, run a dry-run import and emit a
  // structured `import_proposal` SSE so the chat UI can confirm the mapping.
  const importMatch = /\b(importa|importar|import)\b/i.test(message);
  const attachmentRefsForImport = normalizeAttachmentRefs(
    payload.attachment_refs,
    payload.attachmentRefs,
  ).recordIds;
  if (importMatch && attachmentRefsForImport.length > 0 && workspaceIdentifier) {
    const wsForImport = await resolveWorkspaceContext(workspaceIdentifier);
    if (wsForImport) {
      const kind: "crm_people" | "crm_companies" | "crm_deals" | null = /personas|contactos|gente|leads?/i.test(
        message,
      )
        ? "crm_people"
        : /empresas|compan[ií]as|cuentas|accounts/i.test(message)
          ? "crm_companies"
          : /oportunidades|deals|negocios/i.test(message)
            ? "crm_deals"
            : null;
      if (kind) {
        try {
          const mod = await import("@/lib/agentTools/executor");
          const result = await mod.runTool({
            name: "crm.import_attachment",
            args: { documentRecordId: attachmentRefsForImport[0], kind, dryRun: true },
            ctx: {
              workspaceSlug: wsForImport.workspaceSlug,
              origin: new URL(request.url).origin,
              cookieHeader: request.headers.get("cookie") ?? undefined,
            },
          });
          if (result.ok && result.data && typeof result.data === "object") {
            const proposal = (result.data as { proposal?: Record<string, unknown> }).proposal ?? result.data;
            const totalRows = (proposal as { totalRows?: number }).totalRows ?? 0;
            return streamImportProposalResponse(
              proposal as Record<string, unknown>,
              `Preparé un mapeo para importar ${totalRows} filas como ${kind.replace("crm_", "")}. Revisa y confirma.`,
            );
          }
        } catch (error) {
          console.error("[chat] import intent failed", error instanceof Error ? error.message : error);
        }
      }
    }
  }

  const explicitToolIntent = payload.tool_intent ?? payload.toolIntent ?? null;
  const imageIntentResponse = await tryHandleImageIntent(
    message,
    workspaceIdentifier,
    payload.history,
    {
      origin: new URL(request.url).origin,
      cookieHeader: request.headers.get("cookie") ?? undefined,
    },
    explicitToolIntent,
  );
  if (imageIntentResponse) {
    return imageIntentResponse;
  }

  const preferredObjectName =
    payload.app_context?.current_object ??
    payload.appContext?.current_object ??
    null;
  const recordIntentResponse = await tryHandleRecordCreateIntent(
    message,
    workspaceIdentifier,
    typeof preferredObjectName === "string" ? preferredObjectName : null,
    {
      origin: new URL(request.url).origin,
      cookieHeader: request.headers.get("cookie") ?? undefined,
    },
  );
  if (recordIntentResponse) {
    return recordIntentResponse;
  }

  const isWorkspaceScoped = Boolean(payload.workspace_id ?? payload.workspaceId ?? payload.agent_id ?? payload.agentId);
  if (isWorkspaceScoped) {
    const wsForTools = await resolveWorkspaceContext(workspaceIdentifier);
    const toolContext = wsForTools
      ? {
          workspaceSlug: wsForTools.workspaceSlug,
          origin: new URL(request.url).origin,
          cookieHeader: request.headers.get("cookie") ?? undefined,
        }
      : null;
    return callHermes({ ...payload, message }, toolContext, request.signal);
  }

  const provider = resolveProvider();
  if (provider === "hermes") {
    return callHermes({ ...payload, message }, null, request.signal);
  }

  return callOpenRouter({ ...payload, message });
}
