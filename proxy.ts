import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const INTAKE_SUBDOMAIN = process.env.PRISMA_INTAKE_SUBDOMAIN_PREFIX ?? "intake.";
const APP_SUBDOMAIN = process.env.PRISMA_APP_SUBDOMAIN_PREFIX ?? "app.";
const APP_DEFAULT_PATH = process.env.PRISMA_APP_DEFAULT_PATH ?? "/workspaces";
const ACCESS_TOKEN_COOKIE = "prisma-access-token";
const REFRESH_TOKEN_COOKIE = "prisma-refresh-token";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

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

function shouldRefresh(accessToken: string | undefined) {
  if (!accessToken) return true;
  const [, payload] = accessToken.split(".");
  if (!payload) return true;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized)) as { exp?: unknown };
    const expiresAt = typeof decoded.exp === "number" ? decoded.exp : 0;
    return expiresAt - Math.floor(Date.now() / 1000) < 5 * 60;
  } catch {
    return true;
  }
}

async function refreshAuthCookies(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken || !shouldRefresh(accessToken)) return null;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return null;

  const secure = process.env.NODE_ENV === "production";
  const refreshed = {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    secure,
  };
  request.cookies.set(ACCESS_TOKEN_COOKIE, refreshed.accessToken);
  request.cookies.set(REFRESH_TOKEN_COOKIE, refreshed.refreshToken);
  return refreshed;
}

function applyRefreshedCookies(response: NextResponse, refreshed: Awaited<ReturnType<typeof refreshAuthCookies>>) {
  if (!refreshed) return response;
  response.cookies.set(ACCESS_TOKEN_COOKIE, refreshed.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: refreshed.secure,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, refreshed.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: refreshed.secure,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const pathname = request.nextUrl.pathname;
  const refreshed = isProtectedPath(pathname) ? await refreshAuthCookies(request) : null;
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (host.startsWith(INTAKE_SUBDOMAIN) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/intake";
    return applyRefreshedCookies(NextResponse.rewrite(url), refreshed);
  }

  if (host.startsWith(APP_SUBDOMAIN) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = APP_DEFAULT_PATH;
    return applyRefreshedCookies(NextResponse.rewrite(url), refreshed);
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

  return applyRefreshedCookies(NextResponse.next(), refreshed);
}

export const config = {
  matcher: "/:path*",
};
