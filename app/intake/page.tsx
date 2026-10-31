'use client'

import { FormEvent, useMemo, useState } from 'react'

type Status = 'idle' | 'submitting' | 'error' | 'success'

const BRAND_ASSET_OPTIONS = [
  'Logo',
  'Colores',
  'Fotos',
  'Ninguno',
]

export default function IntakePage() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string>('')
  const [leadScore, setLeadScore] = useState<number | null>(null)

  const statusMessage = useMemo(() => {
    if (status === 'success') {
      return `Solicitud enviada. Te contactaremos pronto${leadScore === null ? '.' : ` (lead score: ${leadScore})`}`
    }
    return ''
  }, [leadScore, status])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('submitting')
    setError('')
    setLeadScore(null)

    try {
      const formElement = event.currentTarget
      const formData = new FormData(formElement)
      const intakeResponse = await fetch('/api/intake', {
        method: 'POST',
        body: formData,
      })

      const intakePayload = (await intakeResponse.json()) as {
        intakeId?: string
        leadScore?: number
        error?: string
      }
      if (!intakeResponse.ok || !intakePayload.intakeId) {
        throw new Error(intakePayload.error ?? 'No pudimos guardar tu intake.')
      }

      setLeadScore(typeof intakePayload.leadScore === 'number' ? intakePayload.leadScore : null)
      formElement.reset()
      setStatus('success')
    } catch (submitError) {
      setStatus('error')
      setError(submitError instanceof Error ? submitError.message : 'Error inesperado.')
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--giga-bg)',
        color: 'var(--giga-text)',
        padding: '48px 16px',
      }}
    >
      <section
        style={{
          maxWidth: 920,
          margin: '0 auto',
          background: 'var(--giga-surface)',
          border: '1px solid var(--giga-border)',
          borderRadius: 20,
          padding: '32px 24px',
          boxShadow: 'var(--giga-shadow)',
        }}
      >
        <p style={{ color: 'var(--giga-law)', marginBottom: 10, fontWeight: 700 }}>Prisma Intake</p>
        <h1 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.5rem)', marginBottom: 10 }}>Cuentanos sobre tu negocio</h1>
        <p style={{ color: 'var(--giga-muted)', marginBottom: 24 }}>
          Completa este formulario para evaluar tu proyecto y preparar la propuesta inicial.
        </p>

        {statusMessage ? (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid rgba(66, 211, 139, 0.45)',
              background: 'rgba(66, 211, 139, 0.12)',
              padding: 12,
              marginBottom: 18,
            }}
          >
            {statusMessage}
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid rgba(248, 113, 113, 0.45)',
              background: 'rgba(248, 113, 113, 0.12)',
              padding: 12,
              marginBottom: 18,
            }}
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <label>
            Nombre completo
            <input name="full_name" required style={inputStyle} />
          </label>
          <label>
            ¿Que negocio tienes?
            <input name="business_name" required style={inputStyle} />
          </label>
          <label>
            Sitio web (opcional)
            <input
              name="website_url"
              type="text"
              style={inputStyle}
              placeholder="Si no tienes, dejalo en blanco"
            />
          </label>
          <label>
            Ubicacion del negocio
            <input name="business_location" required style={inputStyle} />
          </label>
          <label>
            ¿Por que quieres actualizar o crear tu sitio web?
            <textarea name="reason" required rows={4} style={inputStyle} />
          </label>
          <label>
            Email
            <input name="email" type="email" required style={inputStyle} />
          </label>

          <fieldset style={fieldsetStyle}>
            <legend style={{ padding: '0 4px' }}>Activos de marca</legend>
            <div style={brandAssetsGridStyle}>
              {BRAND_ASSET_OPTIONS.map((asset) => (
                <label key={asset} style={checkboxLabelStyle}>
                  <input type="checkbox" name="brand_assets" value={asset} />
                  <span>{asset}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button type="submit" disabled={status === 'submitting'} style={buttonStyle}>
            {status === 'submitting' ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </form>
      </section>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  display: 'block',
  marginTop: 6,
  borderRadius: 10,
  border: '1px solid var(--giga-border)',
  background: 'rgba(255,255,255,0.02)',
  color: 'var(--giga-text)',
  padding: '11px 12px',
  fontSize: 14,
}

const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 12,
  background: 'linear-gradient(130deg, #6d6aff 0%, #88a4ff 100%)',
  color: '#ffffff',
  fontWeight: 700,
  padding: '12px 16px',
  marginTop: 8,
  cursor: 'pointer',
}

const fieldsetStyle: React.CSSProperties = {
  border: '1px solid var(--giga-border)',
  borderRadius: 10,
  padding: '8px 12px 12px',
}

const brandAssetsGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
}

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
}
