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

    if (payload.status !== undefined) {
      if (!["active", "paused", "deploying", "error"].includes(payload.status)) {
        return Response.json({ error: "Invalid status value." }, { status: 400 });
      }
      update.status = payload.status;
    }

    if (Object.keys(update).length === 1) {
      return Response.json(
        { error: "At least one field is required: apiEndpoint, apiKey, containerName, or status." },
        { status: 400 },
      );
    }

    const supabase = requireSupabaseAdmin();
    const { data: updatedAgent, error } = await supabase
      .from("workspace_agents")
      .update(update)
      .eq("id", agentId)
      .eq("workspace_id", authorization.membership.workspaceId)
      .select("id, name, status, api_endpoint, container_name, knowledge_scope, updated_at")
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
      .select("id, workspace_id, api_endpoint, api_key, status, knowledge_scope")
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

    const lastHealthCheckAt = new Date().toISOString();
    const previousKnowledgeScope = (agentRow.knowledge_scope as Record<string, unknown>) ?? {};
    const nextKnowledgeScope = {
      ...previousKnowledgeScope,
      last_health_check_at: lastHealthCheckAt,
    };

    const nextStatus: "active" | "error" = healthy ? "active" : "error";
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

    return Response.json({
      health: {
        ok: healthy,
        error: healthy ? undefined : errorMessage || "Unable to connect.",
      },
      status: nextStatus,
      lastHealthCheckAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run agent health check.";
    return Response.json({ error: message }, { status: 400 });
  }
}
