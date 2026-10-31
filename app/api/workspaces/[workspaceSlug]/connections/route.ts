import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import {
  createConnection,
  listConnections,
} from "@/lib/connections/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type CreateConnectionRequest = {
  slug?: string;
  label?: string;
  provider?: string;
  authType?: "api_key" | "bearer" | "oauth" | "mcp" | "hmac" | "webhook" | "none";
  mode?: "http_poll" | "webhook_inbound" | "mcp_server" | "manual";
  baseUrl?: string | null;
  webhookPath?: string | null;
  webhookToken?: string | null;
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
};

export async function GET(_request: Request, context: Context) {
  const { workspaceSlug } = await context.params;
  const auth = await authorizeWorkspaceMember(workspaceSlug);
  if ("error" in auth) return auth.error;
  try {
    const connections = await listConnections(auth.context.workspaceId);
    return Response.json({ connections });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to list connections." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request, context: Context) {
  const { workspaceSlug } = await context.params;
  const auth = await authorizeWorkspaceMember(workspaceSlug);
  if ("error" in auth) return auth.error;
  if (auth.context.role === "viewer") {
    return Response.json({ error: "Viewers cannot create connections." }, { status: 403 });
  }
  try {
    const payload = (await request.json().catch(() => ({}))) as CreateConnectionRequest;
    const label = typeof payload.label === "string" ? payload.label.trim() : "";
    if (!label) {
      return Response.json({ error: "label is required." }, { status: 400 });
    }
    const connection = await createConnection({
      workspaceId: auth.context.workspaceId,
      slug: payload.slug,
      label,
      provider: typeof payload.provider === "string" ? payload.provider : "custom",
      authType: payload.authType,
      mode: payload.mode,
      baseUrl: payload.baseUrl ?? null,
      webhookPath: payload.webhookPath ?? null,
      webhookToken: payload.webhookToken ?? null,
      config:
        payload.config && typeof payload.config === "object" && !Array.isArray(payload.config)
          ? payload.config
          : {},
      secrets:
        payload.secrets && typeof payload.secrets === "object" && !Array.isArray(payload.secrets)
          ? payload.secrets
          : {},
      createdBy: auth.context.user.id,
    });
    return Response.json({ connection }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to create connection." },
      { status: 400 },
    );
  }
}
