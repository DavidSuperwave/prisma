'use client'

import React from 'react'

const flowSteps = [
  {
    number: '01',
    title: 'Llega la solicitud de cotización',
    body: 'Un cliente envía una solicitud por WhatsApp, correo o teléfono. El equipo de operaciones la registra manualmente.',
  },
  {
    number: '02',
    title: 'Llenado manual de formularios',
    body: 'Un operador llena el portal o formulario de cada aseguradora individualmente — diferentes formatos, diferentes campos, cada vez.',
  },
  {
    number: '03',
    title: 'Espera de 24–72 horas',
    body: 'Las cotizaciones llegan gota a gota durante días. Los operadores dan seguimiento manual, persiguiendo respuestas entre canales.',
  },
  {
    number: '04',
    title: 'Normalización manual',
    body: 'Cada aseguradora responde en un formato diferente. Alguien construye manualmente una hoja comparativa.',
  },
  {
    number: '05',
    title: 'Conciliación mensual',
    body: 'A fin de mes, los equipos pasan días cruzando portales de aseguradoras contra el CRM para encontrar discrepancias.',
  },
]

export default function ProblemFlowSection() {
  return (
    <section id="problem" style={{ padding: '5rem 1.25rem 5.5rem', background: 'var(--giga-bg)' }}>
      <div className="landing-container landing-container--wide">
        <div className="animate-on-scroll" style={{ marginBottom: '1.8rem', maxWidth: '760px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              border: '1px solid var(--giga-border)',
              borderRadius: 'var(--radius-pill)',
              padding: '0.3rem 0.72rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--giga-faint)',
              background: 'var(--giga-surface-soft)',
              marginBottom: '0.9rem',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }} />
            El Problema
          </div>
          <h2
            style={{
              color: 'var(--giga-text)',
              fontSize: 'clamp(1.95rem, 4.2vw, 3rem)',
              lineHeight: 1.08,
              marginBottom: '0.6rem',
              fontFamily: 'var(--font-display)',
            }}
          >
            Cómo operan las agencias hoy. Sin IA.
          </h2>
          <p style={{ color: 'var(--giga-muted)', fontSize: '0.95rem' }}>
            Los corredores de seguros dedican el 60–70% de su tiempo a procesos manuales repetitivos que no agregan
            valor a sus clientes. Así se ve un flujo típico.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(245px, 1fr))', gap: '0.9rem' }}>
          {flowSteps.map((step) => (
            <article
              key={step.number}
              className="animate-on-scroll"
              style={{
                border: '1px solid var(--giga-border)',
                borderRadius: '14px',
                background: 'linear-gradient(180deg, rgba(26, 31, 41, 0.8) 0%, rgba(14, 17, 22, 0.9) 100%)',
                padding: '1rem',
                minHeight: '210px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.56rem',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '44px',
                  height: '28px',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  color: '#f8fafc',
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(255,255,255,0.06)',
                }}
              >
                {step.number}
              </div>
              <h3 style={{ color: 'var(--giga-text)', fontSize: '1rem', lineHeight: 1.3, fontWeight: 700 }}>
                {step.title}
              </h3>
              <p style={{ color: 'var(--giga-muted)', fontSize: '0.86rem', lineHeight: 1.55 }}>{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
