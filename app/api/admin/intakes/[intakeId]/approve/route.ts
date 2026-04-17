import { getIntakeSubmissionById, updateIntakeProvisioningStatus } from '@/lib/intakeStore'
import { listSites, trackUsageEvent, updateSitePublishStatus } from '@/lib/platformStore'
import { ensureAdminApiAccess } from '@/lib/auth'

type Context = {
  params: Promise<{ intakeId: string }>
}

export async function POST(_: Request, context: Context) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  const { intakeId } = await context.params
  const intake = await getIntakeSubmissionById(intakeId)

  if (!intake) {
    return Response.json({ error: 'Intake not found' }, { status: 404 })
  }

  if (intake.lifecycleStatus !== 'reviewing') {
    return Response.json(
      { error: `Intake must be reviewing before approval. Current status: ${intake.lifecycleStatus}` },
      { status: 400 },
    )
  }

  const updatedIntake = await updateIntakeProvisioningStatus(intakeId, {
    lifecycleStatus: 'ready_to_publish',
  })

  let updatedSiteId: string | null = null
  if (intake.workspaceId && intake.projectId) {
    const sites = await listSites(intake.workspaceId)
    const targetSite = sites.find((site) => site.projectId === intake.projectId)
    if (targetSite && targetSite.publishStatus === 'reviewing') {
      const updatedSite = await updateSitePublishStatus(targetSite.id, 'ready')
      updatedSiteId = updatedSite?.id ?? null
    }

    await trackUsageEvent({
      workspaceId: intake.workspaceId,
      projectId: intake.projectId,
      source: 'admin',
      eventName: 'intake.approved_for_publish',
      eventMetadata: {
        intakeId,
        siteId: updatedSiteId,
      },
    })
  }

  return Response.json({
    intake: updatedIntake,
    updatedSiteId,
  })
}
