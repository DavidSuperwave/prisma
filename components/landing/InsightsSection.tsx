'use client'

import React from 'react'

const insights = [
  { label: 'Add self-service reservation modification flow', type: 'Policy Modification', tickets: '928 tickets', improvement: '13.8% improvement' },
  { label: 'Add fallback search flow for missing confirmation', type: 'Policy Modification', tickets: '1,190 tickets', improvement: '22.2% improvement' },
  { label: 'Add FAQ and handling rules', type: 'Knowledge Gap', tickets: '72 tickets', improvement: '3.5% improvement' },
]

export default function InsightsSection() {
  return (
    <section id="insights" style={{ padding: '6rem 1.25rem', background: 'var(--giga-bg)' }}>
      <div className="landing-container">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1.4rem', alignItems: 'center' }}>
          <div className="animate-on-scroll">
            <div
              style={{
                background: 'var(--giga-surface-soft)',
                border: '1px solid var(--giga-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '1rem',
                boxShadow: 'var(--giga-shadow)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <div style={{ color: 'var(--giga-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, fontSize: '0.72rem' }}>
                    Resolution Rate Improvement (Voice)
                  </div>
                  <div style={{ marginTop: '0.2rem', color: 'var(--giga-success)', fontSize: '2rem', fontWeight: 700 }}>14%</div>
                </div>
                <div style={{ color: 'var(--giga-muted)', fontSize: '0.84rem', fontWeight: 600 }}>1,302 of 2,170 tickets</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {insights.map((ins, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.6rem',
                      padding: '0.65rem',
                      background: '#1e2535',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--giga-border)',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--giga-text)' }}>{ins.label}</div>
                      <div style={{ fontSize: '0.77rem', color: 'var(--giga-faint)' }}>
                        {ins.type} · {ins.tickets}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--giga-success)', fontSize: '0.82rem' }}>{ins.improvement}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="animate-on-scroll">
            <div
              style={{
                display: 'inline-flex',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--giga-border)',
                background: 'var(--giga-surface-soft)',
                padding: '0.36rem 0.88rem',
                marginBottom: '1rem',
                color: 'var(--giga-faint)',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontSize: '0.72rem',
              }}
            >
              Smart Insights
            </div>
            <h2
              style={{
                color: 'var(--giga-text)',
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(1.95rem, 4.2vw, 3.2rem)',
                lineHeight: 1.06,
                marginBottom: '0.85rem',
              }}
            >
              Improve as you go
            </h2>
            <p style={{ color: 'var(--giga-muted)', marginBottom: '1rem' }}>
              Your agent surfaces patterns, uncovers root causes, and recommends policy updates that drive KPIs.
            </p>
            <a
              href="#cta"
              style={{
                display: 'inline-flex',
                color: '#e2e8f0',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.9rem',
                marginBottom: '1rem',
                alignItems: 'center',
                gap: '0.34rem',
              }}
            >
              Explore Smart Insights <span aria-hidden>›</span>
            </a>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { label: 'Choose an objective', desc: 'Select a metric like resolution rate, escalation rate, or satisfaction.' },
                { label: 'Generate insights', desc: 'Cluster conversations dynamically and identify high-impact opportunities.' },
                { label: 'Validate at scale', desc: 'Run hypotheses across thousands of conversations to confirm root cause.' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      border: '1px solid var(--giga-border)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--giga-text)',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      background: 'var(--giga-surface-soft)',
                    }}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ color: 'var(--giga-text)', fontWeight: 700, fontSize: '0.95rem' }}>{item.label}</div>
                    <div style={{ color: 'var(--giga-faint)', fontSize: '0.86rem' }}>{item.desc}</div>
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
