import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { CSSProperties } from "react";
import styles from "./workspace-shell.module.css";

type NavItem = {
  id: string;
  label: string;
  href: string;
  meta?: string;
  active?: boolean;
  badge?: number;
  hidden?: boolean;
};

type ContextRail = {
  headline: string;
  summary?: string;
  bullets: Array<{
    label: string;
    value: string;
  }>;
};

type Props = {
  workspaceName: string;
  workspaceSlug: string;
  workspaceLogoUrl?: string | null;
  accentColor?: string | null;
  navItems: NavItem[];
  contextRail?: ContextRail | null;
  currentRole?: string | null;
  currentUserEmail?: string | null;
  children: React.ReactNode;
};

export function WorkspaceShell({
  workspaceName,
  workspaceSlug,
  workspaceLogoUrl,
  accentColor,
  navItems,
  contextRail,
  currentRole,
  currentUserEmail,
  children,
}: Props) {
  const isDataItem = (item: NavItem) => item.id === "data" || item.id === "record" || item.id.startsWith("object-");
  const isSystemItem = (item: NavItem) => item.id === "agents" || item.id === "team-chat";
  const groupedItems = [
    {
      label: "OPERAR",
      items: navItems.filter((item) => ["home", "chat", "queue"].includes(item.id) && !item.hidden),
    },
    {
      label: "DATOS",
      items: navItems.filter((item) => isDataItem(item) && !item.hidden),
    },
    {
      label: "SISTEMA",
      items: navItems.filter((item) => isSystemItem(item) && !item.hidden),
    },
    {
      label: "OTROS",
      items: navItems.filter(
        (item) =>
          !["home", "chat", "queue"].includes(item.id) &&
          !isDataItem(item) &&
          !isSystemItem(item) &&
          !item.hidden,
      ),
    },
  ].filter((group) => group.items.length > 0);

  const itemMeta: Record<string, string> = {
    home: "🏠",
    chat: "💬",
    queue: "📋",
    data: "📄",
    record: "🧾",
    agents: "🤖",
  };

  const roleLabel = currentRole === "admin" ? "Administrador" : currentRole === "viewer" ? "Visualizador" : "Operador";
  const sidebarStyle: CSSProperties = {
    ["--workspace-accent-brand" as string]: accentColor ?? "var(--color-accent)",
  };

  return (
    <div className={styles.appShell}>
      <div className={styles.shellGrid}>
        <aside className={styles.sidebar} style={sidebarStyle}>
          <div className={styles.brand}>
            <p className={styles.brandEyebrow}>PRISMA WORKSPACE</p>
            <div className={styles.brandRow}>
              <div className={styles.brandAvatar}>
                {workspaceLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={workspaceLogoUrl}
                    alt={`${workspaceName} logo`}
                    className={styles.brandAvatarImage}
                  />
                ) : (
                  workspaceName.slice(0, 1)
                )}
              </div>
              <div>
                <h1 className={styles.brandTitle}>{workspaceName}</h1>
                <p className={styles.brandSubtitle}>{workspaceSlug}.prisma.com.mx</p>
                <p className={styles.brandPlan}>base · {roleLabel}</p>
              </div>
            </div>
          </div>

          <nav className={styles.nav}>
            {groupedItems.map((group) => (
              <div key={group.label} className={styles.navGroup}>
                <p className={styles.navLabel}>{group.label}</p>
                {group.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`${styles.navItem} ${item.active ? styles.navItemActive : ""}`}
                  >
                    <div className={styles.navContent}>
                      <span className={styles.navIcon}>{itemMeta[item.id] ?? "•"}</span>
                      <div>
                        <p className={styles.navTitle}>{item.label}</p>
                        {item.meta ? <p className={styles.navMeta}>{item.meta}</p> : null}
                      </div>
                    </div>
                    {typeof item.badge === "number" && item.badge > 0 ? (
                      <span className={styles.navBadge}>{item.badge}</span>
                    ) : null}
                  </Link>
                ))}
              </div>
            ))}

            {currentRole === "admin" ? (
              <div className={styles.navGroup}>
                <p className={styles.navLabel}>ADMIN</p>
                <Link href="/admin" className={styles.navItem}>
                  <div className={styles.navContent}>
                    <span className={styles.navIcon}>⚙️</span>
                    <p className={styles.navTitle}>Configuración</p>
                  </div>
                </Link>
              </div>
            ) : null}
          </nav>

          <div className={styles.sidebarBottom}>
            <div className={styles.sessionCard}>
              <p className={styles.cardEyebrow}>Sesión activa</p>
              <strong>{currentUserEmail ?? "Usuario autenticado"}</strong>
              <span>{roleLabel}</span>
            </div>
          </div>
        </aside>

        <main className={styles.content}>
          <header className={styles.header}>
            <div className={styles.headerCopy}>
              <p className={styles.headerEyebrow}>OPERACIÓN</p>
              <h2 className={styles.headerTitle}>{workspaceName}</h2>
              <p className={styles.headerDescription}>
                Donde estás, qué importa y qué sigue: estructura clara para operar sin ruido.
              </p>
            </div>

            <div className={styles.headerActions}>
              <div className={`${styles.pill} ${styles.pillStatus}`}>
                <ShieldCheck size={14} />
                Supervisado por humano
              </div>
              <Link href="/workspaces" className={`${styles.button} ${styles.buttonPrimary}`}>
                Cambiar workspace
              </Link>
              <form action="/logout" method="post">
                <button type="submit" className={styles.button}>
                  Cerrar sesión
                </button>
              </form>
            </div>
          </header>

          <section className={styles.pageBody}>{children}</section>
        </main>

        {contextRail ? (
          <aside className={styles.rail}>
            <p className={styles.cardEyebrow}>{contextRail.headline}</p>
            <div className={styles.railStack}>
              {contextRail.summary ? <div className={styles.railNote}>{contextRail.summary}</div> : null}
              <div className={styles.railPanel}>
                <div className={styles.railPanelHeader}>
                  <div>
                    <h3 className={styles.railPanelTitle}>Contexto visible</h3>
                    <p className={styles.railPanelDescription}>
                      Señales rápidas para entender estado, cobertura y carga operativa.
                    </p>
                  </div>
                </div>
                <div className={styles.railPanelContent}>
                  <div className={styles.kv}>
                    {contextRail.bullets.map((bullet) => (
                      <div key={`${bullet.label}-${bullet.value}`} className={styles.kvRow}>
                        <span className={styles.kvLabel}>{bullet.label}</span>
                        <span className={styles.kvValue}>{bullet.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
