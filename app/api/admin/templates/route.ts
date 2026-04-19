import {
  createAgentTemplate,
  deleteAgentTemplate,
  listAgentTemplates,
  updateAgentTemplate,
} from '@/lib/platformStore'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { ensureAdminApiAccess } from '@/lib/auth'

type CreateTemplateRequest = {
  name?: string
  description?: string
  type?: 'copilot' | 'channel' | 'worker' | 'chatbot'
  category?: string
  defaultSoulMd?: string
  defaultSkills?: string[]
  defaultKnowledgeScope?: Record<string, unknown>
  defaultCronJobs?: unknown[]
  defaultChannelConfig?: Record<string, unknown>
  defaultMemoryConfig?: Record<string, unknown>
  icon?: string
  isActive?: boolean
}

export async function GET() {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  const templates = await listAgentTemplates()
  return Response.json({ templates })
}

export async function POST(request: Request) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  try {
    const body = (await request.json()) as CreateTemplateRequest
    if (!body.name?.trim() || !body.type) {
      return Response.json({ error: 'name and type are required' }, { status: 400 })
    }

    const template = await createAgentTemplate({
      name: body.name,
      description: body.description,
      type: body.type,
      category: body.category,
      defaultSoulMd: body.defaultSoulMd,
      defaultSkills: body.defaultSkills,
      defaultKnowledgeScope: body.defaultKnowledgeScope,
      defaultCronJobs: body.defaultCronJobs,
      defaultChannelConfig: body.defaultChannelConfig,
      defaultMemoryConfig: body.defaultMemoryConfig,
      icon: body.icon,
      isActive: body.isActive,
    })

    return Response.json({ template }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create agent template'
    return Response.json({ error: message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  try {
    const body = (await request.json()) as CreateTemplateRequest & { id?: string }
    if (!body.id) {
      return Response.json({ error: 'id is required' }, { status: 400 })
    }

    const template = await updateAgentTemplate(body.id, {
      name: body.name,
      description: body.description,
      type: body.type,
      category: body.category,
      defaultSoulMd: body.defaultSoulMd,
      defaultSkills: body.defaultSkills,
      defaultKnowledgeScope: body.defaultKnowledgeScope,
      defaultCronJobs: body.defaultCronJobs,
      defaultChannelConfig: body.defaultChannelConfig,
      defaultMemoryConfig: body.defaultMemoryConfig,
      icon: body.icon,
      isActive: body.isActive,
    })

    if (!template) {
      return Response.json({ error: 'template not found' }, { status: 404 })
    }

    return Response.json({ template })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update agent template'
    return Response.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  const { searchParams } = new URL(request.url)
  const templateId = searchParams.get('id')
  if (!templateId) {
    return Response.json({ error: 'id is required' }, { status: 400 })
  }

  const deleted = await deleteAgentTemplate(templateId)
  if (!deleted) {
    return Response.json({ error: 'template not found' }, { status: 404 })
  }

  return Response.json({ ok: true })
}
