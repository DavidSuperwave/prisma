import ManualProjectCreator from '@/components/admin/ManualProjectCreator'
import { listTemplates, listWorkspaces } from '@/lib/platformStore'

export default async function AdminNewProjectPage() {
  const [workspaces, templates] = await Promise.all([listWorkspaces(), listTemplates()])

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>New Project</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Manually create a project for testing without using intake checkout. This can create workspace, site, and agent runtime metadata in one flow.
      </p>
      <ManualProjectCreator
        workspaces={workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
        }))}
        templates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          key: template.key,
        }))}
      />
    </section>
  )
}
