import { listAdminUsers } from '@/lib/adminUsers'
import { ensureAdminApiAccess } from '@/lib/auth'

export async function GET() {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  const users = await listAdminUsers()
  return Response.json({ users })
}
