import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string; agentId: string }>;
};

type AgentUpdateRequest = {
  apiEndpoint?: string;
  apiKey?: string;
  containerName?: string;
  channelConfig?: Record<string, unknown>;
  status?: "active" | "paused" | "deploying" | "error";
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
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
      error: Response.json({ error: "Only workspace admins can manage deployment settings." }, { status: 403 }),
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
      .select("id, name, status, api_endpoint, api_key, container_name, channel_config, knowledge_scope, updated_at")
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
    const apiEndpoint = String(agentRow.api_endpoint ?? "").trim().replace(/\/$/, "");
    const apiKey = String(agentRow.api_key ?? "").trim();
    const channelStatus =
      shouldLoadChannelStatus && apiEndpoint && apiKey
        ? await fetchChannelStatus(apiEndpoint, apiKey)
        : null;

    return Response.json({
      agent: {
        id: String(agentRow.id),
        name: String(agentRow.name),
        status: String(agentRow.status),
        apiEndpoint,
        containerName: String(agentRow.container_name),
        channelConfig: (agentRow.channel_config as Record<string, unknown>) ?? {},
        lastHealthCheckAt:
          typeof (agentRow.knowledge_scope as Record<string, unknown> | null)?.last_health_check_at === "string"
            ? String((agentRow.knowledge_scope as Record<string, unknown>).last_health_check_at)
            : null,
        channelStatus,
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
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
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

    if (payload.status !== undefined) {
      if (!["active", "paused", "deploying", "error"].includes(payload.status)) {
        return Response.json({ error: "Invalid status value." }, { status: 400 });
      }
      update.status = payload.status;
    }

    if (Object.keys(update).length === 1) {
      return Response.json(
        { error: "At least one field is required: apiEndpoint, apiKey, containerName, channelConfig, or status." },
        { status: 400 },
      );
    }

    const supabase = requireSupabaseAdmin();
    const { data: updatedAgent, error } = await supabase
      .from("workspace_agents")
      .update(update)
      .eq("id", agentId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .select("id, name, status, api_endpoint, container_name, channel_config, knowledge_scope, updated_at")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!updatedAgent) {
      return Response.json({ error: "Agent not found." }, { status: 404 });
    }

    return Response.json({
      agent: {
        id: String(updatedAgent.id),
        name: String(updatedAgent.name),
        status: String(updatedAgent.status),
        apiEndpoint: String(updatedAgent.api_endpoint),
        containerName: String(updatedAgent.container_name),
        channelConfig: (updatedAgent.channel_config as Record<string, unknown>) ?? {},
        lastHealthCheckAt:
          typeof (updatedAgent.knowledge_scope as Record<string, unknown> | null)?.last_health_check_at === "string"
            ? String((updatedAgent.knowledge_scope as Record<string, unknown>).last_health_check_at)
            : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update agent deployment settings.";
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
      .select("id, workspace_id, api_endpoint, api_key, status, knowledge_scope, cron_jobs")
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
              ...job,
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

    const lastHealthCheckAt = new Date().toISOString();
    const previousKnowledgeScope = (agentRow.knowledge_scope as Record<string, unknown>) ?? {};
    const nextKnowledgeScope = {
      ...previousKnowledgeScope,
      last_health_check_at: lastHealthCheckAt,
    };

    const nextStatus: "active" | "error" = healthy && !cronError ? "active" : "error";
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
      cron: {
        configured: cronJobs.length,
        registered: cronRegistered,
        error: cronError || undefined,
      },
      status: nextStatus,
      lastHealthCheckAt,
      channelStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run agent health check.";
    return Response.json({ error: message }, { status: 400 });
  }
}
