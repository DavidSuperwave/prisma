import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const INTAKE_SUBDOMAIN = process.env.PRISMA_INTAKE_SUBDOMAIN_PREFIX ?? 'intake.'
const APP_SUBDOMAIN = process.env.PRISMA_APP_SUBDOMAIN_PREFIX ?? 'app.'
const APP_DEFAULT_PATH = process.env.PRISMA_APP_DEFAULT_PATH ?? '/admin'

export function proxy(request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase() ?? ''
  const pathname = request.nextUrl.pathname

  if (host.startsWith(INTAKE_SUBDOMAIN) && pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/intake'
    return NextResponse.rewrite(url)
  }

  // Route app subdomain root to admin shell by default.
  if (host.startsWith(APP_SUBDOMAIN) && pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = APP_DEFAULT_PATH
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
