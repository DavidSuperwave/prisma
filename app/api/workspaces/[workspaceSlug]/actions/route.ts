import { getCurrentAppUser } from "@/lib/auth";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";
import { bootstrapWorkspaceCrm, createWorkspaceDashboardPreset } from "@/lib/workspaceActions";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type ActionRequest = {
  action?: "bootstrap-crm" | "create-dashboard";
  preset?: "operations" | "sales" | "crm" | "custom";
};

export async function POST(request: Request, context: Context) {
  const user = await getCurrentAppUser();
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { workspaceSlug } = await context.params;
  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);

  if (!membership) {
    return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as ActionRequest;

  if (body.action === "bootstrap-crm") {
    const result = await bootstrapWorkspaceCrm(membership.workspaceId);
    return Response.json({ result }, { status: 201 });
  }

  if (body.action === "create-dashboard") {
    const preset = body.preset ?? "operations";
    const cards = await createWorkspaceDashboardPreset(membership.workspaceId, preset);
    return Response.json({ cards }, { status: 201 });
  }

  return Response.json({ error: "Unsupported action." }, { status: 400 });
}
