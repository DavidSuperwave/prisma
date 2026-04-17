import {
  createAgentDefinition,
  createDeployment,
  listAgents,
  listDeployments,
  listProjects,
  seedPlaceholderAgents,
  listWorkspaces,
  trackUsageEvent,
} from '@/lib/platformStore'
import { ensureAdminApiAccess } from '@/lib/auth'

type Context = {
  params: Promise<{ workspaceId: string }>
}

type BootstrapRequest = {
  dropletHost?: string
  imageRef?: string
}

function sanitizeContainerName(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9-]/g, '-')
}

export async function POST(request: Request, context: Context) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  const { workspaceId } = await context.params
  const body = (await request.json().catch(() => ({}))) as BootstrapRequest

  const workspaces = await listWorkspaces()
  const workspace = workspaces.find((entry) => entry.id === workspaceId)
  if (!workspace) {
    return Response.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const projects = await listProjects(workspaceId)
  const projectId = projects[0]?.id
  let existingAgents = await listAgents(workspaceId)
  if (existingAgents.length < 3) {
    existingAgents = await seedPlaceholderAgents(workspaceId, 3)
  }
  const existingDeployments = await listDeployments(workspaceId)

  let agent = existingAgents.find((entry) => entry.role === 'intake_assistant')
  if (!agent) {
    agent = await createAgentDefinition({
      workspaceId,
      projectId,
      name: `${workspace.name} Intake Agent`,
      role: 'intake_assistant',
      promptPack: {
        objective: 'Qualify leads and update CRM for this workspace only.',
      },
      toolsConfig: {
        crmRead: true,
        crmWrite: true,
        intakeAssist: true,
      },
      integrationConfig: {
        runtime: 'hermes',
      },
    })
  }

  const dropletHost = body.dropletHost ?? process.env.HERMES_DROPLET_HOST ?? 'shared-droplet'
  const imageRef = body.imageRef ?? process.env.HERMES_IMAGE_REF ?? 'prisma/hermes:stable'
  const containerName = sanitizeContainerName(`hermes-${workspace.slug}-intake`)

  let deployment = existingDeployments.find((entry) => entry.agentDefinitionId === agent.id)
  if (!deployment) {
    deployment = await createDeployment({
      workspaceId,
      agentDefinitionId: agent.id,
      dropletHost,
      containerName,
      imageRef,
      envSecretRef: `secret://${workspace.slug}/hermes`,
      status: 'pending',
    })
  }

  await trackUsageEvent({
    workspaceId,
    projectId,
    source: 'admin',
    eventName: 'workspace.bootstrap_agent',
    eventMetadata: {
      agentId: agent.id,
      deploymentId: deployment.id,
      dropletHost,
      imageRef,
    },
  })

  return Response.json({
    agent,
    deployment,
  })
}
