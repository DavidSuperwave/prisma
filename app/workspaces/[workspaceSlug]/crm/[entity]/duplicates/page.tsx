import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  deriveQueueItems,
  getCrmObject,
  getWorkspaceSnapshotForUser,
  listWorkspaceViews,
  type PrismaCrmKind,
} from "@/lib/workspaceStore";
import { listWorkspaceChannelsForUser } from "@/lib/teamChatStore";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { buildWorkspaceNavItems, type ActiveCrmEntity } from "@/lib/workspaceNav";
import { DuplicatesPanel } from "@/components/workspace/crm/DuplicatesPanel";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type PageProps = {
  params: Promise<{ workspaceSlug: string; entity: string }>;
};

const ENTITY_TO_KIND: Record<string, PrismaCrmKind> = {
  people: "crm_people",
  companies: "crm_companies",
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
  maxWidth: 1080,
  margin: "0 auto",
};

const breadcrumbStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--workspace-muted)",
  textDecoration: "none",
};

const titleStyle: CSSProperties = {
  margin: "6px 0 2px",
  fontSize: 22,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const mainStyle: CSSProperties = {
  flex: 1,
  width: "100%",
  maxWidth: 1080,
  margin: "0 auto",
  padding: "24px 28px 40px",
};

const panelStyle: CSSProperties = {
  padding: 20,
  background: "var(--workspace-surface)",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-lg)",
};

type DuplicateCluster = {
  key: string;
  keyType: string;
  records: Array<{ id: string; data: Record<string, unknown>; createdAt: string }>;
};

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 && trimmed.includes("@") ? trimmed : null;
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^0-9+]/g, "");
  return digits.length >= 7 ? digits : null;
}

function normalizeDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  const cleaned = trimmed.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return cleaned.length > 0 && cleaned.includes(".") ? cleaned : null;
}

async function loadClusters(
  workspaceId: string,
  objectId: string,
  entity: "people" | "companies",
): Promise<DuplicateCluster[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("records")
    .select("id, data, created_at")
    .eq("workspace_id", workspaceId)
    .eq("object_id", objectId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) return [];

  const rows = (data ?? []) as Array<{ id: string; data: Record<string, unknown>; created_at: string }>;
  const clusters: DuplicateCluster[] = [];
  const claimed = new Set<string>();

  if (entity === "people") {
    const byEmail = new Map<string, typeof rows>();
    const byPhone = new Map<string, typeof rows>();
    for (const row of rows) {
      const email = normalizeEmail(row.data?.email);
      if (email) {
        if (!byEmail.has(email)) byEmail.set(email, []);
        byEmail.get(email)!.push(row);
      }
      const phone = normalizePhone(row.data?.phone);
      if (phone) {
        if (!byPhone.has(phone)) byPhone.set(phone, []);
        byPhone.get(phone)!.push(row);
      }
    }
    for (const [key, group] of byEmail.entries()) {
      if (group.length < 2) continue;
      clusters.push({
        key,
        keyType: "email",
        records: group.map((row) => ({ id: row.id, data: row.data, createdAt: row.created_at })),
      });
      group.forEach((row) => claimed.add(row.id));
    }
    for (const [key, group] of byPhone.entries()) {
      const remaining = group.filter((row) => !claimed.has(row.id));
      if (remaining.length < 2) continue;
      clusters.push({
        key,
        keyType: "phone",
        records: remaining.map((row) => ({ id: row.id, data: row.data, createdAt: row.created_at })),
      });
      remaining.forEach((row) => claimed.add(row.id));
    }
  } else {
    const byDomain = new Map<string, typeof rows>();
    const byName = new Map<string, typeof rows>();
    for (const row of rows) {
      const domain = normalizeDomain(row.data?.domain);
      if (domain) {
        if (!byDomain.has(domain)) byDomain.set(domain, []);
        byDomain.get(domain)!.push(row);
      }
      const name = typeof row.data?.name === "string" ? row.data.name.trim().toLowerCase() : null;
      if (name) {
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name)!.push(row);
      }
    }
    for (const [key, group] of byDomain.entries()) {
      if (group.length < 2) continue;
      clusters.push({
        key,
        keyType: "domain",
        records: group.map((row) => ({ id: row.id, data: row.data, createdAt: row.created_at })),
      });
      group.forEach((row) => claimed.add(row.id));
    }
    for (const [key, group] of byName.entries()) {
      const remaining = group.filter((row) => !claimed.has(row.id));
      if (remaining.length < 2) continue;
      clusters.push({
        key,
        keyType: "name",
        records: remaining.map((row) => ({ id: row.id, data: row.data, createdAt: row.created_at })),
      });
      remaining.forEach((row) => claimed.add(row.id));
    }
  }

  return clusters;
}

export default async function DuplicatesPage({ params }: PageProps) {
  const { workspaceSlug, entity } = await params;
  const kind = ENTITY_TO_KIND[entity];
  if (!kind) notFound();

  const user = await requireAuthenticatedUser(`/workspaces/${workspaceSlug}/crm/${entity}/duplicates`);
  const workspaceResult = await getWorkspaceSnapshotForUser(workspaceSlug, user.id, user.isPlatformAdmin);
  if (!workspaceResult) notFound();

  const { snapshot, membership } = workspaceResult;
  const activeCrmEntity = entity as ActiveCrmEntity;

  const [teamChatChannels, peopleObjNav, companiesObjNav, dealsObjNav] = await Promise.all([
    listWorkspaceChannelsForUser(workspaceSlug, user.id, user.isPlatformAdmin),
    getCrmObject(snapshot.workspace.id, "crm_people"),
    getCrmObject(snapshot.workspace.id, "crm_companies"),
    getCrmObject(snapshot.workspace.id, "crm_deals"),
  ]);
  const documentsObject = snapshot.objects.find((object) => object.name === "Documents") ?? null;
  const queueCount = deriveQueueItems(snapshot.objects, snapshot.records, snapshot.tasks).length;

  const crmEntityByObjectId = new Map<string, "people" | "companies" | "deals">();
  if (peopleObjNav) crmEntityByObjectId.set(peopleObjNav.id, "people");
  if (companiesObjNav) crmEntityByObjectId.set(companiesObjNav.id, "companies");
  if (dealsObjNav) crmEntityByObjectId.set(dealsObjNav.id, "deals");
  const allWorkspaceViews = crmEntityByObjectId.size > 0 ? await listWorkspaceViews(snapshot.workspace.id) : [];
  const pinnedSmartViews = allWorkspaceViews
    .filter((view) => view.isPinned && crmEntityByObjectId.has(view.objectId))
    .filter((view) => view.scope !== "private" || view.createdByUserId === user.id)
    .map((view) => ({
      id: view.id,
      name: view.name,
      entity: crmEntityByObjectId.get(view.objectId)!,
    }));

  const navItems = buildWorkspaceNavItems(
    {
      workspaceSlug: snapshot.workspace.subdomain,
      selectedTab: "crm",
      snapshot: { objects: snapshot.objects, agents: snapshot.agents },
      queueCount,
      documentsObjectId: documentsObject?.id ?? null,
      teamChatChannelsCount: teamChatChannels.length,
      currentObjectId: null,
      currentRole: membership.role,
      pinnedSmartViews,
    },
    activeCrmEntity,
  );

  const crmObject = await getCrmObject(snapshot.workspace.id, kind);
  if (!crmObject) notFound();

  const lockedFieldKeys = snapshot.fields
    .filter((field) => field.objectId === crmObject.id && field.isLocked)
    .map((field) => field.key);

  const clusters = await loadClusters(snapshot.workspace.id, crmObject.id, entity as "people" | "companies");

  const canMerge = membership.role === "admin" || user.isPlatformAdmin;

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
            <Link href={`/workspaces/${workspaceSlug}/crm/${entity}`} style={breadcrumbStyle}>
              ← {entity === "people" ? "Personas" : "Empresas"}
            </Link>
            <h1 style={titleStyle}>Duplicados</h1>
            <p style={{ margin: 0, fontSize: 13, color: "var(--workspace-muted)" }}>
              {clusters.length} clusters encontrados
            </p>
          </div>
        </div>
        <main style={mainStyle}>
          <div style={panelStyle}>
            <DuplicatesPanel
              workspaceSlug={workspaceSlug}
              entity={entity as "people" | "companies"}
              clusters={clusters}
              lockedFieldKeys={lockedFieldKeys}
              canMerge={canMerge}
            />
          </div>
        </main>
      </div>
    </WorkspaceShell>
  );
}
