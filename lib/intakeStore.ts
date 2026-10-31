import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export type IntakeSocialLinks = {
  instagram?: string
  facebook?: string
  tiktok?: string
  linkedin?: string
}

export type IntakeAsset = {
  fileName: string
  contentType: string
  byteSize: number
  storagePath: string
  publicUrl?: string
}

export type IntakeLeadStatus = 'new' | 'contacted' | 'workspace_created' | 'rejected'
export type IntakeLifecycleStatus = 'submitted' | 'paid' | 'reviewing' | 'ready_to_publish' | 'published'

export type IntakeSubmission = {
  id: string
  workspaceId?: string
  projectId?: string
  lifecycleStatus: IntakeLifecycleStatus
  status: IntakeLeadStatus
  leadScore: number
  fullName: string
  email: string
  businessLocation: string
  reason: string
  brandAssets: string[]
  adminNotes?: string
  referralSource?: string
  businessName: string
  contactName: string
  contactEmail: string
  whatsappNumber: string
  websiteUrl?: string
  industry: string
  primaryColor?: string
  serviceDescription: string
  toneGuidance?: string
  notes?: string
  socialLinks: IntakeSocialLinks
  assets: IntakeAsset[]
  paymentStatus: 'pending' | 'paid'
  stripeCheckoutSessionId?: string
  stripePaymentIntentId?: string
  paidAt?: string
  createdAt: string
  updatedAt: string
}

type CreateIntakeInput = Omit<
  IntakeSubmission,
  | 'lifecycleStatus'
  | 'contactName'
  | 'contactEmail'
  | 'industry'
  | 'serviceDescription'
  | 'paymentStatus'
  | 'socialLinks'
  | 'assets'
  | 'whatsappNumber'
  | 'primaryColor'
  | 'toneGuidance'
  | 'notes'
  | 'stripeCheckoutSessionId'
  | 'stripePaymentIntentId'
  | 'paidAt'
  | 'createdAt'
  | 'updatedAt'
>

type CreateIntakeSubmissionInput = Pick<
  CreateIntakeInput,
  | 'id'
  | 'fullName'
  | 'businessName'
  | 'email'
  | 'businessLocation'
  | 'reason'
  | 'brandAssets'
  | 'leadScore'
  | 'status'
  | 'websiteUrl'
  | 'referralSource'
  | 'adminNotes'
>

type UpdateLeadInput = {
  status?: IntakeLeadStatus
  adminNotes?: string
  workspaceId?: string
  projectId?: string
}

type UpdateProvisioningInput = {
  lifecycleStatus?: IntakeSubmission['lifecycleStatus']
  status?: IntakeLeadStatus
  workspaceId?: string
  projectId?: string
}

type UpdatePaymentInput = {
  checkoutSessionId?: string
  paymentIntentId?: string
}

const LEAD_STATUSES: IntakeLeadStatus[] = ['new', 'contacted', 'workspace_created', 'rejected']
const LIFECYCLE_STATUSES: IntakeLifecycleStatus[] = ['submitted', 'paid', 'reviewing', 'ready_to_publish', 'published']

function normalizeLeadStatus(value: unknown): IntakeLeadStatus {
  if (typeof value === 'string' && LEAD_STATUSES.includes(value as IntakeLeadStatus)) {
    return value as IntakeLeadStatus
  }

  if (value === 'paid' || value === 'reviewing' || value === 'ready_to_publish') {
    return 'contacted'
  }
  if (value === 'published') {
    return 'workspace_created'
  }
  return 'new'
}

function normalizeLifecycleStatus(value: unknown): IntakeLifecycleStatus {
  if (typeof value === 'string' && LIFECYCLE_STATUSES.includes(value as IntakeLifecycleStatus)) {
    return value as IntakeLifecycleStatus
  }
  return 'submitted'
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((entry) => String(entry)).filter(Boolean)
}

function normalizeInt(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }
  return 0
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function normalizeRequiredText(primary: unknown, fallback = '') {
  const fromPrimary = normalizeOptionalText(primary)
  if (fromPrimary) return fromPrimary
  return fallback
}

const dataPath = path.join(process.cwd(), '.data', 'intake-submissions.json')

async function readLocalStore() {
  try {
    const raw = await readFile(dataPath, 'utf8')
    return JSON.parse(raw) as IntakeSubmission[]
  } catch {
    return []
  }
}

async function writeLocalStore(records: IntakeSubmission[]) {
  await mkdir(path.dirname(dataPath), { recursive: true })
  await writeFile(dataPath, JSON.stringify(records, null, 2), 'utf8')
}

function nowIso() {
  return new Date().toISOString()
}

function toRow(record: IntakeSubmission) {
  return {
    id: record.id,
    workspace_id: record.workspaceId ?? null,
    project_id: record.projectId ?? null,
    lifecycle_status: record.lifecycleStatus,
    status: record.status,
    lead_score: record.leadScore,
    full_name: record.fullName,
    email: record.email,
    business_location: record.businessLocation,
    reason: record.reason,
    brand_assets: record.brandAssets,
    admin_notes: record.adminNotes ?? null,
    referral_source: record.referralSource ?? null,
    business_name: record.businessName,
    contact_name: record.contactName,
    contact_email: record.contactEmail,
    whatsapp_number: record.whatsappNumber,
    website_url: record.websiteUrl ?? null,
    industry: record.industry,
    primary_color: record.primaryColor ?? null,
    service_description: record.serviceDescription,
    tone_guidance: record.toneGuidance ?? null,
    notes: record.notes ?? null,
    social_links: record.socialLinks,
    assets: record.assets,
    payment_status: record.paymentStatus,
    stripe_checkout_session_id: record.stripeCheckoutSessionId ?? null,
    stripe_payment_intent_id: record.stripePaymentIntentId ?? null,
    paid_at: record.paidAt ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }
}

function fromRow(row: Record<string, unknown>): IntakeSubmission {
  const fullName = normalizeRequiredText(row.full_name, normalizeRequiredText(row.contact_name))
  const email = normalizeRequiredText(row.email, normalizeRequiredText(row.contact_email))
  const businessLocation = normalizeRequiredText(row.business_location, normalizeRequiredText(row.industry))
  const reason = normalizeRequiredText(row.reason, normalizeRequiredText(row.service_description))
  const websiteUrl = normalizeOptionalText(row.website_url)
  const status = normalizeLeadStatus(row.status ?? row.lifecycle_status)
  const lifecycleStatus = normalizeLifecycleStatus(row.lifecycle_status)
  const brandAssets = asStringArray(row.brand_assets)
  const socialLinks = (row.social_links as IntakeSocialLinks) ?? {}
  const assets = (row.assets as IntakeAsset[]) ?? []

  return {
    id: String(row.id),
    workspaceId: row.workspace_id ? String(row.workspace_id) : undefined,
    projectId: row.project_id ? String(row.project_id) : undefined,
    lifecycleStatus,
    status,
    leadScore: normalizeInt(row.lead_score),
    fullName,
    email,
    businessLocation,
    reason,
    brandAssets,
    adminNotes: normalizeOptionalText(row.admin_notes),
    referralSource: normalizeOptionalText(row.referral_source),
    businessName: normalizeRequiredText(row.business_name),
    contactName: normalizeRequiredText(row.contact_name, fullName),
    contactEmail: normalizeRequiredText(row.contact_email, email),
    whatsappNumber: normalizeRequiredText(row.whatsapp_number),
    websiteUrl,
    industry: normalizeRequiredText(row.industry, businessLocation),
    primaryColor: normalizeOptionalText(row.primary_color),
    serviceDescription: normalizeRequiredText(row.service_description, reason),
    toneGuidance: normalizeOptionalText(row.tone_guidance),
    notes: normalizeOptionalText(row.notes),
    socialLinks,
    assets,
    paymentStatus: row.payment_status === 'paid' ? 'paid' : 'pending',
    stripeCheckoutSessionId: normalizeOptionalText(row.stripe_checkout_session_id),
    stripePaymentIntentId: normalizeOptionalText(row.stripe_payment_intent_id),
    paidAt: normalizeOptionalText(row.paid_at),
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  }
}

export async function createIntakeSubmission(input: CreateIntakeSubmissionInput) {
  const createdAt = nowIso()
  const defaultStatus = input.status ?? 'new'
  const record: IntakeSubmission = {
    id: input.id,
    workspaceId: undefined,
    projectId: undefined,
    lifecycleStatus: 'submitted',
    status: defaultStatus,
    leadScore: normalizeInt(input.leadScore),
    fullName: input.fullName,
    email: input.email,
    businessLocation: input.businessLocation,
    reason: input.reason,
    brandAssets: input.brandAssets,
    adminNotes: input.adminNotes,
    referralSource: input.referralSource,
    businessName: input.businessName,
    contactName: input.fullName,
    contactEmail: input.email,
    whatsappNumber: '',
    websiteUrl: input.websiteUrl,
    industry: input.businessLocation,
    primaryColor: undefined,
    serviceDescription: input.reason,
    toneGuidance: undefined,
    notes: undefined,
    socialLinks: {},
    assets: [],
    paymentStatus: 'pending',
    stripeCheckoutSessionId: undefined,
    stripePaymentIntentId: undefined,
    paidAt: undefined,
    createdAt,
    updatedAt: createdAt,
  }

  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase.from('intake_submissions').insert(toRow(record)).select().single()
    if (!error && data) {
      return fromRow(data)
    }
    console.warn('Supabase insert failed, falling back to local store:', error?.message)
  }

  const records = await readLocalStore()
  records.push(record)
  await writeLocalStore(records)
  return record
}

export async function getIntakeSubmissionById(id: string) {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase.from('intake_submissions').select('*').eq('id', id).maybeSingle()
    if (!error && data) {
      return fromRow(data)
    }
  }

  const records = await readLocalStore()
  return records.find((entry) => entry.id === id) ?? null
}

export async function listIntakeSubmissions() {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase.from('intake_submissions').select('*').order('created_at', { ascending: false })
    if (!error && data) {
      return data.map((row) => fromRow(row as Record<string, unknown>))
    }
  }

  const records = await readLocalStore()
  return [...records].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
}

export async function updateIntakeLead(id: string, input: UpdateLeadInput) {
  const updatedAt = nowIso()
  const nextStatus = input.status ?? (input.workspaceId || input.projectId ? 'workspace_created' : undefined)
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase
      .from('intake_submissions')
      .update({
        status: nextStatus ?? undefined,
        admin_notes: input.adminNotes ?? undefined,
        workspace_id: input.workspaceId ?? undefined,
        project_id: input.projectId ?? undefined,
        updated_at: updatedAt,
      })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (!error && data) {
      return fromRow(data)
    }
  }

  const records = await readLocalStore()
  const idx = records.findIndex((entry) => entry.id === id)
  if (idx < 0) {
    return null
  }

  records[idx] = {
    ...records[idx],
    status: nextStatus ?? records[idx].status,
    adminNotes: input.adminNotes ?? records[idx].adminNotes,
    workspaceId: input.workspaceId ?? records[idx].workspaceId,
    projectId: input.projectId ?? records[idx].projectId,
    updatedAt,
  }
  await writeLocalStore(records)
  return records[idx]
}

export async function markIntakeAsPaid(id: string, update: UpdatePaymentInput) {
  const updatedAt = nowIso()
  const paidAt = nowIso()
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase
      .from('intake_submissions')
      .update({
        lifecycle_status: 'paid',
        payment_status: 'paid',
        status: 'contacted',
        stripe_checkout_session_id: update.checkoutSessionId ?? null,
        stripe_payment_intent_id: update.paymentIntentId ?? null,
        paid_at: paidAt,
        updated_at: updatedAt,
      })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (!error && data) {
      return fromRow(data)
    }
  }

  const records = await readLocalStore()
  const idx = records.findIndex((entry) => entry.id === id)
  if (idx < 0) {
    return null
  }

  records[idx] = {
    ...records[idx],
    lifecycleStatus: 'paid',
    paymentStatus: 'paid',
    status: records[idx].status === 'new' ? 'contacted' : records[idx].status,
    stripeCheckoutSessionId: update.checkoutSessionId ?? records[idx].stripeCheckoutSessionId,
    stripePaymentIntentId: update.paymentIntentId ?? records[idx].stripePaymentIntentId,
    paidAt,
    updatedAt,
  }
  await writeLocalStore(records)
  return records[idx]
}

export async function updateIntakeProvisioningStatus(id: string, input: UpdateProvisioningInput) {
  const updatedAt = nowIso()
  const computedStatus = input.status ?? (input.workspaceId || input.projectId ? 'workspace_created' : undefined)
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase
      .from('intake_submissions')
      .update({
        lifecycle_status: input.lifecycleStatus ?? undefined,
        status: computedStatus ?? undefined,
        workspace_id: input.workspaceId ?? undefined,
        project_id: input.projectId ?? undefined,
        updated_at: updatedAt,
      })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (!error && data) {
      return fromRow(data)
    }
  }

  const records = await readLocalStore()
  const idx = records.findIndex((entry) => entry.id === id)
  if (idx < 0) {
    return null
  }

  records[idx] = {
    ...records[idx],
    lifecycleStatus: input.lifecycleStatus ?? records[idx].lifecycleStatus,
    status: computedStatus ?? records[idx].status,
    workspaceId: input.workspaceId ?? records[idx].workspaceId,
    projectId: input.projectId ?? records[idx].projectId,
    updatedAt,
  }
  await writeLocalStore(records)
  return records[idx]
}
