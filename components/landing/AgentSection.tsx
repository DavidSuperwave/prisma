'use client'

import React, { useState } from 'react'

const steps = [
  {
    id: 'create',
    label: 'Create the agent',
    body: 'Choose an agent type and upload documents so your agent understands your brand, policies, and workflows.',
    agentName: 'Retail AI support agent',
    commandHint: 'Search templates, channels, and intents',
    leftMenu: ['Policies', 'Data sources', 'Personalization'],
    scenarios: ['Order issue triage', 'Returns and exchanges', 'Account access help'],
    rules: ['Escalate payment disputes', 'Never expose full card data', 'Collect order ID before transfer'],
  },
  {
    id: 'define',
    label: 'Define policies',
    body: 'Ground agents in your standards, compliance rules, and workflows so every interaction is consistent and on-policy.',
    agentName: 'Banking AI support agent',
    commandHint: 'Search guardrails, policy docs, and workflows',
    leftMenu: ['Policies', 'Data sources', 'Personalization'],
    scenarios: ['New account onboarding', 'Loan application support', 'Credit card replacement'],
    rules: ['Verify ID before sharing', 'Escalate fraud cases to Tier 2', 'No balances over voice'],
  },
  {
    id: 'logic',
    label: 'Design the logic',
    body: 'Tune logic for transfers, escalation thresholds, fallback behavior, and service-level outcomes.',
    agentName: 'Logistics AI support agent',
    commandHint: 'Search intents, routes, and automations',
    leftMenu: ['Flows', 'Escalations', 'Routing'],
    scenarios: ['Missed delivery support', 'Address update requests', 'Shipment exception handling'],
    rules: ['Escalate damaged parcels', 'Route VIP to priority queue', 'Use SMS fallback on no reply'],
  },
  {
    id: 'launch',
    label: 'Test and launch',
    body: 'Run simulations, validate edge cases, and roll to production with confidence.',
    agentName: 'Insurance AI support agent',
    commandHint: 'Search launch checklist and evaluations',
    leftMenu: ['Evaluation', 'Load tests', 'Deploy'],
    scenarios: ['Claim status checks', 'Policy renewal questions', 'Roadside assistance requests'],
    rules: ['Tag high-risk claims for review', 'Track CSAT per scenario', 'Validate escalation latency'],
  },
  {
    id: 'improve',
    label: 'Monitor and improve',
    body: 'Capture patterns from real interactions and convert them into policy upgrades.',
    agentName: 'SaaS AI success agent',
    commandHint: 'Search trends, outcomes, and suggestions',
    leftMenu: ['Insights', 'Experiments', 'Policy updates'],
    scenarios: ['Onboarding blockers', 'Cancellation prevention', 'Integration setup issues'],
    rules: ['Flag churn signals', 'Promote self-serve fixes first', 'Auto-suggest policy improvements'],
  },
]

export default function AgentSection() {
  const [active, setActive] = useState(0)
  const activeStep = steps[active]

  return (
    <section id="agent-canvas" style={{ padding: '3rem 1.25rem 6rem', background: 'var(--giga-surface)' }}>
      <div
        style={{
          maxWidth: '1240px',
          margin: '0 auto',
          border: '1px solid var(--giga-border)',
          borderRadius: '14px',
          background: 'var(--giga-surface-soft)',
          boxShadow: '0 30px 70px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', padding: '1rem' }}>
          <div className="animate-on-scroll" style={{ background: 'linear-gradient(180deg, #1a2030 0%, #151a24 100%)', border: '1px solid var(--giga-border)', borderRadius: '12px', padding: '1.1rem' }}>
            <h2 style={{ color: '#fff', fontSize: '2rem', lineHeight: 1.1, marginBottom: '0.45rem', fontFamily: 'var(--font-display)' }}>Agent Canvas</h2>
            <p style={{ color: 'var(--giga-muted)', fontSize: '0.98rem', marginBottom: '0.9rem' }}>
              The fastest way to build, govern, and scale enterprise AI agents.
            </p>
            <a
              href="#cta"
              style={{
                display: 'inline-flex',
                textDecoration: 'none',
                color: '#fff',
                border: '1px solid var(--giga-border)',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '999px',
                padding: '0.4rem 0.78rem',
                fontWeight: 600,
                fontSize: '0.82rem',
                marginBottom: '0.95rem',
              }}
            >
              Explore Agent Canvas
            </a>
            <div style={{ borderTop: '1px solid var(--giga-border)', paddingTop: '0.72rem', display: 'grid', gap: '0.2rem' }}>
              {steps.map((step, i) => (
                <button
                  key={step.id}
                  onClick={() => setActive(i)}
                  style={{
                    textAlign: 'left',
                    background: 'transparent',
                    border: '0',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    color: active === i ? '#fff' : 'var(--giga-muted)',
                    padding: '0.74rem 0.1rem',
                    cursor: 'pointer',
                    fontSize: '0.98rem',
                    fontWeight: active === i ? 700 : 600,
                  }}
                >
                  <div>{step.label}</div>
                  {active === i ? (
                    <div style={{ marginTop: '0.34rem', color: '#95a3b7', fontWeight: 500, fontSize: '0.83rem', lineHeight: 1.45 }}>
                      {step.body}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div
            className="animate-on-scroll"
            style={{
              borderRadius: '12px',
              border: '1px solid var(--giga-border)',
              minHeight: '460px',
              backgroundImage: 'linear-gradient(180deg, rgba(7,9,13,0.1) 0%, rgba(7,9,13,0.58) 100%), url("/giga-mountains.svg")',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.1rem',
            }}
          >
            <div style={{ width: 'min(700px, 100%)', background: 'rgba(22,28,38,0.96)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '12px', padding: '0.85rem', boxShadow: '0 26px 50px rgba(0,0,0,0.45)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
                <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', background: 'rgba(18,24,34,0.9)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.52rem 0.56rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', gap: '0.34rem' }}>
                      {['#ff5f57', '#febc2e', '#28c840'].map((dot) => (
                        <span key={dot} style={{ width: '8px', height: '8px', borderRadius: '50%', background: dot }} />
                      ))}
                    </div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.76rem' }}>{activeStep.agentName}</div>
                    <span style={{ color: '#f59e0b', fontSize: '0.7rem' }}>◌</span>
                  </div>

                  <div style={{ padding: '0.55rem' }}>
                    <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.35rem 0.5rem', color: '#8ea0b8', fontSize: '0.75rem', marginBottom: '0.45rem' }}>
                      {activeStep.commandHint}
                    </div>
                    <div style={{ display: 'grid', gap: '0.25rem' }}>
                      {activeStep.leftMenu.map((item, idx) => (
                        <div
                          key={item}
                          style={{
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '7px',
                            background: idx === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                            color: idx === 0 ? '#f1f5f9' : '#9fb0c6',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '0.34rem 0.45rem',
                          }}
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', background: 'rgba(18,24,34,0.9)' }}>
                  <div style={{ padding: '0.55rem', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#dbe5f3', fontSize: '0.75rem', fontWeight: 700 }}>
                    Scenarios
                  </div>
                  <div style={{ padding: '0.55rem' }}>
                    <div style={{ display: 'grid', gap: '0.28rem', marginBottom: '0.45rem' }}>
                      {activeStep.scenarios.map((scenario, idx) => (
                        <div key={scenario} style={{ border: '1px solid rgba(255,255,255,0.09)', borderRadius: '7px', padding: '0.34rem 0.45rem', color: '#d3deee', fontSize: '0.74rem', background: idx === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)' }}>
                          {scenario}
                        </div>
                      ))}
                    </div>

                    <div style={{ color: '#dbe5f3', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.3rem' }}>Rules</div>
                    <div style={{ display: 'grid', gap: '0.24rem' }}>
                      {activeStep.rules.map((rule, idx) => (
                        <div
                          key={rule}
                          style={{
                            fontSize: '0.73rem',
                            color: idx === 0 ? '#f8fafc' : '#9fb0c6',
                            background: idx === 0 ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '7px',
                            padding: '0.34rem 0.45rem',
                          }}
                        >
                          {rule}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '0.65rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.55rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.86rem' }}>Create new agent</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.34rem', width: '62%' }}>
                    {['Chat', 'Voice', 'Multi-modal'].map((tab, idx) => (
                      <div
                        key={tab}
                        style={{
                          border: '1px solid rgba(255,255,255,0.16)',
                          background: idx === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
                          borderRadius: '8px',
                          padding: '0.35rem',
                          color: '#e2e8f0',
                          textAlign: 'center',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                        }}
                      >
                        {tab}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ color: '#a8b3c5', fontSize: '0.8rem', marginBottom: '0.38rem' }}>Attach files to give your agent business context</div>
                <div style={{ border: '1px dashed rgba(255,255,255,0.26)', borderRadius: '8px', minHeight: '74px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa7ba', fontSize: '0.8rem' }}>
                  Drag files here or click to browse
                </div>
              </div>

              <div style={{ marginTop: '0.72rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#9aa7ba', fontSize: '0.84rem' }}>Cancel</span>
                <span style={{ background: '#fff', color: '#111827', borderRadius: '999px', padding: '0.38rem 0.8rem', fontWeight: 700, fontSize: '0.82rem' }}>
                  Create agent
                </span>
              </div>

              <div
                style={{
                  marginTop: '0.55rem',
                  color: '#94a3b8',
                  fontSize: '0.8rem',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  paddingTop: '0.55rem',
                }}
              >
                <strong style={{ color: '#e2e8f0' }}>{activeStep.label}.</strong> {activeStep.body}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
