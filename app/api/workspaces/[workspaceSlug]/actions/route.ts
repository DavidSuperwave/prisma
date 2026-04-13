import { getCurrentAppUser } from "@/lib/auth";
import { createWorkspaceActivityForUser, listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";
import { bootstrapWorkspaceCrm, createWorkspaceDashboardPreset } from "@/lib/workspaceActions";
import {
  buildCopilotActionPlan,
  type PlannedWorkspaceActionResult,
  summarizeWorkspaceActionResults,
} from "@/lib/copilotActionPlanner";
import { listAgents } from "@/lib/platformStore";
import { canMutateWorkspaceConfig, canOperateRuntime, type WorkspaceRole } from "@/lib/workspaceAccess";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type ActionRequest = {
  action?: "bootstrap-crm" | "create-dashboard" | "copilot-execute" | "runtime-control";
  preset?: "operations" | "sales" | "crm" | "custom";
  message?: string;
  confirmPlan?: boolean;
  agentId?: string;
  runtimeAction?: "deploy" | "restart" | "pause" | "stop";
  dropletHost?: string;
  imageRef?: string;
  containerName?: string;
};

function coerceRole(value: string): WorkspaceRole {
  if (value === "admin" || value === "operator") {
    return value;
  }
  return "viewer";
}

function runtimeStatusForAction(action: "deploy" | "restart" | "pause" | "stop") {
  if (action === "pause" || action === "stop") {
    return "paused";
  }
  if (action === "deploy") {
    return "deploying";
  }
  return "active";
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

  const role = coerceRole(membership.role);
  const body = (await request.json().catch(() => ({}))) as ActionRequest;

  if (body.action === "bootstrap-crm") {
    if (!canMutateWorkspaceConfig(membership.isPlatformAdmin, role)) {
      return Response.json({ error: "Your role cannot mutate CRM schema." }, { status: 403 });
    }
    const result = await bootstrapWorkspaceCrm(membership.workspaceId);
    await createWorkspaceActivityForUser({
      workspaceId: membership.workspaceId,
      userId: user.id,
      action: "workspace.crm.bootstrap",
      details: {
        mode: "quick-action",
        created_objects: result.createdObjects,
        created_views: result.createdViews,
      },
    });
    return Response.json({ result }, { status: 201 });
  }

  if (body.action === "create-dashboard") {
    if (!canMutateWorkspaceConfig(membership.isPlatformAdmin, role)) {
      return Response.json({ error: "Your role cannot mutate dashboard config." }, { status: 403 });
    }
    const preset = body.preset ?? "operations";
    await createWorkspaceDashboardPreset(membership.workspaceId, preset);
    await createWorkspaceActivityForUser({
      workspaceId: membership.workspaceId,
      userId: user.id,
      action: "workspace.dashboard.create",
      details: {
        mode: "quick-action",
        preset,
      },
    });
    return Response.json({ preset }, { status: 201 });
  }

  if (body.action === "copilot-execute") {
    const plan = buildCopilotActionPlan(body.message ?? "");
    if (!plan) {
      return Response.json({ error: "No executable action detected in message." }, { status: 400 });
    }
    if (!body.confirmPlan) {
      return Response.json(
        {
          requiresConfirmation: true,
          plan,
          summary:
            "Plan detectado. Responde con 'si' para confirmar o 'no' para cancelar.",
        },
        { status: 200 },
      );
    }
    if (!canMutateWorkspaceConfig(membership.isPlatformAdmin, role)) {
      return Response.json({ error: "Your role cannot execute workspace actions." }, { status: 403 });
    }

    const results: PlannedWorkspaceActionResult[] = [];

    for (const action of plan.actions) {
      if (action.action === "bootstrap-crm") {
        try {
          await bootstrapWorkspaceCrm(membership.workspaceId);
          results.push({ action: "bootstrap-crm", status: "executed" });
          await createWorkspaceActivityForUser({
            workspaceId: membership.workspaceId,
            userId: user.id,
            action: "workspace.crm.bootstrap",
            details: {
              mode: "copilot",
              source_message: plan.sourceMessage,
            },
          });
        } catch (error) {
          results.push({
            action: "bootstrap-crm",
            status: "queued",
            error: error instanceof Error ? error.message : "CRM action could not run immediately.",
          });
        }
        continue;
      }

      try {
        await createWorkspaceDashboardPreset(membership.workspaceId, action.preset);
        results.push({
          action: "create-dashboard",
          preset: action.preset,
          status: "executed",
        });
        await createWorkspaceActivityForUser({
          workspaceId: membership.workspaceId,
          userId: user.id,
          action: "workspace.dashboard.create",
          details: {
            mode: "copilot",
            preset: action.preset,
            source_message: plan.sourceMessage,
          },
        });
      } catch (error) {
        results.push({
          action: "create-dashboard",
          preset: action.preset,
          status: "queued",
          error: error instanceof Error ? error.message : "Dashboard action could not run immediately.",
        });
      }
    }

    const hasExecutedAction = results.some((entry) => entry.status === "executed");
    return Response.json(
      {
        actions: results,
        summary: summarizeWorkspaceActionResults(results),
      },
      { status: hasExecutedAction ? 201 : 202 },
    );
  }

  if (body.action === "runtime-control") {
    if (!body.agentId || !body.runtimeAction) {
      return Response.json({ error: "agentId and runtimeAction are required." }, { status: 400 });
    }
    if (!canOperateRuntime(membership.isPlatformAdmin, role)) {
      return Response.json({ error: "Current role cannot control runtime actions." }, { status: 403 });
    }

    const agents = await listAgents(membership.workspaceId);
    const agent = agents.find((entry) => entry.id === body.agentId);
    if (!agent) {
      return Response.json({ error: "Agent not found in workspace." }, { status: 404 });
    }

    await createWorkspaceActivityForUser({
      workspaceId: membership.workspaceId,
      userId: user.id,
      action: `runtime.${body.runtimeAction}`,
      details: {
        mode: "copilot-plan",
        agent_id: body.agentId,
        status_after_action: runtimeStatusForAction(body.runtimeAction),
      },
    });

    return Response.json(
      {
        ok: true,
        runtimeAction: body.runtimeAction,
        status: runtimeStatusForAction(body.runtimeAction),
      },
      { status: 201 },
    );
  }

  return Response.json({ error: "Unsupported action." }, { status: 400 });
}
