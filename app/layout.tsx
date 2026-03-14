import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Prisma Project — Empleados de IA para tu negocio',
  description: 'Empleados de IA en tu WhatsApp que operan, califican leads y cierran tratos 24/7 — y se vuelven más inteligentes cada semana.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
