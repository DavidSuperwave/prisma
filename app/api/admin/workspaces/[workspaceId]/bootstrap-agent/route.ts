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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { ensureAdminApiAccess } from '@/lib/auth'
import { evaluateAgentReadiness, mergeReadinessIntoKnowledgeScope } from '@/lib/agentReadiness'
import { bootstrapCrm } from '@/lib/crmBootstrap'
import { bootstrapDocuments } from '@/lib/documentsBootstrap'
import { listIntegrations } from '@/lib/integrations/store'
import { resolveHermesMemoryConfig } from '@/lib/hermesMemoryConfig'
import { resolveHermesGatewayConfig } from '@/lib/hermesGatewayConfig'

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

function normalizeRuntimeBaseUrl(input: string) {
  return input.trim().replace(/\/+$/, '')
}

async function verifyRuntimeHealth(baseUrl: string, apiKey: string) {
  const checks = [
    { path: '/health', useAuth: false },
    { path: '/v1/models', useAuth: true },
  ] as const

  for (const check of checks) {
    try {
      const response = await fetch(`${baseUrl}${check.path}`, {
        method: 'GET',
        headers: check.useAuth ? { Authorization: `Bearer ${apiKey}` } : undefined,
        cache: 'no-store',
      })
      if (response.ok) {
        return { ok: true as const, path: check.path }
      }
    } catch {
      // Try the next check target.
    }
  }

  return { ok: false as const }
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

  try {
    await bootstrapCrm(workspaceId)
  } catch (error) {
    console.error('bootstrapCrm (admin bootstrap) failed', error)
  }

  try {
    await bootstrapDocuments(workspaceId)
  } catch (error) {
    console.error('bootstrapDocuments (admin bootstrap) failed', error)
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
  const runtimeBaseUrl = process.env.HERMES_API_BASE_URL?.trim()
  const runtimeApiKey = process.env.HERMES_API_KEY?.trim()

  if (!runtimeBaseUrl || !runtimeApiKey) {
    return Response.json(
      { error: 'HERMES_API_BASE_URL and HERMES_API_KEY are required for bootstrap.' },
      { status: 500 },
    )
  }

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

  const normalizedRuntimeBaseUrl = normalizeRuntimeBaseUrl(runtimeBaseUrl)
  const runtimeHealth = await verifyRuntimeHealth(normalizedRuntimeBaseUrl, runtimeApiKey)
  if (!runtimeHealth.ok) {
    return Response.json(
      {
        error: 'Hermes runtime is unreachable. Bootstrap aborted before activating agent.',
        runtimeBaseUrl: normalizedRuntimeBaseUrl,
      },
      { status: 502 },
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return Response.json(
      { error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for bootstrap.' },
      { status: 500 },
    )
  }

  const { data: existingAgentRow, error: existingAgentRowError } = await supabase
    .from('workspace_agents')
    .select('knowledge_scope, soul_md, channel_config')
    .eq('id', agent.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (existingAgentRowError) {
    return Response.json({ error: existingAgentRowError.message }, { status: 500 })
  }

  const readiness = evaluateAgentReadiness({
    apiEndpoint: normalizedRuntimeBaseUrl,
    apiKey: runtimeApiKey,
    soulMd: String(existingAgentRow?.soul_md ?? agent.promptPack?.soulMd ?? ''),
  })

  // Collect per-workspace MCP integrations so Hermes can load them on start.
  let mcpServerSlugs: string[] = []
  try {
    const integrations = await listIntegrations(workspaceId)
    mcpServerSlugs = integrations
      .filter((row) => row.authType === 'mcp' && row.status === 'active')
      .map((row) => row.slug)
  } catch (error) {
    console.error('bootstrap-agent: failed to list integrations', error)
  }

  const mergedScope = mergeReadinessIntoKnowledgeScope(
    (existingAgentRow?.knowledge_scope as Record<string, unknown>) ?? {},
    readiness,
  )
  mergedScope.mcp_servers = mcpServerSlugs
  mergedScope.mcp_config_url = `/api/workspaces/${workspace.slug}/agents/${agent.id}/mcp-config`

  try {
    const memoryConfig = await resolveHermesMemoryConfig({ workspaceId, agentId: agent.id })
    mergedScope.memory_provider = memoryConfig.provider
  } catch (error) {
    console.error('bootstrap-agent: failed to resolve memory config', error)
    mergedScope.memory_provider = 'none'
  }

  try {
    const gatewayConfig = await resolveHermesGatewayConfig({
      workspaceId,
      agentId: agent.id,
      channelConfig:
        (existingAgentRow?.channel_config as Record<string, unknown> | null) ?? null,
    })
    mergedScope.gateway_channels = gatewayConfig.channels.map((channel) => channel.kind)
  } catch (error) {
    console.error('bootstrap-agent: failed to resolve gateway config', error)
    mergedScope.gateway_channels = []
  }

  const { error: runtimeUpdateError } = await supabase
    .from('workspace_agents')
    .update({
      container_name: containerName,
      api_endpoint: normalizedRuntimeBaseUrl,
      api_key: runtimeApiKey,
      hermes_version: imageRef,
      status: 'active',
      knowledge_scope: mergedScope,
      updated_at: new Date().toISOString(),
    })
    .eq('id', agent.id)
    .eq('workspace_id', workspaceId)

  if (runtimeUpdateError) {
    return Response.json({ error: runtimeUpdateError.message }, { status: 500 })
  }

  const [freshAgents, freshDeployments] = await Promise.all([listAgents(workspaceId), listDeployments(workspaceId)])
  const hydratedAgent = freshAgents.find((entry) => entry.id === agent.id) ?? agent
  const hydratedDeployment =
    freshDeployments.find((entry) => entry.agentDefinitionId === agent.id) ?? deployment

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
      runtimeBaseUrl: normalizedRuntimeBaseUrl,
      runtimeHealthPath: runtimeHealth.path,
    },
  })

  return Response.json({
    agent: hydratedAgent,
    deployment: hydratedDeployment,
  })
}
