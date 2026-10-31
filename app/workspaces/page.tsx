import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth";
import { listMemberWorkspaceSummariesOnly } from "@/lib/workspaceStore";

export default async function WorkspacesIndexPage() {
  const user = await requireAuthenticatedUser("/workspaces");

  if (user.isPlatformAdmin) {
    redirect("/admin");
  }

  const workspaces = await listMemberWorkspaceSummariesOnly(user.id);

  if (workspaces.length === 1) {
    redirect(`/workspaces/${workspaces[0].subdomain}`);
  }

  if (workspaces.length === 0) {
    return (
      <main className="workspace-index-page">
        <div className="workspace-index-header">
          <span className="workspace-index-kicker">Workspace</span>
          <h1>Sin acceso a un espacio</h1>
          <p>
            {user.email ?? "Sesión activa"} — no tenemos un espacio vinculado a tu cuenta. Pide a tu administrador que te
            invite al equipo o contacta a soporte.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="workspace-index-page">
      <div className="workspace-index-header">
        <span className="workspace-index-kicker">Workspaces</span>
        <h1>Selecciona tu espacio</h1>
        <p>
          {user.email ?? "Sesión activa"} · {workspaces.length} espacios disponibles
        </p>
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
