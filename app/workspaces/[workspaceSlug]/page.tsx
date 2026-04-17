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
  ActivityPanel,
  AgentOverviewPanel,
  ChannelsPanel,
  ChatPanel,
  DatasetPanel,
  FieldsPanel,
  HomeOverviewPanel,
  ImportPanel,
  QueuePanel,
  RecordDetailPanel,
  TeamChatPanel,
} from "@/components/workspace/panels";
import { requireAuthenticatedUser } from "@/lib/auth";

type PageProps = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    object?: string;
    view?: string;
    record?: string;
    tab?: string;
    ask?: string;
    prompt?: string;
    agent?: string;
  }>;
};

function formatAgentSummary(agents: Array<{
  id: string;
  name: string;
  type: "copilot" | "channel" | "worker";
  status: "active" | "paused" | "deploying" | "error";
  description: string | null;
  apiEndpoint: string;
  apiKey: string;
  skills: string[];
  knowledgeScope: Record<string, unknown>;
  cronJobs: unknown[];
  channelConfig: Record<string, unknown>;
  memoryLimitMb: number;
  soulMd: string | null;
  containerName: string;
}>) {
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    legacyRole:
      typeof agent.knowledgeScope.legacy_role === "string"
        ? agent.knowledgeScope.legacy_role
        : null,
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
    channelConfig: agent.channelConfig,
    memoryLabel: agent.memoryLimitMb > 0 ? "Activada" : "Desactivada",
    soulMd: agent.soulMd,
    runtimeLabel: agent.containerName,
    apiEndpoint: agent.apiEndpoint,
    apiKey: "",
    containerName: agent.containerName,
    lastHealthCheckAt:
      typeof agent.knowledgeScope.last_health_check_at === "string"
        ? agent.knowledgeScope.last_health_check_at
        : null,
    lastCronRunAt:
      typeof agent.knowledgeScope.last_cron_run_at === "string"
        ? agent.knowledgeScope.last_cron_run_at
        : null,
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
  if (action === "cron.executed") return "Cron ejecutado";
  if (action === "rate_offer.generated") return "Oferta generada";
  if (action === "rate_offer.approved") return "Oferta aprobada";
  if (action === "workspace.seeded") return "Workspace inicializado";
  return action.replace(/[._]/g, " ").replace(/^\w/, (value) => value.toUpperCase());
}

function formatActivityDetail(details: Record<string, unknown>) {
  if (typeof details.title === "string") {
    return details.title;
  }
  if (typeof details.offer === "string") {
    return details.offer;
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

function buildGreetingName(email: string | null, fallback: string) {
  const source = email?.split("@")[0] ?? fallback;
  return source
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
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
            Espacio Prisma
          </p>
          <h1 style={{ marginTop: 12, fontSize: "2.4rem", lineHeight: 1.1 }}>Espacio no disponible</h1>
          <p style={{ marginTop: 12, color: "#4B5563" }}>
            No tienes acceso a este espacio con tu sesión actual.
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
  const documentsObject = snapshot.objects.find((object) => object.name === "Documents") ?? null;
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
      value: String(deriveQueueItems(snapshot.objects, snapshot.records, snapshot.tasks).length),
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

  const queueItems = deriveQueueItems(snapshot.objects, snapshot.records, snapshot.tasks);
  const selectedTab = query.tab ?? "home";
  const objectNameCounts = snapshot.objects.reduce<Map<string, number>>((counts, object) => {
    counts.set(object.name, (counts.get(object.name) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const objectNameSeen = new Map<string, number>();
  const objectNavItems = snapshot.objects.map((object) => {
    const seenCount = (objectNameSeen.get(object.name) ?? 0) + 1;
    objectNameSeen.set(object.name, seenCount);
    const totalWithSameName = objectNameCounts.get(object.name) ?? 1;
    return {
      id: `object-${object.id}`,
      label: totalWithSameName > 1 ? `${object.name} ${seenCount}` : object.name,
      href: `/workspaces/${snapshot.workspace.subdomain}?tab=data&object=${object.id}`,
      meta:
        object.description ??
        (totalWithSameName > 1 ? `Objeto ${seenCount} de ${totalWithSameName}` : "Vista operativa"),
      active: selectedTab === "data" && currentObject?.id === object.id,
      hidden:
        object.name === "Documents" ||
        object.name === "Companies" ||
        object.name === "Leads" ||
        object.name === "Receivables",
    };
  });
  const copilot =
    (() => {
      const metadata =
        snapshot.workspace.metadata &&
        typeof snapshot.workspace.metadata === "object" &&
        !Array.isArray(snapshot.workspace.metadata)
          ? snapshot.workspace.metadata
          : {};
      const primaryCopilotId =
        typeof metadata.primary_copilot_agent_id === "string"
          ? metadata.primary_copilot_agent_id
          : null;
      const queryAgentId = typeof query.agent === "string" ? query.agent.trim() : "";
      const selectedFromQuery =
        queryAgentId.length > 0
          ? snapshot.agents.find((agent) => agent.id === queryAgentId) ?? null
          : null;

      if (selectedFromQuery) {
        return selectedFromQuery;
      }
      if (primaryCopilotId) {
        const primaryCopilot = snapshot.agents.find((agent) => agent.id === primaryCopilotId) ?? null;
        if (primaryCopilot) {
          return primaryCopilot;
        }
      }
      return (
        snapshot.agents.find((agent) => agent.type === "copilot" && agent.status === "active") ??
        snapshot.agents.find((agent) => agent.type === "copilot") ??
        snapshot.agents[0] ??
        null
      );
    })();
  const askPrompt =
    typeof query.prompt === "string" && query.prompt.trim().length > 0
      ? query.prompt.trim()
      : query.ask === "record" && selectedRecord
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
      greetingName={buildGreetingName(user.email, snapshot.workspace.name)}
      chatHref={`/workspaces/${snapshot.workspace.subdomain}?tab=chat`}
      recordBaseHref={`/workspaces/${snapshot.workspace.subdomain}?tab=record`}
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
        workspaceSlug={snapshot.workspace.subdomain}
        currentRole={membership.role}
        initialObjectId={query.object}
        initialViewId={query.view}
        recordBaseHref={`/workspaces/${snapshot.workspace.subdomain}?tab=record`}
      />
    );
  }

  if (selectedTab === "import") {
    content = (
      <ImportPanel
        workspaceSlug={snapshot.workspace.subdomain}
        objects={snapshot.objects}
        fields={snapshot.fields}
      />
    );
  }

  if (selectedTab === "fields") {
    content = (
      <FieldsPanel
        workspaceSlug={snapshot.workspace.subdomain}
        currentRole={membership.role}
        objects={snapshot.objects}
        fields={snapshot.fields}
      />
    );
  }

  if (selectedTab === "channels") {
    content = (
      <ChannelsPanel
        workspaceSlug={snapshot.workspace.subdomain}
        currentRole={membership.role}
        agents={formatAgentSummary(snapshot.agents)}
      />
    );
  }

  if (selectedTab === "activity") {
    content = (
      <ActivityPanel
        workspaceSlug={snapshot.workspace.subdomain}
        agents={snapshot.agents}
        initialActivity={snapshot.activity}
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
          {
            label: "Escenario: Close import",
            action: "scenario-close-import",
          },
          {
            label: "Escenario: análisis estacional",
            action: "scenario-seasonal-analysis",
          },
          {
            label: "Escenario: cotización",
            action: "scenario-quote-approval",
          },
          {
            label: "Escenario: agenda",
            action: "scenario-calendar-scheduling",
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
                "Registro seleccionado"
              : null,
          queueTitles: queueItems.slice(0, 5).map((item) => `${item.title} (${item.status})`),
        }}
        askPrompt={askPrompt}
        chatAgents={snapshot.agents.map((agent) => ({
          ...(() => {
            const explicitReadinessState =
              agent.knowledgeScope.readiness_state === "ready" || agent.knowledgeScope.readiness_state === "draft"
                ? (agent.knowledgeScope.readiness_state as "ready" | "draft")
                : null;
            const fallbackReady =
              Boolean(agent.apiEndpoint?.trim()) &&
              Boolean(agent.apiKey?.trim()) &&
              Boolean(agent.soulMd?.trim()) &&
              !agent.soulMd?.toLowerCase().includes("aún no configurado") &&
              !agent.soulMd?.toLowerCase().includes("aun no configurado");
            const readinessState = explicitReadinessState ?? (fallbackReady ? "ready" : "draft");
            const readinessIssues = Array.isArray(agent.knowledgeScope.readiness_issues)
              ? (agent.knowledgeScope.readiness_issues as string[])
              : fallbackReady
                ? []
                : ["configuration_incomplete"];
            return {
              readinessState,
              readinessIssues,
              isReadyForExecution:
                agent.status === "active" && readinessState === "ready" && readinessIssues.length === 0,
            };
          })(),
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: agent.status,
          description: agent.description,
          isPrimaryCopilot:
            typeof snapshot.workspace.metadata?.primary_copilot_agent_id === "string" &&
            snapshot.workspace.metadata.primary_copilot_agent_id === agent.id,
        }))}
        primaryAgentId={
          typeof snapshot.workspace.metadata?.primary_copilot_agent_id === "string"
            ? snapshot.workspace.metadata.primary_copilot_agent_id
            : copilot?.id ?? null
        }
        canSetPrimaryAgent={membership.role === "admin" || user.isPlatformAdmin}
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
        owner={String(getRecordFieldValue(selectedRecord, "owner") ?? "Sin asignar")}
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
        currentRole={membership.role}
        currentUserEmail={user.email}
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
          id: "home",
          label: "Inicio",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=home`,
          meta: "Resumen del dia",
          active: selectedTab === "home",
        },
        {
          id: "chat",
          label: "Chat",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=chat`,
          meta: "Conversaciones con agentes",
          active: selectedTab === "chat",
        },
        {
          id: "inbox",
          label: "Inbox",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=inbox`,
          meta: "Proximamente",
          disabled: true,
        },
        {
          id: "agents",
          label: "Agentes",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=agents`,
          meta: `${snapshot.agents.length} configurados`,
          active: selectedTab === "agents",
          hidden: membership.role === "viewer",
        },
        {
          id: "queue",
          label: "Cola operativa",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=queue`,
          badge: queueItems.length,
          meta: "Tareas que requieren accion",
          active: selectedTab === "queue",
        },
        {
          id: "documents",
          label: "Documentos",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=data&object=${documentsObject?.id ?? ""}`,
          meta: "Biblioteca y seguimiento documental",
          hidden: !documentsObject,
          active: selectedTab === "data" && currentObject?.id === (documentsObject?.id ?? ""),
        },
        {
          id: "fields",
          label: "Campos",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=fields`,
          meta: "Gestionar esquema",
          hidden: membership.role !== "admin",
          active: selectedTab === "fields",
        },
        {
          id: "channels",
          label: "Canales",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=channels`,
          meta: "WhatsApp",
          hidden: membership.role === "viewer",
          active: selectedTab === "channels",
        },
        {
          id: "activity",
          label: "Actividad",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=activity`,
          meta: "Feed filtrable",
          active: selectedTab === "activity",
        },
        {
          id: "team-chat",
          label: "Equipo",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=team-chat`,
          meta: `${teamChatChannels.length} canales`,
          active: selectedTab === "team-chat",
        },
        {
          id: "import",
          label: "Importar",
          href: `/workspaces/${snapshot.workspace.subdomain}?tab=import`,
          meta: "CSV / XLSX",
          hidden: membership.role === "viewer",
          active: selectedTab === "import",
        },
        ...objectNavItems,
      ]}
    >
      {content}
    </WorkspaceShell>
  );
}
