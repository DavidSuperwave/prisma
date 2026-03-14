'use client'

import React from 'react'
import { BriefcaseBusiness, PenLine, Sparkles } from 'lucide-react'

const features = [
  {
    title: 'Extremely customizable',
    body: 'Fine-tune every nuance to match your business.',
    icon: BriefcaseBusiness,
  },
  {
    title: 'Auto policy writing',
    body: 'Get started with just a transcript.',
    icon: PenLine,
  },
  {
    title: 'Built-in Copilot',
    body: 'AI helps you build your ideal support agent.',
    icon: Sparkles,
  },
]

export default function FeatureGrid() {
  return (
    <section id="features" style={{ padding: '3.2rem 1.25rem 5.4rem', background: 'var(--giga-bg)' }}>
      <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.4rem',
            alignItems: 'start',
          }}
        >
          <div className="animate-on-scroll" style={{ paddingTop: '0.35rem' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                marginBottom: '0.75rem',
                color: '#d0d8e4',
                fontSize: '0.72rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#f97316',
                  display: 'inline-block',
                }}
              />
              Custom Agents
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(2.1rem, 4.8vw, 3.8rem)',
                lineHeight: 1.02,
                color: '#ffffff',
              }}
            >
              Built to handle complexity
            </h2>
          </div>

          <div
            className="animate-on-scroll"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '0.6rem',
            }}
          >
            {features.map((f) => {
              const Icon = f.icon
              return (
                <article
                  key={f.title}
                  style={{
                    background: 'var(--giga-surface-soft)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    borderRadius: '12px',
                    padding: '0.9rem',
                    minHeight: '145px',
                  }}
                >
                  <Icon size={16} color="#d2d9e5" strokeWidth={1.8} />
                  <h3
                    style={{
                      color: 'var(--giga-text)',
                      fontSize: '1rem',
                      lineHeight: 1.25,
                      marginTop: '0.62rem',
                      marginBottom: '0.35rem',
                      fontWeight: 700,
                    }}
                  >
                    {f.title}
                  </h3>
                  <p style={{ color: 'var(--giga-muted)', fontSize: '0.86rem', lineHeight: 1.45 }}>{f.body}</p>
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
