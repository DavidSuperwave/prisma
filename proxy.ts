import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const INTAKE_SUBDOMAIN = process.env.PRISMA_INTAKE_SUBDOMAIN_PREFIX ?? "intake.";
const APP_SUBDOMAIN = process.env.PRISMA_APP_SUBDOMAIN_PREFIX ?? "app.";
const APP_DEFAULT_PATH = process.env.PRISMA_APP_DEFAULT_PATH ?? "/workspaces";
const ACCESS_TOKEN_COOKIE = "prisma-access-token";

function isProtectedPath(pathname: string) {
  const isAdminAuthPath =
    pathname === "/admin/login" ||
    pathname === "/admin/signup" ||
    pathname.startsWith("/admin/login/") ||
    pathname.startsWith("/admin/signup/");

  return (
    pathname.startsWith("/workspaces") ||
    (pathname.startsWith("/admin") && !isAdminAuthPath) ||
    pathname.startsWith("/api/admin")
  );
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const pathname = request.nextUrl.pathname;
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (host.startsWith(INTAKE_SUBDOMAIN) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/intake";
    return NextResponse.rewrite(url);
  }

  if (host.startsWith(APP_SUBDOMAIN) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = APP_DEFAULT_PATH;
    return NextResponse.rewrite(url);
  }

  if (isProtectedPath(pathname) && !accessToken) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    const nextPath = `${pathname}${request.nextUrl.search}`;
    url.pathname = pathname.startsWith("/admin") ? "/admin/login" : "/login";
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
