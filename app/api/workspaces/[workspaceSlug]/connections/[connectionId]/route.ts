import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import {
  deleteConnection,
  getConnectionById,
  updateConnection,
} from "@/lib/connections/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; connectionId: string }>;
};

type PatchConnectionRequest = {
  label?: string;
  provider?: string;
  authType?: "api_key" | "bearer" | "oauth" | "mcp" | "hmac" | "webhook" | "none";
  status?: "active" | "paused" | "error";
  mode?: "http_poll" | "webhook_inbound" | "mcp_server" | "manual";
  baseUrl?: string | null;
  webhookPath?: string | null;
  webhookToken?: string | null;
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
};

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug, connectionId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    const connection = await getConnectionById(auth.context.workspaceId, connectionId);
    if (!connection) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ connection });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load connection." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, connectionId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (auth.context.role === "viewer") {
      return Response.json({ error: "Viewers cannot update connections." }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as PatchConnectionRequest;
    const connection = await updateConnection(auth.context.workspaceId, connectionId, body);
    if (!connection) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ connection });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update connection." },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, connectionId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (auth.context.role === "viewer") {
      return Response.json({ error: "Viewers cannot delete connections." }, { status: 403 });
    }
    await deleteConnection(auth.context.workspaceId, connectionId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete connection." },
      { status: 400 },
    );
  }
}
