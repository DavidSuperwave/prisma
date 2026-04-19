import Stripe from 'stripe'
import { getIntakeSubmissionById } from '@/lib/intakeStore'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY')
  }
  return new Stripe(secretKey)
}

type CheckoutRequest = {
  intakeId?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutRequest
    if (!body.intakeId) {
      return Response.json({ error: 'intakeId is required' }, { status: 400 })
    }

    const submission = await getIntakeSubmissionById(body.intakeId)
    if (!submission) {
      return Response.json({ error: 'Intake not found' }, { status: 404 })
    }

    const stripePriceId = process.env.STRIPE_PRICE_ID
    if (!stripePriceId) {
      return Response.json({ error: 'Missing STRIPE_PRICE_ID' }, { status: 500 })
    }

    const stripe = getStripe()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    const successUrl =
      process.env.STRIPE_SUCCESS_URL ?? `${siteUrl}/intake?status=success&intakeId=${encodeURIComponent(submission.id)}`
    const cancelUrl =
      process.env.STRIPE_CANCEL_URL ?? `${siteUrl}/intake?status=cancelled&intakeId=${encodeURIComponent(submission.id)}`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: submission.contactEmail,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        intakeId: submission.id,
        businessName: submission.businessName,
      },
      client_reference_id: submission.id,
      allow_promotion_codes: true,
    })

    return Response.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create checkout session'
    return Response.json({ error: message }, { status: 500 })
  }
}
