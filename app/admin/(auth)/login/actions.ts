"use server";

import { redirect } from "next/navigation";
import { clearAuthSession, createAuthSession, getCurrentAppUser } from "@/lib/auth";

export async function adminLoginAction(_: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = String(formData.get("next") ?? "/admin");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    await createAuthSession(email, password);
    const user = await getCurrentAppUser();
    if (!user?.isPlatformAdmin) {
      await clearAuthSession();
      return { error: "This account is not allowed to access the admin portal." };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to sign in.",
    };
  }

  const safeNextPath = nextPath.startsWith("/admin") ? nextPath : "/admin";
  redirect(safeNextPath);
}
