import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  getWorkspaceNavContextForUser,
  listTasksWithCustom,
} from "@/lib/workspaceStore";
import { listWorkspaceChannelsForUser } from "@/lib/teamChatStore";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { buildWorkspaceNavItems } from "@/lib/workspaceNav";
import { TasksWorkspace } from "@/components/workspace/tasks/TasksWorkspace";

type PageProps = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams?: Promise<{ view?: string; list?: string; mode?: string }>;
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
};

const pageTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 24,
  fontWeight: 700,
  color: "var(--workspace-text)",
};

const pageSubtitleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "var(--workspace-muted)",
};

const mainStyle: CSSProperties = {
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
  padding: "20px 28px 80px",
};

export default async function TasksPage({ params, searchParams }: PageProps) {
  const { workspaceSlug } = await params;
  const resolved = searchParams ? await searchParams : undefined;

  const user = await requireAuthenticatedUser(`/workspaces/${workspaceSlug}/tasks`);
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
    selectedTab: "tasks",
    snapshot: { objects, agents },
    queueCount,
    documentsObjectId: documentsObject?.id ?? null,
    teamChatChannelsCount: teamChatChannels.length,
    currentObjectId: null,
    currentRole: membership.role,
  });

  const tasksObjectId = tasksBundle.tasksObject?.id ?? null;
  const savedViews = tasksObjectId
    ? tasksBundle.tasksViews
        .filter((view) => view.scope !== "private" || view.createdByUserId === user.id)
        .map((view) => ({
          id: view.id,
          name: view.name,
          scope: view.scope,
          filterDsl: view.filterDsl,
          isPinned: view.isPinned,
          viewMode: view.viewMode,
          createdByUserId: view.createdByUserId,
        }))
    : [];

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
        <div style={headerWrapStyle}>
          <div style={headerInnerStyle}>
            <div>
              <Link href={`/workspaces/${workspaceSlug}`} style={breadcrumbStyle}>
                ← {workspace.name}
              </Link>
              <h1 style={pageTitleStyle}>Tareas</h1>
              <p style={pageSubtitleStyle}>
                {tasksBundle.tasks.length} {tasksBundle.tasks.length === 1 ? "tarea" : "tareas"} ·{" "}
                {tasksBundle.lists.length} {tasksBundle.lists.length === 1 ? "lista" : "listas"}
              </p>
            </div>
          </div>
        </div>
        <main style={mainStyle}>
          <TasksWorkspace
            workspaceSlug={workspaceSlug}
            workspaceId={workspace.id}
            currentRole={membership.role}
            currentUserId={user.id}
            initialBundle={tasksBundle}
            savedViews={savedViews}
            initialListId={resolved?.list ?? null}
            initialViewId={resolved?.view ?? null}
            initialMode={resolved?.mode ?? null}
          />
        </main>
      </div>
    </WorkspaceShell>
  );
}
