'use client'

import { useState } from 'react'

type Props = {
  leadId: string
  disabled?: boolean
}

export default function LeadWorkspaceAction({ leadId, disabled }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function createWorkspace() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/leads/${leadId}/create-workspace`, {
        method: 'POST',
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error ?? 'Unable to create workspace from lead')
      }
      window.location.reload()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unexpected error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={containerStyle}>
      <button onClick={createWorkspace} disabled={disabled || busy} style={buttonStyle}>
        {busy ? 'Creating workspace...' : 'Create workspace'}
      </button>
      {error ? <p style={errorStyle}>{error}</p> : null}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  display: 'grid',
  gap: 4,
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 8,
  background: 'var(--giga-surface)',
  color: 'var(--giga-text)',
  fontSize: 13,
  padding: '7px 10px',
  cursor: 'pointer',
}

const errorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#fca5a5',
}
