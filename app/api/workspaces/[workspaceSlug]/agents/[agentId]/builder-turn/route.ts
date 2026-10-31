import { getCurrentAppUser } from "@/lib/auth";
import {
  evaluateAgentReadiness,
  mergeReadinessIntoKnowledgeScope,
} from "@/lib/agentReadiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type WorkspaceBuilderSummary = {
  skills: {
    builtIn: Array<{ slug: string; title: string; enabled: boolean }>;
    local: Array<{ slug: string; title: string; promoted: boolean }>;
  };
  workflows: Array<{ id: string; name: string; enabled: boolean; description: string | null }>;
  integrations: Array<{ slug: string; provider: string | null; status: string }>;
};

async function loadWorkspaceBuilderSummary(workspaceId: string): Promise<WorkspaceBuilderSummary> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { skills: { builtIn: [], local: [] }, workflows: [], integrations: [] };
  }

  const [{ data: workflowRows }, { data: integrationRows }] = await Promise.all([
    supabase
      .from("workspace_workflows")
      .select("id, name, description, enabled")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("workspace_integrations")
      .select("slug, provider, status")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
      .limit(20),
  ]);

  let builtIn: Array<{ slug: string; title: string; enabled: boolean }> = [];
  let local: Array<{ slug: string; title: string; promoted: boolean }> = [];
  try {
    const { listPrismaSkillsTap } = await import("@/lib/skillsTap");
    const { loadWorkspaceSkillsState } = await import("@/lib/hermesHome");
    const [tap, state] = await Promise.all([
      listPrismaSkillsTap(),
      loadWorkspaceSkillsState(workspaceId),
    ]);
    const disabled = new Set(state.disabledBuiltIn);
    const promoted = new Set(state.promotedLocal);
    builtIn = tap.slice(0, 30).map((skill) => ({
      slug: skill.slug,
      title: skill.title,
      enabled: !disabled.has(skill.slug),
    }));
    local = state.promotedLocal.map((slug) => ({
      slug,
      title: slug,
      promoted: promoted.has(slug),
    }));
  } catch {
    // Skills tap or hermes home not available — leave arrays empty.
  }

  return {
    skills: { builtIn, local },
    workflows: ((workflowRows ?? []) as Array<{
      id: string;
      name: string;
      description: string | null;
      enabled: boolean;
    }>).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      enabled: Boolean(row.enabled),
      description: row.description,
    })),
    integrations: ((integrationRows ?? []) as Array<{
      slug: string;
      provider: string | null;
      status: string;
    }>).map((row) => ({
      slug: String(row.slug),
      provider: row.provider ? String(row.provider) : null,
      status: String(row.status ?? "unknown"),
    })),
  };
}

type Context = {
  params: Promise<{ workspaceSlug: string; agentId: string }>;
};

type AgentRole =
  | "intake_assistant"
  | "lead_qualifier"
  | "crm_updater"
  | "follow_up"
  | "ops_assistant"
  | "custom";

type AgentRow = {
  id: string;
  workspace_id: string;
  name: string;
  type: "copilot" | "channel" | "worker";
  description: string | null;
  api_endpoint: string;
  api_key: string;
  container_name: string;
  status: "active" | "paused" | "deploying" | "error";
  soul_md: string | null;
  skills: string[] | null;
  knowledge_scope: Record<string, unknown> | null;
  cron_jobs: unknown[] | null;
  channel_config: Record<string, unknown> | null;
  memory_limit_mb: number | null;
  cpu_limit: number | null;
  created_at: string;
  updated_at: string;
};

type BuilderTurnRequest = {
  message?: string;
  apply?: boolean;
};

type BuilderProposal = {
  assistantMessage: string;
  updates: {
    name?: string;
    role?: AgentRole;
    description?: string;
    soulMd?: string;
    skills?: string[];
    knowledgeScope?: {
      read?: string[];
      write?: string[];
      channels?: string[];
    };
    cronJobs?: unknown[];
    connections?: Record<string, string>;
  };
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

function mapRoleToRuntimeType(role: AgentRole): "copilot" | "channel" | "worker" {
  if (role === "intake_assistant" || role === "ops_assistant") return "copilot";
  if (role === "lead_qualifier" || role === "follow_up") return "channel";
  return "worker";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.length > 0);
}

function parseDelimitedList(value: string) {
  return value
    .split(/[,\n]/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeStringListCandidate(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return normalizeStringArray(value);
  }
  if (typeof value === "string") {
    return parseDelimitedList(value);
  }
  return undefined;
}

function normalizeConnectionMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [rawKey, rawValue]) => {
    const key = rawKey.toUpperCase().replace(/[^A-Z0-9_]/g, "_").trim();
    const normalizedValue = String(rawValue ?? "").trim();
    if (!key || !normalizedValue) {
      return acc;
    }
    acc[key] = normalizedValue;
    return acc;
  }, {});
}

function parseFirstJsonObject(content: string) {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : content.trim();
  const firstBraceIndex = candidate.indexOf("{");
  const lastBraceIndex = candidate.lastIndexOf("}");
  if (firstBraceIndex < 0 || lastBraceIndex < 0 || lastBraceIndex <= firstBraceIndex) {
    return null;
  }
  const jsonText = candidate.slice(firstBraceIndex, lastBraceIndex + 1);
  try {
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeRoleCandidate(value: unknown): AgentRole | undefined {
  const normalized = String(value ?? "").toLowerCase().trim();
  if (
    normalized === "intake_assistant" ||
    normalized === "lead_qualifier" ||
    normalized === "crm_updater" ||
    normalized === "follow_up" ||
    normalized === "ops_assistant" ||
    normalized === "custom"
  ) {
    return normalized;
  }
  if (normalized.includes("copilot")) return "intake_assistant";
  if (normalized.includes("follow")) return "follow_up";
  if (normalized.includes("crm")) return "crm_updater";
  if (normalized.includes("channel")) return "lead_qualifier";
  return undefined;
}

function extractRoleFromText(message: string): AgentRole | undefined {
  const normalized = message.toLowerCase();
  if (normalized.includes("ops assistant") || normalized.includes("operativo")) return "ops_assistant";
  if (normalized.includes("follow-up") || normalized.includes("follow up")) return "follow_up";
  if (normalized.includes("crm")) return "crm_updater";
  if (normalized.includes("copilot")) return "intake_assistant";
  if (normalized.includes("channel") || normalized.includes("canal")) return "lead_qualifier";
  if (normalized.includes("custom")) return "custom";
  return undefined;
}

function extractRenameIntent(message: string) {
  const patterns: RegExp[] = [
    /(?:rename(?:\s+(?:this\s+agent|it))?\s+to)\s*["“]?([^"\n”]+)["”]?/i,
    /(?:renombra(?:r)?(?:\s+(?:este\s+agente|el\s+agente|lo))?\s+(?:a|como))\s*["“]?([^"\n”]+)["”]?/i,
    /(?:ll[áa]ma(?:lo|le)?|nómbra(?:lo|le)?)\s*["“]?([^"\n”]+)["”]?/i,
    /(?:cambia(?:r)?(?:\s+el)?\s+nombre(?:\s+del\s+agente)?\s+(?:a|por))\s*["“]?([^"\n”]+)["”]?/i,
    /(?:nombre(?:\s+del\s+agente)?|name)\s*[:=]\s*["“]?([^"\n”]+)["”]?/i,
    /(?:set\s+name\s+to)\s*["“]?([^"\n”]+)["”]?/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/[.;,!?]+$/, "").trim();
    }
  }
  return undefined;
}

function extractSoulFromMessage(message: string) {
  const explicit = message.match(
    /(?:soul(?:\.md)?|persona(?:lidad)?|personality)\s*[:=]\s*([\s\S]+)/i,
  );
  if (explicit?.[1]) {
    return explicit[1].trim();
  }
  const personaCue = message.match(
    /(?:eres|act[úu]a\s+como|comp[óo]rtate\s+como|you\s+are|act\s+as)\s+([\s\S]+)/i,
  );
  if (personaCue?.[1]) {
    return personaCue[0].trim();
  }
  return undefined;
}

function extractSkillsFromMessage(message: string) {
  const match = message.match(/(?:skills?\s*(?:to|:)|habilidades?\s*(?:a|:))\s*([\s\S]+)/i);
  if (!match?.[1]) {
    return undefined;
  }
  return parseDelimitedList(match[1]);
}

function isSummaryIntent(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("summary") ||
    normalized.includes("resumen") ||
    normalized.includes("all configuration") ||
    normalized.includes("toda la configuración") ||
    normalized.includes("all changes") ||
    normalized.includes("todos los cambios")
  );
}

function isWorkspaceInventoryIntent(message: string) {
  const normalized = message.toLowerCase();
  const asksAbout =
    /\b(qué|que|cu[áa]les|cuantas|cuántas|lista(?:r|me)?|muestra(?:me)?|dime|describe|tell\s+me|list|show|what)\b/.test(
      normalized,
    );
  const mentionsInventory =
    /(skills?|habilidades?|automation(?:s)?|automatizaci[oó]n(?:es)?|workflow(?:s)?|integraci[oó]n(?:es)?|integration(?:s)?|conexi[oó]n(?:es)?|connection(?:s)?|api[\s_-]?key)/.test(
      normalized,
    );
  if (asksAbout && mentionsInventory) {
    return true;
  }
  return /\b(qué\s+(?:tengo|hay)|what\s+(?:do\s+i\s+have|is\s+available))\b/.test(normalized) && mentionsInventory;
}

const BUILDER_INSTRUCTION_KEYWORDS = [
  "renombra", "rename", "cambia", "change", "set", "actualiza", "update",
  "skill", "habilidad", "rol", "role", "soul", "persona", "personality",
  "cron", "schedule", "agrega", "add", "quita", "remove", "elimina", "delete",
  "configura", "configure", "habilita", "enable", "deshabilita", "disable",
  "asigna", "assign", "conecta", "connect", "api_key", "apikey",
  "lectura", "read", "escritura", "write", "canal", "channel",
  "llamalo", "llámalo", "nombralo", "nómbralo",
  "responsabilidad", "responsibility", "descripcion", "descripción", "description",
];

function isCasualConversationIntent(message: string) {
  const trimmed = message.trim();
  if (trimmed.length === 0) return false;
  const normalized = trimmed.toLowerCase();
  // Reserved branches handle these explicitly.
  if (isSummaryIntent(message) || isWorkspaceInventoryIntent(message)) return false;
  // If the message looks like a builder instruction (rename/skills/role/etc.),
  // let the proposal pipeline handle it instead of chatting.
  for (const keyword of BUILDER_INSTRUCTION_KEYWORDS) {
    if (normalized.includes(keyword)) return false;
  }
  // Has KEY: VALUE pattern → likely a connection/credential, not casual chat.
  if (/[A-Z][A-Z0-9_]{2,}\s*[:=]\s*\S{4,}/.test(trimmed)) return false;
  // Single short word/acknowledgement → casual.
  if (trimmed.length <= 12 && !trimmed.includes(":")) return true;
  // Question form → casual.
  if (/[?¿]/.test(trimmed)) return true;
  // Greeting / small talk cues.
  if (/^\s*(hola|hi|hey|buenos|buenas|gracias|thanks|thank you|ok|okay|claro|listo|perfecto|cool|sure)\b/.test(normalized)) {
    return true;
  }
  return false;
}

async function answerConversationallyWithOpenRouter(
  message: string,
  agent: AgentRow,
  workspaceSummary: WorkspaceBuilderSummary,
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  const knowledgeScope = (agent.knowledge_scope as Record<string, unknown> | null) ?? {};
  const role =
    typeof knowledgeScope.legacy_role === "string"
      ? String(knowledgeScope.legacy_role)
      : agent.type;
  const persona = (agent.soul_md ?? "").trim();

  const systemPrompt = [
    `Eres ${agent.name}, un agente del workspace Prisma con rol "${role}".`,
    persona ? `Personalidad (SOUL.md):\n${persona}` : "Sin personalidad personalizada todavía.",
    `Estás respondiendo dentro del builder de Operadores. El usuario te está hablando de manera conversacional (saludo, pregunta corta, agradecimiento, etc.) y NO te está pidiendo cambiar tu configuración.`,
    `Responde en el mismo idioma del usuario, breve (1-3 oraciones), sin proponer cambios. Si te preguntan quién eres o qué haces, descríbete usando tu nombre, rol y responsabilidad. NO inventes funciones o integraciones que no existan.`,
    `Contexto:`,
    `- Responsabilidad: ${agent.description ?? "sin definir"}`,
    `- Skills configuradas: ${(Array.isArray(agent.skills) ? agent.skills : []).join(", ") || "ninguna"}`,
    `- Workflows del workspace: ${workspaceSummary.workflows.map((w) => w.name).join(", ") || "ninguno"}`,
    `- Integraciones del workspace: ${workspaceSummary.integrations.map((i) => i.slug).join(", ") || "ninguna"}`,
  ].join("\n");

  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "Prisma Agent Builder Chat",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    return content && content.length > 0 ? content : null;
  } catch {
    return null;
  }
}

function casualConversationFallback(message: string, agent: AgentRow) {
  const normalized = message.trim().toLowerCase();
  if (/^\s*(c[óo]mo te llamas|cu[áa]l es tu nombre|who are you|what'?s your name)/.test(normalized)) {
    return `Soy ${agent.name}. ${agent.description ?? "Aún no tengo una responsabilidad definida."}`;
  }
  if (/^\s*(hola|hi|hey|buenos|buenas)/.test(normalized)) {
    return `Hola, soy ${agent.name}. ¿En qué puedo ayudarte con la configuración?`;
  }
  if (/^\s*(gracias|thanks|thank you)/.test(normalized)) {
    return "De nada. Avísame si quieres ajustar algo más del agente.";
  }
  if (/^\s*(ok|okay|claro|listo|perfecto|sure)/.test(normalized)) {
    return "Perfecto. Cuando quieras seguimos con la configuración.";
  }
  return `Soy ${agent.name}. Si quieres ajustar mi configuración, dime por ejemplo "Renombra a ...", "Skills: ..." o "SOUL: ...".`;
}

function buildWorkspaceInventoryAnswer(
  agent: AgentRow,
  workspaceSummary: WorkspaceBuilderSummary,
) {
  const builtInEnabled = workspaceSummary.skills.builtIn.filter((skill) => skill.enabled);
  const builtInDisabled = workspaceSummary.skills.builtIn.filter((skill) => !skill.enabled);
  const localPromoted = workspaceSummary.skills.local.filter((skill) => skill.promoted);
  const enabledWorkflows = workspaceSummary.workflows.filter((w) => w.enabled);
  const disabledWorkflows = workspaceSummary.workflows.filter((w) => !w.enabled);

  const apiCredentials =
    typeof (agent.channel_config as Record<string, unknown> | null)?.apiCredentials === "object" &&
    !Array.isArray((agent.channel_config as Record<string, unknown> | null)?.apiCredentials)
      ? Object.keys((agent.channel_config as Record<string, unknown>).apiCredentials as Record<string, unknown>)
      : [];

  const lines: string[] = [];
  lines.push(`Configuración del workspace para ${agent.name}:`);
  lines.push("");
  lines.push("Skills");
  if (builtInEnabled.length > 0) {
    lines.push(
      `- Built-in activos (${builtInEnabled.length}): ${builtInEnabled.map((s) => s.slug).join(", ")}`,
    );
  } else {
    lines.push("- Built-in activos: ninguno");
  }
  if (builtInDisabled.length > 0) {
    lines.push(
      `- Built-in deshabilitados (${builtInDisabled.length}): ${builtInDisabled.map((s) => s.slug).join(", ")}`,
    );
  }
  if (localPromoted.length > 0) {
    lines.push(`- Locales promovidas (${localPromoted.length}): ${localPromoted.map((s) => s.slug).join(", ")}`);
  } else {
    lines.push("- Locales promovidas: ninguna");
  }

  lines.push("");
  lines.push("Automations");
  if (workspaceSummary.workflows.length === 0) {
    lines.push("- Sin workflows configurados");
  } else {
    if (enabledWorkflows.length > 0) {
      lines.push(`- Activos (${enabledWorkflows.length}): ${enabledWorkflows.map((w) => w.name).join(", ")}`);
    }
    if (disabledWorkflows.length > 0) {
      lines.push(`- Inactivos (${disabledWorkflows.length}): ${disabledWorkflows.map((w) => w.name).join(", ")}`);
    }
  }

  lines.push("");
  lines.push("Integraciones");
  if (workspaceSummary.integrations.length === 0) {
    lines.push("- Sin integraciones configuradas");
  } else {
    for (const integration of workspaceSummary.integrations) {
      const provider = integration.provider ? ` (${integration.provider})` : "";
      lines.push(`- ${integration.slug}${provider} — estado: ${integration.status}`);
    }
  }

  lines.push("");
  lines.push("Conexiones del agente");
  lines.push(
    apiCredentials.length > 0
      ? `- ${apiCredentials.join(", ")}`
      : "- Sin API keys configuradas",
  );

  return lines.join("\n");
}

function hasMappableUpdates(updates: BuilderProposal["updates"]) {
  if (updates.name && updates.name.trim().length > 0) return true;
  if (updates.role) return true;
  if (updates.description !== undefined) return true;
  if (updates.soulMd !== undefined) return true;
  if (updates.skills !== undefined && updates.skills.length > 0) return true;
  if (updates.cronJobs !== undefined) return true;
  if (updates.connections && Object.keys(updates.connections).length > 0) return true;
  if (updates.knowledgeScope) {
    const scope = updates.knowledgeScope;
    if (scope.read !== undefined || scope.write !== undefined || scope.channels !== undefined) return true;
  }
  return false;
}

function mergeProposals(primary: BuilderProposal, fallback: BuilderProposal): BuilderProposal {
  const merged: BuilderProposal["updates"] = { ...primary.updates };
  if ((!merged.name || merged.name.trim().length === 0) && fallback.updates.name) {
    merged.name = fallback.updates.name;
  }
  if (!merged.role && fallback.updates.role) {
    merged.role = fallback.updates.role;
  }
  if (merged.description === undefined && fallback.updates.description !== undefined) {
    merged.description = fallback.updates.description;
  }
  if (merged.soulMd === undefined && fallback.updates.soulMd !== undefined) {
    merged.soulMd = fallback.updates.soulMd;
  }
  if ((!merged.skills || merged.skills.length === 0) && fallback.updates.skills && fallback.updates.skills.length > 0) {
    merged.skills = fallback.updates.skills;
  }
  if (merged.cronJobs === undefined && fallback.updates.cronJobs !== undefined) {
    merged.cronJobs = fallback.updates.cronJobs;
  }
  if (
    (!merged.connections || Object.keys(merged.connections).length === 0) &&
    fallback.updates.connections &&
    Object.keys(fallback.updates.connections).length > 0
  ) {
    merged.connections = fallback.updates.connections;
  }
  if (!merged.knowledgeScope && fallback.updates.knowledgeScope) {
    merged.knowledgeScope = fallback.updates.knowledgeScope;
  }
  return {
    assistantMessage: primary.assistantMessage || fallback.assistantMessage,
    updates: merged,
  };
}

function buildAgentSummary(agent: AgentRow) {
  const knowledgeScope = (agent.knowledge_scope as Record<string, unknown> | null) ?? {};
  const role =
    typeof knowledgeScope.legacy_role === "string"
      ? String(knowledgeScope.legacy_role)
      : agent.type === "copilot"
        ? "intake_assistant"
        : agent.type === "channel"
          ? "lead_qualifier"
          : "crm_updater";
  const read = Array.isArray(knowledgeScope.read) ? (knowledgeScope.read as unknown[]).map((entry) => String(entry)) : [];
  const write = Array.isArray(knowledgeScope.write) ? (knowledgeScope.write as unknown[]).map((entry) => String(entry)) : [];
  const channels = Array.isArray(knowledgeScope.channels)
    ? (knowledgeScope.channels as unknown[]).map((entry) => String(entry))
    : [];
  const skills = Array.isArray(agent.skills) ? agent.skills : [];
  const cronJobs = Array.isArray(agent.cron_jobs) ? agent.cron_jobs : [];
  const apiCredentials =
    typeof (agent.channel_config as Record<string, unknown> | null)?.apiCredentials === "object" &&
    !Array.isArray((agent.channel_config as Record<string, unknown> | null)?.apiCredentials)
      ? Object.keys((agent.channel_config as Record<string, unknown>).apiCredentials as Record<string, unknown>)
      : [];

  return [
    `Nombre: ${agent.name}`,
    `Rol: ${role}`,
    `Responsabilidad: ${agent.description ?? "Sin definir"}`,
    `Skills: ${skills.length ? skills.join(", ") : "Sin skills"}`,
    `Lectura: ${read.length ? read.join(", ") : "Sin alcance de lectura"}`,
    `Escritura: ${write.length ? write.join(", ") : "Sin alcance de escritura"}`,
    `Canales: ${channels.length ? channels.join(", ") : "Sin canales"}`,
    `Cron jobs: ${cronJobs.length}`,
    `Conexiones: ${apiCredentials.length ? apiCredentials.join(", ") : "Sin conexiones"}`,
  ].join("\n");
}

async function inferProposalWithOpenRouter(
  message: string,
  agent: AgentRow,
  workspaceSummary: WorkspaceBuilderSummary,
): Promise<BuilderProposal | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const knowledgeScope = (agent.knowledge_scope as Record<string, unknown> | null) ?? {};
  const currentContext = {
    name: agent.name,
    type: agent.type,
    description: agent.description ?? "",
    soulMd: agent.soul_md ?? "",
    skills: Array.isArray(agent.skills) ? agent.skills : [],
    read: Array.isArray(knowledgeScope.read) ? knowledgeScope.read : [],
    write: Array.isArray(knowledgeScope.write) ? knowledgeScope.write : [],
    channels: Array.isArray(knowledgeScope.channels) ? knowledgeScope.channels : [],
    cronJobs: Array.isArray(agent.cron_jobs) ? agent.cron_jobs : [],
    connections:
      typeof (agent.channel_config as Record<string, unknown> | null)?.apiCredentials === "object" &&
      !Array.isArray((agent.channel_config as Record<string, unknown> | null)?.apiCredentials)
        ? Object.keys((agent.channel_config as Record<string, unknown>).apiCredentials as Record<string, unknown>)
        : [],
  };

  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Prisma Agent Builder",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a workspace agent-builder parser. Convert user intent into JSON updates for an agent configuration. Return JSON only. Allowed role values: intake_assistant, lead_qualifier, crm_updater, follow_up, ops_assistant, custom. Keep updates sparse: only include fields explicitly requested. For API keys/integrations, put them in updates.connections as KEY: VALUE. For cron jobs, use updates.cronJobs as a JSON array.\n" +
            "Persona note: when the user gives persona/voice/style feedback (\"talk shorter\", \"you are Jayme, a sales rep\", \"don't reply like that\"), update updates.soulMd by appending or rewriting the SOUL.md text — this maps to Hermes's Personality file ($HERMES_HOME/SOUL.md, see https://hermes-agent.nousresearch.com/docs/user-guide/features/personality). Treat soulMd as the agent's identity, not generic instructions.\n" +
            "Workspace context awareness: a `workspaceSummary` is provided with the workspace's built-in skills, local skills, automations (workflows), and configured integrations. When the user references one of them by name (e.g. \"attach the gb-site skill\", \"hook into the daily-briefing workflow\", \"use my Close integration\"), include the matching slug in updates.skills, mention the workflow id in updates.description, or surface the integration slug in assistantMessage so the user knows what was matched. NEVER invent slugs that are not in the summary — if no match, include a short clarifying question in assistantMessage.",
        },
        {
          role: "user",
          content: `Current agent:\n${JSON.stringify(currentContext, null, 2)}\n\nWorkspace summary (use these slugs verbatim when referencing skills/workflows/integrations):\n${JSON.stringify(workspaceSummary, null, 2)}\n\nUser request:\n${message}\n\nReturn this exact JSON shape:\n{"assistantMessage":"...","updates":{"name":"?","role":"?","description":"?","soulMd":"?","skills":[],"knowledgeScope":{"read":[],"write":[],"channels":[]},"cronJobs":[],"connections":{"CLOSE_API_KEY":"..."}}}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }
  const parsed = parseFirstJsonObject(content);
  if (!parsed) {
    return null;
  }

  const updates = (parsed.updates as Record<string, unknown> | undefined) ?? {};
  const updatesKnowledgeScope = (updates.knowledgeScope as Record<string, unknown> | undefined) ?? undefined;
  const parsedSkills = normalizeStringListCandidate(updates.skills);
  const parsedRead = updatesKnowledgeScope ? normalizeStringListCandidate(updatesKnowledgeScope.read) : undefined;
  const parsedWrite = updatesKnowledgeScope ? normalizeStringListCandidate(updatesKnowledgeScope.write) : undefined;
  const parsedChannels = updatesKnowledgeScope ? normalizeStringListCandidate(updatesKnowledgeScope.channels) : undefined;

  return {
    assistantMessage:
      typeof parsed.assistantMessage === "string" && parsed.assistantMessage.trim().length > 0
        ? parsed.assistantMessage.trim()
        : "Listo. Propuse cambios en la configuración del agente.",
    updates: {
      name: typeof updates.name === "string" ? updates.name.trim() : undefined,
      role: normalizeRoleCandidate(updates.role),
      description: typeof updates.description === "string" ? updates.description.trim() : undefined,
      soulMd: typeof updates.soulMd === "string" ? updates.soulMd : undefined,
      skills: parsedSkills,
      knowledgeScope:
        updatesKnowledgeScope !== undefined
          ? {
              ...(parsedRead !== undefined ? { read: parsedRead } : {}),
              ...(parsedWrite !== undefined ? { write: parsedWrite } : {}),
              ...(parsedChannels !== undefined ? { channels: parsedChannels } : {}),
            }
          : undefined,
      cronJobs: Array.isArray(updates.cronJobs) ? updates.cronJobs : undefined,
      connections: updates.connections !== undefined ? normalizeConnectionMap(updates.connections) : undefined,
    },
  };
}

function inferProposalFallback(message: string): BuilderProposal {
  const normalized = message.toLowerCase();
  const role = extractRoleFromText(message);
  const inferredName = extractRenameIntent(message);
  const inferredSkills = extractSkillsFromMessage(message);
  const inferredSoul = extractSoulFromMessage(message);
  const looksLikeResponsibility =
    normalized.includes("responsibility") ||
    normalized.includes("responsabilidad") ||
    normalized.includes("focus") ||
    normalized.includes("enfoca") ||
    normalized.includes("objetivo");

  const apiKeyMatches = Array.from(
    message.matchAll(/([A-Z][A-Z0-9_]{2,})\s*[:=]\s*([A-Za-z0-9_\-./+=:@]{8,})/g),
  );
  const connections = apiKeyMatches.reduce<Record<string, string>>((acc, match) => {
    const key = String(match[1] ?? "").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const value = String(match[2] ?? "").trim();
    if (key && value) {
      acc[key] = value;
    }
    return acc;
  }, {});

  return {
    assistantMessage:
      "Entendido. Guardé esta indicación para el agente. Si quieres precisión extra, agrega nombre del rol, skills o un cron en formato JSON.",
    updates: {
      ...(inferredName ? { name: inferredName } : {}),
      ...(looksLikeResponsibility ? { description: message.trim() } : {}),
      ...(role ? { role } : {}),
      ...(inferredSkills && inferredSkills.length > 0 ? { skills: inferredSkills } : {}),
      ...(inferredSoul ? { soulMd: inferredSoul } : {}),
      ...(Object.keys(connections).length > 0 ? { connections } : {}),
    },
  };
}

function buildWorkspaceAgentPayload(row: AgentRow) {
  const knowledgeScope = (row.knowledge_scope as Record<string, unknown> | null) ?? {};
  const read = Array.isArray(knowledgeScope.read)
    ? (knowledgeScope.read as unknown[]).map((entry) => String(entry))
    : [];
  const write = Array.isArray(knowledgeScope.write)
    ? (knowledgeScope.write as unknown[]).map((entry) => String(entry))
    : [];
  const channels = Array.isArray(knowledgeScope.channels)
    ? (knowledgeScope.channels as unknown[]).map((entry) => String(entry))
    : [];
  const readinessState = knowledgeScope.readiness_state === "ready" ? "ready" : "draft";
  const readinessIssues = Array.isArray(knowledgeScope.readiness_issues)
    ? (knowledgeScope.readiness_issues as unknown[]).map((entry) => String(entry))
    : [];

  return {
    id: String(row.id),
    name: String(row.name),
    legacyRole:
      typeof knowledgeScope.legacy_role === "string" ? String(knowledgeScope.legacy_role) : null,
    type: row.type,
    status: row.status,
    description: row.description ?? null,
    tools: Array.isArray(row.skills) ? row.skills : [],
    read,
    write,
    channels,
    cronJobs: Array.isArray(row.cron_jobs) ? row.cron_jobs : [],
    memoryLabel: Number(row.memory_limit_mb ?? 0) > 0 ? "Activada" : "Desactivada",
    soulMd: row.soul_md ?? null,
    runtimeLabel: row.container_name,
    apiEndpoint: row.api_endpoint ?? "",
    apiKey: "",
    containerName: row.container_name,
    lastHealthCheckAt:
      typeof knowledgeScope.last_health_check_at === "string" ? String(knowledgeScope.last_health_check_at) : null,
    lastCronRunAt:
      typeof knowledgeScope.last_cron_run_at === "string" ? String(knowledgeScope.last_cron_run_at) : null,
    channelConfig: (row.channel_config as Record<string, unknown> | null) ?? {},
    readinessState,
    readinessIssues,
    isReadyForExecution: readinessState === "ready" && readinessIssues.length === 0 && row.status === "active",
  };
}

async function authorizeWorkspaceAdmin(workspaceSlug: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
  if (!membership) {
    return { error: Response.json({ error: "You do not have access to this workspace." }, { status: 403 }) };
  }

  if (!user.isPlatformAdmin && membership.role !== "admin") {
    return {
      error: Response.json({ error: "Only workspace admins can manage agents." }, { status: 403 }),
    };
  }

  return { user, membership };
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug, agentId } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const body = (await request.json().catch(() => ({}))) as BuilderTurnRequest;
    const message = body.message?.trim();
    if (!message) {
      return Response.json({ error: "message is required." }, { status: 400 });
    }
    const shouldApply = body.apply !== false;

    const legacyBuilderTurnEnabled = process.env.PRISMA_BUILDER_TURN_LEGACY === "true";
    if (!legacyBuilderTurnEnabled) {
      // Operadores V2 now uses /api/chat + PATCH /agents/:id as the single source
      // of truth. Keep this route as a short-lived compatibility response.
      return Response.json(
        {
          applied: false,
          appliedFields: [],
          proposal: {},
          assistantMessage:
            "Este endpoint fue deprecado. Usa Operadores V2: chat en /api/chat y cambios estructurados en PATCH /api/workspaces/{workspaceSlug}/agents/{agentId}.",
          migration: {
            deprecated: true,
            replacement: {
              conversational: "/api/chat",
              structuredUpdate: `/api/workspaces/${workspaceSlug}/agents/${agentId}`,
            },
            receivedMessage: message,
            applyRequested: shouldApply,
          },
        },
        { status: 410 },
      );
    }

    const supabase = requireSupabaseAdmin();
    const { data: agentRow, error: agentError } = await supabase
      .from("workspace_agents")
      .select("id, workspace_id, name, type, description, api_endpoint, api_key, container_name, status, soul_md, skills, knowledge_scope, cron_jobs, channel_config, memory_limit_mb, cpu_limit, created_at, updated_at")
      .eq("id", agentId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .maybeSingle();

    if (agentError) {
      throw new Error(agentError.message);
    }
    if (!agentRow) {
      return Response.json({ error: "Agent not found." }, { status: 404 });
    }

    const typedAgent = agentRow as AgentRow;
    const workspaceSummary = await loadWorkspaceBuilderSummary(authorization.membership.workspaceId);

    if (isSummaryIntent(message)) {
      return Response.json({
        assistantMessage: buildAgentSummary(typedAgent),
        proposal: {},
        applied: false,
        appliedFields: [],
        agent: buildWorkspaceAgentPayload(typedAgent),
        workspaceSummary,
      });
    }

    if (isWorkspaceInventoryIntent(message)) {
      return Response.json({
        assistantMessage: buildWorkspaceInventoryAnswer(typedAgent, workspaceSummary),
        proposal: {},
        applied: false,
        appliedFields: [],
        agent: buildWorkspaceAgentPayload(typedAgent),
        workspaceSummary,
      });
    }

    if (isCasualConversationIntent(message)) {
      const llmReply = await answerConversationallyWithOpenRouter(message, typedAgent, workspaceSummary);
      const assistantMessage = llmReply ?? casualConversationFallback(message, typedAgent);
      return Response.json({
        assistantMessage,
        proposal: {},
        applied: false,
        appliedFields: [],
        agent: buildWorkspaceAgentPayload(typedAgent),
        workspaceSummary,
      });
    }

    const fallbackProposal = inferProposalFallback(message);
    const llmProposal = await inferProposalWithOpenRouter(message, typedAgent, workspaceSummary);
    const proposal = llmProposal ? mergeProposals(llmProposal, fallbackProposal) : fallbackProposal;

    if (!shouldApply) {
      return Response.json({
        assistantMessage: proposal.assistantMessage,
        proposal: proposal.updates,
        applied: false,
        appliedFields: [],
        workspaceSummary,
      });
    }

    const nextKnowledgeScope = {
      ...((typedAgent.knowledge_scope as Record<string, unknown> | null) ?? {}),
    };
    const nextChannelConfig = {
      ...((typedAgent.channel_config as Record<string, unknown> | null) ?? {}),
    };
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const appliedFields: string[] = [];

    if (proposal.updates.name && proposal.updates.name.length > 0) {
      update.name = proposal.updates.name;
      appliedFields.push("name");
    }
    if (proposal.updates.description !== undefined) {
      update.description = proposal.updates.description.trim().length > 0 ? proposal.updates.description : null;
      appliedFields.push("description");
    }
    if (proposal.updates.soulMd !== undefined) {
      update.soul_md = proposal.updates.soulMd.trim().length > 0 ? proposal.updates.soulMd : null;
      appliedFields.push("soul_md");
    }
    if (proposal.updates.skills !== undefined && proposal.updates.skills.length > 0) {
      update.skills = normalizeStringArray(proposal.updates.skills);
      appliedFields.push("skills");
    }
    if (proposal.updates.role) {
      update.type = mapRoleToRuntimeType(proposal.updates.role);
      nextKnowledgeScope.legacy_role = proposal.updates.role;
      appliedFields.push("role");
    }
    if (proposal.updates.knowledgeScope) {
      if (proposal.updates.knowledgeScope.read !== undefined) {
        nextKnowledgeScope.read = normalizeStringArray(proposal.updates.knowledgeScope.read);
        appliedFields.push("knowledge_scope.read");
      }
      if (proposal.updates.knowledgeScope.write !== undefined) {
        nextKnowledgeScope.write = normalizeStringArray(proposal.updates.knowledgeScope.write);
        appliedFields.push("knowledge_scope.write");
      }
      if (proposal.updates.knowledgeScope.channels !== undefined) {
        nextKnowledgeScope.channels = normalizeStringArray(proposal.updates.knowledgeScope.channels);
        appliedFields.push("knowledge_scope.channels");
      }
    }
    if (proposal.updates.cronJobs !== undefined) {
      update.cron_jobs = proposal.updates.cronJobs;
      appliedFields.push("cron_jobs");
    }
    if (proposal.updates.connections && Object.keys(proposal.updates.connections).length > 0) {
      const currentCredentials =
        typeof nextChannelConfig.apiCredentials === "object" && !Array.isArray(nextChannelConfig.apiCredentials)
          ? (nextChannelConfig.apiCredentials as Record<string, unknown>)
          : {};
      nextChannelConfig.apiCredentials = {
        ...currentCredentials,
        ...proposal.updates.connections,
      };
      update.channel_config = nextChannelConfig;
      appliedFields.push("channel_config.apiCredentials");
    }

    if (
      proposal.updates.role ||
      (proposal.updates.knowledgeScope &&
        (proposal.updates.knowledgeScope.read !== undefined ||
          proposal.updates.knowledgeScope.write !== undefined ||
          proposal.updates.knowledgeScope.channels !== undefined))
    ) {
      update.knowledge_scope = nextKnowledgeScope;
    }

    if (Object.keys(update).length === 1) {
      const trimmedAssistantMessage = proposal.assistantMessage?.trim() ?? "";
      const hasInformationalAnswer =
        trimmedAssistantMessage.length > 0 &&
        !hasMappableUpdates(proposal.updates) &&
        // Avoid reusing the generic fallback assistantMessage as a "real" answer.
        !trimmedAssistantMessage.startsWith("Entendido. Guardé esta indicación") &&
        !trimmedAssistantMessage.startsWith("Listo. Propuse cambios");

      const assistantMessage = hasInformationalAnswer
        ? trimmedAssistantMessage
        : "No apliqué cambios persistidos en este turno. Intenta con instrucciones más directas (ej. \"Renombra a ...\", \"Cambia rol a ...\", \"Skills: ...\").";

      return Response.json({
        assistantMessage,
        proposal: proposal.updates,
        applied: false,
        appliedFields: [],
        agent: buildWorkspaceAgentPayload(typedAgent),
        workspaceSummary,
      });
    }

    const candidateEndpoint =
      update.api_endpoint !== undefined ? String(update.api_endpoint) : String(typedAgent.api_endpoint ?? "");
    const candidateApiKey =
      update.api_key !== undefined ? String(update.api_key) : String(typedAgent.api_key ?? "");
    const candidateSoulMd =
      update.soul_md !== undefined ? String(update.soul_md ?? "") : String(typedAgent.soul_md ?? "");
    const readiness = evaluateAgentReadiness({
      apiEndpoint: candidateEndpoint,
      apiKey: candidateApiKey,
      soulMd: candidateSoulMd,
    });
    update.knowledge_scope = mergeReadinessIntoKnowledgeScope(nextKnowledgeScope, readiness);
    if (String(update.status ?? typedAgent.status) === "active" && !readiness.isReady) {
      update.status = "paused";
      if (!appliedFields.includes("status")) {
        appliedFields.push("status");
      }
    }

    const { data: updatedAgentRow, error: updateError } = await supabase
      .from("workspace_agents")
      .update(update)
      .eq("id", agentId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .select("id, workspace_id, name, type, description, api_endpoint, api_key, container_name, status, soul_md, skills, knowledge_scope, cron_jobs, channel_config, memory_limit_mb, cpu_limit, created_at, updated_at")
      .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message);
    }
    if (!updatedAgentRow) {
      return Response.json({ error: "Agent not found after update." }, { status: 404 });
    }

    return Response.json({
      assistantMessage: proposal.assistantMessage,
      proposal: proposal.updates,
      applied: true,
      appliedFields,
      readiness: {
        state: readiness.state,
        issues: readiness.issues,
      },
      agent: buildWorkspaceAgentPayload(updatedAgentRow as AgentRow),
      workspaceSummary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process builder turn.";
    return Response.json({ error: message }, { status: 400 });
  }
}
