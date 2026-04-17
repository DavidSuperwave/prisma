"use server";

import { redirect } from "next/navigation";
import { createSupabasePublicServerClient } from "@/lib/supabasePublicAuth";

export async function signupAction(_: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 10) {
    return { error: "Use a stronger password (at least 10 characters)." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  try {
    const supabase = await createSupabasePublicServerClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return { error: error.message };
    }

    if (!data.user) {
      return { error: "Unable to create account." };
    }

    const message = data.session
      ? "Account created. You can now sign in."
      : "Account created. Check your email to confirm your account.";
    redirect(`/login?message=${encodeURIComponent(message)}`);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create account.",
    };
  }
}
