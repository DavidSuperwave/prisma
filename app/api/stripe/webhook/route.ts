import Stripe from 'stripe'
import { getIntakeSubmissionById, markIntakeAsPaid, updateIntakeProvisioningStatus } from '@/lib/intakeStore'
import { notifyOps } from '@/lib/opsNotify'
import { provisionWorkspaceFromIntake } from '@/lib/platformStore'

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY')
  }
  return new Stripe(secretKey)
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return Response.json({ error: 'Missing Stripe webhook configuration' }, { status: 400 })
  }

  try {
    const stripe = getStripe()
    const payload = await request.text()
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const intakeId = session.metadata?.intakeId ?? session.client_reference_id

      if (!intakeId) {
        return Response.json({ received: true })
      }

      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id

      const updated = await markIntakeAsPaid(intakeId, {
        checkoutSessionId: session.id,
        paymentIntentId,
      })

      let provisioningResult:
        | { workspaceId: string; projectId: string; alreadyProvisioned: boolean }
        | null = null

      if (updated) {
        provisioningResult = await provisionWorkspaceFromIntake(updated)
        await updateIntakeProvisioningStatus(intakeId, {
          lifecycleStatus: 'reviewing',
          workspaceId: provisioningResult.workspaceId,
          projectId: provisioningResult.projectId,
        })
      } else {
        const refreshed = await getIntakeSubmissionById(intakeId)
        if (refreshed) {
          provisioningResult = await provisionWorkspaceFromIntake(refreshed)
          await updateIntakeProvisioningStatus(intakeId, {
            lifecycleStatus: 'reviewing',
            workspaceId: provisioningResult.workspaceId,
            projectId: provisioningResult.projectId,
          })
        }
      }

      await notifyOps({
        type: 'intake_paid',
        message: `Pago confirmado para intake ${intakeId}`,
        metadata: {
          intakeId,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
          storageStatus: updated ? 'updated' : 'missing_record',
          provisioning: provisioningResult
            ? {
                workspaceId: provisioningResult.workspaceId,
                projectId: provisioningResult.projectId,
                alreadyProvisioned: provisioningResult.alreadyProvisioned,
              }
            : null,
        },
      })
    }

    return Response.json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook error'
    return Response.json({ error: message }, { status: 400 })
  }
}
