'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  workspaceId: string
}

export default function WorkspaceMemberInviteForm({ workspaceId }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'operator' | 'viewer'>('operator')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFeedback(null)

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/workspaces/${workspaceId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role }),
        })
        const payload = (await response.json()) as {
          error?: string
          inviteSent?: boolean
          member?: { email?: string; role?: string }
        }
        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to invite member')
        }

        setEmail('')
        setFeedback(
          payload.inviteSent
            ? `Invite sent to ${payload.member?.email ?? 'member'} as ${payload.member?.role ?? role}.`
            : `Added ${payload.member?.email ?? 'member'} to the workspace as ${payload.member?.role ?? role}.`,
        )
        router.refresh()
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Unexpected error')
      }
    })
  }

  return (
    <form onSubmit={submitForm} style={formStyle}>
      <label style={fieldStyle}>
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="teammate@company.com"
          style={inputStyle}
        />
      </label>
      <label style={fieldStyle}>
        Role
        <select value={role} onChange={(event) => setRole(event.target.value as typeof role)} style={inputStyle}>
          <option value="admin">admin</option>
          <option value="operator">operator</option>
          <option value="viewer">viewer</option>
        </select>
      </label>
      <button type="submit" disabled={isPending} style={buttonStyle}>
        {isPending ? 'Inviting...' : 'Invite member'}
      </button>
      {feedback ? <p style={successStyle}>{feedback}</p> : null}
      {error ? <p style={errorStyle}>{error}</p> : null}
    </form>
  )
}

const formStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  marginTop: 16,
}

const fieldStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 13,
}

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.02)',
  color: 'var(--giga-text)',
  padding: '8px 10px',
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 8,
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--giga-text)',
  cursor: 'pointer',
  justifySelf: 'start',
}

const successStyle: React.CSSProperties = {
  margin: 0,
  color: '#6ee7b7',
  fontSize: 13,
}

const errorStyle: React.CSSProperties = {
  margin: 0,
  color: '#f87171',
  fontSize: 13,
}
