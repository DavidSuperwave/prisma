const MAJOR_METRO_PATTERN = /(cdmx|ciudad de mexico|monterrey|guadalajara)/i

type LeadScoreInput = {
  websiteUrl?: string | null
  businessLocation: string
  reason: string
  brandAssets: string[]
}

export function computeLeadScore(input: LeadScoreInput) {
  const hasWebsite = Boolean(input.websiteUrl && input.websiteUrl.trim())
  const normalizedAssets = input.brandAssets
    .map((asset) => asset.trim().toLowerCase())
    .filter(Boolean)
  const hasBrandAssets =
    normalizedAssets.length > 0 &&
    normalizedAssets.some((asset) => asset !== 'ninguno')
  const inMajorMetro = MAJOR_METRO_PATTERN.test(input.businessLocation)
  const reasonSuggestsUpdate = /actualizar/i.test(input.reason)

  let score = 0
  if (hasWebsite) score += 1
  if (hasBrandAssets) score += 2
  if (inMajorMetro) score += 1
  if (reasonSuggestsUpdate) score += 1
  return score
}

export function scoreBand(score: number) {
  if (score >= 4) return 'green'
  if (score >= 2) return 'yellow'
  return 'red'
}
