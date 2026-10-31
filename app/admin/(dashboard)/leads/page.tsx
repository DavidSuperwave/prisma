import Link from 'next/link'
import LeadStatusEditor from '@/components/admin/LeadStatusEditor'
import LeadWorkspaceAction from '@/components/admin/LeadWorkspaceAction'
import { scoreBand } from '@/lib/intake/leadScore'
import { listIntakeSubmissions } from '@/lib/intakeStore'

type LeadsPageProps = {
  searchParams: Promise<{
    q?: string
    status?: string
    location?: string
    minScore?: string
  }>
}

export default async function AdminLeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams
  const q = (params.q ?? '').trim().toLowerCase()
  const status = (params.status ?? 'all').trim()
  const location = (params.location ?? '').trim().toLowerCase()
  const minScore = Number.parseInt(params.minScore ?? '', 10)
  const leads = await listIntakeSubmissions()

  const filtered = leads.filter((lead) => {
    if (status !== 'all' && lead.status !== status) {
      return false
    }
    if (Number.isFinite(minScore) && lead.leadScore < minScore) {
      return false
    }
    if (location && !lead.businessLocation.toLowerCase().includes(location)) {
      return false
    }
    if (q) {
      const haystack = `${lead.fullName} ${lead.businessName} ${lead.email} ${lead.reason}`.toLowerCase()
      if (!haystack.includes(q)) {
        return false
      }
    }
    return true
  })

  const csvQuery = new URLSearchParams()
  if (q) csvQuery.set('q', q)
  if (status !== 'all') csvQuery.set('status', status)
  if (location) csvQuery.set('location', location)
  if (Number.isFinite(minScore)) csvQuery.set('minScore', String(minScore))
  csvQuery.set('format', 'csv')

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Leads</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Intake leads from /intake with score bands, filters, and status actions.
      </p>

      <form style={filtersStyle} method="GET">
        <input name="q" defaultValue={params.q ?? ''} placeholder="Search lead or business" style={inputStyle} />
        <select name="status" defaultValue={status} style={inputStyle}>
          <option value="all">all statuses</option>
          <option value="new">new</option>
          <option value="contacted">contacted</option>
          <option value="workspace_created">workspace_created</option>
          <option value="rejected">rejected</option>
        </select>
        <input name="location" defaultValue={params.location ?? ''} placeholder="Location contains" style={inputStyle} />
        <input name="minScore" defaultValue={params.minScore ?? ''} type="number" min={0} max={5} placeholder="Min score" style={inputStyle} />
        <button type="submit" style={buttonStyle}>Apply filters</button>
        <Link href={`/api/admin/leads?${csvQuery.toString()}`} style={buttonStyle}>
          Export CSV
        </Link>
      </form>

      <div style={panelStyle}>
        {filtered.length === 0 ? (
          <p style={{ color: 'var(--giga-muted)' }}>No leads match the current filters.</p>
        ) : (
          <ul style={listStyle}>
            {filtered.map((lead) => {
              const band = scoreBand(lead.leadScore)
              return (
                <li key={lead.id} style={rowStyle}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700 }}>{lead.fullName}</p>
                    <p style={{ margin: '4px 0 0', color: 'var(--giga-muted)' }}>{lead.businessName}</p>
                    <p style={{ margin: '4px 0 0', color: 'var(--giga-muted)' }}>{lead.email}</p>
                    <p style={{ margin: '4px 0 0', color: 'var(--giga-muted)' }}>{lead.businessLocation}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, color: 'var(--giga-muted)' }}>
                      Date: {new Date(lead.createdAt).toLocaleDateString()}
                    </p>
                    <p style={{ margin: '6px 0 0', color: 'var(--giga-muted)' }}>Status: {lead.status}</p>
                    <p style={{ margin: '6px 0 0' }}>
                      <span style={scoreBadgeStyle(band)}>Lead score {lead.leadScore}</span>
                    </p>
                    {lead.websiteUrl ? (
                      <p style={{ margin: '6px 0 0' }}>
                        <a href={lead.websiteUrl} target="_blank" rel="noreferrer" style={linkStyle}>
                          Website
                        </a>
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <p style={{ margin: 0 }}>{lead.reason}</p>
                    <p style={{ margin: '6px 0 0', color: 'var(--giga-muted)' }}>
                      Brand assets: {lead.brandAssets.join(', ') || 'Ninguno'}
                    </p>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <LeadStatusEditor
                      leadId={lead.id}
                      initialStatus={lead.status}
                      initialAdminNotes={lead.adminNotes}
                    />
                    <LeadWorkspaceAction
                      leadId={lead.id}
                      disabled={lead.status === 'workspace_created'}
                    />
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

const panelStyle: React.CSSProperties = {
  marginTop: 16,
  border: '1px solid var(--giga-border)',
  borderRadius: 12,
  padding: 16,
  background: 'var(--giga-surface)',
}

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 10,
}

const rowStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 10,
  padding: 12,
  display: 'grid',
  gridTemplateColumns: '1.2fr 0.9fr 1.2fr 0.9fr',
  gap: 12,
  alignItems: 'start',
}

const filtersStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr 1.2fr 0.7fr auto auto',
  gap: 10,
  alignItems: 'center',
}

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.02)',
  color: 'var(--giga-text)',
  padding: '8px 10px',
  fontSize: 13,
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 8,
  background: 'var(--giga-surface)',
  color: 'var(--giga-text)',
  fontSize: 13,
  padding: '8px 10px',
  textDecoration: 'none',
}

function scoreBadgeStyle(band: 'green' | 'yellow' | 'red'): React.CSSProperties {
  const color =
    band === 'green' ? 'rgba(52, 211, 153, 0.35)' : band === 'yellow' ? 'rgba(251, 191, 36, 0.35)' : 'rgba(248, 113, 113, 0.35)'
  return {
    display: 'inline-flex',
    borderRadius: 999,
    border: `1px solid ${color}`,
    padding: '3px 10px',
    fontSize: 12,
  }
}

const linkStyle: React.CSSProperties = {
  color: 'var(--giga-text)',
}
