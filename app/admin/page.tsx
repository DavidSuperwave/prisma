import Link from 'next/link'
import { listAgents, listDeployments, listProvisioningJobs, listSites, listTemplates, listWorkspaces } from '@/lib/platformStore'

export default async function AdminOverviewPage() {
  const [workspaces, templates, sites, agents, deployments, jobs] = await Promise.all([
    listWorkspaces(),
    listTemplates(),
    listSites(),
    listAgents(),
    listDeployments(),
    listProvisioningJobs(10),
  ])

  const stats = [
    { label: 'Workspaces', value: workspaces.length, href: '/admin/clients' },
    { label: 'Templates', value: templates.length, href: '/admin/templates' },
    { label: 'Landing Sites', value: sites.length, href: '/admin/clients' },
    { label: 'Agents', value: agents.length, href: '/admin/agents' },
    { label: 'Deployments', value: deployments.length, href: '/admin/deployments' },
    { label: 'Provisioning Jobs', value: jobs.length, href: '/admin/usage' },
  ]

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Platform Overview</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Shared control plane for client onboarding, landing templates, agent definitions, and runtime deployments.
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
    </section>
  )
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
  gridTemplateColumns: '2fr 1fr 2fr',
  border: '1px solid var(--giga-border)',
  borderRadius: 10,
  padding: '8px 10px',
  alignItems: 'center',
}
