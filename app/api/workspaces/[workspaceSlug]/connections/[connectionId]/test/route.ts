import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import { getConnectionById, getConnectionSecrets } from "@/lib/connections/store";
import { logOutboundEvent } from "@/lib/integrations/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; connectionId: string }>;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildTestUrl(rawUrl: string, config: Record<string, unknown>) {
  const path = typeof config.testPath === "string" && config.testPath.trim().length > 0
    ? config.testPath.trim()
    : typeof config.path === "string"
      ? config.path
      : "";
  const url = path
    ? new URL(path.replace(/^\/+/, ""), rawUrl.endsWith("/") ? rawUrl : `${rawUrl}/`)
    : new URL(rawUrl);
  const query = asObject(config.testQuery ?? config.query);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function applyAuth(params: {
  authType: string;
  config: Record<string, unknown>;
  secrets: Record<string, string>;
  url: URL;
  headers: Headers;
}) {
  const authLocation = typeof params.config.authLocation === "string" ? params.config.authLocation : "header";
  const authHeader = typeof params.config.authHeader === "string" && params.config.authHeader
    ? params.config.authHeader
    : params.authType === "api_key"
      ? "x-api-key"
      : "Authorization";
  const authQueryParam = typeof params.config.authQueryParam === "string" && params.config.authQueryParam
    ? params.config.authQueryParam
    : "api_key";
  const authScheme = typeof params.config.authScheme === "string" && params.config.authScheme
    ? params.config.authScheme
    : "Bearer";
  const secretValue =
    params.secrets.apiKey ??
    params.secrets.api_key ??
    params.secrets.bearer ??
    params.secrets.token ??
    params.secrets.secret ??
    null;
  if (!secretValue) return;
  if (authLocation === "query") {
    params.url.searchParams.set(authQueryParam, secretValue);
    return;
  }
  if (params.authType === "api_key") {
    params.headers.set(authHeader, secretValue);
    return;
  }
  if (params.authType === "none" || params.authType === "webhook") return;
  params.headers.set(authHeader, `${authScheme} ${secretValue}`.trim());
}

export async function POST(_request: Request, context: Context) {
  try {
    const { workspaceSlug, connectionId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;

    const connection = await getConnectionById(auth.context.workspaceId, connectionId);
    if (!connection) return Response.json({ error: "Not found." }, { status: 404 });

    const config = asObject(connection.config);
    const rawUrl =
      typeof config.url === "string" && config.url.trim().length > 0
        ? config.url
        : typeof connection.baseUrl === "string" && connection.baseUrl.trim().length > 0
          ? connection.baseUrl
          : "";
    if (!rawUrl) {
      return Response.json({ error: "Connection is missing a URL/baseUrl." }, { status: 400 });
    }
    const method =
      typeof config.testMethod === "string" && config.testMethod.trim().length > 0
        ? config.testMethod.trim().toUpperCase()
        : connection.mode === "mcp_server"
          ? "GET"
          : typeof config.method === "string" && config.method.trim().length > 0
            ? config.method.trim().toUpperCase()
            : "GET";
    const url = buildTestUrl(rawUrl, config);
    const headers = new Headers();
    for (const [key, value] of Object.entries(asObject(config.headers))) {
      if (typeof value === "string" && value) headers.set(key, value);
    }
    const secrets = await getConnectionSecrets(connection.id);
    applyAuth({
      authType: connection.authType,
      config,
      secrets,
      url,
      headers,
    });

    let status = 0;
    let ok = false;
    let preview: string | null = null;
    let errorMessage: string | null = null;
    const started = Date.now();

    try {
      const response = await fetch(url.toString(), { method, headers });
      status = response.status;
      ok = response.ok;
      const text = await response.text().catch(() => "");
      preview = text ? text.slice(0, 500) : null;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Network error";
    }

    await logOutboundEvent({
      workspaceId: auth.context.workspaceId,
      kind: "connections.test",
      targetUrl: url.toString(),
      responseStatus: status,
      responseBody: preview ? { preview } : null,
      ok,
      error: errorMessage,
      createdBy: auth.context.user.id,
    });

    return Response.json({
      ok,
      status,
      elapsedMs: Date.now() - started,
      preview,
      error: errorMessage,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Connection test failed." },
      { status: 400 },
    );
  }
}
