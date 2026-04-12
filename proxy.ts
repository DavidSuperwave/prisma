import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const INTAKE_SUBDOMAIN = process.env.PRISMA_INTAKE_SUBDOMAIN_PREFIX ?? 'intake.'
const APP_SUBDOMAIN = process.env.PRISMA_APP_SUBDOMAIN_PREFIX ?? 'app.'
const APP_DEFAULT_PATH = process.env.PRISMA_APP_DEFAULT_PATH ?? '/admin'
const ACCESS_TOKEN_COOKIE = 'prisma-access-token'

function isProtectedPath(pathname: string) {
  return pathname.startsWith('/workspaces') || pathname.startsWith('/admin')
}

export function proxy(request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase() ?? ''
  const pathname = request.nextUrl.pathname
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value

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

  if (isProtectedPath(pathname) && !accessToken) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
