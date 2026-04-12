import Link from 'next/link'
import type { ReactNode } from 'react'
import { requireAdminUser } from '@/lib/auth'

const navItems = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/new-project', label: 'New Project' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/templates', label: 'Templates' },
  { href: '/admin/agents', label: 'Agents' },
  { href: '/admin/deployments', label: 'Deployments' },
  { href: '/admin/usage', label: 'Usage' },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  async function renderLayout() {
    await requireAdminUser('/admin')

    return (
      <div style={shellStyle}>
        <aside style={sidebarStyle}>
          <p style={brandStyle}>Prisma Admin</p>
          <nav style={navStyle}>
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} style={linkStyle}>
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main style={contentStyle}>{children}</main>
      </div>
    )
  }

  return renderLayout()
}

const shellStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  gridTemplateColumns: '220px 1fr',
  background: 'var(--giga-bg)',
  color: 'var(--giga-text)',
}

const sidebarStyle: React.CSSProperties = {
  borderRight: '1px solid var(--giga-border)',
  padding: '24px 16px',
  background: 'var(--giga-surface)',
}

const brandStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: 16,
  fontWeight: 700,
}

const navStyle: React.CSSProperties = {
  display: 'grid',
  gap: 8,
}

const linkStyle: React.CSSProperties = {
  textDecoration: 'none',
  color: 'var(--giga-text)',
  border: '1px solid var(--giga-border)',
  borderRadius: 10,
  padding: '8px 10px',
  fontSize: 14,
}

const contentStyle: React.CSSProperties = {
  padding: '24px',
}
