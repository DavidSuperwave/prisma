#!/usr/bin/env node
/*
 * Promote an existing auth.users email to a platform admin.
 *
 * Does two things:
 *   1. Sets `raw_app_meta_data.is_platform_admin = true` on auth.users
 *      (so `auth.jwt()` claims carry the flag on the next token refresh).
 *   2. Flips `workspace_members.is_platform_admin = true` on every workspace
 *      the user already belongs to (used by lib/workspaceStore.ts selects).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/promote_platform_admin.mjs david@superwave.io
 *
 * This is idempotent: re-running it is safe.
 */

import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("usage: node scripts/promote_platform_admin.mjs <email>");
  process.exit(1);
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

async function main() {
  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) {
    throw new Error(`listUsers failed: ${listError.message}`);
  }

  const user = listed.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!user) {
    console.error(`No auth user with email ${email}. Sign them up via /admin/signup first.`);
    process.exit(2);
  }

  const existingAppMeta = (user.app_metadata ?? {});
  const { error: updateAuthError } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...existingAppMeta,
      is_platform_admin: true,
    },
  });
  if (updateAuthError) {
    throw new Error(`updateUserById failed: ${updateAuthError.message}`);
  }

  const { data: memberships, error: memberError } = await supabase
    .from("workspace_members")
    .update({ is_platform_admin: true })
    .eq("user_id", user.id)
    .select("workspace_id");
  if (memberError) {
    throw new Error(`workspace_members update failed: ${memberError.message}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        user: { id: user.id, email: user.email },
        app_metadata_flagged: true,
        workspace_members_updated: memberships?.length ?? 0,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
