import { authorizeWorkspaceMember } from "@/app/api/workspaces/[workspaceSlug]/conversations/_shared";
import {
  deleteBinding,
  getBinding,
  updateBinding,
  type BindingDirection,
  type BindingMode,
  type BindingStatus,
} from "@/lib/integrations/bindings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; bindingId: string }>;
};

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug, bindingId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    const binding = await getBinding(auth.context.workspaceId, bindingId);
    if (!binding) return Response.json({ error: "Binding not found." }, { status: 404 });
    return Response.json({ binding });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load binding.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, bindingId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    const body = (await request.json().catch(() => ({}))) as {
      label?: string;
      direction?: BindingDirection;
      mode?: BindingMode;
      cadence?: string | null;
      mapping?: Record<string, unknown>;
      matchKey?: string | null;
      status?: BindingStatus;
      recipeId?: string | null;
    };
    const updated = await updateBinding(auth.context.workspaceId, bindingId, body);
    if (!updated) return Response.json({ error: "Binding not found." }, { status: 404 });
    return Response.json({ binding: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update binding.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { workspaceSlug, bindingId } = await context.params;
    const auth = await authorizeWorkspaceMember(workspaceSlug);
    if ("error" in auth) return auth.error;
    await deleteBinding(auth.context.workspaceId, bindingId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete binding.";
    return Response.json({ error: message }, { status: 400 });
  }
}
