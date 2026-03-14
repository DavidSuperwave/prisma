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
      }}
    >
      {/* Spline: absolutely fills right 60% of section, bleeds to edges */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '65%',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      >
        <iframe
          title="Prisma hero spline"
          src="https://my.spline.design/retrofuturismbganimation-Ax4K5E3eh17ha50hk8ixwwjX/"
          loading="eager"
          style={{
            width: '100%',
            height: '100%',
            border: '0',
            display: 'block',
          }}
        />
        {/* Fade from left so it blends into the dark bg behind the copy */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(90deg, #060708 0%, rgba(6,7,8,0.55) 28%, rgba(6,7,8,0.15) 60%, transparent 100%)',
          }}
        />
        {/* Fade from bottom to merge into next section */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, transparent 50%, rgba(6,7,8,0.7) 80%, #060708 100%)',
          }}
        />
      </div>

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
        {/* Left: content */}
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
          PRISMA LAUNCHES AGENT CANVAS
          <span aria-hidden>›</span>
        </a>

        <h1
          style={{
            margin: '1.6rem auto 1.1rem',
            maxWidth: '820px',
            fontFamily: 'var(--font-display)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: 'clamp(2.4rem, 6vw, 5.2rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
          }}
        >
          AI that talks like a human.
          <br />
          Handles millions of calls.
        </h1>

        <p
          style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: 'clamp(1rem, 1.9vw, 1.25rem)',
            marginBottom: '2rem',
            fontWeight: 500,
          }}
        >
          AI agents for enterprise support
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <a
            href="#cta"
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
            Talk to us
          </a>
        </div>
        </div>

        {/* Right: empty — Spline is positioned absolutely behind */}
        <div aria-hidden style={{ height: '60vh' }} />
      </div>

      {/* Logos at bottom of hero */}
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
    </section>
  )
}
