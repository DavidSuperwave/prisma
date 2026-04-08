import { listProvisioningJobs } from '@/lib/platformStore'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Number(limitParam) : 50
  const jobs = await listProvisioningJobs(Number.isFinite(limit) ? limit : 50)
  return Response.json({ jobs })
}
