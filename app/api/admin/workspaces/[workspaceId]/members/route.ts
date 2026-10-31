import { ensureAdminApiAccess } from '@/lib/auth'
import { findAuthUserByEmail } from '@/lib/adminUsers'
import { listWorkspaces } from '@/lib/platformStore'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = {
  params: Promise<{ workspaceId: string }>
}

type InviteWorkspaceMemberRequest = {
  email?: string
  role?: 'admin' | 'operator' | 'viewer'
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export async function POST(request: Request, context: Context) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }

  const { workspaceId } = await context.params
  const body = (await request.json()) as InviteWorkspaceMemberRequest
  const email = normalizeEmail(String(body.email ?? ''))
  const role = body.role

  if (!email) {
    return Response.json({ error: 'email is required' }, { status: 400 })
  }
  if (!role || !['admin', 'operator', 'viewer'].includes(role)) {
    return Response.json({ error: 'role must be admin, operator, or viewer' }, { status: 400 })
  }

  const workspace = (await listWorkspaces()).find((entry) => entry.id === workspaceId)
  if (!workspace) {
    return Response.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return Response.json({ error: 'Supabase admin auth is not configured.' }, { status: 500 })
  }

  let user = await findAuthUserByEmail(email)
  let inviteSent = false

  if (!user) {
    const redirectTo = new URL('/login', request.url)
    redirectTo.searchParams.set('next', `/workspaces/${workspace.slug}`)
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo.toString(),
      data: {
        workspace_slug: workspace.slug,
        workspace_name: workspace.name,
        invited_role: role,
      },
    })

    if (error) {
      return Response.json({ error: error.message }, { status: 400 })
    }

    inviteSent = true
    user = data.user
      ? {
          id: data.user.id,
          email: data.user.email ?? email,
          createdAt: data.user.created_at ?? new Date().toISOString(),
        }
      : await findAuthUserByEmail(email)
  }

  if (!user) {
    return Response.json({ error: 'Unable to resolve the invited user in Supabase Auth.' }, { status: 500 })
  }

  const { error } = await supabase.from('workspace_members').upsert(
    {
      workspace_id: workspace.id,
      user_id: user.id,
      role,
    },
    {
      onConflict: 'workspace_id,user_id',
    },
  )

  if (error) {
    return Response.json({ error: error.message }, { status: 400 })
  }

  return Response.json({
    member: {
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      userId: user.id,
      email: user.email ?? email,
      role,
    },
    inviteSent,
  })
}
