import { ensureAdminApiAccess } from '@/lib/auth'
import { listIntakeSubmissions, type IntakeLeadStatus } from '@/lib/intakeStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_STATUSES: IntakeLeadStatus[] = ['new', 'contacted', 'workspace_created', 'rejected']

function toCsvValue(value: unknown) {
  const serialized = String(value ?? '')
  if (serialized.includes(',') || serialized.includes('"') || serialized.includes('\n')) {
    return `"${serialized.replace(/"/g, '""')}"`
  }
  return serialized
}

export async function GET(request: Request) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim().toLowerCase()
  const location = (searchParams.get('location') ?? '').trim().toLowerCase()
  const status = searchParams.get('status')
  const minScore = Number.parseInt(searchParams.get('minScore') ?? '', 10)
  const wantsCsv = searchParams.get('format') === 'csv'

  const leads = await listIntakeSubmissions()
  const filtered = leads.filter((lead) => {
    if (status && status !== 'all' && lead.status !== status) {
      return false
    }
    if (Number.isFinite(minScore) && lead.leadScore < minScore) {
      return false
    }
    if (location && !lead.businessLocation.toLowerCase().includes(location)) {
      return false
    }
    if (q) {
      const haystack = `${lead.fullName} ${lead.businessName} ${lead.email} ${lead.reason}`.toLowerCase()
      if (!haystack.includes(q)) {
        return false
      }
    }
    return true
  })

  if (wantsCsv) {
    const header = ['id', 'full_name', 'business_name', 'email', 'business_location', 'lead_score', 'status', 'created_at']
    const rows = filtered.map((lead) =>
      [
        lead.id,
        lead.fullName,
        lead.businessName,
        lead.email,
        lead.businessLocation,
        lead.leadScore,
        lead.status,
        lead.createdAt,
      ]
        .map((value) => toCsvValue(value))
        .join(','),
    )
    const csv = [header.join(','), ...rows].join('\n')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="admin-leads.csv"',
      },
    })
  }

  return Response.json({
    leads: filtered,
    statuses: ALLOWED_STATUSES,
  })
}
