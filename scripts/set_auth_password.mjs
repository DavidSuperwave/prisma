#!/usr/bin/env node
/**
 * Set password for a Supabase Auth user (operator script; requires service role).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/set_auth_password.mjs <email> [password]
 *
 * If password is omitted, a strong random one is generated and printed to stdout.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const email = (process.argv[2] ?? "").trim().toLowerCase();
let password = (process.argv[3] ?? "").trim();

if (!email) {
  console.error("usage: node scripts/set_auth_password.mjs <email> [password]");
  process.exit(1);
}

if (!password) {
  password = randomBytes(18).toString("base64url");
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});
if (listError) {
  console.error("listUsers failed:", listError.message);
  process.exit(1);
}

const user = listed.users.find((c) => c.email?.toLowerCase() === email);
if (!user) {
  console.error(`No auth user with email ${email}. Create the account first (e.g. /admin/signup).`);
  process.exit(2);
}

const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { password });
if (updateError) {
  console.error("updateUserById failed:", updateError.message);
  process.exit(1);
}

console.log(
  JSON.stringify(
    { ok: true, userId: user.id, email: user.email, password, note: "Store password securely; it will not be shown again." },
    null,
    2,
  ),
);
