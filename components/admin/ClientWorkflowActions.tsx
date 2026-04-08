'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type Props = {
  workspaceId: string
  intakeId?: string
  intakeStatus?: 'submitted' | 'paid' | 'reviewing' | 'ready_to_publish' | 'published'
  siteId?: string
  siteStatus?: 'draft' | 'reviewing' | 'ready' | 'published' | 'archived'
}

export default function ClientWorkflowActions({ workspaceId, intakeId, intakeStatus, siteId, siteStatus }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')

  async function callApi(path: string) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) {
      throw new Error(payload.error ?? 'Request failed')
    }
    return payload
  }

  function run(label: string, callback: () => Promise<void>) {
    startTransition(async () => {
      setMessage('')
      try {
        await callback()
        setMessage(`${label} completed`)
        router.refresh()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unexpected error')
      }
    })
  }

  return (
    <div style={wrapperStyle}>
      <button
        type="button"
        style={buttonStyle}
        disabled={isPending || !intakeId || intakeStatus !== 'reviewing'}
        onClick={() =>
          run('Approval', async () => {
            if (!intakeId) return
            await callApi(`/api/admin/intakes/${intakeId}/approve`)
          })
        }
      >
        Approve intake
      </button>
      <button
        type="button"
        style={buttonStyle}
        disabled={isPending || !siteId || intakeStatus !== 'ready_to_publish' || (siteStatus !== 'ready' && siteStatus !== 'reviewing')}
        onClick={() =>
          run('Publish', async () => {
            if (!siteId) return
            await callApi(`/api/admin/sites/${siteId}/publish`)
          })
        }
      >
        Publish site
      </button>
      <button
        type="button"
        style={buttonStyle}
        disabled={isPending}
        onClick={() =>
          run('Agent bootstrap', async () => {
            await callApi(`/api/admin/workspaces/${workspaceId}/bootstrap-agent`)
          })
        }
      >
        Create agent + deployment
      </button>
      {message ? <p style={messageStyle}>{message}</p> : null}
    </div>
  )
}

const wrapperStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.03)',
  color: 'var(--giga-text)',
  padding: '6px 8px',
  fontSize: 12,
  cursor: 'pointer',
}

const messageStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--giga-muted)',
  fontSize: 12,
}
