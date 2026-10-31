'use client'

import { useState } from 'react'
import type { IntakeLeadStatus } from '@/lib/intakeStore'

const STATUSES: IntakeLeadStatus[] = ['new', 'contacted', 'workspace_created', 'rejected']

type Props = {
  leadId: string
  initialStatus: IntakeLeadStatus
  initialAdminNotes?: string
}

export default function LeadStatusEditor({ leadId, initialStatus, initialAdminNotes }: Props) {
  const [status, setStatus] = useState<IntakeLeadStatus>(initialStatus)
  const [adminNotes, setAdminNotes] = useState(initialAdminNotes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          adminNotes,
        }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error ?? 'Unable to save lead')
      }
      window.location.reload()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unexpected error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={containerStyle}>
      <select value={status} onChange={(event) => setStatus(event.target.value as IntakeLeadStatus)} style={inputStyle}>
        {STATUSES.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </select>
      <input
        value={adminNotes}
        onChange={(event) => setAdminNotes(event.target.value)}
        placeholder="Admin notes"
        style={inputStyle}
      />
      <button onClick={save} disabled={busy} style={buttonStyle}>
        {busy ? 'Saving...' : 'Save'}
      </button>
      {error ? <p style={errorStyle}>{error}</p> : null}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  display: 'grid',
  gap: 8,
  alignItems: 'center',
}

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.02)',
  color: 'var(--giga-text)',
  padding: '7px 10px',
  fontSize: 13,
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 8,
  color: 'var(--giga-text)',
  background: 'var(--giga-surface)',
  padding: '7px 10px',
  cursor: 'pointer',
  fontSize: 13,
}

const errorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#fca5a5',
}
