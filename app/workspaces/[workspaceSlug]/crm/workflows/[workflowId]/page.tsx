import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  deriveQueueItems,
  getWorkspaceSnapshotForUser,
} from "@/lib/workspaceStore";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listDashboardCardsForWorkspace } from "@/lib/platformStore";
import { listWorkspaceChannelsForUser } from "@/lib/teamChatStore";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { buildWorkspaceNavItems } from "@/lib/workspaceNav";
import { WorkflowBuilder, type WorkflowModel } from "@/components/workspace/crm/WorkflowBuilder";

type PageProps = {
  params: Promise<{ workspaceSlug: string; workflowId: string }>;
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
};

const breadcrumbStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--workspace-muted)",
  textDecoration: "none",
};

const titleStyle: CSSProperties = {
  margin: "6px 0 2px",
  fontSize: 24,
  fontWeight: 600,
  color: "var(--workspace-text)",
  letterSpacing: "-0.01em",
};

const subtitleStyle: CSSProperties = {
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

async function loadWorkflow(workspaceId: string, workflowId: string): Promise<WorkflowModel | null> {
  if (workflowId === "new") return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("workspace_workflows")
    .select("id, name, description, enabled, trigger, steps")
    .eq("workspace_id", workspaceId)
    .eq("id", workflowId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: (row.description as string | null) ?? null,
    enabled: Boolean(row.enabled),
    trigger: (row.trigger as WorkflowModel["trigger"]) ?? { type: "lead.created" },
    steps: Array.isArray(row.steps) ? (row.steps as WorkflowModel["steps"]) : [],
  };
}

async function loadTemplates(workspaceId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("workspace_templates")
    .select("id, name, channel")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });
  return (data ?? []).map((row) => ({
    id: String((row as { id: string }).id),
    name: String((row as { name: string }).name ?? ""),
    channel: ((row as { channel: string }).channel === "sms" || (row as { channel: string }).channel === "whatsapp"
      ? (row as { channel: string }).channel
      : "email") as "email" | "sms" | "whatsapp",
  }));
}

async function loadSequences(workspaceId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("workspace_sequences")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });
  return (data ?? []).map((row) => ({
    id: String((row as { id: string }).id),
    name: String((row as { name: string }).name ?? ""),
  }));
}

export default async function WorkflowDetailPage({ params }: PageProps) {
  const { workspaceSlug, workflowId } = await params;
  const user = await requireAuthenticatedUser(`/workspaces/${workspaceSlug}/crm/workflows/${workflowId}`);
  const workspaceResult = await getWorkspaceSnapshotForUser(workspaceSlug, user.id, user.isPlatformAdmin);
  if (!workspaceResult) notFound();

  const { snapshot, membership } = workspaceResult;

  const [teamChatChannels, workflow, templates, sequences] = await Promise.all([
    listWorkspaceChannelsForUser(workspaceSlug, user.id, user.isPlatformAdmin),
    loadWorkflow(snapshot.workspace.id, workflowId),
    loadTemplates(snapshot.workspace.id),
    loadSequences(snapshot.workspace.id),
  ]);
  await listDashboardCardsForWorkspace(snapshot.workspace.id);

  if (workflowId !== "new" && !workflow) notFound();

  const documentsObject = snapshot.objects.find((object) => object.name === "Documents") ?? null;
  const queueCount = deriveQueueItems(snapshot.objects, snapshot.records, snapshot.tasks).length;

  const navItems = buildWorkspaceNavItems({
    workspaceSlug: snapshot.workspace.subdomain,
    selectedTab: "crm",
    snapshot: { objects: snapshot.objects, agents: snapshot.agents },
    queueCount,
    documentsObjectId: documentsObject?.id ?? null,
    teamChatChannelsCount: teamChatChannels.length,
    currentObjectId: null,
    currentRole: membership.role,
  });

  const canManage = user.isPlatformAdmin || membership.role === "admin";

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
            <Link href={`/workspaces/${workspaceSlug}/crm/workflows`} style={breadcrumbStyle}>
              ← Workflows
            </Link>
            <h1 style={titleStyle}>{workflow?.name ?? "Nuevo workflow"}</h1>
            <p style={subtitleStyle}>Configura el trigger y los pasos.</p>
          </div>
        </div>
        <main style={mainStyle}>
          <WorkflowBuilder
            workspaceSlug={workspaceSlug}
            canManage={canManage}
            initialWorkflow={workflow}
            templates={templates}
            sequences={sequences}
          />
        </main>
      </div>
    </WorkspaceShell>
  );
}
