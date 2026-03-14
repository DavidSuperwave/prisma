'use client'

import React from 'react'

const footerCols = [
  { title: 'Producto',   links: ['El Operador','El SDR','El Calificador','Supermemoria','Prisma Radar'] },
  { title: 'Industrias', links: ['Legal','Inmobiliaria','Dental','Seguros','Belleza'] },
  { title: 'Empresa',    links: ['Nosotros','Blog','Casos de éxito','Contacto'] },
]

export default function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--divider)', padding: 'var(--space-12) var(--space-8)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-12)', flexWrap: 'wrap' }}>
        <div style={{ maxWidth: '280px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <svg viewBox="0 0 80 80" width="28" height="28" fill="none">
              <path d="M40 10L68 60H12L40 10Z" stroke="#818CF8" strokeWidth="3"/>
              <path d="M40 24L54 52H26L40 24Z" stroke="#A78BFA" strokeWidth="2" opacity="0.5"/>
              <line x1="40" y1="10" x2="40" y2="60" stroke="url(#fg)" strokeWidth="1.5" opacity="0.4"/>
              <defs><linearGradient id="fg" x1="40" y1="10" x2="40" y2="60"><stop offset="0%" stopColor="#818CF8"/><stop offset="100%" stopColor="#F59E0B"/></linearGradient></defs>
            </svg>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Prisma</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1rem', color: 'var(--text-muted)', letterSpacing: '-0.03em' }}>Project</span>
          </div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)', lineHeight: 1.6 }}>Empleados de IA en tu WhatsApp que operan tu negocio 24/7 — y se vuelven más inteligentes cada semana.</p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: 'var(--space-4)' }}>Monterrey, Nuevo León, México · 2026</p>
        </div>

        {footerCols.map((col) => (
          <div key={col.title}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-4)' }}>{col.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {col.links.map((link) => (
                <a key={link} href="#" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)', textDecoration: 'none', transition: 'color 180ms' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-faint)')}>{link}</a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ maxWidth: '1200px', margin: 'var(--space-12) auto 0', paddingTop: 'var(--space-8)', borderTop: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>© 2026 PrismaProject. Todos los derechos reservados.</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.05em', fontStyle: 'italic' }}>Refract Reality.</span>
      </div>
    </footer>
  )
}
