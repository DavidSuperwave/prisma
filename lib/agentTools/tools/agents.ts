/**
 * Agent management tools (CEO-only by convention).
 *
 * These tools let the workspace's primary copilot (the CEO) edit OTHER
 * workspace agents directly from chat — SOUL.md, skills, jobs, knowledge
 * scope, channel/connection config, and status.
 *
 * All mutations go through the existing PATCH route at
 * /api/workspaces/{slug}/agents/{agentId}, so the route's RLS + admin
 * authorization is the single source of truth. The "CEO-only" framing is
 * a convention enforced upstream (we tell Hermes only the CEO should call
 * these). The route still rejects callers who are not workspace admins.
 */

import { registerTool, type ToolContext, type ToolResult } from "../registry";
import { fetchInternalJson } from "../executor";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type AgentSummary = {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string | null;
  isPrimaryCopilot: boolean;
  isActive: boolean;
  soulSnippet: string | null;
  skillsCount: number;
  channelsCount: number;
  cronJobsCount: number;
};

async function resolveWorkspaceId(workspaceSlug: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("subdomain", workspaceSlug)
    .maybeSingle();
  return data ? String(data.id) : null;
}

async function resolvePrimaryCopilotId(workspaceSlug: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("workspaces")
    .select("metadata")
    .eq("subdomain", workspaceSlug)
    .maybeSingle();
  if (!data) return null;
  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  const primary = metadata.primary_copilot_agent_id;
  return typeof primary === "string" ? primary : null;
}

async function patchAgent(
  ctx: ToolContext,
  agentId: string,
  body: Record<string, unknown>,
): Promise<ToolResult> {
  const result = await fetchInternalJson<{ agent?: unknown; error?: string }>(
    ctx,
    `/api/workspaces/${encodeURIComponent(ctx.workspaceSlug)}/agents/${encodeURIComponent(agentId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? "PATCH failed.",
      status: result.status,
    };
  }
  return { ok: true, data: result.data ?? {} };
}

registerTool({
  name: "agents.list",
  description:
    "List every agent in the workspace with id, name, type, status, isPrimaryCopilot flag and short SOUL snippet. Use BEFORE editing to confirm the right agent id. CEO-only by convention.",
  args: {},
  handler: async (_args, ctx): Promise<ToolResult<{ agents: AgentSummary[] }>> => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin unavailable.", status: 500 };

    const workspaceId = await resolveWorkspaceId(ctx.workspaceSlug);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const primaryCopilotId = await resolvePrimaryCopilotId(ctx.workspaceSlug);

    const { data, error } = await supabase
      .from("workspace_agents")
      .select("id, name, type, status, description, soul_md, skills, knowledge_scope, cron_jobs")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (error) return { ok: false, error: error.message, status: 400 };

    const agents: AgentSummary[] = (data ?? []).map((row) => {
      const soul = typeof row.soul_md === "string" ? row.soul_md.trim() : "";
      const soulSnippet = soul ? soul.split(/\r?\n/).slice(0, 3).join(" ").slice(0, 240) : null;
      const knowledgeScope = (row.knowledge_scope ?? {}) as Record<string, unknown>;
      const channelsList = Array.isArray(knowledgeScope.channels)
        ? (knowledgeScope.channels as unknown[])
        : [];
      const skillsArr = Array.isArray(row.skills) ? (row.skills as unknown[]) : [];
      const cronJobsArr = Array.isArray(row.cron_jobs) ? (row.cron_jobs as unknown[]) : [];
      const id = String(row.id);
      return {
        id,
        name: typeof row.name === "string" ? row.name : "",
        type: typeof row.type === "string" ? row.type : "",
        status: typeof row.status === "string" ? row.status : "",
        description: typeof row.description === "string" ? row.description : null,
        isPrimaryCopilot: primaryCopilotId !== null && primaryCopilotId === id,
        isActive: row.status === "active",
        soulSnippet,
        skillsCount: skillsArr.length,
        channelsCount: channelsList.length,
        cronJobsCount: cronJobsArr.length,
      };
    });

    return { ok: true, data: { agents } };
  },
});

registerTool({
  name: "agents.update_soul",
  description:
    "Replace an agent's SOUL.md (persona + role definition). Use when the user asks to change an agent's persona, voice, role or behavior. CEO-only by convention.",
  args: {
    agent_id: { type: "string", required: true, description: "Target workspace_agents.id" },
    soul_md: { type: "string", required: true, description: "Full Markdown for the new SOUL.md (overwrites existing)." },
  },
  handler: async (rawArgs, ctx): Promise<ToolResult> => {
    const args = rawArgs as { agent_id?: string; soul_md?: string };
    const agentId = String(args.agent_id ?? "").trim();
    if (!agentId) return { ok: false, error: "agent_id is required.", status: 400 };
    const soulMd = typeof args.soul_md === "string" ? args.soul_md : "";
    return patchAgent(ctx, agentId, { soulMd });
  },
});

registerTool({
  name: "agents.update_identity",
  description:
    "Update an agent's displayed name and optional description. Use when the user's request changes the operator's role enough that the current name no longer fits. CEO-only by convention.",
  args: {
    agent_id: { type: "string", required: true, description: "Target workspace_agents.id" },
    name: { type: "string", required: true, description: "New short agent name shown in the UI." },
    description: {
      type: "string",
      description: "Optional short summary of the operator's role. Omit to leave unchanged.",
    },
  },
  handler: async (rawArgs, ctx): Promise<ToolResult> => {
    const args = rawArgs as { agent_id?: string; name?: string; description?: string };
    const agentId = String(args.agent_id ?? "").trim();
    if (!agentId) return { ok: false, error: "agent_id is required.", status: 400 };
    const name = typeof args.name === "string" ? args.name.trim() : "";
    if (!name) return { ok: false, error: "name is required.", status: 400 };
    const body: Record<string, unknown> = { name };
    if (typeof args.description === "string") {
      body.description = args.description;
    }
    return patchAgent(ctx, agentId, body);
  },
});

registerTool({
  name: "agents.update_skills",
  description:
    "Replace an agent's skills list (skills/) and optionally the MCP tool include allow-list. Use when the user wants to enable/disable specific skills or tools on an agent. CEO-only by convention.",
  args: {
    agent_id: { type: "string", required: true },
    skills: { type: "array", description: "List of skill slugs (replaces existing skills array)." },
    mcp_tools_include: {
      type: "array",
      description: "Optional explicit MCP tool include list. Empty array uses role preset.",
    },
  },
  handler: async (rawArgs, ctx): Promise<ToolResult> => {
    const args = rawArgs as {
      agent_id?: string;
      skills?: unknown;
      mcp_tools_include?: unknown;
    };
    const agentId = String(args.agent_id ?? "").trim();
    if (!agentId) return { ok: false, error: "agent_id is required.", status: 400 };
    const body: Record<string, unknown> = {};
    if (Array.isArray(args.skills)) {
      body.skills = args.skills.map((entry) => String(entry ?? "").trim()).filter(Boolean);
    }
    if (Array.isArray(args.mcp_tools_include)) {
      body.mcpToolsInclude = args.mcp_tools_include
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean);
    }
    if (Object.keys(body).length === 0) {
      return { ok: false, error: "Provide at least skills or mcp_tools_include.", status: 400 };
    }
    return patchAgent(ctx, agentId, body);
  },
});

registerTool({
  name: "agents.update_knowledge",
  description:
    "Update an agent's knowledge scope: which workspace objects it can read/write and the channel/scope tags it covers. Replaces only the keys you provide. CEO-only by convention.",
  args: {
    agent_id: { type: "string", required: true },
    read: { type: "array", description: "Object slugs the agent can read." },
    write: { type: "array", description: "Object slugs the agent can write." },
    channels: { type: "array", description: "Scope/channel tags (e.g. whatsapp, web-chat)." },
  },
  handler: async (rawArgs, ctx): Promise<ToolResult> => {
    const args = rawArgs as {
      agent_id?: string;
      read?: unknown;
      write?: unknown;
      channels?: unknown;
    };
    const agentId = String(args.agent_id ?? "").trim();
    if (!agentId) return { ok: false, error: "agent_id is required.", status: 400 };
    const knowledgeScope: Record<string, unknown> = {};
    if (Array.isArray(args.read)) {
      knowledgeScope.read = args.read.map((entry) => String(entry ?? "").trim()).filter(Boolean);
    }
    if (Array.isArray(args.write)) {
      knowledgeScope.write = args.write.map((entry) => String(entry ?? "").trim()).filter(Boolean);
    }
    if (Array.isArray(args.channels)) {
      knowledgeScope.channels = args.channels
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean);
    }
    if (Object.keys(knowledgeScope).length === 0) {
      return { ok: false, error: "Provide at least one of read, write, channels.", status: 400 };
    }
    return patchAgent(ctx, agentId, { knowledgeScope });
  },
});

registerTool({
  name: "agents.update_jobs",
  description:
    "Replace an agent's cron_jobs (scheduled triggers). Each job must include cron, prompt or tool args. CEO-only by convention.",
  args: {
    agent_id: { type: "string", required: true },
    cron_jobs: {
      type: "array",
      required: true,
      description: "Full replacement array of cron job objects.",
    },
  },
  handler: async (rawArgs, ctx): Promise<ToolResult> => {
    const args = rawArgs as { agent_id?: string; cron_jobs?: unknown };
    const agentId = String(args.agent_id ?? "").trim();
    if (!agentId) return { ok: false, error: "agent_id is required.", status: 400 };
    if (!Array.isArray(args.cron_jobs)) {
      return { ok: false, error: "cron_jobs must be an array.", status: 400 };
    }
    return patchAgent(ctx, agentId, { cronJobs: args.cron_jobs });
  },
});

registerTool({
  name: "agents.update_connections",
  description:
    "Merge keys into an agent's channel_config (transport credentials and connection metadata for Telegram, Discord, Slack, WhatsApp, BlueBubbles, etc.). Pass `replace: true` to overwrite the entire object. CEO-only by convention.",
  args: {
    agent_id: { type: "string", required: true },
    channel_config: {
      type: "object",
      required: true,
      description: "Object whose keys are merged into channel_config.",
    },
    replace: {
      type: "boolean",
      description: "If true, replaces channel_config entirely instead of merging.",
    },
  },
  handler: async (rawArgs, ctx): Promise<ToolResult> => {
    const args = rawArgs as {
      agent_id?: string;
      channel_config?: unknown;
      replace?: boolean;
    };
    const agentId = String(args.agent_id ?? "").trim();
    if (!agentId) return { ok: false, error: "agent_id is required.", status: 400 };
    if (
      !args.channel_config ||
      typeof args.channel_config !== "object" ||
      Array.isArray(args.channel_config)
    ) {
      return { ok: false, error: "channel_config must be an object.", status: 400 };
    }
    const incoming = args.channel_config as Record<string, unknown>;
    let next: Record<string, unknown> = incoming;
    if (!args.replace) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const workspaceId = await resolveWorkspaceId(ctx.workspaceSlug);
        if (workspaceId) {
          const { data: row } = await supabase
            .from("workspace_agents")
            .select("channel_config")
            .eq("id", agentId)
            .eq("workspace_id", workspaceId)
            .maybeSingle();
          const existing =
            row?.channel_config && typeof row.channel_config === "object" && !Array.isArray(row.channel_config)
              ? (row.channel_config as Record<string, unknown>)
              : {};
          next = { ...existing, ...incoming };
        }
      }
    }
    return patchAgent(ctx, agentId, { channelConfig: next });
  },
});

registerTool({
  name: "agents.set_status",
  description:
    "Activate or pause an agent. Use 'active' to bring it online and 'paused' to take it offline. CEO-only by convention.",
  args: {
    agent_id: { type: "string", required: true },
    status: {
      type: "string",
      required: true,
      description: "Either 'active' or 'paused'.",
    },
  },
  handler: async (rawArgs, ctx): Promise<ToolResult> => {
    const args = rawArgs as { agent_id?: string; status?: string };
    const agentId = String(args.agent_id ?? "").trim();
    if (!agentId) return { ok: false, error: "agent_id is required.", status: 400 };
    const status = String(args.status ?? "").toLowerCase();
    if (status !== "active" && status !== "paused") {
      return { ok: false, error: "status must be 'active' or 'paused'.", status: 400 };
    }
    return patchAgent(ctx, agentId, { isActive: status === "active" });
  },
});

