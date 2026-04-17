import { listUsageEvents } from '@/lib/platformStore'
import { ensureAdminApiAccess } from '@/lib/auth'

export async function GET(request: Request) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId') ?? undefined
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Number(limitParam) : 100
  const usageEvents = await listUsageEvents(workspaceId, Number.isFinite(limit) ? limit : 100)
  return Response.json({ usageEvents })
}
