'use client'

export default function ChatbotKillShot() {
  return (
    <section style={{ padding: '0.8rem 1.25rem 2.8rem', background: 'var(--giga-bg)' }}>
      <div
        className="landing-container landing-container--compact animate-on-scroll"
        style={{
          border: '1px solid var(--giga-border)',
          borderRadius: '14px',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(24,29,37,0.88) 0%, rgba(14,18,24,0.92) 100%)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1px', background: 'var(--giga-border)' }}>
          <article style={{ background: 'var(--giga-surface)', padding: '1rem 1.1rem' }}>
            <p style={{ color: '#fca5a5', fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.5, margin: 0 }}>
              ❌ No es un chatbot que responde preguntas frecuentes.
            </p>
          </article>
          <article style={{ background: 'var(--giga-surface)', padding: '1rem 1.1rem' }}>
            <p style={{ color: '#86efac', fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.5, margin: 0 }}>
              ✓ Es un agente que recuerda a María, sabe que lleva 3 semanas esperando su cotización, y le escribe hoy.
            </p>
          </article>
        </div>
      </div>
    </section>
  )
}
