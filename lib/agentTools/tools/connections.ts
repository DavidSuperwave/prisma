import { registerTool, type ToolContext } from "../registry";
import {
  createConnection,
  getConnectionBySlug,
  listConnections,
  updateConnection,
} from "@/lib/connections/store";
import { runConnectionSync } from "@/lib/connections/runtime";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ConnectionMode = "http_poll" | "webhook_inbound" | "mcp_server" | "manual";
type AuthType = "api_key" | "bearer" | "oauth" | "mcp" | "hmac" | "webhook" | "none";

async function resolveWorkspaceId(ctx: ToolContext): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("subdomain", ctx.workspaceSlug)
    .maybeSingle();
  return data ? String(data.id) : null;
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "connection";
}

function isValidCronExpression(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const fieldRe = /^(\*|\*\/\d+|\d+(-\d+)?(\/\d+)?|\d+(,\d+)+)$/;
  return parts.every((part) => fieldRe.test(part));
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildWebhookToken() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function upsertConnectionWorkflow(params: {
  workspaceId: string;
  connectionId: string;
  connectionSlug: string;
  connectionLabel: string;
  cron: string;
  existingWorkflowId?: string | null;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase admin unavailable.");
  const workflowPatch = {
    name: `Connection sync · ${params.connectionLabel}`,
    description: `Scheduled sync for connection ${params.connectionSlug}.`,
    enabled: true,
    trigger: {
      type: "cron",
      schedule: params.cron,
    },
    steps: [
      {
        type: "run_connection_sync",
        connectionId: params.connectionId,
        saveAs: params.connectionSlug,
      },
    ],
  };
  if (params.existingWorkflowId) {
    const { data, error } = await supabase
      .from("workspace_workflows")
      .update(workflowPatch)
      .eq("workspace_id", params.workspaceId)
      .eq("id", params.existingWorkflowId)
      .select("id, trigger")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) {
      return { id: String(data.id), trigger: (data as { trigger?: unknown }).trigger ?? null };
    }
  }
  const { data, error } = await supabase
    .from("workspace_workflows")
    .insert({
      workspace_id: params.workspaceId,
      ...workflowPatch,
    })
    .select("id, trigger")
    .single();
  if (error) throw new Error(error.message);
  return { id: String(data.id), trigger: (data as { trigger?: unknown }).trigger ?? null };
}

registerTool({
  name: "connections.list",
  description: "List configured workspace connections, including polling, webhook, and MCP connection metadata.",
  args: {},
  handler: async (_args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const rows = await listConnections(workspaceId);
    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        label: row.label,
        provider: row.provider,
        authType: row.authType,
        status: row.status,
        mode: row.mode,
        baseUrl: row.baseUrl,
        webhookPath: row.webhookPath,
        hasSecrets: row.hasSecrets,
        config: row.config,
      })),
    };
  },
});

registerTool({
  name: "connections.sync_now",
  description:
    "Run a configured HTTP-poll connection immediately and upsert its mapped rows into the target workspace object.",
  args: {
    connectionId: { type: "string" },
    connectionSlug: { type: "string" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const connectionId = typeof args.connectionId === "string" ? args.connectionId.trim() : "";
    const connectionSlug = typeof args.connectionSlug === "string" ? args.connectionSlug.trim() : "";
    if (!connectionId && !connectionSlug) {
      return { ok: false, error: "connectionId or connectionSlug is required.", status: 400 };
    }
    try {
      const report = await runConnectionSync({
        workspaceId,
        ...(connectionId ? { connectionId } : { connectionSlug }),
      });
      return { ok: true, data: report };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Connection sync failed.",
        status: 400,
      };
    }
  },
});

registerTool({
  name: "connections.assist",
  description:
    "Create or update a workspace connection for API polling or inbound webhooks. Stores credentials securely, saves field mappings, and can optionally schedule recurring syncs.",
  args: {
    label: { type: "string", required: true },
    slug: { type: "string" },
    provider: { type: "string" },
    mode: { type: "string", description: "http_poll | webhook_inbound | mcp_server | manual" },
    authType: { type: "string", description: "api_key | bearer | oauth | mcp | hmac | webhook | none" },
    baseUrl: { type: "string" },
    objectSlug: { type: "string" },
    objectId: { type: "string" },
    method: { type: "string" },
    path: { type: "string" },
    cron: { type: "string" },
    matchKey: { type: "string" },
    collectionPath: { type: "string" },
    webhookPath: { type: "string" },
    webhookToken: { type: "string" },
    mapping: { type: "object" },
    query: { type: "object" },
    headers: { type: "object" },
    secrets: { type: "object" },
    includeRaw: { type: "boolean" },
    runNow: { type: "boolean" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };

    const label = String(args.label ?? "").trim();
    const slug = slugify(String(args.slug ?? label));
    const mode = String(args.mode ?? "http_poll").trim() as ConnectionMode;
    const authType = String(args.authType ?? "api_key").trim() as AuthType;
    const allowedModes = new Set<ConnectionMode>(["http_poll", "webhook_inbound", "mcp_server", "manual"]);
    const allowedAuthTypes = new Set<AuthType>(["api_key", "bearer", "oauth", "mcp", "hmac", "webhook", "none"]);
    if (!allowedModes.has(mode)) {
      return { ok: false, error: "mode must be http_poll|webhook_inbound|mcp_server|manual.", status: 400 };
    }
    if (!allowedAuthTypes.has(authType)) {
      return { ok: false, error: "authType is invalid.", status: 400 };
    }

    const mapping = asObject(args.mapping);
    const hasTargetObject = typeof args.objectSlug === "string" || typeof args.objectId === "string";
    if ((mode === "http_poll" || mode === "webhook_inbound") && (!hasTargetObject || Object.keys(mapping).length === 0)) {
      return {
        ok: false,
        error: "objectSlug/objectId and mapping are required for poll or webhook connections.",
        status: 400,
      };
    }

    const cron = typeof args.cron === "string" ? args.cron.trim() : "";
    if (cron && !isValidCronExpression(cron)) {
      return { ok: false, error: "cron must be a valid 5-field expression.", status: 400 };
    }
    if (mode === "http_poll" && !String(args.baseUrl ?? "").trim()) {
      return { ok: false, error: "baseUrl is required for http_poll connections.", status: 400 };
    }

    const existing = await getConnectionBySlug(workspaceId, slug);
    const existingConfig = asObject(existing?.config);
    const config: Record<string, unknown> = {
      ...existingConfig,
      ...(typeof args.objectSlug === "string" && args.objectSlug.trim() ? { objectSlug: args.objectSlug.trim() } : {}),
      ...(typeof args.objectId === "string" && args.objectId.trim() ? { objectId: args.objectId.trim() } : {}),
      ...(Object.keys(mapping).length > 0 ? { mapping } : {}),
      ...(typeof args.method === "string" && args.method.trim() ? { method: args.method.trim().toUpperCase() } : {}),
      ...(typeof args.path === "string" && args.path.trim() ? { path: args.path.trim() } : {}),
      ...(typeof args.matchKey === "string" && args.matchKey.trim() ? { matchKey: args.matchKey.trim() } : {}),
      ...(typeof args.collectionPath === "string" && args.collectionPath.trim()
        ? { collectionPath: args.collectionPath.trim() }
        : {}),
      ...(args.query && typeof args.query === "object" && !Array.isArray(args.query) ? { query: args.query } : {}),
      ...(args.headers && typeof args.headers === "object" && !Array.isArray(args.headers) ? { headers: args.headers } : {}),
      ...(typeof args.includeRaw === "boolean" ? { includeRaw: args.includeRaw } : {}),
    };

    const webhookPath =
      mode === "webhook_inbound"
        ? String(args.webhookPath ?? existing?.webhookPath ?? slug).trim() || slug
        : null;
    const webhookToken =
      mode === "webhook_inbound"
        ? String(args.webhookToken ?? existing?.webhookToken ?? buildWebhookToken()).trim()
        : null;

    const secrets =
      args.secrets && typeof args.secrets === "object" && !Array.isArray(args.secrets)
        ? Object.fromEntries(
            Object.entries(args.secrets).filter(
              ([key, value]) => key.trim().length > 0 && typeof value === "string" && value.trim().length > 0,
            ),
          )
        : {};

    let connection =
      existing
        ? await updateConnection(workspaceId, existing.id, {
            label,
            provider: typeof args.provider === "string" && args.provider.trim() ? args.provider.trim() : existing.provider,
            authType,
            mode,
            baseUrl: typeof args.baseUrl === "string" ? args.baseUrl.trim() || null : existing.baseUrl,
            webhookPath,
            webhookToken,
            config,
            secrets,
          })
        : await createConnection({
            workspaceId,
            slug,
            label,
            provider: typeof args.provider === "string" && args.provider.trim() ? args.provider.trim() : "custom",
            authType,
            mode,
            baseUrl: typeof args.baseUrl === "string" ? args.baseUrl.trim() || null : null,
            webhookPath,
            webhookToken,
            config,
            secrets,
            createdBy: null,
          });
    if (!connection) {
      return { ok: false, error: "Failed to save connection.", status: 500 };
    }

    let workflow: { id: string; trigger: unknown } | null = null;
    if (mode === "http_poll" && cron) {
      workflow = await upsertConnectionWorkflow({
        workspaceId,
        connectionId: connection.id,
        connectionSlug: connection.slug,
        connectionLabel: connection.label,
        cron,
        existingWorkflowId:
          typeof (connection.config as Record<string, unknown>).workflowId === "string"
            ? String((connection.config as Record<string, unknown>).workflowId)
            : null,
      });
      connection = await updateConnection(workspaceId, connection.id, {
        config: {
          ...(connection.config as Record<string, unknown>),
          workflowId: workflow.id,
        },
      });
      if (!connection) {
        return { ok: false, error: "Failed to persist workflow reference on connection.", status: 500 };
      }
    }

    let runReport: unknown = null;
    if (args.runNow === true && mode === "http_poll") {
      runReport = await runConnectionSync({
        workspaceId,
        connectionId: connection.id,
      });
    }

    const webhookUrl =
      mode === "webhook_inbound"
        ? `${ctx.origin.replace(/\/$/, "")}/api/workspaces/${encodeURIComponent(ctx.workspaceSlug)}/webhooks/${encodeURIComponent(connection.webhookPath ?? connection.slug)}`
        : null;

    return {
      ok: true,
      data: {
        connection,
        workflow,
        webhookUrl,
        webhookToken: webhookToken || null,
        runReport,
      },
    };
  },
});
