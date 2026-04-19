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
import { SequenceBuilder, type SequenceModel } from "@/components/workspace/crm/SequenceBuilder";
import {
  SequenceEnrollmentPanel,
  type EnrollmentEntry,
} from "@/components/workspace/crm/SequenceEnrollmentPanel";

type PageProps = {
  params: Promise<{ workspaceSlug: string; sequenceId: string }>;
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
};

const mainStyle: CSSProperties = {
  flex: 1,
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
  padding: "24px 28px 40px",
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

async function loadSequence(workspaceId: string, sequenceId: string): Promise<SequenceModel | null> {
  if (sequenceId === "new") return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("workspace_sequences")
    .select("id, name, description, enabled, steps")
    .eq("workspace_id", workspaceId)
    .eq("id", sequenceId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: (row.description as string | null) ?? null,
    enabled: Boolean(row.enabled),
    steps: Array.isArray(row.steps) ? (row.steps as SequenceModel["steps"]) : [],
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

async function loadEnrollments(workspaceId: string, sequenceId: string): Promise<EnrollmentEntry[]> {
  if (sequenceId === "new") return [];
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("workspace_sequence_enrollments")
    .select("id, record_id, status, current_step, next_run_at, created_at")
    .eq("workspace_id", workspaceId)
    .eq("sequence_id", sequenceId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((row) => {
    const entry = row as Record<string, unknown>;
    return {
      id: String(entry.id),
      recordId: String(entry.record_id),
      status: ((entry.status as string) || "active") as EnrollmentEntry["status"],
      currentStep: Number(entry.current_step ?? 0),
      nextRunAt: (entry.next_run_at as string | null) ?? null,
      createdAt: String(entry.created_at),
    };
  });
}

export default async function SequenceDetailPage({ params }: PageProps) {
  const { workspaceSlug, sequenceId } = await params;
  const user = await requireAuthenticatedUser(`/workspaces/${workspaceSlug}/crm/sequences/${sequenceId}`);
  const workspaceResult = await getWorkspaceSnapshotForUser(workspaceSlug, user.id, user.isPlatformAdmin);
  if (!workspaceResult) notFound();

  const { snapshot, membership } = workspaceResult;
  const [teamChatChannels, sequence, templates, enrollments] = await Promise.all([
    listWorkspaceChannelsForUser(workspaceSlug, user.id, user.isPlatformAdmin),
    loadSequence(snapshot.workspace.id, sequenceId),
    loadTemplates(snapshot.workspace.id),
    loadEnrollments(snapshot.workspace.id, sequenceId),
  ]);
  await listDashboardCardsForWorkspace(snapshot.workspace.id);

  if (sequenceId !== "new" && !sequence) notFound();

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
            <Link href={`/workspaces/${workspaceSlug}/crm/sequences`} style={breadcrumbStyle}>
              ← Secuencias
            </Link>
            <h1 style={titleStyle}>{sequence?.name ?? "Nueva secuencia"}</h1>
          </div>
        </div>
        <main style={mainStyle}>
          <SequenceBuilder
            workspaceSlug={workspaceSlug}
            canManage={canManage}
            initialSequence={sequence}
            templates={templates}
          />
          {sequence?.id ? (
            <SequenceEnrollmentPanel
              workspaceSlug={workspaceSlug}
              sequenceId={sequence.id}
              canManage={canManage}
              initialEnrollments={enrollments}
            />
          ) : null}
        </main>
      </div>
    </WorkspaceShell>
  );
}
