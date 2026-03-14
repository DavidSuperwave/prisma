'use client'

export default function CTASection() {
  return (
    <section id="cta" style={{ padding: '6rem 1.25rem', background: 'var(--giga-surface)' }}>
      <div style={{ maxWidth: '920px', margin: '0 auto', textAlign: 'center' }} className="animate-on-scroll">
        <div
          style={{
            display: 'inline-flex',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid rgba(71,85,105,0.25)',
            background: 'var(--giga-surface-soft)',
            padding: '0.36rem 0.9rem',
            marginBottom: '1rem',
            color: 'var(--giga-faint)',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Get a personalized demo
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--giga-text)',
            fontSize: 'clamp(2rem, 4.7vw, 3.6rem)',
            lineHeight: 1.06,
            marginBottom: '0.8rem',
            fontWeight: 700,
          }}
        >
          Ready to see the Prisma AI agent in action?
        </h2>
        <p style={{ color: 'var(--giga-muted)', marginBottom: '1.2rem', maxWidth: '760px', marginInline: 'auto' }}>
          Prisma agents handle complex workflows at scale, from live customer support to compliance decisions, while
          maintaining consistent resolution quality in production.
        </p>
        <a
          href="#"
          className="giga-cta"
          style={{
            display: 'inline-flex',
            background: '#ffffff',
            color: '#111827',
            textDecoration: 'none',
            fontWeight: 700,
            border: '1px solid rgba(71,85,105,0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '0.86rem 1.85rem',
          }}
        >
          Talk to us
        </a>
      </div>
    </section>
  )
}
