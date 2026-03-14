'use client'

import React from 'react'

const integrations = [
  { category: 'Importación de datos', label: 'Excel / CSV' },
  { category: 'CRM', label: 'Microsoft Dynamics' },
  { category: 'Correo', label: 'Gmail / Outlook' },
  { category: 'Mensajería', label: 'WhatsApp' },
  { category: 'Cotización y datos', label: 'Portales de Aseguradoras' },
  { category: 'Voz', label: 'Llamadas Salientes' },
]

export default function IntegrationsSection() {
  return (
    <section id="integrations" style={{ padding: '1rem 1.25rem 5.6rem', background: 'var(--giga-bg)' }}>
      <div className="landing-container landing-container--compact">
        <div className="animate-on-scroll" style={{ marginBottom: '1.2rem', maxWidth: '760px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--giga-border)',
              background: 'var(--giga-surface-soft)',
              color: 'var(--giga-faint)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '0.3rem 0.72rem',
              marginBottom: '0.85rem',
            }}
          >
            Integraciones
          </div>
          <h2
            style={{
              color: 'var(--giga-text)',
              fontSize: 'clamp(1.85rem, 4vw, 2.9rem)',
              lineHeight: 1.05,
              marginBottom: '0.55rem',
            }}
          >
            Se integra con lo que ya usas
          </h2>
          <p style={{ color: 'var(--giga-muted)', fontSize: '0.95rem' }}>Sin migraciones. Sin cambios de stack.</p>
        </div>

        <div
          className="animate-on-scroll"
          style={{
            border: '1px solid var(--giga-border)',
            borderRadius: '14px',
            overflow: 'hidden',
            background: 'linear-gradient(180deg, rgba(24,29,37,0.82) 0%, rgba(14,17,23,0.88) 100%)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            {integrations.map((item, index) => (
              <article
                key={item.label}
                style={{
                  padding: '1.2rem 1rem',
                  borderRight: index % 3 !== 2 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  borderBottom: index < 3 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  minHeight: '120px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: '0.45rem',
                }}
              >
                <span
                  style={{
                    color: 'var(--giga-faint)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontSize: '0.69rem',
                    fontWeight: 700,
                  }}
                >
                  {item.category}
                </span>
                <span style={{ color: 'var(--giga-text)', fontSize: '1.02rem', fontWeight: 700 }}>{item.label}</span>
              </article>
            ))}
          </div>
        </div>

        <p className="animate-on-scroll" style={{ textAlign: 'center', color: 'var(--giga-faint)', fontSize: '0.9rem', marginTop: '0.95rem' }}>
          ¿Usas otro sistema? Hablemos.
        </p>
      </div>
    </section>
  )
}
