import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const INTAKE_SUBDOMAIN = 'intake.'

export function proxy(request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase() ?? ''
  const pathname = request.nextUrl.pathname

  if (host.startsWith(INTAKE_SUBDOMAIN) && pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/intake'
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
