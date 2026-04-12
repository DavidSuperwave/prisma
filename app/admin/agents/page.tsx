import { listAgents, listWorkspaces } from '@/lib/platformStore'

export default async function AdminAgentsPage() {
  const [agents, workspaces] = await Promise.all([listAgents(), listWorkspaces()])

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Agents</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Agent definitions describe role, model, tools, and integrations before deployment to isolated hErmes runtimes.
      </p>

      <div style={panelStyle}>
        {agents.length === 0 ? (
          <p style={{ color: 'var(--giga-muted)' }}>No agents defined yet.</p>
        ) : (
          <ul style={listStyle}>
            {agents.map((agent) => {
              const workspace = workspaces.find((entry) => entry.id === agent.workspaceId)
              return (
                <li key={agent.id} style={rowStyle}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{agent.name}</p>
                  <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{agent.role}</p>
                  <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{agent.model}</p>
                  <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{workspace?.name ?? agent.workspaceId}</p>
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
  gridTemplateColumns: '2fr 1.2fr 1.5fr 1.5fr',
  gap: 10,
  alignItems: 'center',
}
