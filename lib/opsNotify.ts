type OpsEventType = 'intake_submitted' | 'intake_paid'

type NotifyOpsInput = {
  type: OpsEventType
  message: string
  metadata?: Record<string, unknown>
}

export async function notifyOps(input: NotifyOpsInput) {
  const webhookUrl = process.env.OPS_WEBHOOK_URL

  if (!webhookUrl) {
    console.info(`[ops:${input.type}] ${input.message}`, input.metadata ?? {})
    return
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: input.message,
        type: input.type,
        metadata: input.metadata ?? {},
      }),
    })
  } catch (error) {
    console.error('Failed to send ops notification', error)
  }
}
