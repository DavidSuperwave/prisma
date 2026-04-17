"use server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type SignupState = {
  error?: string;
  success?: string;
};

export async function adminSignupAction(_: SignupState | undefined, formData: FormData): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const secret = String(formData.get("secret") ?? "");

  const configuredSecret = process.env.PRISMA_ADMIN_SIGNUP_SECRET;
  if (!configuredSecret) {
    return { error: "Admin signup is disabled until PRISMA_ADMIN_SIGNUP_SECRET is configured." };
  }
  if (secret !== configuredSecret) {
    return { error: "Invalid admin signup secret." };
  }
  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 10) {
    return { error: "Use a stronger password (at least 10 characters)." };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { error: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required." };
  }

  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      is_platform_admin: true,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: "Admin account created. You can now sign in." };
}
