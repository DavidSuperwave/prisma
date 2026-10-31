import { ensureAdminApiAccess } from '@/lib/auth'
import { getIntakeSubmissionById, updateIntakeLead } from '@/lib/intakeStore'
import { provisionWorkspaceFromIntake } from '@/lib/platformStore'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = {
  params: Promise<{ leadId: string }>
}

export async function POST(_: Request, context: Context) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }

  const { leadId } = await context.params
  const intake = await getIntakeSubmissionById(leadId)
  if (!intake) {
    return Response.json({ error: 'Lead not found' }, { status: 404 })
  }

  const provisioned = await provisionWorkspaceFromIntake(intake)

  await updateIntakeLead(leadId, {
    status: 'workspace_created',
    workspaceId: provisioned.workspaceId,
    projectId: provisioned.projectId,
  })

  const supabase = getSupabaseAdmin()
  if (supabase) {
    await supabase
      .from('workspaces')
      .update({ intake_submission_id: leadId })
      .eq('id', provisioned.workspaceId)
  }

  return Response.json({
    leadId,
    workspaceId: provisioned.workspaceId,
    projectId: provisioned.projectId,
    alreadyProvisioned: provisioned.alreadyProvisioned,
  })
}
