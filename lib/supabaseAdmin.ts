import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null | undefined
let cachedConfigKey: string | null = null

export function hasSupabaseAdminConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!hasSupabaseAdminConfig()) {
    cachedClient = null
    cachedConfigKey = null
    return null
  }

  const configKey = `${supabaseUrl}:${supabaseServiceRoleKey?.slice(0, 12)}`
  if (cachedClient !== undefined && cachedConfigKey === configKey) {
    return cachedClient
  }

  cachedClient = createClient(supabaseUrl!, supabaseServiceRoleKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  cachedConfigKey = configKey

  return cachedClient
}

export function getAssetBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET ?? 'intake-assets'
}
