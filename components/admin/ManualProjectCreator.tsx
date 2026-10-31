'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type CreationPayload = {
  workspace?: { id: string; name: string; slug: string }
  project?: { id: string; name: string }
  site?: { id: string; name: string; subdomain: string }
  agents?: Array<{ id: string; name: string }>
  deployments?: Array<{ id: string; containerName: string; status: string }>
  runtime?: {
    workspaceAppPath: string
    adminPath: string
    status: string
    message: string
  }
}

const defaultSoulMd = [
  '# SOUL.md',
  '',
  '## Identity',
  '- You are the main operator persona for this workspace.',
  '- Speak clearly, move work forward, and stay tenant-scoped.',
  '',
  '## Style',
  '- Prefer concise operational answers.',
  '- Use tools and records before asking the human to do manual reconciliation.',
  '- Ask for clarification only when missing data blocks safe action.',
].join('\n')

export default function ManualProjectCreator() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [companyName, setCompanyName] = useState('')
  const [agentCount, setAgentCount] = useState(3)
  const [soulMd, setSoulMd] = useState(defaultSoulMd)
  const [error, setError] = useState('')
  const [result, setResult] = useState<CreationPayload | null>(null)

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setResult(null)

    startTransition(async () => {
      try {
        const payload = {
          companyName,
          agentCount,
          soulMd,
        }

        const response = await fetch('/api/admin/projects/manual-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = (await response.json()) as CreationPayload & { error?: string }
        if (!response.ok) {
          throw new Error(data.error ?? 'Unable to create project')
        }

        setResult(data)
        router.refresh()
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Unexpected error')
      }
    })
  }

  return (
    <form onSubmit={submitForm} style={formStyle}>
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Workspace shell</h2>
        <label style={labelStyle}>
          Company name
          <input
            required
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            placeholder="Acme Dental"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Agent count
          <input
            type="number"
            min={1}
            max={12}
            value={agentCount}
            onChange={(event) => setAgentCount(Number(event.target.value) || 1)}
            style={inputStyle}
          />
        </label>
        <p style={helperTextStyle}>
          Prisma will auto-create one workspace, one onboarding project, one site, and queue deployments for each seeded agent.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>Shared SOUL.md</h2>
        <label style={labelStyle}>
          Persona and operating style for every agent created in this batch
          <textarea value={soulMd} onChange={(event) => setSoulMd(event.target.value)} rows={16} style={textareaStyle} />
        </label>
        <p style={helperTextStyle}>
          This is stored on each created agent as `soul_md` and then projected into Hermes runtime `SOUL.md` during sync.
        </p>
      </section>

      <button type="submit" disabled={isPending} style={submitStyle}>
        {isPending ? 'Provisioning...' : 'Provision workspace'}
      </button>

      {error ? <p style={errorStyle}>{error}</p> : null}
      {result ? (
        <div style={resultStyle}>
          <p style={{ margin: 0, fontWeight: 700 }}>Workspace provisioned.</p>
          <p style={{ margin: 0 }}>Workspace: {result.workspace?.name ?? 'n/a'}</p>
          <p style={{ margin: 0 }}>Project: {result.project?.name ?? 'n/a'}</p>
          <p style={{ margin: 0 }}>Site: {result.site?.subdomain ?? 'n/a'}</p>
          <p style={{ margin: 0 }}>Agents: {result.agents?.length ?? 0}</p>
          <p style={{ margin: 0 }}>Deployments queued: {result.deployments?.length ?? 0}</p>
          {result.runtime ? <p style={{ margin: '6px 0 0', color: 'var(--giga-muted)' }}>{result.runtime.message}</p> : null}
          <div style={actionRowStyle}>
            {result.runtime ? (
              <>
                <Link href={result.runtime.adminPath} style={actionLinkStyle}>
                  Open admin workspace
                </Link>
                <Link href={result.runtime.workspaceAppPath} style={actionLinkStyle}>
                  Open workspace app
                </Link>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
  )
}

const formStyle: React.CSSProperties = {
  display: 'grid',
  gap: 14,
}

const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 12,
  padding: 12,
  background: 'var(--giga-surface)',
  display: 'grid',
  gap: 10,
}

const headingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
}

const labelStyle: React.CSSProperties = {
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

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 260,
  resize: 'vertical',
}

const submitStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 10,
  padding: '10px 12px',
  background: 'linear-gradient(130deg, #6d6aff 0%, #88a4ff 100%)',
  color: '#ffffff',
  fontWeight: 700,
  cursor: 'pointer',
}

const errorStyle: React.CSSProperties = {
  margin: 0,
  color: '#f87171',
}

const helperTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--giga-muted)',
}

const resultStyle: React.CSSProperties = {
  border: '1px solid rgba(66, 211, 139, 0.45)',
  borderRadius: 10,
  background: 'rgba(66, 211, 139, 0.12)',
  padding: 10,
  display: 'grid',
  gap: 4,
}

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  marginTop: 8,
}

const actionLinkStyle: React.CSSProperties = {
  textDecoration: 'none',
  color: 'var(--giga-text)',
  border: '1px solid rgba(66, 211, 139, 0.45)',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 13,
}
