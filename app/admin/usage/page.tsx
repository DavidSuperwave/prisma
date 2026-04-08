import { listProvisioningJobs, listUsageEvents, listWorkspaces } from '@/lib/platformStore'

export default async function AdminUsagePage() {
  const [events, jobs, workspaces] = await Promise.all([listUsageEvents(undefined, 200), listProvisioningJobs(30), listWorkspaces()])

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Usage & Operations</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Event stream for intake, provisioning, publishing, and agent runtime operations.
      </p>

      <div style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Recent Usage Events</h2>
        {events.length === 0 ? (
          <p style={{ color: 'var(--giga-muted)' }}>No usage events yet.</p>
        ) : (
          <ul style={listStyle}>
            {events.map((event) => {
              const workspace = workspaces.find((entry) => entry.id === event.workspaceId)
              return (
                <li key={event.id} style={rowStyle}>
                  <p style={{ margin: 0 }}>{event.eventName}</p>
                  <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{event.source}</p>
                  <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{workspace?.name ?? event.workspaceId}</p>
                  <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{new Date(event.createdAt).toLocaleString()}</p>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Provisioning Queue</h2>
        {jobs.length === 0 ? (
          <p style={{ color: 'var(--giga-muted)' }}>No provisioning jobs queued.</p>
        ) : (
          <ul style={listStyle}>
            {jobs.map((job) => (
              <li key={job.id} style={rowStyle}>
                <p style={{ margin: 0 }}>{job.jobType}</p>
                <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{job.status}</p>
                <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{job.workspaceId ?? 'pending workspace'}</p>
                <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{new Date(job.createdAt).toLocaleString()}</p>
              </li>
            ))}
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
  gridTemplateColumns: '1.6fr 1fr 1.4fr 1.5fr',
  gap: 10,
  alignItems: 'center',
}
