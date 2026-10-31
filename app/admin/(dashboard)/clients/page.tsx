import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'
import ClientWorkflowActions from '@/components/admin/ClientWorkflowActions'
import { listIntakeSubmissions } from '@/lib/intakeStore'
import { listProjects, listSites, listWorkspaces } from '@/lib/platformStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminClientsPage() {
  noStore()

  const [workspaces, projects, sites, intakes] = await Promise.all([
    listWorkspaces(),
    listProjects(),
    listSites(),
    listIntakeSubmissions(),
  ])

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Clients</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Each workspace represents one client account with projects, landing pages, and agent deployments.
      </p>

      <div style={panelStyle}>
        {workspaces.length === 0 ? (
          <p style={{ color: 'var(--giga-muted)' }}>No clients provisioned yet. New workspaces are created from paid intake.</p>
        ) : (
          <ul style={listStyle}>
            {workspaces.map((workspace) => {
              const workspaceProjects = projects.filter((project) => project.workspaceId === workspace.id)
              const workspaceSites = sites.filter((site) => site.workspaceId === workspace.id)
              const latestIntake = intakes.find((intake) => intake.workspaceId === workspace.id)
              const targetSite = workspaceSites.find((site) => site.publishStatus !== 'published') ?? workspaceSites[0] ?? null

              return (
                <li key={workspace.id} style={rowStyle}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{workspace.name}</p>
                  <p style={{ margin: '4px 0 0', color: 'var(--giga-muted)' }}>
                    slug: {workspace.slug} - status: {workspace.status}
                  </p>
                  <p style={{ margin: '4px 0 0', color: 'var(--giga-muted)' }}>
                    intake: {latestIntake?.lifecycleStatus ?? 'none'} - site: {targetSite?.publishStatus ?? 'none'}
                  </p>
                  <p style={{ margin: '4px 0 0', color: 'var(--giga-muted)' }}>
                    {workspaceProjects.length} projects - {workspaceSites.length} sites
                  </p>
                  <div style={{ marginTop: 8 }}>
                    <ClientWorkflowActions
                      workspaceId={workspace.id}
                      intakeId={latestIntake?.id}
                      intakeStatus={latestIntake?.lifecycleStatus}
                      siteId={targetSite?.id}
                      siteStatus={targetSite?.publishStatus}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Link href={`/admin/workspaces/${workspace.slug}`} style={labLinkStyle}>
                      View details
                    </Link>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Link href={`/workspaces/${workspace.slug}`} style={labLinkStyle}>
                      Open workspace app
                    </Link>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Link href={`/admin/workspaces/${workspace.slug}/hermes-lab`} style={labLinkStyle}>
                      Open Hermes lab
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
  display: 'block',
}

const labLinkStyle: React.CSSProperties = {
  textDecoration: 'none',
  color: 'var(--giga-text)',
  border: '1px solid var(--giga-border)',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 13,
  display: 'inline-block',
}
