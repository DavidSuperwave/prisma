'use client'

import React from 'react'

const footerCols = [
  { title: 'Product', links: ['Agent Canvas', 'Insights', 'Voice Experience', 'Browser Agent'] },
  { title: 'Company', links: ['Careers', 'Contact', 'Trust Center'] },
  { title: 'Resources', links: ['News', 'Privacy Policy', 'Terms Of Service'] },
]

export default function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--giga-border)', padding: '3.5rem 1.25rem', background: '#05070a' }}>
      <div className="landing-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.8rem', flexWrap: 'wrap' }}>
        <div style={{ maxWidth: '320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.7rem' }}>
            <span
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                border: '2px solid #9fb0c8',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                color: '#e2e8f0',
                fontSize: '0.78rem',
              }}
            >
              P
            </span>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--giga-text)' }}>Prisma</span>
          </div>
          <p style={{ color: 'var(--giga-muted)', lineHeight: 1.65 }}>
            AI agents for enterprise support workflows with observability, governance, and fast deployment.
          </p>
          <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.8rem' }}>
            {['Compliant', '5+'].map((badge) => (
              <span
                key={badge}
                style={{
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--giga-border)',
                  padding: '0.2rem 0.6rem',
                  color: 'var(--giga-faint)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {badge}
              </span>
            ))}
          </div>
        </div>

        {footerCols.map((col) => (
          <div key={col.title}>
            <div style={{ color: 'var(--giga-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, fontSize: '0.72rem', marginBottom: '0.6rem' }}>
              {col.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {col.links.map((link) => (
                <a key={link} href="#" style={{ color: 'var(--giga-muted)', textDecoration: 'none', fontSize: '0.92rem' }}>
                  {link}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="landing-container" style={{ margin: '2rem auto 0', paddingTop: '1rem', borderTop: '1px solid var(--giga-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem' }}>
        <span style={{ color: 'var(--giga-faint)', fontSize: '0.8rem' }}>© 2026 Prisma. All rights reserved.</span>
      </div>
    </footer>
  )
}
