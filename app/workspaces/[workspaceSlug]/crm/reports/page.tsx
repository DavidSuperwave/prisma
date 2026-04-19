import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { requireAuthenticatedUser } from "@/lib/auth";
import { deriveQueueItems, getWorkspaceSnapshotForUser } from "@/lib/workspaceStore";
import { listWorkspaceChannelsForUser } from "@/lib/teamChatStore";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { buildWorkspaceNavItems } from "@/lib/workspaceNav";
import { ReportsDashboard } from "@/components/workspace/crm/ReportsDashboard";
import { DemoDataBanner } from "@/components/workspace/crm/DemoDataBanner";

type PageProps = {
  params: Promise<{ workspaceSlug: string }>;
};

const pageRootStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: "100%",
  background: "var(--workspace-well, #f7f7f2)",
};

const headerWrapStyle: CSSProperties = {
  background: "rgba(255, 255, 255, 0.9)",
  borderBottom: "1px solid var(--workspace-border)",
  padding: "20px 28px",
};

const headerInnerStyle: CSSProperties = {
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 16,
};

const breadcrumbStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--workspace-muted)",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

const pageTitleStyle: CSSProperties = {
  margin: "6px 0 2px",
  fontSize: 24,
  fontWeight: 600,
  color: "var(--workspace-text)",
  letterSpacing: "-0.01em",
};

const pageSubtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "var(--workspace-muted)",
};

const mainStyle: CSSProperties = {
  flex: 1,
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
  padding: "24px 28px 40px",
};

export default async function CrmReportsPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const user = await requireAuthenticatedUser(`/workspaces/${workspaceSlug}/crm/reports`);
  const workspaceResult = await getWorkspaceSnapshotForUser(
    workspaceSlug,
    user.id,
    user.isPlatformAdmin,
  );
  if (!workspaceResult) notFound();

  const { snapshot, membership } = workspaceResult;

  const [teamChatChannels] = await Promise.all([
    listWorkspaceChannelsForUser(workspaceSlug, user.id, user.isPlatformAdmin),
  ]);

  const documentsObject = snapshot.objects.find((object) => object.name === "Documents") ?? null;
  const queueCount = deriveQueueItems(snapshot.objects, snapshot.records, snapshot.tasks).length;

  const navItems = buildWorkspaceNavItems({
    workspaceSlug: snapshot.workspace.subdomain,
    selectedTab: "crm",
    snapshot: {
      objects: snapshot.objects,
      agents: snapshot.agents,
    },
    queueCount,
    documentsObjectId: documentsObject?.id ?? null,
    teamChatChannelsCount: teamChatChannels.length,
    currentObjectId: null,
    currentRole: membership.role,
  });

  return (
    <WorkspaceShell
      workspaceName={snapshot.workspace.name}
      workspaceSlug={snapshot.workspace.subdomain}
      workspaceLogoUrl={snapshot.workspace.logoUrl}
      accentColor={snapshot.workspace.primaryColor}
      currentUserEmail={user.email}
      currentRole={membership.role}
      navItems={navItems}
    >
      <div style={pageRootStyle}>
        <div style={headerWrapStyle}>
          <div style={headerInnerStyle}>
            <div>
              <Link href={`/workspaces/${workspaceSlug}/crm/people`} style={breadcrumbStyle}>
                ← CRM
              </Link>
              <h1 style={pageTitleStyle}>Reportes</h1>
              <p style={pageSubtitleStyle}>
                Pipeline, win rate, velocidad, forecast, actividad y funnel.
              </p>
            </div>
          </div>
        </div>

        <main style={mainStyle}>
          {user.isPlatformAdmin || membership.role === "admin" ? (
            <div style={{ marginBottom: 16 }}>
              <DemoDataBanner workspaceSlug={workspaceSlug} />
            </div>
          ) : null}
          <ReportsDashboard workspaceSlug={workspaceSlug} />
        </main>
      </div>
    </WorkspaceShell>
  );
}
