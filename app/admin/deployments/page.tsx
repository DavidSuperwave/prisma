import { listDeployments, listWorkspaces } from '@/lib/platformStore'

export default async function AdminDeploymentsPage() {
  const [deployments, workspaces] = await Promise.all([listDeployments(), listWorkspaces()])

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Deployments</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        One control plane can supervise multiple isolated OpenClaw containers on a shared droplet.
      </p>

      <div style={panelStyle}>
        {deployments.length === 0 ? (
          <p style={{ color: 'var(--giga-muted)' }}>No runtime deployments recorded yet.</p>
        ) : (
          <ul style={listStyle}>
            {deployments.map((deployment) => {
              const workspace = workspaces.find((entry) => entry.id === deployment.workspaceId)
              return (
                <li key={deployment.id} style={rowStyle}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{deployment.containerName}</p>
                  <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{deployment.status}</p>
                  <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{deployment.dropletHost}</p>
                  <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{workspace?.name ?? deployment.workspaceId}</p>
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
  gridTemplateColumns: '2fr 1fr 1.5fr 1.5fr',
  gap: 10,
  alignItems: 'center',
}
