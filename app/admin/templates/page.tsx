import { listTemplates } from '@/lib/platformStore'

export default async function AdminTemplatesPage() {
  const templates = await listTemplates()

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Agent templates</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Catalog of reusable starting points that appear in each workspace when creating new agents.
      </p>

      <div style={panelStyle}>
        {templates.length === 0 ? (
          <p style={{ color: 'var(--giga-muted)' }}>No agent templates found.</p>
        ) : (
          <ul style={listStyle}>
            {templates.map((template) => (
              <li key={template.id} style={rowStyle}>
                <p style={{ margin: 0, fontWeight: 600 }}>{template.name}</p>
                <p style={{ margin: 0, color: 'var(--giga-muted)' }}>key: {template.key}</p>
                <p style={{ margin: 0, color: 'var(--giga-muted)' }}>category: {template.vertical ?? 'general'}</p>
                <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{template.sectionSchema.length} defaults</p>
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
  gridTemplateColumns: '2fr 1.5fr 1fr 1fr',
  gap: 10,
  alignItems: 'center',
}
