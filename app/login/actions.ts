"use server";

import { redirect } from "next/navigation";
import { createAuthSession } from "@/lib/auth";

export async function loginAction(_: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedNextPath = String(formData.get("next") ?? "/workspaces");
  const nextPath = requestedNextPath.startsWith("/admin") ? "/workspaces" : requestedNextPath;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    await createAuthSession(email, password);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to sign in.",
    };
  }

  redirect(nextPath.startsWith("/") ? nextPath : "/workspaces");
}
