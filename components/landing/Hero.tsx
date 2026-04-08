'use client'

import React from 'react'
import LogoStrip from './LogoStrip'

export default function Hero() {
  return (
    <section
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8.5rem 0 2rem',
        background: 'var(--giga-bg)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        className="hero-grid landing-container landing-container--hero"
        style={{
          flex: 1,
          width: '100%',
          padding: '0 1.25rem',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2rem',
          alignItems: 'center',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            textAlign: 'left',
          }}
        >
          <a
            href="#features"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              borderRadius: 'var(--radius-pill)',
              padding: '0.45rem 1rem',
              background: 'rgba(31,36,45,0.76)',
              border: '1px solid rgba(255,255,255,0.25)',
              color: '#f8fafc',
              textDecoration: 'none',
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
                background: '#ffffff',
                display: 'inline-block',
              }}
            />
            TU AGENTE ESTÁ LISTO EN 5 DÍAS
          </a>

          <h1
            style={{
              margin: '1.6rem 0 1.1rem',
              maxWidth: '820px',
              fontFamily: 'var(--font-display)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 'clamp(2.4rem, 6vw, 5.2rem)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}
          >
            Conoce a tu nuevo agente.
            <br />
            Vive en WhatsApp.
            <br />
            Trabaja 24/7.
          </h1>

          <p
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: 'clamp(1rem, 1.9vw, 1.25rem)',
              marginBottom: '2rem',
              fontWeight: 500,
              maxWidth: '620px',
            }}
          >
            No es un chatbot. No necesitas aprender nada nuevo. Tu agente atiende, califica y da seguimiento a tus
            clientes — desde el WhatsApp que ya usas.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <a
              href="/intake"
              className="giga-cta"
              style={{
                background: '#ffffff',
                color: '#1e293b',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.95rem',
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem 1.8rem',
                border: '1px solid rgba(255,255,255,0.8)',
              }}
            >
              Quiero conocer a mi agente
            </a>
          </div>
        </div>

        <div
          aria-hidden
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            position: 'relative',
          }}
        >
          <div style={{ position: 'absolute', inset: 'auto auto 0 0', display: 'grid', gap: '0.4rem' }}>
            <span className="hero-status-chip">Mientras duermes</span>
            <span className="hero-status-chip">Mientras estás en junta</span>
            <span className="hero-status-chip">Mientras estás con tu familia</span>
          </div>

          <div className="hero-phone">
            <div className="hero-phone-header">Agente Prisma</div>
            <div className="hero-chat">
              <div className="hero-bubble out">Hola, sigo esperando mi cotización.</div>
              <div className="hero-bubble in delay1">
                Hola María, ya la tengo lista. Te la envío hoy a las 4:30 pm.
              </div>
              <div className="hero-bubble in delay2">También te reservo una llamada de 10 minutos, ¿te parece?</div>
              <div className="hero-typing delay3">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          width: '100%',
          padding: '1.25rem 1rem',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <LogoStrip variant="hero" />
      </div>

      <style jsx>{`
        .hero-phone {
          width: min(320px, 92%);
          border-radius: 26px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: #0f172a;
          overflow: hidden;
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5);
        }

        .hero-phone-header {
          background: #1e293b;
          color: #e2e8f0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          padding: 0.72rem 0.9rem;
          font-size: 0.8rem;
          font-weight: 700;
        }

        .hero-chat {
          min-height: 360px;
          display: grid;
          gap: 0.5rem;
          padding: 0.95rem;
        }

        .hero-bubble {
          max-width: 88%;
          color: #e2e8f0;
          font-size: 0.78rem;
          line-height: 1.45;
          padding: 0.5rem 0.68rem;
          opacity: 0;
          transform: translateY(10px);
          animation: reveal 0.55s ease forwards;
        }

        .hero-bubble.out {
          justify-self: end;
          border-radius: 12px 12px 4px 12px;
          background: #0f766e;
        }

        .hero-bubble.in {
          justify-self: start;
          border-radius: 12px 12px 12px 4px;
          background: #1f2937;
        }

        .hero-bubble.delay1 {
          animation-delay: 0.8s;
        }

        .hero-bubble.delay2 {
          animation-delay: 1.6s;
        }

        .hero-typing {
          opacity: 0;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          width: fit-content;
          padding: 0.45rem 0.62rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          animation: reveal 0.55s ease forwards;
        }

        .hero-typing.delay3 {
          animation-delay: 2.4s;
        }

        .hero-typing span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #cbd5e1;
          opacity: 0.5;
          animation: pulse 1s ease-in-out infinite;
        }

        .hero-typing span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .hero-typing span:nth-child(3) {
          animation-delay: 0.4s;
        }

        .hero-status-chip {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(15, 23, 42, 0.8);
          color: #cbd5e1;
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.32rem 0.64rem;
          backdrop-filter: blur(5px);
        }

        @keyframes reveal {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse {
          0%,
          100% {
            transform: translateY(0);
            opacity: 0.45;
          }
          50% {
            transform: translateY(-2px);
            opacity: 1;
          }
        }
      `}</style>
    </section>
  )
}
