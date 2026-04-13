import Link from "next/link";
import { ShieldCheck } from "lucide-react";

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

function truncateEmail(email: string) {
  if (email.length <= 24) {
    return email;
  }

  const [name, domain] = email.split("@");
  if (!domain) {
    return `${email.slice(0, 21)}...`;
  }

  return `${name.slice(0, 10)}...@${domain}`;
}

function formatRole(role?: string | null) {
  if (role === "admin") return "Admin del espacio";
  if (role === "operator") return "Operador";
  if (role === "viewer") return "Solo lectura";
  return "Miembro del espacio";
}

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
  const visibleItems = navItems.filter((item) => !item.hidden);
  const groupedItems = [
    {
      label: "Operar",
      items: visibleItems.filter((item) => ["home", "chat", "queue"].includes(item.id)),
    },
    {
      label: "Espacio",
      items: visibleItems.filter((item) => !["home", "chat", "queue"].includes(item.id)),
    },
  ].filter((group) => group.items.length > 0);
  const userInitial = (currentUserEmail ?? workspaceName).slice(0, 1).toUpperCase();

  return (
    <div className="workspace-app">
      <div className="workspace-shell">
        <aside className="workspace-sidebar">
          <div className="workspace-brand">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 16,
                  background: accentColor ?? "var(--workspace-accent)",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  boxShadow: "0 10px 24px rgba(51, 92, 255, 0.22)",
                  overflow: "hidden",
                }}
              >
                {workspaceLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={workspaceLogoUrl}
                    alt={`${workspaceName} logo`}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  workspaceName.slice(0, 1)
                )}
              </div>
              <div>
                <h1 className="workspace-brand__title">{workspaceName}</h1>
                <p className="workspace-brand__subtitle">Prisma workspace</p>
              </div>
            </div>
          </div>

          <nav className="workspace-nav">
            {groupedItems.map((group) => (
              <div key={group.label} className="workspace-nav__group">
                <p className="workspace-nav__label">{group.label}</p>
                {group.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`workspace-link workspace-nav__item ${item.active ? "workspace-nav__item--active" : ""}`}
                  >
                    <div>
                      <p className="workspace-nav__title">{item.label}</p>
                      {item.meta ? <p className="workspace-nav__meta">{item.meta}</p> : null}
                    </div>
                    {typeof item.badge === "number" && item.badge > 0 ? (
                      <span className="workspace-pill workspace-pill--accent">{item.badge}</span>
                    ) : null}
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          {currentUserEmail ? (
            <details className="workspace-user-menu">
              <summary className="workspace-user-menu__summary" title={currentUserEmail}>
                <span className="workspace-user-menu__avatar">{userInitial}</span>
                <span className="workspace-user-menu__email">{truncateEmail(currentUserEmail)}</span>
              </summary>
              <div className="workspace-user-menu__panel">
                <p className="workspace-user-menu__role">{formatRole(currentRole)}</p>
                <Link href="/workspaces" className="workspace-link workspace-user-menu__link">
                  Todos los workspaces
                </Link>
                {currentRole === "admin" ? (
                  <Link href="/admin" className="workspace-link workspace-user-menu__link">
                    Abrir admin
                  </Link>
                ) : null}
                <form action="/logout" method="post">
                  <button type="submit" className="workspace-user-menu__button">
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </details>
          ) : null}
        </aside>

        <main className="workspace-main">
          <header className="workspace-header">
            <div className="workspace-header__copy">
              <h2 className="workspace-header__title">{workspaceName}</h2>
            </div>

            <div className="workspace-header__actions">
              <div className="workspace-pill workspace-pill--neutral">
                <ShieldCheck size={14} />
                Supervisado por humanos
              </div>
            </div>
          </header>

          {children}
        </main>

        {contextRail ? (
          <aside className="workspace-rail">
            <div className="workspace-panel">
              <div className="workspace-panel__header">
                <div>
                  <h3 className="workspace-panel__title">{contextRail.headline}</h3>
                  {contextRail.summary ? <p className="workspace-panel__description">{contextRail.summary}</p> : null}
                </div>
              </div>
              <div className="workspace-panel__content">
                <div className="workspace-kv">
                  {contextRail.bullets.map((bullet) => (
                    <div key={`${bullet.label}-${bullet.value}`} className="workspace-kv__row">
                      <span className="workspace-kv__label">{bullet.label}</span>
                      <span className="workspace-kv__value">{bullet.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
