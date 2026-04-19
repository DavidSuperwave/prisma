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

export type PrismaCrmKind = "crm_people" | "crm_companies" | "crm_deals";
export type PrismaObjectKind = PrismaCrmKind | "tasks";

export type PrismaWorkspaceObject = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string | null;
  singularName: string | null;
  pluralName: string | null;
  description: string | null;
  icon: string | null;
  kind: PrismaObjectKind | null;
  isSystem: boolean;
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
  isLocked: boolean;
};

export type PrismaPipeline = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
};

export type PrismaPipelineStage = {
  id: string;
  workspaceId: string;
  pipelineId: string;
  name: string;
  stageType: "active" | "won" | "lost";
  sortOrder: number;
  probability: number;
  color: string | null;
};

export type PrismaActivityType = {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  icon: string | null;
  customFields: unknown[];
  isSystem: boolean;
};

export type PrismaRecordActivity = {
  id: string;
  workspaceId: string;
  recordId: string;
  objectId: string;
  type: string;
  activityTypeId: string | null;
  authorUserId: string | null;
  authorAgentId: string | null;
  subject: string | null;
  body: string | null;
  data: Record<string, unknown>;
  isPinned: boolean;
  occurredAt: string;
  createdAt: string;
};

export type SmartViewScope = "private" | "team" | "org";
export type SmartViewMode = "table" | "board" | "kpi" | "pipeline";

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
  scope: SmartViewScope;
  filterDsl: Record<string, unknown>;
  sortConfig: unknown[];
  columnConfig: unknown[];
  isPinned: boolean;
  viewMode: SmartViewMode;
  createdByUserId: string | null;
};

export type PrismaWorkspaceRecord = {
  id: string;
  workspaceId: string;
  objectId: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PrismaWorkspaceDocumentPreviewSheet = {
  name: string;
  headers: string[];
  sampleRows: Array<Record<string, unknown>>;
  rowCount: number;
};

export type PrismaWorkspaceDocumentPreview = {
  kind: "spreadsheet" | "pdf" | "image" | "other";
  sheets: PrismaWorkspaceDocumentPreviewSheet[];
};

export type PrismaWorkspaceDocument = {
  id: string;
  workspaceId: string;
  fileName: string;
  mimeType: string;
  fileKind: PrismaWorkspaceDocumentPreview["kind"];
  storagePath: string;
  publicUrl: string;
  sizeBytes: number | null;
  preview: PrismaWorkspaceDocumentPreview | null;
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

export type PrismaWorkspaceTask = {
  id: string;
  workspaceId: string;
  sourceRecordId: string | null;
  sourceObjectId: string | null;
  recordId: string | null;
  listId: string | null;
  parentTaskId: string | null;
  type: string;
  title: string;
  description: string | null;
  ownerUserId: string | null;
  ownerAgentId: string | null;
  assignedToUserId: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  reminderAt: string | null;
  approvalRequired: boolean;
  approvalStatus: string;
  blockingReason: string | null;
  metadata: Record<string, unknown>;
  customData: Record<string, unknown>;
  sortOrder: number;
  completedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PrismaTaskList = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
};

export type PrismaTaskStatus = {
  id: string;
  workspaceId: string;
  listId: string | null;
  key: string;
  label: string;
  color: string | null;
  category: "todo" | "in_progress" | "done" | "blocked";
  sortOrder: number;
  isSystem: boolean;
};

export type WorkspaceSnapshot = {
  workspace: PrismaWorkspace;
  objects: PrismaWorkspaceObject[];
  fields: PrismaWorkspaceField[];
  views: PrismaWorkspaceView[];
  records: PrismaWorkspaceRecord[];
  tasks: PrismaWorkspaceTask[];
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
  const kindValue = typeof row.kind === "string" ? row.kind : null;
  const kind: PrismaObjectKind | null =
    kindValue === "crm_people" ||
    kindValue === "crm_companies" ||
    kindValue === "crm_deals" ||
    kindValue === "tasks"
      ? (kindValue as PrismaObjectKind)
      : null;
  const rawSlug = typeof row.slug === "string" ? row.slug.trim() : "";
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    slug: rawSlug.length > 0 ? rawSlug : null,
    singularName: row.singular_name ? String(row.singular_name) : null,
    pluralName: row.plural_name ? String(row.plural_name) : null,
    description: row.description ? String(row.description) : null,
    icon: row.icon ? String(row.icon) : null,
    kind,
    isSystem: Boolean(row.is_system),
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
    isLocked: Boolean(row.is_locked),
  };
}

function mapPipeline(row: Record<string, unknown>): PrismaPipeline {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    isDefault: Boolean(row.is_default),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
  };
}

function mapPipelineStage(row: Record<string, unknown>): PrismaPipelineStage {
  const rawType = typeof row.stage_type === "string" ? row.stage_type : "active";
  const stageType: PrismaPipelineStage["stageType"] =
    rawType === "won" || rawType === "lost" ? rawType : "active";
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    pipelineId: String(row.pipeline_id),
    name: String(row.name),
    stageType,
    sortOrder: Number(row.sort_order ?? 0),
    probability: Number(row.probability ?? 0),
    color: row.color ? String(row.color) : null,
  };
}

function mapActivityType(row: Record<string, unknown>): PrismaActivityType {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    key: String(row.key),
    name: String(row.name),
    icon: row.icon ? String(row.icon) : null,
    customFields: Array.isArray(row.custom_fields) ? (row.custom_fields as unknown[]) : [],
    isSystem: Boolean(row.is_system),
  };
}

function mapRecordActivity(row: Record<string, unknown>): PrismaRecordActivity {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    recordId: String(row.record_id),
    objectId: String(row.object_id),
    type: String(row.type),
    activityTypeId: row.activity_type_id ? String(row.activity_type_id) : null,
    authorUserId: row.author_user_id ? String(row.author_user_id) : null,
    authorAgentId: row.author_agent_id ? String(row.author_agent_id) : null,
    subject: row.subject ? String(row.subject) : null,
    body: row.body ? String(row.body) : null,
    data: (row.data as Record<string, unknown>) ?? {},
    isPinned: Boolean(row.is_pinned),
    occurredAt: String(row.occurred_at ?? row.created_at),
    createdAt: String(row.created_at),
  };
}

function mapView(row: Record<string, unknown>): PrismaWorkspaceView {
  const scopeRaw = typeof row.scope === "string" ? row.scope : "private";
  const scope: SmartViewScope =
    scopeRaw === "team" || scopeRaw === "org" ? (scopeRaw as SmartViewScope) : "private";
  const viewModeRaw = typeof row.view_mode === "string" ? row.view_mode : "table";
  const viewMode: SmartViewMode =
    viewModeRaw === "board" || viewModeRaw === "kpi" || viewModeRaw === "pipeline"
      ? (viewModeRaw as SmartViewMode)
      : "table";
  const filterDslRaw = row.filter_dsl;
  const filterDsl =
    filterDslRaw && typeof filterDslRaw === "object" && !Array.isArray(filterDslRaw)
      ? (filterDslRaw as Record<string, unknown>)
      : {};
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
    scope,
    filterDsl,
    sortConfig: Array.isArray(row.sort_config) ? (row.sort_config as unknown[]) : [],
    columnConfig: Array.isArray(row.column_config) ? (row.column_config as unknown[]) : [],
    isPinned: Boolean(row.is_pinned),
    viewMode,
    createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : null,
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

function mapTask(row: Record<string, unknown>): PrismaWorkspaceTask {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    sourceRecordId: row.source_record_id ? String(row.source_record_id) : null,
    sourceObjectId: row.source_object_id ? String(row.source_object_id) : null,
    recordId: row.record_id ? String(row.record_id) : null,
    listId: row.list_id ? String(row.list_id) : null,
    parentTaskId: row.parent_task_id ? String(row.parent_task_id) : null,
    type: String(row.type ?? "follow_up"),
    title: String(row.title ?? "Task"),
    description: row.description ? String(row.description) : null,
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
    ownerAgentId: row.owner_agent_id ? String(row.owner_agent_id) : null,
    assignedToUserId: row.assigned_to_user_id ? String(row.assigned_to_user_id) : null,
    status: String(row.status ?? "pending"),
    priority: String(row.priority ?? "normal"),
    dueAt: row.due_at ? String(row.due_at) : null,
    reminderAt: row.reminder_at ? String(row.reminder_at) : null,
    approvalRequired: Boolean(row.approval_required),
    approvalStatus: String(row.approval_status ?? "not_required"),
    blockingReason: row.blocking_reason ? String(row.blocking_reason) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    customData: (row.custom_data as Record<string, unknown>) ?? {},
    sortOrder: Number(row.sort_order ?? 0),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapTaskList(row: Record<string, unknown>): PrismaTaskList {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name ?? "List"),
    description: row.description ? String(row.description) : null,
    icon: row.icon ? String(row.icon) : null,
    color: row.color ? String(row.color) : null,
    isDefault: Boolean(row.is_default),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
  };
}

function mapTaskStatus(row: Record<string, unknown>): PrismaTaskStatus {
  const category = String(row.category ?? "todo") as PrismaTaskStatus["category"];
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    listId: row.list_id ? String(row.list_id) : null,
    key: String(row.key),
    label: String(row.label ?? row.key),
    color: row.color ? String(row.color) : null,
    category: ["todo", "in_progress", "done", "blocked"].includes(category) ? category : "todo",
    sortOrder: Number(row.sort_order ?? 0),
    isSystem: Boolean(row.is_system),
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
  tasks: PrismaWorkspaceTask[] = [],
): Array<{
  id: string;
  recordId?: string;
  title: string;
  subtitle: string;
  status: string;
  objectId: string;
  priority?: string;
  dueAt?: string | null;
  assignedToUserId?: string | null;
  listId?: string | null;
}> {
  const objectMap = new Map(objects.map((object) => [object.id, object]));
  const recordMap = new Map(records.map((record) => [record.id, record]));
  if (tasks.length > 0) {
    const activeStatuses = new Set([
      "pending",
      "needs_review",
      "pending_docs",
      "follow_up",
      "blocked",
      "awaiting_approval",
      "in_progress",
    ]);
    return tasks
      .filter((task) => activeStatuses.has(task.status.toLowerCase()))
      .map((task) => {
        const linkedRecord = task.sourceRecordId ? recordMap.get(task.sourceRecordId) : null;
        const resolvedObjectId = task.sourceObjectId ?? linkedRecord?.objectId ?? "";
        return {
          id: task.id,
          recordId: task.sourceRecordId ?? undefined,
          title: task.title,
          subtitle:
            resolvedObjectId && objectMap.has(resolvedObjectId)
              ? `${objectMap.get(resolvedObjectId)?.name} · ${task.type}`
              : `Task · ${task.type}`,
          status: task.status,
          objectId: resolvedObjectId,
          priority: task.priority,
          dueAt: task.dueAt,
          assignedToUserId: task.assignedToUserId,
          listId: task.listId,
        };
      })
      .slice(0, 24);
  }

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

/**
 * Resolve the user's membership for a single workspace (by slug) in a single
 * Postgres round-trip. This is the preferred call for API routes that only
 * care about one workspace — it avoids fetching and materialising the user's
 * entire membership list on every request.
 *
 * For platform admins we still grant synthetic admin access to any workspace
 * that exists, to match the semantics of `listWorkspaceMembershipsForUser`.
 */
export async function getWorkspaceMembershipForSlug(
  userId: string,
  workspaceSlug: string,
  isPlatformAdmin = false,
): Promise<WorkspaceMembership | null> {
  const supabase = requireSupabaseAdmin();
  const withPlatformFlag = await supabase
    .from("workspace_members")
    .select(
      "workspace_id, role, is_platform_admin, workspaces!inner(id, name, subdomain, logo_url, primary_color, agent_limit, plan_tier, metadata, created_at)",
    )
    .eq("user_id", userId)
    .eq("workspaces.subdomain", workspaceSlug)
    .maybeSingle();

  let row: Record<string, unknown> | null = null;
  if (!withPlatformFlag.error) {
    row = (withPlatformFlag.data ?? null) as Record<string, unknown> | null;
  } else {
    const fallback = await supabase
      .from("workspace_members")
      .select(
        "workspace_id, role, workspaces!inner(id, name, subdomain, logo_url, primary_color, metadata, created_at)",
      )
      .eq("user_id", userId)
      .eq("workspaces.subdomain", workspaceSlug)
      .maybeSingle();
    if (fallback.error) {
      throw new Error(fallback.error.message);
    }
    row = (fallback.data ?? null) as Record<string, unknown> | null;
  }

  if (row) {
    return {
      workspaceId: String(row.workspace_id),
      role: row.role as "admin" | "operator" | "viewer",
      isPlatformAdmin: Boolean(row.is_platform_admin) || isPlatformAdmin,
      workspace: mapWorkspace(
        (row.workspaces as Record<string, unknown>) ?? ({} as Record<string, unknown>),
      ),
    };
  }

  if (!isPlatformAdmin) return null;

  // Platform admins get synthetic admin access to any workspace — match the
  // existing semantics of listWorkspaceMembershipsForUser without loading the
  // full workspace list.
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) return null;
  return {
    workspaceId: workspace.id,
    role: "admin",
    isPlatformAdmin: true,
    workspace,
  };
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
  const preferredSelect =
    "id, workspace_id, name, slug, singular_name, plural_name, description, icon, kind, is_system, created_at";
  const withoutSlugSelect =
    "id, workspace_id, name, singular_name, plural_name, description, icon, kind, is_system, created_at";
  const fallbackSelect = "id, workspace_id, name, singular_name, plural_name, description, icon, created_at";

  const preferred = await supabase
    .from("workspace_objects")
    .select(preferredSelect)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (!preferred.error) {
    return (preferred.data ?? []).map((row) => mapObject(row as Record<string, unknown>));
  }

  // Slug column not yet migrated — fall back to the previous selects.
  if (preferred.error.message.includes("slug")) {
    const withoutSlug = await supabase
      .from("workspace_objects")
      .select(withoutSlugSelect)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    if (!withoutSlug.error) {
      return (withoutSlug.data ?? []).map((row) => mapObject(row as Record<string, unknown>));
    }
    if (!withoutSlug.error.message.includes("kind") && !withoutSlug.error.message.includes("is_system")) {
      throw new Error(withoutSlug.error.message);
    }
  } else if (!preferred.error.message.includes("kind") && !preferred.error.message.includes("is_system")) {
    throw new Error(preferred.error.message);
  }

  const fallback = await supabase
    .from("workspace_objects")
    .select(fallbackSelect)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return (fallback.data ?? []).map((row) => mapObject(row as Record<string, unknown>));
}

export async function listWorkspaceFields(workspaceId: string) {
  const supabase = requireSupabaseAdmin();
  const preferredSelect =
    "id, workspace_id, object_id, name, key, type, required, options, default_value, sort_order, is_locked";
  const fallbackSelect = "id, workspace_id, object_id, name, key, type, required, options, default_value, sort_order";

  const preferred = await supabase
    .from("workspace_fields")
    .select(preferredSelect)
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });

  if (!preferred.error) {
    return (preferred.data ?? []).map((row) => mapField(row as Record<string, unknown>));
  }

  if (!preferred.error.message.includes("is_locked")) {
    throw new Error(preferred.error.message);
  }

  const fallback = await supabase
    .from("workspace_fields")
    .select(fallbackSelect)
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return (fallback.data ?? []).map((row) => mapField(row as Record<string, unknown>));
}

export async function getCrmObject(workspaceId: string, kind: PrismaCrmKind) {
  const objects = await listWorkspaceObjects(workspaceId);
  return objects.find((object) => object.kind === kind) ?? null;
}

export async function findCrmObjectByKind(workspaceId: string, kind: PrismaCrmKind) {
  return getCrmObject(workspaceId, kind);
}

export async function listPipelines(workspaceId: string) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_pipelines")
    .select("id, workspace_id, name, description, is_default, sort_order, created_at")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });

  if (error) {
    if (error.message.includes("workspace_pipelines")) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapPipeline(row as Record<string, unknown>));
}

export async function listPipelineStages(workspaceId: string, pipelineId?: string) {
  const supabase = requireSupabaseAdmin();
  let query = supabase
    .from("workspace_pipeline_stages")
    .select("id, workspace_id, pipeline_id, name, stage_type, sort_order, probability, color")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });

  if (pipelineId) {
    query = query.eq("pipeline_id", pipelineId);
  }

  const { data, error } = await query;
  if (error) {
    if (error.message.includes("workspace_pipeline_stages")) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapPipelineStage(row as Record<string, unknown>));
}

export async function listActivityTypes(workspaceId: string) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_activity_types")
    .select("id, workspace_id, key, name, icon, custom_fields, is_system")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (error) {
    if (error.message.includes("workspace_activity_types")) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapActivityType(row as Record<string, unknown>));
}

export async function listRecordActivities(
  workspaceId: string,
  options: { recordId?: string; limit?: number; type?: string } = {},
) {
  const supabase = requireSupabaseAdmin();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  let query = supabase
    .from("record_activities")
    .select(
      "id, workspace_id, record_id, object_id, type, activity_type_id, author_user_id, author_agent_id, subject, body, data, is_pinned, occurred_at, created_at",
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (options.recordId) {
    query = query.eq("record_id", options.recordId);
  }
  if (options.type) {
    query = query.eq("type", options.type);
  }

  const { data, error } = await query;
  if (error) {
    if (error.message.includes("record_activities")) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapRecordActivity(row as Record<string, unknown>));
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

  const smartSelect =
    "id, workspace_id, object_id, name, filters, sort_by, sort_order, columns, group_by_field_id, scope, filter_dsl, sort_config, column_config, is_pinned, view_mode, created_by_user_id";
  const groupBySelect = "id, workspace_id, object_id, name, filters, sort_by, sort_order, columns, group_by_field_id";
  const fallbackSelect = "id, workspace_id, object_id, name, filters, sort_by, sort_order, columns";

  const smartAttempt = await buildQuery(smartSelect);
  if (!smartAttempt.error) {
    const rows = Array.isArray(smartAttempt.data) ? smartAttempt.data : [];
    return rows.map((row) => mapView(row as unknown as Record<string, unknown>));
  }

  // Backward-compat: older envs without M10 smart view columns.
  const message = smartAttempt.error.message;
  const missingSmartColumn =
    message.includes("scope") ||
    message.includes("filter_dsl") ||
    message.includes("sort_config") ||
    message.includes("column_config") ||
    message.includes("is_pinned") ||
    message.includes("view_mode") ||
    message.includes("created_by_user_id");

  if (!missingSmartColumn && !message.includes("group_by_field_id")) {
    throw new Error(message);
  }

  const withGroupBy = await buildQuery(groupBySelect);
  if (!withGroupBy.error) {
    const rows = Array.isArray(withGroupBy.data) ? withGroupBy.data : [];
    return rows.map((row) => mapView(row as unknown as Record<string, unknown>));
  }

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
    .select("id, workspace_id, object_id, data, created_at, updated_at, deleted_at")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
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

function normalizeDocumentKind(value: unknown): PrismaWorkspaceDocumentPreview["kind"] {
  if (value === "spreadsheet" || value === "pdf" || value === "image") {
    return value;
  }
  return "other";
}

function normalizeDocumentPreview(value: unknown): PrismaWorkspaceDocumentPreview | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const kind = normalizeDocumentKind(record.kind);
  const rawSheets = Array.isArray(record.sheets) ? record.sheets : [];
  const sheets: PrismaWorkspaceDocumentPreviewSheet[] = rawSheets.map((sheet) => {
    const sheetRecord = (sheet ?? {}) as Record<string, unknown>;
    const name = typeof sheetRecord.name === "string" ? sheetRecord.name : "Sheet1";
    const headers = Array.isArray(sheetRecord.headers)
      ? sheetRecord.headers.filter((entry): entry is string => typeof entry === "string")
      : [];
    const sampleRows = Array.isArray(sheetRecord.sampleRows)
      ? sheetRecord.sampleRows.filter(
          (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
        )
      : [];
    const rowCount = typeof sheetRecord.rowCount === "number" ? sheetRecord.rowCount : sampleRows.length;
    return { name, headers, sampleRows, rowCount };
  });
  return { kind, sheets };
}

export async function listWorkspaceDocuments(
  workspaceId: string,
  options: { limit?: number; query?: string } = {},
): Promise<PrismaWorkspaceDocument[]> {
  const supabase = requireSupabaseAdmin();
  const { data: documentsObject } = await supabase
    .from("workspace_objects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", "Documents")
    .maybeSingle();
  if (!documentsObject) {
    return [];
  }

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const query = (options.query ?? "").trim().toLowerCase();

  const { data: rows, error } = await supabase
    .from("records")
    .select("id, workspace_id, data, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("object_id", documentsObject.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 3, 50));
  if (error) {
    throw new Error(error.message);
  }

  return (rows ?? [])
    .map((row) => {
      const data = (row.data as Record<string, unknown>) ?? {};
      const fileName = typeof data.document_name === "string" ? data.document_name : "archivo";
      const publicUrl = typeof data.public_url === "string" ? data.public_url : "";
      const storagePath = typeof data.storage_path === "string" ? data.storage_path : "";
      const mimeType = typeof data.mime_type === "string" ? data.mime_type : "application/octet-stream";
      const sizeBytes = typeof data.size_bytes === "number" ? data.size_bytes : null;
      return {
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        fileName,
        mimeType,
        fileKind: normalizeDocumentKind(data.kind),
        storagePath,
        publicUrl,
        sizeBytes,
        preview: normalizeDocumentPreview(data.preview),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at ?? row.created_at),
      } satisfies PrismaWorkspaceDocument;
    })
    .filter((doc) => (query ? doc.fileName.toLowerCase().includes(query) : true))
    .slice(0, limit);
}

export async function listWorkspaceAgents(workspaceId: string) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
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

    return (data ?? []).map((row) => mapAgent(row as Record<string, unknown>));
  }

  const fallbackState = await readPlatformState();
  const fallbackAgents = (fallbackState.agents ?? [])
    .filter((agent) => agent.workspaceId === workspaceId)
    .map((agent) => mapPlatformStateAgent(agent));

  return fallbackAgents.sort((left, right) => (left.createdAt > right.createdAt ? 1 : -1));
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

const TASK_SELECT_FULL =
  "id, workspace_id, source_record_id, source_object_id, record_id, list_id, parent_task_id, type, title, description, owner_user_id, owner_agent_id, assigned_to_user_id, status, priority, due_at, reminder_at, approval_required, approval_status, blocking_reason, metadata, custom_data, sort_order, completed_at, created_by, created_at, updated_at";

const TASK_SELECT_LEGACY =
  "id, workspace_id, source_record_id, source_object_id, type, title, owner_user_id, owner_agent_id, status, priority, due_at, approval_required, approval_status, blocking_reason, metadata, completed_at, created_by, created_at, updated_at";

export async function listWorkspaceTasks(workspaceId: string, limit = 120) {
  const supabase = requireSupabaseAdmin();
  const primary = await supabase
    .from("workspace_tasks")
    .select(TASK_SELECT_FULL)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  let data: Array<Record<string, unknown>> | null =
    (primary.data as unknown as Array<Record<string, unknown>>) ?? null;
  let error = primary.error;

  if (error && /(record_id|list_id|parent_task_id|custom_data|sort_order|reminder_at|assigned_to_user_id|description)/.test(error.message)) {
    const legacy = await supabase
      .from("workspace_tasks")
      .select(TASK_SELECT_LEGACY)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);
    data = (legacy.data as unknown as Array<Record<string, unknown>>) ?? null;
    error = legacy.error;
  }

  if (error) {
    if (error.message.includes("workspace_tasks")) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapTask(row as Record<string, unknown>));
}

export async function listTaskLists(workspaceId: string): Promise<PrismaTaskList[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_task_lists")
    .select("id, workspace_id, name, description, icon, color, is_default, sort_order, created_at")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });

  if (error) {
    if (/workspace_task_lists/.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapTaskList(row as Record<string, unknown>));
}

export async function listTaskStatuses(workspaceId: string): Promise<PrismaTaskStatus[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspace_task_statuses")
    .select("id, workspace_id, list_id, key, label, color, category, sort_order, is_system")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });

  if (error) {
    if (/workspace_task_statuses/.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapTaskStatus(row as Record<string, unknown>));
}

export type TasksWorkspaceBundle = {
  tasks: PrismaWorkspaceTask[];
  lists: PrismaTaskList[];
  statuses: PrismaTaskStatus[];
  tasksObject: PrismaWorkspaceObject | null;
  tasksFields: PrismaWorkspaceField[];
  tasksViews: PrismaWorkspaceView[];
};

export async function listTasksWithCustom(workspaceId: string): Promise<TasksWorkspaceBundle> {
  const [objects, fields, views, tasks, lists, statuses] = await Promise.all([
    listWorkspaceObjects(workspaceId),
    listWorkspaceFields(workspaceId),
    listWorkspaceViews(workspaceId),
    listWorkspaceTasks(workspaceId, 500),
    listTaskLists(workspaceId),
    listTaskStatuses(workspaceId),
  ]);

  const tasksObject = objects.find((object) => object.kind === "tasks") ?? null;
  const tasksFields = tasksObject ? fields.filter((field) => field.objectId === tasksObject.id) : [];
  const tasksViews = tasksObject ? views.filter((view) => view.objectId === tasksObject.id) : [];

  return { tasks, lists, statuses, tasksObject, tasksFields, tasksViews };
}

/**
 * Adapter: project a workspace_tasks row into the PrismaWorkspaceRecord shape
 * so existing TableView / KanbanView / SmartViewsBar components can render
 * tasks without modification.
 */
export function taskToRecord(task: PrismaWorkspaceTask, tasksObjectId: string): PrismaWorkspaceRecord {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    objectId: tasksObjectId,
    data: {
      ...task.customData,
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      type: task.type,
      due_at: task.dueAt ?? "",
      reminder_at: task.reminderAt ?? "",
      assigned_to_user_id: task.assignedToUserId ?? "",
      owner_agent_id: task.ownerAgentId ?? "",
      owner_user_id: task.ownerUserId ?? "",
      list_id: task.listId ?? "",
      parent_task_id: task.parentTaskId ?? "",
      source_record_id: task.sourceRecordId ?? "",
      source_object_id: task.sourceObjectId ?? "",
      approval_status: task.approvalStatus,
      completed_at: task.completedAt ?? "",
      sort_order: task.sortOrder,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    },
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export function tasksToRecords(
  tasks: PrismaWorkspaceTask[],
  tasksObjectId: string | null,
): PrismaWorkspaceRecord[] {
  if (!tasksObjectId) return [];
  return tasks.map((task) => taskToRecord(task, tasksObjectId));
}

export async function getWorkspaceSnapshot(workspaceSlug: string): Promise<WorkspaceSnapshot | null> {
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) {
    return null;
  }

  const [objects, fields, views, records, tasks, agents, activity] = await Promise.all([
    listWorkspaceObjects(workspace.id),
    listWorkspaceFields(workspace.id),
    listWorkspaceViews(workspace.id),
    listWorkspaceRecords(workspace.id),
    listWorkspaceTasks(workspace.id),
    listWorkspaceAgents(workspace.id),
    listWorkspaceActivity(workspace.id),
  ]);

  return { workspace, objects, fields, views, records, tasks, agents, activity };
}

export async function getWorkspaceSnapshotForUser(workspaceSlug: string, userId: string, isPlatformAdmin = false) {
  const memberships = await listWorkspaceMembershipsForUser(userId, isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug) ?? null;

  if (!membership) {
    return null;
  }

  const [objects, fields, views, records, tasks, agents, activity] = await Promise.all([
    listWorkspaceObjects(membership.workspaceId),
    listWorkspaceFields(membership.workspaceId),
    listWorkspaceViews(membership.workspaceId),
    listWorkspaceRecords(membership.workspaceId),
    listWorkspaceTasks(membership.workspaceId),
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
      tasks,
      agents,
      activity,
    } satisfies WorkspaceSnapshot,
  };
}

/**
 * Lightweight variant of `getWorkspaceSnapshotForUser` for pages that only
 * need membership info plus the data required by `buildWorkspaceNavItems`
 * (objects + agents). Avoids pulling records, activity, views, fields, tasks
 * that the caller does not use.
 */
export async function getWorkspaceNavContextForUser(
  workspaceSlug: string,
  userId: string,
  isPlatformAdmin = false,
) {
  const memberships = await listWorkspaceMembershipsForUser(userId, isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug) ?? null;
  if (!membership) return null;

  const [objects, agents] = await Promise.all([
    listWorkspaceObjects(membership.workspaceId),
    listWorkspaceAgents(membership.workspaceId),
  ]);

  return {
    membership,
    workspace: membership.workspace,
    objects,
    agents,
  };
}
