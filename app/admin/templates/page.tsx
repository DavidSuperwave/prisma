import AgentTemplateManager from '@/components/admin/AgentTemplateManager'
import { listAgentTemplates } from '@/lib/platformStore'

export default async function AdminTemplatesPage() {
  const templates = await listAgentTemplates()

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Agent templates</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Catalog of reusable starting points that appear in each workspace when creating new agents.
      </p>
      <AgentTemplateManager initialTemplates={templates} />
    </section>
  )
}
