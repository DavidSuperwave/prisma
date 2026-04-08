import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getAssetBucketName, getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { createIntakeSubmission, type IntakeAsset } from '@/lib/intakeStore'
import { notifyOps } from '@/lib/opsNotify'
import { queueProvisioningFromIntake } from '@/lib/platformStore'

const MAX_FILES = 6
const MAX_FILE_BYTES = 10 * 1024 * 1024

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

function sanitizeStorageName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
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

async function uploadAssets(intakeId: string, files: File[]) {
  const assets: IntakeAsset[] = []
  const supabase = getSupabaseAdmin()
  const bucketName = getAssetBucketName()

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`File too large: ${file.name}. Max size is ${MAX_FILE_BYTES / (1024 * 1024)}MB`)
    }

    const safeFileName = `${Date.now()}-${sanitizeStorageName(file.name)}`
    const storagePath = `${intakeId}/${safeFileName}`
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    if (supabase) {
      const { error } = await supabase.storage.from(bucketName).upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

      if (error) {
        throw new Error(`Failed to upload ${file.name}: ${error.message}`)
      }

      const { data: publicData } = supabase.storage.from(bucketName).getPublicUrl(storagePath)
      assets.push({
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        byteSize: file.size,
        storagePath,
        publicUrl: publicData.publicUrl,
      })
      continue
    }

    // Local fallback for environments without Supabase.
    const localDir = path.join(process.cwd(), 'public', 'intake-assets', intakeId)
    await mkdir(localDir, { recursive: true })
    await writeFile(path.join(localDir, safeFileName), fileBuffer)
    assets.push({
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      byteSize: file.size,
      storagePath: `/intake-assets/${intakeId}/${safeFileName}`,
      publicUrl: `/intake-assets/${intakeId}/${safeFileName}`,
    })
  }

  return assets
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const intakeId = `intk_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`
    const uploadedFiles = formData
      .getAll('assets')
      .filter((entry): entry is File => entry instanceof File && entry.size > 0)

    if (uploadedFiles.length > MAX_FILES) {
      return Response.json({ error: `Too many files. Max ${MAX_FILES}.` }, { status: 400 })
    }

    const assets = await uploadAssets(intakeId, uploadedFiles)
    const submission = await createIntakeSubmission({
      id: intakeId,
      businessName: requiredText(formData, 'businessName'),
      contactName: requiredText(formData, 'contactName'),
      contactEmail: requiredText(formData, 'contactEmail'),
      whatsappNumber: requiredText(formData, 'whatsappNumber'),
      websiteUrl: normalizeUrl(optionalText(formData, 'websiteUrl')),
      industry: requiredText(formData, 'industry'),
      primaryColor: optionalText(formData, 'primaryColor'),
      serviceDescription: requiredText(formData, 'serviceDescription'),
      toneGuidance: optionalText(formData, 'toneGuidance'),
      notes: optionalText(formData, 'notes'),
      socialLinks: {
        instagram: normalizeUrl(optionalText(formData, 'instagram')),
        facebook: normalizeUrl(optionalText(formData, 'facebook')),
        tiktok: normalizeUrl(optionalText(formData, 'tiktok')),
        linkedin: normalizeUrl(optionalText(formData, 'linkedin')),
      },
      assets,
    })

    await queueProvisioningFromIntake(submission)

    await notifyOps({
      type: 'intake_submitted',
      message: `Nuevo intake recibido de ${submission.businessName}`,
      metadata: {
        intakeId: submission.id,
        contactEmail: submission.contactEmail,
        industry: submission.industry,
        assets: submission.assets.length,
        lifecycleStatus: submission.lifecycleStatus,
      },
    })

    return Response.json({
      intakeId: submission.id,
      status: submission.paymentStatus,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process intake'
    return Response.json({ error: message }, { status: 400 })
  }
}
