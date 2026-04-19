import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import {
  deleteIntegration,
  getIntegrationById,
  updateIntegration,
} from "@/lib/integrations/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; integrationId: string }>;
};

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug, integrationId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    const integration = await getIntegrationById(auth.context.workspaceId, integrationId);
    if (!integration) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ integration });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}

type PatchBody = {
  label?: string;
  status?: "active" | "paused" | "error";
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
};

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, integrationId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (auth.context.role === "viewer") {
      return Response.json({ error: "Viewers cannot update integrations." }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as PatchBody;
    const integration = await updateIntegration(auth.context.workspaceId, integrationId, body);
    if (!integration) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ integration });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, integrationId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (auth.context.role === "viewer") {
      return Response.json({ error: "Viewers cannot delete integrations." }, { status: 403 });
    }
    await deleteIntegration(auth.context.workspaceId, integrationId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
