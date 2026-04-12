import {
  applyViewToRecords,
  deriveQueueItems,
  getWorkspaceSnapshotForUser,
  getRecordFieldValue,
} from "@/lib/workspaceStore";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  AgentOverviewPanel,
  ChatPanel,
  DatasetPanel,
  HomeOverviewPanel,
  QueuePanel,
  RecordDetailPanel,
} from "@/components/workspace/WorkspacePanels";
import { requireAuthenticatedUser } from "@/lib/auth";

type PageProps = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ object?: string; view?: string; record?: string; tab?: string; ask?: string }>;
};

function formatAgentSummary(agents: Array<{
  id: string;
  name: string;
  type: "copilot" | "channel" | "worker";
  status: "active" | "paused" | "deploying" | "error";
  description: string | null;
  skills: string[];
  knowledgeScope: Record<string, unknown>;
  cronJobs: unknown[];
  memoryLimitMb: number;
  soulMd: string | null;
  containerName: string;
}>) {
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
  const user = await requireAuthenticatedUser(`/workspaces/${workspaceSlug}`);
  const workspaceResult = await getWorkspaceSnapshotForUser(workspaceSlug, user.id);
  const snapshot = workspaceResult?.snapshot ?? null;
  const membership = workspaceResult?.membership ?? null;

  if (!snapshot || !membership) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32 }}>
        <div style={{ maxWidth: 520 }}>
          <p style={{ fontSize: 14, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Prisma workspace
          </p>
          <h1 style={{ marginTop: 12, fontSize: "2.4rem", lineHeight: 1.1 }}>Workspace not available</h1>
          <p style={{ marginTop: 12, color: "#4B5563" }}>
            You do not have access to this workspace in the current session.
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
      label: "Pendientes",
      value: String(deriveQueueItems(snapshot.objects, snapshot.records).length),
      caption: "Items que requieren acción humana hoy.",
    },
    {
      label: "Agentes activos",
      value: String(snapshot.agents.filter((agent) => agent.status === "active").length),
      caption: "Especialistas disponibles en este workspace.",
    },
    {
      label: "Vistas",
      value: String(snapshot.views.length),
      caption: "Vistas operativas guardadas.",
    },
    {
      label: "Registros",
      value: String(snapshot.records.length),
      caption: "Filas estructuradas en operación.",
    },
  ];

  const queueItems = deriveQueueItems(snapshot.objects, snapshot.records);
  const selectedTab = query.tab ?? "home";
  const copilot = snapshot.agents.find((agent) => agent.type === "copilot") ?? snapshot.agents[0] ?? null;
  const askPrompt =
    query.ask === "record" && selectedRecord
      ? `Analiza el registro ${((typeof getRecordFieldValue(selectedRecord, "name") === "string" && String(getRecordFieldValue(selectedRecord, "name"))) || (typeof getRecordFieldValue(selectedRecord, "company_name") === "string" && String(getRecordFieldValue(selectedRecord, "company_name"))) || (typeof getRecordFieldValue(selectedRecord, "document_name") === "string" && String(getRecordFieldValue(selectedRecord, "document_name"))) || "seleccionado")} y dime que acciones humanas pendientes ves.`
      : query.ask === "dataset" && currentObject
        ? `Resume el dataset ${currentObject.name} y sugiere las siguientes acciones operativas.`
        : null;

  let content = (
    <HomeOverviewPanel
      metrics={metrics}
      queueItems={queueItems}
      activity={snapshot.activity}
      suggestions={[
        "Revisa los registros sin documentos completos antes del siguiente corte operativo.",
        "Pide al agente CEO una vista de cobranza agrupada por antigüedad.",
        "Confirma el flujo de WhatsApp para mantener la cola de entrada limpia.",
      ]}
      agents={formatAgentSummary(snapshot.agents)}
    />
  );

  if (selectedTab === "data") {
    content = (
      <DatasetPanel
        objects={snapshot.objects}
        fields={snapshot.fields}
        views={snapshot.views}
        records={snapshot.records}
        askHref={
          currentObject
            ? `/workspaces/${snapshot.workspace.subdomain}?tab=chat&ask=dataset&object=${currentObject.id}${currentView ? `&view=${currentView.id}` : ""}`
            : undefined
        }
      />
    );
  }

  if (selectedTab === "queue") {
    content = <QueuePanel queueItems={queueItems} />;
  }

  if (selectedTab === "chat") {
    content = (
      <ChatPanel
        workspaceId={snapshot.workspace.id}
        workspaceSlug={snapshot.workspace.subdomain}
        userId={user.id}
        contextSummary={{
          activeTab: selectedTab,
          activeObjectName: currentObject?.name ?? null,
          activeViewName: currentView?.name ?? null,
          activeRecordName:
            selectedRecord
              ? (typeof getRecordFieldValue(selectedRecord, "name") === "string" &&
                  String(getRecordFieldValue(selectedRecord, "name"))) ||
                (typeof getRecordFieldValue(selectedRecord, "company_name") === "string" &&
                  String(getRecordFieldValue(selectedRecord, "company_name"))) ||
                (typeof getRecordFieldValue(selectedRecord, "document_name") === "string" &&
                  String(getRecordFieldValue(selectedRecord, "document_name"))) ||
                "Registro seleccionado"
              : null,
          queueTitles: queueItems.slice(0, 5).map((item) => `${item.title} (${item.status})`),
        }}
        askPrompt={askPrompt}
        copilotAgent={
          copilot
            ? {
                id: copilot.id,
                name: copilot.name,
                status: copilot.status,
                description: copilot.description,
              }
            : null
        }
      />
    );
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
          "Detalle del registro"
        }
        status={String(getRecordFieldValue(selectedRecord, "status") ?? "active")}
        owner={String(getRecordFieldValue(selectedRecord, "owner") ?? "Sin responsable")}
        summary={
          currentObject?.description ??
          "El detalle reúne estado, responsable, campos clave y actividad para decidir rápido."
        }
        askHref={`/workspaces/${snapshot.workspace.subdomain}?tab=chat&ask=record${currentObject ? `&object=${currentObject.id}` : ""}${selectedRecord ? `&record=${selectedRecord.id}` : ""}`}
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
        agents={formatAgentSummary(snapshot.agents)}
        activity={snapshot.activity}
      />
    );
  }

  return (
    <WorkspaceShell
      workspaceName={snapshot.workspace.name}
      workspaceSlug={snapshot.workspace.subdomain}
      workspaceLogoUrl={snapshot.workspace.logoUrl}
      accentColor={snapshot.workspace.primaryColor}
      currentUserEmail={user.email}
      currentRole={membership.role}
      navItems={[
        {
          id: "chat",
          label: "Chat",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=chat`,
          active: selectedTab === "chat",
        },
        { id: "home", label: "Inicio", href: `/workspaces/${snapshot.workspace.subdomain}?tab=home`, active: selectedTab === "home" },
        {
          id: "queue",
          label: "Cola",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=queue`,
          badge: queueItems.length,
          active: selectedTab === "queue",
        },
        {
          id: "data",
          label: currentObject?.name ?? "Datos",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=data${currentObject ? `&object=${currentObject.id}` : ""}${currentView ? `&view=${currentView.id}` : ""}`,
          active: selectedTab === "data",
        },
        {
          id: "record",
          label: "Detalle",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=record${currentObject ? `&object=${currentObject.id}` : ""}${selectedRecord ? `&record=${selectedRecord.id}` : ""}`,
          active: selectedTab === "record",
        },
        {
          id: "agents",
          label: "Agentes",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=agents`,
          active: selectedTab === "agents",
          hidden: membership.role === "viewer",
        },
      ]}
      contextRail={{
        headline: "Contexto operativo",
        summary:
          "Resumen continuo de cobertura de agentes, carga pendiente y señales recientes del sistema.",
        bullets: [
          `${snapshot.objects.length} objetos activos en el modelo`,
          `${snapshot.agents.length} agentes visibles con alcance definido`,
          `${snapshot.activity.length} eventos recientes registrados`,
        ],
      }}
    >
      {content}
    </WorkspaceShell>
  );
}
