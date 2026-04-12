"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const ACCESS_TOKEN_COOKIE = "prisma-access-token";
const REFRESH_TOKEN_COOKIE = "prisma-refresh-token";

export type AuthenticatedAppUser = {
  id: string;
  email: string | null;
  memberships: Array<{
    workspaceId: string;
    role: "admin" | "operator" | "viewer";
  }>;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
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

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", data.user.id);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    memberships: (memberships ?? []).map((entry) => ({
      workspaceId: String(entry.workspace_id),
      role: entry.role as "admin" | "operator" | "viewer",
    })),
  };
}

export async function requireAuthenticatedUser(nextPath?: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    const nextQuery = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/login${nextQuery}`);
  }
  return user;
}

export async function requireAdminUser(nextPath?: string) {
  const user = await requireAuthenticatedUser(nextPath);
  if (!user.memberships.some((membership) => membership.role === "admin")) {
    redirect("/workspaces");
  }
  return user;
}
