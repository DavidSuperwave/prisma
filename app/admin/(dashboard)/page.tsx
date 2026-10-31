import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'
import { listAgents, listDeployments, listProvisioningJobs, listSites, listTemplates, listWorkspaces } from '@/lib/platformStore'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminOverviewPage() {
  noStore()

  const [workspaces, templates, sites, agents, deployments, jobs, billingSnapshot] = await Promise.all([
    listWorkspaces(),
    listTemplates(),
    listSites(),
    listAgents(),
    listDeployments(),
    listProvisioningJobs(10),
    loadBillingAndUsageSnapshot(),
  ])

  const stats = [
    { label: 'Workspaces', value: workspaces.length, href: '/admin/clients' },
    { label: 'Estimated MRR', value: `$${billingSnapshot.mrrUsd.toFixed(2)}`, href: '/admin/billing' },
    { label: 'Templates', value: templates.length, href: '/admin/templates' },
    { label: 'Sites', value: sites.length, href: '/admin/clients' },
    { label: 'Agents', value: agents.length, href: '/admin/agents' },
    { label: 'Credits (tokens)', value: billingSnapshot.tokensThisMonth.toLocaleString(), href: '/admin/billing' },
    { label: 'Deployments', value: deployments.length, href: '/admin/deployments' },
    { label: 'Ops events', value: jobs.length, href: '/admin/usage' },
  ]
  const upsellSignals = workspaces.filter((workspace) => {
    const usage = billingSnapshot.workspaceUsage.get(workspace.id)
    return usage !== undefined && usage > 50000
  })
  const churnSignals = workspaces.filter((workspace) => {
    const usage = billingSnapshot.workspaceUsage.get(workspace.id) ?? 0
    return usage === 0
  })

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Launch & monitor</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Control plane for workspace provisioning, template management, deployment health, and operations visibility.
      </p>

      <div style={gridStyle}>
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{stat.label}</p>
            <p style={{ margin: '8px 0 0', fontSize: 28, fontWeight: 700 }}>{stat.value}</p>
          </Link>
        ))}
      </div>

      <div style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Latest provisioning jobs</h2>
        {jobs.length === 0 ? (
          <p style={{ color: 'var(--giga-muted)' }}>No provisioning jobs yet.</p>
        ) : (
          <ul style={listStyle}>
            {jobs.map((job) => (
              <li key={job.id} style={rowStyle}>
                <span>{job.jobType}</span>
                <span>{job.status}</span>
                <span style={{ color: 'var(--giga-muted)' }}>{new Date(job.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Upsell signals</h2>
        {upsellSignals.length === 0 ? (
          <p style={{ color: 'var(--giga-muted)' }}>No workspace crossed this month token threshold yet.</p>
        ) : (
          <ul style={listStyle}>
            {upsellSignals.map((workspace) => (
              <li key={workspace.id} style={rowStyle}>
                <span>{workspace.name}</span>
                <span>{(billingSnapshot.workspaceUsage.get(workspace.id) ?? 0).toLocaleString()} tokens</span>
                <Link href={`/admin/workspaces/${workspace.slug}`} style={inlineLinkStyle}>
                  Open workspace
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Churn risk alerts</h2>
        {churnSignals.length === 0 ? (
          <p style={{ color: 'var(--giga-muted)' }}>No low-activity workspaces detected.</p>
        ) : (
          <ul style={listStyle}>
            {churnSignals.map((workspace) => (
              <li key={workspace.id} style={rowStyle}>
                <span>{workspace.name}</span>
                <span style={{ color: 'var(--giga-muted)' }}>No credit usage this month</span>
                <Link href={`/admin/workspaces/${workspace.slug}`} style={inlineLinkStyle}>
                  Investigate
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

async function loadBillingAndUsageSnapshot() {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return {
      mrrUsd: 0,
      tokensThisMonth: 0,
      workspaceUsage: new Map<string, number>(),
    }
  }

  const start = new Date()
  start.setUTCDate(1)
  start.setUTCHours(0, 0, 0, 0)
  const [{ data: billingRows }, { data: usageRows }] = await Promise.all([
    supabase.from('workspace_billing').select('workspace_id, plan_base_price_cents, agent_count, hosting_price_cents'),
    supabase.from('credit_usage_events').select('workspace_id, total_tokens').gte('created_at', start.toISOString()),
  ])

  const mrrCents = (billingRows ?? []).reduce((sum, row) => {
    const perAgent = Number(row.plan_base_price_cents ?? 0)
    const agentCount = Math.max(1, Number(row.agent_count ?? 0))
    const hosting = Number(row.hosting_price_cents ?? 0)
    return sum + perAgent * agentCount + hosting
  }, 0)

  const workspaceUsage = new Map<string, number>()
  let tokensThisMonth = 0
  for (const row of usageRows ?? []) {
    const workspaceId = String(row.workspace_id)
    const tokens = Number(row.total_tokens ?? 0)
    tokensThisMonth += tokens
    workspaceUsage.set(workspaceId, (workspaceUsage.get(workspaceId) ?? 0) + tokens)
  }

  return {
    mrrUsd: mrrCents / 100,
    tokensThisMonth,
    workspaceUsage,
  }
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 12,
  marginTop: 18,
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 12,
  padding: 14,
  background: 'var(--giga-surface)',
  textDecoration: 'none',
  color: 'inherit',
}

const panelStyle: React.CSSProperties = {
  marginTop: 20,
  border: '1px solid var(--giga-border)',
  borderRadius: 12,
  padding: 16,
  background: 'var(--giga-surface)',
}

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'grid',
  gap: 8,
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr 1.5fr',
  border: '1px solid var(--giga-border)',
  borderRadius: 10,
  padding: '8px 10px',
  alignItems: 'center',
}

const inlineLinkStyle: React.CSSProperties = {
  textDecoration: 'none',
  color: 'var(--giga-text)',
  border: '1px solid var(--giga-border)',
  borderRadius: 8,
  padding: '5px 9px',
  justifySelf: 'end',
}
