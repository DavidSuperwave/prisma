import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import type { IntakeSubmission } from '@/lib/intakeStore'

export type WorkspaceStatus = 'active' | 'paused' | 'archived'
export type ProjectStatus = 'draft' | 'onboarding' | 'active' | 'paused' | 'archived'
export type SitePublishStatus = 'draft' | 'reviewing' | 'ready' | 'published' | 'archived'
export type AgentRoleType = 'intake_assistant' | 'lead_qualifier' | 'crm_updater' | 'follow_up' | 'ops_assistant' | 'custom'
export type AgentDeploymentStatus = 'pending' | 'building' | 'running' | 'degraded' | 'stopped' | 'failed'

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

async function readState(): Promise<PlatformState> {
  try {
    const raw = await readFile(dataPath, 'utf8')
    const parsed = JSON.parse(raw) as PlatformState
    return {
      workspaces: parsed.workspaces ?? [],
      projects: parsed.projects ?? [],
      templates: parsed.templates?.length ? parsed.templates : defaultTemplates,
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
    let query = supabase.from('agent_definitions').select('*').order('created_at', { ascending: false })
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId)
    }
    const { data, error } = await query
    if (!error && data) {
      return data.map((row) => fromAgentRow(row as Record<string, unknown>))
    }
  }

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
    const { data, error } = await supabase.from('agent_definitions').insert(toAgentRow(record)).select().single()
    if (!error && data) {
      return fromAgentRow(data as Record<string, unknown>)
    }
    console.warn('Supabase createAgentDefinition failed, falling back to local state:', error?.message)
  }

  const state = await readState()
  state.agents.push(record)
  await writeState(state)
  return record
}

export async function listDeployments(workspaceId?: string) {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    let query = supabase.from('agent_deployments').select('*').order('created_at', { ascending: false })
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId)
    }
    const { data, error } = await query
    if (!error && data) {
      return data.map((row) => fromDeploymentRow(row as Record<string, unknown>))
    }
  }

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
    const { data, error } = await supabase.from('agent_deployments').insert(toDeploymentRow(record)).select().single()
    if (!error && data) {
      return fromDeploymentRow(data as Record<string, unknown>)
    }
    console.warn('Supabase createDeployment failed, falling back to local state:', error?.message)
  }

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
  const state = await readState()
  return [...state.provisioningJobs].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)).slice(0, limit)
}
