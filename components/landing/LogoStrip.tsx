'use client'

import React from 'react'

const logos = ['POSTMAN', 'RIO', 'DOORDASH', 'capital.com', 'afriex', 'Sendoso']

export default function LogoStrip({ variant = 'default' }: { variant?: 'default' | 'hero' | 'nav' }) {
  const isHero = variant === 'hero'
  const isNav = variant === 'nav'
  return (
    <section
      style={{
        borderTop: isHero || isNav ? 'none' : '1px solid var(--giga-border)',
        borderBottom: isHero || isNav ? 'none' : '1px solid var(--giga-border)',
        background: isHero || isNav ? 'transparent' : '#0a0c10',
        padding: isHero ? '0.5rem 1rem' : isNav ? '0' : '1.4rem 1rem',
      }}
    >
      <div
        style={{
          maxWidth: '1120px',
          margin: '0 auto',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: isHero ? '2rem' : isNav ? '1.25rem' : '1.1rem',
        }}
      >
        {logos.map((logo) => (
          <div
            key={logo}
            style={{
              color: isHero || isNav ? 'rgba(255,255,255,0.7)' : 'rgba(226,232,240,0.8)',
              textAlign: 'center',
              fontSize: isHero ? '0.85rem' : isNav ? '0.67rem' : '0.92rem',
              fontWeight: 700,
              letterSpacing: isNav ? '0.06em' : '0.03em',
              opacity: isHero || isNav ? 0.9 : 0.92,
            }}
          >
            {logo}
          </div>
        ))}
      </div>
    </section>
  )
}
