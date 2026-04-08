import { listAdminUsers } from '@/lib/adminUsers'

export default async function AdminUsersPage() {
  const users = await listAdminUsers()

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Users</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Current platform users from Supabase Auth. Workspace membership controls are defined in schema and are the next UI step.
      </p>

      <div style={panelStyle}>
        {users.length === 0 ? (
          <p style={{ color: 'var(--giga-muted)' }}>No users found or Supabase admin auth is not configured.</p>
        ) : (
          <ul style={listStyle}>
            {users.map((user) => (
              <li key={user.id} style={rowStyle}>
                <p style={{ margin: 0, fontWeight: 600 }}>{user.email ?? '(no email)'}</p>
                <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{user.id}</p>
                <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{new Date(user.createdAt).toLocaleString()}</p>
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
  gridTemplateColumns: '1.5fr 2fr 1.2fr',
  gap: 10,
  alignItems: 'center',
}
