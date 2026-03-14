'use client'

import React from 'react'

export default function ValuePropSection() {
  return (
    <section style={{ padding: '4.2rem 1.25rem 3.6rem', background: 'var(--giga-surface)' }}>
      <div
        style={{
          maxWidth: '1120px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.8rem',
          alignItems: 'end',
        }}
      >
        <div className="animate-on-scroll">
          <p
            style={{
              color: '#f8fafc',
              fontSize: 'clamp(1.28rem, 2.6vw, 2rem)',
              lineHeight: 1.24,
              maxWidth: '620px',
              fontWeight: 600,
            }}
          >
            Solve your most complex support issues with AI, up and running in two weeks.
          </p>
        </div>

        <div
          className="animate-on-scroll"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))',
            gap: '0.9rem',
          }}
        >
          {[
            { label: 'DEFLECTION RATE', value: '98%' },
            { label: 'SUPPORTED LANGUAGES', value: '99' },
          ].map((item) => (
            <article
              key={item.label}
              style={{
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'var(--giga-surface-soft)',
                padding: '0.85rem 0.95rem',
              }}
            >
              <div
                style={{
                  color: '#8ea0b8',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  fontSize: '0.66rem',
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  marginTop: '0.2rem',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '1.9rem',
                  lineHeight: 1,
                }}
              >
                {item.value}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
