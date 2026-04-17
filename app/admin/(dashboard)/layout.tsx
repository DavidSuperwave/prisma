import Link from 'next/link'
import type { ReactNode } from 'react'
import { requireAdminUser } from '@/lib/auth'

const navItems = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/new-project', label: 'Create Workspace' },
  { href: '/admin/clients', label: 'Workspaces' },
  { href: '/admin/templates', label: 'Templates' },
  { href: '/admin/agents', label: 'Agent Monitor' },
  { href: '/admin/deployments', label: 'Deployments' },
  { href: '/admin/usage', label: 'Usage' },
  { href: '/admin/users', label: 'Users' },
]

export default function AdminDashboardLayout({ children }: { children: ReactNode }) {
  async function renderLayout() {
    await requireAdminUser('/admin')

    return (
      <div style={shellStyle}>
        <aside style={sidebarStyle}>
          <div style={brandBlockStyle}>
            <p style={brandStyle}>Prisma Admin</p>
            <p style={brandCopyStyle}>Launch and monitor workspaces.</p>
          </div>
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
  fontWeight: 700,
  fontSize: 18,
}

const brandBlockStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  marginBottom: 20,
}

const brandCopyStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--giga-muted)',
  fontSize: 13,
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
