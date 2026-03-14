'use client'

import React, { useState } from 'react'

export default function CTASection() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email) setSubmitted(true)
  }

  return (
    <section id="cta" style={{ padding: 'var(--space-32) var(--space-8)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '600px', height: '400px', background: 'radial-gradient(ellipse, rgba(129,140,248,0.1) 0%, rgba(167,139,250,0.05) 40%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center', position: 'relative' }} className="animate-on-scroll">
        <div style={{ display: 'inline-flex', background: 'var(--surface-deep)', border: '1px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '0.375rem 1rem', marginBottom: 'var(--space-8)' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Demo personalizado</span>
        </div>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--white)', letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: 'var(--space-6)' }}>¿Listo para ver{"\n"}tu equipo IA en acción?</h2>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 'var(--space-10)' }}>Cuéntanos tu industria y en 24 horas te mostramos una demo con los flujos exactos de tu negocio. Sin compromiso.</p>

        {!submitted ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 'var(--space-3)', maxWidth: '440px', margin: '0 auto' }}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" required style={{ flex: 1, background: 'var(--void)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', outline: 'none', transition: 'border-color 180ms' }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--indigo)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
            <button type="submit" style={{ background: 'var(--indigo)', color: 'var(--void)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', transition: 'all 180ms cubic-bezier(0.16,1,0.3,1)', whiteSpace: 'nowrap' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--indigo-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--indigo)')}
            >Solicitar demo →</button>
          </form>
        ) : (
          <div style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--success)' }}>✓ Recibido. Te contactamos en menos de 24 horas.</div>
        )}

        <p style={{ marginTop: 'var(--space-6)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>Live en 5 días hábiles · $6,000 MXN/mes · Hecho para México</p>
      </div>
    </section>
  )
}
