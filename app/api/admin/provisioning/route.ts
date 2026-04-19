import { listProvisioningJobs } from '@/lib/platformStore'
import { ensureAdminApiAccess } from '@/lib/auth'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  const { searchParams } = new URL(request.url)
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Number(limitParam) : 50
  const jobs = await listProvisioningJobs(Number.isFinite(limit) ? limit : 50)
  return Response.json({ jobs })
}
