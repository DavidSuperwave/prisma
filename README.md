# PrismaProject Homepage

Spanish marketing homepage for PrismaProject with a reusable Noa-inspired layout and an interactive WhatsApp-style agent demo.

## Stack

- Next.js App Router
- React
- Plain CSS with Prisma brand tokens
- OpenRouter via a server-side API route
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
3. Add your OpenRouter key to `.env.local`.
4. Start the app:
   ```bash
   npm run dev
   ```

## Environment variables

- `OPENROUTER_API_KEY`: required for live chat mode
- `OPENROUTER_MODEL`: optional, defaults to `openai/gpt-4o-mini`
- `SUPABASE_URL`: required in production for intake record storage
- `SUPABASE_SERVICE_ROLE_KEY`: required in production for secure insert/update + asset uploads
- `SUPABASE_STORAGE_BUCKET`: optional, defaults to `intake-assets`
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