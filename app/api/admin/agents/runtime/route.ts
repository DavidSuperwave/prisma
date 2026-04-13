import { getCurrentAppUser } from "@/lib/auth";
import { createWorkspaceActivityForUser, listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";
import { createDeployment, listAgents, listDeployments, updateAgentDefinition } from "@/lib/platformStore";

type RuntimeAction = "deploy" | "restart" | "pause" | "stop";

type RuntimeRequest = {
  workspaceId?: string;
  agentId?: string;
  action?: RuntimeAction;
  dropletHost?: string;
  imageRef?: string;
  containerName?: string;
};

const ACTION_COOLDOWN_MS = 10_000;

function slugifyRuntimeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildContainerName(inputName: string, role: string, fallback = "workspace-agent") {
  const slug = slugifyRuntimeName(inputName) || fallback;
  const roleSlug = slugifyRuntimeName(role) || "custom";
  return `hermes-${slug}-${roleSlug}`.slice(0, 63);
}

function canOperateRuntime(isPlatformAdmin: boolean, role: "admin" | "operator" | "viewer") {
  if (isPlatformAdmin) {
    return true;
  }
  return role === "admin" || role === "operator";
}

function runtimeStatusForAction(action: RuntimeAction): "active" | "paused" | "deploying" {
  if (action === "pause" || action === "stop") {
    return "paused";
  }
  if (action === "deploy") {
    return "deploying";
  }
  return "active";
}

export async function POST(request: Request) {
  const user = await getCurrentAppUser();
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RuntimeRequest;
  if (!body.workspaceId || !body.agentId || !body.action) {
    return Response.json(
      { error: "workspaceId, agentId, and action are required." },
      { status: 400 },
    );
  }

  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspaceId === body.workspaceId);
  if (!membership) {
    return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
  }
  if (!canOperateRuntime(membership.isPlatformAdmin, membership.role)) {
    return Response.json({ error: "Current role cannot control runtime actions." }, { status: 403 });
  }

  const agents = await listAgents(body.workspaceId);
  const agent = agents.find((entry) => entry.id === body.agentId);
  if (!agent) {
    return Response.json({ error: "Agent not found." }, { status: 404 });
  }

  const deployments = await listDeployments(body.workspaceId);
  const latestDeployment = deployments
    .filter((entry) => entry.agentDefinitionId === body.agentId)
    .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1))[0];
  const lastActionAt = latestDeployment?.updatedAt ? Date.parse(latestDeployment.updatedAt) : 0;
  const now = Date.now();
  if (lastActionAt > 0 && now - lastActionAt < ACTION_COOLDOWN_MS) {
    return Response.json(
      {
        error: "Runtime action cooldown active. Retry in a few seconds.",
        cooldownMsRemaining: ACTION_COOLDOWN_MS - (now - lastActionAt),
      },
      { status: 429 },
    );
  }

  const defaultDropletHost =
    body.dropletHost?.trim() ||
    process.env.HERMES_DROPLET_HOST?.trim() ||
    "127.0.0.1";
  const defaultImageRef =
    body.imageRef?.trim() ||
    process.env.HERMES_IMAGE_REF?.trim() ||
    "runtime-default";
  const nextContainerName =
    body.containerName?.trim() ||
    buildContainerName(agent.name, agent.role, `agent-${agent.id.slice(0, 8)}`);
  const nextVersion = (latestDeployment?.deploymentVersion ?? 0) + 1;

  const targetDeploymentStatus =
    body.action === "stop" || body.action === "pause"
      ? "stopped"
      : body.action === "deploy"
        ? "pending"
        : "building";

  const deployment = await createDeployment({
    workspaceId: body.workspaceId,
    agentDefinitionId: agent.id,
    dropletHost: defaultDropletHost,
    containerName: nextContainerName,
    imageRef: defaultImageRef,
    status: targetDeploymentStatus,
    envSecretRef: `secret://${body.workspaceId}/runtime`,
  });

  await updateAgentDefinition(agent.id, {
    workspaceId: body.workspaceId,
    isActive: body.action === "pause" || body.action === "stop" ? false : true,
  });

  const status = runtimeStatusForAction(body.action);
  const message =
    body.action === "deploy"
      ? "Despliegue iniciado. El agente pasará a activo cuando termine."
      : body.action === "restart"
        ? "Reinicio solicitado. Runtime actualizado."
        : body.action === "stop"
          ? "Agente detenido con flujo de emergencia."
          : "Agente pausado.";

  await createWorkspaceActivityForUser({
    workspaceId: body.workspaceId,
    userId: user.id,
    action: `runtime.${body.action}`,
    details: {
      agent_id: body.agentId,
      deployment_id: deployment.id,
      deployment_status: deployment.status,
      deployment_version: nextVersion,
      requested_by_role: membership.role,
      runtime: {
        droplet_host: defaultDropletHost,
        container_name: nextContainerName,
        image_ref: defaultImageRef,
      },
      status_after_action: status,
    },
  });

  return Response.json({
    ok: true,
    action: body.action,
    status,
    message,
    runtime: {
      dropletHost: defaultDropletHost,
      containerName: nextContainerName,
      imageRef: defaultImageRef,
      deploymentVersion: nextVersion,
    },
  });
}
