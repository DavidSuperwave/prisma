import Stripe from "stripe"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"

export type StripeBillingMode = "usage_records" | "meter_events"

export type ReportToStripeMeteredInput = {
  workspaceId: string
  quantity: number
  timestamp?: number
}

export type ReportToStripeMeteredResult = {
  reported: boolean
  mode: StripeBillingMode
  usageRecordId?: string
  reason?: string
}

let stripeClient: Stripe | null | undefined

function getStripeClient() {
  if (stripeClient !== undefined) return stripeClient
  const secret = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secret) {
    stripeClient = null
    return stripeClient
  }
  stripeClient = new Stripe(secret)
  return stripeClient
}

function resolveBillingMode(raw: unknown): StripeBillingMode {
  if (raw === "usage_records" || raw === "meter_events") {
    return raw
  }
  const fromEnv = process.env.STRIPE_BILLING_USAGE_MODE?.trim()
  if (fromEnv === "usage_records" || fromEnv === "meter_events") {
    return fromEnv
  }
  // Stripe v22 removed subscriptionItems.createUsageRecord from the SDK.
  // Meter events are now the default path unless explicitly overridden.
  return "meter_events"
}

function normalizeQuantity(quantity: number) {
  if (!Number.isFinite(quantity)) return 0
  return Math.max(0, Math.floor(quantity))
}

export async function reportToStripeMetered({
  workspaceId,
  quantity,
  timestamp,
}: ReportToStripeMeteredInput): Promise<ReportToStripeMeteredResult> {
  const normalizedQuantity = normalizeQuantity(quantity)
  if (!workspaceId || normalizedQuantity <= 0) {
    return { reported: false, mode: resolveBillingMode(null), reason: "no_usage" }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return { reported: false, mode: resolveBillingMode(null), reason: "supabase_unavailable" }
  }

  const { data, error } = await supabase
    .from("workspace_billing")
    .select("stripe_customer_id, stripe_metered_subscription_item_id, stripe_meter_event_name, billing_mode")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  const mode = resolveBillingMode(data?.billing_mode)
  if (error) {
    return { reported: false, mode, reason: `workspace_billing_lookup_failed:${error.message}` }
  }
  const itemId =
    data && typeof data.stripe_metered_subscription_item_id === "string"
      ? data.stripe_metered_subscription_item_id.trim()
      : ""

  const stripe = getStripeClient()
  if (!stripe) {
    return { reported: false, mode, reason: "stripe_not_configured" }
  }

  const usageTimestamp = timestamp ?? Math.floor(Date.now() / 1000)

  try {
    if (mode === "usage_records") {
      if (!itemId) {
        return { reported: false, mode, reason: "missing_metered_item" }
      }
      const legacyRecord = await stripe.rawRequest(
        "POST",
        `/v1/subscription_items/${encodeURIComponent(itemId)}/usage_records`,
        {
          quantity: normalizedQuantity,
          timestamp: usageTimestamp,
          action: "increment",
        },
      )
      const legacyRecordId =
        legacyRecord && typeof legacyRecord.id === "string" ? legacyRecord.id : undefined
      return { reported: true, mode, usageRecordId: legacyRecordId }
    }

    const customerId =
      data && typeof data.stripe_customer_id === "string" ? data.stripe_customer_id.trim() : ""
    if (!customerId) {
      return { reported: false, mode, reason: "missing_stripe_customer_id" }
    }

    const meterEventName =
      data && typeof data.stripe_meter_event_name === "string" && data.stripe_meter_event_name.trim().length > 0
        ? data.stripe_meter_event_name.trim()
        : process.env.STRIPE_METER_EVENT_NAME?.trim() || "workspace_tokens"

    const meterEvent = await stripe.billing.meterEvents.create({
      event_name: meterEventName,
      payload: {
        stripe_customer_id: customerId,
        value: String(normalizedQuantity),
      },
      timestamp: usageTimestamp,
    })

    return { reported: true, mode, usageRecordId: meterEvent.identifier }
  } catch (error) {
    const message = error instanceof Error ? error.message : "stripe_usage_record_failed"
    return { reported: false, mode, reason: message }
  }
}
