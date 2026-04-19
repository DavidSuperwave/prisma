import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { MessageSquare } from "lucide-react";
import {
  deriveQueueItems,
  getCrmObject,
  getWorkspaceSnapshotForUser,
  listActivityTypes,
  listPipelineStages,
  listPipelines,
  listWorkspaceRecords,
  type PrismaCrmKind,
} from "@/lib/workspaceStore";
import { requireAuthenticatedUser } from "@/lib/auth";
import { listWorkspaceChannelsForUser } from "@/lib/teamChatStore";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { AGENT_OPS_UI_ENABLED, buildWorkspaceNavItems, type ActiveCrmEntity } from "@/lib/workspaceNav";
import { ActivityTimeline } from "@/components/workspace/crm/ActivityTimeline";
import { RecordTasksPanel } from "@/components/workspace/crm/RecordTasksPanel";
import { EnrollInSequenceButton } from "@/components/workspace/crm/EnrollInSequenceButton";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type PageProps = {
  params: Promise<{ workspaceSlug: string; entity: string; recordId: string }>;
};

const ENTITY_TO_KIND: Record<string, PrismaCrmKind> = {
  people: "crm_people",
  companies: "crm_companies",
  deals: "crm_deals",
};

const ENTITY_TO_LABEL: Record<string, { singular: string; plural: string }> = {
  people: { singular: "Contacto", plural: "Personas" },
  companies: { singular: "Empresa", plural: "Empresas" },
  deals: { singular: "Oportunidad", plural: "Oportunidades" },
};

function formatCurrency(amount: unknown, currency: unknown) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  const currencyCode = typeof currency === "string" && currency.length > 0 ? currency.toUpperCase() : "USD";
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: currencyCode }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

type ChipTone = "success" | "info" | "danger" | "neutral";
function chipToneFor(value: string): ChipTone {
  const v = value.toLowerCase();
  if (v === "won" || v === "customer") return "success";
  if (v === "lost" || v === "unqualified") return "danger";
  if (v === "qualified" || v === "opportunity") return "info";
  return "neutral";
}
function chipStyle(tone: ChipTone): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 12px",
    borderRadius: "var(--radius-pill)",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "capitalize",
  };
  if (tone === "success") return { ...base, background: "rgba(66, 211, 139, 0.14)", color: "#0f8f52" };
  if (tone === "danger") return { ...base, background: "rgba(239, 68, 68, 0.14)", color: "#b91c1c" };
  if (tone === "info") return { ...base, background: "rgba(56, 189, 248, 0.14)", color: "#0369a1" };
  return { ...base, background: "rgba(17, 24, 39, 0.06)", color: "var(--workspace-text)" };
}

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

const titleStyle: CSSProperties = {
  margin: "8px 0 6px",
  fontSize: 26,
  fontWeight: 600,
  color: "var(--workspace-text)",
  letterSpacing: "-0.01em",
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  fontSize: 13,
  color: "var(--workspace-muted)",
};

const askButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  textDecoration: "none",
  boxShadow: "0 1px 2px rgba(17, 24, 39, 0.04)",
};

const mainStyle: CSSProperties = {
  flex: 1,
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
  padding: "24px 28px 40px",
  display: "grid",
  gap: 24,
  gridTemplateColumns: "minmax(280px, 320px) minmax(0, 1fr) minmax(280px, 320px)",
  alignItems: "start",
};

const columnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
  minWidth: 0,
};

const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 20,
  background: "var(--workspace-surface)",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "0 12px 32px rgba(17, 24, 39, 0.05)",
};

const panelHeaderStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 600,
  color: "var(--workspace-muted)",
};

const detailsListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
};

const detailRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px solid var(--workspace-border)",
};

const detailLabelStyle: CSSProperties = {
  flex: "0 0 auto",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontWeight: 600,
  color: "var(--workspace-muted)",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const detailValueStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--workspace-text)",
  textAlign: "right",
  overflowWrap: "anywhere",
};

const sysBadgeStyle: CSSProperties = {
  display: "inline-block",
  padding: "1px 6px",
  fontSize: 9,
  fontWeight: 600,
  background: "rgba(17, 24, 39, 0.08)",
  color: "var(--workspace-muted)",
  borderRadius: "var(--radius-pill)",
  letterSpacing: "0.03em",
};

const relatedCardLinkStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "10px 12px",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  textDecoration: "none",
};

const relatedLinkTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--workspace-text)",
};

const relatedLinkMetaStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--workspace-muted)",
};

export default async function CrmRecordPage({ params }: PageProps) {
  const { workspaceSlug, entity, recordId } = await params;
  const kind = ENTITY_TO_KIND[entity];
  if (!kind) notFound();

  const user = await requireAuthenticatedUser(`/workspaces/${workspaceSlug}/crm/${entity}/${recordId}`);
  const workspaceResult = await getWorkspaceSnapshotForUser(workspaceSlug, user.id, user.isPlatformAdmin);
  if (!workspaceResult) notFound();

  const { snapshot, membership } = workspaceResult;
  const crmObject = await getCrmObject(snapshot.workspace.id, kind);
  if (!crmObject) notFound();

  const record = snapshot.records.find((r) => r.id === recordId && r.objectId === crmObject.id);
  if (!record) notFound();

  const fields = snapshot.fields
    .filter((field) => field.objectId === crmObject.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const [activityTypes, pipelines, pipelineStages, peopleRecords, companyRecords, dealRecords] = await Promise.all([
    listActivityTypes(snapshot.workspace.id),
    kind === "crm_deals" ? listPipelines(snapshot.workspace.id) : Promise.resolve([]),
    kind === "crm_deals" ? listPipelineStages(snapshot.workspace.id) : Promise.resolve([]),
    kind === "crm_deals" || kind === "crm_companies"
      ? (async () => {
          const people = await getCrmObject(snapshot.workspace.id, "crm_people");
          return people ? listWorkspaceRecords(snapshot.workspace.id, people.id) : [];
        })()
      : Promise.resolve([]),
    kind === "crm_deals" || kind === "crm_people"
      ? (async () => {
          const companies = await getCrmObject(snapshot.workspace.id, "crm_companies");
          return companies ? listWorkspaceRecords(snapshot.workspace.id, companies.id) : [];
        })()
      : Promise.resolve([]),
    kind === "crm_people" || kind === "crm_companies"
      ? (async () => {
          const deals = await getCrmObject(snapshot.workspace.id, "crm_deals");
          return deals ? listWorkspaceRecords(snapshot.workspace.id, deals.id) : [];
        })()
      : Promise.resolve([]),
  ]);

  const label = ENTITY_TO_LABEL[entity];
  const title =
    (typeof record.data.full_name === "string" && record.data.full_name) ||
    (typeof record.data.name === "string" && record.data.name) ||
    (typeof record.data.title === "string" && record.data.title) ||
    "Registro";

  const rawStageValue =
    kind === "crm_deals"
      ? pipelineStages.find((stage) => stage.id === String(record.data.stage_id ?? ""))?.name ?? ""
      : typeof record.data.stage === "string"
        ? record.data.stage
        : "";
  const stageLabel = rawStageValue || "—";

  const pipelineLabel =
    kind === "crm_deals"
      ? pipelines.find((pipeline) => pipeline.id === String(record.data.pipeline_id ?? ""))?.name ?? "—"
      : null;

  const relatedDeals =
    kind !== "crm_deals"
      ? dealRecords.filter((deal) => {
          if (kind === "crm_people") {
            return deal.data.primary_contact_id === record.id;
          }
          if (kind === "crm_companies") {
            return deal.data.company_id === record.id;
          }
          return false;
        })
      : [];

  const relatedPeople =
    kind === "crm_companies"
      ? peopleRecords.filter((person) => person.data.company_id === record.id)
      : [];

  const linkedPerson =
    kind === "crm_deals" && typeof record.data.primary_contact_id === "string"
      ? peopleRecords.find((p) => p.id === record.data.primary_contact_id) ?? null
      : null;
  const linkedCompany =
    (kind === "crm_deals" || kind === "crm_people") && typeof record.data.company_id === "string"
      ? companyRecords.find((c) => c.id === record.data.company_id) ?? null
      : null;

  let sequenceOptions: Array<{ id: string; name: string }> = [];
  if (AGENT_OPS_UI_ENABLED) {
    const supabaseForSequences = getSupabaseAdmin();
    if (supabaseForSequences) {
      try {
        const { data } = await supabaseForSequences
          .from("workspace_sequences")
          .select("id, name")
          .eq("workspace_id", snapshot.workspace.id)
          .eq("enabled", true)
          .order("name", { ascending: true });
        sequenceOptions = (data ?? []).map((row) => ({
          id: String((row as { id: string }).id),
          name: String((row as { name: string }).name ?? ""),
        }));
      } catch {
        sequenceOptions = [];
      }
    }
  }

  const teamChatChannels = await listWorkspaceChannelsForUser(workspaceSlug, user.id, user.isPlatformAdmin);
  const documentsObject = snapshot.objects.find((object) => object.name === "Documents") ?? null;
  const queueCount = deriveQueueItems(snapshot.objects, snapshot.records, snapshot.tasks).length;
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
    },
    entity as ActiveCrmEntity,
  );

  const hasLinkedCompany = Boolean(linkedCompany);
  const hasLinkedPerson = Boolean(linkedPerson);
  const hasRelatedDeals = relatedDeals.length > 0;
  const hasRelatedPeople = relatedPeople.length > 0;
  const showRightColumn = hasLinkedCompany || hasLinkedPerson || hasRelatedDeals || hasRelatedPeople;

  const mainLayoutStyle: CSSProperties = showRightColumn
    ? mainStyle
    : {
        ...mainStyle,
        gridTemplateColumns: "minmax(280px, 320px) minmax(0, 1fr)",
      };

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
        <style>{`
          @media (max-width: 1100px) {
            .crm-record-main { grid-template-columns: 1fr !important; }
          }
        `}</style>
        <div style={headerWrapStyle}>
          <div style={headerInnerStyle}>
            <div style={{ minWidth: 0 }}>
              <Link
                href={`/workspaces/${workspaceSlug}/crm/${entity}`}
                style={breadcrumbStyle}
              >
                ← {label.plural}
              </Link>
              <h1 style={titleStyle}>{title}</h1>
              <div style={metaRowStyle}>
                <span>{label.singular}</span>
                <span style={{ color: "var(--workspace-border-strong)" }}>·</span>
                <span>Etapa:</span>
                <span style={chipStyle(chipToneFor(rawStageValue))}>{stageLabel}</span>
                {pipelineLabel ? (
                  <>
                    <span style={{ color: "var(--workspace-border-strong)" }}>·</span>
                    <span>Pipeline: <strong style={{ color: "var(--workspace-text)", fontWeight: 600 }}>{pipelineLabel}</strong></span>
                  </>
                ) : null}
              </div>
            </div>
            <Link
              href={`/workspaces/${workspaceSlug}?tab=chat&ask=record&record=${record.id}`}
              style={askButtonStyle}
            >
              <MessageSquare size={14} />
              Preguntar al agente
            </Link>
          </div>
        </div>

        <main className="crm-record-main" style={mainLayoutStyle}>
          <aside style={columnStyle}>
            {AGENT_OPS_UI_ENABLED && kind === "crm_people" && sequenceOptions.length > 0 ? (
              <EnrollInSequenceButton
                workspaceSlug={workspaceSlug}
                recordId={record.id}
                sequences={sequenceOptions}
                canManage={membership.role !== "viewer"}
              />
            ) : null}
            <section style={panelStyle}>
              <h2 style={panelHeaderStyle}>Detalles</h2>
              <dl style={detailsListStyle}>
                {fields.map((field) => {
                  const raw = record.data[field.key];
                  let display = raw === null || raw === undefined || raw === "" ? "—" : String(raw);
                  if (field.key === "amount" && kind === "crm_deals") {
                    display = formatCurrency(raw, record.data.currency);
                  }
                  if (field.key === "stage_id" && kind === "crm_deals") {
                    display = pipelineStages.find((s) => s.id === String(raw))?.name ?? display;
                  }
                  if (field.key === "pipeline_id" && kind === "crm_deals") {
                    display = pipelines.find((p) => p.id === String(raw))?.name ?? display;
                  }
                  if (field.key === "company_id" && linkedCompany) {
                    display =
                      typeof linkedCompany.data.name === "string" ? linkedCompany.data.name : display;
                  }
                  if (field.key === "primary_contact_id" && linkedPerson) {
                    display =
                      typeof linkedPerson.data.full_name === "string"
                        ? linkedPerson.data.full_name
                        : display;
                  }
                  const isMuted = display === "—";
                  return (
                    <div key={field.id} style={detailRowStyle}>
                      <dt style={detailLabelStyle}>
                        {field.name}
                        {field.isLocked ? <span style={sysBadgeStyle}>SYS</span> : null}
                      </dt>
                      <dd
                        style={{
                          ...detailValueStyle,
                          color: isMuted ? "var(--workspace-muted)" : "var(--workspace-text)",
                        }}
                      >
                        {display}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          </aside>

          <section style={columnStyle}>
            <div style={panelStyle}>
              <ActivityTimeline
                workspaceSlug={workspaceSlug}
                recordId={record.id}
                activityTypes={activityTypes.map((type) => ({
                  id: type.id,
                  key: type.key,
                  name: type.name,
                  icon: type.icon,
                }))}
                currentRole={membership.role}
              />
            </div>

            <div style={panelStyle}>
              <RecordTasksPanel
                workspaceSlug={workspaceSlug}
                recordId={record.id}
                objectId={crmObject.id}
                currentRole={membership.role}
              />
            </div>
          </section>

          {showRightColumn ? (
            <aside style={columnStyle}>
              {linkedCompany ? (
                <section style={panelStyle}>
                  <h3 style={panelHeaderStyle}>Empresa</h3>
                  <Link
                    href={`/workspaces/${workspaceSlug}/crm/companies/${linkedCompany.id}`}
                    style={relatedCardLinkStyle}
                  >
                    <span style={relatedLinkTitleStyle}>
                      {typeof linkedCompany.data.name === "string" ? linkedCompany.data.name : "Empresa"}
                    </span>
                    {typeof linkedCompany.data.domain === "string" ? (
                      <span style={relatedLinkMetaStyle}>{linkedCompany.data.domain}</span>
                    ) : null}
                  </Link>
                </section>
              ) : null}

              {linkedPerson ? (
                <section style={panelStyle}>
                  <h3 style={panelHeaderStyle}>Contacto principal</h3>
                  <Link
                    href={`/workspaces/${workspaceSlug}/crm/people/${linkedPerson.id}`}
                    style={relatedCardLinkStyle}
                  >
                    <span style={relatedLinkTitleStyle}>
                      {typeof linkedPerson.data.full_name === "string"
                        ? linkedPerson.data.full_name
                        : "Persona"}
                    </span>
                    {typeof linkedPerson.data.email === "string" ? (
                      <span style={relatedLinkMetaStyle}>{linkedPerson.data.email}</span>
                    ) : null}
                  </Link>
                </section>
              ) : null}

              {hasRelatedDeals ? (
                <section style={panelStyle}>
                  <h3 style={panelHeaderStyle}>Oportunidades ({relatedDeals.length})</h3>
                  <ul
                    style={{
                      listStyle: "none",
                      margin: 0,
                      padding: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {relatedDeals.slice(0, 10).map((deal) => (
                      <li key={deal.id}>
                        <Link
                          href={`/workspaces/${workspaceSlug}/crm/deals/${deal.id}`}
                          style={relatedCardLinkStyle}
                        >
                          <span style={relatedLinkTitleStyle}>
                            {typeof deal.data.title === "string" ? deal.data.title : "Oportunidad"}
                          </span>
                          <span style={relatedLinkMetaStyle}>
                            {formatCurrency(deal.data.amount, deal.data.currency)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {hasRelatedPeople ? (
                <section style={panelStyle}>
                  <h3 style={panelHeaderStyle}>Personas ({relatedPeople.length})</h3>
                  <ul
                    style={{
                      listStyle: "none",
                      margin: 0,
                      padding: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {relatedPeople.slice(0, 20).map((person) => (
                      <li key={person.id}>
                        <Link
                          href={`/workspaces/${workspaceSlug}/crm/people/${person.id}`}
                          style={relatedCardLinkStyle}
                        >
                          <span style={relatedLinkTitleStyle}>
                            {typeof person.data.full_name === "string" ? person.data.full_name : "Persona"}
                          </span>
                          {typeof person.data.email === "string" ? (
                            <span style={relatedLinkMetaStyle}>{person.data.email}</span>
                          ) : typeof person.data.phone === "string" ? (
                            <span style={relatedLinkMetaStyle}>{person.data.phone}</span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </aside>
          ) : null}
        </main>
      </div>
    </WorkspaceShell>
  );
}
