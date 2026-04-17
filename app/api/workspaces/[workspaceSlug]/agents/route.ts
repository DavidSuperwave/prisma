import { getCurrentAppUser } from "@/lib/auth";
import {
  evaluateAgentReadiness,
  mergeReadinessIntoKnowledgeScope,
} from "@/lib/agentReadiness";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type AgentRole =
  | "intake_assistant"
  | "lead_qualifier"
  | "crm_updater"
  | "follow_up"
  | "ops_assistant"
  | "custom";

type CreateAgentRequest = {
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
  channelConfig?: Record<string, unknown>;
  isActive?: boolean;
  apiEndpoint?: string;
  apiKey?: string;
  containerName?: string;
  isPrimaryCopilot?: boolean;
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

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

function sanitizeContainerName(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function normalizeStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.length > 0);
}

function mapRoleToRuntimeType(role: AgentRole): "copilot" | "channel" | "worker" {
  if (role === "intake_assistant" || role === "ops_assistant") return "copilot";
  if (role === "lead_qualifier" || role === "follow_up") return "channel";
  return "worker";
}

function resolveWorkspaceAgentLimit(workspaceRow: { agent_limit: number | null; metadata: Record<string, unknown> | null }) {
  const directLimit = Number(workspaceRow.agent_limit ?? Number.NaN);
  if (Number.isFinite(directLimit) && directLimit > 0) {
    return Math.floor(directLimit);
  }
  const metadata = workspaceRow.metadata ?? {};
  const metadataLimit =
    typeof metadata.agent_limit === "number"
      ? metadata.agent_limit
      : typeof metadata.agentLimit === "number"
        ? metadata.agentLimit
        : null;
  if (typeof metadataLimit === "number" && Number.isFinite(metadataLimit) && metadataLimit > 0) {
    return Math.floor(metadataLimit);
  }
  return 3;
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
  const readinessState =
    knowledgeScope.readiness_state === "ready" ? "ready" : "draft";
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

async function ensureUniqueContainerName(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  workspaceId: string,
  base: string,
) {
  let index = 0;
  while (index < 50) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const { data, error } = await supabase
      .from("workspace_agents")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("container_name", candidate)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      return candidate;
    }
    index += 1;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const authorization = await authorizeWorkspaceAdmin(workspaceSlug);
    if ("error" in authorization) {
      return authorization.error;
    }

    const payload = (await request.json().catch(() => ({}))) as CreateAgentRequest;
    const role = payload.role ?? "custom";
    const name = payload.name?.trim();
    if (!name) {
      return Response.json({ error: "name is required." }, { status: 400 });
    }
    const apiEndpoint = payload.apiEndpoint?.trim() ?? "";
    const apiKey = payload.apiKey?.trim() ?? "";
    if (apiEndpoint) {
      let parsed: URL;
      try {
        parsed = new URL(apiEndpoint);
      } catch {
        return Response.json({ error: "apiEndpoint must be a valid URL." }, { status: 400 });
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return Response.json({ error: "apiEndpoint must start with http:// or https://." }, { status: 400 });
      }
    }

    const skills = payload.skills ? normalizeStringArray(payload.skills, "skills") : [];
    const read = payload.knowledgeScope?.read ? normalizeStringArray(payload.knowledgeScope.read, "knowledgeScope.read") : [];
    const write = payload.knowledgeScope?.write ? normalizeStringArray(payload.knowledgeScope.write, "knowledgeScope.write") : [];
    const channels = payload.knowledgeScope?.channels ? normalizeStringArray(payload.knowledgeScope.channels, "knowledgeScope.channels") : [];
    const cronJobs = payload.cronJobs ?? [];
    if (!Array.isArray(cronJobs)) {
      return Response.json({ error: "cronJobs must be an array." }, { status: 400 });
    }
    if (payload.channelConfig !== undefined) {
      if (
        !payload.channelConfig ||
        typeof payload.channelConfig !== "object" ||
        Array.isArray(payload.channelConfig)
      ) {
        return Response.json({ error: "channelConfig must be an object." }, { status: 400 });
      }
    }

    const supabase = requireSupabaseAdmin();
    const { data: workspaceRow, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id, agent_limit, metadata")
      .eq("id", authorization.membership.workspaceId)
      .maybeSingle();

    if (workspaceError) {
      throw new Error(workspaceError.message);
    }
    if (!workspaceRow) {
      return Response.json({ error: "Workspace not found." }, { status: 404 });
    }

    const limit = resolveWorkspaceAgentLimit(workspaceRow as { agent_limit: number | null; metadata: Record<string, unknown> | null });
    const { count, error: countError } = await supabase
      .from("workspace_agents")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", authorization.membership.workspaceId);
    if (countError) {
      throw new Error(countError.message);
    }
    if ((count ?? 0) >= limit) {
      return Response.json(
        { error: `Este workspace ya usa ${count ?? 0} de ${limit} agentes.` },
        { status: 400 },
      );
    }

    const baseContainerName = sanitizeContainerName(`hermes-${workspaceSlug}-${role}`);
    const requestedContainerBase = payload.containerName?.trim()
      ? sanitizeContainerName(payload.containerName)
      : "";
    const containerName = await ensureUniqueContainerName(
      supabase,
      authorization.membership.workspaceId,
      requestedContainerBase || baseContainerName || `hermes-${workspaceSlug}`,
    );

    const baseKnowledgeScope = {
      legacy_role: role,
      model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
      read,
      write,
      channels,
    } satisfies Record<string, unknown>;
    const readiness = evaluateAgentReadiness({
      apiEndpoint,
      apiKey,
      soulMd: payload.soulMd?.trim() ?? "",
    });
    const knowledgeScope = mergeReadinessIntoKnowledgeScope(baseKnowledgeScope, readiness);
    const requestedActive = payload.isActive !== false;
    const nextStatus =
      requestedActive && readiness.isReady ? "active" : "paused";

    const now = new Date().toISOString();
    const { data: insertedRow, error: insertError } = await supabase
      .from("workspace_agents")
      .insert({
        workspace_id: authorization.membership.workspaceId,
        name,
        type: mapRoleToRuntimeType(role),
        description: payload.description?.trim() || null,
        container_name: containerName,
        api_endpoint: apiEndpoint,
        api_key: apiKey,
        hermes_version: "v2026.4.1",
        status: nextStatus,
        soul_md: payload.soulMd?.trim() || null,
        skills,
        knowledge_scope: knowledgeScope,
        cron_jobs: cronJobs,
        channel_config: payload.channelConfig ?? {},
        memory_limit_mb: 512,
        cpu_limit: 0.5,
        created_at: now,
        updated_at: now,
      })
      .select("id, workspace_id, name, type, description, api_endpoint, api_key, container_name, status, soul_md, skills, knowledge_scope, cron_jobs, channel_config, memory_limit_mb, cpu_limit, created_at, updated_at")
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    if (payload.isPrimaryCopilot === true && mapRoleToRuntimeType(role) === "copilot") {
      const { data: workspaceRow, error: workspaceMetadataError } = await supabase
        .from("workspaces")
        .select("id, metadata")
        .eq("id", authorization.membership.workspaceId)
        .maybeSingle();
      if (workspaceMetadataError) {
        throw new Error(workspaceMetadataError.message);
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
              primary_copilot_agent_id: String(insertedRow.id),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", authorization.membership.workspaceId);
        if (metadataUpdateError) {
          throw new Error(metadataUpdateError.message);
        }
      }
    }

    return Response.json(
      {
        agent: buildWorkspaceAgentPayload(insertedRow as AgentRow),
        readiness: {
          state: readiness.state,
          issues: readiness.issues,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create agent.";
    return Response.json({ error: message }, { status: 400 });
  }
}
