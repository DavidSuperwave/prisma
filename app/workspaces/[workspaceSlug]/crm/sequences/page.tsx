import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { Plus, Layers } from "lucide-react";
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

type PageProps = {
  params: Promise<{ workspaceSlug: string }>;
};

type Row = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  stepsCount: number;
  updatedAt: string;
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
  alignItems: "flex-end",
  justifyContent: "space-between",
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
};

const panelStyle: CSSProperties = {
  padding: 20,
  background: "var(--workspace-surface)",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "0 12px 32px rgba(17, 24, 39, 0.05)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 14px",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  background: "#ffffff",
  textDecoration: "none",
  color: "var(--workspace-text)",
};

const primaryBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0 14px",
  height: 34,
  fontSize: 13,
  fontWeight: 600,
  color: "#ffffff",
  background: "var(--workspace-accent)",
  border: "1px solid var(--workspace-accent)",
  borderRadius: "var(--radius-md)",
  textDecoration: "none",
};

async function listSequencesFor(workspaceId: string): Promise<Row[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("workspace_sequences")
    .select("id, name, description, enabled, steps, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "Secuencia"),
    description: (row.description as string | null) ?? null,
    enabled: Boolean(row.enabled),
    stepsCount: Array.isArray(row.steps) ? (row.steps as unknown[]).length : 0,
    updatedAt: String(row.updated_at),
  }));
}

export default async function SequencesListPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const user = await requireAuthenticatedUser(`/workspaces/${workspaceSlug}/crm/sequences`);
  const workspaceResult = await getWorkspaceSnapshotForUser(workspaceSlug, user.id, user.isPlatformAdmin);
  if (!workspaceResult) notFound();

  const { snapshot, membership } = workspaceResult;
  const [teamChatChannels, sequences] = await Promise.all([
    listWorkspaceChannelsForUser(workspaceSlug, user.id, user.isPlatformAdmin),
    listSequencesFor(snapshot.workspace.id),
  ]);
  await listDashboardCardsForWorkspace(snapshot.workspace.id);

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
            <div>
              <Link href={`/workspaces/${workspaceSlug}/crm/people`} style={breadcrumbStyle}>
                ← CRM
              </Link>
              <h1 style={titleStyle}>Secuencias</h1>
              <p style={{ margin: 0, fontSize: 13, color: "var(--workspace-muted)" }}>
                Cadencias multi-paso (email, SMS, WhatsApp, esperas).
              </p>
            </div>
            {canManage ? (
              <Link href={`/workspaces/${workspaceSlug}/crm/sequences/new`} style={primaryBtnStyle}>
                <Plus size={14} />
                Nueva secuencia
              </Link>
            ) : null}
          </div>
        </div>

        <main style={mainStyle}>
          <div style={panelStyle}>
            {sequences.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--workspace-muted)", margin: 0 }}>
                Sin secuencias todavía.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sequences.map((seq) => (
                  <Link
                    key={seq.id}
                    href={`/workspaces/${workspaceSlug}/crm/sequences/${seq.id}`}
                    style={rowStyle}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Layers size={16} color="var(--workspace-accent)" />
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <strong style={{ fontSize: 13 }}>{seq.name}</strong>
                        <span style={{ fontSize: 11, color: "var(--workspace-muted)" }}>
                          {seq.stepsCount} pasos
                        </span>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "4px 8px",
                        borderRadius: "var(--radius-pill)",
                        background: seq.enabled ? "rgba(16,185,129,0.15)" : "rgba(107,114,128,0.15)",
                        color: seq.enabled ? "#047857" : "#374151",
                        fontWeight: 600,
                      }}
                    >
                      {seq.enabled ? "Activa" : "Pausada"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </WorkspaceShell>
  );
}
