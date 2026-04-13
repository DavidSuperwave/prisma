import { getCurrentAppUser } from "@/lib/auth";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";
import { bootstrapWorkspaceCrm, createWorkspaceDashboardPreset } from "@/lib/workspaceActions";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type ActionRequest = {
  action?: "bootstrap-crm" | "create-dashboard" | "copilot-execute";
  preset?: "operations" | "sales" | "crm" | "custom";
  message?: string;
};

function parseCopilotMessage(message: string): { action: "bootstrap-crm" | "create-dashboard"; preset?: "operations" | "sales" | "crm" | "custom" } | null {
  const normalized = message.toLowerCase().trim();
  if (!normalized) {
    return null;
  }

  const asksForCrm =
    normalized.includes("crear crm") ||
    normalized.includes("create crm") ||
    normalized.includes("bootstrap crm") ||
    normalized.includes("pipeline crm") ||
    normalized.includes("configura crm");
  if (asksForCrm) {
    return { action: "bootstrap-crm" };
  }

  const asksForDashboard =
    normalized.includes("crear dashboard") ||
    normalized.includes("create dashboard") ||
    normalized.includes("dashboard preset") ||
    normalized.includes("configura dashboard");
  if (asksForDashboard) {
    const preset =
      normalized.includes("ventas") || normalized.includes("sales")
        ? "sales"
        : normalized.includes("crm")
          ? "crm"
          : normalized.includes("custom") || normalized.includes("personalizado")
            ? "custom"
            : "operations";
    return { action: "create-dashboard", preset };
  }

  return null;
}

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

  if (body.action === "copilot-execute") {
    const intent = parseCopilotMessage(body.message ?? "");
    if (!intent) {
      return Response.json({ error: "No executable action detected in message." }, { status: 400 });
    }

    if (intent.action === "bootstrap-crm") {
      const result = await bootstrapWorkspaceCrm(membership.workspaceId);
      return Response.json({ action: "bootstrap-crm", result }, { status: 201 });
    }

    const cards = await createWorkspaceDashboardPreset(membership.workspaceId, intent.preset ?? "operations");
    return Response.json(
      {
        action: "create-dashboard",
        preset: intent.preset ?? "operations",
        cards,
      },
      { status: 201 },
    );
  }

  return Response.json({ error: "Unsupported action." }, { status: 400 });
}
