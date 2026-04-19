import { getCurrentAppUser } from "@/lib/auth";
import { bootstrapCrm } from "@/lib/crmBootstrap";
import { bootstrapDocuments } from "@/lib/documentsBootstrap";
import { getWorkspaceMembershipForSlug } from "@/lib/workspaceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ workspaceSlug: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const user = await getCurrentAppUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    const membership = await getWorkspaceMembershipForSlug(
      user.id,
      workspaceSlug,
      user.isPlatformAdmin,
    );
    if (!membership) {
      return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
    }
    if (!user.isPlatformAdmin && membership.role !== "admin") {
      return Response.json({ error: "Only workspace admins can bootstrap CRM." }, { status: 403 });
    }

    const result = await bootstrapCrm(membership.workspace.id);
    const documentsResult = await bootstrapDocuments(membership.workspace.id);
    return Response.json({ ok: true, result, documents: documentsResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to bootstrap CRM.";
    return Response.json({ error: message }, { status: 500 });
  }
}
