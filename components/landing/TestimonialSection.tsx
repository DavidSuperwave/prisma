'use client'

import React from 'react'

export default function TestimonialSection() {
  return (
    <section style={{ padding: 'var(--space-32) var(--space-8)', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }} className="animate-on-scroll">
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 'var(--space-4)' }}>CASO DE ÉXITO</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--white)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Así escalan sus operaciones nuestros clientes.</h2>
      </div>

      <div className="animate-on-scroll" style={{
        background: 'var(--surface-deep)', border: '1px solid var(--divider)',
        borderRadius: 'var(--radius-xl)', padding: 'var(--space-12)',
        position: 'relative', overflow: 'hidden', marginTop: 'var(--space-12)',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(to right, var(--indigo), var(--violet), var(--amber))' }} />
        <div style={{ position: 'absolute', top: '-60px', left: '50%', transform: 'translateX(-50%)', width: '400px', height: '200px', background: 'radial-gradient(ellipse, var(--indigo-glow) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-12)', alignItems: 'center' }}>
          <div>
            <div style={{ background: 'var(--surface-offset)', border: '1px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '0.25rem 0.75rem', display: 'inline-block', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-6)' }}>CONSULTAS/SEMANA</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--white)', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 'var(--space-2)' }}>200+</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>manejadas sin paralegal</div>
          </div>
          <div>
            <blockquote style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.5, marginBottom: 'var(--space-8)', fontStyle: 'italic' }}>&ldquo;Antes perdíamos clientes los fines de semana porque nadie contestaba. Ahora el Operador califica cada consulta — y el lunes ya tenemos la agenda llena de casos viables. Prisma nos dio el equipo que no podíamos contratar.&rdquo;</blockquote>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--indigo), var(--violet))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--white)' }}>A</div>
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>Alejandro R.</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>Socio, ALA Legal — Monterrey</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
