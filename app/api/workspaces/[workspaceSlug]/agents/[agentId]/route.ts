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

type AgentUpdateRequest = {
  apiEndpoint?: string;
  apiKey?: string;
  containerName?: string;
  channelConfig?: Record<string, unknown>;
  status?: "active" | "paused" | "deploying" | "error";
  name?: string;
  role?: AgentRole;
  description?: string;
  soulMd?: string;
  skills?: string[];
  knowledgeScope?: Record<string, unknown>;
  cronJobs?: unknown[];
  isActive?: boolean;
  setAsPrimaryCopilot?: boolean;
};

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

function normalizeTokenValue(value: unknown, fallback = "") {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function replaceCronVariables(
  input: unknown,
  variables: Record<"{last_run}" | "{workspace_id}" | "{today}", string>,
): unknown {
  if (typeof input === "string") {
    return input.replace(/\{last_run\}|\{workspace_id\}|\{today\}/g, (token) => {
      if (token === "{last_run}") return variables["{last_run}"];
      if (token === "{workspace_id}") return variables["{workspace_id}"];
      return variables["{today}"];
    });
  }
  if (Array.isArray(input)) {
    return input.map((entry) => replaceCronVariables(entry, variables));
  }
  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, value]) => [
        key,
        replaceCronVariables(value, variables),
      ]),
    );
  }
  return input;
}

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

function normalizeStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.length > 0);
}

function buildWorkspaceAgentPayload(row: AgentRow, isPrimaryCopilot = false) {
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
    isPrimaryCopilot,
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

async function fetchChannelStatus(endpoint: string, apiKey: string) {
  const normalizedEndpoint = endpoint.trim().replace(/\/$/, "");
  if (!normalizedEndpoint || !apiKey) {
    return null;
  }

  const candidates = [
    `${normalizedEndpoint}/v1/channels/whatsapp/status`,
    `${normalizedEndpoint}/channels/whatsapp/status`,
    `${normalizedEndpoint}/whatsapp/status`,
  ];
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "x-api-key": apiKey,
        },
      });
      if (!response.ok) {
        continue;
      }
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!payload) {
        continue;
      }
      return {
        status:
          typeof payload.status === "string"
            ? payload.status
            : typeof payload.state === "string"
              ? payload.state
              : "unknown",
        paired:
          payload.paired === true || payload.connected === true || payload.ready === true,
        qr:
          typeof payload.qr === "string"
            ? payload.qr
            : typeof payload.qr_code === "string"
              ? payload.qr_code
              : null,
        lastSeen:
          typeof payload.last_seen === "string"
            ? payload.last_seen
            : typeof payload.lastSeen === "string"
              ? payload.lastSeen
              : null,
      };
    } catch {
      // Try next status endpoint candidate.
    }
  }
  return null;
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug, agentId } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const supabase = requireSupabaseAdmin();
    const { data: agentRow, error } = await supabase
      .from("workspace_agents")
      .select("id, workspace_id, name, type, description, api_endpoint, api_key, container_name, status, soul_md, skills, knowledge_scope, cron_jobs, channel_config, memory_limit_mb, cpu_limit, created_at, updated_at")
      .eq("id", agentId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    if (!agentRow) {
      return Response.json({ error: "Agent not found." }, { status: 404 });
    }

    const searchParams = new URL(request.url).searchParams;
    const shouldLoadChannelStatus = searchParams.get("channelStatus") === "true";
    const typedRow = agentRow as AgentRow;
    const workspaceMetadata =
      authorization.membership.workspace.metadata &&
      typeof authorization.membership.workspace.metadata === "object" &&
      !Array.isArray(authorization.membership.workspace.metadata)
        ? (authorization.membership.workspace.metadata as Record<string, unknown>)
        : {};
    const isPrimaryCopilot =
      typeof workspaceMetadata.primary_copilot_agent_id === "string" &&
      workspaceMetadata.primary_copilot_agent_id === typedRow.id;
    const apiEndpoint = String(typedRow.api_endpoint ?? "").trim().replace(/\/$/, "");
    const apiKey = String(typedRow.api_key ?? "").trim();
    const channelStatus =
      shouldLoadChannelStatus && apiEndpoint && apiKey
        ? await fetchChannelStatus(apiEndpoint, apiKey)
        : null;
    const readiness = evaluateAgentReadiness({
      apiEndpoint: apiEndpoint,
      apiKey,
      soulMd: typedRow.soul_md,
    });
    const readinessState =
      (typedRow.knowledge_scope as Record<string, unknown> | null)?.readiness_state === "ready" && readiness.isReady
        ? "ready"
        : readiness.state;
    const readinessIssues = readinessState === "ready" ? [] : readiness.issues;
    const runtimeDiagnostics = {
      hasEndpoint: Boolean(apiEndpoint),
      hasApiKey: Boolean(apiKey),
      runtimeReachable: channelStatus !== null,
      runtimeState: !apiEndpoint
        ? "missing_endpoint"
        : !apiKey
          ? "missing_api_key"
          : channelStatus
            ? "reachable"
            : "unreachable",
      message:
        !apiEndpoint
          ? "Endpoint no configurado."
          : !apiKey
            ? "API key no configurada."
            : channelStatus
              ? "Runtime operativo."
              : "No fue posible obtener estado del gateway.",
      readinessState,
      readinessIssues,
    };

    return Response.json({
      agent: {
        ...buildWorkspaceAgentPayload(typedRow, isPrimaryCopilot),
        channelStatus,
        runtimeDiagnostics,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load agent.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, agentId } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const payload = (await request.json().catch(() => ({}))) as AgentUpdateRequest;
    const supabase = requireSupabaseAdmin();
    const { data: existingRow, error: existingError } = await supabase
      .from("workspace_agents")
      .select("id, workspace_id, name, type, description, api_endpoint, api_key, container_name, status, soul_md, skills, knowledge_scope, cron_jobs, channel_config, memory_limit_mb, cpu_limit, created_at, updated_at")
      .eq("id", agentId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .maybeSingle();
    if (existingError) {
      throw new Error(existingError.message);
    }
    if (!existingRow) {
      return Response.json({ error: "Agent not found." }, { status: 404 });
    }

    const current = existingRow as AgentRow;
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const nextKnowledgeScope = {
      ...((current.knowledge_scope as Record<string, unknown> | null) ?? {}),
    };

    if (payload.apiEndpoint !== undefined) {
      const trimmedEndpoint = payload.apiEndpoint.trim();
      if (!trimmedEndpoint) {
        return Response.json({ error: "apiEndpoint cannot be empty." }, { status: 400 });
      }

      let parsed: URL;
      try {
        parsed = new URL(trimmedEndpoint);
      } catch {
        return Response.json({ error: "apiEndpoint must be a valid URL." }, { status: 400 });
      }

      if (!["http:", "https:"].includes(parsed.protocol)) {
        return Response.json({ error: "apiEndpoint must start with http:// or https://." }, { status: 400 });
      }

      update.api_endpoint = trimmedEndpoint.replace(/\/$/, "");
    }

    if (payload.apiKey !== undefined) {
      const trimmedKey = payload.apiKey.trim();
      if (!trimmedKey) {
        return Response.json({ error: "apiKey cannot be empty when provided." }, { status: 400 });
      }
      update.api_key = trimmedKey;
    }

    if (payload.containerName !== undefined) {
      const trimmedContainerName = payload.containerName.trim();
      if (!trimmedContainerName) {
        return Response.json({ error: "containerName cannot be empty." }, { status: 400 });
      }
      update.container_name = trimmedContainerName;
    }

    if (payload.channelConfig !== undefined) {
      if (
        !payload.channelConfig ||
        typeof payload.channelConfig !== "object" ||
        Array.isArray(payload.channelConfig)
      ) {
        return Response.json({ error: "channelConfig must be an object." }, { status: 400 });
      }
      update.channel_config = payload.channelConfig;
    }

    if (payload.name !== undefined) {
      const trimmedName = payload.name.trim();
      if (!trimmedName) {
        return Response.json({ error: "name cannot be empty." }, { status: 400 });
      }
      update.name = trimmedName;
    }

    if (payload.description !== undefined) {
      const trimmedDescription = payload.description.trim();
      update.description = trimmedDescription.length > 0 ? trimmedDescription : null;
    }

    if (payload.soulMd !== undefined) {
      update.soul_md = payload.soulMd.trim().length > 0 ? payload.soulMd : null;
    }

    if (payload.skills !== undefined) {
      try {
        update.skills = normalizeStringArray(payload.skills, "skills");
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Invalid skills payload." }, { status: 400 });
      }
    }

    if (payload.role !== undefined) {
      update.type = mapRoleToRuntimeType(payload.role);
      nextKnowledgeScope.legacy_role = payload.role;
    }

    if (payload.knowledgeScope !== undefined) {
      if (
        !payload.knowledgeScope ||
        typeof payload.knowledgeScope !== "object" ||
        Array.isArray(payload.knowledgeScope)
      ) {
        return Response.json({ error: "knowledgeScope must be an object." }, { status: 400 });
      }

      try {
        if ("read" in payload.knowledgeScope) {
          nextKnowledgeScope.read = normalizeStringArray(payload.knowledgeScope.read, "knowledgeScope.read");
        }
        if ("write" in payload.knowledgeScope) {
          nextKnowledgeScope.write = normalizeStringArray(payload.knowledgeScope.write, "knowledgeScope.write");
        }
        if ("channels" in payload.knowledgeScope) {
          nextKnowledgeScope.channels = normalizeStringArray(payload.knowledgeScope.channels, "knowledgeScope.channels");
        }
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Invalid knowledgeScope." }, { status: 400 });
      }
    }

    if (payload.cronJobs !== undefined) {
      if (!Array.isArray(payload.cronJobs)) {
        return Response.json({ error: "cronJobs must be an array." }, { status: 400 });
      }
      update.cron_jobs = payload.cronJobs;
    }

    if (payload.isActive !== undefined) {
      update.status = payload.isActive ? "active" : "paused";
    }

    if (payload.status !== undefined) {
      if (!["active", "paused", "deploying", "error"].includes(payload.status)) {
        return Response.json({ error: "Invalid status value." }, { status: 400 });
      }
      update.status = payload.status;
    }

    if (payload.role !== undefined || payload.knowledgeScope !== undefined) {
      update.knowledge_scope = nextKnowledgeScope;
    }

    const candidateEndpoint =
      update.api_endpoint !== undefined ? String(update.api_endpoint) : String(current.api_endpoint ?? "");
    const candidateApiKey =
      update.api_key !== undefined ? String(update.api_key) : String(current.api_key ?? "");
    const candidateSoulMd =
      update.soul_md !== undefined ? String(update.soul_md ?? "") : String(current.soul_md ?? "");
    const readiness = evaluateAgentReadiness({
      apiEndpoint: candidateEndpoint,
      apiKey: candidateApiKey,
      soulMd: candidateSoulMd,
    });
    const mergedKnowledgeScope = mergeReadinessIntoKnowledgeScope(nextKnowledgeScope, readiness);
    update.knowledge_scope = mergedKnowledgeScope;

    const requestedStatus =
      update.status !== undefined
        ? String(update.status)
        : current.status;
    const targetType = String(update.type ?? current.type);
    const requestedActivation = payload.status === "active" || payload.isActive === true;
    if (requestedStatus === "active" && !readiness.isReady) {
      if (requestedActivation) {
        return Response.json(
          {
            error: `Agent cannot be active while draft: ${readiness.issues.join(", ") || "configuration incomplete"}.`,
            readiness: {
              state: readiness.state,
              issues: readiness.issues,
            },
          },
          { status: 400 },
        );
      }
      update.status = "paused";
    }
    if (payload.setAsPrimaryCopilot === true && targetType !== "copilot") {
      return Response.json({ error: "Only copilot agents can be set as primary CEO." }, { status: 400 });
    }

    if (Object.keys(update).length === 1) {
      return Response.json(
        {
          error:
            "At least one field is required: apiEndpoint, apiKey, containerName, channelConfig, status, name, role, description, soulMd, skills, knowledgeScope, cronJobs, or isActive.",
        },
        { status: 400 },
      );
    }

    const { data: updatedAgent, error } = await supabase
      .from("workspace_agents")
      .update(update)
      .eq("id", agentId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .select("id, workspace_id, name, type, description, api_endpoint, api_key, container_name, status, soul_md, skills, knowledge_scope, cron_jobs, channel_config, memory_limit_mb, cpu_limit, created_at, updated_at")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!updatedAgent) {
      return Response.json({ error: "Agent not found." }, { status: 404 });
    }

    const typedUpdatedAgent = updatedAgent as AgentRow;
    const shouldSetPrimary = payload.setAsPrimaryCopilot === true;
    if (shouldSetPrimary) {
      const { data: workspaceRow, error: workspaceError } = await supabase
        .from("workspaces")
        .select("id, metadata")
        .eq("id", authorization.membership.workspaceId)
        .maybeSingle();
      if (workspaceError) {
        throw new Error(workspaceError.message);
      }
      if (workspaceRow) {
        const currentMetadata =
          workspaceRow.metadata && typeof workspaceRow.metadata === "object" && !Array.isArray(workspaceRow.metadata)
            ? (workspaceRow.metadata as Record<string, unknown>)
            : {};
        const { error: metadataUpdateError } = await supabase
          .from("workspaces")
          .update({
            metadata: {
              ...currentMetadata,
              primary_copilot_agent_id: typedUpdatedAgent.id,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", authorization.membership.workspaceId);
        if (metadataUpdateError) {
          throw new Error(metadataUpdateError.message);
        }
      }
    }
    const membershipMetadata =
      authorization.membership.workspace.metadata &&
      typeof authorization.membership.workspace.metadata === "object" &&
      !Array.isArray(authorization.membership.workspace.metadata)
        ? (authorization.membership.workspace.metadata as Record<string, unknown>)
        : {};
    const isPrimaryCopilot =
      shouldSetPrimary ||
      (typeof membershipMetadata.primary_copilot_agent_id === "string" &&
        membershipMetadata.primary_copilot_agent_id === typedUpdatedAgent.id);
    const payloadAgent = buildWorkspaceAgentPayload(typedUpdatedAgent, isPrimaryCopilot);

    return Response.json({
      agent: payloadAgent,
      readiness: {
        state: readiness.state,
        issues: readiness.issues,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update agent settings.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(_request: Request, context: Context) {
  try {
    const { workspaceSlug, agentId } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const supabase = requireSupabaseAdmin();
    const { data: agentRow, error: agentError } = await supabase
      .from("workspace_agents")
      .select("id, workspace_id, api_endpoint, api_key, status, soul_md, knowledge_scope, cron_jobs")
      .eq("id", agentId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .maybeSingle();

    if (agentError) {
      throw new Error(agentError.message);
    }

    if (!agentRow) {
      return Response.json({ error: "Agent not found." }, { status: 404 });
    }

    const endpoint = String(agentRow.api_endpoint ?? "").trim().replace(/\/$/, "");
    if (!endpoint) {
      return Response.json({ error: "Agent endpoint is not configured." }, { status: 400 });
    }

    const apiKey = String(agentRow.api_key ?? "").trim();
    if (!apiKey) {
      return Response.json({ error: "Agent API key is not configured." }, { status: 400 });
    }

    let healthy = false;
    let errorMessage = "";

    try {
      const healthResponse = await fetch(`${endpoint}/health`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "x-api-key": apiKey,
        },
      });
      healthy = healthResponse.ok;
      if (!healthResponse.ok) {
        const body = await healthResponse.text().catch(() => "");
        errorMessage = body || `Health check failed with status ${healthResponse.status}.`;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Failed to contact agent endpoint.";
    }

    let cronRegistered = false;
    let cronError = "";
    const cronJobs = Array.isArray(agentRow.cron_jobs)
      ? (agentRow.cron_jobs as Array<Record<string, unknown>>)
      : [];
    if (healthy && cronJobs.length > 0) {
      try {
        const previousKnowledgeScope = (agentRow.knowledge_scope as Record<string, unknown>) ?? {};
        const lastRunCandidate =
          normalizeTokenValue(previousKnowledgeScope.last_cron_run_at) ||
          normalizeTokenValue(previousKnowledgeScope.last_health_check_at) ||
          new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const cronVariables = {
          "{last_run}": lastRunCandidate,
          "{workspace_id}": String(agentRow.workspace_id),
          "{today}": new Date().toISOString().slice(0, 10),
        } as const;

        const cronResponse = await fetch(`${endpoint}/v1/cron`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jobs: cronJobs.map((job, index) => ({
              lock: true,
              ...(replaceCronVariables(job, cronVariables) as Record<string, unknown>),
              id: typeof job.id === "string" ? job.id : `job-${index + 1}`,
            })),
          }),
        });
        cronRegistered = cronResponse.ok;
        if (!cronResponse.ok) {
          const body = await cronResponse.text().catch(() => "");
          cronError = body || `Cron registration failed with status ${cronResponse.status}.`;
        }
      } catch (error) {
        cronError = error instanceof Error ? error.message : "Failed to register cron jobs.";
      }
    }

    const readiness = evaluateAgentReadiness({
      apiEndpoint: endpoint,
      apiKey,
      soulMd: String(agentRow.soul_md ?? ""),
    });

    const lastHealthCheckAt = new Date().toISOString();
    const previousKnowledgeScope = (agentRow.knowledge_scope as Record<string, unknown>) ?? {};
    const nextCronRunAt = healthy && !cronError ? new Date().toISOString() : undefined;
    const nextKnowledgeScope = mergeReadinessIntoKnowledgeScope({
      ...previousKnowledgeScope,
      last_health_check_at: lastHealthCheckAt,
      ...(nextCronRunAt ? { last_cron_run_at: nextCronRunAt } : {}),
    }, readiness);

    const nextStatus: "active" | "paused" | "error" =
      !readiness.isReady ? "paused" : healthy ? "active" : "error";
    const { error: updateError } = await supabase
      .from("workspace_agents")
      .update({
        status: nextStatus,
        knowledge_scope: nextKnowledgeScope,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agentId)
      .eq("workspace_id", authorization.membership.workspaceId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const channelStatus = healthy ? await fetchChannelStatus(endpoint, apiKey) : null;

    return Response.json({
      health: {
        ok: healthy,
        error: healthy && !cronError ? undefined : cronError || errorMessage || "Unable to connect.",
      },
      healthy,
      readiness: {
        state: readiness.state,
        issues: readiness.issues,
      },
      cron: {
        configured: cronJobs.length,
        registered: cronRegistered,
        error: cronError || undefined,
      },
      status: nextStatus,
      lastHealthCheckAt,
      lastCronRunAt:
        typeof nextKnowledgeScope.last_cron_run_at === "string"
          ? String(nextKnowledgeScope.last_cron_run_at)
          : null,
      channelStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run agent health check.";
    return Response.json({ error: message }, { status: 400 });
  }
}
