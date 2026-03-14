'use client'

import React from 'react'

const primaryIntegrations = [
  { category: 'Agenda', label: 'Google Calendar' },
  { category: 'Importación de datos', label: 'Excel / CSV' },
  { category: 'Correo', label: 'Gmail / Outlook' },
]

const secondaryIntegrations = [
  { category: 'CRM', label: 'Microsoft Dynamics' },
  { category: 'Cotización y datos', label: 'Portales de aseguradoras' },
]

export default function IntegrationsSection() {
  return (
    <section id="integrations" style={{ padding: '1rem 1.25rem 5.6rem', background: 'var(--giga-bg)' }}>
      <div className="landing-container landing-container--compact">
        <div className="animate-on-scroll" style={{ marginBottom: '1.2rem', maxWidth: '760px' }}>
          <h2
            style={{
              color: 'var(--giga-text)',
              fontSize: 'clamp(1.85rem, 4vw, 2.9rem)',
              lineHeight: 1.05,
              marginBottom: '0.55rem',
            }}
          >
            Funciona con lo que ya tienes.
          </h2>
          <p style={{ color: 'var(--giga-muted)', fontSize: '0.95rem' }}>
            No necesitas cambiar nada. Si ya usas WhatsApp, ya estás listo.
          </p>
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
          <article style={{ padding: '1.25rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span
              style={{
                color: '#22d3ee',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontSize: '0.69rem',
                fontWeight: 700,
                display: 'block',
                marginBottom: '0.35rem',
              }}
            >
              Mensajería principal
            </span>
            <span style={{ color: 'var(--giga-text)', fontSize: '1.35rem', fontWeight: 800 }}>WhatsApp</span>
          </article>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            {primaryIntegrations.map((item, index) => (
              <article
                key={item.label}
                style={{
                  padding: '1.2rem 1rem',
                  borderRight: index % 3 !== 2 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            {secondaryIntegrations.map((item, index) => (
              <article
                key={item.label}
                style={{
                  padding: '1.2rem 1rem',
                  borderRight: index === 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  minHeight: '110px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: '0.45rem',
                  opacity: 0.9,
                }}
              >
                <span
                  style={{
                    color: 'var(--giga-faint)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontSize: '0.66rem',
                    fontWeight: 700,
                  }}
                >
                  {item.category}
                </span>
                <span style={{ color: '#cbd5e1', fontSize: '0.95rem', fontWeight: 600 }}>{item.label}</span>
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
