/**
 * Internal MCP server that wraps Browser-Use Cloud (managed) as a narrow
 * JSON-RPC tool surface. Mirrors the shape of `/api/mcp/prisma` so Hermes can
 * consume it through the same `mcp_servers` config block emitted by
 * `/api/workspaces/[workspaceSlug]/agents/[agentId]/mcp-config`.
 *
 * Auth: short-lived JWT minted by Phase 1 `issuePrismaMcpSessionToken`. The
 * token carries `workspaceId`/`agentId` which we use to look up per-workspace
 * browser-use secrets in the integrations vault (slug = `browser-use`). If no
 * vault row exists, we fall back to the global `BROWSER_USE_API_KEY` env.
 *
 * No `browser-use-sdk` npm dependency is used; we call the REST API directly.
 */
import { verifyPrismaMcpSessionToken } from "@/lib/agentMcpSession";
import {
  getIntegrationBySlug,
  getIntegrationSecrets,
  logOutboundEvent,
} from "@/lib/integrations/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

const JSON_RPC_VERSION = "2.0";
const DEFAULT_BROWSER_USE_BASE_URL = "https://api.browser-use.com";
const BROWSER_USE_INTEGRATION_SLUG = "browser-use";

type BrowserUseToolName =
  | "browser.run"
  | "browser.scrape"
  | "browser.portal_check"
  | "browser.form_submit";

type BrowserUseToolDefinition = {
  name: BrowserUseToolName;
  description: string;
  inputSchema: Record<string, unknown>;
};

const BROWSER_USE_TOOLS: BrowserUseToolDefinition[] = [
  {
    name: "browser.run",
    description:
      "Execute a free-form browsing task with Browser-Use Cloud. Accepts a natural-language `task` and optional `profile_id` / `max_steps`.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Natural-language task the agent must perform." },
        profile_id: {
          type: "string",
          description: "Optional browser-use profile id (persistent login/cookies).",
        },
        max_steps: {
          type: "number",
          description: "Hard cap on agent steps (defaults to browser-use server default).",
        },
      },
      required: ["task"],
      additionalProperties: true,
    },
  },
  {
    name: "browser.scrape",
    description:
      "Scrape a URL with Browser-Use Cloud. Pass a JSON `schema` to request structured extraction.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute URL to scrape." },
        schema: {
          type: "object",
          description: "Optional JSON-schema-ish shape the browser agent should return.",
        },
        profile_id: { type: "string", description: "Optional browser-use profile id." },
      },
      required: ["url"],
      additionalProperties: true,
    },
  },
  {
    name: "browser.portal_check",
    description:
      "Run a recurring portal-check task (e.g. BBC daily audit). Use `slug` to identify the portal profile (login is assumed to live in the browser-use profile).",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Portal identifier, e.g. `bbc`, `gb-automotriz`." },
        task: { type: "string", description: "What to check / collect in the portal." },
        profile_id: { type: "string", description: "Optional browser-use profile id." },
      },
      required: ["slug", "task"],
      additionalProperties: true,
    },
  },
  {
    name: "browser.form_submit",
    description:
      "Navigate to `url` and submit a web form using the provided `fields` map. Honors the browser-use profile for auth.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute URL of the form page." },
        fields: {
          type: "object",
          description:
            "Map of label/name → value pairs. The browser agent best-effort matches them to visible form controls.",
        },
        profile_id: { type: "string", description: "Optional browser-use profile id." },
      },
      required: ["url", "fields"],
      additionalProperties: true,
    },
  },
];

function jsonRpcResult(id: JsonRpcId, result: unknown, status = 200) {
  return Response.json(
    {
      jsonrpc: JSON_RPC_VERSION,
      id,
      result,
    },
    { status },
  );
}

function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
  status = 200,
) {
  return Response.json(
    {
      jsonrpc: JSON_RPC_VERSION,
      id,
      error: {
        code,
        message,
        ...(data !== undefined ? { data } : {}),
      },
    },
    { status },
  );
}

function parseBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return match[1]?.trim() ?? null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.length > 0);
}

function getAllowedTools(claims: ReturnType<typeof verifyPrismaMcpSessionToken>) {
  const include = new Set(normalizeStringArray(claims?.toolsInclude));
  const exclude = new Set(normalizeStringArray(claims?.toolsExclude));
  const filtered = BROWSER_USE_TOOLS.filter((tool) => {
    if (include.size > 0 && !include.has(tool.name)) return false;
    if (exclude.has(tool.name)) return false;
    return true;
  });
  return {
    filtered,
    allowedNames: new Set(filtered.map((tool) => tool.name)),
  };
}

type ResolvedCredentials = {
  apiKey: string;
  baseUrl: string;
  integrationId: string | null;
  vaultProfileId: string | null;
  vaultProxy: Record<string, unknown> | null;
};

async function resolveCredentials(workspaceId: string): Promise<ResolvedCredentials | null> {
  const baseUrl =
    (process.env.BROWSER_USE_API_BASE_URL?.trim() || DEFAULT_BROWSER_USE_BASE_URL).replace(/\/+$/, "");

  let vaultApiKey: string | null = null;
  let integrationId: string | null = null;
  let vaultProfileId: string | null = null;
  let vaultProxy: Record<string, unknown> | null = null;

  try {
    const integration = await getIntegrationBySlug(workspaceId, BROWSER_USE_INTEGRATION_SLUG);
    if (integration) {
      integrationId = integration.id;
      const cfg = integration.config ?? {};
      vaultProfileId =
        typeof cfg.profile_id === "string" && cfg.profile_id.trim().length > 0
          ? cfg.profile_id.trim()
          : null;
      vaultProxy =
        cfg.proxy && typeof cfg.proxy === "object" && !Array.isArray(cfg.proxy)
          ? (cfg.proxy as Record<string, unknown>)
          : null;
      const secrets = await getIntegrationSecrets(integration.id);
      vaultApiKey =
        (typeof secrets.api_key === "string" && secrets.api_key.trim()) ||
        (typeof secrets.apiKey === "string" && secrets.apiKey.trim()) ||
        null;
    }
  } catch (error) {
    console.error("mcp/browser-use vault lookup failed", error);
  }

  const envApiKey = process.env.BROWSER_USE_API_KEY?.trim() || null;
  const apiKey = vaultApiKey || envApiKey;
  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl,
    integrationId,
    vaultProfileId,
    vaultProxy,
  };
}

type BrowserUseCallResult = {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
  runId?: string | null;
};

async function callBrowserUse(params: {
  creds: ResolvedCredentials;
  path: string;
  body: unknown;
}): Promise<BrowserUseCallResult> {
  const url = `${params.creds.baseUrl}${params.path}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.creds.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(params.body),
    });
    const text = await response.text();
    let parsed: unknown = text;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    const runId = extractRunId(parsed);
    if (!response.ok) {
      const message =
        (typeof parsed === "object" && parsed && "detail" in parsed && typeof (parsed as Record<string, unknown>).detail === "string"
          ? String((parsed as Record<string, unknown>).detail)
          : null) ?? `Browser-Use returned HTTP ${response.status}`;
      return { ok: false, status: response.status, error: message, runId, data: parsed };
    }
    return { ok: true, status: response.status, data: parsed, runId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return { ok: false, status: 502, error: message };
  }
}

function extractRunId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const candidates = [record.id, record.task_id, record.run_id, record.taskId, record.runId];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

function coerceStringArg(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function coerceObjectArg(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function coerceNumberArg(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(1, Math.floor(value));
}

type ToolArgs = Record<string, unknown>;

async function executeBrowserUseTool(params: {
  name: BrowserUseToolName;
  args: ToolArgs;
  creds: ResolvedCredentials;
  workspaceId: string;
}): Promise<BrowserUseCallResult> {
  const { name, args, creds } = params;
  const profileId = coerceStringArg(args.profile_id) ?? creds.vaultProfileId ?? undefined;

  const basePayload: Record<string, unknown> = {};
  if (profileId) basePayload.browser_profile_id = profileId;
  if (creds.vaultProxy) basePayload.proxy = creds.vaultProxy;

  switch (name) {
    case "browser.run": {
      const task = coerceStringArg(args.task);
      if (!task) return { ok: false, status: 400, error: "`task` is required for browser.run." };
      const maxSteps = coerceNumberArg(args.max_steps);
      return callBrowserUse({
        creds,
        path: "/api/v1/run-task",
        body: {
          ...basePayload,
          task,
          ...(maxSteps ? { max_steps: maxSteps } : {}),
        },
      });
    }
    case "browser.scrape": {
      const url = coerceStringArg(args.url);
      if (!url) return { ok: false, status: 400, error: "`url` is required for browser.scrape." };
      const schema = coerceObjectArg(args.schema);
      const schemaHint = schema ? ` Return JSON matching this schema: ${JSON.stringify(schema)}.` : "";
      return callBrowserUse({
        creds,
        path: "/api/v1/run-task",
        body: {
          ...basePayload,
          task: `Visit ${url} and extract its content.${schemaHint}`,
          save_browser_data: false,
          structured_output_json: schema ? JSON.stringify(schema) : undefined,
        },
      });
    }
    case "browser.portal_check": {
      const slug = coerceStringArg(args.slug);
      const task = coerceStringArg(args.task);
      if (!slug || !task) {
        return { ok: false, status: 400, error: "`slug` and `task` are required for browser.portal_check." };
      }
      return callBrowserUse({
        creds,
        path: "/api/v1/run-task",
        body: {
          ...basePayload,
          task: `Portal audit (${slug}): ${task}`,
        },
      });
    }
    case "browser.form_submit": {
      const url = coerceStringArg(args.url);
      const fields = coerceObjectArg(args.fields);
      if (!url || !fields) {
        return { ok: false, status: 400, error: "`url` and `fields` are required for browser.form_submit." };
      }
      return callBrowserUse({
        creds,
        path: "/api/v1/run-task",
        body: {
          ...basePayload,
          task: `Open ${url}, fill the form with the following values, then submit it: ${JSON.stringify(fields)}.`,
        },
      });
    }
    default: {
      return { ok: false, status: 400, error: `Unsupported browser tool: ${name}` };
    }
  }
}

export async function POST(request: Request) {
  const bearer = parseBearerToken(request);
  if (!bearer) {
    return jsonRpcError(null, -32001, "Missing MCP bearer token.", undefined, 401);
  }

  let claims: ReturnType<typeof verifyPrismaMcpSessionToken> = null;
  try {
    claims = verifyPrismaMcpSessionToken(bearer);
  } catch (error) {
    console.error("mcp/browser-use token verify failed", error);
    claims = null;
  }
  if (!claims) {
    return jsonRpcError(null, -32001, "Invalid or expired MCP bearer token.", undefined, 401);
  }

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "Invalid JSON payload.");
  }

  const method = typeof body.method === "string" ? body.method : "";
  const id = body.id ?? null;
  const params =
    body.params && typeof body.params === "object" && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : {};
  const { filtered: tools, allowedNames } = getAllowedTools(claims);

  if (method === "initialize") {
    return jsonRpcResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: "browser-use-mcp",
        version: "0.1.0",
      },
    });
  }

  if (method === "notifications/initialized") {
    return new Response(null, { status: 204 });
  }

  if (method === "ping") {
    return jsonRpcResult(id, { ok: true, now: new Date().toISOString() });
  }

  if (method === "tools/list") {
    return jsonRpcResult(id, {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    });
  }

  if (method === "tools/call") {
    const name = typeof params.name === "string" ? (params.name.trim() as BrowserUseToolName) : ("" as BrowserUseToolName);
    const args = (params.arguments as ToolArgs | undefined) ?? {};
    if (!name) {
      return jsonRpcError(id, -32602, "`tools/call` requires a tool name.");
    }
    if (!allowedNames.has(name)) {
      return jsonRpcError(id, -32004, `Tool is not enabled for this MCP session: ${name}`);
    }

    const creds = await resolveCredentials(claims.workspaceId);
    if (!creds) {
      return jsonRpcResult(id, {
        content: [
          {
            type: "text",
            text: "Browser-Use is not configured for this workspace. Add an integration with slug `browser-use` and `api_key` secret, or set BROWSER_USE_API_KEY.",
          },
        ],
        isError: true,
        structuredContent: {
          ok: false,
          status: 412,
          error: "browser_use_not_configured",
        },
      });
    }

    const result = await executeBrowserUseTool({
      name,
      args,
      creds,
      workspaceId: claims.workspaceId,
    });

    try {
      await logOutboundEvent({
        workspaceId: claims.workspaceId,
        integrationId: creds.integrationId,
        kind: `browser_use.${name}`,
        targetUrl: `${creds.baseUrl}/api/v1/run-task`,
        requestBody: redactArgs(name, args),
        responseStatus: result.status ?? null,
        responseBody: result.ok ? truncatePayload(result.data) : result.error ?? null,
        ok: result.ok,
        error: result.ok ? null : result.error ?? null,
        createdBy: claims.userId ?? null,
      });
    } catch (error) {
      console.error("mcp/browser-use logOutboundEvent failed", error);
    }

    if (!result.ok) {
      return jsonRpcResult(id, {
        content: [
          {
            type: "text",
            text: result.error ?? "Browser-Use call failed.",
          },
        ],
        isError: true,
        structuredContent: {
          ok: false,
          status: result.status,
          error: result.error ?? "browser_use_error",
          ...(result.runId ? { runId: result.runId } : {}),
        },
      });
    }

    return jsonRpcResult(id, {
      content: [
        {
          type: "text",
          text: JSON.stringify(result.data),
        },
      ],
      structuredContent: {
        ok: true,
        data: result.data,
        ...(result.runId ? { runId: result.runId } : {}),
      },
      isError: false,
    });
  }

  return jsonRpcError(id, -32601, `Method not found: ${method || "<empty>"}`);
}

function redactArgs(name: BrowserUseToolName, args: ToolArgs): Record<string, unknown> {
  const copy: Record<string, unknown> = { tool: name };
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string" && v.length > 512) {
      copy[k] = `${v.slice(0, 512)}…`;
    } else {
      copy[k] = v;
    }
  }
  return copy;
}

function truncatePayload(payload: unknown): unknown {
  if (typeof payload === "string") {
    return payload.length > 2000 ? `${payload.slice(0, 2000)}…` : payload;
  }
  if (!payload || typeof payload !== "object") return payload;
  try {
    const serialized = JSON.stringify(payload);
    if (serialized.length <= 4000) return payload;
    return { truncated: true, preview: `${serialized.slice(0, 4000)}…` };
  } catch {
    return { truncated: true };
  }
}
