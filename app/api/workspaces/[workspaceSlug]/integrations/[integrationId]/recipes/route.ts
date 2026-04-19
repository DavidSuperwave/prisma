import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import { getIntegrationById } from "@/lib/integrations/store";
import { deleteRecipe, listRecipes } from "@/lib/integrations/recipes";

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
    if (!integration) return Response.json({ error: "Integration not found." }, { status: 404 });
    const recipes = await listRecipes(auth.context.workspaceId, integration.id);
    return Response.json({
      recipes: recipes.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        method: r.method,
        pathTemplate: r.pathTemplate,
        successCount: r.successCount,
        lastUsedAt: r.lastUsedAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list recipes.";
    return Response.json({ error: message }, { status: 500 });
  }
}

type DeleteBody = { recipeId?: string };

export async function DELETE(request: Request, context: Context) {
  try {
    const { workspaceSlug, integrationId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    if (auth.context.role === "viewer") {
      return Response.json({ error: "Viewers cannot delete recipes." }, { status: 403 });
    }
    const integration = await getIntegrationById(auth.context.workspaceId, integrationId);
    if (!integration) return Response.json({ error: "Integration not found." }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as DeleteBody;
    const recipeId = typeof body.recipeId === "string" ? body.recipeId : "";
    if (!recipeId) return Response.json({ error: "recipeId required." }, { status: 400 });
    await deleteRecipe(auth.context.workspaceId, recipeId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete recipe.";
    return Response.json({ error: message }, { status: 400 });
  }
}
