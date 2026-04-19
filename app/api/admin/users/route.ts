import { listAdminUsers } from '@/lib/adminUsers'
import { ensureAdminApiAccess } from '@/lib/auth'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  const users = await listAdminUsers()
  return Response.json({ users })
}
