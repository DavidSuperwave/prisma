import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import { resolveMcpToolPolicy } from "@/lib/agentTools/mcpPolicy";
import { issuePrismaMcpSessionToken } from "@/lib/agentMcpSession";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getIntegrationBySlug,
  getIntegrationSecrets,
  listIntegrations,
} from "@/lib/integrations/store";
import { resolveHermesMemoryConfig } from "@/lib/hermesMemoryConfig";
import { resolveHermesGatewayConfig } from "@/lib/hermesGatewayConfig";

const BROWSER_USE_TOOL_NAMES = [
  "browser.run",
  "browser.scrape",
  "browser.portal_check",
  "browser.form_submit",
] as const;
const BROWSER_USE_INTEGRATION_SLUG = "browser-use";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns a Hermes-compatible mcp_servers config block for this agent, built
 * from every active integration in the workspace vault whose auth_type = 'mcp'.
 * Hermes loads this block when it starts an agent; see
 * docs/hermes-integrations-runbook.md.
 */

type Context = {
  params: Promise<{ workspaceSlug: string; agentId: string }>;
};

type AgentConfigRow = {
  id: string;
  workspace_id: string;
  name: string;
  type: "copilot" | "channel" | "worker";
  knowledge_scope: Record<string, unknown> | null;
  channel_config: Record<string, unknown> | null;
};

type HermesMcpServerConfig = {
  url: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
  connect_timeout?: number;
  prompts?: boolean;
  resources?: boolean;
  sampling?: Record<string, unknown>;
  tools?: {
    include?: string[];
    exclude?: string[];
  };
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.length > 0);
}

function readCookieValue(headerValue: string | null, key: string): string | null {
  if (!headerValue) return null;
  const parts = headerValue.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (!part) continue;
    const eqIndex = part.indexOf("=");
    if (eqIndex <= 0) continue;
    const cookieName = part.slice(0, eqIndex).trim();
    if (cookieName !== key) continue;
    const cookieValue = part.slice(eqIndex + 1).trim();
    if (cookieValue.length > 0) return cookieValue;
  }
  return null;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function buildToolFilter(config: Record<string, unknown>): { include?: string[]; exclude?: string[] } | undefined {
  const toolsConfig = readObject(config.tools);
  const include = normalizeStringArray(
    toolsConfig?.include ?? config.includeTools ?? config.tools_include,
  );
  const exclude = normalizeStringArray(
    toolsConfig?.exclude ?? config.excludeTools ?? config.tools_exclude,
  );
  if (include.length === 0 && exclude.length === 0) return undefined;
  return {
    ...(include.length > 0 ? { include } : {}),
    ...(exclude.length > 0 ? { exclude } : {}),
  };
}

function buildMcpServerConfig(params: {
  url: string;
  headers?: Record<string, string>;
  config?: Record<string, unknown>;
  defaultTools?: { include?: string[]; exclude?: string[] };
  forceDisablePromptsAndResources?: boolean;
}): HermesMcpServerConfig {
  const cfg = params.config ?? {};
  const tools = buildToolFilter(cfg) ?? params.defaultTools;
  const server: HermesMcpServerConfig = {
    url: params.url,
    ...(params.headers && Object.keys(params.headers).length > 0 ? { headers: params.headers } : {}),
    ...(readBoolean(cfg.enabled) !== undefined ? { enabled: readBoolean(cfg.enabled) } : {}),
    ...(readNumber(cfg.timeout) !== undefined ? { timeout: readNumber(cfg.timeout) } : {}),
    ...(readNumber(cfg.connect_timeout ?? cfg.connectTimeout) !== undefined
      ? { connect_timeout: readNumber(cfg.connect_timeout ?? cfg.connectTimeout) }
      : {}),
    ...(readBoolean(cfg.prompts) !== undefined ? { prompts: readBoolean(cfg.prompts) } : {}),
    ...(readBoolean(cfg.resources) !== undefined ? { resources: readBoolean(cfg.resources) } : {}),
    ...(readObject(cfg.sampling) ? { sampling: readObject(cfg.sampling) } : {}),
    ...(tools ? { tools } : {}),
  };

  if (params.forceDisablePromptsAndResources) {
    server.prompts = false;
    server.resources = false;
  }

  return server;
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug, agentId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;

    const supabase = getSupabaseAdmin();
    if (!supabase) return Response.json({ error: "Supabase not configured." }, { status: 500 });

    const { data: agent } = await supabase
      .from("workspace_agents")
      .select("id, workspace_id, name, type, knowledge_scope, channel_config")
      .eq("id", agentId)
      .eq("workspace_id", auth.context.workspaceId)
      .maybeSingle();
    if (!agent) return Response.json({ error: "Agent not found." }, { status: 404 });

    const agentRow = agent as unknown as AgentConfigRow;
    const knowledgeScope = (agentRow.knowledge_scope ?? {}) as Record<string, unknown>;
    const legacyRole = typeof knowledgeScope.legacy_role === "string" ? knowledgeScope.legacy_role : null;
    const policy = resolveMcpToolPolicy({
      agentType: agentRow.type,
      legacyRole,
      knowledgeScope,
    });

    const integrations = await listIntegrations(auth.context.workspaceId);
    const mcpRows = integrations.filter((row) => row.authType === "mcp" && row.status === "active");

    const mcp_servers: Record<string, HermesMcpServerConfig> = {};

    const accessToken = readCookieValue(request.headers.get("cookie"), "prisma-access-token");
    const prismaMcpSession = issuePrismaMcpSessionToken({
      workspaceId: auth.context.workspaceId,
      workspaceSlug,
      agentId,
      rolePreset: policy.rolePreset,
      toolsInclude: policy.include,
      toolsExclude: policy.exclude,
      userId: auth.context.user.id,
    });
    const prismaHeaders: Record<string, string> = {
      Authorization: `Bearer ${prismaMcpSession.token}`,
    };
    if (accessToken) prismaHeaders["x-prisma-access-token"] = accessToken;
    mcp_servers.prisma_internal = buildMcpServerConfig({
      url: new URL("/api/mcp/prisma", request.url).toString(),
      headers: prismaHeaders,
      defaultTools: {
        ...(policy.include.length > 0 ? { include: policy.include } : {}),
        ...(policy.exclude.length > 0 ? { exclude: policy.exclude } : {}),
      },
      forceDisablePromptsAndResources: true,
    });

    for (const row of mcpRows) {
      const cfg = row.config ?? {};
      const url = typeof cfg.url === "string" ? cfg.url : null;
      if (!url) continue;
      const secrets = await getIntegrationSecrets(row.id);
      const headers: Record<string, string> = {};
      if (secrets.bearer) headers.Authorization = `Bearer ${secrets.bearer}`;
      if (secrets.apiKey && !headers.Authorization) headers.Authorization = `Bearer ${secrets.apiKey}`;
      if (typeof cfg.extraHeaders === "object" && cfg.extraHeaders) {
        for (const [k, v] of Object.entries(cfg.extraHeaders as Record<string, unknown>)) {
          if (typeof v === "string") headers[k] = v;
        }
      }
      mcp_servers[row.slug] = buildMcpServerConfig({
        url,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        config: cfg,
      });
    }

    const browserUseIntegration = await getIntegrationBySlug(
      auth.context.workspaceId,
      BROWSER_USE_INTEGRATION_SLUG,
    );
    const browserUseEnabled = Boolean(
      (browserUseIntegration && browserUseIntegration.status !== "paused") ||
        (process.env.BROWSER_USE_API_KEY?.trim() ?? ""),
    );
    if (browserUseEnabled) {
      const browserUseSession = issuePrismaMcpSessionToken({
        workspaceId: auth.context.workspaceId,
        workspaceSlug,
        agentId,
        rolePreset: policy.rolePreset,
        toolsInclude: [...BROWSER_USE_TOOL_NAMES],
        userId: auth.context.user.id,
      });
      mcp_servers.browser_use_internal = buildMcpServerConfig({
        url: new URL("/api/mcp/browser-use", request.url).toString(),
        headers: {
          Authorization: `Bearer ${browserUseSession.token}`,
        },
        config: (browserUseIntegration?.config as Record<string, unknown> | undefined) ?? {},
        defaultTools: { include: [...BROWSER_USE_TOOL_NAMES] },
        forceDisablePromptsAndResources: true,
      });
    }

    const [memory, gateway] = await Promise.all([
      resolveHermesMemoryConfig({
        workspaceId: auth.context.workspaceId,
        agentId,
      }),
      resolveHermesGatewayConfig({
        workspaceId: auth.context.workspaceId,
        agentId,
        channelConfig: agentRow.channel_config ?? null,
      }),
    ]);

    return Response.json({
      agentId: String(agentRow.id),
      agentName: String(agentRow.name),
      rolePreset: policy.rolePreset,
      prismaSessionExpiresAt: prismaMcpSession.expiresAt,
      mcp_servers,
      count: Object.keys(mcp_servers).length,
      memory,
      gateway,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
