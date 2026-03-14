'use client'

import React from 'react'

const costRows = [
  {
    task: 'Llegó un cliente, necesitas cotización',
    today: 'Le avisas a tu equipo manualmente — 2 horas después',
    agent: 'Notifica y abre el proceso en 30 segundos',
  },
  {
    task: 'Alguien necesita su factura',
    today: 'Te escriben a ti, tú la buscas, tú la mandas — mismo día si tienes suerte',
    agent: 'Gestionada en minutos, sin tocarte',
  },
  {
    task: 'Hay que darle seguimiento a un prospecto',
    today: 'Lo apuntas, lo olvidas, lo recuerdas 3 días después',
    agent: 'Seguimiento automático al día siguiente',
  },
  {
    task: 'Un cliente pregunta algo que no sabes',
    today: 'Interrumpes a tu equipo, esperas respuesta — 40 minutos perdidos',
    agent: 'Respuesta inmediata con la información correcta',
  },
  {
    task: 'Necesitas saber qué pasó con un cliente',
    today: 'Preguntas a 3 personas, reconstruyes el historial — 1 hora',
    agent: 'Historial completo disponible al instante',
  },
  {
    task: 'Fin de mes: ¿cuántos leads entraron?',
    today: 'No sabes. Nadie lleva el conteo',
    agent: 'Reporte listo, sin pedirlo',
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
            EL COSTO DE NO AUTOMATIZAR
          </div>
          <h2
            style={{
              color: 'var(--giga-text)',
              fontSize: 'clamp(1.85rem, 4vw, 2.9rem)',
              lineHeight: 1.05,
              marginBottom: '0.55rem',
            }}
          >
            El 70% de tu tiempo se va en tareas que tu agente puede hacer mejor que tú.
          </h2>
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
            <span>Tarea</span>
            <span>Tú hoy</span>
            <span>Tu agente</span>
          </div>

          {costRows.map((row) => (
            <div
              key={row.task}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr 1fr',
                gap: '0.8rem',
                padding: '0.82rem 0.95rem',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                alignItems: 'center',
              }}
            >
              <span style={{ color: 'var(--giga-text)', fontSize: '0.9rem', fontWeight: 600 }}>{row.task}</span>
              <span style={{ color: '#94a3b8', fontSize: '0.86rem' }}>{row.today}</span>
              <span style={{ color: '#e2e8f0', fontSize: '0.86rem', fontWeight: 600 }}>{row.agent}</span>
            </div>
          ))}
        </div>

        <p className="animate-on-scroll" style={{ color: 'var(--giga-faint)', fontSize: '0.95rem', marginTop: '0.95rem' }}>
          Cada una de esas horas tiene un costo. Tu agente las recupera todas.
        </p>
      </div>
    </section>
  )
}
