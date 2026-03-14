'use client'

import React, { useState, useEffect } from 'react'

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])

  const navLinks = ['Producto', 'Industrias', 'Precios', 'Casos de éxito']

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      padding: '0 var(--space-8)', height: '64px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: scrolled ? 'rgba(8,8,10,0.85)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px)' : 'none',
      borderBottom: scrolled ? '1px solid var(--divider)' : '1px solid transparent',
      transition: 'all 300ms cubic-bezier(0.16,1,0.3,1)',
    }}>
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', textDecoration: 'none' }}>
        <svg viewBox="0 0 80 80" width="32" height="32" fill="none">
          <path d="M40 10L68 60H12L40 10Z" stroke="#818CF8" strokeWidth="3"/>
          <path d="M40 24L54 52H26L40 24Z" stroke="#A78BFA" strokeWidth="2" opacity="0.5"/>
          <line x1="40" y1="10" x2="40" y2="60" stroke="url(#ng)" strokeWidth="1.5" opacity="0.4"/>
          <defs><linearGradient id="ng" x1="40" y1="10" x2="40" y2="60"><stop offset="0%" stopColor="#818CF8"/><stop offset="100%" stopColor="#F59E0B"/></linearGradient></defs>
        </svg>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.125rem', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Prisma</span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.125rem', color: 'var(--text-muted)', letterSpacing: '-0.03em' }}>Project</span>
      </a>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
        {navLinks.map((item) => (
          <a key={item} href="#" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 180ms' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>{item}</a>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <a href="#" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 180ms' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>Iniciar sesión</a>
        <a href="#cta" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--void)', background: 'var(--indigo)', padding: '0.5rem 1.25rem', borderRadius: 'var(--radius-md)', textDecoration: 'none', transition: 'all 180ms cubic-bezier(0.16,1,0.3,1)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--indigo-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--indigo)')}>Ver demo</a>
      </div>
    </nav>
  )
}
