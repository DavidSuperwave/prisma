import {
  createAgentDefinition,
  createDeployment,
  createProject,
  createSite,
  createWorkspace,
  listSites,
  listTemplates,
  listWorkspaces,
  trackUsageEvent,
} from '@/lib/platformStore'

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

    let agent: Awaited<ReturnType<typeof createAgentDefinition>> | null = null
    let deployment: Awaited<ReturnType<typeof createDeployment>> | null = null

    if (body.createAgent !== false) {
      agent = await createAgentDefinition({
        workspaceId: workspace.id,
        projectId: project.id,
        name: body.agentName?.trim() || `${workspace.name} Intake Agent`,
        role: body.agentRole ?? 'intake_assistant',
        model: body.agentModel,
        promptPack: {
          objective: 'Support lead qualification and CRM operations for this workspace.',
        },
        toolsConfig: {
          crmRead: true,
          crmWrite: true,
        },
        integrationConfig: {
          runtime: 'openclaw',
          source: 'manual_admin_create',
        },
      })

      deployment = await createDeployment({
        workspaceId: workspace.id,
        agentDefinitionId: agent.id,
        dropletHost: body.dropletHost ?? process.env.OPENCLAW_DROPLET_HOST ?? 'shared-droplet',
        containerName: sanitizeContainerName(`openclaw-${workspace.slug}-${agent.role}`),
        imageRef: body.imageRef ?? process.env.OPENCLAW_IMAGE_REF ?? 'ghcr.io/prisma/openclaw:latest',
        envSecretRef: `secret://${workspace.slug}/openclaw`,
        status: 'pending',
      })
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
        deploymentId: deployment?.id ?? null,
      },
    })

    return Response.json(
      {
        workspace,
        project,
        site,
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
