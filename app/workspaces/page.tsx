import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth";
import { listWorkspaceSummariesForUser } from "@/lib/workspaceStore";

export default async function WorkspacesIndexPage() {
  const user = await requireAuthenticatedUser("/workspaces");
  const workspaces = await listWorkspaceSummariesForUser(user.id);

  return (
    <main className="workspace-index-page">
      <div className="workspace-index-header">
        <span className="workspace-index-kicker">Prisma workspaces</span>
        <h1>Pick a live workspace to operate.</h1>
        <p>
          This is the first product surface for Prisma v2: a premium operational workspace rendered from the
          meta-model and backed by the real Supabase project.
        </p>
        <p style={{ color: "var(--workspace-muted)" }}>{user.email ?? "Signed in"} · {workspaces.length} accessible workspace(s)</p>
      </div>

      <div className="workspace-index-grid">
        {workspaces.map((workspace) => (
          <Link key={workspace.id} href={`/workspaces/${workspace.subdomain}`} className="workspace-index-card">
            <div className="workspace-index-card-header">
              <span
                className="workspace-index-color"
                style={{ background: workspace.primaryColor ?? "var(--workspace-accent)" }}
              />
              <span className="workspace-index-subdomain">{workspace.subdomain}</span>
            </div>
            <h2>{workspace.name}</h2>
            <p>{String(workspace.metadata.vertical ?? "Workspace").replace(/^\w/, (value) => value.toUpperCase())}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
