import { createAgentDefinition, listAgents } from '@/lib/platformStore'

type CreateAgentRequest = {
  workspaceId?: string
  projectId?: string
  name?: string
  role?: 'intake_assistant' | 'lead_qualifier' | 'crm_updater' | 'follow_up' | 'ops_assistant' | 'custom'
  model?: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId') ?? undefined
  const agents = await listAgents(workspaceId)
  return Response.json({ agents })
}

export async function POST(request: Request) {
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
    })

    return Response.json({ agent }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create agent'
    return Response.json({ error: message }, { status: 400 })
  }
}
