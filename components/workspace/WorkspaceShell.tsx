import Link from "next/link";
import {
  Activity,
  Bot,
  ChevronDown,
  Database,
  FolderOpen,
  Home,
  Inbox,
  Layers,
  MessageSquare,
  Upload,
  Users,
} from "lucide-react";

type NavItem = {
  id: string;
  label: string;
  href: string;
  meta?: string;
  metaTitle?: string;
  active?: boolean;
  badge?: number;
  hidden?: boolean;
  disabled?: boolean;
  children?: NavItem[];
};

type Props = {
  workspaceName: string;
  workspaceSlug: string;
  workspaceLogoUrl?: string | null;
  accentColor?: string | null;
  navItems: NavItem[];
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

function getNavIcon(itemId: string) {
  if (itemId === "datos") return Database;
  if (itemId.startsWith("object-")) return Layers;
  if (itemId === "home") return Home;
  if (itemId === "chat") return MessageSquare;
  if (itemId === "inbox") return Inbox;
  if (itemId === "agents") return Bot;
  if (itemId === "queue") return Activity;
  if (itemId === "documents") return FolderOpen;
  if (itemId === "team-chat") return Users;
  if (itemId === "import") return Upload;
  if (itemId === "crm" || itemId.startsWith("crm-")) return Users;
  return Database;
}

export function WorkspaceShell({
  workspaceName,
  workspaceSlug,
  workspaceLogoUrl,
  accentColor,
  navItems,
  currentRole,
  currentUserEmail,
  children,
}: Props) {
  function filterVisible(items: NavItem[]): NavItem[] {
    return items
      .filter((item) => !item.hidden)
      .map((item) =>
        item.children
          ? { ...item, children: filterVisible(item.children) }
          : item,
      );
  }
  const visibleItems = filterVisible(navItems);
  const userInitial = (currentUserEmail ?? workspaceName).slice(0, 1).toUpperCase();

  function renderNavItem(item: NavItem, nested = false) {
    if (item.children && item.children.length > 0) {
      return renderNavGroup(item);
    }
    const Icon = getNavIcon(item.id);
    const className = `workspace-nav__item ${nested ? "workspace-nav__item--nested" : ""} ${item.active ? "workspace-nav__item--active" : ""} ${item.disabled ? "workspace-nav__item--disabled" : ""}`.trim();
    const content = (
      <>
        <span className="workspace-nav__icon" aria-hidden="true">
          <Icon size={14} />
        </span>
        <div className="workspace-nav__item-text">
          <span className="workspace-nav__title">{item.label}</span>
          {item.meta ? (
            <span className="workspace-nav__meta" title={item.metaTitle ?? item.meta}>
              {item.meta}
            </span>
          ) : null}
        </div>
        {typeof item.badge === "number" && item.badge > 0 ? (
          <span className="workspace-pill workspace-pill--accent workspace-pill--nav">{item.badge}</span>
        ) : null}
      </>
    );

    if (item.disabled) {
      return (
        <div key={item.id} className={className} aria-disabled="true">
          {content}
        </div>
      );
    }

    return (
      <Link key={item.id} href={item.href} className={`workspace-link ${className}`}>
        {content}
      </Link>
    );
  }

  function renderNavGroup(item: NavItem) {
    const Icon = getNavIcon(item.id);
    const hasActiveChild =
      item.active || (item.children?.some((child) => child.active) ?? false);
    const summaryClassName = `workspace-nav__item workspace-nav__toggle ${hasActiveChild ? "workspace-nav__item--active" : ""}`.trim();
    return (
      <details key={item.id} className="workspace-nav__details" open={hasActiveChild}>
        <summary className={summaryClassName}>
          <span className="workspace-nav__icon" aria-hidden="true">
            <Icon size={14} />
          </span>
          <div className="workspace-nav__item-text">
            <span className="workspace-nav__title">{item.label}</span>
            {item.meta ? (
              <span className="workspace-nav__meta" title={item.metaTitle ?? item.meta}>
                {item.meta}
              </span>
            ) : null}
          </div>
          <ChevronDown size={14} className="workspace-nav__toggle-icon" />
        </summary>
        <ul className="workspace-nav__subgroup">
          {item.children?.map((child) => (
            <li key={child.id} className="workspace-nav__subgroup-item">
              {renderNavItem(child, true)}
            </li>
          ))}
        </ul>
      </details>
    );
  }

  return (
    <div className="workspace-app">
      <div className="workspace-shell">
        <aside className="workspace-sidebar">
          <Link
            href={`/workspaces/${workspaceSlug}?tab=home`}
            className={`workspace-link workspace-brand workspace-brand-link ${workspaceLogoUrl ? "workspace-brand--has-logo" : ""}`}
          >
            <div className="workspace-brand__row">
              <div
                className="workspace-brand__mark"
                style={{
                  background: accentColor ?? "var(--workspace-accent)",
                  color: "#ffffff",
                }}
              >
                {workspaceLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={workspaceLogoUrl}
                    alt=""
                    className="workspace-brand__mark-img"
                  />
                ) : (
                  <span className="workspace-brand__initial">{workspaceName.slice(0, 1)}</span>
                )}
              </div>
              <div className="workspace-brand__text">
                {workspaceLogoUrl ? (
                  <>
                    <span className="workspace-sr-only">{workspaceName}</span>
                    <span className="workspace-brand__subtitle" aria-hidden="true">
                      Espacio Prisma
                    </span>
                  </>
                ) : (
                  <>
                    <span className="workspace-brand__name">{workspaceName}</span>
                    <span className="workspace-brand__subtitle">Espacio Prisma</span>
                  </>
                )}
              </div>
            </div>
          </Link>

          <nav className="workspace-nav workspace-nav--rail">
            <div className="workspace-nav__group">
              <p className="workspace-nav__label">Navegación</p>
              {visibleItems.map((item) => renderNavItem(item))}
            </div>
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
                <form action="/logout" method="post">
                  <button type="submit" className="workspace-user-menu__button">
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </details>
          ) : null}
        </aside>

        <main className="workspace-main">{children}</main>
      </div>
    </div>
  );
}
