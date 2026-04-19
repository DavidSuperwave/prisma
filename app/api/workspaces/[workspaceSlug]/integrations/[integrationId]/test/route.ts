import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import { getIntegrationById, getIntegrationSecrets, logOutboundEvent } from "@/lib/integrations/store";
import { getProviderAdapter } from "@/lib/integrations/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; integrationId: string }>;
};

export async function POST(_request: Request, context: Context) {
  try {
    const { workspaceSlug, integrationId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    const integration = await getIntegrationById(auth.context.workspaceId, integrationId);
    if (!integration) return Response.json({ error: "Not found." }, { status: 404 });
    const adapter = getProviderAdapter(integration.provider);
    if (!adapter || !adapter.testRequest) {
      return Response.json({ error: "Provider does not support smoke tests." }, { status: 400 });
    }
    const secrets = await getIntegrationSecrets(integration.id);
    const req = adapter.testRequest({ secrets, config: integration.config });
    const started = Date.now();
    let status = 0;
    let ok = false;
    let bodySnippet: string | null = null;
    let errorMessage: string | null = null;
    try {
      const resp = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
      status = resp.status;
      ok = resp.ok;
      try {
        const text = await resp.text();
        bodySnippet = text.slice(0, 500);
      } catch {
        bodySnippet = null;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Network error";
    }
    await logOutboundEvent({
      workspaceId: auth.context.workspaceId,
      integrationId: integration.id,
      kind: "integration.test",
      targetUrl: req.url,
      requestBody: null,
      responseStatus: status,
      responseBody: bodySnippet ? { preview: bodySnippet } : null,
      ok,
      error: errorMessage,
      createdBy: auth.context.user.id,
    });
    return Response.json({
      ok,
      status,
      elapsedMs: Date.now() - started,
      preview: bodySnippet,
      error: errorMessage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Test failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
