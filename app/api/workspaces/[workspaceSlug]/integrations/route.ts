import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import { createIntegration, listIntegrations } from "@/lib/integrations/store";
import { getProviderAdapter, listProviderAdapters } from "@/lib/integrations/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ workspaceSlug: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    const integrations = await listIntegrations(auth.context.workspaceId);
    const providers = listProviderAdapters().map((p) => ({
      provider: p.provider,
      label: p.label,
      authType: p.authType,
      secretKeys: p.secretKeys,
      configKeys: p.configKeys,
    }));
    return Response.json({ integrations, providers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list integrations.";
    return Response.json({ error: message }, { status: 500 });
  }
}

type CreateBody = {
  provider?: string;
  label?: string;
  slug?: string;
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
};

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (auth.context.role === "viewer") {
      return Response.json({ error: "Viewers cannot create integrations." }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as CreateBody;
    const provider = (body.provider ?? "").trim();
    const label = (body.label ?? "").trim();
    if (!provider || !label) {
      return Response.json({ error: "`provider` and `label` are required." }, { status: 400 });
    }
    const adapter = getProviderAdapter(provider);
    if (!adapter) {
      return Response.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
    }
    const integration = await createIntegration({
      workspaceId: auth.context.workspaceId,
      label,
      slug: body.slug,
      provider,
      authType: adapter.authType,
      config: body.config ?? {},
      secrets: body.secrets ?? {},
      createdBy: auth.context.user.id,
    });
    return Response.json({ integration }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create integration.";
    return Response.json({ error: message }, { status: 400 });
  }
}
