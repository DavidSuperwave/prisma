import { ensureAdminApiAccess } from '@/lib/auth'
import { getIntakeSubmissionById, updateIntakeLead, type IntakeLeadStatus } from '@/lib/intakeStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = {
  params: Promise<{ leadId: string }>
}

const ALLOWED_STATUSES: IntakeLeadStatus[] = ['new', 'contacted', 'workspace_created', 'rejected']

export async function PATCH(request: Request, context: Context) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }

  const { leadId } = await context.params
  const currentLead = await getIntakeSubmissionById(leadId)
  if (!currentLead) {
    return Response.json({ error: 'Lead not found' }, { status: 404 })
  }

  const payload = (await request.json()) as {
    status?: string
    adminNotes?: string
    workspaceId?: string
    projectId?: string
  }

  const status = payload.status?.trim()
  if (status && !ALLOWED_STATUSES.includes(status as IntakeLeadStatus)) {
    return Response.json({ error: 'Invalid status' }, { status: 400 })
  }

  const updated = await updateIntakeLead(leadId, {
    status: status as IntakeLeadStatus | undefined,
    adminNotes: payload.adminNotes?.trim() || undefined,
    workspaceId: payload.workspaceId?.trim() || undefined,
    projectId: payload.projectId?.trim() || undefined,
  })

  if (!updated) {
    return Response.json({ error: 'Unable to update lead' }, { status: 500 })
  }

  return Response.json({ lead: updated })
}
