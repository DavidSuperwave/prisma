import { listAdminUsers } from '@/lib/adminUsers'

export async function GET() {
  const users = await listAdminUsers()
  return Response.json({ users })
}
