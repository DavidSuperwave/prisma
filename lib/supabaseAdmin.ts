import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let cachedClient: SupabaseClient | null | undefined

export function hasSupabaseAdminConfig() {
  return Boolean(supabaseUrl && supabaseServiceRoleKey)
}

export function getSupabaseAdmin() {
  if (!hasSupabaseAdminConfig()) {
    return null
  }

  if (cachedClient !== undefined) {
    return cachedClient
  }

  cachedClient = createClient(supabaseUrl!, supabaseServiceRoleKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return cachedClient
}

export function getAssetBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET ?? 'intake-assets'
}
