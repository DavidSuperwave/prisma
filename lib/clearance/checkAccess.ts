import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export type WorkspaceFeatureFlagKey =
  | 'can_use_agents'
  | 'can_view_billing'
  | 'can_invite_members'
  | 'can_create_automations'
  | 'can_export_data'
  | 'can_access_connectors'
  | 'simplified_mode'

export type WorkspaceAccessInput = {
  workspaceId: string
  userId: string
  isPlatformAdmin?: boolean
  requiredClearanceLevel?: number
  requiredSection?: string
  requiredFeatureFlag?: WorkspaceFeatureFlagKey
  allowedRoles?: Array<'admin' | 'operator' | 'viewer'>
}

export type WorkspaceAccessResult = {
  allowed: boolean
  reason?: string
  role?: 'admin' | 'operator' | 'viewer'
  clearanceLevel: number
  visibleSections: string[]
}

const DEFAULT_FLAGS: Record<WorkspaceFeatureFlagKey, boolean> = {
  can_use_agents: true,
  can_view_billing: false,
  can_invite_members: true,
  can_create_automations: false,
  can_export_data: true,
  can_access_connectors: false,
  simplified_mode: true,
}

export async function checkWorkspaceAccess(input: WorkspaceAccessInput): Promise<WorkspaceAccessResult> {
  if (input.isPlatformAdmin) {
    return {
      allowed: true,
      clearanceLevel: 4,
      visibleSections: ['*'],
    }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return {
      allowed: false,
      reason: 'supabase_unavailable',
      clearanceLevel: 0,
      visibleSections: [],
    }
  }

  const { data: membershipRow, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role, clearance_level, visible_sections')
    .eq('workspace_id', input.workspaceId)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (membershipError || !membershipRow) {
    return {
      allowed: false,
      reason: 'membership_not_found',
      clearanceLevel: 0,
      visibleSections: [],
    }
  }

  const role = String(membershipRow.role) as 'admin' | 'operator' | 'viewer'
  const clearanceLevel = Number(membershipRow.clearance_level ?? 2)
  const visibleSections = Array.isArray(membershipRow.visible_sections)
    ? membershipRow.visible_sections.map((entry) => String(entry))
    : ['dashboard', 'agents', 'records']

  if (input.allowedRoles && !input.allowedRoles.includes(role)) {
    return {
      allowed: false,
      reason: 'role_not_allowed',
      role,
      clearanceLevel,
      visibleSections,
    }
  }

  if (input.requiredSection && !visibleSections.includes(input.requiredSection)) {
    return {
      allowed: false,
      reason: 'section_hidden',
      role,
      clearanceLevel,
      visibleSections,
    }
  }

  if (input.requiredClearanceLevel && clearanceLevel < input.requiredClearanceLevel) {
    return {
      allowed: false,
      reason: 'clearance_too_low',
      role,
      clearanceLevel,
      visibleSections,
    }
  }

  if (input.requiredFeatureFlag) {
    const featureEnabled = await resolveWorkspaceFeatureFlag(
      input.workspaceId,
      input.requiredFeatureFlag,
    )
    if (!featureEnabled) {
      return {
        allowed: false,
        reason: 'feature_disabled',
        role,
        clearanceLevel,
        visibleSections,
      }
    }
  }

  return {
    allowed: true,
    role,
    clearanceLevel,
    visibleSections,
  }
}

async function resolveWorkspaceFeatureFlag(
  workspaceId: string,
  key: WorkspaceFeatureFlagKey,
) {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return DEFAULT_FLAGS[key]
  }

  const { data } = await supabase
    .from('workspace_feature_flags')
    .select(key)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  const typedData = data as Partial<Record<WorkspaceFeatureFlagKey, unknown>> | null
  if (!typedData || typeof typedData[key] !== 'boolean') {
    return DEFAULT_FLAGS[key]
  }
  return Boolean(typedData[key])
}

export type WorkspaceAuditInput = {
  workspaceId: string
  userId?: string | null
  action: string
  resourceType?: string
  resourceId?: string
  riskLevel?: 'low' | 'medium' | 'high'
  metadata?: Record<string, unknown>
}

export async function writeWorkspaceAuditLog(input: WorkspaceAuditInput) {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return
  }
  await supabase.from('workspace_audit_log').insert({
    workspace_id: input.workspaceId,
    user_id: input.userId ?? null,
    action: input.action,
    resource_type: input.resourceType ?? null,
    resource_id: input.resourceId ?? null,
    risk_level: input.riskLevel ?? 'low',
    metadata: input.metadata ?? {},
  })
}
