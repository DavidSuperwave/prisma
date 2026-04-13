import { getCurrentAppUser } from "@/lib/auth";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";
import { createDeployment, listAgents, updateAgentDefinition } from "@/lib/platformStore";

type RuntimeAction = "deploy" | "restart" | "pause" | "stop";

type RuntimeRequest = {
  workspaceId?: string;
  agentId?: string;
  action?: RuntimeAction;
  dropletHost?: string;
  imageRef?: string;
  containerName?: string;
};

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
  if (!membership.isPlatformAdmin && membership.role === "viewer") {
    return Response.json({ error: "Viewer role cannot control runtime actions." }, { status: 403 });
  }

  const agents = await listAgents(body.workspaceId);
  const agent = agents.find((entry) => entry.id === body.agentId);
  if (!agent) {
    return Response.json({ error: "Agent not found." }, { status: 404 });
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

  if (body.action === "pause" || body.action === "stop") {
    await updateAgentDefinition(agent.id, {
      workspaceId: body.workspaceId,
      isActive: false,
    });

    if (body.action === "stop") {
      await createDeployment({
        workspaceId: body.workspaceId,
        agentDefinitionId: agent.id,
        dropletHost: defaultDropletHost,
        containerName: nextContainerName,
        imageRef: defaultImageRef,
        status: "stopped",
      });
    }

    return Response.json({
      ok: true,
      action: body.action,
      status: "paused",
      message:
        body.action === "stop"
          ? "Agente detenido con flujo de emergencia."
          : "Agente pausado.",
      runtime: {
        dropletHost: defaultDropletHost,
        containerName: nextContainerName,
        imageRef: defaultImageRef,
      },
    });
  }

  await createDeployment({
    workspaceId: body.workspaceId,
    agentDefinitionId: agent.id,
    dropletHost: defaultDropletHost,
    containerName: nextContainerName,
    imageRef: defaultImageRef,
    status: body.action === "deploy" ? "pending" : "building",
  });

  await updateAgentDefinition(agent.id, {
    workspaceId: body.workspaceId,
    isActive: true,
  });

  return Response.json({
    ok: true,
    action: body.action,
    status: body.action === "deploy" ? "deploying" : "active",
    message:
      body.action === "deploy"
        ? "Despliegue iniciado. El agente pasará a activo cuando termine."
        : "Reinicio solicitado. Runtime actualizado.",
    runtime: {
      dropletHost: defaultDropletHost,
      containerName: nextContainerName,
      imageRef: defaultImageRef,
    },
  });
}
