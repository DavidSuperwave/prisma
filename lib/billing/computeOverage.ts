type ComputeOverageInput = {
  includedTokens: number
  consumedTokens: number
}

type ComputeOverageCostInput = {
  overageTokens: number
  usdPerThousandTokens: number
}

function toSafeWhole(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

export function computeOverageTokens({ includedTokens, consumedTokens }: ComputeOverageInput) {
  const included = toSafeWhole(includedTokens)
  const consumed = toSafeWhole(consumedTokens)
  return Math.max(0, consumed - included)
}

export function computeOverageCostUsd({ overageTokens, usdPerThousandTokens }: ComputeOverageCostInput) {
  const tokens = toSafeWhole(overageTokens)
  const rate = Number.isFinite(usdPerThousandTokens) ? Math.max(0, usdPerThousandTokens) : 0
  const raw = (tokens / 1000) * rate
  return Number(raw.toFixed(6))
}
