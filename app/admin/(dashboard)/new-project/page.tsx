import ManualProjectCreator from '@/components/admin/ManualProjectCreator'

export default async function AdminNewProjectPage() {
  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Create workspace</h1>
      <p style={{ color: 'var(--giga-muted)' }}>
        Enter the company name, choose how many agents to provision, and set the shared SOUL that should be projected into Hermes.
      </p>
      <ManualProjectCreator />
    </section>
  )
}
