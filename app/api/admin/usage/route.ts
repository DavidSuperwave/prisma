import { listUsageEvents } from '@/lib/platformStore'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId') ?? undefined
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Number(limitParam) : 100
  const usageEvents = await listUsageEvents(workspaceId, Number.isFinite(limit) ? limit : 100)
  return Response.json({ usageEvents })
}
