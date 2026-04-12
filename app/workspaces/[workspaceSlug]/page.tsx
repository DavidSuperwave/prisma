import {
  applyViewToRecords,
  deriveQueueItems,
  getWorkspaceSnapshot,
  getRecordFieldValue,
} from "@/lib/workspaceStore";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  AgentOverviewPanel,
  DatasetPanel,
  HomeOverviewPanel,
  QueuePanel,
  RecordDetailPanel,
} from "@/components/workspace/WorkspacePanels";

type PageProps = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ object?: string; view?: string; record?: string; tab?: string }>;
};

function formatAgentSummary(agents: Awaited<ReturnType<typeof getWorkspaceSnapshot>>["agents"]) {
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    type: agent.type,
    status: agent.status,
    description: agent.description,
    tools: agent.skills,
    read:
      Array.isArray(agent.knowledgeScope.read) ? (agent.knowledgeScope.read as string[]) : [],
    write:
      Array.isArray(agent.knowledgeScope.write) ? (agent.knowledgeScope.write as string[]) : [],
    channels:
      Array.isArray(agent.knowledgeScope.channels) ? (agent.knowledgeScope.channels as string[]) : [],
    cronJobs: agent.cronJobs,
    memoryLabel: `${agent.memoryLimitMb} MB`,
    soulMd: agent.soulMd,
    runtimeLabel: agent.containerName,
  }));
}

export default async function WorkspaceDetailPage({ params, searchParams }: PageProps) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const snapshot = await getWorkspaceSnapshot(workspaceSlug);

  if (!snapshot) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32 }}>
        <div style={{ maxWidth: 520 }}>
          <p style={{ fontSize: 14, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Prisma workspace
          </p>
          <h1 style={{ marginTop: 12, fontSize: "2.4rem", lineHeight: 1.1 }}>Workspace not found</h1>
          <p style={{ marginTop: 12, color: "#4B5563" }}>
            Seed the demo workspace first, then return to this route.
          </p>
        </div>
      </div>
    );
  }

  const currentObject =
    snapshot.objects.find((object) => object.id === query.object) ?? snapshot.objects[0] ?? null;
  const currentView =
    snapshot.views.find((view) => view.id === query.view && view.objectId === currentObject?.id) ??
    snapshot.views.find((view) => view.objectId === currentObject?.id) ??
    null;
  const currentRecords = currentObject
    ? applyViewToRecords(
        snapshot.records.filter((record) => record.objectId === currentObject.id),
        currentView,
      )
    : [];
  const selectedRecord =
    currentRecords.find((record) => record.id === query.record) ??
    snapshot.records.find((record) => record.id === query.record) ??
    currentRecords[0] ??
    null;
  const currentFields = currentObject
    ? snapshot.fields.filter((field) => field.objectId === currentObject.id)
    : [];
  const metrics = [
    {
      label: "Open queues",
      value: String(deriveQueueItems(snapshot.objects, snapshot.records).length),
      caption: "Items requiring operator action today.",
    },
    {
      label: "Live agents",
      value: String(snapshot.agents.filter((agent) => agent.status === "active").length),
      caption: "Specialists available in this workspace.",
    },
    {
      label: "Views",
      value: String(snapshot.views.length),
      caption: "Saved operational views generated from the meta-model.",
    },
    {
      label: "Records",
      value: String(snapshot.records.length),
      caption: "Structured rows powering the workspace.",
    },
  ];

  const queueItems = deriveQueueItems(snapshot.objects, snapshot.records);
  const selectedTab = query.tab ?? "home";

  let content = (
    <HomeOverviewPanel
      metrics={metrics}
      queueItems={queueItems}
      activity={snapshot.activity}
      suggestions={[
        "Review leads with missing underwriting documents before the afternoon handoff.",
        "Ask the CEO agent to draft a receivables view grouped by aging bucket.",
        "Deploy the WhatsApp intake specialist once the qualification script is finalized.",
      ]}
      agents={formatAgentSummary(snapshot.agents)}
    />
  );

  if (selectedTab === "data") {
    content = (
      <DatasetPanel
        objectName={currentObject?.name ?? "Dataset"}
        description={
          currentObject?.description ??
          "Data views are generated from workspace objects, fields, and saved views."
        }
        views={snapshot.views
          .filter((view) => !currentObject || view.objectId === currentObject.id)
          .map((view) => ({ id: view.id, name: view.name, isSelected: currentView?.id === view.id }))}
        records={currentRecords.map((record) => ({
          id: record.id,
          primaryLabel:
            (typeof getRecordFieldValue(record, "name") === "string" && String(getRecordFieldValue(record, "name"))) ||
            (typeof getRecordFieldValue(record, "company_name") === "string" &&
              String(getRecordFieldValue(record, "company_name"))) ||
            (typeof getRecordFieldValue(record, "document_name") === "string" &&
              String(getRecordFieldValue(record, "document_name"))) ||
            "Record",
          summary: currentFields
            .filter((field) => field.key !== "name" && field.key !== "company_name" && field.key !== "document_name")
            .slice(0, 3)
            .map((field) => ({
              label: field.name,
              value: String(getRecordFieldValue(record, field.key) ?? "—"),
            })),
          isSelected: selectedRecord?.id === record.id,
        }))}
        fieldLabels={currentFields.map((field) => field.name)}
      />
    );
  }

  if (selectedTab === "queue") {
    content = <QueuePanel queueItems={queueItems} />;
  }

  if (selectedTab === "record" && selectedRecord) {
    content = (
      <RecordDetailPanel
        title={
          (typeof getRecordFieldValue(selectedRecord, "name") === "string" &&
            String(getRecordFieldValue(selectedRecord, "name"))) ||
          (typeof getRecordFieldValue(selectedRecord, "company_name") === "string" &&
            String(getRecordFieldValue(selectedRecord, "company_name"))) ||
          (typeof getRecordFieldValue(selectedRecord, "document_name") === "string" &&
            String(getRecordFieldValue(selectedRecord, "document_name"))) ||
          "Record detail"
        }
        status={String(getRecordFieldValue(selectedRecord, "status") ?? "active")}
        owner={String(getRecordFieldValue(selectedRecord, "owner") ?? "Unassigned")}
        summary={
          currentObject?.description ??
          "The detail panel keeps key fields, history, and AI-generated context in one place."
        }
        fields={currentFields.map((field) => ({
          label: field.name,
          value: String(getRecordFieldValue(selectedRecord, field.key) ?? "—"),
          tone:
            field.key === "status"
              ? "positive"
              : field.key === "score" || field.key === "credit_days"
                ? "neutral"
                : undefined,
        }))}
        activity={snapshot.activity
          .slice(0, 6)
          .map((item) => ({
            title: item.action,
            detail:
              typeof item.details.title === "string"
                ? item.details.title
                : typeof item.details.recommendation === "string"
                  ? item.details.recommendation
                  : JSON.stringify(item.details),
            timestamp: new Date(item.createdAt).toLocaleString("es-MX"),
          }))}
      />
    );
  }

  if (selectedTab === "agents") {
    content = (
      <AgentOverviewPanel
        workspaceSlug={snapshot.workspace.subdomain}
        agents={formatAgentSummary(snapshot.agents)}
        activity={snapshot.activity}
      />
    );
  }

  return (
    <WorkspaceShell
      workspaceName={snapshot.workspace.name}
      workspaceSlug={snapshot.workspace.subdomain}
      accentColor={snapshot.workspace.primaryColor}
      navItems={[
        { id: "home", label: "Home", href: `/workspaces/${snapshot.workspace.subdomain}?tab=home`, active: selectedTab === "home" },
        {
          id: "queue",
          label: "Queue",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=queue`,
          badge: queueItems.length,
          active: selectedTab === "queue",
        },
        {
          id: "data",
          label: currentObject?.name ?? "Data",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=data${currentObject ? `&object=${currentObject.id}` : ""}${currentView ? `&view=${currentView.id}` : ""}`,
          active: selectedTab === "data",
        },
        {
          id: "record",
          label: "Record detail",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=record${currentObject ? `&object=${currentObject.id}` : ""}${selectedRecord ? `&record=${selectedRecord.id}` : ""}`,
          active: selectedTab === "record",
        },
        {
          id: "agents",
          label: "Agents",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=agents`,
          active: selectedTab === "agents",
        },
      ]}
      contextRail={{
        headline: "CEO agent context",
        summary:
          "The workspace shell keeps agent scope, queue pressure, and recent activity visible so operators always know what the system is doing.",
        bullets: [
          `${snapshot.objects.length} objects rendered from the meta-model`,
          `${snapshot.agents.length} visible agents with scoped permissions`,
          `${snapshot.activity.length} recent activity entries`,
        ],
      }}
    >
      {content}
    </WorkspaceShell>
  );
}
