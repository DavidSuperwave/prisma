import {
  applyViewToRecords,
  deriveQueueItems,
  getWorkspaceSnapshotForUser,
  getRecordFieldValue,
} from "@/lib/workspaceStore";
import { listAgentTemplates, listDashboardCardsForWorkspace } from "@/lib/platformStore";
import { listDirectThreadsForUser, listMessagesForScope, listWorkspaceChannelsForUser } from "@/lib/teamChatStore";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  AgentOverviewPanel,
  ChatPanel,
  DatasetPanel,
  HomeOverviewPanel,
  QueuePanel,
  RecordDetailPanel,
  TeamChatPanel,
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
    memoryLabel: agent.memoryLimitMb > 0 ? "Activada" : "Desactivada",
    soulMd: agent.soulMd,
    runtimeLabel: agent.containerName,
  }));
}

function humanizeStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "pending") return "Pendiente";
  if (normalized === "needs_review") return "Revisar";
  if (normalized === "follow_up") return "Seguimiento";
  if (normalized === "pending_docs") return "Faltan documentos";
  if (normalized === "awaiting_approval") return "Esperando aprobacion";
  if (normalized === "active") return "Activo";
  if (normalized === "review") return "En revision";
  if (normalized === "blocked") return "Bloqueado";
  if (normalized === "qualified") return "Calificado";
  return status.replace(/_/g, " ");
}

function formatActivityTitle(action: string) {
  if (action === "receivable.flagged") return "Cobranza marcada para revision";
  if (action === "lead.qualified") return "Lead calificado";
  if (action === "document.uploaded_via_chat") return "Documento agregado desde chat";
  if (action === "workspace.seeded") return "Workspace inicializado";
  return action.replace(/[._]/g, " ").replace(/^\w/, (value) => value.toUpperCase());
}

function formatActivityDetail(details: Record<string, unknown>) {
  if (typeof details.title === "string") {
    return details.title;
  }
  if (typeof details.lead === "string") {
    return details.lead;
  }
  if (typeof details.debtor === "string") {
    return details.debtor;
  }
  if (typeof details.recommendation === "string") {
    return details.recommendation;
  }
  if (typeof details.next_step === "string") {
    return details.next_step;
  }

  const entries = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 3)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`);

  return entries.join(" · ") || "Actividad registrada";
}

export default async function WorkspaceDetailPage({ params, searchParams }: PageProps) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const user = await requireAuthenticatedUser(`/workspaces/${workspaceSlug}`);
  const workspaceResult = await getWorkspaceSnapshotForUser(workspaceSlug, user.id, user.isPlatformAdmin);
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

  const [dashboardCards, agentTemplates, teamChatChannels, teamChatDirectMessages, teamChatMessages] = await Promise.all([
    listDashboardCardsForWorkspace(snapshot.workspace.id),
    listAgentTemplates(),
    listWorkspaceChannelsForUser(workspaceSlug, user.id, user.isPlatformAdmin),
    listDirectThreadsForUser(workspaceSlug, user.id, user.isPlatformAdmin),
    listMessagesForScope({
      workspaceSlug,
      userId: user.id,
      isPlatformAdmin: user.isPlatformAdmin,
      channelId: undefined,
      directMessageId: undefined,
    }),
  ]);
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
      caption: "Items que requieren atencion hoy.",
    },
    {
      label: "Agentes activos",
      value: String(snapshot.agents.filter((agent) => agent.status === "active").length),
      caption: "Especialistas disponibles en este espacio.",
    },
    {
      label: "Vistas",
      value: String(snapshot.views.length),
      caption: "Vistas guardadas listas para operar.",
    },
    {
      label: "Registros",
      value: String(snapshot.records.length),
      caption: "Registros visibles en el workspace.",
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
      dashboardCards={dashboardCards.map((card) => ({
        id: card.id,
        cardType: card.cardType,
        title: card.title,
        subtitle: card.subtitle,
        gridWidth: card.gridWidth,
        config: card.config,
      }))}
      metrics={metrics}
      queueItems={queueItems}
      activity={snapshot.activity}
      suggestions={[
        "Revisa los leads que siguen sin documentos antes del cierre del dia.",
        "Pidele al CEO que prepare una vista por antiguedad de cartera.",
        "Confirma el flujo de WhatsApp antes de activar el siguiente agente.",
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
        recordBaseHref={`/workspaces/${snapshot.workspace.subdomain}?tab=record`}
      />
    );
  }

  if (selectedTab === "queue") {
    content = (
      <QueuePanel
        queueItems={queueItems}
        recordBaseHref={`/workspaces/${snapshot.workspace.subdomain}?tab=record`}
      />
    );
  }

  if (selectedTab === "chat") {
    content = (
      <ChatPanel
        workspaceId={snapshot.workspace.id}
        workspaceSlug={snapshot.workspace.subdomain}
        userId={user.id}
        connectedApps={[
          { label: "Supabase", status: "connected" as const },
          { label: "WhatsApp", status: snapshot.agents.some((agent) => agent.type === "channel") ? "connected" as const : "available" as const },
          { label: "Importaciones", status: snapshot.records.length > 0 ? "connected" as const : "available" as const },
        ]}
        quickActions={[
          {
            label: "Crear tabla",
            prompt: "Quiero crear una nueva tabla en este workspace. Ayudame a definir los campos antes de confirmarla.",
          },
          {
            label: "Crear dashboard",
            action: "bootstrap-dashboard",
          },
          {
            label: "Crear CRM",
            action: "bootstrap-crm",
          },
          {
            label: "Crear agente",
            href: `/workspaces/${snapshot.workspace.subdomain}?tab=agents`,
          },
        ]}
        suggestedPrompts={[
          queueItems.length
            ? `Revisa ${queueItems.length} items pendientes y dime cuales requieren atencion hoy.`
            : "Revisa el workspace y dime que bloqueos deberiamos atender primero.",
          currentObject
            ? `Resume el dataset ${currentObject.name} y sugiere la siguiente mejora operativa.`
            : "Propone la primera tabla que deberiamos crear en este workspace.",
          snapshot.records.length > 0
            ? "Busca datos estancados o registros sin seguimiento en los ultimos 7 dias."
            : "Prepara un plan para cargar mis datos iniciales al workspace.",
        ]}
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
                "Selected record"
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
          "Record detail"
        }
        status={String(getRecordFieldValue(selectedRecord, "status") ?? "active")}
        owner={String(getRecordFieldValue(selectedRecord, "owner") ?? "Unassigned")}
        summary={
          currentObject?.description ??
          "Este registro concentra contexto, responsables y trazabilidad operativa."
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
            title: formatActivityTitle(item.action),
            detail: formatActivityDetail(item.details),
            timestamp: new Date(item.createdAt).toLocaleString("es-MX"),
          }))}
      />
    );
  }

  if (selectedTab === "agents") {
    content = (
      <AgentOverviewPanel
        workspaceId={snapshot.workspace.id}
        workspaceSlug={snapshot.workspace.subdomain}
        agentLimit={snapshot.workspace.agentLimit}
        agentTemplates={agentTemplates}
        agents={formatAgentSummary(snapshot.agents)}
        activity={snapshot.activity}
      />
    );
  }

  if (selectedTab === "team-chat") {
    content = (
      <TeamChatPanel
        workspaceSlug={snapshot.workspace.subdomain}
        workspaceName={snapshot.workspace.name}
        currentUserEmail={user.email}
        channels={teamChatChannels}
        directMessages={teamChatDirectMessages}
        messages={teamChatMessages}
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
          meta: "Conversaciones con el CEO",
          active: selectedTab === "chat",
        },
        {
          id: "home",
          label: "Home",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=home`,
          meta: "Resumen del dia",
          active: selectedTab === "home",
        },
        {
          id: "queue",
          label: "Queue",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=queue`,
          badge: queueItems.length,
          meta: "Tareas que requieren accion",
          active: selectedTab === "queue",
        },
        ...snapshot.objects.map((object) => ({
          id: `object-${object.id}`,
          label: object.name,
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=data&object=${object.id}`,
          meta: object.description ?? "Vista operativa",
          active: selectedTab === "data" && currentObject?.id === object.id,
        })),
        {
          id: "agents",
          label: "Agents",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=agents`,
          meta: `${snapshot.agents.length} configurados`,
          active: selectedTab === "agents",
          hidden: membership.role === "viewer",
        },
        {
          id: "team-chat",
          label: "Team chat",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=team-chat`,
          meta: `${teamChatChannels.length} canales`,
          active: selectedTab === "team-chat",
        },
      ]}
      contextRail={
        selectedTab === "queue" || selectedTab === "team-chat"
          ? null
          : {
              headline: selectedTab === "agents" ? "Workspace agents" : selectedTab === "record" ? "Record context" : "Workspace context",
              summary:
                selectedTab === "agents"
                  ? `${snapshot.agents.filter((agent) => agent.status === "active").length} agentes activos y ${snapshot.workspace.agentLimit} permitidos en este plan.`
                  : selectedTab === "record"
                    ? "Estado, responsables y trazabilidad del registro actual."
                    : "Resumen rapido del estado operativo del workspace.",
              bullets:
                selectedTab === "record"
                  ? [
                      { label: "Estado", value: humanizeStatus(String(getRecordFieldValue(selectedRecord ?? currentRecords[0] ?? snapshot.records[0], "status") ?? "active")) },
                      { label: "Responsable", value: String(getRecordFieldValue(selectedRecord ?? currentRecords[0] ?? snapshot.records[0], "owner") ?? "Sin asignar") },
                      { label: "Actividad", value: `${snapshot.activity.length} acciones recientes` },
                    ]
                  : [
                      { label: "Plan", value: `${snapshot.workspace.planTier} · ${snapshot.agents.length}/${snapshot.workspace.agentLimit} agentes` },
                      { label: "Datos", value: `${snapshot.objects.length} tablas y ${snapshot.records.length} registros` },
                      { label: "Actividad", value: `${snapshot.activity.length} acciones recientes` },
                    ],
            }
      }
    >
      {content}
    </WorkspaceShell>
  );
}
