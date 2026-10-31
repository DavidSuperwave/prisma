import { createIntakeSubmission } from '@/lib/intakeStore'
import { computeLeadScore } from '@/lib/intake/leadScore'
import { notifyOps } from '@/lib/opsNotify'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required field: ${key}`)
  }
  return value.trim()
}

function optionalText(formData: FormData, key: string) {
  const value = formData.get(key)
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function normalizeUrl(url?: string) {
  if (!url) {
    return undefined
  }

  try {
    const normalized = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
    return new URL(normalized).toString()
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }
}

function normalizeBrandAssets(assets: string[]) {
  const cleaned = assets.map((asset) => asset.trim()).filter(Boolean)
  if (cleaned.length === 0) {
    return ['Ninguno']
  }
  if (cleaned.includes('Ninguno')) {
    return ['Ninguno']
  }
  return Array.from(new Set(cleaned))
}

async function maybeCreateIntakeUserShell(email: string, fullName: string) {
  if (process.env.PRISMA_AUTO_CREATE_USER_ON_INTAKE !== 'true') {
    return false
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return false
  }

  const normalizedEmail = email.toLowerCase()
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: normalizedEmail,
    options: {
      data: {
        source: 'intake',
        full_name: fullName,
      },
    },
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('already') || message.includes('exists') || message.includes('registered')) {
      return false
    }
    throw error
  }

  return Boolean(data)
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const intakeId = `intk_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`
    const fullName = requiredText(formData, 'full_name')
    const businessName = requiredText(formData, 'business_name')
    const websiteUrl = normalizeUrl(optionalText(formData, 'website_url'))
    const businessLocation = requiredText(formData, 'business_location')
    const reason = requiredText(formData, 'reason')
    const email = requiredText(formData, 'email').toLowerCase()
    const brandAssets = normalizeBrandAssets(
      formData.getAll('brand_assets').map((entry) => String(entry))
    )
    const leadScore = computeLeadScore({
      websiteUrl,
      businessLocation,
      reason,
      brandAssets,
    })

    const submission = await createIntakeSubmission({
      id: intakeId,
      fullName,
      businessName,
      websiteUrl,
      businessLocation,
      reason,
      brandAssets,
      email,
      leadScore,
      status: 'new',
    })

    const userShellCreated = await maybeCreateIntakeUserShell(email, fullName)

    await notifyOps({
      type: 'intake_submitted',
      message: `Nuevo intake recibido de ${submission.businessName}`,
      metadata: {
        intakeId: submission.id,
        contactEmail: submission.email,
        location: submission.businessLocation,
        leadScore: submission.leadScore,
        status: submission.status,
        userShellCreated,
      },
    })

    return Response.json({
      intakeId: submission.id,
      status: submission.status,
      leadScore: submission.leadScore,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process intake'
    return Response.json({ error: message }, { status: 400 })
  }
}
