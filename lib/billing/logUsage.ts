import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { computeOverageCostUsd } from "@/lib/billing/computeOverage"
import { reportToStripeMetered } from "@/lib/billing/reportToStripe"

type UsageLike = {
  prompt_tokens?: number | null
  completion_tokens?: number | null
  total_tokens?: number | null
  input_tokens?: number | null
  output_tokens?: number | null
}

export type LogUsageParams = {
  workspaceId: string
  agentId?: string | null
  userId?: string | null
  model?: string | null
  usage: UsageLike
  costUsd?: number | null
  eventType?: string
  metadata?: Record<string, unknown>
}

export type LogUsageResult = {
  logged: boolean
  eventId?: string
  stripeUsageRecordId?: string
  stripeReported: boolean
  stripeMode?: "usage_records" | "meter_events"
  warning?: string
}

function normalizeInt(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

function normalizeUsage(usage: UsageLike) {
  const promptTokens = normalizeInt(
    usage.prompt_tokens ?? usage.input_tokens ?? 0,
  )
  const completionTokens = normalizeInt(
    usage.completion_tokens ?? usage.output_tokens ?? 0,
  )
  const totalFromPayload = normalizeInt(usage.total_tokens ?? 0)
  const totalTokens = totalFromPayload > 0 ? totalFromPayload : promptTokens + completionTokens
  return { promptTokens, completionTokens, totalTokens }
}

function estimateCostUsd(totalTokens: number) {
  const usdPerThousand = Number(process.env.STRIPE_OVERAGE_USD_PER_1K_TOKENS ?? "0.10")
  return computeOverageCostUsd({
    overageTokens: totalTokens,
    usdPerThousandTokens: Number.isFinite(usdPerThousand) ? usdPerThousand : 0.1,
  })
}

export async function logAgentUsage(params: LogUsageParams): Promise<LogUsageResult> {
  const { promptTokens, completionTokens, totalTokens } = normalizeUsage(params.usage)
  if (!params.workspaceId || totalTokens <= 0) {
    return {
      logged: false,
      stripeReported: false,
      warning: "missing_workspace_or_usage",
    }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return {
      logged: false,
      stripeReported: false,
      warning: "supabase_unavailable",
    }
  }

  const resolvedCostUsd =
    typeof params.costUsd === "number" && Number.isFinite(params.costUsd)
      ? Math.max(0, Number(params.costUsd.toFixed(6)))
      : estimateCostUsd(totalTokens)

  const insertPayload = {
    workspace_id: params.workspaceId,
    agent_id: params.agentId ?? null,
    user_id: params.userId ?? null,
    model: params.model?.trim() || "unknown",
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    cost_usd: resolvedCostUsd,
    event_type: params.eventType?.trim() || "agent_call",
    metadata: params.metadata ?? {},
  }

  const { data, error } = await supabase
    .from("credit_usage_events")
    .insert(insertPayload)
    .select("id")
    .maybeSingle()

  if (error) {
    return {
      logged: false,
      stripeReported: false,
      warning: `credit_usage_insert_failed:${error.message}`,
    }
  }

  const eventId = data?.id ? String(data.id) : undefined
  const stripe = await reportToStripeMetered({
    workspaceId: params.workspaceId,
    quantity: totalTokens,
  })

  if (eventId && stripe.reported && stripe.usageRecordId) {
    await supabase
      .from("credit_usage_events")
      .update({ stripe_usage_record_id: stripe.usageRecordId })
      .eq("id", eventId)
  }

  return {
    logged: true,
    eventId,
    stripeUsageRecordId: stripe.usageRecordId,
    stripeReported: stripe.reported,
    stripeMode: stripe.mode,
    warning: stripe.reported ? undefined : stripe.reason,
  }
}
