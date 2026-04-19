"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getWorkspaceMembershipForSlug,
  type WorkspaceMembership,
} from "@/lib/workspaceStore";

const ACCESS_TOKEN_COOKIE = "prisma-access-token";
const REFRESH_TOKEN_COOKIE = "prisma-refresh-token";

export type AuthenticatedAppUser = {
  id: string;
  email: string | null;
  isPlatformAdmin: boolean;
  memberships: Array<{
    workspaceId: string;
    role: "admin" | "operator" | "viewer";
    isPlatformAdmin: boolean;
  }>;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

const INSECURE_PLATFORM_ADMIN_DEFAULTS = new Set([
  "admin@example.com",
  "george@bbc.local",
]);

function getConfiguredPlatformAdminEmails() {
  const raw = process.env.PRISMA_PLATFORM_ADMIN_EMAILS?.trim();
  if (!raw) {
    return [];
  }
  const emails = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (process.env.NODE_ENV === "production") {
    for (const email of emails) {
      if (INSECURE_PLATFORM_ADMIN_DEFAULTS.has(email)) {
        throw new Error(
          `FATAL: PRISMA_PLATFORM_ADMIN_EMAILS contains an insecure default value "${email}". ` +
            "Set PRISMA_PLATFORM_ADMIN_EMAILS to a real operator email in production.",
        );
      }
    }
  }

  return emails;
}

function isConfiguredPlatformAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return getConfiguredPlatformAdminEmails().includes(email.trim().toLowerCase());
}

async function listMembershipRows(
  userId: string,
): Promise<Array<{ workspace_id: string; role: "admin" | "operator" | "viewer"; is_platform_admin: boolean }>> {
  const supabase = requireSupabaseAdmin();
  const withPlatformFlag = await supabase
    .from("workspace_members")
    .select("workspace_id, role, is_platform_admin")
    .eq("user_id", userId);

  if (!withPlatformFlag.error) {
    return (withPlatformFlag.data ?? []).map((entry) => ({
      workspace_id: String(entry.workspace_id),
      role: entry.role as "admin" | "operator" | "viewer",
      is_platform_admin: Boolean(entry.is_platform_admin),
    }));
  }

  const withoutPlatformFlag = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId);

  if (withoutPlatformFlag.error) {
    throw new Error(withoutPlatformFlag.error.message);
  }

  return (withoutPlatformFlag.data ?? []).map((entry) => ({
    workspace_id: String(entry.workspace_id),
    role: entry.role as "admin" | "operator" | "viewer",
    is_platform_admin: false,
  }));
}

export async function createAuthSession(email: string, password: string) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session || !data.user) {
    throw new Error(error?.message ?? "Unable to sign in.");
  }

  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";

  cookieStore.set(ACCESS_TOKEN_COOKIE, data.session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: data.session.expires_in ?? 60 * 60,
  });

  cookieStore.set(REFRESH_TOKEN_COOKIE, data.session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return data.user;
}

export async function clearAuthSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
}

export async function getCurrentAppUser(): Promise<AuthenticatedAppUser | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    return null;
  }

  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return null;
  }

  const membershipRows = await listMembershipRows(data.user.id);
  const appMetadata = data.user.app_metadata;
  const appMetadataPlatformAdmin =
    typeof appMetadata === "object" &&
    appMetadata !== null &&
    !Array.isArray(appMetadata) &&
    appMetadata.is_platform_admin === true;
  const isPlatformAdmin =
    appMetadataPlatformAdmin ||
    membershipRows.some((entry) => entry.is_platform_admin) ||
    isConfiguredPlatformAdminEmail(data.user.email);

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    isPlatformAdmin,
    memberships: membershipRows.map((entry) => ({
      workspaceId: String(entry.workspace_id),
      role: entry.role,
      isPlatformAdmin: entry.is_platform_admin || isPlatformAdmin,
    })),
  };
}

export async function requireAuthenticatedUser(nextPath?: string, loginPath = "/login") {
  const user = await getCurrentAppUser();
  if (!user) {
    const nextQuery = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`${loginPath}${nextQuery}`);
  }
  return user;
}

export async function requireAdminUser(nextPath?: string) {
  const user = await requireAuthenticatedUser(nextPath, "/admin/login");
  if (!user.isPlatformAdmin) {
    redirect("/workspaces");
  }
  return user;
}

export async function ensureAdminApiAccess() {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!user.isPlatformAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  return null;
}

/**
 * One-shot helper for workspace-scoped API routes.
 *
 * Previously routes did two round-trips: `getCurrentAppUser()` (which already
 * queries `workspace_members`), then `listWorkspaceMembershipsForUser()`
 * (which does the same join again for every workspace the user is in). This
 * helper collapses that into (a) the auth call and (b) a single single-row
 * join for the specific slug being requested.
 *
 * Returns a ready-to-return `NextResponse` on failure so route handlers can
 * early-exit with a clean shape, or the resolved context on success.
 */
export type WorkspaceRequestContext = {
  user: AuthenticatedAppUser;
  membership: WorkspaceMembership;
};

export async function resolveWorkspaceRequestContext(
  workspaceSlug: string,
): Promise<WorkspaceRequestContext | NextResponse> {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const membership = await getWorkspaceMembershipForSlug(
    user.id,
    workspaceSlug,
    user.isPlatformAdmin,
  );
  if (!membership) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }
  return { user, membership };
}
