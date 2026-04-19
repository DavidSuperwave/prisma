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
import { TemplatesPanel, type TemplateListEntry } from "@/components/workspace/crm/TemplatesPanel";

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

async function listTemplates(workspaceId: string): Promise<TemplateListEntry[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("workspace_templates")
    .select("id, name, channel, subject, body, variables, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => {
    const entry = row as {
      id: string;
      name: string;
      channel: string;
      subject: string | null;
      body: string;
      variables: unknown;
      updated_at: string;
    };
    return {
      id: entry.id,
      name: entry.name,
      channel: (entry.channel === "sms" || entry.channel === "whatsapp"
        ? entry.channel
        : "email") as TemplateListEntry["channel"],
      subject: entry.subject,
      body: entry.body ?? "",
      variables: Array.isArray(entry.variables) ? (entry.variables as string[]) : [],
      updatedAt: entry.updated_at,
    };
  });
}

export default async function TemplatesPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  const user = await requireAuthenticatedUser(`/workspaces/${workspaceSlug}/crm/templates`);
  const workspaceResult = await getWorkspaceSnapshotForUser(workspaceSlug, user.id, user.isPlatformAdmin);
  if (!workspaceResult) notFound();

  const { snapshot, membership } = workspaceResult;
  const [teamChatChannels, templates] = await Promise.all([
    listWorkspaceChannelsForUser(workspaceSlug, user.id, user.isPlatformAdmin),
    listTemplates(snapshot.workspace.id),
  ]);
  await listDashboardCardsForWorkspace(snapshot.workspace.id);

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
            <Link href={`/workspaces/${workspaceSlug}/crm/people`} style={breadcrumbStyle}>
              ← CRM
            </Link>
            <h1 style={titleStyle}>Plantillas</h1>
            <p style={subtitleStyle}>
              Plantillas de email, SMS y WhatsApp con variables de registro y oportunidad.
            </p>
          </div>
        </div>
        <main style={mainStyle}>
          <TemplatesPanel
            workspaceSlug={workspaceSlug}
            canManage={canManage}
            initialTemplates={templates}
          />
        </main>
      </div>
    </WorkspaceShell>
  );
}
