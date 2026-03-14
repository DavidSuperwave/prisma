'use client'

import React from 'react'

export default function TestimonialSection() {
  return (
    <section style={{ padding: '6rem 1.25rem', background: 'var(--giga-bg)' }}>
      <div className="landing-container">
      <div style={{ textAlign: 'center', marginBottom: '1.3rem' }} className="animate-on-scroll">
        <div
          style={{
            fontSize: '0.72rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--giga-faint)',
            fontWeight: 700,
            marginBottom: '0.55rem',
          }}
        >
          Customer spotlight
        </div>
        <h2 style={{ color: 'var(--giga-text)', fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
          See how enterprises scaled customer engagement.
        </h2>
      </div>

      <div
        className="animate-on-scroll"
        style={{
          background: 'var(--giga-surface)',
          border: '1px solid var(--giga-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.2rem',
          boxShadow: 'var(--giga-shadow)',
          marginTop: '1rem',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem', alignItems: 'center' }}>
          <div>
            <div
              style={{
                display: 'inline-flex',
                border: '1px solid var(--giga-border)',
                borderRadius: 'var(--radius-pill)',
                padding: '0.34rem 0.8rem',
                background: 'var(--giga-surface-soft)',
                color: 'var(--giga-faint)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontSize: '0.72rem',
                fontWeight: 700,
                marginBottom: '0.9rem',
              }}
            >
              DWR rate 80%
            </div>
            <h3 style={{ fontSize: '1.35rem', color: 'var(--giga-text)', marginBottom: '0.5rem' }}>
              How DoorDash and Giga built reliable support at scale
            </h3>
            <a href="#cta" style={{ color: '#e2e8f0', fontWeight: 700, textDecoration: 'none' }}>
              Learn more
            </a>
          </div>
          <div>
            <blockquote
              style={{
                color: 'var(--giga-text)',
                lineHeight: 1.65,
                marginBottom: '0.9rem',
                fontStyle: 'italic',
                fontSize: '0.96rem',
              }}
            >
              &ldquo;At DoorDash, we operate at a massive scale across services, platforms, and languages. Giga leveraged usage
              data to deliver measurable improvements, including fewer escalations, faster resolution paths, and more efficient
              workflows across our teams.&rdquo;
            </blockquote>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#334155',
                  color: '#ffffff',
                  fontWeight: 700,
                }}
              >
                AF
              </div>
              <div>
                <div style={{ color: 'var(--giga-text)', fontWeight: 700 }}>Andy Fang</div>
                <div style={{ color: 'var(--giga-faint)', fontSize: '0.84rem' }}>Co-Founder at DoorDash</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </section>
  )
}
