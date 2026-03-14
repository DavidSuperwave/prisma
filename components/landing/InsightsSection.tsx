'use client'

import React from 'react'

const insights = [
  { label: 'Agregar flujo de seguimiento automático', type: 'Mejora de flujo',     tickets: '341 conv.', improvement: '18.2%' },
  { label: 'Calificación de urgencia inicial',        type: 'Ajuste de patrón',   tickets: '218 conv.', improvement: '14.7%' },
  { label: 'Recordatorio 24h antes de cita',          type: 'Gap de conocimiento', tickets: '192 conv.', improvement: '11.3%' },
]

export default function InsightsSection() {
  return (
    <section style={{ padding: 'var(--space-32) var(--space-8)', background: 'var(--surface-deep)', borderTop: '1px solid var(--divider)', borderBottom: '1px solid var(--divider)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-16)', alignItems: 'center' }}>
          {/* Card */}
          <div className="animate-on-scroll">
            <div style={{ background: 'var(--surface-mid)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>Tasa de resolución</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--success)', letterSpacing: '-0.02em' }}>+22%</div>
                </div>
                <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 'var(--radius-full)', padding: '0.25rem 0.75rem', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--success)' }}>Mes 3</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {insights.map((ins, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-offset)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--divider)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{ins.label}</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>{ins.type} · {ins.tickets}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--success)', letterSpacing: '-0.01em', marginLeft: 'var(--space-4)' }}>+{ins.improvement}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Copy */}
          <div className="animate-on-scroll">
            <div style={{ display: 'inline-flex', background: 'var(--surface-mid)', border: '1px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '0.375rem 1rem', marginBottom: 'var(--space-6)' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--amber)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Smart Insights</span>
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--white)', letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 'var(--space-6)' }}>Mejoran mientras tú duermes.</h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 'var(--space-8)' }}>Cada mes: cuántas conversaciones manejaron, tasa de resolución, escenarios más frecuentes y recomendaciones para el siguiente ciclo. No es un chatbot — es un equipo que aprende.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {[{ label: 'Elige el objetivo', desc: 'Tasa de resolución, escalaciones, satisfacción.' }, { label: 'Genera insights', desc: 'La IA agrupa conversaciones y encuentra raíz causa.' }, { label: 'Valida a escala', desc: 'Hipótesis probadas contra miles de chats reales.' }].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-md)', background: 'var(--surface-offset)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--amber)', flexShrink: 0 }}>{i + 1}</div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{item.label}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
