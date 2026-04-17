import { getCurrentAppUser } from "@/lib/auth";
import {
  evaluateAgentReadiness,
  mergeReadinessIntoKnowledgeScope,
} from "@/lib/agentReadiness";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

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
  const match = message.match(
    /(?:rename(?:\s+this\s+agent)?\s+to|renombra(?:r)?(?:\s+este\s+agente)?\s+a|nombre(?:\s+del\s+agente)?\s*[:=])\s*["“]?([^"\n”]+)["”]?/i,
  );
  if (!match?.[1]) {
    return undefined;
  }
  return match[1].trim();
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

async function inferProposalWithOpenRouter(message: string, agent: AgentRow): Promise<BuilderProposal | null> {
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
            "You are a workspace agent-builder parser. Convert user intent into JSON updates for an agent configuration. Return JSON only. Allowed role values: intake_assistant, lead_qualifier, crm_updater, follow_up, ops_assistant, custom. Keep updates sparse: only include fields explicitly requested. For API keys/integrations, put them in updates.connections as KEY: VALUE. For cron jobs, use updates.cronJobs as a JSON array.",
        },
        {
          role: "user",
          content: `Current agent:\n${JSON.stringify(currentContext, null, 2)}\n\nUser request:\n${message}\n\nReturn this exact JSON shape:\n{"assistantMessage":"...","updates":{"name":"?","role":"?","description":"?","soulMd":"?","skills":[],"knowledgeScope":{"read":[],"write":[],"channels":[]},"cronJobs":[],"connections":{"CLOSE_API_KEY":"..."}}}`,
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
    if (isSummaryIntent(message)) {
      return Response.json({
        assistantMessage: buildAgentSummary(typedAgent),
        proposal: {},
        applied: false,
        appliedFields: [],
        agent: buildWorkspaceAgentPayload(typedAgent),
      });
    }

    const proposal = (await inferProposalWithOpenRouter(message, typedAgent)) ?? inferProposalFallback(message);

    if (!shouldApply) {
      return Response.json({
        assistantMessage: proposal.assistantMessage,
        proposal: proposal.updates,
        applied: false,
        appliedFields: [],
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
      return Response.json({
        assistantMessage:
          "No apliqué cambios persistidos en este turno. Intenta con instrucciones más directas (ej. \"Renombra a ...\", \"Cambia rol a ...\", \"Skills: ...\").",
        proposal: proposal.updates,
        applied: false,
        appliedFields: [],
        agent: buildWorkspaceAgentPayload(typedAgent),
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process builder turn.";
    return Response.json({ error: message }, { status: 400 });
  }
}
