import {
  createDeployment,
  createProject,
  createSite,
  createWorkspace,
  listSites,
  listTemplates,
  seedPlaceholderAgents,
  trackUsageEvent,
} from '@/lib/platformStore'
import { ensureWorkspaceHermesHome } from '@/lib/hermesHome'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { ensureAdminApiAccess } from '@/lib/auth'

type ManualCreateRequest = {
  companyName?: string
  agentCount?: number
  soulMd?: string
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

function buildUniqueSubdomain(companyName: string, existingSubdomains: Set<string>) {
  const base = slugify(companyName)
  if (!base) {
    return ''
  }
  if (!existingSubdomains.has(base)) {
    return base
  }
  let suffix = 2
  while (suffix < 1000) {
    const candidate = `${base}-${suffix}`
    if (!existingSubdomains.has(candidate)) {
      return candidate
    }
    suffix += 1
  }
  return `${base}-${Date.now().toString(36)}`
}

export async function POST(request: Request) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  try {
    const body = (await request.json()) as ManualCreateRequest
    const companyName = body.companyName?.trim()
    if (!companyName) {
      return Response.json({ error: 'companyName is required' }, { status: 400 })
    }
    const requestedAgentCount = Number.isFinite(body.agentCount) ? Math.max(1, Math.floor(Number(body.agentCount))) : 3
    if (requestedAgentCount > 12) {
      return Response.json({ error: 'agentCount must be 12 or fewer' }, { status: 400 })
    }

    const templates = await listTemplates()
    const template = templates.find((entry) => entry.isActive) ?? templates[0]
    if (!template) {
      return Response.json({ error: 'No active landing template is available.' }, { status: 404 })
    }
    const existingSites = await listSites()
    const normalizedSubdomain = buildUniqueSubdomain(companyName, new Set(existingSites.map((site) => site.subdomain)))
    if (!normalizedSubdomain) {
      return Response.json({ error: 'Unable to generate a subdomain from companyName.' }, { status: 400 })
    }

    const sharedSoulMd = body.soulMd?.trim() ?? ''
    const projectName = `${companyName} Launch`
    const siteName = `${companyName} Site`

    const workspace = await createWorkspace({
      name: companyName,
      slug: normalizedSubdomain,
      metadata: {
        source: 'manual_admin_create',
        company_name: companyName,
        agent_limit: requestedAgentCount,
        requested_agent_count: requestedAgentCount,
      },
    })
    const project = await createProject({
      workspaceId: workspace.id,
      name: projectName,
      status: 'onboarding',
      metadata: {
        source: 'manual_admin_create',
        company_name: companyName,
      },
    })

    const site = await createSite({
      workspaceId: workspace.id,
      projectId: project.id,
      templateId: template.id,
      name: siteName,
      subdomain: normalizedSubdomain,
      publishStatus: 'reviewing',
      content: {
        companyName,
        serviceDescription: '',
      },
      themeConfig: {},
      seoConfig: {
        title: `${companyName} | Prisma`,
      },
    })

    const agents = await seedPlaceholderAgents(workspace.id, requestedAgentCount, {
      companyName,
      sharedSoulMd,
    })
    const deployments: Awaited<ReturnType<typeof createDeployment>>[] = []
    for (const agent of agents) {
      const deployment = await createDeployment({
          workspaceId: workspace.id,
          agentDefinitionId: agent.id,
          dropletHost: process.env.HERMES_DROPLET_HOST ?? 'shared-droplet',
          containerName: sanitizeContainerName(`hermes-${workspace.slug}-${agent.role}`),
          imageRef: process.env.HERMES_IMAGE_REF ?? 'prisma/hermes:stable',
          envSecretRef: `secret://${workspace.slug}/hermes`,
          status: 'pending',
      })
      deployments.push(deployment)
    }
    try {
      await ensureWorkspaceHermesHome({
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
        agentId: agents[0]?.id ?? null,
      })
    } catch (error) {
      console.error('manual-create ensureWorkspaceHermesHome failed', error)
    }

    await trackUsageEvent({
      workspaceId: workspace.id,
      projectId: project.id,
      source: 'admin',
      eventName: 'workspace.manual_created',
      eventMetadata: {
        templateId: template.id,
        siteId: site.id,
        agentIds: agents.map((entry) => entry.id),
        deploymentIds: deployments.map((entry) => entry.id),
        requestedAgentCount,
      },
    })

    return Response.json(
      {
        workspace,
        project,
        site,
        agents,
        deployments,
        runtime: {
          workspaceAppPath: `/workspaces/${workspace.slug}`,
          adminPath: `/admin/workspaces/${workspace.slug}`,
          status: deployments.length > 0 ? 'pending_runtime_sync' : 'database_only',
          message:
            'Workspace, project, site, and agent rows are provisioned. Hermes runtime health may still be pending until deployment sync completes.',
        },
      },
      { status: 201 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create manual project'
    return Response.json({ error: message }, { status: 400 })
  }
}
