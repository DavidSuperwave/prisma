'use client'

import React from 'react'

export default function Hero() {
  return (
    <section style={{
      position: 'relative', minHeight: '100vh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center',
      padding: 'calc(64px + var(--space-24)) var(--space-8) var(--space-24)',
      overflow: 'hidden',
    }}>
      {/* BG glow */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: '800px', height: '500px',
        background: 'radial-gradient(ellipse at center, rgba(129,140,248,0.12) 0%, rgba(167,139,250,0.06) 50%, transparent 70%)',
        pointerEvents: 'none', animation: 'pulse-glow 4s ease-in-out infinite',
      }} />

      {/* Badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
        background: 'var(--surface-deep)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-full)', padding: '0.375rem 1rem',
        marginBottom: 'var(--space-8)', animation: 'reveal-fade 600ms cubic-bezier(0.16,1,0.3,1) both',
      }}>
        <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)', animation: 'pulse-glow 2s ease-in-out infinite' }} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Agentes de IA para negocios mexicanos</span>
      </div>

      {/* H1 */}
      <h1 style={{
        fontFamily: 'var(--font-display)', fontSize: 'var(--text-hero)', fontWeight: 800,
        color: 'var(--white)', letterSpacing: '-0.03em', lineHeight: 1.05,
        maxWidth: '900px', margin: '0 auto var(--space-8)',
        animation: 'reveal-fade 700ms 100ms cubic-bezier(0.16,1,0.3,1) both',
      }}>
        Empleados de IA que{' '}
        <span style={{
          background: 'linear-gradient(135deg, var(--indigo) 0%, var(--violet) 50%, var(--amber) 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>operan tu negocio.</span>
      </h1>

      {/* Sub */}
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-lg)', fontWeight: 400,
        color: 'var(--text-muted)', maxWidth: '580px', margin: '0 auto var(--space-12)',
        lineHeight: 1.7, animation: 'reveal-fade 700ms 200ms cubic-bezier(0.16,1,0.3,1) both',
      }}>En tu WhatsApp. 24/7. Calificando leads, cerrando tratos — y volviéndose más inteligentes cada semana.</p>

      {/* CTAs */}
      <div style={{
        display: 'flex', gap: 'var(--space-4)', alignItems: 'center',
        flexWrap: 'wrap', justifyContent: 'center',
        animation: 'reveal-fade 700ms 300ms cubic-bezier(0.16,1,0.3,1) both',
      }}>
        <a href="#cta" style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600,
          color: 'var(--void)', background: 'var(--indigo)',
          padding: '0.875rem 2rem', borderRadius: 'var(--radius-md)', textDecoration: 'none',
          transition: 'all 180ms cubic-bezier(0.16,1,0.3,1)',
          boxShadow: '0 0 40px rgba(129,140,248,0.3)',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--indigo-hover)'; e.currentTarget.style.boxShadow = '0 0 60px rgba(129,140,248,0.5)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--indigo)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(129,140,248,0.3)' }}
        >Ver demo personalizado →</a>
        <a href="#features" style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 500,
          color: 'var(--text-muted)', textDecoration: 'none',
          padding: '0.875rem 2rem', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', transition: 'all 180ms cubic-bezier(0.16,1,0.3,1)',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--indigo)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >Conocer el producto</a>
      </div>

      {/* Stats */}
      <div style={{
        display: 'flex', gap: 'var(--space-16)', marginTop: 'var(--space-20)',
        flexWrap: 'wrap', justifyContent: 'center',
        animation: 'reveal-fade 700ms 400ms cubic-bezier(0.16,1,0.3,1) both',
      }}>
        {[
          { value: '24/7',    label: 'Siempre activo' },
          { value: '5 días',  label: 'Deploy en producción' },
          { value: '1,000+', label: 'Conversaciones simuladas' },
          { value: '3',      label: 'Agentes IA incluidos' },
        ].map(({ value, label }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--white)', letterSpacing: '-0.02em', marginBottom: 'var(--space-1)' }}>{value}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
