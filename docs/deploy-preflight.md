# Deploy Preflight: Supabase + Vercel

Generated alongside migrations `20260426_000001..4` and `20260428_000001_preflight_hardening`.
Run through this checklist **before** the first Vercel production deploy.

## 1. Database state (done via MCP)

The following migrations have been applied to the live Supabase project:

1. `align_intake_submissions_schema`
2. `workspace_billing_and_usage`
3. `admin_intake_leads_alignment`
4. `workspace_clearance_and_audit` (with corrected `is_workspace_member` policies)
5. `preflight_hardening`

After the hardening migration:

- `workspace_members.is_platform_admin boolean` column now exists.
- Flagged utility functions (`set_updated_at`, `sync_workspace_conversation_after_message`,
  `enforce_*`, `protect_*`, `prevent_*`) have `search_path = public, pg_temp` pinned.
- `agent_templates`, `intake_submissions`, and `workspace_dashboard_cards` have proper RLS
  policies (no more `rls_enabled_no_policy` INFO lints).
- `storage.buckets.intake-assets` is codified with explicit `storage.objects` policies.

## 2. Supabase dashboard toggles (manual, one-time)

Navigate to https://supabase.com/dashboard/project/<project-ref>/ and complete:

- **Auth -> Providers -> Email**: enable "Leaked password protection" (HIBP). This clears
  the `auth_leaked_password_protection` WARN advisor.
- **Auth -> URL Configuration**:
  - Site URL: `https://<your-prod-domain>`
  - Redirect URL allow-list: add your prod domain and every Vercel preview pattern you
    want to support, e.g. `https://*-yourteam.vercel.app`.
- **Auth -> Email Templates**: swap the "Confirm signup", "Invite user", "Magic Link",
  and "Reset password" templates to link to the prod domain (the defaults point at
  `localhost` or the Supabase-hosted verify URL).
- **Project Settings -> API**: if the current service role key has ever been pasted in
  chat / screenshots / logs, rotate it now and update Vercel with the new value.

## 3. Vercel environment variables

Set the following in Vercel -> Project Settings -> Environment Variables for
**Production** (and mirror into Preview where appropriate).

### Required (app will not function without these)

| Variable | Notes |
| --- | --- |
| `SUPABASE_URL` | Same as the Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Never prefix with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public; used by `createServerClient`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Prefer publishable key over legacy anon. |
| `PRISMA_MCP_JWT_SECRET` | 32+ byte hex. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `PRISMA_SECRETS_KEY` | 32 byte base64 for integrations vault AES-256-GCM. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |
| `PRISMA_PLATFORM_ADMIN_EMAILS` | Comma-separated list. For first deploy: `david@superwave.io`. Must not contain `admin@example.com` or `george@bbc.local` (the code throws in prod if they appear). |
| `PRISMA_ADMIN_SIGNUP_SECRET` | Random string. Required to use `/admin/signup` to bootstrap the first admin account. |
| `CRON_SECRET` | Required to authorize `/api/cron/*`. Vercel's managed cron sets `x-vercel-cron: 1` so scheduled runs still work; external callers must send `Authorization: Bearer <CRON_SECRET>`. |
| `PRISMA_CHAT_PROVIDER` | Set to `hermes`. |
| `HERMES_API_BASE_URL` | Hermes endpoint. |
| `HERMES_API_KEY` | Hermes key. |
| `HERMES_MODEL` | e.g. `hermes-agent`. |

### Optional but recommended

- `HERMES_IMAGE_MODEL`, `SERPAPI_KEY` (image tools)
- `SUPERMEMORY_API_KEY` (memory provider; leave unset to fall back)
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUCCESS_URL`,
  `STRIPE_CANCEL_URL`, `STRIPE_PRICE_AGENT_BASE`, `STRIPE_PRICE_OVERAGE_METERED`,
  `STRIPE_PRICE_HOSTING` (billing; only required if checkout flow is enabled)
- `TELEGRAM_BOT_TOKEN_OPERATOR`, `TELEGRAM_BOT_TOKEN_LEADS`, `TELEGRAM_BOT_TOKEN_QUALIFIED`
- `OPS_WEBHOOK_URL`, `MANYCHAT_API_KEY`, `MANYCHAT_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SITE_URL` (used by Stripe fallback redirects)

### Do not set

- `PRISMA_DISABLE_LOCAL_FALLBACK` -- leave unset or `false`; the JSON fallback is
  automatically disabled when Supabase env is present.

## 4. Bootstrap the first admin (david@superwave.io)

Once Vercel is deployed and env vars are set:

1. Visit `https://<your-prod-domain>/admin/signup`.
2. Enter `david@superwave.io`, a strong password, and the `PRISMA_ADMIN_SIGNUP_SECRET`
   value from Vercel.
3. The signup action (`app/admin/(auth)/signup/actions.ts`) creates the user with
   `app_metadata.is_platform_admin = true` set server-side.
4. Sign in at `/admin/login`; you should land on the admin dashboard.
5. (Optional) Once you've created a workspace, back-fill the DB flag for that user on
   their workspace rows by running:

   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
     node scripts/promote_platform_admin.mjs david@superwave.io
   ```

   The script sets `raw_app_meta_data.is_platform_admin = true` (belt) and flips
   `workspace_members.is_platform_admin = true` (suspenders) everywhere the user belongs.

## 5. Post-deploy verification

1. `curl https://<your-prod-domain>/api/health` -> expect `{ "status": "ok", ... }`.
   `503` means Supabase env is wrong; `degraded` is fine (only OpenClaw is optional).
2. Re-run Supabase security advisors:

   ```sql
   -- via MCP or Supabase dashboard
   select * from extensions.pg_database_advisor();
   ```

   Expected clean state: only the `auth_leaked_password_protection` WARN remains, and
   it clears as soon as you enable HIBP in step 2.
3. Smoke test tenant isolation:
   - As the platform admin, create a workspace `acme-demo`.
   - Invite a second user (`teammate@example.com`) via the UI.
   - Log in as the teammate and confirm they only see `acme-demo`.
   - Create a second workspace `beta-demo` and confirm the teammate cannot see it.
   - Run `select id from public.records where workspace_id = '<beta-demo-id>';` while
     authenticated as the teammate via PostgREST; expect zero rows.

## 6. Known follow-ups (not blocking deploy)

- `get_advisors type=performance` -- run after the first production traffic so the
  advisor has stats to score index usage.
- Per-workspace storage buckets -- today all intake assets share the `intake-assets`
  bucket; if you later need strict tenant isolation on files, split by bucket per
  workspace and scope `storage.objects` policies by the path prefix.
- The integrations vault (`workspace_integration_secrets`) relies entirely on service
  role for reads. If you expose decrypted credentials to authenticated users in the
  UI, revisit RLS for that table.
