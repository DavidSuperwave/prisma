import Link from 'next/link'
import { listWorkspaces } from '@/lib/platformStore'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

type BillingRow = {
  workspaceId: string
  status: string
  agentCount: number
  planBasePriceCents: number
  hostingPriceCents: number
}

type UsageAggregate = {
  workspaceId: string
  totalTokens: number
  totalCostUsd: number
}

export default async function AdminBillingPage() {
  const [workspaces, billingRows, usageRows] = await Promise.all([
    listWorkspaces(),
    loadBillingRows(),
    loadUsageByWorkspaceThisMonth(),
  ])

  const usageMap = new Map(usageRows.map((row) => [row.workspaceId, row]))
  const totalMrrCents = billingRows.reduce(
    (sum, row) => sum + row.planBasePriceCents * Math.max(1, row.agentCount) + row.hostingPriceCents,
    0,
  )
  const totalTokens = usageRows.reduce((sum, row) => sum + row.totalTokens, 0)
  const totalUsageCost = usageRows.reduce((sum, row) => sum + row.totalCostUsd, 0)

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Billing</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Subscription and token usage snapshot from workspace billing and credit usage events.
      </p>

      <div style={summaryGridStyle}>
        <article style={summaryCardStyle}>
          <p style={{ margin: 0, color: 'var(--giga-muted)' }}>Estimated MRR</p>
          <p style={summaryValueStyle}>${(totalMrrCents / 100).toFixed(2)}</p>
        </article>
        <article style={summaryCardStyle}>
          <p style={{ margin: 0, color: 'var(--giga-muted)' }}>Tokens this month</p>
          <p style={summaryValueStyle}>{totalTokens.toLocaleString()}</p>
        </article>
        <article style={summaryCardStyle}>
          <p style={{ margin: 0, color: 'var(--giga-muted)' }}>Usage cost this month</p>
          <p style={summaryValueStyle}>${totalUsageCost.toFixed(2)}</p>
        </article>
      </div>

      <div style={panelStyle}>
        {workspaces.length === 0 ? (
          <p style={{ color: 'var(--giga-muted)' }}>No workspaces available.</p>
        ) : (
          <ul style={listStyle}>
            {workspaces.map((workspace) => {
              const billing = billingRows.find((row) => row.workspaceId === workspace.id)
              const usage = usageMap.get(workspace.id)
              return (
                <li key={workspace.id} style={rowStyle}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700 }}>{workspace.name}</p>
                    <p style={{ margin: '4px 0 0', color: 'var(--giga-muted)' }}>slug: {workspace.slug}</p>
                    <p style={{ margin: '4px 0 0', color: 'var(--giga-muted)' }}>
                      billing status: {billing?.status ?? 'not configured'}
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: 0, color: 'var(--giga-muted)' }}>
                      Agent MRR: $
                      {billing
                        ? ((billing.planBasePriceCents * Math.max(1, billing.agentCount)) / 100).toFixed(2)
                        : '0.00'}
                    </p>
                    <p style={{ margin: '4px 0 0', color: 'var(--giga-muted)' }}>
                      Hosting MRR: ${(billing ? billing.hostingPriceCents / 100 : 0).toFixed(2)}
                    </p>
                    <p style={{ margin: '4px 0 0', color: 'var(--giga-muted)' }}>
                      Tokens this month: {usage ? usage.totalTokens.toLocaleString() : '0'}
                    </p>
                    <p style={{ margin: '4px 0 0', color: 'var(--giga-muted)' }}>
                      Usage cost: ${usage ? usage.totalCostUsd.toFixed(2) : '0.00'}
                    </p>
                  </div>
                  <div>
                    <Link href={`/admin/workspaces/${workspace.slug}?tab=overview`} style={linkStyle}>
                      Open workspace detail
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

async function loadBillingRows(): Promise<BillingRow[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return []
  }
  const { data, error } = await supabase
    .from('workspace_billing')
    .select('workspace_id, status, agent_count, plan_base_price_cents, hosting_price_cents')
  if (error || !data) {
    return []
  }
  return data.map((row) => ({
    workspaceId: String(row.workspace_id),
    status: String(row.status ?? 'active'),
    agentCount: Number(row.agent_count ?? 0),
    planBasePriceCents: Number(row.plan_base_price_cents ?? 0),
    hostingPriceCents: Number(row.hosting_price_cents ?? 0),
  }))
}

async function loadUsageByWorkspaceThisMonth(): Promise<UsageAggregate[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return []
  }

  const start = new Date()
  start.setUTCDate(1)
  start.setUTCHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('credit_usage_events')
    .select('workspace_id, total_tokens, cost_usd')
    .gte('created_at', start.toISOString())

  if (error || !data) {
    return []
  }

  const aggregate = new Map<string, UsageAggregate>()
  for (const row of data) {
    const workspaceId = String(row.workspace_id)
    const entry = aggregate.get(workspaceId) ?? { workspaceId, totalTokens: 0, totalCostUsd: 0 }
    entry.totalTokens += Number(row.total_tokens ?? 0)
    entry.totalCostUsd += Number(row.cost_usd ?? 0)
    aggregate.set(workspaceId, entry)
  }
  return Array.from(aggregate.values())
}

const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}

const summaryCardStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 12,
  padding: 14,
  background: 'var(--giga-surface)',
}

const summaryValueStyle: React.CSSProperties = {
  margin: '8px 0 0',
  fontSize: 28,
  fontWeight: 700,
}

const panelStyle: React.CSSProperties = {
  marginTop: 16,
  border: '1px solid var(--giga-border)',
  borderRadius: 12,
  padding: 16,
  background: 'var(--giga-surface)',
}

const listStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gap: 10,
}

const rowStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 10,
  padding: 12,
  display: 'grid',
  gridTemplateColumns: '1.2fr 1fr auto',
  gap: 10,
  alignItems: 'center',
}

const linkStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 8,
  padding: '6px 10px',
  textDecoration: 'none',
  color: 'var(--giga-text)',
}
