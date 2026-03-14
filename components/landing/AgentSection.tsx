'use client'

import React, { useState } from 'react'

const steps = [
  { id: 'create',  label: 'Crear el equipo',       title: 'Configura tu equipo IA',            body: 'Cuéntanos tu industria. Prisma selecciona los patrones especializados y configura tu equipo de 3 agentes — Operador, SDR y Calificador.' },
  { id: 'train',   label: 'Entrenar agentes',       title: '1,000+ conversaciones simuladas',   body: 'Antes de que un cliente real hable con tus agentes, los exponemos a 1,000+ escenarios de tu industria. Tu equipo llega battle-tested.' },
  { id: 'launch',  label: 'Lanzar en WhatsApp',     title: 'Live en 5 días hábiles',            body: 'Día 1-2: Discovery. Día 3-4: Configuración. Día 5: QR pair + go live. Tu equipo IA operando antes del viernes.' },
  { id: 'improve', label: 'Mejorar cada semana',    title: 'Aprenden de cada corrección',       body: 'Corrígelos una vez, aprenden para siempre. Las correcciones se guardan como contexto persistente — no fine-tuning, fine-tuning de memoria.' },
]

const mockMessages = [
  { side: 'right', text: 'Hola, ¿tienen disponibilidad esta semana?', agent: false },
  { side: 'left',  text: '¡Hola! Claro. ¿Para qué servicio te interesa agendar?', agent: true },
  { side: 'right', text: 'Consulta de divorcio', agent: false },
  { side: 'left',  text: 'Perfecto. Te conecto con el equipo legal. Un momento.', agent: true },
]

export default function AgentSection() {
  const [active, setActive] = useState(0)

  return (
    <section style={{ padding: 'var(--space-32) var(--space-8)', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-16)', alignItems: 'center' }}>
        {/* Left */}
        <div className="animate-on-scroll">
          <div style={{ display: 'inline-flex', background: 'var(--surface-deep)', border: '1px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '0.375rem 1rem', marginBottom: 'var(--space-6)' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--indigo)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Copilot integrado</span>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--white)', letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 'var(--space-4)' }}>La IA construye{"\n"}tu equipo ideal.</h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 'var(--space-10)' }}>Cada agente se ancla en tus estándares de negocio, reglas de compliance y flujos de trabajo — para que cada interacción sea consistente.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {steps.map((step, i) => (
              <button key={step.id} onClick={() => setActive(i)} style={{
                textAlign: 'left', background: active === i ? 'var(--surface-mid)' : 'transparent',
                border: active === i ? '1px solid var(--border)' : '1px solid transparent',
                borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-6)',
                cursor: 'pointer', transition: 'all 180ms cubic-bezier(0.16,1,0.3,1)',
              }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: active === i ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'color 180ms' }}>{step.label}</div>
                {active === i && <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-2)', lineHeight: 1.6 }}>{step.body}</div>}
              </button>
            ))}
          </div>
        </div>

        {/* Right: card */}
        <div className="animate-on-scroll" style={{
          background: 'var(--surface-deep)', border: '1px solid var(--divider)',
          borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)',
          position: 'relative', overflow: 'hidden', minHeight: '420px',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '200px', height: '200px', background: 'radial-gradient(circle, var(--indigo-glow) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 'var(--space-4)' }}>PASO {active + 1} DE 4</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--white)', letterSpacing: '-0.01em', marginBottom: 'var(--space-4)' }}>{steps[active].title}</h3>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.7 }}>{steps[active].body}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-8)' }}>
            {mockMessages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.side === 'right' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  background: msg.agent ? 'var(--surface-offset)' : 'var(--indigo)',
                  color: msg.agent ? 'var(--text-muted)' : 'var(--void)',
                  padding: 'var(--space-2) var(--space-4)',
                  borderRadius: msg.side === 'right' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)', fontWeight: 500, maxWidth: '80%',
                }}>{msg.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
