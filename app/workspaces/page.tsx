import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth";
import { listWorkspaceSummariesForUser } from "@/lib/workspaceStore";

export default async function WorkspacesIndexPage() {
  const user = await requireAuthenticatedUser("/workspaces");
  const workspaces = await listWorkspaceSummariesForUser(user.id, user.isPlatformAdmin);

  if (workspaces.length === 1) {
    return (
      <main className="workspace-index-page">
        <div className="workspace-index-header">
          <span className="workspace-index-kicker">Workspace</span>
          <h1>Selecciona tu espacio</h1>
          <p>{user.email ?? "Sesión activa"}</p>
        </div>

        <div className="workspace-index-grid">
          <Link key={workspaces[0].id} href={`/workspaces/${workspaces[0].subdomain}`} className="workspace-index-card">
            <div className="workspace-index-card-header">
              <div
                className="workspace-index-avatar"
                style={{ background: workspaces[0].primaryColor ?? "var(--workspace-accent)" }}
              >
                {workspaces[0].name.slice(0, 1)}
              </div>
              <span className="workspace-pill workspace-pill--neutral">
                {workspaces[0].planTier}
              </span>
            </div>
            <h2>{workspaces[0].name}</h2>
            <p>{String(workspaces[0].metadata.vertical ?? "Workspace").replace(/^\w/, (value) => value.toUpperCase())}</p>
            <span className="workspace-index-meta">
              {workspaces[0].agentLimit} agentes incluidos
            </span>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="workspace-index-page">
      <div className="workspace-index-header">
        <span className="workspace-index-kicker">Workspaces</span>
        <h1>Selecciona tu espacio</h1>
        <p>{user.email ?? "Sesión activa"} · {workspaces.length} espacios disponibles</p>
      </div>

      <div className="workspace-index-grid">
        {workspaces.map((workspace) => (
          <Link key={workspace.id} href={`/workspaces/${workspace.subdomain}`} className="workspace-index-card">
            <div className="workspace-index-card-header">
              <div
                className="workspace-index-avatar"
                style={{ background: workspace.primaryColor ?? "var(--workspace-accent)" }}
              >
                {workspace.name.slice(0, 1)}
              </div>
              <span className="workspace-pill workspace-pill--neutral">{workspace.planTier}</span>
            </div>
            <h2>{workspace.name}</h2>
            <p>{String(workspace.metadata.vertical ?? "Workspace").replace(/^\w/, (value) => value.toUpperCase())}</p>
            <span className="workspace-index-meta">{workspace.agentLimit} agentes incluidos</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
