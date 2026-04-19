import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import {
  createBinding,
  listBindings,
  type BindingDirection,
  type BindingMode,
} from "@/lib/integrations/bindings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getIntegrationById, getIntegrationBySlug } from "@/lib/integrations/store";
import { listWorkspaceObjects } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    const url = new URL(request.url);
    const objectId = url.searchParams.get("objectId") ?? undefined;
    const rows = await listBindings(auth.context.workspaceId, objectId ?? undefined);
    return Response.json({ bindings: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list bindings.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    const body = (await request.json().catch(() => ({}))) as {
      objectId?: string;
      objectSlug?: string;
      integrationId?: string;
      integrationSlug?: string;
      direction?: BindingDirection;
      mode?: BindingMode;
      cadence?: string | null;
      mapping?: Record<string, unknown>;
      matchKey?: string | null;
      label?: string;
      recipeId?: string | null;
    };
    if (!body.direction || !["pull", "push", "two_way"].includes(body.direction)) {
      return Response.json({ error: "direction must be pull|push|two_way." }, { status: 400 });
    }
    if (!body.mode || !["manual", "on_demand", "scheduled"].includes(body.mode)) {
      return Response.json({ error: "mode must be manual|on_demand|scheduled." }, { status: 400 });
    }
    if (!body.mapping || typeof body.mapping !== "object" || Object.keys(body.mapping).length === 0) {
      return Response.json({ error: "mapping is required." }, { status: 400 });
    }

    const objects = await listWorkspaceObjects(auth.context.workspaceId);
    const target =
      (body.objectId && objects.find((o) => o.id === body.objectId)) ||
      (body.objectSlug && objects.find((o) => o.slug === body.objectSlug)) ||
      null;
    if (!target) return Response.json({ error: "Object not found." }, { status: 404 });

    let integration = null;
    if (body.integrationId) {
      integration = await getIntegrationById(auth.context.workspaceId, body.integrationId);
    } else if (body.integrationSlug) {
      integration = await getIntegrationBySlug(auth.context.workspaceId, body.integrationSlug);
    }
    if (!integration) return Response.json({ error: "Integration not found." }, { status: 404 });

    const binding = await createBinding({
      workspaceId: auth.context.workspaceId,
      objectId: target.id,
      integrationId: integration.id,
      recipeId: body.recipeId ?? null,
      label:
        typeof body.label === "string" && body.label.trim()
          ? body.label.trim()
          : `${target.name} ← ${integration.label}`,
      direction: body.direction,
      mode: body.mode,
      cadence: body.cadence ?? null,
      mapping: body.mapping,
      matchKey: body.matchKey ?? null,
      createdBy: auth.context.user.id,
    });
    return Response.json({ binding }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create binding.";
    return Response.json({ error: message }, { status: 400 });
  }
}
