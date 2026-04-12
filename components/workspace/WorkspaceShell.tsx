import Link from "next/link";
import { ShieldCheck } from "lucide-react";

type NavItem = {
  id: string;
  label: string;
  href: string;
  active?: boolean;
  badge?: number;
  hidden?: boolean;
};

type ContextRail = {
  headline: string;
  summary: string;
  bullets: string[];
};

type Props = {
  workspaceName: string;
  workspaceSlug: string;
  workspaceLogoUrl?: string | null;
  accentColor?: string | null;
  navItems: NavItem[];
  contextRail: ContextRail;
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
  const groupedItems = [
    {
      label: "Operate",
      items: navItems.filter((item) => ["home", "chat", "queue", "record"].includes(item.id) && !item.hidden),
    },
    {
      label: "Workspace",
      items: navItems.filter((item) => ["data", "agents"].includes(item.id) && !item.hidden),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="workspace-app">
      <div className="workspace-shell">
        <aside className="workspace-sidebar">
          <div className="workspace-brand">
            <p className="workspace-brand__eyebrow">Prisma workspace</p>
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
                <p className="workspace-brand__subtitle">{workspaceSlug}.prisma.com.mx</p>
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
                      <p className="workspace-nav__meta">
                        {item.id === "home" && "Overview, queue, suggestions"}
                        {item.id === "chat" && "CEO agent conversations"}
                        {item.id === "queue" && "Priority actions waiting"}
                        {item.id === "data" && "Dynamic views and saved filters"}
                        {item.id === "record" && "Context-rich record surface"}
                        {item.id === "agents" && "Permissions, jobs, activity"}
                      </p>
                    </div>
                    {typeof item.badge === "number" && item.badge > 0 ? (
                      <span className="workspace-pill workspace-pill--accent">{item.badge}</span>
                    ) : null}
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <div className="workspace-hero-note">
            <p className="workspace-card__eyebrow">Operating model</p>
            Database first. CEO agent for coordination. Worker agents for tightly scoped work.
          </div>

          {currentUserEmail ? (
            <div className="workspace-hero-note">
              <p className="workspace-card__eyebrow">Signed in</p>
              <div style={{ display: "grid", gap: 6 }}>
                <strong style={{ color: "#111827", fontSize: 14 }}>{currentUserEmail}</strong>
                <span style={{ color: "#6b7280", fontSize: 13 }}>
                  {currentRole ? `Workspace role: ${currentRole}` : "Workspace member"}
                </span>
              </div>
            </div>
          ) : null}
        </aside>

        <main className="workspace-main">
          <header className="workspace-header">
            <div className="workspace-header__copy">
              <p className="workspace-header__eyebrow">Premium operating layer</p>
              <h2 className="workspace-header__title">{workspaceName}</h2>
              <p className="workspace-header__description">
                Calm, high-signal surfaces for structured operations, agent supervision, and workspace design driven by
                the database model.
              </p>
            </div>

            <div className="workspace-header__actions">
              <div className="workspace-pill workspace-pill--neutral">
                <ShieldCheck size={14} />
                Human-supervised
              </div>
              <Link href="/admin" className="workspace-link workspace-button">
                Open admin
              </Link>
              <Link href="/workspaces" className="workspace-link workspace-button workspace-button--primary">
                All workspaces
              </Link>
              <form action="/logout" method="post">
                <button type="submit" className="workspace-button">
                  Sign out
                </button>
              </form>
            </div>
          </header>

          {children}
        </main>

        <aside className="workspace-rail">
          <p className="workspace-card__eyebrow">{contextRail.headline}</p>
          <div className="workspace-hero-stack">
            <div className="workspace-hero-note">{contextRail.summary}</div>
            <div className="workspace-panel">
              <div className="workspace-panel__header">
                <div>
                  <h3 className="workspace-panel__title">Visible system context</h3>
                  <p className="workspace-panel__description">
                    Agents should feel legible: what they can see, what they can change, and what still needs a human.
                  </p>
                </div>
              </div>
              <div className="workspace-panel__content">
                <div className="workspace-kv">
                  {contextRail.bullets.map((bullet) => (
                    <div key={bullet} className="workspace-kv__row">
                      <span className="workspace-kv__label">Signal</span>
                      <span className="workspace-kv__value">{bullet}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
