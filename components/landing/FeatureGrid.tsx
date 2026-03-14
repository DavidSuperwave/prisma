'use client'

import React from 'react'

const features = [
  { tag: 'OPERADOR',    title: 'El jefe que nunca duerme',   body: 'Recibe cada mensaje de WhatsApp, entiende la intención y lo rutea al agente correcto — incluso a las 3am del domingo.', accent: 'var(--indigo)' },
  { tag: 'SDR',         title: 'Cero leads olvidados',        body: 'Follow-ups automáticos, recordatorios de citas, status nudges. El empleado que nunca dice "mañana lo hago".', accent: 'var(--violet)' },
  { tag: 'CALIFICADOR', title: 'Solo habla con quien vale',   body: 'Leads llegan pre-calificados y categorizados. Deja de perder tiempo en llamadas que no van a ningún lado.', accent: 'var(--amber)' },
  { tag: 'SUPERMEMORIA',title: 'Recuerdan a cada cliente',    body: 'Memoria persistente cross-conversación. Cuando un cliente regresa, el agente retoma exactamente donde se quedó.', accent: 'var(--indigo)' },
  { tag: 'CONTROL',     title: 'Tú siempre mandas',           body: 'Confianza alta: actúa y te notifica. Media: espera aprobación. Baja: te escala inmediato. Nunca va rogue.', accent: 'var(--violet)' },
  { tag: 'DEPLOY',      title: 'Live en 5 días',              body: '1,000+ conversaciones simuladas antes de tocar un cliente real. Battle-tested desde el día uno.', accent: 'var(--amber)' },
]

const glowByAccent: Record<string, string> = {
  'var(--indigo)': 'rgba(129,140,248,0.4)',
  'var(--violet)': 'rgba(167,139,250,0.4)',
  'var(--amber)':  'rgba(245,158,11,0.4)',
}

export default function FeatureGrid() {
  return (
    <section id="features" style={{ padding: 'var(--space-32) var(--space-8)', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-20)' }} className="animate-on-scroll">
        <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--surface-deep)', border: '1px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '0.375rem 1rem', marginBottom: 'var(--space-6)' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--indigo)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Construido para manejar la complejidad</span>
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--white)', letterSpacing: '-0.02em', lineHeight: 1.1, maxWidth: '600px', margin: '0 auto var(--space-6)' }}>Extremadamente personalizable.</h2>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', color: 'var(--text-muted)', maxWidth: '480px', margin: '0 auto', lineHeight: 1.7 }}>Cada agente se configura para tu industria. Legal, dental, inmobiliaria, seguros — ya habla tu idioma desde el primer día.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
        {features.map((f, i) => (
          <div key={i} className="animate-on-scroll" style={{
            background: 'var(--surface-deep)', border: '1px solid var(--divider)',
            borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)',
            position: 'relative', overflow: 'hidden',
            transition: 'all 300ms cubic-bezier(0.16,1,0.3,1)', cursor: 'default',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = glowByAccent[f.accent]; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--divider)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
          >
            <div style={{ position: 'absolute', top: 0, left: 'var(--space-8)', right: 'var(--space-8)', height: '1px', background: `linear-gradient(to right, transparent, ${f.accent}, transparent)`, opacity: 0.6 }} />
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: f.accent, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 'var(--space-4)' }}>{f.tag}</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: 'var(--space-3)', lineHeight: 1.2 }}>{f.title}</h3>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.7 }}>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
