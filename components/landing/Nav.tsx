'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type MenuKey = 'product' | 'company'

const productLinks = [
  {
    title: 'Agent Canvas',
    description: 'Build your ideal agent and solve support issues faster.',
    href: '#agent-canvas',
  },
  {
    title: 'Insights',
    description: 'Insights identify and recommend policy changes to improve performance.',
    href: '#insights',
  },
  {
    title: 'Voice Experience',
    description: 'Emotionally aware agents that keep conversations natural.',
    href: '#voice',
  },
  {
    title: 'Browser Agent',
    description: 'Execute workflows directly inside browser-based systems without APIs.',
    href: '#features',
  },
]

const companySections = [
  {
    heading: 'Company',
    links: [
      { label: 'Careers', href: '#careers' },
      { label: 'Contact', href: '#cta' },
      { label: 'Trust Center', href: '#trust-center' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'News', href: '#news' },
      { label: 'Privacy Policy', href: '#privacy-policy' },
      { label: 'Terms Of Service', href: '#terms-of-service' },
    ],
  },
]

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const isMobile = mobileMenuRef.current?.contains(target)
      if (!isMobile) {
        setOpenMenu(null)
        setMobileOpen(false)
      }
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
        setMobileOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [])

  // Hover open: cancel any pending close timer, open the target menu
  const openWith = useCallback((key: MenuKey) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpenMenu(key)
  }, [])

  // Hover leave: schedule close with a 120ms grace period so the mouse can
  // travel from the trigger button down into the dropdown panel without it snapping shut
  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => {
      setOpenMenu(null)
    }, 120)
  }, [])

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  const isGlass = scrolled || openMenu !== null || mobileOpen
  const navBg = isGlass ? 'var(--giga-nav-glass)' : 'transparent'
  const navBorder = isGlass ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent'
  const navBackdrop = isGlass ? 'blur(14px)' : 'none'

  return (
    <nav
      style={{
        position: 'fixed',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        width: 'min(1240px, calc(100% - 1.4rem))',
        transition: 'background 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          background: navBg,
          border: navBorder,
          borderRadius: '12px',
          padding: '0.5rem 1rem',
          backdropFilter: navBackdrop,
          WebkitBackdropFilter: navBackdrop,
          transition: 'background 0.3s ease, border-color 0.3s ease',
        }}
      >
        {/* Left: Logo + Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              textDecoration: 'none',
              color: '#fff',
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }} />
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Prisma</span>
          </Link>

          {/* Desktop nav — hidden on mobile */}
          <div className="hide-mobile" style={{ display: 'flex', gap: '1.25rem' }}>
            {/* Product dropdown */}
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => openWith('product')}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                onClick={() => setOpenMenu((c) => (c === 'product' ? null : 'product'))}
                style={{
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.86rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Product <span style={{ fontSize: '0.62rem', opacity: 0.9 }}>▼</span>
              </button>

              {openMenu === 'product' && (
                <div
                  onMouseEnter={cancelClose}
                  onMouseLeave={scheduleClose}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 0.5rem)',
                    left: 0,
                    width: 'min(360px, calc(100vw - 2.5rem))',
                    background: 'rgba(20,24,31,0.75)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '10px',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
                    padding: '0.45rem',
                  }}
                >
                  {productLinks.map((item) => (
                    <Link
                      key={item.title}
                      href={item.href}
                      className="giga-menu-item"
                      style={{
                        display: 'block',
                        textDecoration: 'none',
                        borderRadius: '8px',
                        padding: '0.65rem',
                      }}
                    >
                      <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.88rem' }}>{item.title}</div>
                      <div style={{ color: '#9fb0c6', fontSize: '0.78rem', marginTop: '0.15rem', lineHeight: 1.35 }}>
                        {item.description}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Company dropdown */}
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => openWith('company')}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                onClick={() => setOpenMenu((c) => (c === 'company' ? null : 'company'))}
                style={{
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.86rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Company <span style={{ fontSize: '0.62rem', opacity: 0.9 }}>▼</span>
              </button>

              {openMenu === 'company' && (
                <div
                  onMouseEnter={cancelClose}
                  onMouseLeave={scheduleClose}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 0.5rem)',
                    left: 0,
                    width: 'min(360px, calc(100vw - 2.5rem))',
                    background: 'rgba(20,24,31,0.75)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '10px',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
                    padding: '0.65rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '0.65rem',
                  }}
                >
                  {companySections.map((section) => (
                    <div key={section.heading}>
                      <div
                        style={{
                          color: '#94a3b8',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          fontWeight: 700,
                          fontSize: '0.64rem',
                          marginBottom: '0.45rem',
                        }}
                      >
                        {section.heading}
                      </div>
                      <div style={{ display: 'grid', gap: '0.25rem' }}>
                        {section.links.map((item) => (
                          <Link
                            key={item.label}
                            href={item.href}
                            className="giga-menu-item"
                            style={{
                              color: '#f1f5f9',
                              textDecoration: 'none',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              borderRadius: '6px',
                              padding: '0.28rem 0.35rem',
                            }}
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Sign in + CTA + mobile menu button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <a
            href="#"
            className="giga-soft-link hide-mobile"
            style={{
              color: '#ffffff',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.84rem',
              padding: '0.45rem 0.78rem',
            }}
          >
            Sign in
          </a>
          <button
            type="button"
            className="show-mobile"
            onClick={() => setMobileOpen((v) => !v)}
            style={{
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(20,24,31,0.74)',
              color: '#fff',
              padding: '0.42rem 0.62rem',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Menu
          </button>
          <a
            href="#cta"
            className="giga-cta"
            style={{
              color: '#1e293b',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '0.84rem',
              borderRadius: '10px',
              padding: '0.45rem 0.78rem',
              background: 'rgba(255,255,255,0.95)',
            }}
          >
            Talk to us
          </a>
        </div>
      </div>

      {/* Mobile flyout */}
      {mobileOpen && (
        <div
          ref={mobileMenuRef}
          className="show-mobile"
          style={{
            marginTop: '0.45rem',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(20,24,31,0.82)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            padding: '0.75rem',
            flexDirection: 'column',
            gap: '0.65rem',
          }}
        >
          <div>
            <div style={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.66rem', marginBottom: '0.45rem', fontWeight: 700 }}>
              Product
            </div>
            <div style={{ display: 'grid', gap: '0.32rem' }}>
              {productLinks.map((item) => (
                <Link key={item.title} href={item.href} className="giga-soft-link" style={{ color: '#f8fafc', textDecoration: 'none', fontSize: '0.88rem', fontWeight: 600 }}>
                  {item.title}
                </Link>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '0.65rem' }}>
            <div style={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.66rem', marginBottom: '0.45rem', fontWeight: 700 }}>
              Company
            </div>
            <div style={{ display: 'grid', gap: '0.32rem' }}>
              {companySections.flatMap((s) => s.links).map((item) => (
                <Link key={item.label} href={item.href} className="giga-soft-link" style={{ color: '#f8fafc', textDecoration: 'none', fontSize: '0.88rem', fontWeight: 600 }}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
