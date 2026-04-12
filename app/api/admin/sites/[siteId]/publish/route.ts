import { updateIntakeProvisioningStatus } from '@/lib/intakeStore'
import { getSiteById, listProjects, trackUsageEvent, updateSitePublishStatus } from '@/lib/platformStore'

type Context = {
  params: Promise<{ siteId: string }>
}

export async function POST(_: Request, context: Context) {
  const { siteId } = await context.params
  const site = await getSiteById(siteId)
  if (!site) {
    return Response.json({ error: 'Site not found' }, { status: 404 })
  }

  if (site.publishStatus !== 'ready' && site.publishStatus !== 'reviewing') {
    return Response.json({ error: `Site cannot be published from status: ${site.publishStatus}` }, { status: 400 })
  }

  const publishedSite = await updateSitePublishStatus(siteId, 'published')

  let updatedIntakeId: string | null = null
  if (site.projectId) {
    const projects = await listProjects(site.workspaceId)
    const project = projects.find((entry) => entry.id === site.projectId)
    if (project?.intakeSubmissionId) {
      const updatedIntake = await updateIntakeProvisioningStatus(project.intakeSubmissionId, {
        lifecycleStatus: 'published',
      })
      updatedIntakeId = updatedIntake?.id ?? null
    }

    await trackUsageEvent({
      workspaceId: site.workspaceId,
      projectId: site.projectId,
      source: 'admin',
      eventName: 'site.published',
      eventMetadata: {
        siteId,
        intakeId: updatedIntakeId,
      },
    })
  }

  return Response.json({
    site: publishedSite,
    updatedIntakeId,
  })
}
