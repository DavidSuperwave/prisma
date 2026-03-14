'use client'

import React from 'react'

export default function VoiceExperienceSection() {
  return (
    <section id="voice" style={{ padding: '6rem 1.25rem', background: 'var(--giga-surface)' }}>
      <div style={{ maxWidth: '1120px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1.4rem' }}>
        <div className="animate-on-scroll">
          <div
            style={{
              display: 'inline-flex',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--giga-border)',
              padding: '0.36rem 0.88rem',
              background: 'var(--giga-surface-soft)',
              color: 'var(--giga-faint)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: '0.72rem',
              fontWeight: 700,
              marginBottom: '1rem',
            }}
          >
            Natural Voice
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--giga-text)',
              fontSize: 'clamp(1.95rem, 4.2vw, 3.2rem)',
              lineHeight: 1.08,
              marginBottom: '0.85rem',
            }}
          >
            Engage with empathy
          </h2>
          <p style={{ color: 'var(--giga-muted)', marginBottom: '1rem' }}>
            Emotionally-aware agents that understand tone, intent, and context to keep support interactions natural.
          </p>
          <ul style={{ display: 'grid', gap: '0.65rem', listStyle: 'none' }}>
            {[
              'Personalized voices tailored to your brand',
              'Dynamic interrupts for natural turn-taking',
              'Ultra-low latency for responsive conversations',
            ].map((item) => (
              <li
                key={item}
                style={{
                  background: 'var(--giga-surface-soft)',
                  border: '1px solid var(--giga-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.7rem 0.8rem',
                  color: 'var(--giga-text)',
                  fontWeight: 600,
                }}
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div
          className="animate-on-scroll"
          style={{
            background: 'linear-gradient(160deg, #1a2232 0%, #1e2d42 100%)',
            border: '1px solid var(--giga-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem',
            minHeight: '300px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.4rem' }}>Voice Experience</div>
            <p style={{ color: '#b6c0cf', fontSize: '0.9rem' }}>
              Fluidly handle accents, interruptions, and rapid turns of conversation.
            </p>
          </div>
          <div
            style={{
              alignSelf: 'center',
              width: '84px',
              height: '84px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '1px solid rgba(30,41,59,0.15)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#1e293b',
              fontWeight: 700,
            }}
          >
            Play
          </div>
          <a
            href="#cta"
            style={{
              textDecoration: 'none',
              color: '#e2e8f0',
              fontWeight: 700,
              fontSize: '0.9rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            Explore Voice Experience <span aria-hidden>›</span>
          </a>
        </div>
      </div>
    </section>
  )
}
