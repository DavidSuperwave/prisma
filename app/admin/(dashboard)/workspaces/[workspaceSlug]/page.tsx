import Link from 'next/link'
import { notFound } from 'next/navigation'
import WorkspaceMemberInviteForm from '@/components/admin/WorkspaceMemberInviteForm'
import { listAuthUsersById } from '@/lib/adminUsers'
import { listAgents, listDeployments, listProjects, listSites, listUsageEvents, listWorkspaces } from '@/lib/platformStore'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

type WorkspaceDetailPageProps = {
  params: Promise<{ workspaceSlug: string }>
  searchParams: Promise<{ tab?: string }>
}

type BillingSnapshot = {
  status: string
  agentCount: number
  planBasePriceCents: number
  currentPeriodStart?: string
  currentPeriodEnd?: string
}

const tabs = ['overview', 'users', 'agents'] as const

export default async function AdminWorkspaceDetailPage({ params, searchParams }: WorkspaceDetailPageProps) {
  const { workspaceSlug } = await params
  const { tab = 'overview' } = await searchParams
  const activeTab = tabs.includes(tab as (typeof tabs)[number]) ? tab : 'overview'
  const workspaces = await listWorkspaces()
  const workspace = workspaces.find((entry) => entry.slug === workspaceSlug)
  if (!workspace) {
    notFound()
  }

  const [projects, sites, agents, deployments, usageEvents, users, billing] = await Promise.all([
    listProjects(workspace.id),
    listSites(workspace.id),
    listAgents(workspace.id),
    listDeployments(workspace.id),
    listUsageEvents(workspace.id, 20),
    listWorkspaceMembers(workspace.id),
    loadBillingSnapshot(workspace.id),
  ])

  const tabsBasePath = `/admin/workspaces/${workspaceSlug}`

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>{workspace.name}</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Workspace detail view with overview, users, and agent runtime links.
      </p>
      <div style={actionRowStyle}>
        <Link href={`/workspaces/${workspace.slug}`} style={actionLinkStyle}>
          Open workspace app
        </Link>
        <Link href={`/admin/workspaces/${workspaceSlug}/hermes-lab`} style={actionLinkStyle}>
          Open Hermes lab
        </Link>
      </div>

      <nav style={tabNavStyle}>
        {tabs.map((entry) => (
          <Link
            key={entry}
            href={`${tabsBasePath}?tab=${entry}`}
            style={entry === activeTab ? activeTabStyle : tabStyle}
          >
            {entry}
          </Link>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <div style={gridStyle}>
          <article style={cardStyle}>
            <h2 style={cardTitleStyle}>Health snapshot</h2>
            <p style={{ margin: '8px 0 0', color: 'var(--giga-muted)' }}>Workspace status: {workspace.status}</p>
            <p style={{ margin: '8px 0 0', color: 'var(--giga-muted)' }}>Projects: {projects.length}</p>
            <p style={{ margin: '8px 0 0', color: 'var(--giga-muted)' }}>Sites: {sites.length}</p>
            <p style={{ margin: '8px 0 0', color: 'var(--giga-muted)' }}>Agents: {agents.length}</p>
            <p style={{ margin: '8px 0 0', color: 'var(--giga-muted)' }}>Deployments: {deployments.length}</p>
          </article>

          <article style={cardStyle}>
            <h2 style={cardTitleStyle}>Billing snapshot</h2>
            {billing ? (
              <>
                <p style={{ margin: '8px 0 0', color: 'var(--giga-muted)' }}>Status: {billing.status}</p>
                <p style={{ margin: '8px 0 0', color: 'var(--giga-muted)' }}>Agent count: {billing.agentCount}</p>
                <p style={{ margin: '8px 0 0', color: 'var(--giga-muted)' }}>
                  Base plan: ${(billing.planBasePriceCents / 100).toFixed(2)}
                </p>
                <p style={{ margin: '8px 0 0', color: 'var(--giga-muted)' }}>
                  Period: {billing.currentPeriodStart ?? 'n/a'} - {billing.currentPeriodEnd ?? 'n/a'}
                </p>
              </>
            ) : (
              <p style={{ margin: '8px 0 0', color: 'var(--giga-muted)' }}>No billing snapshot yet.</p>
            )}
          </article>

          <article style={cardStyle}>
            <h2 style={cardTitleStyle}>Recent activity</h2>
            {usageEvents.length === 0 ? (
              <p style={{ margin: '8px 0 0', color: 'var(--giga-muted)' }}>No usage events yet.</p>
            ) : (
              <ul style={compactListStyle}>
                {usageEvents.slice(0, 6).map((event) => (
                  <li key={event.id} style={{ color: 'var(--giga-muted)' }}>
                    {event.eventName} - {new Date(event.createdAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article style={cardStyle}>
            <h2 style={cardTitleStyle}>Launch vs runtime</h2>
            <p style={{ margin: '8px 0 0', color: 'var(--giga-muted)' }}>
              This workspace is live in Prisma as soon as the database rows are created. Hermes runtime health is separate and may stay
              pending until deployment sync completes.
            </p>
            {deployments.length === 0 ? (
              <p style={{ margin: '8px 0 0', color: 'var(--giga-muted)' }}>No deployment rows recorded yet.</p>
            ) : (
              <ul style={compactListStyle}>
                {deployments.map((deployment) => (
                  <li key={deployment.id} style={{ color: 'var(--giga-muted)' }}>
                    {deployment.containerName} - {deployment.status}
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      ) : null}

      {activeTab === 'users' ? (
        <article style={cardStyle}>
          <h2 style={cardTitleStyle}>Members</h2>
          <p style={{ color: 'var(--giga-muted)' }}>
            Invite teammates by email. Existing auth users are attached immediately; new users receive a Supabase invite email.
          </p>
          <WorkspaceMemberInviteForm workspaceId={workspace.id} />
          {users.length === 0 ? (
            <p style={{ color: 'var(--giga-muted)' }}>No members were found for this workspace.</p>
          ) : (
            <ul style={compactListStyle}>
              {users.map((user) => (
                <li key={user.id}>
                  {user.email ?? user.userId} - {user.role}
                </li>
              ))}
            </ul>
          )}
        </article>
      ) : null}

      {activeTab === 'agents' ? (
        <article style={cardStyle}>
          <h2 style={cardTitleStyle}>Agents</h2>
          {agents.length === 0 ? (
            <p style={{ color: 'var(--giga-muted)' }}>No agents were found in this workspace.</p>
          ) : (
            <ul style={compactListStyle}>
              {agents.map((agent) => (
                <li key={agent.id} style={{ color: 'var(--giga-muted)' }}>
                  {agent.name} - {agent.isActive ? 'active' : 'paused'}
                </li>
              ))}
            </ul>
          )}
          <p style={{ marginTop: 12, color: 'var(--giga-muted)' }}>
            Database provisioning and runtime deployment are separate: an agent can exist in the workspace before Hermes reports it as live.
          </p>
        </article>
      ) : null}
    </section>
  )
}

async function listWorkspaceMembers(workspaceId: string) {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return []
  }
  const [{ data, error }, usersById] = await Promise.all([
    supabase.from('workspace_members').select('id, user_id, role').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    listAuthUsersById(),
  ])
  if (error || !data) {
    return []
  }
  return data.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    email: usersById.get(String(row.user_id))?.email,
    role: String(row.role),
  }))
}

async function loadBillingSnapshot(workspaceId: string): Promise<BillingSnapshot | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return null
  }
  const { data, error } = await supabase
    .from('workspace_billing')
    .select('status, agent_count, plan_base_price_cents, current_period_start, current_period_end')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error || !data) {
    return null
  }
  return {
    status: String(data.status ?? 'active'),
    agentCount: Number(data.agent_count ?? 0),
    planBasePriceCents: Number(data.plan_base_price_cents ?? 0),
    currentPeriodStart: data.current_period_start ? String(data.current_period_start) : undefined,
    currentPeriodEnd: data.current_period_end ? String(data.current_period_end) : undefined,
  }
}

const tabNavStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginBottom: 14,
}

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  marginBottom: 16,
}

const tabStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 8,
  padding: '7px 10px',
  textDecoration: 'none',
  color: 'var(--giga-text)',
  fontSize: 13,
}

const actionLinkStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'rgba(255,255,255,0.04)',
}

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'rgba(255,255,255,0.08)',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 12,
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 12,
  padding: 14,
  background: 'var(--giga-surface)',
}

const cardTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 8,
}

const compactListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 16,
  display: 'grid',
  gap: 6,
}
