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

export type IntakeSubmission = {
  id: string
  workspaceId?: string
  projectId?: string
  lifecycleStatus: 'submitted' | 'paid' | 'reviewing' | 'ready_to_publish' | 'published'
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
  | 'paymentStatus'
  | 'stripeCheckoutSessionId'
  | 'stripePaymentIntentId'
  | 'paidAt'
  | 'createdAt'
  | 'updatedAt'
>

type UpdatePaymentInput = {
  checkoutSessionId?: string
  paymentIntentId?: string
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
  return {
    id: String(row.id),
    workspaceId: row.workspace_id ? String(row.workspace_id) : undefined,
    projectId: row.project_id ? String(row.project_id) : undefined,
    lifecycleStatus:
      row.lifecycle_status === 'paid' ||
      row.lifecycle_status === 'reviewing' ||
      row.lifecycle_status === 'ready_to_publish' ||
      row.lifecycle_status === 'published'
        ? row.lifecycle_status
        : 'submitted',
    businessName: String(row.business_name ?? ''),
    contactName: String(row.contact_name ?? ''),
    contactEmail: String(row.contact_email ?? ''),
    whatsappNumber: String(row.whatsapp_number ?? ''),
    websiteUrl: row.website_url ? String(row.website_url) : undefined,
    industry: String(row.industry ?? ''),
    primaryColor: row.primary_color ? String(row.primary_color) : undefined,
    serviceDescription: String(row.service_description ?? ''),
    toneGuidance: row.tone_guidance ? String(row.tone_guidance) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    socialLinks: (row.social_links as IntakeSocialLinks) ?? {},
    assets: (row.assets as IntakeAsset[]) ?? [],
    paymentStatus: row.payment_status === 'paid' ? 'paid' : 'pending',
    stripeCheckoutSessionId: row.stripe_checkout_session_id ? String(row.stripe_checkout_session_id) : undefined,
    stripePaymentIntentId: row.stripe_payment_intent_id ? String(row.stripe_payment_intent_id) : undefined,
    paidAt: row.paid_at ? String(row.paid_at) : undefined,
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  }
}

export async function createIntakeSubmission(input: CreateIntakeInput) {
  const record: IntakeSubmission = {
    ...input,
    lifecycleStatus: 'submitted',
    paymentStatus: 'pending',
    createdAt: nowIso(),
    updatedAt: nowIso(),
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
    stripeCheckoutSessionId: update.checkoutSessionId ?? records[idx].stripeCheckoutSessionId,
    stripePaymentIntentId: update.paymentIntentId ?? records[idx].stripePaymentIntentId,
    paidAt,
    updatedAt,
  }
  await writeLocalStore(records)
  return records[idx]
}

export async function updateIntakeProvisioningStatus(
  id: string,
  input: {
    lifecycleStatus?: IntakeSubmission['lifecycleStatus']
    workspaceId?: string
    projectId?: string
  },
) {
  const updatedAt = nowIso()
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase
      .from('intake_submissions')
      .update({
        lifecycle_status: input.lifecycleStatus ?? undefined,
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
    workspaceId: input.workspaceId ?? records[idx].workspaceId,
    projectId: input.projectId ?? records[idx].projectId,
    updatedAt,
  }
  await writeLocalStore(records)
  return records[idx]
}
