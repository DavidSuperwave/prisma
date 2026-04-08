import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export type AdminUser = {
  id: string
  email?: string
  createdAt: string
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return []
  }

  try {
    const { data, error } = await supabase.auth.admin.listUsers()
    if (error || !data) {
      return []
    }

    return data.users.map((user) => ({
      id: user.id,
      email: user.email,
      createdAt: user.created_at ?? new Date().toISOString(),
    }))
  } catch {
    return []
  }
}
