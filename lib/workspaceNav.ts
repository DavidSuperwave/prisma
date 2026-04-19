// Feature flag: when false, human-facing UI for agent-operated surfaces
// (templates, workflows, sequences) is hidden from the sidebar.
// Routes, APIs, engines, pages, and builders remain intact so agents
// can still operate via the APIs. Flip to true to re-expose them.
export const AGENT_OPS_UI_ENABLED = false;

export type WorkspaceNavItem = {
  id: string;
  label: string;
  href: string;
  meta?: string;
  metaTitle?: string;
  active?: boolean;
  hidden?: boolean;
  badge?: number;
  disabled?: boolean;
  children?: WorkspaceNavItem[];
};

const NAV_META_MAX_LENGTH = 56;

function truncateMeta(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return undefined;
  if (normalized.length <= NAV_META_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, NAV_META_MAX_LENGTH - 1).trimEnd()}\u2026`;
}

export type PinnedSmartView = {
  id: string;
  name: string;
  entity: "people" | "companies" | "deals";
};

export type WorkspaceNavOptions = {
  workspaceSlug: string;
  selectedTab: string;
  snapshot: {
    objects: Array<{ id: string; name: string; description: string | null; kind: unknown }>;
    agents: Array<{ status: string; type?: string }>;
  };
  queueCount: number;
  documentsObjectId: string | null;
  teamChatChannelsCount: number;
  currentObjectId: string | null;
  currentRole: string;
  pinnedSmartViews?: PinnedSmartView[];
  activeViewId?: string | null;
};

export type ActiveCrmEntity = "people" | "companies" | "deals";

export function buildWorkspaceNavItems(
  options: WorkspaceNavOptions,
  activeCrmEntity?: ActiveCrmEntity,
): WorkspaceNavItem[] {
  const {
    workspaceSlug,
    selectedTab,
    snapshot,
    queueCount,
    documentsObjectId,
    teamChatChannelsCount,
    currentObjectId,
    currentRole,
    pinnedSmartViews = [],
    activeViewId = null,
  } = options;

  const pinnedNavItems: WorkspaceNavItem[] = pinnedSmartViews.map((view) => ({
    id: `crm-view-${view.id}`,
    label: view.name,
    href: `/workspaces/${workspaceSlug}/crm/${view.entity}?view=${view.id}`,
    meta: "Vista guardada",
    active: activeCrmEntity === view.entity && activeViewId === view.id,
  }));

  const objectNameCounts = snapshot.objects.reduce<Map<string, number>>((counts, object) => {
    counts.set(object.name, (counts.get(object.name) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const objectNameSeen = new Map<string, number>();
  const objectNavItems: WorkspaceNavItem[] = snapshot.objects.map((object) => {
    const seenCount = (objectNameSeen.get(object.name) ?? 0) + 1;
    objectNameSeen.set(object.name, seenCount);
    const totalWithSameName = objectNameCounts.get(object.name) ?? 1;
    const fullMeta =
      object.description ??
      (totalWithSameName > 1 ? `Objeto ${seenCount} de ${totalWithSameName}` : "Vista operativa");
    return {
      id: `object-${object.id}`,
      label: totalWithSameName > 1 ? `${object.name} ${seenCount}` : object.name,
      href: `/workspaces/${workspaceSlug}?tab=data&object=${object.id}`,
      meta: truncateMeta(fullMeta) ?? fullMeta,
      metaTitle: fullMeta,
      active: selectedTab === "data" && currentObjectId === object.id,
      hidden: object.name === "Documents" || object.kind !== null,
    };
  });

  const visibleObjectNavItems = objectNavItems.filter((o) => !o.hidden);
  const datosGroup: WorkspaceNavItem | null =
    visibleObjectNavItems.length === 0
      ? null
      : {
          id: "datos",
          label: "Datos",
          meta: `${visibleObjectNavItems.length} objetos`,
          href: visibleObjectNavItems[0]!.href,
          active: selectedTab === "data",
          children: visibleObjectNavItems,
        };

  return [
    {
      id: "home",
      label: "Inicio",
      href: `/workspaces/${workspaceSlug}?tab=home`,
      meta: "Resumen del dia",
      active: selectedTab === "home",
    },
    {
      id: "chat",
      label: "Chat",
      href: `/workspaces/${workspaceSlug}?tab=chat`,
      meta: "Conversaciones con agentes",
      active: selectedTab === "chat",
    },
    {
      id: "inbox",
      label: "Inbox",
      href: `/workspaces/${workspaceSlug}?tab=inbox`,
      meta: "Proximamente",
      disabled: true,
    },
    {
      id: "crm",
      label: "CRM",
      href: `/workspaces/${workspaceSlug}/crm/people`,
      meta: "Personas, Empresas y Oportunidades",
      active: selectedTab === "crm" || selectedTab === "fields" || activeCrmEntity != null,
      children: [
        {
          id: "crm-people",
          label: "Personas",
          href: `/workspaces/${workspaceSlug}/crm/people`,
          meta: "Contactos y prospectos",
          active: activeCrmEntity === "people",
        },
        {
          id: "crm-companies",
          label: "Empresas",
          href: `/workspaces/${workspaceSlug}/crm/companies`,
          meta: "Cuentas y empresas",
          active: activeCrmEntity === "companies",
        },
        {
          id: "crm-deals",
          label: "Oportunidades",
          href: `/workspaces/${workspaceSlug}/crm/deals`,
          meta: "Pipeline de ventas",
          active: activeCrmEntity === "deals",
        },
        ...pinnedNavItems,
        {
          id: "crm-reports",
          label: "Reportes",
          href: `/workspaces/${workspaceSlug}/crm/reports`,
          meta: "Pipeline, win rate y forecast",
        },
        {
          id: "crm-fields",
          label: "Campos",
          href: `/workspaces/${workspaceSlug}?tab=fields`,
          meta: "Gestionar esquema",
          hidden: currentRole !== "admin",
          active: selectedTab === "fields",
        },
        ...(AGENT_OPS_UI_ENABLED
          ? [
              {
                id: "crm-templates",
                label: "Plantillas",
                href: `/workspaces/${workspaceSlug}/crm/templates`,
                meta: "Email, SMS, WhatsApp",
                hidden: currentRole === "viewer",
              } as WorkspaceNavItem,
              {
                id: "crm-workflows",
                label: "Workflows",
                href: `/workspaces/${workspaceSlug}/crm/workflows`,
                meta: "Automatizaciones",
                hidden: currentRole === "viewer",
              } as WorkspaceNavItem,
              {
                id: "crm-sequences",
                label: "Secuencias",
                href: `/workspaces/${workspaceSlug}/crm/sequences`,
                meta: "Cadencias multi-paso",
                hidden: currentRole === "viewer",
              } as WorkspaceNavItem,
            ]
          : []),
      ],
    },
    {
      id: "tasks",
      label: "Tareas",
      href: `/workspaces/${workspaceSlug}/tasks`,
      meta: "Cola operativa, tablero y calendario",
      badge: queueCount,
      active: selectedTab === "tasks" || selectedTab === "queue",
    },
    {
      id: "agents",
      label: "Operadores",
      href: `/workspaces/${workspaceSlug}?tab=agents`,
      meta: `${snapshot.agents.length} configurados`,
      active: selectedTab === "agents",
      hidden: currentRole === "viewer",
    },
    ...(datosGroup ? [datosGroup] : []),
    {
      id: "documents",
      label: "Documentos",
      href: documentsObjectId
        ? `/workspaces/${workspaceSlug}?tab=data&object=${documentsObjectId}`
        : `/workspaces/${workspaceSlug}?tab=data`,
      meta: "Biblioteca Drive con previsualizacion",
      active: Boolean(
        selectedTab === "data" && documentsObjectId && currentObjectId === documentsObjectId,
      ),
    },
    {
      id: "channels",
      label: "Canales",
      href: `/workspaces/${workspaceSlug}?tab=channels`,
      meta: "WhatsApp",
      hidden: currentRole === "viewer",
      active: selectedTab === "channels",
    },
    {
      id: "team-chat",
      label: "Equipo",
      href: `/workspaces/${workspaceSlug}?tab=team-chat`,
      meta: `${teamChatChannelsCount} canales`,
      active: selectedTab === "team-chat",
      hidden: true,
    },
    {
      id: "import",
      label: "Importar",
      href: `/workspaces/${workspaceSlug}?tab=import`,
      meta: "CSV / XLSX",
      hidden: true,
      active: selectedTab === "import",
    },
  ];
}
