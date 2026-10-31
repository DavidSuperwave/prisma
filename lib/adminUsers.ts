import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export type AdminUser = {
  id: string
  email?: string
  createdAt: string
}

async function listAllAuthUsers(): Promise<AdminUser[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return []
  }

  try {
    const users: AdminUser[] = []
    let page = 1
    const perPage = 200

    while (page < 100) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
      if (error || !data) {
        return users
      }

      users.push(
        ...data.users.map((user) => ({
          id: user.id,
          email: user.email,
          createdAt: user.created_at ?? new Date().toISOString(),
        })),
      )

      if (data.users.length < perPage) {
        break
      }
      page += 1
    }

    return users
  } catch {
    return []
  }
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  return listAllAuthUsers()
}

export async function listAuthUsersById(): Promise<Map<string, AdminUser>> {
  const users = await listAllAuthUsers()
  return new Map(users.map((user) => [user.id, user]))
}

export async function findAuthUserByEmail(email: string): Promise<AdminUser | null> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    return null
  }
  const users = await listAllAuthUsers()
  return users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail) ?? null
}
