import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import type { IntakeSubmission } from '@/lib/intakeStore'

export type WorkspaceStatus = 'active' | 'paused' | 'archived'
export type ProjectStatus = 'draft' | 'onboarding' | 'active' | 'paused' | 'archived'
export type SitePublishStatus = 'draft' | 'reviewing' | 'ready' | 'published' | 'archived'
export type AgentRoleType = 'intake_assistant' | 'lead_qualifier' | 'crm_updater' | 'follow_up' | 'ops_assistant' | 'custom'
export type AgentDeploymentStatus = 'pending' | 'building' | 'running' | 'degraded' | 'stopped' | 'failed'
export type AgentRuntimeType = 'copilot' | 'channel' | 'worker'

export type WorkspaceDashboardCardType = 'metric' | 'table' | 'queue' | 'activity' | 'status' | 'chart'

export type Workspace = {
  id: string
  slug: string
  name: string
  status: WorkspaceStatus
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type Project = {
  id: string
  workspaceId: string
  name: string
  status: ProjectStatus
  industry?: string
  primaryColor?: string
  intakeSubmissionId?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type LandingTemplate = {
  id: string
  key: string
  name: string
  vertical?: string
  sectionSchema: unknown[]
  defaultContent: Record<string, unknown>
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type AgentTemplate = {
  id: string
  name: string
  description?: string
  type: 'copilot' | 'channel' | 'worker' | 'chatbot'
  category?: string
  defaultSoulMd?: string
  defaultSkills: string[]
  defaultKnowledgeScope: Record<string, unknown>
  defaultCronJobs: unknown[]
  defaultChannelConfig: Record<string, unknown>
  defaultMemoryConfig: Record<string, unknown>
  icon?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type WorkspaceDashboardCard = {
  id: string
  workspaceId: string
  dashboardId?: string
  cardType: WorkspaceDashboardCardType
  title: string
  subtitle?: string
  config: Record<string, unknown>
  position: number
  gridWidth: number
  isVisible: boolean
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export type LandingSite = {
  id: string
  workspaceId: string
  projectId?: string
  templateId: string
  name: string
  subdomain: string
  publishStatus: SitePublishStatus
  content: Record<string, unknown>
  themeConfig: Record<string, unknown>
  seoConfig: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type AgentDefinition = {
  id: string
  workspaceId: string
  projectId?: string
  name: string
  role: AgentRoleType
  model: string
  promptPack: Record<string, unknown>
  toolsConfig: Record<string, unknown>
  integrationConfig: Record<string, unknown>
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type AgentDeployment = {
  id: string
  workspaceId: string
  agentDefinitionId: string
  dropletHost: string
  containerName: string
  imageRef: string
  envSecretRef?: string
  deploymentVersion: number
  status: AgentDeploymentStatus
  healthDetails: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type UsageEvent = {
  id: string
  workspaceId: string
  projectId?: string
  source: string
  eventName: string
  eventValue?: number
  eventMetadata: Record<string, unknown>
  createdAt: string
}

export type ProvisioningJob = {
  id: string
  workspaceId?: string
  intakeSubmissionId?: string
  jobType: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  payload: Record<string, unknown>
  result: Record<string, unknown>
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

type PlatformState = {
  workspaces: Workspace[]
  projects: Project[]
  templates: LandingTemplate[]
  agentTemplates: AgentTemplate[]
  dashboardCards: WorkspaceDashboardCard[]
  sites: LandingSite[]
  agents: AgentDefinition[]
  deployments: AgentDeployment[]
  usageEvents: UsageEvent[]
  provisioningJobs: ProvisioningJob[]
}

type CreateWorkspaceInput = {
  slug?: string
  name: string
  metadata?: Record<string, unknown>
}

type CreateProjectInput = {
  workspaceId: string
  name: string
  status?: ProjectStatus
  industry?: string
  primaryColor?: string
  intakeSubmissionId?: string
  metadata?: Record<string, unknown>
}

type CreateTemplateInput = {
  key: string
  name: string
  vertical?: string
  sectionSchema?: unknown[]
  defaultContent?: Record<string, unknown>
}

type CreateAgentTemplateInput = {
  name: string
  description?: string
  type: AgentTemplate['type']
  category?: string
  defaultSoulMd?: string
  defaultSkills?: string[]
  defaultKnowledgeScope?: Record<string, unknown>
  defaultCronJobs?: unknown[]
  defaultChannelConfig?: Record<string, unknown>
  defaultMemoryConfig?: Record<string, unknown>
  icon?: string
  isActive?: boolean
}

type UpdateAgentTemplateInput = Partial<CreateAgentTemplateInput>

type CreateAgentInput = {
  workspaceId: string
  projectId?: string
  name: string
  role: AgentRoleType
  model?: string
  promptPack?: Record<string, unknown>
  toolsConfig?: Record<string, unknown>
  integrationConfig?: Record<string, unknown>
}

type UpdateAgentInput = {
  workspaceId: string
  name?: string
  role?: AgentRoleType
  model?: string
  promptPack?: Record<string, unknown>
  toolsConfig?: Record<string, unknown>
  integrationConfig?: Record<string, unknown>
  isActive?: boolean
}

type CreateDeploymentInput = {
  workspaceId: string
  agentDefinitionId: string
  dropletHost: string
  containerName: string
  imageRef: string
  envSecretRef?: string
  status?: AgentDeploymentStatus
}

type TrackUsageInput = {
  workspaceId: string
  projectId?: string
  source: string
  eventName: string
  eventValue?: number
  eventMetadata?: Record<string, unknown>
}

const dataPath = path.join(process.cwd(), '.data', 'platform-state.json')
const localFallbackDisabled = process.env.PRISMA_DISABLE_LOCAL_FALLBACK === 'true'

function nowIso() {
  return new Date().toISOString()
}

function buildId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`
}

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || `workspace-${Date.now().toString(36)}`
}

function withDate<T extends { createdAt: string; updatedAt: string }>(value: Omit<T, 'createdAt' | 'updatedAt'>): T {
  const now = nowIso()
  return { ...value, createdAt: now, updatedAt: now } as T
}

function assertLocalFallbackAllowed(operation: string) {
  if (localFallbackDisabled) {
    throw new Error(`${operation} failed and PRISMA_DISABLE_LOCAL_FALLBACK=true.`)
  }
}

const defaultTemplates: LandingTemplate[] = [
  withDate<LandingTemplate>({
    id: 'tmpl_legal_base',
    key: 'legal-base',
    name: 'Legal Intake Base',
    vertical: 'legal',
    sectionSchema: ['hero', 'trust', 'services', 'faq', 'cta'],
    defaultContent: {
      hero: { title: 'Tu firma legal con IA', subtitle: 'Captura y califica casos 24/7' },
      cta: { label: 'Comenzar intake' },
    },
    isActive: true,
  }),
  withDate<LandingTemplate>({
    id: 'tmpl_finance_base',
    key: 'finance-base',
    name: 'Finance Conversion Base',
    vertical: 'finance',
    sectionSchema: ['hero', 'proof', 'services', 'insights', 'cta'],
    defaultContent: {
      hero: { title: 'Acelera tu captacion con IA', subtitle: 'Landing + agente + CRM en una sola base' },
      cta: { label: 'Solicitar onboarding' },
    },
    isActive: true,
  }),
]

const defaultAgentTemplates: AgentTemplate[] = [
  withDate<AgentTemplate>({
    id: 'agt_tmpl_whatsapp_qualifier',
    name: 'WhatsApp Qualifier',
    description: 'Califica leads entrantes y actualiza el workspace.',
    type: 'channel',
    category: 'lead_qualification',
    defaultSoulMd: 'Eres un agente especializado en calificar leads entrantes por WhatsApp.',
    defaultSkills: ['prisma-records', 'prisma-qualify'],
    defaultKnowledgeScope: {
      read: ['Contacts', 'Deals'],
      write: ['Contacts', 'Deals'],
      channels: ['whatsapp'],
    },
    defaultCronJobs: [],
    defaultChannelConfig: { provider: 'whatsapp' },
    defaultMemoryConfig: { recent: true, preferences: true, intelligence: false },
    icon: 'message-square',
    isActive: true,
  }),
  withDate<AgentTemplate>({
    id: 'agt_tmpl_crm_monitor',
    name: 'CRM Monitor',
    description: 'Da seguimiento a pipeline, leads estancados y actividad pendiente.',
    type: 'worker',
    category: 'crm_monitor',
    defaultSoulMd: 'Supervisa el CRM y prioriza seguimientos de alto impacto.',
    defaultSkills: ['prisma-records'],
    defaultKnowledgeScope: {
      read: ['Contacts', 'Companies', 'Deals'],
      write: ['Deals'],
      channels: [],
    },
    defaultCronJobs: [{ schedule: '0 */2 * * *', job: 'check_stale_pipeline' }],
    defaultChannelConfig: {},
    defaultMemoryConfig: { recent: true, preferences: false, intelligence: true },
    icon: 'bot',
    isActive: true,
  }),
]

async function readState(): Promise<PlatformState> {
  try {
    const raw = await readFile(dataPath, 'utf8')
    const parsed = JSON.parse(raw) as PlatformState
    return {
      workspaces: parsed.workspaces ?? [],
      projects: parsed.projects ?? [],
      templates: parsed.templates?.length ? parsed.templates : defaultTemplates,
      agentTemplates: parsed.agentTemplates?.length ? parsed.agentTemplates : defaultAgentTemplates,
      dashboardCards: parsed.dashboardCards ?? [],
      sites: parsed.sites ?? [],
      agents: parsed.agents ?? [],
      deployments: parsed.deployments ?? [],
      usageEvents: parsed.usageEvents ?? [],
      provisioningJobs: parsed.provisioningJobs ?? [],
    }
  } catch {
    return {
      workspaces: [],
      projects: [],
      templates: defaultTemplates,
      agentTemplates: defaultAgentTemplates,
      dashboardCards: [],
      sites: [],
      agents: [],
      deployments: [],
      usageEvents: [],
      provisioningJobs: [],
    }
  }
}

async function writeState(state: PlatformState) {
  await mkdir(path.dirname(dataPath), { recursive: true })
  await writeFile(dataPath, JSON.stringify(state, null, 2), 'utf8')
}

function fromWorkspaceRow(row: Record<string, unknown>): Workspace {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    status: (row.status as WorkspaceStatus) ?? 'active',
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  }
}

function toWorkspaceRow(workspace: Workspace) {
  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    status: workspace.status,
    metadata: workspace.metadata,
    created_at: workspace.createdAt,
    updated_at: workspace.updatedAt,
  }
}

function fromTemplateRow(row: Record<string, unknown>): LandingTemplate {
  return {
    id: String(row.id),
    key: String(row.key),
    name: String(row.name),
    vertical: row.vertical ? String(row.vertical) : undefined,
    sectionSchema: (row.section_schema as unknown[]) ?? [],
    defaultContent: (row.default_content as Record<string, unknown>) ?? {},
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  }
}

function toTemplateRow(template: LandingTemplate) {
  return {
    id: template.id,
    key: template.key,
    name: template.name,
    vertical: template.vertical ?? null,
    section_schema: template.sectionSchema,
    default_content: template.defaultContent,
    is_active: template.isActive,
    created_at: template.createdAt,
    updated_at: template.updatedAt,
  }
}

function fromProjectRow(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    status: (row.status as ProjectStatus) ?? 'draft',
    industry: row.industry ? String(row.industry) : undefined,
    primaryColor: row.primary_color ? String(row.primary_color) : undefined,
    intakeSubmissionId: row.intake_submission_id ? String(row.intake_submission_id) : undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  }
}

function toProjectRow(project: Project) {
  return {
    id: project.id,
    workspace_id: project.workspaceId,
    name: project.name,
    status: project.status,
    industry: project.industry ?? null,
    primary_color: project.primaryColor ?? null,
    intake_submission_id: project.intakeSubmissionId ?? null,
    metadata: project.metadata,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  }
}

function fromSiteRow(row: Record<string, unknown>): LandingSite {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: row.project_id ? String(row.project_id) : undefined,
    templateId: String(row.template_id),
    name: String(row.name),
    subdomain: String(row.subdomain),
    publishStatus: (row.publish_status as SitePublishStatus) ?? 'draft',
    content: (row.content as Record<string, unknown>) ?? {},
    themeConfig: (row.theme_config as Record<string, unknown>) ?? {},
    seoConfig: (row.seo_config as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  }
}

function toSiteRow(site: LandingSite) {
  return {
    id: site.id,
    workspace_id: site.workspaceId,
    project_id: site.projectId ?? null,
    template_id: site.templateId,
    name: site.name,
    subdomain: site.subdomain,
    publish_status: site.publishStatus,
    content: site.content,
    theme_config: site.themeConfig,
    seo_config: site.seoConfig,
    created_at: site.createdAt,
    updated_at: site.updatedAt,
  }
}

function fromAgentRow(row: Record<string, unknown>): AgentDefinition {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: row.project_id ? String(row.project_id) : undefined,
    name: String(row.name),
    role: (row.role as AgentRoleType) ?? 'custom',
    model: String(row.model),
    promptPack: (row.prompt_pack as Record<string, unknown>) ?? {},
    toolsConfig: (row.tools_config as Record<string, unknown>) ?? {},
    integrationConfig: (row.integration_config as Record<string, unknown>) ?? {},
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  }
}

function toAgentRow(agent: AgentDefinition) {
  return {
    id: agent.id,
    workspace_id: agent.workspaceId,
    project_id: agent.projectId ?? null,
    name: agent.name,
    role: agent.role,
    model: agent.model,
    prompt_pack: agent.promptPack,
    tools_config: agent.toolsConfig,
    integration_config: agent.integrationConfig,
    is_active: agent.isActive,
    created_at: agent.createdAt,
    updated_at: agent.updatedAt,
  }
}

function isLegacyAgentRole(value: unknown): value is AgentRoleType {
  return (
    value === 'intake_assistant' ||
    value === 'lead_qualifier' ||
    value === 'crm_updater' ||
    value === 'follow_up' ||
    value === 'ops_assistant' ||
    value === 'custom'
  )
}

function roleToRuntimeType(role: AgentRoleType): AgentRuntimeType {
  if (role === 'intake_assistant' || role === 'ops_assistant') {
    return 'copilot'
  }
  if (role === 'lead_qualifier' || role === 'follow_up') {
    return 'channel'
  }
  return 'worker'
}

function runtimeTypeToRole(type: AgentRuntimeType): AgentRoleType {
  if (type === 'copilot') {
    return 'intake_assistant'
  }
  if (type === 'channel') {
    return 'lead_qualifier'
  }
  return 'custom'
}

function deploymentStatusFromRuntime(status: string): AgentDeploymentStatus {
  if (status === 'deploying') return 'building'
  if (status === 'active') return 'running'
  if (status === 'paused') return 'stopped'
  if (status === 'error') return 'failed'
  return 'pending'
}

function runtimeStatusFromDeployment(status: AgentDeploymentStatus) {
  if (status === 'running') return 'active'
  if (status === 'building') return 'deploying'
  if (status === 'stopped') return 'paused'
  if (status === 'failed' || status === 'degraded') return 'error'
  return 'deploying'
}

function hostFromEndpoint(endpoint: string) {
  try {
    return new URL(endpoint).hostname
  } catch {
    return endpoint
  }
}

function fromWorkspaceAgentRow(row: Record<string, unknown>): AgentDefinition {
  const knowledgeScope = (row.knowledge_scope as Record<string, unknown>) ?? {}
  const runtimeType = (row.type as AgentRuntimeType) ?? 'worker'
  const legacyRole = knowledgeScope.legacy_role
  const resolvedRole = isLegacyAgentRole(legacyRole) ? legacyRole : runtimeTypeToRole(runtimeType)

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: undefined,
    name: String(row.name),
    role: resolvedRole,
    model: typeof knowledgeScope.model === 'string' ? knowledgeScope.model : process.env.HERMES_MODEL ?? 'hermes-agent',
    promptPack: {
      soulMd: row.soul_md ?? '',
    },
    toolsConfig: {
      skills: (row.skills as string[]) ?? [],
    },
    integrationConfig: {
      runtime: 'hermes',
      endpoint: row.api_endpoint ?? '',
      status: row.status ?? 'deploying',
      type: runtimeType,
    },
    isActive: String(row.status ?? 'active') === 'active',
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  }
}

function toWorkspaceAgentRow(agent: AgentDefinition) {
  const runtimeType = roleToRuntimeType(agent.role)
  const configuredSkills = Array.isArray(agent.toolsConfig.skills)
    ? (agent.toolsConfig.skills as string[])
    : []
  const endpoint =
    (typeof agent.integrationConfig.endpoint === 'string' && agent.integrationConfig.endpoint) ||
    'http://localhost:8642'
  const apiKey =
    (typeof agent.integrationConfig.apiKey === 'string' && agent.integrationConfig.apiKey) ||
    'replace-me'
  const version =
    (typeof agent.integrationConfig.hermesVersion === 'string' && agent.integrationConfig.hermesVersion) ||
    'v2026.4.1'

  return {
    id: agent.id,
    workspace_id: agent.workspaceId,
    name: agent.name,
    type: runtimeType,
    description:
      typeof agent.promptPack.objective === 'string'
        ? agent.promptPack.objective
        : null,
    container_name: `hermes-${agent.workspaceId.slice(0, 8)}-${agent.role}`,
    api_endpoint: endpoint,
    api_key: apiKey,
    hermes_version: version,
    status: agent.isActive ? 'active' : 'paused',
    soul_md: typeof agent.promptPack.soulMd === 'string' ? agent.promptPack.soulMd : null,
    skills: configuredSkills,
    knowledge_scope: {
      legacy_role: agent.role,
      model: agent.model,
    },
    cron_jobs: [],
    channel_config: {},
    memory_limit_mb: 512,
    cpu_limit: 0.5,
    created_at: agent.createdAt,
    updated_at: agent.updatedAt,
  }
}

function fromDeploymentRow(row: Record<string, unknown>): AgentDeployment {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    agentDefinitionId: String(row.agent_definition_id),
    dropletHost: String(row.droplet_host),
    containerName: String(row.container_name),
    imageRef: String(row.image_ref),
    envSecretRef: row.env_secret_ref ? String(row.env_secret_ref) : undefined,
    deploymentVersion: Number(row.deployment_version ?? 1),
    status: (row.status as AgentDeploymentStatus) ?? 'pending',
    healthDetails: (row.health_details as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  }
}

function toDeploymentRow(deployment: AgentDeployment) {
  return {
    id: deployment.id,
    workspace_id: deployment.workspaceId,
    agent_definition_id: deployment.agentDefinitionId,
    droplet_host: deployment.dropletHost,
    container_name: deployment.containerName,
    image_ref: deployment.imageRef,
    env_secret_ref: deployment.envSecretRef ?? null,
    deployment_version: deployment.deploymentVersion,
    status: deployment.status,
    health_details: deployment.healthDetails,
    created_at: deployment.createdAt,
    updated_at: deployment.updatedAt,
  }
}

function fromUsageRow(row: Record<string, unknown>): UsageEvent {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: row.project_id ? String(row.project_id) : undefined,
    source: String(row.source),
    eventName: String(row.event_name),
    eventValue: row.event_value !== null && row.event_value !== undefined ? Number(row.event_value) : undefined,
    eventMetadata: (row.event_metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? nowIso()),
  }
}

function toUsageRow(event: UsageEvent) {
  return {
    id: event.id,
    workspace_id: event.workspaceId,
    project_id: event.projectId ?? null,
    source: event.source,
    event_name: event.eventName,
    event_value: event.eventValue ?? null,
    event_metadata: event.eventMetadata,
    created_at: event.createdAt,
  }
}

function fromAgentTemplateRow(row: Record<string, unknown>): AgentTemplate {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    type: (row.type as AgentTemplate['type']) ?? 'worker',
    category: row.category ? String(row.category) : undefined,
    defaultSoulMd: row.default_soul_md ? String(row.default_soul_md) : undefined,
    defaultSkills: Array.isArray(row.default_skills) ? (row.default_skills as string[]) : [],
    defaultKnowledgeScope: (row.default_knowledge_scope as Record<string, unknown>) ?? {},
    defaultCronJobs: Array.isArray(row.default_cron_jobs) ? (row.default_cron_jobs as unknown[]) : [],
    defaultChannelConfig: (row.default_channel_config as Record<string, unknown>) ?? {},
    defaultMemoryConfig: (row.default_memory_config as Record<string, unknown>) ?? {},
    icon: row.icon ? String(row.icon) : undefined,
    isActive: row.is_active === undefined ? true : Boolean(row.is_active),
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  }
}

function toAgentTemplateRow(template: AgentTemplate) {
  return {
    id: template.id,
    name: template.name,
    description: template.description ?? null,
    type: template.type,
    category: template.category ?? null,
    default_soul_md: template.defaultSoulMd ?? null,
    default_skills: template.defaultSkills,
    default_knowledge_scope: template.defaultKnowledgeScope,
    default_cron_jobs: template.defaultCronJobs,
    default_channel_config: template.defaultChannelConfig,
    default_memory_config: template.defaultMemoryConfig,
    icon: template.icon ?? null,
    is_active: template.isActive,
    created_at: template.createdAt,
    updated_at: template.updatedAt,
  }
}

export async function listWorkspaces() {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase.from('workspaces').select('*').order('created_at', { ascending: false })
    if (!error && data) {
      return data.map((row) => fromWorkspaceRow(row as Record<string, unknown>))
    }
  }

  const state = await readState()
  return [...state.workspaces].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
}

export async function createWorkspace(input: CreateWorkspaceInput) {
  const record: Workspace = withDate({
    id: buildId('ws'),
    slug: input.slug ? slugify(input.slug) : slugify(input.name),
    name: input.name.trim(),
    status: 'active',
    metadata: input.metadata ?? {},
  })

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase.from('workspaces').insert(toWorkspaceRow(record)).select().single()
    if (!error && data) {
      return fromWorkspaceRow(data as Record<string, unknown>)
    }
    console.warn('Supabase createWorkspace failed, falling back to local state:', error?.message)
  }

  const state = await readState()
  if (state.workspaces.some((workspace) => workspace.slug === record.slug)) {
    throw new Error('Workspace slug already exists')
  }
  state.workspaces.push(record)
  await writeState(state)
  return record
}

export async function listTemplates() {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase.from('landing_templates').select('*').order('created_at', { ascending: false })
    if (!error && data) {
      return data.map((row) => fromTemplateRow(row as Record<string, unknown>))
    }
  }

  const state = await readState()
  return [...state.templates].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
}

export async function createTemplate(input: CreateTemplateInput) {
  const record: LandingTemplate = withDate({
    id: buildId('tmpl'),
    key: slugify(input.key),
    name: input.name.trim(),
    vertical: input.vertical?.trim() || undefined,
    sectionSchema: input.sectionSchema ?? [],
    defaultContent: input.defaultContent ?? {},
    isActive: true,
  })

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase.from('landing_templates').insert(toTemplateRow(record)).select().single()
    if (!error && data) {
      return fromTemplateRow(data as Record<string, unknown>)
    }
    console.warn('Supabase createTemplate failed, falling back to local state:', error?.message)
  }

  const state = await readState()
  if (state.templates.some((template) => template.key === record.key)) {
    throw new Error('Template key already exists')
  }
  state.templates.push(record)
  await writeState(state)
  return record
}

export async function listAgentTemplates() {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase.from('agent_templates').select('*').order('created_at', { ascending: false })
    if (!error && data) {
      return (data as Record<string, unknown>[]).map((row) => fromAgentTemplateRow(row))
    }
  }

  const state = await readState()
  return [...state.agentTemplates].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
}

export async function createAgentTemplate(input: CreateAgentTemplateInput) {
  const record: AgentTemplate = withDate({
    id: buildId('agt_tmpl'),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    type: input.type,
    category: input.category?.trim() || undefined,
    defaultSoulMd: input.defaultSoulMd?.trim() || undefined,
    defaultSkills: input.defaultSkills ?? [],
    defaultKnowledgeScope: input.defaultKnowledgeScope ?? {},
    defaultCronJobs: input.defaultCronJobs ?? [],
    defaultChannelConfig: input.defaultChannelConfig ?? {},
    defaultMemoryConfig: input.defaultMemoryConfig ?? {},
    icon: input.icon?.trim() || undefined,
    isActive: input.isActive ?? true,
  })

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase.from('agent_templates').insert(toAgentTemplateRow(record)).select().single()
    if (!error && data) {
      return fromAgentTemplateRow(data as Record<string, unknown>)
    }
    console.warn('Supabase createAgentTemplate failed, falling back to local state:', error?.message)
  }

  const state = await readState()
  state.agentTemplates.push(record)
  await writeState(state)
  return record
}

export async function updateAgentTemplate(templateId: string, input: UpdateAgentTemplateInput) {
  const supabase = getSupabaseAdmin()
  const nextUpdatedAt = nowIso()

  if (supabase) {
    const payload: Record<string, unknown> = {
      updated_at: nextUpdatedAt,
    }
    if (input.name !== undefined) payload.name = input.name.trim()
    if (input.description !== undefined) payload.description = input.description?.trim() || null
    if (input.type !== undefined) payload.type = input.type
    if (input.category !== undefined) payload.category = input.category?.trim() || null
    if (input.defaultSoulMd !== undefined) payload.default_soul_md = input.defaultSoulMd?.trim() || null
    if (input.defaultSkills !== undefined) payload.default_skills = input.defaultSkills
    if (input.defaultKnowledgeScope !== undefined) payload.default_knowledge_scope = input.defaultKnowledgeScope
    if (input.defaultCronJobs !== undefined) payload.default_cron_jobs = input.defaultCronJobs
    if (input.defaultChannelConfig !== undefined) payload.default_channel_config = input.defaultChannelConfig
    if (input.defaultMemoryConfig !== undefined) payload.default_memory_config = input.defaultMemoryConfig
    if (input.icon !== undefined) payload.icon = input.icon?.trim() || null
    if (input.isActive !== undefined) payload.is_active = input.isActive

    const { data, error } = await supabase.from('agent_templates').update(payload).eq('id', templateId).select().maybeSingle()
    if (!error && data) {
      return fromAgentTemplateRow(data as Record<string, unknown>)
    }
    console.warn('Supabase updateAgentTemplate failed, falling back to local state:', error?.message)
  }

  const state = await readState()
  const index = state.agentTemplates.findIndex((template) => template.id === templateId)
  if (index < 0) {
    return null
  }

  state.agentTemplates[index] = {
    ...state.agentTemplates[index],
    name: input.name?.trim() || state.agentTemplates[index].name,
    description: input.description !== undefined ? input.description?.trim() || undefined : state.agentTemplates[index].description,
    type: input.type ?? state.agentTemplates[index].type,
    category: input.category !== undefined ? input.category?.trim() || undefined : state.agentTemplates[index].category,
    defaultSoulMd: input.defaultSoulMd !== undefined ? input.defaultSoulMd?.trim() || undefined : state.agentTemplates[index].defaultSoulMd,
    defaultSkills: input.defaultSkills ?? state.agentTemplates[index].defaultSkills,
    defaultKnowledgeScope: input.defaultKnowledgeScope ?? state.agentTemplates[index].defaultKnowledgeScope,
    defaultCronJobs: input.defaultCronJobs ?? state.agentTemplates[index].defaultCronJobs,
    defaultChannelConfig: input.defaultChannelConfig ?? state.agentTemplates[index].defaultChannelConfig,
    defaultMemoryConfig: input.defaultMemoryConfig ?? state.agentTemplates[index].defaultMemoryConfig,
    icon: input.icon !== undefined ? input.icon?.trim() || undefined : state.agentTemplates[index].icon,
    isActive: input.isActive ?? state.agentTemplates[index].isActive,
    updatedAt: nextUpdatedAt,
  }
  await writeState(state)
  return state.agentTemplates[index]
}

export async function deleteAgentTemplate(templateId: string) {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { error } = await supabase.from('agent_templates').delete().eq('id', templateId)
    if (!error) {
      return true
    }
    console.warn('Supabase deleteAgentTemplate failed, falling back to local state:', error?.message)
  }

  const state = await readState()
  const next = state.agentTemplates.filter((template) => template.id !== templateId)
  if (next.length === state.agentTemplates.length) {
    return false
  }
  state.agentTemplates = next
  await writeState(state)
  return true
}

export async function listDashboardCardsForWorkspace(workspaceId: string) {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase
      .from('workspace_dashboard_cards')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_visible', true)
      .order('position', { ascending: true })

    if (!error && data) {
      return (data as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        dashboardId: row.dashboard_id ? String(row.dashboard_id) : undefined,
        cardType: (row.card_type as WorkspaceDashboardCardType) ?? 'metric',
        title: String(row.title),
        subtitle: row.subtitle ? String(row.subtitle) : undefined,
        config: (row.config as Record<string, unknown>) ?? {},
        position: Number(row.position ?? 0),
        gridWidth: Number(row.grid_width ?? 1),
        isVisible: row.is_visible === undefined ? true : Boolean(row.is_visible),
        createdBy: row.created_by ? String(row.created_by) : undefined,
        createdAt: String(row.created_at ?? nowIso()),
        updatedAt: String(row.updated_at ?? nowIso()),
      }))
    }
  }

  const state = await readState()
  return state.dashboardCards
    .filter((card) => card.workspaceId === workspaceId && card.isVisible)
    .sort((a, b) => a.position - b.position)
}

export async function listProjects(workspaceId?: string) {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    let query = supabase.from('projects').select('*').order('created_at', { ascending: false })
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId)
    }
    const { data, error } = await query
    if (!error && data) {
      return data.map((row) => fromProjectRow(row as Record<string, unknown>))
    }
  }

  const state = await readState()
  const projects = workspaceId ? state.projects.filter((project) => project.workspaceId === workspaceId) : state.projects
  return [...projects].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
}

export async function createProject(input: CreateProjectInput) {
  const record: Project = withDate({
    id: buildId('prj'),
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    status: input.status ?? 'draft',
    industry: input.industry,
    primaryColor: input.primaryColor,
    intakeSubmissionId: input.intakeSubmissionId,
    metadata: input.metadata ?? {},
  })

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase.from('projects').insert(toProjectRow(record)).select().single()
    if (!error && data) {
      return fromProjectRow(data as Record<string, unknown>)
    }
    console.warn('Supabase createProject failed, falling back to local state:', error?.message)
  }

  const state = await readState()
  state.projects.push(record)
  await writeState(state)
  return record
}

export async function listSites(workspaceId?: string) {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    let query = supabase.from('landing_sites').select('*').order('created_at', { ascending: false })
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId)
    }
    const { data, error } = await query
    if (!error && data) {
      return data.map((row) => fromSiteRow(row as Record<string, unknown>))
    }
  }

  const state = await readState()
  const sites = workspaceId ? state.sites.filter((site) => site.workspaceId === workspaceId) : state.sites
  return [...sites].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
}

export async function createSite(input: Omit<LandingSite, 'id' | 'createdAt' | 'updatedAt'>) {
  const record: LandingSite = withDate({
    ...input,
    id: buildId('site'),
  })

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase.from('landing_sites').insert(toSiteRow(record)).select().single()
    if (!error && data) {
      return fromSiteRow(data as Record<string, unknown>)
    }
    console.warn('Supabase createSite failed, falling back to local state:', error?.message)
  }

  const state = await readState()
  state.sites.push(record)
  await writeState(state)
  return record
}

export async function getSiteById(siteId: string) {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase.from('landing_sites').select('*').eq('id', siteId).maybeSingle()
    if (!error && data) {
      return fromSiteRow(data as Record<string, unknown>)
    }
  }

  const state = await readState()
  return state.sites.find((site) => site.id === siteId) ?? null
}

export async function updateSitePublishStatus(siteId: string, publishStatus: SitePublishStatus) {
  const updatedAt = nowIso()
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase
      .from('landing_sites')
      .update({
        publish_status: publishStatus,
        published_at: publishStatus === 'published' ? updatedAt : null,
        updated_at: updatedAt,
      })
      .eq('id', siteId)
      .select()
      .maybeSingle()

    if (!error && data) {
      return fromSiteRow(data as Record<string, unknown>)
    }
  }

  const state = await readState()
  const idx = state.sites.findIndex((site) => site.id === siteId)
  if (idx < 0) {
    return null
  }

  state.sites[idx] = {
    ...state.sites[idx],
    publishStatus,
    updatedAt,
  }
  await writeState(state)
  return state.sites[idx]
}

export async function listAgents(workspaceId?: string) {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    let workspaceAgentsQuery = supabase.from('workspace_agents').select('*').order('created_at', { ascending: false })
    if (workspaceId) {
      workspaceAgentsQuery = workspaceAgentsQuery.eq('workspace_id', workspaceId)
    }
    const workspaceAgentsResult = await workspaceAgentsQuery
    if (!workspaceAgentsResult.error && workspaceAgentsResult.data) {
      return workspaceAgentsResult.data.map((row) => fromWorkspaceAgentRow(row as Record<string, unknown>))
    }

    let legacyQuery = supabase.from('agent_definitions').select('*').order('created_at', { ascending: false })
    if (workspaceId) {
      legacyQuery = legacyQuery.eq('workspace_id', workspaceId)
    }
    const legacyResult = await legacyQuery
    if (!legacyResult.error && legacyResult.data) {
      return legacyResult.data.map((row) => fromAgentRow(row as Record<string, unknown>))
    }
  }

  assertLocalFallbackAllowed('listAgents')
  const state = await readState()
  const agents = workspaceId ? state.agents.filter((agent) => agent.workspaceId === workspaceId) : state.agents
  return [...agents].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
}

export async function createAgentDefinition(input: CreateAgentInput) {
  const record: AgentDefinition = withDate({
    id: buildId('agt'),
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    name: input.name.trim(),
    role: input.role,
    model: input.model ?? process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
    promptPack: input.promptPack ?? {},
    toolsConfig: input.toolsConfig ?? {},
    integrationConfig: input.integrationConfig ?? {},
    isActive: true,
  })

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const workspaceAgentInsert = await supabase.from('workspace_agents').insert(toWorkspaceAgentRow(record)).select().single()
    if (!workspaceAgentInsert.error && workspaceAgentInsert.data) {
      return fromWorkspaceAgentRow(workspaceAgentInsert.data as Record<string, unknown>)
    }

    const legacyInsert = await supabase.from('agent_definitions').insert(toAgentRow(record)).select().single()
    if (!legacyInsert.error && legacyInsert.data) {
      return fromAgentRow(legacyInsert.data as Record<string, unknown>)
    }
    console.warn(
      'Supabase createAgentDefinition failed, falling back to local state:',
      workspaceAgentInsert.error?.message ?? legacyInsert.error?.message,
    )
  }

  assertLocalFallbackAllowed('createAgentDefinition')
  const state = await readState()
  state.agents.push(record)
  await writeState(state)
  return record
}

export async function updateAgentDefinition(agentId: string, input: UpdateAgentInput) {
  const supabase = getSupabaseAdmin()
  const updatedAt = nowIso()

  if (supabase) {
    const runtimeType = input.role ? roleToRuntimeType(input.role) : undefined
    const configuredSkills = Array.isArray(input.toolsConfig?.skills)
      ? (input.toolsConfig?.skills as string[])
      : undefined
    const objective =
      typeof input.promptPack?.objective === 'string'
        ? input.promptPack.objective
        : typeof input.promptPack?.description === 'string'
          ? input.promptPack.description
          : undefined
    const knowledgeScope =
      (input.integrationConfig?.knowledgeScope as Record<string, unknown> | undefined) ??
      (input.toolsConfig?.knowledgeScope as Record<string, unknown> | undefined)

    const { data, error } = await supabase
      .from('workspace_agents')
      .update({
        ...(input.name ? { name: input.name } : {}),
        ...(runtimeType ? { type: runtimeType } : {}),
        ...(objective !== undefined ? { description: objective } : {}),
        ...(typeof input.promptPack?.soulMd === 'string' ? { soul_md: input.promptPack.soulMd } : {}),
        ...(configuredSkills ? { skills: configuredSkills } : {}),
        ...(knowledgeScope ? { knowledge_scope: knowledgeScope } : {}),
        ...(Array.isArray(input.integrationConfig?.cronJobs) ? { cron_jobs: input.integrationConfig?.cronJobs } : {}),
        ...(input.isActive !== undefined ? { status: input.isActive ? 'active' : 'paused' } : {}),
        updated_at: updatedAt,
      })
      .eq('id', agentId)
      .eq('workspace_id', input.workspaceId)
      .select()
      .maybeSingle()

    if (!error && data) {
      return fromWorkspaceAgentRow(data as Record<string, unknown>)
    }
    console.warn('Supabase updateAgentDefinition failed, falling back to local state:', error?.message)
  }

  assertLocalFallbackAllowed('updateAgentDefinition')
  const state = await readState()
  const idx = state.agents.findIndex((agent) => agent.id === agentId && agent.workspaceId === input.workspaceId)
  if (idx < 0) {
    throw new Error('Agent not found')
  }

  state.agents[idx] = {
    ...state.agents[idx],
    name: input.name ?? state.agents[idx].name,
    role: input.role ?? state.agents[idx].role,
    model: input.model ?? state.agents[idx].model,
    promptPack: input.promptPack ?? state.agents[idx].promptPack,
    toolsConfig: input.toolsConfig ?? state.agents[idx].toolsConfig,
    integrationConfig: input.integrationConfig ?? state.agents[idx].integrationConfig,
    isActive: input.isActive ?? state.agents[idx].isActive,
    updatedAt,
  }
  await writeState(state)
  return state.agents[idx]
}

export async function listDeployments(workspaceId?: string) {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    let workspaceAgentsQuery = supabase.from('workspace_agents').select('*').order('created_at', { ascending: false })
    if (workspaceId) {
      workspaceAgentsQuery = workspaceAgentsQuery.eq('workspace_id', workspaceId)
    }
    const workspaceAgentsResult = await workspaceAgentsQuery
    if (!workspaceAgentsResult.error && workspaceAgentsResult.data) {
      return workspaceAgentsResult.data.map((row) => {
        const typed = row as Record<string, unknown>
        return {
          id: String(typed.id),
          workspaceId: String(typed.workspace_id),
          agentDefinitionId: String(typed.id),
          dropletHost: hostFromEndpoint(String(typed.api_endpoint)),
          containerName: String(typed.container_name),
          imageRef: `prisma/hermes:${typed.hermes_version ?? 'stable'}`,
          envSecretRef: `secret://${typed.workspace_id}/hermes`,
          deploymentVersion: 1,
          status: deploymentStatusFromRuntime(String(typed.status ?? 'deploying')),
          healthDetails: {
            endpoint: typed.api_endpoint,
            runtimeStatus: typed.status,
          },
          createdAt: String(typed.created_at ?? nowIso()),
          updatedAt: String(typed.updated_at ?? nowIso()),
        } satisfies AgentDeployment
      })
    }

    let legacyQuery = supabase.from('agent_deployments').select('*').order('created_at', { ascending: false })
    if (workspaceId) {
      legacyQuery = legacyQuery.eq('workspace_id', workspaceId)
    }
    const legacyResult = await legacyQuery
    if (!legacyResult.error && legacyResult.data) {
      return legacyResult.data.map((row) => fromDeploymentRow(row as Record<string, unknown>))
    }
  }

  assertLocalFallbackAllowed('listDeployments')
  const state = await readState()
  const deployments = workspaceId
    ? state.deployments.filter((deployment) => deployment.workspaceId === workspaceId)
    : state.deployments
  return [...deployments].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
}

export async function createDeployment(input: CreateDeploymentInput) {
  const record: AgentDeployment = withDate({
    id: buildId('dep'),
    workspaceId: input.workspaceId,
    agentDefinitionId: input.agentDefinitionId,
    dropletHost: input.dropletHost,
    containerName: input.containerName,
    imageRef: input.imageRef,
    envSecretRef: input.envSecretRef,
    deploymentVersion: 1,
    status: input.status ?? 'pending',
    healthDetails: {},
  })

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const endpointHost = input.dropletHost.startsWith('http') ? input.dropletHost : `http://${input.dropletHost}`
    const endpoint = `${endpointHost.replace(/\/$/, '')}/v1`
    const runtimeUpdate = await supabase
      .from('workspace_agents')
      .update({
        container_name: input.containerName,
        api_endpoint: endpoint,
        hermes_version: input.imageRef,
        status: runtimeStatusFromDeployment(input.status ?? 'pending'),
        updated_at: nowIso(),
      })
      .eq('id', input.agentDefinitionId)
      .eq('workspace_id', input.workspaceId)
      .select()
      .maybeSingle()

    if (!runtimeUpdate.error && runtimeUpdate.data) {
      const row = runtimeUpdate.data as Record<string, unknown>
      return {
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        agentDefinitionId: String(row.id),
        dropletHost: input.dropletHost,
        containerName: String(row.container_name),
        imageRef: String(input.imageRef),
        envSecretRef: input.envSecretRef ?? `secret://${row.workspace_id}/hermes`,
        deploymentVersion: 1,
        status: deploymentStatusFromRuntime(String(row.status ?? 'deploying')),
        healthDetails: {
          endpoint: row.api_endpoint,
          runtimeStatus: row.status,
        },
        createdAt: String(row.created_at ?? nowIso()),
        updatedAt: String(row.updated_at ?? nowIso()),
      }
    }

    const legacyInsert = await supabase.from('agent_deployments').insert(toDeploymentRow(record)).select().single()
    if (!legacyInsert.error && legacyInsert.data) {
      return fromDeploymentRow(legacyInsert.data as Record<string, unknown>)
    }
    console.warn(
      'Supabase createDeployment failed, falling back to local state:',
      runtimeUpdate.error?.message ?? legacyInsert.error?.message,
    )
  }

  assertLocalFallbackAllowed('createDeployment')
  const state = await readState()
  state.deployments.push(record)
  await writeState(state)
  return record
}

export async function listUsageEvents(workspaceId?: string, limit = 100) {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    let query = supabase.from('usage_events').select('*').order('created_at', { ascending: false }).limit(limit)
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId)
    }
    const { data, error } = await query
    if (!error && data) {
      return data.map((row) => fromUsageRow(row as Record<string, unknown>))
    }
  }

  const state = await readState()
  const events = workspaceId ? state.usageEvents.filter((event) => event.workspaceId === workspaceId) : state.usageEvents
  return [...events].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)).slice(0, limit)
}

export async function trackUsageEvent(input: TrackUsageInput) {
  const record: UsageEvent = {
    id: buildId('evt'),
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    source: input.source,
    eventName: input.eventName,
    eventValue: input.eventValue,
    eventMetadata: input.eventMetadata ?? {},
    createdAt: nowIso(),
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase.from('usage_events').insert(toUsageRow(record)).select().single()
    if (!error && data) {
      return fromUsageRow(data as Record<string, unknown>)
    }
    console.warn('Supabase trackUsageEvent failed, falling back to local state:', error?.message)
  }

  const state = await readState()
  state.usageEvents.push(record)
  await writeState(state)
  return record
}

async function createProvisioningJob(input: Omit<ProvisioningJob, 'id' | 'createdAt' | 'updatedAt'>) {
  const record: ProvisioningJob = withDate({
    id: buildId('job'),
    ...input,
  })

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase
      .from('provisioning_jobs')
      .insert({
        id: record.id,
        workspace_id: record.workspaceId ?? null,
        intake_submission_id: record.intakeSubmissionId ?? null,
        job_type: record.jobType,
        status: record.status,
        payload: record.payload,
        result: record.result,
        error_message: record.errorMessage ?? null,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      })
      .select()
      .maybeSingle()

    if (!error && data) {
      const row = data as Record<string, unknown>
      return {
        id: String(row.id),
        workspaceId: row.workspace_id ? String(row.workspace_id) : undefined,
        intakeSubmissionId: row.intake_submission_id ? String(row.intake_submission_id) : undefined,
        jobType: String(row.job_type),
        status: (row.status as ProvisioningJob['status']) ?? 'queued',
        payload: (row.payload as Record<string, unknown>) ?? {},
        result: (row.result as Record<string, unknown>) ?? {},
        errorMessage: row.error_message ? String(row.error_message) : undefined,
        createdAt: String(row.created_at ?? nowIso()),
        updatedAt: String(row.updated_at ?? nowIso()),
      } satisfies ProvisioningJob
    }
    console.warn('Supabase createProvisioningJob failed, falling back to local state:', error?.message)
  }

  assertLocalFallbackAllowed('createProvisioningJob')
  const state = await readState()
  state.provisioningJobs.push(record)
  await writeState(state)
  return record
}

export async function provisionWorkspaceFromIntake(submission: IntakeSubmission) {
  const existingProjects = await listProjects()
  const existingProject = existingProjects.find((project) => project.intakeSubmissionId === submission.id)
  if (existingProject) {
    return {
      workspaceId: existingProject.workspaceId,
      projectId: existingProject.id,
      alreadyProvisioned: true,
    }
  }

  const workspace = await createWorkspace({
    name: submission.businessName,
    slug: slugify(submission.businessName),
    metadata: {
      intakeId: submission.id,
      contactEmail: submission.contactEmail,
      whatsappNumber: submission.whatsappNumber,
    },
  })

  const project = await createProject({
    workspaceId: workspace.id,
    name: `${submission.businessName} Launch`,
    status: submission.paymentStatus === 'paid' ? 'onboarding' : 'draft',
    industry: submission.industry,
    primaryColor: submission.primaryColor,
    intakeSubmissionId: submission.id,
    metadata: {
      lifecycleStatus: submission.lifecycleStatus,
      serviceDescription: submission.serviceDescription,
    },
  })

  const templates = await listTemplates()
  const selectedTemplate = templates.find((template) =>
    submission.industry.toLowerCase().includes('legal') ? template.key === 'legal-base' : template.key === 'finance-base',
  ) ?? templates[0]

  if (selectedTemplate) {
    await createSite({
      workspaceId: workspace.id,
      projectId: project.id,
      templateId: selectedTemplate.id,
      name: `${submission.businessName} Site`,
      subdomain: `${workspace.slug}.primas`,
      publishStatus: 'reviewing',
      content: {
        companyName: submission.businessName,
        serviceDescription: submission.serviceDescription,
        socialLinks: submission.socialLinks,
      },
      themeConfig: {
        primaryColor: submission.primaryColor ?? '#4f46e5',
      },
      seoConfig: {
        title: `${submission.businessName} | Prisma`,
      },
    })
  }

  await createProvisioningJob({
    workspaceId: workspace.id,
    intakeSubmissionId: submission.id,
    jobType: 'intake_to_workspace',
    status: 'completed',
    payload: {
      contactName: submission.contactName,
      contactEmail: submission.contactEmail,
      assets: submission.assets.length,
    },
    result: {
      workspaceId: workspace.id,
      projectId: project.id,
      templateKey: selectedTemplate?.key,
    },
  })

  await trackUsageEvent({
    workspaceId: workspace.id,
    projectId: project.id,
    source: 'provisioning',
    eventName: 'workspace.provisioned_from_intake',
    eventMetadata: { intakeId: submission.id, paymentStatus: submission.paymentStatus },
  })

  return {
    workspaceId: workspace.id,
    projectId: project.id,
    alreadyProvisioned: false,
  }
}

export async function queueProvisioningFromIntake(submission: IntakeSubmission) {
  return createProvisioningJob({
    intakeSubmissionId: submission.id,
    jobType: 'intake_received',
    status: 'queued',
    payload: {
      businessName: submission.businessName,
      industry: submission.industry,
      paymentStatus: submission.paymentStatus,
    },
    result: {},
  })
}

export async function listProvisioningJobs(limit = 50) {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase
      .from('provisioning_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!error && data) {
      return data.map((row) => {
        const typed = row as Record<string, unknown>
        return {
          id: String(typed.id),
          workspaceId: typed.workspace_id ? String(typed.workspace_id) : undefined,
          intakeSubmissionId: typed.intake_submission_id ? String(typed.intake_submission_id) : undefined,
          jobType: String(typed.job_type),
          status: (typed.status as ProvisioningJob['status']) ?? 'queued',
          payload: (typed.payload as Record<string, unknown>) ?? {},
          result: (typed.result as Record<string, unknown>) ?? {},
          errorMessage: typed.error_message ? String(typed.error_message) : undefined,
          createdAt: String(typed.created_at ?? nowIso()),
          updatedAt: String(typed.updated_at ?? nowIso()),
        } satisfies ProvisioningJob
      })
    }
  }

  assertLocalFallbackAllowed('listProvisioningJobs')
  const state = await readState()
  return [...state.provisioningJobs].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)).slice(0, limit)
}
