# SECURITY_NOTE

Production secrets must never be committed to the repository. This document lists
the runtime-critical secrets for the Prisma platform and the rules around them.

## Required secrets (production)

| Variable | Purpose | Must be set? |
|----------|---------|--------------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side privileged access (RLS bypass) | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Public project URL for browser Supabase client | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key for browser auth | Yes |
| `PRISMA_PLATFORM_ADMIN_EMAILS` | Comma-separated list of operator emails granted platform-admin | Yes |
| `CRON_SECRET` | Shared secret for `/api/cron/*` routes | Yes |
| `HERMES_API_BASE_URL`, `HERMES_API_KEY` | Hermes agent runtime credentials | Yes (if Hermes enabled) |
| `OPENROUTER_API_KEY` | Fallback chat provider | Optional |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing | Only if billing enabled |
| `SUPERMEMORY_API_KEY` | Semantic memory | Only if Supermemory enabled |
| `MANYCHAT_API_KEY` | Outbound ManyChat send | Only if ManyChat enabled |
| `MANYCHAT_WEBHOOK_SECRET` | Inbound webhook verification | Only if ManyChat enabled |
| `TELEGRAM_BOT_TOKEN_OPERATOR`, `TELEGRAM_BOT_TOKEN_LEADS`, `TELEGRAM_BOT_TOKEN_QUALIFIED` | Telegram bot credentials | Only if Telegram bridge enabled |
| `OPERATOR_TELEGRAM_USER_ID` | Operator allowlist for Telegram DMs | Only if Telegram bridge enabled |

## Forbidden default values

The following values are known-bad defaults and will cause the server to refuse
to start in production:

- `PRISMA_PLATFORM_ADMIN_EMAILS=admin@example.com`
- `PRISMA_PLATFORM_ADMIN_EMAILS=george@bbc.local`
- Any literal `development-secret-change-me`, `change-me`, or `password`
  appearing in a real secret slot.

## Operational rules

1. **Never commit secrets.** Use `.env.local` for development (gitignored) and
   the deployment platform's secret store for production (Vercel, 1Password,
   etc.).
2. **Rotate keys** whenever a team member with access leaves.
3. **Service role key** must only be read from server-side code. It must never
   be prefixed with `NEXT_PUBLIC_` and must never appear in a client bundle.
4. `CRON_SECRET` authenticates Vercel cron calls. In local development it may
   be empty; in production it must be set and rotated periodically.
5. All inbound webhook routes that mutate state must verify an HMAC signature
   or shared secret. Never trust unauthenticated webhook bodies.
6. Supabase Row Level Security (RLS) is the authorization boundary for
   workspace data. Do not disable RLS in production migrations.

## Incident response

If a secret leaks:

1. Rotate the secret in its upstream provider immediately.
2. Update the deployment secret store and redeploy.
3. Audit access logs for the window the secret was exposed.
4. Document the incident in `docs/` with timestamp and affected surface.
