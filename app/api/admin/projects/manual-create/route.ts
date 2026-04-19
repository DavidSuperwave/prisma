import {
  createDeployment,
  createProject,
  createSite,
  createWorkspace,
  listSites,
  listTemplates,
  listWorkspaces,
  seedPlaceholderAgents,
  trackUsageEvent,
} from '@/lib/platformStore'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { ensureAdminApiAccess } from '@/lib/auth'

type ManualCreateRequest = {
  workspaceId?: string
  workspaceName?: string
  workspaceSlug?: string
  projectName?: string
  industry?: string
  primaryColor?: string
  templateId?: string
  siteName?: string
  subdomain?: string
  serviceDescription?: string
  createAgent?: boolean
  agentName?: string
  agentRole?: 'intake_assistant' | 'lead_qualifier' | 'crm_updater' | 'follow_up' | 'ops_assistant' | 'custom'
  agentModel?: string
  dropletHost?: string
  imageRef?: string
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function sanitizeContainerName(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9-]/g, '-')
}

export async function POST(request: Request) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  try {
    const body = (await request.json()) as ManualCreateRequest
    if (!body.projectName?.trim()) {
      return Response.json({ error: 'projectName is required' }, { status: 400 })
    }
    if (!body.templateId) {
      return Response.json({ error: 'templateId is required' }, { status: 400 })
    }
    if (!body.siteName?.trim()) {
      return Response.json({ error: 'siteName is required' }, { status: 400 })
    }
    if (!body.subdomain?.trim()) {
      return Response.json({ error: 'subdomain is required' }, { status: 400 })
    }

    const workspaces = await listWorkspaces()
    let workspace = body.workspaceId ? workspaces.find((entry) => entry.id === body.workspaceId) : undefined

    if (!workspace) {
      if (!body.workspaceName?.trim()) {
        return Response.json({ error: 'workspaceName is required when workspaceId is not provided' }, { status: 400 })
      }
      workspace = await createWorkspace({
        name: body.workspaceName,
        slug: body.workspaceSlug,
        metadata: {
          source: 'manual_admin_create',
        },
      })
    }

    const templates = await listTemplates()
    const template = templates.find((entry) => entry.id === body.templateId)
    if (!template) {
      return Response.json({ error: 'template not found' }, { status: 404 })
    }

    const normalizedSubdomain = slugify(body.subdomain)
    if (!normalizedSubdomain) {
      return Response.json({ error: 'subdomain is invalid' }, { status: 400 })
    }

    const existingSites = await listSites()
    if (existingSites.some((site) => site.subdomain === normalizedSubdomain)) {
      return Response.json({ error: 'subdomain is already in use' }, { status: 409 })
    }

    const project = await createProject({
      workspaceId: workspace.id,
      name: body.projectName,
      status: 'onboarding',
      industry: body.industry,
      primaryColor: body.primaryColor,
      metadata: {
        source: 'manual_admin_create',
      },
    })

    const site = await createSite({
      workspaceId: workspace.id,
      projectId: project.id,
      templateId: template.id,
      name: body.siteName,
      subdomain: normalizedSubdomain,
      publishStatus: 'reviewing',
      content: {
        companyName: workspace.name,
        serviceDescription: body.serviceDescription ?? '',
      },
      themeConfig: {
        primaryColor: body.primaryColor ?? '#4f46e5',
      },
      seoConfig: {
        title: `${workspace.name} | Prisma`,
      },
    })

    let agents: Awaited<ReturnType<typeof seedPlaceholderAgents>> = []
    let agent: Awaited<ReturnType<typeof seedPlaceholderAgents>>[number] | null = null
    let deployment: Awaited<ReturnType<typeof createDeployment>> | null = null

    if (body.createAgent !== false) {
      agents = await seedPlaceholderAgents(workspace.id, 3)
      agent = agents[0] ?? null

      if (agent) {
        deployment = await createDeployment({
          workspaceId: workspace.id,
          agentDefinitionId: agent.id,
          dropletHost: body.dropletHost ?? process.env.HERMES_DROPLET_HOST ?? 'shared-droplet',
          containerName: sanitizeContainerName(`hermes-${workspace.slug}-${agent.role}`),
          imageRef: body.imageRef ?? process.env.HERMES_IMAGE_REF ?? 'prisma/hermes:stable',
          envSecretRef: `secret://${workspace.slug}/hermes`,
          status: 'pending',
        })
      }
    }

    await trackUsageEvent({
      workspaceId: workspace.id,
      projectId: project.id,
      source: 'admin',
      eventName: 'project.manual_created',
      eventMetadata: {
        templateId: template.id,
        siteId: site.id,
        agentId: agent?.id ?? null,
        agentIds: agents.map((entry) => entry.id),
        deploymentId: deployment?.id ?? null,
      },
    })

    return Response.json(
      {
        workspace,
        project,
        site,
        agents,
        agent,
        deployment,
      },
      { status: 201 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create manual project'
    return Response.json({ error: message }, { status: 400 })
  }
}
