import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth";
import { listWorkspaceSummariesForUser } from "@/lib/workspaceStore";
import styles from "./workspaces-index.module.css";

export default async function WorkspacesIndexPage() {
  const user = await requireAuthenticatedUser("/workspaces");
  const workspaces = await listWorkspaceSummariesForUser(user.id);

  return (
    <main className={styles.workspaceIndexPage}>
      <section className={styles.workspaceIndexHeader}>
        <p className={styles.workspaceIndexKicker}>Prisma Workspace</p>
        <h1 className={styles.workspaceIndexTitle}>Selecciona un workspace para operar</h1>
        <p className={styles.workspaceIndexDescription}>
          Esta vista prioriza orientación y acción: entra al workspace correcto y continúa con la operación diaria.
        </p>
        <p className={styles.workspaceIndexMeta}>
          {user.email ?? "Sesión activa"} · {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"} accesibles
        </p>
      </section>

      {workspaces.length === 0 ? (
        <section className={styles.workspaceIndexEmpty}>
          <h2>Sin workspaces disponibles</h2>
          <p>
            Aún no hay espacios asignados a tu usuario. Pide acceso a un administrador para comenzar.
          </p>
          <Link href="/admin" className={styles.workspaceIndexEmptyCta}>
            Ir al panel admin
          </Link>
        </section>
      ) : (
        <section className={styles.workspaceIndexGrid}>
          {workspaces.map((workspace) => (
            <Link key={workspace.id} href={`/workspaces/${workspace.subdomain}`} className={styles.workspaceIndexCard}>
              <div className={styles.workspaceIndexCardHeader}>
                <span
                  className={styles.workspaceIndexColor}
                  style={{ background: workspace.primaryColor ?? "var(--color-accent)" }}
                />
                <span className={styles.workspaceIndexSubdomain}>{workspace.subdomain}</span>
              </div>
              <h2>{workspace.name}</h2>
              <p>
                {String(workspace.metadata.vertical ?? "Workspace").replace(/^\w/, (value) => value.toUpperCase())}
              </p>
              <span className={styles.workspaceIndexCardCta}>Abrir workspace</span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
