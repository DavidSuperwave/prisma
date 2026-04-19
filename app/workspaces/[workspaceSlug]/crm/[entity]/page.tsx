import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { Database } from "lucide-react";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  deriveQueueItems,
  getCrmObject,
  getWorkspaceSnapshotForUser,
  listPipelineStages,
  listPipelines,
  listWorkspaceRecords,
  listWorkspaceViews,
  type PrismaCrmKind,
  type PrismaWorkspaceView,
} from "@/lib/workspaceStore";
import { listDashboardCardsForWorkspace } from "@/lib/platformStore";
import { listWorkspaceChannelsForUser } from "@/lib/teamChatStore";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { buildWorkspaceNavItems, type ActiveCrmEntity } from "@/lib/workspaceNav";
import { PeopleView } from "@/components/workspace/crm/PeopleView";
import { CompaniesView } from "@/components/workspace/crm/CompaniesView";
import { DealsView } from "@/components/workspace/crm/DealsView";
import { BootstrapCrmButton } from "@/components/workspace/crm/BootstrapCrmButton";
import { DemoDataBanner } from "@/components/workspace/crm/DemoDataBanner";

type PageProps = {
  params: Promise<{ workspaceSlug: string; entity: string }>;
  searchParams?: Promise<{
    view?: string;
    /** Drilldown filter for People (e.g. funnel stage from Reports). */
    stage?: string;
    /** Drilldown filter for Deals (pipeline stage id from Reports). */
    stage_id?: string;
    pipeline_id?: string;
  }>;
};

function mapSavedView(view: PrismaWorkspaceView) {
  return {
    id: view.id,
    name: view.name,
    scope: view.scope,
    filterDsl: view.filterDsl,
    isPinned: view.isPinned,
    viewMode: view.viewMode,
    createdByUserId: view.createdByUserId,
    columnConfig: view.columnConfig,
  };
}

const ENTITY_TO_KIND: Record<string, PrismaCrmKind> = {
  people: "crm_people",
  companies: "crm_companies",
  deals: "crm_deals",
};

const ENTITY_LABELS: Record<ActiveCrmEntity, string> = {
  people: "Personas",
  companies: "Empresas",
  deals: "Oportunidades",
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

const tabsWrapStyle: CSSProperties = {
  display: "inline-flex",
  gap: 6,
  padding: 4,
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-pill)",
  boxShadow: "0 1px 2px rgba(17, 24, 39, 0.04)",
};

function tabStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: "var(--radius-pill)",
    textDecoration: "none",
    color: active ? "var(--workspace-accent-strong)" : "var(--workspace-muted)",
    background: active ? "var(--workspace-accent-soft)" : "transparent",
    transition: "background 140ms ease, color 140ms ease",
    whiteSpace: "nowrap",
  };
}

const mainStyle: CSSProperties = {
  flex: 1,
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
  padding: "24px 28px 40px",
};

const panelStyle: CSSProperties = {
  padding: 24,
  background: "var(--workspace-surface)",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "0 12px 32px rgba(17, 24, 39, 0.05)",
};

const emptyCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 14,
  padding: "48px 32px",
  textAlign: "center",
  maxWidth: 520,
  margin: "0 auto",
};

const emptyIconStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 56,
  height: 56,
  borderRadius: "var(--radius-pill)",
  background: "var(--workspace-accent-soft)",
  color: "var(--workspace-accent-strong)",
};

const emptyTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const emptyBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "var(--workspace-muted)",
  lineHeight: 1.55,
};

export default async function CrmEntityListPage({ params, searchParams }: PageProps) {
  const { workspaceSlug, entity } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const viewParam = resolvedSearchParams?.view ?? null;
  const stageParam = resolvedSearchParams?.stage ?? null;
  const stageIdParam = resolvedSearchParams?.stage_id ?? null;
  const pipelineIdParam = resolvedSearchParams?.pipeline_id ?? null;
  const kind = ENTITY_TO_KIND[entity];
  if (!kind) notFound();

  const user = await requireAuthenticatedUser(`/workspaces/${workspaceSlug}/crm/${entity}`);
  const workspaceResult = await getWorkspaceSnapshotForUser(workspaceSlug, user.id, user.isPlatformAdmin);
  if (!workspaceResult) notFound();

  const { snapshot, membership } = workspaceResult;
  const activeCrmEntity = entity as ActiveCrmEntity;

  const [teamChatChannels] = await Promise.all([
    listWorkspaceChannelsForUser(workspaceSlug, user.id, user.isPlatformAdmin),
  ]);
  await listDashboardCardsForWorkspace(snapshot.workspace.id);

  const documentsObject = snapshot.objects.find((object) => object.name === "Documents") ?? null;
  const queueCount = deriveQueueItems(snapshot.objects, snapshot.records, snapshot.tasks).length;

  const [peopleObj, companiesObj, dealsObj] = await Promise.all([
    getCrmObject(snapshot.workspace.id, "crm_people"),
    getCrmObject(snapshot.workspace.id, "crm_companies"),
    getCrmObject(snapshot.workspace.id, "crm_deals"),
  ]);

  const crmObjectByKind: Record<string, string | null> = {
    crm_people: peopleObj?.id ?? null,
    crm_companies: companiesObj?.id ?? null,
    crm_deals: dealsObj?.id ?? null,
  };

  const entityByObjectId = new Map<string, "people" | "companies" | "deals">();
  if (peopleObj) entityByObjectId.set(peopleObj.id, "people");
  if (companiesObj) entityByObjectId.set(companiesObj.id, "companies");
  if (dealsObj) entityByObjectId.set(dealsObj.id, "deals");

  const allViews = await listWorkspaceViews(snapshot.workspace.id);
  const pinnedSmartViews = allViews
    .filter((view) => view.isPinned && entityByObjectId.has(view.objectId))
    .filter((view) => view.scope !== "private" || view.createdByUserId === user.id)
    .map((view) => ({
      id: view.id,
      name: view.name,
      entity: entityByObjectId.get(view.objectId)!,
    }));

  const navItems = buildWorkspaceNavItems(
    {
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
      pinnedSmartViews,
      activeViewId: viewParam,
    },
    activeCrmEntity,
  );

  const crmObject =
    kind === "crm_people" ? peopleObj : kind === "crm_companies" ? companiesObj : kind === "crm_deals" ? dealsObj : null;
  const canBootstrap = user.isPlatformAdmin || membership.role === "admin";

  if (!crmObject) {
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
                <Link href={`/workspaces/${workspaceSlug}`} style={breadcrumbStyle}>
                  ← {snapshot.workspace.name}
                </Link>
                <h1 style={pageTitleStyle}>CRM</h1>
                <p style={pageSubtitleStyle}>
                  Inicializa Personas, Empresas y Oportunidades.
                </p>
              </div>
            </div>
          </div>
          <main style={mainStyle}>
            <div style={panelStyle}>
              <div style={emptyCardStyle}>
                <span style={emptyIconStyle}>
                  <Database size={24} />
                </span>
                <h2 style={emptyTitleStyle}>CRM no está inicializado</h2>
                <p style={emptyBodyStyle}>
                  {canBootstrap
                    ? "Inicializa el CRM para crear las tablas core (Personas, Empresas, Oportunidades) con sus pipelines y campos."
                    : "Pide a un admin ejecutar el bootstrap de CRM para crear las tablas core."}
                </p>
                {canBootstrap ? <BootstrapCrmButton workspaceSlug={workspaceSlug} /> : null}
              </div>
            </div>
          </main>
        </div>
      </WorkspaceShell>
    );
  }

  const fields = snapshot.fields
    .filter((field) => field.objectId === crmObject.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const records = snapshot.records.filter((record) => record.objectId === crmObject.id);

  const [pipelines, pipelineStages] = await Promise.all([
    kind === "crm_deals" ? listPipelines(snapshot.workspace.id) : Promise.resolve([]),
    kind === "crm_deals" ? listPipelineStages(snapshot.workspace.id) : Promise.resolve([]),
  ]);

  const peopleObject = peopleObj;
  const companiesObject = companiesObj;
  const dealsObject = dealsObj;

  const peopleFromSnapshot = peopleObject
    ? snapshot.records.filter((record) => record.objectId === peopleObject.id)
    : [];
  const peopleRecords =
    peopleObject && kind === "crm_companies" && peopleFromSnapshot.length === 0
      ? await listWorkspaceRecords(snapshot.workspace.id, peopleObject.id)
      : peopleFromSnapshot;
  const companyRecords = companiesObject
    ? snapshot.records.filter((record) => record.objectId === companiesObject.id)
    : [];
  const dealRecords =
    dealsObject && kind === "crm_companies"
      ? await listWorkspaceRecords(snapshot.workspace.id, dealsObject.id)
      : [];

  const savedViewsForEntity = allViews
    .filter((view) => view.objectId === crmObject.id)
    .filter((view) => view.scope !== "private" || view.createdByUserId === user.id)
    .map(mapSavedView);
  void crmObjectByKind;

  const entityLabel = ENTITY_LABELS[activeCrmEntity] ?? crmObject.name;

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
              <Link href={`/workspaces/${workspaceSlug}`} style={breadcrumbStyle}>
                ← {snapshot.workspace.name}
              </Link>
              <h1 style={pageTitleStyle}>{entityLabel}</h1>
              <p style={pageSubtitleStyle}>
                {records.length} {records.length === 1 ? "registro" : "registros"}
              </p>
            </div>
            <nav aria-label="CRM" style={tabsWrapStyle}>
              {(["people", "companies", "deals"] as const).map((key) => (
                <Link
                  key={key}
                  href={`/workspaces/${workspaceSlug}/crm/${key}`}
                  style={tabStyle(key === entity)}
                >
                  {ENTITY_LABELS[key]}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <main style={mainStyle}>
          {user.isPlatformAdmin || membership.role === "admin" ? (
            <div style={{ marginBottom: 16 }}>
              <DemoDataBanner workspaceSlug={workspaceSlug} />
            </div>
          ) : null}
          <div style={panelStyle}>
            {kind === "crm_people" ? (
              <PeopleView
                workspaceSlug={workspaceSlug}
                records={records.map((r) => ({ id: r.id, data: r.data }))}
                fields={fields.map((f) => ({
                  id: f.id,
                  key: f.key,
                  name: f.name,
                  type: f.type,
                  isLocked: f.isLocked,
                }))}
                companies={companyRecords.map((c) => ({ id: c.id, data: c.data }))}
                canWrite={membership.role !== "viewer"}
                objectId={crmObject.id}
                savedViews={savedViewsForEntity}
                initialViewId={viewParam}
                canCreateOrgView={membership.role === "admin"}
                canManageFields={membership.role === "admin" || user.isPlatformAdmin}
                initialStageFilter={stageParam}
              />
            ) : null}
            {kind === "crm_companies" ? (
              <CompaniesView
                workspaceSlug={workspaceSlug}
                records={records.map((r) => ({ id: r.id, data: r.data }))}
                fields={fields.map((f) => ({
                  id: f.id,
                  key: f.key,
                  name: f.name,
                  type: f.type,
                  isLocked: f.isLocked,
                }))}
                canWrite={membership.role !== "viewer"}
                peopleRecords={peopleRecords.map((p) => ({ id: p.id, data: p.data }))}
                dealRecords={dealRecords.map((d) => ({ id: d.id, data: d.data }))}
                objectId={crmObject.id}
                savedViews={savedViewsForEntity}
                initialViewId={viewParam}
                canCreateOrgView={membership.role === "admin"}
                canManageFields={membership.role === "admin" || user.isPlatformAdmin}
              />
            ) : null}
            {kind === "crm_deals" ? (
              <DealsView
                workspaceSlug={workspaceSlug}
                records={records.map((r) => ({ id: r.id, data: r.data }))}
                fields={fields.map((f) => ({
                  id: f.id,
                  key: f.key,
                  name: f.name,
                  type: f.type,
                  isLocked: f.isLocked,
                }))}
                pipelines={pipelines.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault }))}
                pipelineStages={pipelineStages.map((s) => ({
                  id: s.id,
                  pipelineId: s.pipelineId,
                  name: s.name,
                  stageType: s.stageType,
                  probability: s.probability,
                  sortOrder: s.sortOrder,
                }))}
                people={peopleRecords.map((p) => ({ id: p.id, data: p.data }))}
                companies={companyRecords.map((c) => ({ id: c.id, data: c.data }))}
                canWrite={membership.role !== "viewer"}
                objectId={crmObject.id}
                savedViews={savedViewsForEntity}
                initialViewId={viewParam}
                canCreateOrgView={membership.role === "admin"}
                canManageFields={membership.role === "admin" || user.isPlatformAdmin}
                initialStageId={stageIdParam}
                initialPipelineId={pipelineIdParam}
              />
            ) : null}
          </div>
        </main>
      </div>
    </WorkspaceShell>
  );
}
