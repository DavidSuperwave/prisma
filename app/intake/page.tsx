'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'

type Status = 'idle' | 'submitting' | 'error'

const industries = [
  'Legal',
  'Salud',
  'Inmobiliaria',
  'Belleza',
  'Educacion',
  'Restaurantes',
  'Servicios profesionales',
  'Otro',
]

export default function IntakePage() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string>('')
  const [successState, setSuccessState] = useState<'none' | 'paid' | 'cancelled'>('none')
  const [files, setFiles] = useState<FileList | null>(null)

  const statusMessage = useMemo(() => {
    if (successState === 'paid') {
      return 'Pago confirmado. Ya recibimos tu solicitud y nuestro equipo iniciara onboarding.'
    }
    if (successState === 'cancelled') {
      return 'Checkout cancelado. Puedes volver a intentarlo cuando quieras.'
    }
    return ''
  }, [successState])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const statusParam = params.get('status')
    if (statusParam === 'success') {
      setSuccessState('paid')
    } else if (statusParam === 'cancelled') {
      setSuccessState('cancelled')
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('submitting')
    setError('')

    try {
      const formElement = event.currentTarget
      const formData = new FormData(formElement)

      if (files) {
        Array.from(files).forEach((file) => formData.append('assets', file))
      }

      const intakeResponse = await fetch('/api/intake', {
        method: 'POST',
        body: formData,
      })

      const intakePayload = (await intakeResponse.json()) as { intakeId?: string; error?: string }
      if (!intakeResponse.ok || !intakePayload.intakeId) {
        throw new Error(intakePayload.error ?? 'No pudimos guardar tu intake.')
      }

      const checkoutResponse = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intakeId: intakePayload.intakeId }),
      })

      const checkoutPayload = (await checkoutResponse.json()) as { checkoutUrl?: string; error?: string }
      if (!checkoutResponse.ok || !checkoutPayload.checkoutUrl) {
        throw new Error(checkoutPayload.error ?? 'No pudimos crear el checkout.')
      }

      window.location.assign(checkoutPayload.checkoutUrl)
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
          Completa el formulario y al final te enviaremos al checkout para iniciar el setup de tu agente.
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
            Nombre legal del negocio
            <input name="businessName" required style={inputStyle} />
          </label>
          <label>
            Persona de contacto
            <input name="contactName" required style={inputStyle} />
          </label>
          <label>
            Email de contacto
            <input name="contactEmail" type="email" required style={inputStyle} />
          </label>
          <label>
            WhatsApp de contacto
            <input name="whatsappNumber" required style={inputStyle} placeholder="+52..." />
          </label>
          <label>
            Industria
            <select name="industry" required style={inputStyle}>
              <option value="">Selecciona una industria</option>
              {industries.map((industry) => (
                <option key={industry} value={industry}>
                  {industry}
                </option>
              ))}
            </select>
          </label>
          <label>
            Website (opcional)
            <input name="websiteUrl" type="url" style={inputStyle} placeholder="https://..." />
          </label>

          <div style={grid2Style}>
            <label>
              Instagram (opcional)
              <input name="instagram" type="url" style={inputStyle} />
            </label>
            <label>
              Facebook (opcional)
              <input name="facebook" type="url" style={inputStyle} />
            </label>
            <label>
              TikTok (opcional)
              <input name="tiktok" type="url" style={inputStyle} />
            </label>
            <label>
              LinkedIn (opcional)
              <input name="linkedin" type="url" style={inputStyle} />
            </label>
          </div>

          <label>
            Color principal de marca (opcional)
            <input name="primaryColor" type="color" defaultValue="#4f46e5" style={colorInputStyle} />
          </label>

          <label>
            Describe tus servicios y objetivo principal
            <textarea name="serviceDescription" required rows={4} style={inputStyle} />
          </label>
          <label>
            Instrucciones de tono y estilo (opcional)
            <textarea name="toneGuidance" rows={3} style={inputStyle} />
          </label>
          <label>
            Comentarios adicionales (opcional)
            <textarea name="notes" rows={3} style={inputStyle} />
          </label>
          <label>
            Assets (logo, brand kit, docs, media)
            <input
              type="file"
              multiple
              onChange={(event) => setFiles(event.target.files)}
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.svg,.zip,.mp4,.mov"
              style={inputStyle}
            />
          </label>

          <button type="submit" disabled={status === 'submitting'} style={buttonStyle}>
            {status === 'submitting' ? 'Procesando...' : 'Continuar a checkout'}
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

const colorInputStyle: React.CSSProperties = {
  ...inputStyle,
  height: 44,
  padding: 4,
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

const grid2Style: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
}
