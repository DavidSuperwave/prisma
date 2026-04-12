# PrismaProject Homepage

Spanish marketing homepage for PrismaProject with a reusable Noa-inspired layout and an interactive WhatsApp-style agent demo.

## Stack

- Next.js App Router
- React
- Plain CSS with Prisma brand tokens
- hErmes/OpenRouter via a server-side API route
- Lucide icons

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.local.example .env.local
   ```
3. Configure chat provider credentials in `.env.local`.
4. Start the app:
   ```bash
   npm run dev
   ```

## Environment variables

- `PRISMA_CHAT_PROVIDER`: `auto` (default), `hermes`, or `openrouter`
- `OPENROUTER_API_KEY`: required for OpenRouter mode
- `OPENROUTER_MODEL`: optional, defaults to `openai/gpt-4o-mini`
- `HERMES_API_BASE_URL`: hErmes API server base URL (for example `http://localhost:8642`)
- `HERMES_API_KEY`: required for hErmes mode
- `HERMES_MODEL`: optional, defaults to `hermes-agent`
- `HERMES_DEFAULT_CONVERSATION`: optional conversation fallback for demo usage
- `HERMES_DROPLET_HOST`: default target host label used by admin deployment records
- `HERMES_IMAGE_REF`: pinned hErmes image reference for admin deployment records
- `PRISMA_INTAKE_SUBDOMAIN_PREFIX`: optional, defaults to `intake.`
- `PRISMA_APP_SUBDOMAIN_PREFIX`: optional, defaults to `app.`
- `PRISMA_APP_DEFAULT_PATH`: optional app-subdomain root rewrite target, defaults to `/admin`
- `SUPABASE_URL`: required in production for intake record storage
- `SUPABASE_SERVICE_ROLE_KEY`: required in production for secure insert/update + asset uploads
- `SUPABASE_STORAGE_BUCKET`: optional, defaults to `intake-assets`
- `PRISMA_DISABLE_LOCAL_FALLBACK`: set to `true` to disable local JSON fallback paths after M1 hardening
- `STRIPE_SECRET_KEY`: required to create Stripe Checkout sessions
- `STRIPE_PRICE_ID`: Stripe price ID used at checkout
- `STRIPE_WEBHOOK_SECRET`: required to verify Stripe webhooks
- `STRIPE_SUCCESS_URL`: optional override for Stripe success redirect
- `STRIPE_CANCEL_URL`: optional override for Stripe cancel redirect
- `NEXT_PUBLIC_SITE_URL`: base URL used for fallback redirects (e.g. `https://prisma.com.mx`)
- `OPS_WEBHOOK_URL`: optional webhook for team notifications on intake submitted/paid

## Homepage structure

- Hero with Prisma brand system
- Solution cards with media placeholders
- Stats block with placeholders
- Security section
- Audience section for future vertical reuse
- WhatsApp phone clone with demo and live chat modes
- Final CTA block

## Intake funnel route

- Intake page: `/intake`
- Form API: `POST /api/intake`
- Stripe checkout session API: `POST /api/stripe/checkout`
- Stripe webhook endpoint: `POST /api/stripe/webhook`

If `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are configured, intake submissions and uploads use Supabase.
If not configured, the app falls back to local storage for development (`.data/intake-submissions.json` and `public/intake-assets`).
Set `PRISMA_DISABLE_LOCAL_FALLBACK=true` in hardened environments to fail fast instead of writing local state.

## Chat runtime mode

`POST /api/chat` supports two upstream providers:

- `hErmes` (`/v1/responses`) for M0/M1 architecture validation and runtime integration
- `OpenRouter` (`/api/v1/chat/completions`) for marketing demo compatibility

Provider resolution:

1. `PRISMA_CHAT_PROVIDER=hermes` -> force hErmes
2. `PRISMA_CHAT_PROVIDER=openrouter` -> force OpenRouter
3. `PRISMA_CHAT_PROVIDER=auto` -> hErmes when `HERMES_API_BASE_URL` + `HERMES_API_KEY` exist, else OpenRouter

## Host routing model

Recommended routing for your goals:

- `prismaproject.com` -> marketing homepage (`/`)
- `app.prismaproject.com` -> admin/app surface (`/admin` by default via middleware rewrite)
- `intake.prismaproject.com` -> intake entrypoint (`/intake` rewrite)

The repo uses `proxy.ts` for host-based rewrites.

## Schema source of truth

The active database source of truth is now the migration files under `supabase/migrations`.
`docs/intake-schema.sql` is kept as a legacy reference and should not be used for new deployments.

## Admin control plane (new)

- Admin overview: `/admin`
- Core modules:
  - `/admin/new-project`
  - `/admin/clients`
  - `/admin/templates`
  - `/admin/agents`
  - `/admin/deployments`
  - `/admin/usage`

This control plane is the foundation for a multi-tenant Prisma platform:

- Workspaces (client tenants)
- Projects (per-client implementation tracks)
- Template registry for landing pages
- Agent definitions and deployment metadata
- Usage and provisioning event stream

### Admin APIs

- `GET|POST /api/admin/workspaces`
- `POST /api/admin/projects/manual-create`
- `GET|POST /api/admin/templates`
- `GET|POST /api/admin/agents`
- `GET|POST /api/admin/deployments`
- `GET /api/admin/usage`
- `GET /api/admin/provisioning`

### Intake-to-provisioning behavior

- Intake submission now queues a provisioning job.
- Stripe `checkout.session.completed` marks intake as paid, provisions workspace/project/site from intake data, and advances lifecycle status to `reviewing`.

## Deployment

Deploy directly to Vercel.

Set all required env vars in Vercel project settings before using live chat and intake checkout.

### Subdomain setup (`intake.prisma.com.mx`)

1. Add `intake.prisma.com.mx` as a domain on the same Vercel project.
2. Create DNS record in your DNS provider:
   - `CNAME intake -> cname.vercel-dns.com` (or the Vercel target shown in project settings).
3. The included `proxy.ts` + `middleware.ts` rewrites root requests on the `intake.*` host to `/intake`.