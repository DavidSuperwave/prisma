'use client'

import React from 'react'

const costRows = [
  {
    process: 'Cotización de pólizas',
    before: '25 min / cotización',
    after: '~3 min / cotización',
  },
  {
    process: 'Conciliación de datos',
    before: '3 días / mes',
    after: 'Continuo',
  },
  {
    process: 'Monitoreo de pagos',
    before: 'Semanal manual',
    after: 'Diario automatizado',
  },
  {
    process: 'Tasa de error',
    before: '12%',
    after: '<1%',
  },
  {
    process: 'Fuga de ingresos',
    before: '~15% sin rastrear',
    after: '~2% sin rastrear',
  },
]

export default function CostSection() {
  return (
    <section id="cost" style={{ padding: '1.4rem 1.25rem 4.4rem', background: 'var(--giga-bg)' }}>
      <div className="landing-container landing-container--compact">
        <div className="animate-on-scroll" style={{ marginBottom: '1.2rem', maxWidth: '780px' }}>
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
            ROI
          </div>
          <h2
            style={{
              color: 'var(--giga-text)',
              fontSize: 'clamp(1.85rem, 4vw, 2.9rem)',
              lineHeight: 1.05,
              marginBottom: '0.55rem',
            }}
          >
            El costo de no automatizar
          </h2>
          <p style={{ color: 'var(--giga-muted)', fontSize: '0.95rem' }}>
            Cada proceso manual tiene un costo oculto: tiempo, errores e ingresos perdidos. Esto es lo que cambia
            cuando Prisma toma el control.
          </p>
        </div>

        <div
          className="animate-on-scroll"
          style={{
            border: '1px solid var(--giga-border)',
            borderRadius: '14px',
            background: 'linear-gradient(180deg, rgba(23,27,34,0.86) 0%, rgba(14,18,24,0.9) 100%)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr 1fr',
              gap: '0.8rem',
              padding: '0.85rem 0.95rem',
              borderBottom: '1px solid var(--giga-border)',
              color: 'var(--giga-faint)',
              fontSize: '0.72rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            <span>Proceso</span>
            <span>Antes</span>
            <span>Después</span>
          </div>

          {costRows.map((row) => (
            <div
              key={row.process}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr 1fr',
                gap: '0.8rem',
                padding: '0.82rem 0.95rem',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                alignItems: 'center',
              }}
            >
              <span style={{ color: 'var(--giga-text)', fontSize: '0.9rem', fontWeight: 600 }}>{row.process}</span>
              <span style={{ color: '#94a3b8', fontSize: '0.86rem', textDecoration: 'line-through' }}>{row.before}</span>
              <span style={{ color: '#e2e8f0', fontSize: '0.86rem', fontWeight: 600 }}>{row.after}</span>
            </div>
          ))}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr 1fr',
              gap: '0.8rem',
              padding: '0.9rem 0.95rem',
              background: 'rgba(255,255,255,0.03)',
              alignItems: 'center',
            }}
          >
            <span style={{ color: 'var(--giga-text)', fontSize: '0.9rem', fontWeight: 700 }}>ROI estimado</span>
            <span style={{ color: 'var(--giga-faint)', fontSize: '0.82rem' }}>—</span>
            <span style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: 800 }}>6–8x ROI</span>
          </div>
        </div>
      </div>
    </section>
  )
}
