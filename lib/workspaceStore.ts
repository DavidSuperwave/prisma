import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type PrismaWorkspace = {
  id: string;
  name: string;
  subdomain: string;
  logoUrl: string | null;
  primaryColor: string | null;
  agentLimit: number;
  planTier: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type PrismaWorkspaceObject = {
  id: string;
  workspaceId: string;
  name: string;
  singularName: string | null;
  pluralName: string | null;
  description: string | null;
  icon: string | null;
  createdAt: string;
};

export type PrismaWorkspaceField = {
  id: string;
  workspaceId: string;
  objectId: string;
  name: string;
  key: string;
  type: string;
  required: boolean;
  options: Record<string, unknown>;
  defaultValue: string | null;
  sortOrder: number;
};

export type PrismaWorkspaceView = {
  id: string;
  workspaceId: string;
  objectId: string;
  name: string;
  filters: unknown;
  sortBy: string | null;
  sortOrder: "asc" | "desc" | null;
  columns: string[];
  groupByFieldId: string | null;
};

export type PrismaWorkspaceRecord = {
  id: string;
  workspaceId: string;
  objectId: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PrismaWorkspaceAgent = {
  id: string;
  workspaceId: string;
  name: string;
  type: "copilot" | "channel" | "worker";
  description: string | null;
  apiEndpoint: string;
  apiKey: string;
  containerName: string;
  status: "active" | "paused" | "deploying" | "error";
  soulMd: string | null;
  skills: string[];
  knowledgeScope: Record<string, unknown>;
  cronJobs: unknown[];
  channelConfig: Record<string, unknown>;
  memoryLimitMb: number;
  cpuLimit: number;
  createdAt: string;
};

export type PrismaWorkspaceActivity = {
  id: number;
  workspaceId: string;
  agentId: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type PrismaWorkspaceImportHistory = {
  id: string;
  workspaceId: string;
  objectId: string;
  fileName: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  summary: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
};

export type WorkspaceSnapshot = {
  workspace: PrismaWorkspace;
  objects: PrismaWorkspaceObject[];
  fields: PrismaWorkspaceField[];
  views: PrismaWorkspaceView[];
  records: PrismaWorkspaceRecord[];
  agents: PrismaWorkspaceAgent[];
  activity: PrismaWorkspaceActivity[];
};

export type WorkspaceMembership = {
  workspaceId: string;
  role: "admin" | "operator" | "viewer";
  isPlatformAdmin: boolean;
  workspace: PrismaWorkspace;
};

type ViewFilter = {
  field?: string;
  operator?: "eq" | "neq" | "contains";
  value?: string;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

async function readPlatformState() {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(`${process.cwd()}/.data/platform-state.json`, "utf8");
    return JSON.parse(raw) as {
      agents?: Array<{
        id: string;
        workspaceId: string;
        name: string;
        role: string;
        model?: string;
        promptPack?: Record<string, unknown>;
        toolsConfig?: Record<string, unknown>;
        integrationConfig?: Record<string, unknown>;
        isActive?: boolean;
        createdAt: string;
        updatedAt: string;
      }>;
    };
  } catch {
    return {};
  }
}

function mapWorkspace(row: Record<string, unknown>): PrismaWorkspace {
  const metadata = (row.metadata as Record<string, unknown>) ?? {};
  const agentLimitFromMetadata =
    typeof metadata.agent_limit === "number"
      ? metadata.agent_limit
      : typeof metadata.agentLimit === "number"
        ? metadata.agentLimit
        : null;
  const planTierFromMetadata =
    typeof metadata.plan_tier === "string"
      ? metadata.plan_tier
      : typeof metadata.planTier === "string"
        ? metadata.planTier
        : null;

  return {
    id: String(row.id),
    name: String(row.name),
    subdomain: String(row.subdomain),
    logoUrl: row.logo_url ? String(row.logo_url) : null,
    primaryColor: row.primary_color ? String(row.primary_color) : null,
    agentLimit:
      typeof row.agent_limit === "number"
        ? row.agent_limit
        : typeof row.agent_limit === "string"
          ? Number(row.agent_limit)
          : agentLimitFromMetadata ?? 3,
    planTier:
      typeof row.plan_tier === "string" && row.plan_tier.length > 0 ? row.plan_tier : planTierFromMetadata ?? "base",
    metadata,
    createdAt: String(row.created_at),
  };
}

function mapObject(row: Record<string, unknown>): PrismaWorkspaceObject {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    singularName: row.singular_name ? String(row.singular_name) : null,
    pluralName: row.plural_name ? String(row.plural_name) : null,
    description: row.description ? String(row.description) : null,
    icon: row.icon ? String(row.icon) : null,
    createdAt: String(row.created_at),
  };
}

function mapField(row: Record<string, unknown>): PrismaWorkspaceField {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    objectId: String(row.object_id),
    name: String(row.name),
    key: String(row.key),
    type: String(row.type),
    required: Boolean(row.required),
    options: (row.options as Record<string, unknown>) ?? {},
    defaultValue: row.default_value ? String(row.default_value) : null,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapView(row: Record<string, unknown>): PrismaWorkspaceView {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    objectId: String(row.object_id),
    name: String(row.name),
    filters: row.filters ?? {},
    sortBy: row.sort_by ? String(row.sort_by) : null,
    sortOrder: row.sort_order === "desc" ? "desc" : row.sort_order === "asc" ? "asc" : null,
    columns: Array.isArray(row.columns) ? (row.columns as string[]) : [],
    groupByFieldId: row.group_by_field_id ? String(row.group_by_field_id) : null,
  };
}

function mapRecord(row: Record<string, unknown>): PrismaWorkspaceRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    objectId: String(row.object_id),
    data: (row.data as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAgent(row: Record<string, unknown>): PrismaWorkspaceAgent {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    type: row.type as PrismaWorkspaceAgent["type"],
    description: row.description ? String(row.description) : null,
    apiEndpoint: String(row.api_endpoint),
    apiKey: String(row.api_key),
    containerName: String(row.container_name),
    status: row.status as PrismaWorkspaceAgent["status"],
    soulMd: row.soul_md ? String(row.soul_md) : null,
    skills: Array.isArray(row.skills) ? (row.skills as string[]) : [],
    knowledgeScope: (row.knowledge_scope as Record<string, unknown>) ?? {},
    cronJobs: Array.isArray(row.cron_jobs) ? (row.cron_jobs as unknown[]) : [],
    channelConfig: (row.channel_config as Record<string, unknown>) ?? {},
    memoryLimitMb: Number(row.memory_limit_mb ?? 0),
    cpuLimit: Number(row.cpu_limit ?? 0),
    createdAt: String(row.created_at),
  };
}

function mapPlatformStateAgent(row: {
  id: string;
  workspaceId: string;
  name: string;
  role: string;
  model?: string;
  promptPack?: Record<string, unknown>;
  toolsConfig?: Record<string, unknown>;
  integrationConfig?: Record<string, unknown>;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}): PrismaWorkspaceAgent {
  const runtimeType =
    row.role === "intake_assistant" || row.role === "ops_assistant"
      ? "copilot"
      : row.role === "lead_qualifier" || row.role === "follow_up"
        ? "channel"
        : "worker";
  const skills = Array.isArray(row.toolsConfig?.skills) ? (row.toolsConfig?.skills as string[]) : [];
  const knowledgeScope =
    (row.integrationConfig?.knowledgeScope as Record<string, unknown> | undefined) ??
    (row.toolsConfig?.knowledgeScope as Record<string, unknown> | undefined) ??
    {};
  const cronJobs = Array.isArray(row.integrationConfig?.cronJobs) ? (row.integrationConfig?.cronJobs as unknown[]) : [];

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    type: runtimeType,
    description:
      typeof row.promptPack?.objective === "string"
        ? row.promptPack.objective
        : typeof row.promptPack?.description === "string"
          ? row.promptPack.description
          : null,
    apiEndpoint: typeof row.integrationConfig?.endpoint === "string" ? row.integrationConfig.endpoint : "local://fallback",
    apiKey: typeof row.integrationConfig?.apiKey === "string" ? row.integrationConfig.apiKey : "local-fallback",
    containerName: `hermes-${row.workspaceId.slice(0, 8)}-${row.role}`,
    status: row.isActive === false ? "paused" : "active",
    soulMd: typeof row.promptPack?.soulMd === "string" ? row.promptPack.soulMd : null,
    skills,
    knowledgeScope,
    cronJobs,
    channelConfig: (row.integrationConfig?.channelConfig as Record<string, unknown> | undefined) ?? {},
    memoryLimitMb: 512,
    cpuLimit: 0.5,
    createdAt: row.createdAt,
  };
}

function mapActivity(row: Record<string, unknown>): PrismaWorkspaceActivity {
  return {
    id: Number(row.id),
    workspaceId: String(row.workspace_id),
    agentId: String(row.agent_id),
    action: String(row.action),
    details: (row.details as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
  };
}

function mapImportHistory(row: Record<string, unknown>): PrismaWorkspaceImportHistory {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    objectId: String(row.object_id),
    fileName: String(row.file_name),
    totalRows: Number(row.total_rows ?? 0),
    importedRows: Number(row.imported_rows ?? 0),
    skippedRows: Number(row.skipped_rows ?? 0),
    errorRows: Number(row.error_rows ?? 0),
    summary: (row.summary as Record<string, unknown>) ?? {},
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
  };
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.toLowerCase();
  }
  return String(value).toLowerCase();
}

export function getRecordFieldValue(record: PrismaWorkspaceRecord, fieldKey: string) {
  return record.data[fieldKey];
}

export function applyViewToRecords(records: PrismaWorkspaceRecord[], view?: PrismaWorkspaceView | null) {
  if (!view) {
    return records;
  }

  const rawFilters = Array.isArray(view.filters)
    ? (view.filters as ViewFilter[])
    : Array.isArray((view.filters as { conditions?: ViewFilter[] } | null)?.conditions)
      ? (((view.filters as { conditions?: ViewFilter[] }).conditions as ViewFilter[]) ?? [])
      : [];

  let filtered = [...records];

  for (const filter of rawFilters) {
    if (!filter.field || !filter.operator) {
      continue;
    }
    const expected = normalizeText(filter.value);
    filtered = filtered.filter((record) => {
      const actual = normalizeText(record.data[filter.field as string]);
      if (filter.operator === "eq") {
        return actual === expected;
      }
      if (filter.operator === "neq") {
        return actual !== expected;
      }
      if (filter.operator === "contains") {
        return actual.includes(expected);
      }
      return true;
    });
  }

  if (view.sortBy) {
    filtered.sort((left, right) => {
      const leftValue = normalizeText(left.data[view.sortBy!]);
      const rightValue = normalizeText(right.data[view.sortBy!]);
      const result = leftValue.localeCompare(rightValue, undefined, { numeric: true });
      return view.sortOrder === "desc" ? -result : result;
    });
  }

  return filtered;
}

export function deriveQueueItems(
  objects: PrismaWorkspaceObject[],
  records: PrismaWorkspaceRecord[],
): Array<{
  id: string;
  title: string;
  subtitle: string;
  status: string;
  objectId: string;
}> {
  const objectMap = new Map(objects.map((object) => [object.id, object]));

  return records
    .map((record) => {
      const status =
        typeof record.data.status === "string"
          ? record.data.status
          : typeof record.data.stage === "string"
            ? record.data.stage
            : typeof record.data.priority === "string"
              ? record.data.priority
              : "";

      return {
        id: record.id,
        title:
          (typeof record.data.name === "string" && record.data.name) ||
          (typeof record.data.company_name === "string" && record.data.company_name) ||
          (typeof record.data.title === "string" && record.data.title) ||
          "Record",
        subtitle: objectMap.get(record.objectId)?.name ?? "Workspace item",
        status: typeof status === "string" ? status : "",
        objectId: record.objectId,
      };
    })
    .filter((item) =>
      ["pending", "needs_review", "pending_docs", "follow_up", "blocked", "awaiting_approval"].includes(
        item.status.toLowerCase(),
      ),
    )
    .slice(0, 12);
}

async function listWorkspaceMembershipRows(
  userId: string,
): Promise<Array<Record<string, unknown>>> {
  const supabase = requireSupabaseAdmin();
  const withPlatformFlag = await supabase
    .from("workspace_members")
    .select(
      "workspace_id, role, is_platform_admin, workspaces!inner(id, name, subdomain, logo_url, primary_color, agent_limit, plan_tier, metadata, created_at)",
    )
    .eq("user_id", userId);

  if (!withPlatformFlag.error) {
    return (withPlatformFlag.data ?? []) as Record<string, unknown>[];
  }

  const fallback = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces!inner(id, name, subdomain, logo_url, primary_color, metadata, created_at)")
    .eq("user_id", userId);

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return (fallback.data ?? []) as Record<string, unknown>[];
}

export async function listWorkspaceSummaries() {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, subdomain, logo_url, primary_color, metadata, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapWorkspace(row as Record<string, unknown>));
}

export async function listWorkspaceMembershipsForUser(
  userId: string,
  isPlatformAdmin = false,
): Promise<WorkspaceMembership[]> {
  const supabase = requireSupabaseAdmin();
  const membershipRows = await listWorkspaceMembershipRows(userId);
  const memberships = membershipRows.map((row) => ({
    workspaceId: String(row.workspace_id),
    role: row.role as "admin" | "operator" | "viewer",
    isPlatformAdmin: Boolean(row.is_platform_admin),
    workspace: mapWorkspace(
      ((row as Record<string, unknown>).workspaces as Record<string, unknown>) ?? ({} as Record<string, unknown>),
    ),
  }));

  if (!isPlatformAdmin) {
    return memberships;
  }

  const workspaces = await listWorkspaceSummaries();
  const membershipByWorkspace = new Map(memberships.map((entry) => [entry.workspaceId, entry]));

  return workspaces.map((workspace) => {
    const existing = membershipByWorkspace.get(workspace.id);
    if (existing) {
      return {
        ...existing,
        isPlatformAdmin: true,
      };
    }

    return {
      workspaceId: workspace.id,
      role: "admin" as const,
      isPlatformAdmin: true,
      workspace,
    };
  });
}

export async function listWorkspaceSummariesForUser(userId: string, isPlatformAdmin = false) {
  const memberships = await listWorkspaceMembershipsForUser(userId, isPlatformAdmin);
  return memberships.map((membership) => membership.workspace);
}

export async function getWorkspaceBySlug(workspaceSlug: string) {
  const supabase = requireSupabaseAdmin();
  const withPlanFields = await supabase
    .from("workspaces")
    .select("id, name, subdomain, logo_url, primary_color, agent_limit, plan_tier, metadata, created_at")
    .eq("subdomain", workspaceSlug)
    .maybeSingle();

  if (!withPlanFields.error) {
    return withPlanFields.data ? mapWorkspace(withPlanFields.data as Record<string, unknown>) : null;
  }

  const fallback = await supabase
    .from("workspaces")
    .select("id, name, subdomain, logo_url, primary_color, metadata, created_at")
    .eq("subdomain", workspaceSlug)
    .maybeSingle();

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return fallback.data ? mapWorkspace(fallback.data as Record<string, unknown>) : null;
}

export async function listWorkspaceObjects(workspaceId: string) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_objects")
    .select("id, workspace_id, name, singular_name, plural_name, description, icon, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapObject(row as Record<string, unknown>));
}

export async function listWorkspaceFields(workspaceId: string) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_fields")
    .select("id, workspace_id, object_id, name, key, type, required, options, default_value, sort_order")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapField(row as Record<string, unknown>));
}

export async function listWorkspaceViews(workspaceId: string, objectId?: string) {
  const supabase = requireSupabaseAdmin();
  const buildQuery = (selectClause: string) => {
    let query = supabase
      .from("workspace_views")
      .select(selectClause)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (objectId) {
      query = query.eq("object_id", objectId);
    }

    return query;
  };

  const preferredSelect = "id, workspace_id, object_id, name, filters, sort_by, sort_order, columns, group_by_field_id";
  const fallbackSelect = "id, workspace_id, object_id, name, filters, sort_by, sort_order, columns";

  const withGroupBy = await buildQuery(preferredSelect);
  if (!withGroupBy.error) {
    const rows = Array.isArray(withGroupBy.data) ? withGroupBy.data : [];
    return rows.map((row) => mapView(row as unknown as Record<string, unknown>));
  }

  // Backward-compatibility for environments where the M15 migration has not run yet.
  if (!withGroupBy.error.message.includes("group_by_field_id")) {
    throw new Error(withGroupBy.error.message);
  }

  const withoutGroupBy = await buildQuery(fallbackSelect);
  if (withoutGroupBy.error) {
    throw new Error(withoutGroupBy.error.message);
  }

  const fallbackRows = Array.isArray(withoutGroupBy.data) ? withoutGroupBy.data : [];
  return fallbackRows.map((row) =>
    mapView({
      ...(row as unknown as Record<string, unknown>),
      group_by_field_id: null,
    }),
  );
}

export async function listWorkspaceRecords(workspaceId: string, objectId?: string) {
  const supabase = requireSupabaseAdmin();
  let query = supabase
    .from("records")
    .select("id, workspace_id, object_id, data, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (objectId) {
    query = query.eq("object_id", objectId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapRecord(row as Record<string, unknown>));
}

export async function listWorkspaceAgents(workspaceId: string) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_agents")
    .select(
      "id, workspace_id, name, type, description, api_endpoint, api_key, container_name, status, soul_md, skills, knowledge_scope, cron_jobs, channel_config, memory_limit_mb, cpu_limit, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  const supabaseAgents = (data ?? []).map((row) => mapAgent(row as Record<string, unknown>));
  const fallbackState = await readPlatformState();
  const fallbackAgents = (fallbackState.agents ?? [])
    .filter((agent) => agent.workspaceId === workspaceId)
    .map((agent) => mapPlatformStateAgent(agent));

  if (fallbackAgents.length === 0) {
    return supabaseAgents;
  }

  const merged = new Map<string, PrismaWorkspaceAgent>();
  for (const agent of supabaseAgents) {
    merged.set(agent.id, agent);
  }
  for (const agent of fallbackAgents) {
    if (!merged.has(agent.id)) {
      merged.set(agent.id, agent);
    }
  }

  return Array.from(merged.values()).sort((left, right) => (left.createdAt > right.createdAt ? 1 : -1));
}

export async function getWorkspaceAgent(workspaceId: string, agentId: string) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_agents")
    .select(
      "id, workspace_id, name, type, description, api_endpoint, api_key, container_name, status, soul_md, skills, knowledge_scope, cron_jobs, channel_config, memory_limit_mb, cpu_limit, created_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", agentId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapAgent(data as Record<string, unknown>) : null;
}

export async function listWorkspaceActivity(workspaceId: string, limit = 30) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("agent_activity")
    .select("id, workspace_id, agent_id, action, details, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapActivity(row as Record<string, unknown>));
}

export async function listWorkspaceImportHistory(workspaceId: string, limit = 20) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_import_history")
    .select("id, workspace_id, object_id, file_name, total_rows, imported_rows, skipped_rows, error_rows, summary, created_by, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapImportHistory(row as Record<string, unknown>));
}

export async function getWorkspaceSnapshot(workspaceSlug: string): Promise<WorkspaceSnapshot | null> {
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) {
    return null;
  }

  const [objects, fields, views, records, agents, activity] = await Promise.all([
    listWorkspaceObjects(workspace.id),
    listWorkspaceFields(workspace.id),
    listWorkspaceViews(workspace.id),
    listWorkspaceRecords(workspace.id),
    listWorkspaceAgents(workspace.id),
    listWorkspaceActivity(workspace.id),
  ]);

  return { workspace, objects, fields, views, records, agents, activity };
}

export async function getWorkspaceSnapshotForUser(workspaceSlug: string, userId: string, isPlatformAdmin = false) {
  const memberships = await listWorkspaceMembershipsForUser(userId, isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug) ?? null;

  if (!membership) {
    return null;
  }

  const [objects, fields, views, records, agents, activity] = await Promise.all([
    listWorkspaceObjects(membership.workspaceId),
    listWorkspaceFields(membership.workspaceId),
    listWorkspaceViews(membership.workspaceId),
    listWorkspaceRecords(membership.workspaceId),
    listWorkspaceAgents(membership.workspaceId),
    listWorkspaceActivity(membership.workspaceId),
  ]);

  return {
    membership,
    snapshot: {
      workspace: membership.workspace,
      objects,
      fields,
      views,
      records,
      agents,
      activity,
    } satisfies WorkspaceSnapshot,
  };
}
