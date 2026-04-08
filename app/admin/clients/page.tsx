import ClientWorkflowActions from '@/components/admin/ClientWorkflowActions'
import { listIntakeSubmissions } from '@/lib/intakeStore'
import { listProjects, listSites, listWorkspaces } from '@/lib/platformStore'

export default async function AdminClientsPage() {
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
