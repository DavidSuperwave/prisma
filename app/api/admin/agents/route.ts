import { createAgentDefinition, listAgents, updateAgentDefinition } from '@/lib/platformStore'
import { ensureAdminApiAccess } from '@/lib/auth'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateAgentRequest = {
  workspaceId?: string
  projectId?: string
  name?: string
  role?: 'intake_assistant' | 'lead_qualifier' | 'crm_updater' | 'follow_up' | 'ops_assistant' | 'custom'
  model?: string
  promptPack?: Record<string, unknown>
  toolsConfig?: Record<string, unknown>
  integrationConfig?: Record<string, unknown>
}

type UpdateAgentRequest = CreateAgentRequest & {
  id?: string
}

export async function GET(request: Request) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId') ?? undefined
  const agents = await listAgents(workspaceId)
  return Response.json({ agents })
}

export async function POST(request: Request) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  try {
    const body = (await request.json()) as CreateAgentRequest
    if (!body.workspaceId || !body.name?.trim() || !body.role) {
      return Response.json({ error: 'workspaceId, name and role are required' }, { status: 400 })
    }

    const agent = await createAgentDefinition({
      workspaceId: body.workspaceId,
      projectId: body.projectId,
      name: body.name,
      role: body.role,
      model: body.model,
      promptPack: body.promptPack,
      toolsConfig: body.toolsConfig,
      integrationConfig: body.integrationConfig,
    })

    return Response.json({ agent }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create agent'
    return Response.json({ error: message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  try {
    const body = (await request.json()) as UpdateAgentRequest
    if (!body.id || !body.workspaceId) {
      return Response.json({ error: 'id and workspaceId are required' }, { status: 400 })
    }

    const agent = await updateAgentDefinition(body.id, {
      workspaceId: body.workspaceId,
      name: body.name,
      role: body.role,
      model: body.model,
      promptPack: body.promptPack,
      toolsConfig: body.toolsConfig,
      integrationConfig: body.integrationConfig,
    })

    if (!agent) {
      return Response.json({ error: 'Agent not found' }, { status: 404 })
    }

    return Response.json({ agent })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update agent'
    return Response.json({ error: message }, { status: 400 })
  }
}
