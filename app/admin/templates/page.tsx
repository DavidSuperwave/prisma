import { listTemplates } from '@/lib/platformStore'

export default async function AdminTemplatesPage() {
  const templates = await listTemplates()

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Templates</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Template registry turns landing pages into configurable data instead of one-repo-per-client forks.
      </p>

      <div style={panelStyle}>
        {templates.length === 0 ? (
          <p style={{ color: 'var(--giga-muted)' }}>No templates found.</p>
        ) : (
          <ul style={listStyle}>
            {templates.map((template) => (
              <li key={template.id} style={rowStyle}>
                <p style={{ margin: 0, fontWeight: 600 }}>{template.name}</p>
                <p style={{ margin: 0, color: 'var(--giga-muted)' }}>key: {template.key}</p>
                <p style={{ margin: 0, color: 'var(--giga-muted)' }}>vertical: {template.vertical ?? 'generic'}</p>
                <p style={{ margin: 0, color: 'var(--giga-muted)' }}>{template.sectionSchema.length} sections</p>
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
