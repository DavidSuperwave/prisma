'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type WorkspaceOption = {
  id: string
  name: string
}

type TemplateOption = {
  id: string
  name: string
  key: string
}

type Props = {
  workspaces: WorkspaceOption[]
  templates: TemplateOption[]
}

type CreationPayload = {
  workspace?: { id: string; name: string }
  project?: { id: string; name: string }
  site?: { id: string; subdomain: string }
  agent?: { id: string; name: string } | null
  deployment?: { id: string; containerName: string } | null
}

export default function ManualProjectCreator({ workspaces, templates }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [existingWorkspaceId, setExistingWorkspaceId] = useState(workspaces[0]?.id ?? '')
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceSlug, setWorkspaceSlug] = useState('')
  const [projectName, setProjectName] = useState('')
  const [industry, setIndustry] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#4f46e5')
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [siteName, setSiteName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [serviceDescription, setServiceDescription] = useState('')
  const [createAgent, setCreateAgent] = useState(true)
  const [agentName, setAgentName] = useState('')
  const [agentRole, setAgentRole] = useState('intake_assistant')
  const [agentModel, setAgentModel] = useState('')
  const [dropletHost, setDropletHost] = useState('')
  const [imageRef, setImageRef] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<CreationPayload | null>(null)

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setResult(null)

    startTransition(async () => {
      try {
        const payload = {
          workspaceId: mode === 'existing' ? existingWorkspaceId : undefined,
          workspaceName: mode === 'new' ? workspaceName : undefined,
          workspaceSlug: mode === 'new' ? workspaceSlug : undefined,
          projectName,
          industry,
          primaryColor,
          templateId,
          siteName,
          subdomain,
          serviceDescription,
          createAgent,
          agentName: agentName || undefined,
          agentRole,
          agentModel: agentModel || undefined,
          dropletHost: dropletHost || undefined,
          imageRef: imageRef || undefined,
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
        <h2 style={headingStyle}>Workspace</h2>
        <label style={labelStyle}>
          Mode
          <select value={mode} onChange={(event) => setMode(event.target.value as 'existing' | 'new')} style={inputStyle}>
            <option value="existing">Use existing workspace</option>
            <option value="new">Create new workspace</option>
          </select>
        </label>

        {mode === 'existing' ? (
          <label style={labelStyle}>
            Workspace
            <select
              required
              disabled={workspaces.length === 0}
              value={existingWorkspaceId}
              onChange={(event) => setExistingWorkspaceId(event.target.value)}
              style={inputStyle}
            >
              {workspaces.length === 0 ? <option value="">No existing workspace</option> : null}
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label style={labelStyle}>
              Workspace name
              <input required value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Workspace slug (optional)
              <input value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)} style={inputStyle} />
            </label>
          </>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>Project & site</h2>
        <label style={labelStyle}>
          Project name
          <input required value={projectName} onChange={(event) => setProjectName(event.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Industry
          <input value={industry} onChange={(event) => setIndustry(event.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Primary color
          <input type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Template
          <select required value={templateId} onChange={(event) => setTemplateId(event.target.value)} style={inputStyle}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.key})
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Site name
          <input required value={siteName} onChange={(event) => setSiteName(event.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Subdomain
          <input required value={subdomain} onChange={(event) => setSubdomain(event.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Service description
          <textarea value={serviceDescription} onChange={(event) => setServiceDescription(event.target.value)} rows={3} style={inputStyle} />
        </label>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>Agent runtime</h2>
        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={createAgent} onChange={(event) => setCreateAgent(event.target.checked)} />
          Create agent and deployment now
        </label>
        {createAgent ? (
          <>
            <label style={labelStyle}>
              Agent name (optional)
              <input value={agentName} onChange={(event) => setAgentName(event.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Agent role
              <select value={agentRole} onChange={(event) => setAgentRole(event.target.value)} style={inputStyle}>
                <option value="intake_assistant">intake_assistant</option>
                <option value="lead_qualifier">lead_qualifier</option>
                <option value="crm_updater">crm_updater</option>
                <option value="follow_up">follow_up</option>
                <option value="ops_assistant">ops_assistant</option>
                <option value="custom">custom</option>
              </select>
            </label>
            <label style={labelStyle}>
              Agent model (optional)
              <input value={agentModel} onChange={(event) => setAgentModel(event.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Droplet host (optional)
              <input value={dropletHost} onChange={(event) => setDropletHost(event.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Image ref (optional)
              <input value={imageRef} onChange={(event) => setImageRef(event.target.value)} style={inputStyle} />
            </label>
          </>
        ) : null}
      </section>

      <button type="submit" disabled={isPending || (!existingWorkspaceId && mode === 'existing')} style={submitStyle}>
        {isPending ? 'Creating...' : 'Create project manually'}
      </button>

      {error ? <p style={errorStyle}>{error}</p> : null}
      {result ? (
        <div style={resultStyle}>
          <p style={{ margin: 0 }}>Workspace: {result.workspace?.name ?? 'n/a'}</p>
          <p style={{ margin: 0 }}>Project: {result.project?.name ?? 'n/a'}</p>
          <p style={{ margin: 0 }}>Site: {result.site?.subdomain ?? 'n/a'}</p>
          <p style={{ margin: 0 }}>Agent: {result.agent?.name ?? 'not created'}</p>
          <p style={{ margin: 0 }}>Deployment: {result.deployment?.containerName ?? 'not created'}</p>
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

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
}

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.02)',
  color: 'var(--giga-text)',
  padding: '8px 10px',
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

const resultStyle: React.CSSProperties = {
  border: '1px solid rgba(66, 211, 139, 0.45)',
  borderRadius: 10,
  background: 'rgba(66, 211, 139, 0.12)',
  padding: 10,
  display: 'grid',
  gap: 4,
}
