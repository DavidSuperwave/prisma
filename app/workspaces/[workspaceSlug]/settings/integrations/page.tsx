import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getWorkspaceNavContextForUser, listTasksWithCustom } from "@/lib/workspaceStore";
import { listWorkspaceChannelsForUser } from "@/lib/teamChatStore";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { buildWorkspaceNavItems } from "@/lib/workspaceNav";

type PageProps = {
  params: Promise<{ workspaceSlug: string }>;
};

export default async function IntegrationsSettingsPage({ params }: PageProps) {
  const { workspaceSlug } = await params;

  const user = await requireAuthenticatedUser(`/workspaces/${workspaceSlug}/settings/integrations`);
  const navContext = await getWorkspaceNavContextForUser(workspaceSlug, user.id, user.isPlatformAdmin);
  if (!navContext) notFound();
  const { membership, workspace, objects, agents } = navContext;

  const [teamChatChannels, tasksBundle] = await Promise.all([
    listWorkspaceChannelsForUser(workspaceSlug, user.id, user.isPlatformAdmin),
    listTasksWithCustom(workspace.id),
  ]);
  const documentsObject = objects.find((object) => object.name === "Documents") ?? null;
  const ACTIVE_QUEUE_STATUSES = new Set([
    "pending",
    "needs_review",
    "pending_docs",
    "follow_up",
    "blocked",
    "awaiting_approval",
    "in_progress",
  ]);
  const queueCount = tasksBundle.tasks.filter((task) =>
    ACTIVE_QUEUE_STATUSES.has(task.status.toLowerCase()),
  ).length;

  const navItems = buildWorkspaceNavItems({
    workspaceSlug: workspace.subdomain,
    selectedTab: "agents",
    snapshot: { objects, agents },
    queueCount,
    documentsObjectId: documentsObject?.id ?? null,
    teamChatChannelsCount: teamChatChannels.length,
    currentObjectId: null,
    currentRole: membership.role,
  });

  return (
    <WorkspaceShell
      workspaceName={workspace.name}
      workspaceSlug={workspace.subdomain}
      workspaceLogoUrl={workspace.logoUrl}
      accentColor={workspace.primaryColor}
      currentUserEmail={user.email}
      currentRole={membership.role}
      navItems={navItems}
    >
      <div style={pageRootStyle}>
        <main style={mainStyle}>
          <Link href={`/workspaces/${workspaceSlug}`} style={breadcrumbStyle}>
            ← {workspace.name}
          </Link>

          <section style={cardStyle}>
            <p style={eyebrowStyle}>Integraciones</p>
            <h1 style={titleStyle}>Configura desde el chat con tus operadores</h1>
            <p style={copyStyle}>
              Las skills, automatizaciones y llaves de API ahora se configuran conversando con tu agente.
              Pídele en lenguaje natural lo que necesitas (por ejemplo: <em>“guarda mi CLOSE_API_KEY”</em>,{" "}
              <em>“mándame un briefing diario a las 7am”</em> o{" "}
              <em>“cuando entre un lead, contesta por WhatsApp”</em>) y el operador te confirmará cada paso
              antes de aplicarlo. La persona del agente vive en su{" "}
              <a
                href="https://hermes-agent.nousresearch.com/docs/user-guide/features/personality"
                target="_blank"
                rel="noreferrer"
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                SOUL.md de Hermes
              </a>{" "}
              y se edita desde Operadores.
            </p>

            <div style={ctaRowStyle}>
              <Link href={`/workspaces/${workspaceSlug}?tab=agents`} style={primaryCtaStyle}>
                Abrir Operadores
              </Link>
              <Link href={`/workspaces/${workspaceSlug}?tab=chat`} style={secondaryCtaStyle}>
                Ir al chat principal
              </Link>
            </div>

            {user.isPlatformAdmin ? (
              <p style={adminNoticeStyle}>
                ¿Eres del equipo de plataforma? El laboratorio manual de integraciones se movió a{" "}
                <Link href={`/admin/workspaces/${workspaceSlug}/hermes-lab`} style={adminLinkStyle}>
                  /admin/workspaces/{workspaceSlug}/hermes-lab
                </Link>
                .
              </p>
            ) : null}
          </section>
        </main>
      </div>
    </WorkspaceShell>
  );
}

const pageRootStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: "100%",
  background: "var(--workspace-well, #f7f7f2)",
};

const mainStyle: CSSProperties = {
  width: "100%",
  maxWidth: 880,
  margin: "0 auto",
  padding: "20px 28px 80px",
  display: "grid",
  gap: 16,
};

const breadcrumbStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  fontSize: 12,
  color: "var(--workspace-muted)",
  textDecoration: "none",
};

const cardStyle: CSSProperties = {
  background: "var(--workspace-panel, #ffffff)",
  border: "1px solid var(--workspace-border, #e5e7eb)",
  borderRadius: 16,
  padding: 24,
  display: "grid",
  gap: 12,
  color: "var(--workspace-text, #111827)",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: 11,
  color: "var(--workspace-muted, #6b7280)",
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 22 };

const copyStyle: CSSProperties = {
  margin: 0,
  color: "var(--workspace-muted, #6b7280)",
  lineHeight: 1.5,
};

const ctaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 4,
};

const primaryCtaStyle: CSSProperties = {
  background: "var(--workspace-accent, #111827)",
  color: "var(--workspace-accent-contrast, #ffffff)",
  border: "1px solid var(--workspace-accent, #111827)",
  borderRadius: 10,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
};

const secondaryCtaStyle: CSSProperties = {
  background: "transparent",
  color: "var(--workspace-text, #111827)",
  border: "1px solid var(--workspace-border, #e5e7eb)",
  borderRadius: 10,
  padding: "8px 14px",
  fontSize: 13,
  textDecoration: "none",
};

const adminNoticeStyle: CSSProperties = {
  margin: 0,
  marginTop: 8,
  padding: "10px 12px",
  border: "1px dashed var(--workspace-border, #e5e7eb)",
  borderRadius: 10,
  background: "var(--workspace-panel-soft, #f9fafb)",
  fontSize: 12,
  color: "var(--workspace-muted, #6b7280)",
};

const adminLinkStyle: CSSProperties = {
  color: "var(--workspace-text, #111827)",
  textDecoration: "underline",
};
