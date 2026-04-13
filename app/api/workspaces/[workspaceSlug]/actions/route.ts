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

function parseCopilotMessage(message: string): {
  runCrm: boolean;
  dashboardPreset?: "operations" | "sales" | "crm" | "custom";
} | null {
  const normalized = message.toLowerCase().trim();
  if (!normalized) {
    return null;
  }

  const runCrm =
    normalized.includes("crear crm") ||
    normalized.includes("create crm") ||
    normalized.includes("bootstrap crm") ||
    normalized.includes("pipeline crm") ||
    normalized.includes("configura crm");

  const asksForDashboard =
    normalized.includes("crear dashboard") ||
    normalized.includes("create dashboard") ||
    normalized.includes("dashboard preset") ||
    normalized.includes("configura dashboard");

  let dashboardPreset: "operations" | "sales" | "crm" | "custom" | undefined;
  if (asksForDashboard) {
    dashboardPreset =
      normalized.includes("ventas") || normalized.includes("sales")
        ? "sales"
        : normalized.includes("crm")
          ? "crm"
          : normalized.includes("custom") || normalized.includes("personalizado")
            ? "custom"
            : "operations";
  }

  if (!runCrm && !dashboardPreset) {
    return null;
  }

  return { runCrm, dashboardPreset };
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

    const actions: Array<{
      action: "bootstrap-crm" | "create-dashboard";
      status: "executed" | "queued";
      preset?: "operations" | "sales" | "crm" | "custom";
      error?: string;
    }> = [];

    if (intent.runCrm) {
      try {
        await bootstrapWorkspaceCrm(membership.workspaceId);
        actions.push({ action: "bootstrap-crm", status: "executed" });
      } catch (error) {
        actions.push({
          action: "bootstrap-crm",
          status: "queued",
          error: error instanceof Error ? error.message : "CRM action could not run immediately.",
        });
      }
    }

    if (intent.dashboardPreset) {
      try {
        await createWorkspaceDashboardPreset(membership.workspaceId, intent.dashboardPreset);
        actions.push({
          action: "create-dashboard",
          status: "executed",
          preset: intent.dashboardPreset,
        });
      } catch (error) {
        actions.push({
          action: "create-dashboard",
          status: "queued",
          preset: intent.dashboardPreset,
          error: error instanceof Error ? error.message : "Dashboard action could not run immediately.",
        });
      }
    }

    const first = actions[0];
    const hasExecutedAction = actions.some((entry) => entry.status === "executed");
    return Response.json(
      {
        action: first?.action,
        preset: first?.preset,
        actions,
      },
      { status: hasExecutedAction ? 201 : 202 },
    );
  }

  return Response.json({ error: "Unsupported action." }, { status: 400 });
}
