# Prisma Repo Audit Report

Generated: 2026-04-17
Commit: 2f2042d
Branch: main

---

## 1. Top-level orientation

- **Framework:** Next.js 14+ (App Router) with React, TypeScript
- **Key versions:** `next: "latest"`, `react: "latest"`, `@supabase/supabase-js: "^2.102.1"`, `stripe: "^22.0.0"`
- **CSS approach:** CSS modules exist (`workspace-panels.module.css`) but components predominantly use inline `React.CSSProperties`. No Tailwind.
- **Package manager:** npm (`package-lock.json` present, 225KB)
- **File counts:**
  - Total files under `app/`, `lib/`, `components/`, `supabase/migrations/`, `skills/`: **130 files**
  - `app/` routes: ~40 files
  - `lib/` modules: 12 files
  - `components/`: ~50 files
  - `supabase/migrations/`: 8 files
  - `skills/`: 2 skill directories
- **Monorepo/workspace config:** None. There is a nested `prisma/` directory that appears to be a legacy/abandoned copy of an earlier version of the codebase (has its own `package.json`, `.git` folder reference). This should be investigated for cleanup.

---

## 2. AGENTS.md state

**Current contents summary:**
- Describes the project as a "single Next.js (App Router) marketing site"
- States "No databases, Docker, or background workers are required"
- Mentions OpenRouter chat proxy at `/api/chat`
- Notes dual ESLint configs present
- Documents port 3000 dev server only

**Is it accurate?** **No — significantly outdated.**

The file describes a simple marketing site, but the codebase has evolved into a multi-tenant agent operations platform with:
- Full Supabase database integration (8 migrations, 15+ tables)
- Admin dashboard at `/admin`
- Workspace system with auth, RLS, records, agents
- Hermes agent runtime integration
- Stripe payment/provisioning flow

AGENTS.md needs a complete rewrite to reflect the current architecture.

---

## 3. Master spec

**Does `docs/PRISMA-MASTER-SPEC-V1.md` exist?** Yes (1,792 lines)

### Milestone summary:

| Milestone | Summary | Status per spec |
|-----------|---------|-----------------|
| M0 | Validation test — hErmes running, agent creates tables via conversation | Code complete, runtime NOT confirmed |
| M1 | Database foundation — all tables + RLS | ✅ COMPLETE |
| M2 | Record CRUD (write layer) — POST/PATCH/DELETE for records | ⚠️ READ works / WRITE was marked MISSING |
| M3 | Auth + workspace shell | ✅ COMPLETE |
| M4 | Chat panel + /api/chat proxy | ✅ COMPLETE (one flex layout fix needed) |
| M5 | Multi-user sessions | ✅ COMPLETE |
| M6 | Agent deployment (manual v1) — endpoint registration + health check | ⚠️ UI exists / Docker deployment missing |
| M7 | WhatsApp channel agent | ❌ Not started |
| M8 | Data import | ❌ Not started |
| M9 | Cron execution + activity feed | ⚠️ Data model done / execution missing |
| M10 | BBC launch (E2E assembly) | ⚠️ Demo only / Not launchable |
| M11 | UI/UX overhaul — apply design system | ❌ Design system exists / Not applied |
| M12 | Email integration | ❌ Not built |
| M13 | External API polling | ❌ Not built |
| M14 | Field management UI | ❌ Not built |
| M15 | Board/kanban view | ❌ Not built |

### Agent/Hermes/MCP references in spec:

The spec extensively mentions:
- **"Hermes"** / **"hErmes"**: 100+ occurrences — the agent runtime
- **"agent"**: 400+ occurrences — agent architecture, deployment, templates
- **"chat"**: 50+ occurrences — chat panel, chat proxy
- **"canvas"**: 20+ occurrences — agent canvas UI (ClickUp-style builder)
- **"skills"**: 40+ occurrences — skill system for agent knowledge
- **"MCP"**: 0 direct mentions (the spec refers to "skills" system instead)
- **"workflow"**: 10+ occurrences — operational workflows

---

## 4. Admin surface (`app/admin/`)

### Route inventory:

| Path | Status | Components | Data source | Actions |
|------|--------|------------|-------------|---------|
| `/admin` (page.tsx) | Functional dashboard | Links to stats | `listWorkspaces`, `listAgents`, `listDeployments`, `listTemplates`, `listSites`, `listProvisioningJobs` from `platformStore` | None — read-only stats |
| `/admin/agents` | Functional list | Inline grid with links | `listAgents`, `listWorkspaces` from `platformStore` | "Advanced" link to `[workspaceSlug]/[agentId]` |
| `/admin/agents/[workspaceSlug]/[agentId]` | Exists | `AgentAdvancedSettingsPanel` | Agent data via props | Agent config editing |
| `/admin/clients` | Exists (referenced) | - | `platformStore` | Workspace list |
| `/admin/deployments` | Functional list | Inline grid | `listDeployments`, `listWorkspaces` | None — read-only |
| `/admin/templates` | Exists | `AgentTemplateManager` | `listTemplates` | Template CRUD |
| `/admin/usage` | Exists | - | `listProvisioningJobs` | Read-only event stream |
| `/admin/new-project` | Functional | `ManualProjectCreator` | `listWorkspaces`, `listTemplates` | Creates workspace shell |
| `/admin/login`, `/admin/signup` | Functional auth | `AdminLoginForm`, `AdminSignupForm` | Supabase auth | Sign in/up |

### Key findings:

**`/admin/agents`** — This is a **read-only monitor**. The spec explicitly states: "The agent builder lives inside the client workspace under the Agents section. The admin dashboard is a lightweight control plane for provisioning, monitoring, and billing only." This is intentional per Decision 6 in the spec.

**`/admin/deployments`** — Read-only listing of deployment records. No actual container management (no start/stop buttons). Just displays `containerName`, `status`, `dropletHost`, `workspace`.

**`/admin/new-project`** — Uses `ManualProjectCreator` component which calls `/api/admin/projects/manual-create`. Creates:
- A workspace row in Supabase
- A project row linked to the workspace
- Optionally a deployment metadata row
- Does NOT start Docker containers

---

## 5. Chat integration (`app/api/chat/`)

### Full verbatim content of `app/api/chat/route.ts`:

**File length:** 903 lines

**Key sections:**

```typescript
// Provider resolution (lines 100-110)
function resolveProvider() {
  const configured = (process.env.PRISMA_CHAT_PROVIDER ?? "auto").toLowerCase();
  if (configured === "hermes") return "hermes" as ChatProvider;
  if (configured === "openrouter") return "openrouter" as ChatProvider;
  return process.env.HERMES_API_BASE_URL && process.env.HERMES_API_KEY ? "hermes" : "openrouter";
}
```

**Provider switch logic:**
1. If `PRISMA_CHAT_PROVIDER=hermes` → use Hermes
2. If `PRISMA_CHAT_PROVIDER=openrouter` → use OpenRouter
3. If `auto` (default): check if `HERMES_API_BASE_URL` and `HERMES_API_KEY` exist → Hermes, else OpenRouter
4. Workspace-scoped requests always try Hermes first (lines 891-894)

**Streaming:** Yes — SSE (`text/event-stream`). Implemented via `streamFromSseUpstream()` which parses upstream SSE and re-emits normalized `{type: "delta", content}` events.

**Session identifier:** Yes — conversation ID passed as:
```typescript
const conversationId = payload.conversation_id ?? payload.conversationId ??
  (agent ? `${agent.workspace_id}:${agent.id}` : process.env.HERMES_DEFAULT_CONVERSATION);
```

**Tool event handling:** The route extracts delta text from various response formats but does **not** explicitly unwrap or forward tool events. It extracts `choices[0].delta.content`, `output_text`, `output[].content[].text` but tool calls would need explicit handling.

**Authentication:**
- Public chat: Rate-limited (20 requests per 60 seconds per fingerprint)
- Workspace-scoped chat: Requires auth via `getCurrentAppUser()`, checks workspace membership via `listWorkspaceMembershipsForUser()`
- Agent-scoped chat: Verifies agent belongs to an accessible workspace

---

## 6. Admin APIs (`app/api/admin/`)

| Route | Methods | Auth check | Supabase client | Reads/Writes |
|-------|---------|------------|-----------------|--------------|
| `/api/admin/agents` | GET, POST, PATCH | `ensureAdminApiAccess()` → 401/403 | service_role via `platformStore` | agents table |
| `/api/admin/deployments` | GET, POST, PATCH | `ensureAdminApiAccess()` | service_role | deployments table |
| `/api/admin/intakes/[intakeId]/approve` | POST | `ensureAdminApiAccess()` | service_role | intakes, provisioning |
| `/api/admin/projects/manual-create` | POST | `ensureAdminApiAccess()` | service_role | workspaces, projects, deployments |
| `/api/admin/provisioning` | GET | `ensureAdminApiAccess()` | service_role | provisioning_jobs |
| `/api/admin/sites/[siteId]/publish` | POST | `ensureAdminApiAccess()` | service_role | sites table |
| `/api/admin/templates` | GET, POST, PATCH | `ensureAdminApiAccess()` | service_role | agent_templates |
| `/api/admin/usage` | GET | `ensureAdminApiAccess()` | service_role | usage_events |
| `/api/admin/users` | GET | `ensureAdminApiAccess()` | service_role | auth.users |
| `/api/admin/workspaces` | GET, POST | `ensureAdminApiAccess()` | service_role | workspaces |
| `/api/admin/workspaces/[workspaceId]/bootstrap-agent` | POST | `ensureAdminApiAccess()` | service_role | workspace_agents, deployments |

All admin APIs use `ensureAdminApiAccess()` which:
1. Calls `getCurrentAppUser()` — returns 401 if no session
2. Checks `user.isPlatformAdmin` — returns 403 if false

---

## 7. Supabase state

### Migration files (in order):

| File | Purpose |
|------|---------|
| `20260411_000001_m1_foundation.sql` | Core schema: workspaces, workspace_members, workspace_objects, workspace_fields, workspace_views, records, workspace_agents, agent_activity, agent_events |
| `20260411_000002_m1_rls.sql` | RLS policies for all foundation tables using `is_workspace_member()` function |
| `20260412_add_workspace_limits.sql` | Adds `agent_limit` and `plan_tier` columns to workspaces (via metadata or direct columns) |
| `20260412_m5_dashboard_and_agent_templates.sql` | Creates `agent_templates` and `workspace_dashboard_cards` tables |
| `20260413_stage2_import_history.sql` | Creates `workspace_import_history` table for M8 data import tracking |
| `20260413_stage3_m15_group_by_field_id.sql` | Adds `group_by_field_id` to `workspace_views` for board view grouping |
| `20260414_stage4_tasks_and_evidence.sql` | Creates `workspace_tasks` and `workspace_evidence_links` tables |
| `20260415_stage5_conversations_and_readiness.sql` | Creates `workspace_conversations` and `workspace_conversation_messages` tables |

### Full table list with key columns:

| Table | Key columns | RLS |
|-------|-------------|-----|
| `workspaces` | id, name, subdomain, logo_url, primary_color, metadata, created_by | ✅ |
| `workspace_members` | workspace_id, user_id, role ('admin'/'operator'/'viewer') | ✅ |
| `workspace_objects` | workspace_id, name, singular_name, plural_name, icon, default_status_field_id | ✅ |
| `workspace_fields` | workspace_id, object_id, name, key, type, required, options, sort_order | ✅ |
| `workspace_views` | workspace_id, object_id, name, filters, sort_by, columns, group_by_field_id | ✅ |
| `records` | workspace_id, object_id, data (JSONB), created_by | ✅ |
| `workspace_agents` | workspace_id, name, type, api_endpoint, api_key, status, soul_md, skills, knowledge_scope, cron_jobs | ✅ |
| `agent_activity` | workspace_id, agent_id, action, details | ✅ |
| `agent_events` | workspace_id, source_agent_id, event_type, payload, processed_by | ✅ |
| `agent_templates` | name, type, default_soul_md, default_skills, default_knowledge_scope | No (global) |
| `workspace_dashboard_cards` | workspace_id, card_type, title, config, position | ✅ (implied) |
| `workspace_import_history` | workspace_id, object_id, file_name, total_rows, imported_rows | ✅ |
| `workspace_tasks` | workspace_id, source_record_id, type, title, status, owner_user_id, owner_agent_id | ✅ |
| `workspace_evidence_links` | workspace_id, document_record_id, related_record_id, quote | ✅ |
| `workspace_conversations` | workspace_id, agent_id, title, runtime_conversation_id, message_count | ✅ |
| `workspace_conversation_messages` | conversation_id, workspace_id, agent_id, role, content, blocks | ✅ |

**Key tables present:** `workspaces` ✅, `records` ✅, `workspace_agents` ✅, `users`/`profiles` → uses `auth.users` from Supabase Auth

**Seeded data:** `supabase/seeds/20260411_m1_isolation_seed.sql` exists (isolation test data)

**Stored procedures:** `is_workspace_member(uuid)` function, `set_updated_at()` trigger function, `sync_workspace_conversation_after_message()` trigger

---

## 8. lib/ structure

```
lib/
├── adminUsers.ts        (611 bytes)
├── agentReadiness.ts    (3,180 bytes)
├── auth.ts              (5,399 bytes)
├── brand.ts             (367 bytes)
├── chatSseClient.ts     (822 bytes)
├── intakeStore.ts       (8,601 bytes)
├── opsNotify.ts         (754 bytes)
├── platformStore.ts     (64,257 bytes) ← massive
├── supabaseAdmin.ts     (822 bytes)
├── supabasePublicAuth.ts (1,151 bytes)
├── teamChatStore.ts     (11,952 bytes)
├── workspaceActions.ts  (15,110 bytes)
└── workspaceStore.ts    (28,956 bytes)
```

### File purposes and key exports:

| File | Purpose | Key exports |
|------|---------|-------------|
| `adminUsers.ts` | Admin user listing | `listAdminUsers()` |
| `agentReadiness.ts` | Agent deployment readiness evaluation | `evaluateAgentReadiness()`, `executionBlockReason()`, `mergeReadinessIntoKnowledgeScope()` |
| `auth.ts` | Auth session management | `createAuthSession()`, `getCurrentAppUser()`, `requireAuthenticatedUser()`, `ensureAdminApiAccess()` |
| `brand.ts` | Branding constants | `brandColors`, `brandName` |
| `chatSseClient.ts` | Client-side SSE helper | `createChatStream()` |
| `intakeStore.ts` | Intake submission persistence | `createIntakeSubmission()`, `getIntakeSubmissionById()`, `markIntakeAsPaid()` |
| `opsNotify.ts` | Webhook notifications | `notifyOps()` |
| `platformStore.ts` | Platform admin data access (massive) | `listWorkspaces()`, `listAgents()`, `listTemplates()`, `listDeployments()`, `provisionWorkspaceFromIntake()`, etc. |
| `supabaseAdmin.ts` | Supabase admin client | `getSupabaseAdmin()`, `hasSupabaseAdminConfig()` |
| `supabasePublicAuth.ts` | Public Supabase client | `createSupabasePublicClient()` |
| `teamChatStore.ts` | Team chat operations | `listChannels()`, `sendMessage()`, etc. |
| `workspaceActions.ts` | Workspace action handlers | `createWorkspaceAction()`, `listActions()` |
| `workspaceStore.ts` | Workspace data access | `listWorkspaceMembershipsForUser()`, type definitions for all workspace entities |

### Supabase wrapper:

```typescript
// lib/supabaseAdmin.ts - key function
export function getSupabaseAdmin() {
  if (!hasSupabaseAdminConfig()) return null;
  if (cachedClient !== undefined) return cachedClient;
  cachedClient = createClient(supabaseUrl!, supabaseServiceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedClient;
}
```

### Hermes client:

**No dedicated Hermes client wrapper exists in `lib/`.** The chat proxy at `app/api/chat/route.ts` makes direct `fetch()` calls to the Hermes endpoint:

```typescript
// From app/api/chat/route.ts lines 706-713
const hermesResponse = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/responses`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(requestBody),
});
```

---

## 9. Skills folder

```
skills/
├── prisma-api-fetch/
│   └── SKILL.md
└── prisma-database/
    └── SKILL.md
```

### `skills/prisma-database/SKILL.md`:

**Frontmatter:**
```yaml
---
name: prisma-database
description: Create and update Prisma workspace schema rows in Supabase through the meta-model tables.
---
```

**First 10 lines of content:**
```markdown
# prisma-database

Use this skill to create and update Prisma workspace schema rows in Supabase through the meta-model tables.

## Objective

Translate workspace requirements into:

- `workspace_objects` rows for each object
- `workspace_fields` rows for each field on each object
```

### `skills/prisma-api-fetch/SKILL.md`:

**Frontmatter:**
```yaml
---
name: prisma-api-fetch
description: Fetch external API data on schedule and upsert mapped rows into Prisma workspace records.
---
```

**First 10 lines of content:**
```markdown
# prisma-api-fetch

Use this skill when an agent must pull data from third-party APIs (Close, HubSpot, custom REST) and write normalized results into workspace objects.

## Objective

On each cron execution:

1. Build request URL/headers using configured credentials.
2. Resolve incremental window using `{last_run}`.
```

### Code reading from `skills/`:

**No code currently reads from the `skills/` directory.** The skills are designed to be mounted into Hermes containers as volume mounts per the spec's Docker Compose examples:
```yaml
volumes:
  - ./skills/prisma-database:/opt/hermes/skills/prisma-database:ro
```

---

## 10. Env vars in use

### Contents of `.env.local.example`:

```
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-4o-mini
PRISMA_CHAT_PROVIDER=auto

# hErmes runtime proxy (M0/M1)
HERMES_API_BASE_URL=
HERMES_API_KEY=
HERMES_MODEL=hermes-agent
HERMES_DEFAULT_CONVERSATION=marketing-demo
HERMES_DROPLET_HOST=shared-droplet
HERMES_IMAGE_REF=prisma/hermes:stable

# Intake + storage
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_STORAGE_BUCKET=intake-assets
PRISMA_PLATFORM_ADMIN_EMAILS=admin@example.com
PRISMA_ADMIN_SIGNUP_SECRET=

# Disable local JSON fallback after M1 hardening
PRISMA_DISABLE_LOCAL_FALLBACK=false

# Stripe
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
STRIPE_SUCCESS_URL=
STRIPE_CANCEL_URL=

# Public site url used by checkout fallback redirects
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Optional internal notifications webhook (Slack/Discord/custom)
OPS_WEBHOOK_URL=
```

### Env vars referenced in code:

| Var | Files |
|-----|-------|
| `HERMES_API_BASE_URL` | `app/api/chat/route.ts` |
| `HERMES_API_KEY` | `app/api/chat/route.ts` |
| `HERMES_MODEL` | `app/api/chat/route.ts`, `lib/platformStore.ts` |
| `HERMES_DEFAULT_CONVERSATION` | `app/api/chat/route.ts` |
| `HERMES_DROPLET_HOST` | `app/api/admin/workspaces/[workspaceId]/bootstrap-agent/route.ts`, `app/api/admin/projects/manual-create/route.ts` |
| `HERMES_IMAGE_REF` | `app/api/admin/workspaces/[workspaceId]/bootstrap-agent/route.ts`, `app/api/admin/projects/manual-create/route.ts` |
| `SUPABASE_URL` | `lib/supabaseAdmin.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabaseAdmin.ts` |
| `SUPABASE_STORAGE_BUCKET` | `lib/supabaseAdmin.ts` |
| `STRIPE_SECRET_KEY` | `app/api/stripe/checkout/route.ts`, `app/api/stripe/webhook/route.ts` |
| `STRIPE_PRICE_ID` | `app/api/stripe/checkout/route.ts` |
| `STRIPE_WEBHOOK_SECRET` | `app/api/stripe/webhook/route.ts` |
| `STRIPE_SUCCESS_URL` | `app/api/stripe/checkout/route.ts` |
| `STRIPE_CANCEL_URL` | `app/api/stripe/checkout/route.ts` |
| `OPENROUTER_API_KEY` | `app/api/chat/route.ts`, `app/api/workspaces/[workspaceSlug]/agents/[agentId]/builder-turn/route.ts` |
| `OPENROUTER_MODEL` | `app/api/chat/route.ts`, `app/api/workspaces/[workspaceSlug]/agents/route.ts`, `lib/platformStore.ts` |

---

## 11. Stripe + intake flow

### Full flow:

1. **`POST /api/intake`** — User submits intake form with business info + file uploads
   - Creates `IntakeSubmission` in storage (Supabase or local JSON fallback)
   - Uploads assets to Supabase Storage (or local `public/intake-assets/`)
   - Calls `queueProvisioningFromIntake()` → creates provisioning job record
   - Calls `notifyOps()` → webhook notification

2. **`POST /api/stripe/checkout`** — Frontend requests checkout URL
   - Looks up intake by ID
   - Creates Stripe Checkout Session with `client_reference_id` = intakeId
   - Returns checkout URL to frontend

3. **`POST /api/stripe/webhook`** — Stripe sends `checkout.session.completed`
   - Extracts `intakeId` from metadata/client_reference_id
   - Calls `markIntakeAsPaid()` — updates intake payment status
   - Calls `provisionWorkspaceFromIntake()` → creates:
     - `workspaces` row
     - `projects` row linked to workspace
   - Calls `updateIntakeProvisioningStatus()` → sets `lifecycleStatus: 'reviewing'`
   - Calls `notifyOps()` → webhook notification

### What gets created on `checkout.session.completed`:

From `lib/platformStore.ts` `provisionWorkspaceFromIntake()`:
- One `workspaces` row with name, slug derived from business name
- One `projects` row linked to the workspace
- Returns `{ workspaceId, projectId, alreadyProvisioned }`

### Hermes/agents/skills mentions in provisioning:

**No.** The provisioning path creates the workspace shell only. It does not:
- Start Docker containers
- Create agent entries
- Reference Hermes, skills, or agent configuration

Agent bootstrapping is a separate flow via `/api/admin/workspaces/[workspaceId]/bootstrap-agent` which must be called manually after provisioning.

---

## 12. Middleware / routing

### Contents of `proxy.ts`:

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const INTAKE_SUBDOMAIN = process.env.PRISMA_INTAKE_SUBDOMAIN_PREFIX ?? "intake.";
const APP_SUBDOMAIN = process.env.PRISMA_APP_SUBDOMAIN_PREFIX ?? "app.";
const APP_DEFAULT_PATH = process.env.PRISMA_APP_DEFAULT_PATH ?? "/workspaces";
const ACCESS_TOKEN_COOKIE = "prisma-access-token";

function isProtectedPath(pathname: string) {
  const isAdminAuthPath =
    pathname === "/admin/login" ||
    pathname === "/admin/signup" ||
    pathname.startsWith("/admin/login/") ||
    pathname.startsWith("/admin/signup/");

  return (
    pathname.startsWith("/workspaces") ||
    (pathname.startsWith("/admin") && !isAdminAuthPath) ||
    pathname.startsWith("/api/admin")
  );
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const pathname = request.nextUrl.pathname;
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (host.startsWith(INTAKE_SUBDOMAIN) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/intake";
    return NextResponse.rewrite(url);
  }

  if (host.startsWith(APP_SUBDOMAIN) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = APP_DEFAULT_PATH;
    return NextResponse.rewrite(url);
  }

  if (isProtectedPath(pathname) && !accessToken) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    const nextPath = `${pathname}${request.nextUrl.search}`;
    url.pathname = pathname.startsWith("/admin") ? "/admin/login" : "/login";
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = { matcher: "/:path*" };
```

### Subdomain rewrite logic:

| Host prefix | Pathname | Result |
|-------------|----------|--------|
| `intake.*` | `/` | Rewrite to `/intake` |
| `app.*` | `/` | Rewrite to `/workspaces` |
| Any | Protected path without cookie | Redirect to `/login` or `/admin/login` |

**Note:** There is no separate `middleware.ts` — the proxy function in `proxy.ts` appears to be imported by Next.js middleware (standard pattern).

---

## 13. TypeScript / build health

### `npx tsc --noEmit` result:

```
(no output — passed with 0 errors)
```

✅ TypeScript compilation passes cleanly.

### `npm run lint` result:

```
✖ 4 problems (0 errors, 4 warnings)

components/landing/Nav.tsx:155:13 - @next/next/no-img-element
components/workspace/Stage2Panels.tsx:1254:15 - @next/next/no-img-element
components/workspace/WorkspacePanels.tsx:3778:6 - react-hooks/exhaustive-deps
eslint.config.mjs:5:1 - import/no-anonymous-default-export
```

✅ ESLint passes with **0 errors, 4 warnings** (non-blocking).

Both tools run successfully (not broken).

---

## 14. Recent git activity

### `git log --oneline -20`:

```
2f2042d feat: server-side conversations, Hermes routing, agent readiness
02e260a Refine workspace layout: shell, panels, page, and global styles
0160e77 feat: stage 3 M15 board/kanban view with drag-drop (#6)
0370750 Resolve main conflicts for M4 workspace UI and align scope notes (#5)
5ecaf14 UI/UX system rollout for first workspace pages (#4)
93370ce Build initial Prisma workspace surface (#2)
96bc826 feat: implement M0 runtime integration and M1 data foundation
fbf252c feat: add admin control plane and manual project creation
f583015 Fix Nav.tsx TypeScript error for coming soon items
08dc0dc Landing page updates: Prisma logo, Voice Experience coming soon, ChatbotKillShot
e0b6aef feat: refocus landing page around industry operator demos
ba8703a Fix landing page styling: card contrast, section rhythm, TestimonialSection layout, mobile nav
b29e932 feat: Giga-inspired landing page with Prisma brand fusion (80% Giga / 20% Prisma)
4d38094 Development environment setup (#1)
e3b04ea docs: add agent brief for phone component mobile + API fix
c22d920 refactor: split WhatsAppPhone into pure PhoneFrame + slim wrapper, clean up hero
e45d7a0 feat: rewrite homepage with real copy + WhatsApp phone in hero
8a8c897 Add Prisma marketing site foundation
```

### Branches:

```
* main
  remotes/origin/HEAD -> origin/main
  remotes/origin/cursor/development-environment-setup-6af7
  remotes/origin/cursor/m4-ui-spec-alignment-a010
  remotes/origin/cursor/master-spec-consolidation-f37f
  remotes/origin/cursor/prisma-m2-foundation-296c
  remotes/origin/cursor/resolve-main-conflict-m4-13d8
  remotes/origin/cursor/ui-ux-first-pages-refresh-63d3
  remotes/origin/main
```

7 remote branches besides main (all appear to be Cursor-generated feature branches).

### `git status`:

```
On branch main
Your branch is up to date with 'origin/main'.

Untracked files:
  tsconfig.tsbuildinfo

nothing added to commit but untracked files present
```

✅ Clean working tree (only untracked build artifact).

---

## 15. Red flags and surprises

### Dead code / abandoned directories:

- **`prisma/` nested directory** — Contains a complete duplicate of an earlier version of the codebase (own `package.json`, `AGENTS.md`, `components/`, `app/`, etc.). This is 50+ files that should be investigated for removal.

### Massive files:

- **`components/workspace/WorkspacePanels.tsx`** — 6,007 lines
- **`components/workspace/Stage2Panels.tsx`** — 1,904 lines
- **`lib/platformStore.ts`** — 64KB, ~1,500 lines

These should be split per the spec's M11 UI/UX overhaul guidance.

### Inline styles vs CSS modules:

The spec explicitly calls this out: "CSS module files exist in the repo. But WorkspacePanels.tsx uses inline React.CSSProperties on every component. The design system document and the running application are completely disconnected."

### AGENTS.md accuracy:

Severely outdated — describes a marketing site when this is now a full platform.

### TODO comments:

No concentrated TODO comments found, but the spec itself tracks incomplete work thoroughly.

### Dependencies on alpha/beta:

All core dependencies use `"latest"` which is intentional per AGENTS.md but risky for reproducibility.

### Env vars referenced but missing from `.env.local.example`:

- `PRISMA_CHAT_PROVIDER` — documented in example ✅
- `PRISMA_INTAKE_SUBDOMAIN_PREFIX` — NOT in example
- `PRISMA_APP_SUBDOMAIN_PREFIX` — NOT in example
- `PRISMA_APP_DEFAULT_PATH` — NOT in example
- `PRISMA_PLATFORM_ADMIN_EMAILS` — documented ✅
- `OPS_WEBHOOK_URL` — documented ✅

### Hermes/agent code not wired:

- Agent templates exist in DB but no agent provisioning automation
- `workspace_agents` table has `api_endpoint` and `api_key` but these must be manually entered
- Cron jobs are stored in `workspace_agents.cron_jobs` but no code executes them (per spec M9 status)

---

## 16. What's NOT in the repo

Explicit list of expected items not found:

| Expected | Status | Notes |
|----------|--------|-------|
| Hermes client wrapper in `lib/` | ❌ Not present | Chat route uses inline `fetch()` |
| MCP server code | ❌ Not present | Spec uses "skills" system instead of MCP protocol |
| Agent provisioning automation (Docker) | ❌ Not present | Per spec M6 status: "Docker deployment missing" |
| Cron execution engine | ❌ Not present | Per spec M9: "Data model done / execution missing" |
| Session persistence beyond Supabase | ❌ Not present | All state in Supabase (this is intentional) |
| prisma-records skill | ❌ Not present | Mentioned in spec but not in `skills/` |
| prisma-qualify skill | ❌ Not present | Mentioned in spec for WhatsApp agent |
| prisma-email skill | ❌ Not present | Mentioned in spec for M12 |
| WhatsApp agent config | ❌ Not present | Per spec M7: "Not started" |
| Field management UI | ❌ Not present | Per spec M14: "Not built" |
| Board/kanban view toggle | Partial | Migration exists, spec says "Not built" but commit 0160e77 mentions M15 |

### Skills referenced in spec but missing:

| Skill | Status |
|-------|--------|
| `prisma-database` | ✅ Present |
| `prisma-records` | ❌ Missing |
| `prisma-qualify` | ❌ Missing |
| `prisma-email` | ❌ Missing |
| `prisma-api-fetch` | ✅ Present |
| `prisma-views` | ❌ Missing |
| `prisma-enrich` | ❌ Missing |

---

**End of audit report.**
