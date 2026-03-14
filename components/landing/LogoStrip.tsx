'use client'

import React from 'react'

const logos = ['ALA Legal','Despacho García','Clínica Norte','Inmobiliaria REX','Seguros Alpín','DentalPro MX','Bufete Santos','FlotaMX']

export default function LogoStrip() {
  return (
    <section style={{ borderTop: '1px solid var(--divider)', borderBottom: '1px solid var(--divider)', padding: 'var(--space-8) 0', overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '120px', background: 'linear-gradient(to right, var(--void), transparent)', zIndex: 1, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '120px', background: 'linear-gradient(to left, var(--void), transparent)', zIndex: 1, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', animation: 'marquee 20s linear infinite', width: 'max-content' }}>
        {[...logos, ...logos].map((logo, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '0 var(--space-12)', whiteSpace: 'nowrap' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--indigo)', opacity: 0.4 }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-faint)', letterSpacing: '0.05em' }}>{logo}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
