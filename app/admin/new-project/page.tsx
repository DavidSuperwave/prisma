import ManualProjectCreator from '@/components/admin/ManualProjectCreator'
import { listTemplates, listWorkspaces } from '@/lib/platformStore'

export default async function AdminNewProjectPage() {
  const [workspaces, templates] = await Promise.all([listWorkspaces(), listTemplates()])

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Create workspace</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Provision the workspace shell, assign branding, and optionally prepare monitoring metadata for an initial runtime.
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
