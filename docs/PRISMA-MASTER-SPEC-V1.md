# PRISMA V2 — MASTER BUILD SPECIFICATION
**Version:** 1.0 | **Last Updated:** April 13, 2026 | **Owner:** Superwave / DavidSuperwave  
**Repo:** https://github.com/DavidSuperwave/prisma  
**Status:** Active — Single source of truth. Replaces all previous spec documents.

---

## HOW TO USE THIS DOCUMENT

This is the complete, consolidated specification for building Prisma V2. It supersedes:
- `PRISMA-CURSOR-AGENT-CONTEXT-3.txt`
- `PRISMA-V2-BLUEPRINT-4.txt`
- `PRISMA-V2-MULTI-AGENT-SPECS-2.txt`
- `PRISMA-V2-CHANGE-LOG-AND-BUILD-PLAN.txt`
- `PRISMA-MILESTONE-BUILD-PLAN-8.txt`
- `PRISMA-STATUS-ANALYSIS-AND-NEXT-STEPS-9.md`
- `prisma-architecture-update-6.md`
- `prisma-m4-ui-audit-7.md`
- `Prisma-UI-UX-Design-System-Complete-Revision-Specification-5.md`

**For Cursor Agents:** Read this entire document before touching any code. Every decision in here was made deliberately. Do not deviate from architecture decisions without explicit instruction. Do not skip milestones. Do not build features that depend on incomplete prior milestones.

### Each milestone follows this structure:
- **GATE** — what must be confirmed ✅ before this milestone starts
- **PURPOSE** — why this milestone exists and what it unlocks
- **WHAT TO BUILD** — exact deliverables
- **HOW TO TEST** — the exact steps to verify it works
- **PASS CRITERIA** — binary definition of "done"
- **CURSOR TASK LIST** — individual atomic tasks

---

## PART 1: WHY WE'RE BUILDING PRISMA

### What Prisma Is

Prisma is a **multi-tenant agent operations platform** built by Superwave. It delivers branded, AI-powered workspaces to business clients. Each workspace feels custom to the client but runs on shared platform infrastructure.

**The business model:** Superwave charges ~$1,000/month per client workspace. Infrastructure cost per client is $12–25/month (share of a $48 DigitalOcean droplet). Each additional agent beyond the base plan is $200–300/month extra. The economics are strong — but only if the platform actually works.

**The first client:** BBC Factoring — an invoice factoring company in Mexico. They need to track companies, receivables with aging buckets, qualification pipeline, and document collection. Their existing workflow is spreadsheets and WhatsApp. Prisma replaces that with a branded, agent-assisted operating system.

**The internal validator:** Superwave's own lead-to-delivery workflow. If Prisma can manage Superwave's sales and delivery pipeline, it can manage any client's operations.

### What Prisma Is NOT

- Not a self-service SaaS where users sign up themselves
- Not a generic chatbot wrapper
- Not a no-code tool builder
- Not a replacement for every tool a client uses (ClickUp, CRM, email, etc.)

### What Prisma IS

- A configurable business operating system with AI agents
- An orchestration layer that coordinates existing tools
- A workspace where operators manage their business operations
- A platform where AI agents handle repetitive tasks with human oversight

---

## PART 2: WHY WE'RE MAKING CHANGES (The Honest Assessment)

As of April 13, 2026, Prisma is approximately **55–60% complete**. The foundation is solid. The following are confirmed working:

✅ Auth + workspace-scoped JWT (M3)  
✅ All Supabase tables + RLS policies (M1)  
✅ Chat proxy to hErmes with SSE streaming (M4)  
✅ Multi-user session isolation (M5)  
✅ Workspace shell, sidebar, role-based navigation (M3)  
✅ Agent canvas UI and template catalog (partial M6)  
✅ Dashboard home with preset cards (partial)

**The platform has three critical holes that make it feel broken:**

### Hole 1: Records Are Completely Read-Only

The entire "database-first philosophy" means nothing if operators cannot create, edit, or delete records from the UI. Right now the app is a data viewer, not an operating system. There are no API routes for `POST`, `PATCH`, or `DELETE` on the records table. The "agents will handle it" approach does not work as the sole interaction model — you need manual CRUD as a baseline. An agent that creates a record and an operator that needs to correct a mistake both need write access to data.

### Hole 2: The UI/UX Was Never Applied

There is a 41KB design system specification with proper CSS tokens, spacing scales, and screen-by-screen redesigns. CSS module files (`workspace-panels.module.css`, `workspace-shell.module.css`) exist in the repo. But `WorkspacePanels.tsx` — a 2,800-line file — uses inline `React.CSSProperties` on every component. The design system document and the running application are completely disconnected. This is why the UI looks like "code garbage" — it literally is, because the styling layer was never applied.

### Hole 3: Agent Deployment Is Metadata Only

The agent builder form saves configuration to `workspace_agents` in Supabase, but nothing actually starts a Docker container. Agents currently "work" in the demo only because the seed script pre-creates entries pointing to a manually configured hErmes endpoint. For a real launch, we need either automated Docker management or a simple admin form where Superwave inputs the endpoint after manually setting up the container.

### Why We're Redesigning These Things (Not Just Patching)

The philosophy is correct — composable blocks, database-first, agent-driven workspace. The mistake was building metadata layers without building the interaction layer. A ClickUp-style UI was always the reference point (see Part 5), but the implementation went in a different direction. We are not rebuilding from scratch. We are applying the design system that already exists, adding the write capability that was planned from day one, and wiring up the deployment layer that was always required.

---

## PART 3: ARCHITECTURE DECISIONS (LOCKED — DO NOT CHANGE)

### Decision 1: Hybrid Deployment — Vercel + VPS + Supabase

- **Next.js app** deploys to Vercel. Never runs in Docker.
- **hErmes agent containers** run on DigitalOcean VPS via Docker Compose.
- **Supabase** hosted externally, accessed via `@supabase/supabase-js`.
- The web app talks to hErmes over HTTPS — a standard API call through `/api/chat`.
- If hErmes is down, the web app shows "agent unavailable" instead of failing silently.

### Decision 2: hErmes as the Agent Runtime

All AI agents run as hErmes instances (official hErmes documentation). hErmes provides:
- OpenAI-compatible API server (`/v1/chat/completions` and `/v1/responses`)
- Persistent memory (`MEMORY.md`, `USER.md`)
- Skills system for on-demand knowledge (markdown files)
- Built-in cron scheduling
- Messaging gateway (WhatsApp, Email, Telegram, SMS, 10+ platforms)
- Docker as a first-class deployment target

**CRITICAL:** Pin a specific hErmes version tag. Never use `latest`. Tag locally as `prisma-hermes-stable`. Only update after: changelog review → staging test → 48hr production monitor on one client.

### Decision 3: Multi-Agent Architecture — Separate Instances, Not Subagents

Each workspace gets multiple hErmes containers:
- One **copilot** (the CEO agent operators talk to)
- One or more **channel/worker agents** (WhatsApp qualifier, CRM monitor, email agent)
- Each is a separate Docker container with its own SOUL.md, memory, skills, and API key

Agents do NOT talk to each other directly. They communicate through the shared Supabase database. The database IS the communication bus. Every action is logged and auditable.

### Decision 4: Admin-First Onboarding (No Self-Service)

Superwave builds every workspace before the client logs in. There is no public signup page. The admin dashboard is for provisioning and monitoring. Configuration and agent-building happens inside the workspace itself (see Decision 6).

### Decision 5: Database-First with Composable Blocks

Instead of custom dashboards per client, build a database engine with composable primitives: tables, views, agents, dashboards, imports, workflows. The meta-model:
- `workspace_objects` — defines what things exist (Companies, Cases, Leads)
- `workspace_fields` — defines what properties each object has
- `workspace_views` — defines saved filtered/sorted views
- `records` — the actual data rows (JSONB `data` column)

The web app has **no hardcoded column names anywhere**. It renders dynamically from the meta-model. Adding a field in the database causes it to appear in the UI automatically with zero code changes.

### Decision 6: Workspace-First Agent Builder (Not Admin Dashboard)

The agent builder lives inside the client workspace under the Agents section. The admin dashboard is a lightweight control plane for provisioning, monitoring, and billing only. Superwave uses a super-admin credential to log into any workspace and builds it from inside — same as what the client sees.

### Decision 7: ClickUp as the UI/UX Reference

The primary UI/UX reference for Prisma is ClickUp. Specifically:
- **ClickUp Brain** → our dual-mode Chat + Agents sidebar pattern
- **ClickUp Super Agent builder** → our Agent Canvas (Identity, Instructions, Skills, Knowledge, Scheduled, Memory, Activity, Test Chat)
- **ClickUp sidebar** → two-tier primary/secondary navigation (max 7 top-level items)
- **ClickUp views** → table view and board/kanban view side by side
- **ClickUp record cards** → our record detail panels with associated records

This is not about copying ClickUp. It is about applying patterns that users already understand. Every UI/UX decision in this spec uses ClickUp as the reference for "what works."

---

## PART 4: SUPABASE SCHEMA (COMPLETE)

```sql
-- Core workspace tables
TABLE workspaces
  id UUID PK
  name TEXT
  subdomain TEXT UNIQUE   -- 'bbc' for bbc.prisma.com.mx
  logo_url TEXT
  primary_color TEXT
  agent_limit INT DEFAULT 3
  plan_tier TEXT DEFAULT 'base'
  created_at TIMESTAMPTZ
  created_by UUID FK auth.users

TABLE workspace_members
  workspace_id UUID FK
  user_id UUID FK auth.users
  role TEXT   -- 'admin' | 'operator' | 'viewer'
  is_platform_admin BOOLEAN DEFAULT FALSE

TABLE workspace_objects   -- meta-model: what things exist
  id UUID PK
  workspace_id UUID FK
  name TEXT               -- 'Companies'
  singular_name TEXT
  plural_name TEXT
  description TEXT
  icon TEXT
  default_status_field_id UUID nullable
  created_at TIMESTAMPTZ

TABLE workspace_fields    -- meta-model: properties of each object
  id UUID PK
  object_id UUID FK workspace_objects
  workspace_id UUID FK
  name TEXT
  key TEXT                -- snake_case identifier
  type TEXT               -- text|number|currency|date|boolean|select|relation|file|status
  required BOOLEAN
  options JSONB           -- for select: array of allowed values
  default_value TEXT
  sort_order INT

TABLE workspace_views     -- saved filtered/sorted views
  id UUID PK
  workspace_id UUID FK
  object_id UUID FK workspace_objects
  name TEXT
  view_type TEXT DEFAULT 'table'   -- 'table' | 'board' | 'list'
  filters JSONB
  sort_by TEXT
  sort_order TEXT         -- 'asc' | 'desc'
  columns TEXT            -- which fields to display
  group_by_field_id UUID  -- for board view: column grouping
  created_by UUID FK auth.users

TABLE records             -- actual data rows
  id UUID PK
  workspace_id UUID FK
  object_id UUID FK workspace_objects
  data JSONB              -- field values keyed by field.key
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  created_by UUID FK auth.users

TABLE workspace_agents    -- agent registry
  id UUID PK
  workspace_id UUID FK
  name TEXT
  type TEXT               -- 'copilot' | 'channel' | 'worker'
  description TEXT
  container_name TEXT
  api_endpoint TEXT       -- http://hermes-bbc-copilot:8642
  api_key TEXT
  hermes_version TEXT     -- pinned version tag
  status TEXT             -- 'active' | 'paused' | 'deploying' | 'error'
  soul_md TEXT            -- agent instructions → SOUL.md
  skills TEXT             -- comma-separated skill names
  knowledge_scope JSONB
  cron_jobs JSONB         -- [{schedule, prompt, skills, delivery}]
  channel_config JSONB    -- WhatsApp/email/Telegram config
  memory_limit_mb INT DEFAULT 512
  cpu_limit DECIMAL DEFAULT 0.5
  created_at TIMESTAMPTZ
  created_by UUID FK auth.users

TABLE agent_templates     -- admin-managed, globally readable
  id UUID PK
  name TEXT
  description TEXT
  type TEXT
  category TEXT           -- 'lead_qualification' | 'crm' | 'document' | 'email'
  default_soul_md TEXT
  default_skills TEXT
  default_knowledge_scope JSONB
  default_cron_jobs JSONB
  default_channel_config JSONB
  icon TEXT
  is_active BOOLEAN DEFAULT TRUE

TABLE agent_activity      -- audit log of all agent actions
  id BIGSERIAL PK
  agent_id UUID FK workspace_agents
  workspace_id UUID FK
  action TEXT             -- 'qualified_lead' | 'updated_record' | 'sent_email'
  details JSONB
  created_at TIMESTAMPTZ

TABLE agent_events        -- inter-agent communication bus
  id BIGSERIAL PK
  workspace_id UUID FK
  source_agent_id UUID FK nullable
  event_type TEXT         -- 'lead.qualified' | 'case.updated'
  payload JSONB
  processed_by UUID[]     -- which agents have consumed this event
  created_at TIMESTAMPTZ

TABLE workspace_dashboard_cards
  id UUID PK
  workspace_id UUID FK
  title TEXT
  subtitle TEXT
  type TEXT               -- 'metric' | 'table' | 'queue' | 'activity' | 'chart'
  data_source JSONB       -- query config
  sort_order INT
  created_by UUID FK auth.users

-- Email channel config (per agent)
-- Stored in workspace_agents.channel_config JSONB:
-- {
--   "platform": "email",
--   "smtp_host": "smtp.gmail.com",
--   "smtp_port": 587,
--   "smtp_user": "agent@domain.com",
--   "smtp_pass": "app-password",   -- Gmail App Password (OAuth2 not supported in hErmes natively)
--   "imap_host": "imap.gmail.com",
--   "imap_port": 993,
--   "from_name": "BBC Factoring AI"
-- }

-- External API polling config (per agent, stored in cron_jobs JSONB)
-- Example BBC pulling from Close CRM every 15 minutes:
-- [{
--   "schedule": "*/15 * * * *",
--   "prompt": "Pull new contacts from Close CRM API at https://api.close.com/api/v1/contact/?date_updated__gt={last_run}. For each new contact, create a record in the Companies object with fields: name, email, phone. Log results to agent_activity.",
--   "skills": ["prisma-records", "prisma-api-fetch"],
--   "delivery": "none"
-- }]
```

**RLS Policy (applied to every table):**
```sql
USING (workspace_id IN (
  SELECT workspace_id FROM workspace_members
  WHERE user_id = auth.uid()
  OR is_platform_admin = TRUE
))
```

---

## PART 5: UI/UX DESIGN SYSTEM

### Core Design Philosophy

Every UI decision in Prisma follows three principles:

1. **Information hierarchy first.** Not everything deserves equal visual weight. The most important thing on screen should be visually dominant. Secondary info recedes. Tertiary info is accessible but not visible.
2. **Operator efficiency.** The average operator opens Prisma to check their queue, review recent agent activity, or respond to something urgent. Every screen should answer "what needs my attention right now?" within 3 seconds.
3. **ClickUp-inspired composability.** Views, agents, and records are the composable primitives. Everything else is scaffolding around them.

### Design Tokens

```css
/* Color system */
--color-page-bg: #0f1117;           /* outermost background */
--color-surface: #1a1d27;           /* card / panel background */
--color-surface-raised: #22263a;    /* elevated surface (modals, dropdowns) */
--color-border: #2d3144;            /* subtle dividers */
--color-border-active: #4a5080;     /* focused / selected states */
--color-text-primary: #e8eaf0;      /* body text */
--color-text-secondary: #8b91a8;    /* labels, subtitles */
--color-text-muted: #555c7a;        /* placeholder, disabled */
--color-accent: #7c6ff7;            /* primary CTA, active states */
--color-accent-hover: #9b96ff;
--color-success: #34d399;
--color-warning: #fbbf24;
--color-danger: #f87171;
--color-info: #60a5fa;

/* Spacing scale (4px base) */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;

/* Typography */
--font-sans: 'Inter', system-ui, sans-serif;
--text-xs: 11px / 16px;
--text-sm: 13px / 20px;
--text-base: 14px / 22px;
--text-md: 16px / 24px;
--text-lg: 18px / 28px;
--text-xl: 22px / 32px;
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;

/* Border radius */
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
--radius-xl: 12px;
--radius-full: 9999px;

/* Shadows */
--shadow-sm: 0 1px 3px rgba(0,0,0,0.4);
--shadow-md: 0 4px 12px rgba(0,0,0,0.5);
--shadow-lg: 0 8px 32px rgba(0,0,0,0.6);
```

### Sidebar Structure (ClickUp Two-Tier Pattern)

The sidebar has exactly **7 top-level items**. No more. Objects (data tables) are grouped under "Datos" — they do not each get their own sidebar slot.

```
[Workspace Logo + Name]
─────────────────────
🏠  Inicio
💬  Chat
👥  Agentes
📊  Datos          ← expands to show: Companies, Cases, Receivables, etc.
📋  Cola
📁  Documentos
💬  Equipo
─────────────────────
[User avatar + name]
[Settings gear]
```

**Why this structure works:**
- "Chat" and "Agentes" are separate (ClickUp Brain pattern) — prevents one congested chat doing everything
- "Datos" groups all database objects so the sidebar never grows beyond 7 items even as the workspace adds tables
- "Cola" (Queue) surfaces pending actions — the single most urgent operational need
- Bottom controls are always accessible without scrolling

**Sidebar behavior:**
- Active item: `--color-accent` left border + `--color-surface-raised` background
- Hover: `--color-surface-raised` background, no border
- Collapsed state (mobile/narrow): icons only, tooltips on hover
- "Datos" expand/collapse with smooth animation, chevron rotates

### Layout Grids

**Workspace shell:**
```
[Sidebar 220px fixed] | [Main content area flex-1]
```

**Chat panel (when open):**
```
[Sidebar 220px] | [Main content flex-1] | [Chat panel 380px]
```

**Record detail (slide-over):**
```
[Sidebar 220px] | [Record list flex-1] | [Detail panel 460px slide-over]
```

The main content area is always `width: 100%` with `padding: var(--space-6)`. Tables use `width: 100%` — never a fixed pixel width. The 60%-width table bug must be fixed.

### Component Patterns

**Record Table (ClickUp-inspired):**
- Column headers: `var(--text-sm)` `var(--color-text-secondary)` `font-weight-medium`
- No column type labels in headers — clean field names only
- Row height: 40px
- Row hover: `--color-surface-raised` background
- Selected row: `--color-accent` left border
- Status pills: colored dot + label, using semantic colors
- Inline edit on click: cell background changes to `--color-surface-raised`, input appears, confirm on Enter/blur

**Status Pills:**
```
● Activo     → green dot + text on --color-surface-raised background
● Pendiente  → yellow dot
● Bloqueado  → red dot
● Archivado  → muted dot
```

**Cards (Dashboard KPI):**
- Background: `--color-surface`
- Border: `1px solid --color-border`
- Border radius: `--radius-lg`
- Padding: `--space-6`
- Title: `--text-sm --color-text-secondary`
- Value: `--text-xl font-weight-bold --color-text-primary`
- Trend indicator: small `▲ +12%` in green or `▼ -3%` in red

**Buttons:**
- Primary: `--color-accent` background, white text, `--radius-md`
- Secondary: transparent background, `--color-border` border
- Danger: `--color-danger` background
- Ghost: transparent, text only, hover shows subtle background
- All buttons: `--space-2 --space-4` padding (8px 16px)

**Input fields:**
- Background: `--color-surface`
- Border: `1px solid --color-border`
- Focus: border changes to `--color-accent`
- Placeholder: `--color-text-muted`
- Height: 36px for standard, 32px for compact table cells

### Chat Panel Design

The chat panel is **a fixed overlay on the right side**, not a routed page. It stays visible while the operator browses other sections.

```
[Chat panel 380px right side]
  ┌─ Header ─────────────────────────────┐
  │ [Avatar] CEO Copilot    [New] [×]    │
  ├──────────────────────────────────────┤
  │ [Session list — scrollable]          │
  │  ● Sesión de hoy           09:32     │
  │  ○ Análisis de cartera     Apr 11    │
  ├──────────────────────────────────────┤
  │ [Messages — scrollable, fills space] │
  │                                      │
  │   [User message bubble right]        │
  │   [Agent response left]              │
  │   [Streaming cursor...]              │
  │                                      │
  ├──────────────────────────────────────┤
  │ [Input + Send]                       │
  └──────────────────────────────────────┘
```

**Critical structural fix:** The message area must use `flex: 1; overflow-y: auto;` — not a fixed pixel height. The input box must always stick to the bottom. This is the single most impactful structural fix from the M4 audit.

### Agent Canvas (ClickUp Super Agent Builder Pattern)

The agent canvas is a full-page view inside the Agents section. It has tabbed sections:

```
[Agent name + avatar + type badge]
[Status: Active ●] [Test Chat button] [Deploy button]

TABS: Identidad | Instrucciones | Habilidades | Conocimiento | Programado | Memoria | Actividad

--- Instrucciones tab ---
[Rich markdown editor for SOUL.md — full height]

--- Habilidades tab ---
Checkboxes:
☑ prisma-database   Create and modify workspace schema
☑ prisma-records    Read and write workspace records
☐ prisma-qualify    Lead qualification questions
☐ prisma-enrich     Record enrichment and CRM data
☐ prisma-api-fetch  Pull data from external APIs

--- Conocimiento tab ---
[Object list with read/write toggles]
☑ Empresas     [Read ●] [Write ●]
☑ Casos        [Read ●] [Write ○]
☐ Documentos   [Read ○] [Write ○]

--- Programado tab ---
[+ Add cron job]
Each job has: schedule picker | prompt textarea | delivery selector

--- Test Chat ---
[Embedded chat panel connected to this agent's endpoint]
```

### Board/Kanban View (ClickUp Board Pattern)

The board view is a second view mode alongside the table. Triggered by a view toggle in the record list header.

```
[View selector: Table 📋 | Board 📌 | List ≡]

--- Board view ---
[Group by: Status ▼]

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Prospecto   │  │  Calificado  │  │  En revisión │
│  3 registros │  │  7 registros │  │  2 registros │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ [Card]       │  │ [Card]       │  │ [Card]       │
│ Empresa XYZ  │  │ ABC Corp     │  │ MNO SA       │
│ $500K        │  │ $1.2M        │  │ $850K        │
│ ──────────── │  │ ──────────── │  │ ──────────── │
│ [Card]       │  │ [Card]       │  │ [Card]       │
│ ...          │  │ ...          │  │ ...          │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ + Nuevo      │  │ + Nuevo      │  │ + Nuevo      │
└──────────────┘  └──────────────┘  └──────────────┘
```

Cards are draggable between columns. Dropping a card on a column updates the record's status field in Supabase.

### Language

**100% Spanish on all client-facing surfaces.** Zero English labels in the workspace UI. Examples:
- "Queue" → "Cola"
- "Agents" → "Agentes"
- "New Chat" → "Nueva conversación"
- "Save" → "Guardar"
- "Cancel" → "Cancelar"
- Status values: "Activo", "Pausado", "Error", "Desplegando"

English is acceptable only in: code identifiers, API responses, technical error messages in developer console.

---

## PART 6: COMPLETE FEATURE INVENTORY

### Feature 1: Dynamic Record Table (M2 — partial)
**Status:** Read works ✅ | Write missing ❌

Every data table in the workspace renders from the meta-model. No hardcoded schemas. Adding a field in Supabase causes it to auto-appear in the UI.

- Table view with sortable columns, filter bar, text search
- Column headers: field names only (no type labels)
- Full-width table (100% available width)
- **New Record** button: opens slide-over panel with form generated from `workspace_fields`
- Inline cell edit: click any cell to edit in place
- Row delete: right-click context menu or row checkbox + delete button
- Record detail slide-over: full field view with activity timeline

### Feature 2: Board/Kanban View (new — M11b)
**Status:** Not built ❌

Second view mode for any object with a status/stage field. One button toggle.
- Drag cards between columns (updates `records.data[status_field_key]` in Supabase)
- Column grouping by any `select` or `status` type field
- "+ New" button at bottom of each column creates a new record pre-filled with that column's status value
- Card shows: primary display field + 2 secondary fields + status pill

### Feature 3: Field Management UI (new — M14)
**Status:** Not built ❌

Admin users can add, edit, and remove fields from workspace objects through the UI — not just through chat or seed scripts.
- Accessible via a "⚙ Edit fields" button in the record list header (admin only)
- Slide-over panel shows all current fields with type, required flag, sort order
- Add field: name, key (auto-generated), type, options (for select), required toggle
- Delete field: confirmation modal warning about data loss
- Reorder fields: drag handles

### Feature 4: Record Import (M8)
**Status:** Not built ❌

Upload CSV or XLSX files and import them as records.
- File upload component (drag-drop or click)
- Column mapping wizard: match CSV headers to workspace field keys
- Preview: first 5 rows with mapped data
- Validation: required fields, type coercion warnings
- Bulk insert via batched Supabase calls (max 500 rows per batch)
- Import history log in a dedicated section
- Duplicate handling: skip if record with same primary field already exists

### Feature 5: Chat Panel (M4 ✅)
**Status:** Complete — structural fix needed ⚠️

The chat panel is a right-side overlay, not a routed page. Multi-user session isolation via `conversation: user-{userId}-{sessionId}`.

**Remaining fix:** Message container must use `flex: 1; overflow-y: auto;` — remove all fixed pixel heights on the message area. The input must always be pinned to the bottom.

### Feature 6: Agent Canvas (M6 — partial)
**Status:** UI done ✅ | Docker deployment missing ❌

The agent canvas lives inside the workspace Agents section. Full ClickUp-style builder.

**Remaining work:**
1. Manual endpoint registration: an admin form where Superwave inputs the `api_endpoint` URL and `api_key` after manually starting the container
2. Health check ping: a button that calls `GET {endpoint}/health` and shows ✅ or ❌
3. SOUL.md rich markdown editor (replace plain textarea)
4. Visual cron builder (schedule picker: every X minutes/hours/days)
5. Automated Docker deployment (later milestone — not required for v1 launch)

### Feature 7: Agent Templates (M6 — partial ✅)
**Status:** Done ✅

Admin creates templates in `/admin/templates`. Workspace users see the template gallery when creating a new agent. Templates pre-fill the canvas.

### Feature 8: WhatsApp Channel Agent (M7)
**Status:** Not built ❌

Dedicated hErmes container in gateway mode. Paired to a WhatsApp Business number via QR code.
- QR code renders in the agent detail page (agent canvas → Canales tab)
- Baileys bridge handles WhatsApp message routing
- `prisma-qualify` skill teaches the agent to ask qualification questions and write records to Supabase
- Agent isolation: WhatsApp conversations never appear in operator chat sessions

### Feature 9: Email Integration (new — M12)

**Two separate email systems — do not conflate them:**

**System A: hErmes Email Gateway (agent sends/receives email)**
- Configured in `workspace_agents.channel_config` JSONB
- Uses hErmes's built-in email gateway (SMTP/IMAP)
- Gmail requires App Password (not OAuth2 — hErmes does not support OAuth2 natively)
- Configuration: `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `imap_host`, `imap_port`
- The agent can: read incoming emails, reply, draft and send new emails
- Use case: operator says "Draft a rate proposal for BBC Corp and send it to contact@bbccorp.com" → agent drafts → shows preview in chat → operator confirms → agent sends
- UI: Email channel toggle in agent canvas → Canales tab → fields for SMTP/IMAP credentials

**System B: Resend API (transactional email from Next.js app)**
- Used for: user invitations, workspace notifications, billing receipts
- Never for agent-driven email — that is System A
- Install: `npm install resend`
- API key stored in Vercel environment variables as `RESEND_API_KEY`
- Sending domain must be verified in Resend dashboard

**Important:** For agent-to-user email (System A), the human-in-the-loop pattern must be enforced:
1. Agent drafts the email and shows it in the chat panel
2. Operator reviews and approves ("Sí, envíalo")
3. Agent sends and logs to `agent_activity`
4. Agent never sends email autonomously without explicit approval

### Feature 10: Scheduled API Polling / External Data Connectors (new — M13)

Agents can pull data from external APIs on a schedule. This is implemented through the existing cron system — no new infrastructure needed.

**How it works:**
1. Add a `prisma-api-fetch` skill that teaches the agent how to make HTTP GET requests and map responses to record fields
2. Configure a cron job in the agent canvas with a schedule, a prompt describing what to pull and where to store it, and `prisma-api-fetch` + `prisma-records` skills

**Example — Close CRM sync every 15 minutes:**
```json
{
  "schedule": "*/15 * * * *",
  "prompt": "Pull new and updated contacts from Close CRM at https://api.close.com/api/v1/contact/?date_updated__gt={last_run}. Use Bearer token from CLOSE_API_KEY env var. For each contact: create or update a record in workspace_objects named Empresas with fields: name (contact.name), email (contact.emails[0].email), phone (contact.phones[0].phone). Log count of records created/updated to agent_activity.",
  "skills": ["prisma-records", "prisma-api-fetch"],
  "delivery": "none"
}
```

**Env vars for external APIs** are stored in the container's Docker Compose environment section, not in Supabase. The agent reads them from the container environment.

**Skill file needed:**
- `skills/prisma-api-fetch/SKILL.md` — teaches the agent how to use `fetch()` via hErmes execute-code, handle pagination, map fields, handle errors, and store `last_run` timestamp in agent memory

### Feature 11: Dashboard Home (partial)
**Status:** Preset cards work ✅ | Composable drag-drop missing ❌

For v1: preset-driven dashboard. Agent can modify cards through conversation. No drag-drop.

Dashboard card types (all must render correctly):
- `metric` — KPI number with trend indicator
- `queue` — pending action items list
- `activity` — chronological agent activity feed
- `table` — mini record list (top 5–10 rows of a view)
- `chart` — bar/line chart from aggregated record data (v1.1)

Card editor (admin only): title, subtitle, type, data source query. No drag-drop for v1.

### Feature 12: Activity Feed (M9 — partial)
**Status:** Renders basic list ✅ | Filters missing ❌ | Real cron execution missing ❌

Activity feed shows all agent actions from `agent_activity` table.
- Filters: by agent, by action type, by date range
- Timeline format: agent avatar + action label + details summary + timestamp
- Human-readable action labels: "Calificó lead: ABC Corp" not raw JSON
- Real-time: Supabase realtime subscription for live updates

### Feature 13: Data Import (M8)
See Feature 4 above.

### Feature 14: Team Chat (M5 — complete with gaps)
**Status:** Basic functionality ✅ | Missing: threads, @mentions, notifications ❌

For v1, team chat ships with:
- Channels + DMs (done)
- @mention resolution to actual workspace users (must add)
- Record preview cards in messages (paste a record URL → auto-unfurl to mini card)
- Search (Supabase FTS on message content)

Threads and read receipts deferred to v1.1.

### Feature 15: Admin Dashboard
**Status:** Provisioning shell works ✅ | Health monitoring partial ❌

Admin dashboard responsibilities (only these — no agent builder here):
1. Workspace list with status, agent count, plan tier
2. Workspace creator: name, logo, subdomain, agent limit, plan tier
3. Agent inventory: all agents across all workspaces, status indicators, pause/resume
4. Container health: health check display, resource usage, last activity
5. Template library: CRUD for agent templates
6. Billing overview: workspace count, agent count, revenue per client

---

## PART 7: PAGES COMPLETE LIST

### Admin Dashboard (admin.prisma.com.mx)
| Route | Page | Status |
|-------|------|--------|
| `/admin` | Overview: workspace count, agents, health | Partial |
| `/admin/clients` | Workspace list with plan tier, status | Partial |
| `/admin/deployments` | Container health, restart controls | Partial |
| `/admin/templates` | Agent template CRUD | ✅ Done |
| `/admin/usage` | Event stream, billing counters | Not built |

### Client Workspace (clientname.prisma.com.mx)
| Route | Page | Status |
|-------|------|--------|
| `/workspace/[slug]` | Home dashboard (KPI cards, queue, activity) | Partial |
| `/workspace/[slug]?tab=chat` | Chat panel + session list | ✅ Done |
| `/workspace/[slug]?tab=agents` | Agent list + canvas | Partial |
| `/workspace/[slug]?tab=data&object=[id]` | Record list (table or board view) | Partial |
| `/workspace/[slug]?tab=data&object=[id]&record=[id]` | Record detail slide-over | Partial |
| `/workspace/[slug]?tab=queue` | Pending action items | Partial |
| `/workspace/[slug]?tab=documents` | Document library | Partial |
| `/workspace/[slug]?tab=team` | Team chat | Partial |
| `/workspace/[slug]?settings` | Team, workspace config, branding | Partial |
| `/workspace/[slug]?tab=import` | Data import wizard | Not built |

---

## PART 8: DOCKER ARCHITECTURE

### Per-Workspace Container Setup

```yaml
# docker-compose.bbc.yml — BBC Factoring workspace
version: "3.8"
services:

  hermes-bbc-copilot:
    image: prisma-hermes-stable          # NEVER use :latest
    container_name: hermes-bbc-copilot
    restart: unless-stopped
    networks: [bbc-internal]
    volumes:
      - bbc-copilot-data:/opt/hermes
      - ./skills/prisma-core:/opt/hermes/skills/prisma-core:ro
      - ./skills/prisma-database:/opt/hermes/skills/prisma-database:ro
      - ./skills/prisma-records:/opt/hermes/skills/prisma-records:ro
      - ./souls/bbc-copilot-SOUL.md:/opt/hermes/SOUL.md:ro
    environment:
      - API_SERVER_ENABLED=true
      - API_SERVER_KEY=${BBC_COPILOT_API_KEY}
      - API_SERVER_HOST=0.0.0.0
      - API_SERVER_PORT=8642
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "0.5"
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://127.0.0.1:8642/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  hermes-bbc-whatsapp:
    image: prisma-hermes-stable
    container_name: hermes-bbc-whatsapp
    networks: [bbc-internal]
    volumes:
      - bbc-whatsapp-data:/opt/hermes
      - ./skills/prisma-records:/opt/hermes/skills/prisma-records:ro
      - ./skills/prisma-qualify:/opt/hermes/skills/prisma-qualify:ro
      - ./souls/bbc-whatsapp-SOUL.md:/opt/hermes/SOUL.md:ro
    environment:
      - API_SERVER_ENABLED=true
      - API_SERVER_KEY=${BBC_WHATSAPP_API_KEY}
      - WHATSAPP_ENABLED=true
      - WHATSAPP_MODE=bot
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
    deploy:
      resources:
        limits:
          memory: 384M
          cpus: "0.3"

networks:
  bbc-internal:
    internal: true   # NO external access except through Caddy

volumes:
  bbc-copilot-data:
  bbc-whatsapp-data:
```

### Caddy Reverse Proxy
```
hermes-bbc.prisma.com.mx {
  route /copilot/* {
    uri strip_prefix /copilot
    reverse_proxy hermes-bbc-copilot:8642
  }
  route /whatsapp-api/* {
    uri strip_prefix /whatsapp-api
    reverse_proxy hermes-bbc-whatsapp:8642
  }
  route /health {
    respond "OK" 200
  }
}
```

---

## PART 9: DEPENDENCY MAP (WHAT BLOCKS WHAT)

```
GATE ZERO: hErmes Running on VPS
    ↓ blocks everything agent-related

M0 ──── Code complete. Runtime NOT confirmed.
    ↓ confirms architecture before building
M1 ──── ✅ Done (database + RLS)
    ↓
M2 ──── ⚠️ Read done / Write MISSING ←── CURRENT BLOCKER
    ↓                    ↗
M3 ──── ✅ Done (auth + shell)        [PARALLEL OK with M2]
    ↓
M4 ──── ✅ Done (chat proxy + SSE)
    ↓
M5 ──── ✅ Done (multi-user sessions)
    ↓
M6 ──── ⚠️ UI done / Docker MISSING ←── SECOND BLOCKER
    ↓
M7 ──── ❌ Not started (WhatsApp agent)     Requires M6
M8 ──── ❌ Not started (data import)        Requires M2 write [PARALLEL OK with M7]
M9 ──── ⚠️ Data model done / Cron MISSING  Requires M6
    ↓
M11 ─── ❌ Not applied (UI/UX overhaul)    Can run PARALLEL with M7/M8/M9
M12 ─── ❌ Not built (email integration)   Requires M6 (agent canvas channels tab)
M13 ─── ❌ Not built (API polling)         Requires M9 (cron execution)
M14 ─── ❌ Not built (field management)    Requires M2 write
M15 ─── ❌ Not built (board view)          Requires M2 write
    ↓
M10 ─── ⚠️ Demo only / Not launchable     Requires ALL above
```

**Rule:** If a milestone has a ❌ or ⚠️ in its GATE section, do not start it.

---

## PART 10: MILESTONE SPECIFICATIONS

---

### M0 — VALIDATION TEST
**Duration:** 3–4 days  
**GATE:** None — this is the first step  
**Status:** Code complete. Runtime not confirmed. Must re-run test.

**PURPOSE:**  
Prove the core architecture works before building anything else. Everything in the platform depends on hErmes talking to Supabase and creating/modifying workspace schema through conversation. If this fails, fix the foundation before touching UI.

**WHAT TO BUILD:**
- Deploy one hErmes instance on VPS inside Docker
- Write `skills/prisma-database/SKILL.md` — teaches agent to `INSERT` into `workspace_objects` and `workspace_fields` via Supabase REST API
- Write `skills/prisma-records/SKILL.md` — teaches agent to CRUD on `records` table
- Connect hErmes to Supabase using the service key
- Write a basic copilot `SOUL.md`

**HOW TO TEST:**
1. SSH into the VPS
2. `curl <hermes-health-url>/health` → Expected: `{"status": "ok"}`
3. Send via curl:
   ```
   POST /v1/chat/completions
   "Create a Companies table with fields: name (text, required), industry (text), annual_sales (currency), status (select: active/inactive)"
   ```
4. Check Supabase: does `workspace_objects` have a "Companies" row?
5. Does `workspace_fields` have 4 rows linked to that object?
6. Send: "Show me all Companies" — does the agent query `records`?
7. Send: "Add a company called Acme Corp, industry: manufacturing" — does a record appear in Supabase?

**PASS CRITERIA:**
- [ ] hErmes container runs stable for 1 hour (no crashes)
- [ ] Agent creates `workspace_objects` and `workspace_fields` rows through conversation
- [ ] Agent queries `records` from Supabase through conversation
- [ ] Agent creates a `records` row through conversation
- [ ] Round-trip latency under 10 seconds

**CURSOR TASK LIST:**
- [ ] Set up VPS with Docker and Docker Compose
- [ ] Create `docker-compose.dev.yml` with one hErmes container
- [ ] Write `skills/prisma-database/SKILL.md`
- [ ] Write `skills/prisma-records/SKILL.md`
- [ ] Write `souls/copilot-SOUL.md` (basic instructions)
- [ ] Test: create table via conversation, verify in Supabase
- [ ] Test: query records via conversation
- [ ] Test: create record via conversation, verify in Supabase
- [ ] Document results in `docs/m0-validation-report.md`

**UNLOCK:** M0 ✅ → M4, M6, M7, M9 can proceed with real agent runtime

---

### M1 — DATABASE FOUNDATION
**Duration:** 2 days  
**GATE:** None (code complete ✅)  
**Status:** ✅ COMPLETE — no action needed

Migration files verified:
- `20260411_000001_m1_foundation.sql` ✅
- `20260411_000002_m1_rls.sql` ✅
- `20260412_add_workspace_limits.sql` ✅
- `20260412_m5_dashboard_and_agent_templates.sql` ✅

---

### M2 — RECORD CRUD (Write Layer)
**Duration:** 2–3 days  
**GATE:** M1 ✅  
**Status:** ❌ READ WORKS / WRITE MISSING — this is the #1 blocker

**PURPOSE:**  
The platform is a read-only viewer without this. Every operator workflow depends on being able to create, edit, and delete records. This is not optional.

**WHAT TO BUILD:**
1. **API Routes** — `app/api/workspaces/[slug]/records/route.ts`
   - `POST /api/workspaces/[slug]/records` — create a new record
   - `PATCH /api/workspaces/[slug]/records/[id]` — update a record's `data` JSONB
   - `DELETE /api/workspaces/[slug]/records/[id]` — delete a record
   - All routes: auth check + workspace membership check + RLS

2. **New Record Button** — in `DatasetPanel` header, visible to `admin` and `operator` roles
   - Opens a slide-over panel
   - Panel renders a form with one input per field from `workspace_fields`
   - Field types render correctly: text input, number input, date picker, select dropdown, checkbox
   - "Guardar" submits to `POST /api/workspaces/[slug]/records`
   - On success: table refreshes, slide-over closes

3. **Inline Cell Edit** — click any non-header table cell
   - Cell background changes to `--color-surface-raised`
   - Appropriate input renders (text input, select dropdown, date picker)
   - Enter or blur: saves via `PATCH /api/workspaces/[slug]/records/[id]`
   - Escape: cancels edit, reverts to display value
   - Optimistic UI update (update local state immediately, revert on error)

4. **Record Delete** — right-click row → context menu with "Eliminar"
   - Confirmation modal: "¿Eliminar este registro? Esta acción no se puede deshacer."
   - On confirm: `DELETE /api/workspaces/[slug]/records/[id]`
   - Row removes from table with fade-out animation

5. **Record Detail Slide-Over** — click row to open full detail
   - Shows all fields with labels and current values
   - Edit mode toggle (pencil icon)
   - In edit mode: all fields become editable inputs
   - Activity timeline at bottom: recent `agent_activity` rows for this record

**HOW TO TEST:**
1. Open any workspace with the Companies object
2. Click "Nuevo registro" → form appears with correct fields
3. Fill in: name="Test Corp", industry="Technology", status="active"
4. Click "Guardar" → row appears in table without page reload
5. Click the "industry" cell of the new row → inline input appears
6. Change to "Finance", press Enter → cell updates immediately
7. Reload page → "Finance" persists (confirm in Supabase)
8. Add a new field to `workspace_fields` in Supabase (e.g., "website" type text)
9. Reload → new column appears in table header AND in new record form
10. Right-click the test row → "Eliminar" → confirm → row disappears

**PASS CRITERIA:**
- [ ] `POST /api/workspaces/[slug]/records` creates a record in Supabase
- [ ] `PATCH /api/workspaces/[slug]/records/[id]` updates `data` JSONB correctly
- [ ] `DELETE /api/workspaces/[slug]/records/[id]` removes the record
- [ ] New record form generates fields from `workspace_fields` (no hardcoded fields)
- [ ] Inline edit saves and persists after page reload
- [ ] New field added to meta-model auto-appears in new record form
- [ ] Unauthorized users (wrong workspace) get 403

**CURSOR TASK LIST:**
- [ ] Create `app/api/workspaces/[slug]/records/route.ts` with POST handler
- [ ] Add PATCH handler to `app/api/workspaces/[slug]/records/[id]/route.ts`
- [ ] Add DELETE handler to `app/api/workspaces/[slug]/records/[id]/route.ts`
- [ ] Add workspace membership auth check to all three routes
- [ ] Build `NewRecordPanel` slide-over component (form from meta-model)
- [ ] Build field type renderers for form: text, number, currency, date, select, boolean
- [ ] Add "Nuevo registro" button to `DatasetPanel` header
- [ ] Implement inline cell editing in table rows
- [ ] Implement optimistic UI update on cell edit
- [ ] Add row right-click context menu with "Eliminar" option
- [ ] Build delete confirmation modal
- [ ] Build `RecordDetailPanel` slide-over with edit mode
- [ ] Add activity timeline to `RecordDetailPanel`
- [ ] Fix table width to use 100% available space
- [ ] Test: create, edit, delete record — verify in Supabase
- [ ] Test: add field to meta-model, verify it appears in form

**UNLOCK:** M2 ✅ → M8 (data import), M14 (field management), M15 (board view) can proceed

---

### M3 — AUTH + WORKSPACE SHELL
**Duration:** Complete ✅  
**Status:** ✅ COMPLETE — no action needed

---

### M4 — CHAT PANEL + /api/chat PROXY
**Duration:** Complete with one structural fix needed  
**Status:** ✅ COMPLETE (one fix)

**REMAINING FIX:**
- [ ] Change message area from fixed pixel height to `flex: 1; overflow-y: auto;`
- [ ] Ensure input box always sticks to the bottom using `flex-shrink: 0`
- [ ] Verify the fix works in both chat panel overlay AND full-screen chat mode

---

### M5 — MULTI-USER SESSIONS
**Status:** ✅ COMPLETE — no action needed

---

### M6 — AGENT DEPLOYMENT (Manual v1)
**Duration:** 1–2 days  
**GATE:** M4 ✅, M1 ✅, M0 ✅  
**Status:** ⚠️ UI exists / Docker deployment missing

**PURPOSE:**  
For v1 launch, Superwave manually deploys hErmes containers on the VPS. The workspace UI records the endpoint and monitors health. Automated Docker deployment comes later.

**WHAT TO BUILD:**

1. **Manual Endpoint Registration Form** — in agent canvas, "Despliegue" tab
   - Fields: `api_endpoint` (URL input), `api_key` (password input), `container_name` (text)
   - Save button → `PATCH /api/workspaces/[slug]/agents/[id]`
   - Only visible to `admin` role users

2. **Health Check Ping** — "Verificar conexión" button in deployment tab
   - Calls `GET {api_endpoint}/health` via Next.js proxy (not directly from browser)
   - Shows ✅ "Agente en línea" or ❌ "No se puede conectar"
   - Updates `workspace_agents.status` based on result

3. **Agent Status Display** — in agent list panel
   - Status indicator dot: green (active), yellow (deploying), red (error), grey (paused)
   - Last health check timestamp
   - "Pausar" / "Reanudar" toggle (updates `status` field — does not stop container)

4. **Agent Canvas Remaining Fixes:**
   - Replace plain `<textarea>` for SOUL.md with a markdown editor (use `@uiw/react-md-editor` or CodeMirror)
   - Cron builder: replace raw JSON input with UI builder (schedule expression + description + test button)
   - Skills: replace text input with checkbox list from available skills manifest

**HOW TO TEST:**
1. Create a new agent from template in workspace
2. Go to "Despliegue" tab
3. Enter the real hErmes endpoint URL and API key
4. Click "Verificar conexión" → should show ✅
5. Check `workspace_agents` in Supabase → `status = 'active'`, `api_endpoint` populated
6. Click on the agent in the sidebar → chat opens, routes to the correct endpoint
7. Send "Hola" → agent responds (confirming correct routing)

**PASS CRITERIA:**
- [ ] Admin can input `api_endpoint` and `api_key` via form
- [ ] Health check pings the endpoint and displays result
- [ ] `workspace_agents.status` updates based on health check
- [ ] Agent chat routes to the registered endpoint
- [ ] Agent list shows status indicators with last health check time
- [ ] SOUL.md editor renders markdown correctly

**CURSOR TASK LIST:**
- [ ] Add "Despliegue" tab to agent canvas
- [ ] Build endpoint/key input form in deployment tab
- [ ] Build health check button → Next.js proxy route → show result
- [ ] Update agent list panel to show status dots + last check time
- [ ] Replace SOUL.md textarea with markdown editor
- [ ] Replace raw cron JSON with visual cron builder component
- [ ] Replace skills text input with checkbox list
- [ ] Test: register endpoint, verify health check, verify routing

**UNLOCK:** M6 ✅ → M7 (WhatsApp), M9 (cron execution), M12 (email agent) can proceed

---

### M7 — WHATSAPP CHANNEL AGENT
**Duration:** 2–3 days  
**GATE:** M6 ✅, M0 ✅ (hErmes running with gateway capability)  
**Status:** ❌ Not started

**PURPOSE:**  
First external-facing agent. Proves the multi-agent architecture end-to-end: external person → WhatsApp → hErmes container → Supabase record → visible in workspace.

**WHAT TO BUILD:**
1. WhatsApp agent Docker container configuration (separate from copilot)
2. QR pairing UI in agent canvas → "Canales" tab → WhatsApp section → shows QR code from hErmes gateway
3. `skills/prisma-qualify/SKILL.md` — qualification conversation logic
4. WhatsApp agent SOUL.md template (qualification specialist)
5. Lead record creation flow: conversation complete → `prisma-qualify` skill writes to `records` table

**HOW TO TEST:**
1. Deploy WhatsApp agent container (manually via SSH)
2. Register endpoint in agent canvas → Canales tab
3. QR code appears → scan with test WhatsApp number
4. Send WhatsApp message to bot number from a real phone
5. Agent responds with qualification questions
6. Complete the qualification conversation
7. Check Supabase `records` table → new lead record with qualification data
8. Open workspace copilot → ask "¿Qué nuevos leads entraron hoy?"
9. Copilot surfaces the WhatsApp lead
10. Verify WhatsApp conversation does NOT appear in operator chat sessions

**PASS CRITERIA:**
- [ ] WhatsApp agent receives and responds to messages
- [ ] Qualification conversation follows SOUL.md instructions
- [ ] Lead records created in Supabase with correct field mapping
- [ ] Copilot can query leads created by WhatsApp agent
- [ ] Session isolation: WhatsApp conversations never appear in operator chat

**CURSOR TASK LIST:**
- [ ] Create WhatsApp agent template in admin template library
- [ ] Add "Canales" tab to agent canvas
- [ ] Build WhatsApp channel config section (phone number, QR display)
- [ ] Implement QR code polling from hErmes gateway status endpoint
- [ ] Write `skills/prisma-qualify/SKILL.md`
- [ ] Write WhatsApp agent SOUL.md template
- [ ] Test: send WhatsApp message, verify agent responds
- [ ] Test: complete qualification, verify record in Supabase
- [ ] Test: ask copilot about new leads, verify it finds WhatsApp lead

---

### M8 — DATA IMPORT
**Duration:** 2 days  
**GATE:** M2 ✅ (write API must exist before import can insert records)  
**Status:** ❌ Not started — can run PARALLEL with M7

**PURPOSE:**  
BBC needs to load historical receivables data from Excel sheets before the workspace is useful to them.

**WHAT TO BUILD:**
1. File upload component (CSV + XLSX, drag-drop + click)
2. Column mapping wizard: match CSV headers → `workspace_fields` keys
3. Import preview: first 5 rows with mapped data + type validation warnings
4. Bulk insert pipeline: batch inserts via the record POST API (max 500/batch)
5. Duplicate handling: skip if record with matching primary field already exists
6. Import history log: date, file name, rows imported, rows skipped, errors

**HOW TO TEST:**
1. Create "Receivables" object with fields: client_name, credit_days, currency, total_amount, aging_bucket
2. Upload a CSV with columns: Name, Days, Currency, Total, Status
3. Column mapping wizard appears → map Name→client_name, Days→credit_days, etc.
4. Preview shows first 5 rows with mapped columns and any warnings
5. Click "Importar" → loading indicator → success message
6. Open record list → all imported rows visible with correct data
7. Upload same file again → "47 registros omitidos (duplicados), 0 nuevos"
8. Upload XLSX with 500+ rows → import completes without timeout

**PASS CRITERIA:**
- [ ] CSV and XLSX files parse correctly
- [ ] Column mapping works for any combination of field names
- [ ] Preview shows correct data with type warnings
- [ ] Imported records appear in dynamic view correctly
- [ ] 500+ row file imports without timeout
- [ ] Duplicate records skipped (not duplicated)
- [ ] Import history log records each import

**CURSOR TASK LIST:**
- [ ] Install `xlsx` npm package for Excel parsing
- [ ] Build file upload component (CSV + XLSX, drag-drop)
- [ ] Build column mapping wizard (dropdown match per column)
- [ ] Build import preview (first 5 rows, type warning badges)
- [ ] Build bulk insert pipeline (batched POST calls to records API)
- [ ] Build duplicate detection (query for existing records by primary field)
- [ ] Build import history log component
- [ ] Add import page route `/workspace/[slug]?tab=import`
- [ ] Test: upload CSV 50 rows, verify all import correctly
- [ ] Test: upload same CSV again, verify duplicates skipped
- [ ] Test: upload XLSX 500+ rows, verify completes

---

### M9 — CRON EXECUTION + ACTIVITY FEED
**Duration:** 2 days  
**GATE:** M6 ✅ (agent deployment — cron is per agent), M0 ✅  
**Status:** ⚠️ Data model done / execution missing

**PURPOSE:**  
Scheduled tasks are the operational intelligence layer. Without cron execution, agents cannot run rate analysis, CRM monitoring, or data sync jobs. The activity feed turns agent actions into an operator-visible audit trail.

**WHAT TO BUILD:**
1. **Cron execution bridge:** when an agent is deployed (M6), the cron jobs defined in `workspace_agents.cron_jobs` JSONB are registered with the hErmes container via `POST {endpoint}/v1/cron` (hErmes cron API)
2. **Cron overlap prevention:** hErmes handles this natively — confirm the `lock` option is set in the cron job config
3. **Activity feed filters:** by agent (dropdown), by action type (multi-select), by date range (date picker)
4. **Human-readable activity labels:** map raw `action` strings to Spanish display labels
5. **Real-time updates:** Supabase realtime subscription on `agent_activity` — new rows appear without page refresh
6. **Agent event bus polling:** on agent startup and during cron runs, agents query `agent_events WHERE NOT processed_by @> ARRAY[agent_id]`

**HOW TO TEST:**
1. Create an agent with cron: "every 2 minutes" → prompt: "Count qualified leads in the last 24 hours and log the result"
2. Deploy agent (M6 flow)
3. Wait 2 minutes
4. Check `agent_activity` → new row with lead count
5. Open activity feed in UI → action appears in real time
6. Wait another 2 minutes → second entry appears
7. Filter by this agent → only this agent's actions show
8. Filter by date range → narrows correctly
9. Verify no duplicate entries within same 2-minute window (lock works)

**PASS CRITERIA:**
- [ ] Cron jobs register with hErmes on agent deploy
- [ ] Cron executes on schedule
- [ ] Results written to `agent_activity`
- [ ] Activity feed renders actions in real time
- [ ] Filters work: by agent, by type, by date range
- [ ] No duplicate cron executions within same window

**CURSOR TASK LIST:**
- [ ] Add cron registration call to agent deploy flow (POST to hErmes cron API)
- [ ] Verify cron lock option in hErmes cron config
- [ ] Build activity feed filter bar (agent dropdown + type multi-select + date range)
- [ ] Build action label mapping (raw string → Spanish display label)
- [ ] Add Supabase realtime subscription to activity feed component
- [ ] Implement `agent_events` polling in `prisma-records` skill
- [ ] Test: deploy cron agent, verify execution on schedule
- [ ] Test: verify real-time updates in activity feed UI
- [ ] Test: verify filters narrow results correctly

---

### M10 — BBC LAUNCH
**Duration:** 3–4 days  
**GATE:** M0 ✅, M2 ✅, M6 ✅, M7 ✅, M8 ✅, M9 ✅, M11 ✅  
**Status:** ⚠️ Demo scaffolding only — not launchable

**PURPOSE:**  
This is the assembly milestone. Every piece has been tested individually. Now they come together as a real product for a real client. This is the product.

**WHAT TO BUILD:**
1. BBC workspace configuration via copilot (objects, fields, views, agents)
2. BBC data import (receivables, financial history from Excel)
3. BBC-specific saved views (receivables with aging buckets, case pipeline)
4. BBC WhatsApp qualifier agent deployment + QR pairing
5. BBC CRM monitor agent (cron-based enrichment every 30 minutes)
6. Rate intelligence cron job (monthly seasonal analysis on 1st of month)
7. BBC branding (logo, colors, subdomain `bbc.prisma.com.mx`)
8. BBC user accounts (George, Maria, Carlos)
9. End-to-end flow testing (14-step scenario below)

**HOW TO TEST (14-step E2E scenario):**
1. Login as George at `bbc.prisma.com.mx`
2. See BBC logo, branded workspace, BBC-specific views
3. Dashboard shows: open cases, new leads, agent activity
4. Open Chat → ask: "Muéstrame todas las empresas con cartera vencida mayor a $500K"
5. Copilot returns filtered results from BBC's imported receivables data
6. Send a WhatsApp message to BBC's bot number from a test phone
7. WhatsApp agent qualifies the lead
8. Switch to Maria's login → ask copilot: "¿Qué nuevos leads entraron hoy?"
9. Maria sees the lead qualified via WhatsApp (same database, separate chat)
10. Check activity feed → shows WhatsApp agent's qualification action in real time
11. Verify cron jobs scheduled: CRM monitor every 30min, rate analysis monthly
12. Manually trigger rate analysis cron → pending offers created in `records`
13. Review pending offers in workspace → approve one
14. Approved offer logged in `agent_activity`

**PASS CRITERIA:**
- [ ] BBC workspace looks and feels like a custom product
- [ ] All BBC objects (Companies, Cases, Receivables, Docs) render correctly
- [ ] WhatsApp qualification creates lead records visible in workspace
- [ ] Multiple team members have isolated chat sessions
- [ ] Cron jobs execute on schedule
- [ ] Activity feed shows complete audit trail
- [ ] Rate intelligence produces reviewable recommendations
- [ ] No cross-workspace data leakage (verify with a second test workspace)

**CURSOR TASK LIST:**
- [ ] Run seed script with real Supabase + hErmes credentials for BBC workspace
- [ ] Build BBC workspace objects via copilot conversation
- [ ] Import BBC sample receivables data (CSV import — M8)
- [ ] Create BBC-specific saved views (receivables aging, case pipeline)
- [ ] Deploy BBC WhatsApp qualifier agent (M7)
- [ ] Deploy BBC CRM monitor agent
- [ ] Configure rate intelligence cron job
- [ ] Apply BBC branding (logo upload, primary color, subdomain in Caddy)
- [ ] Create BBC user accounts: George (admin), Maria (operator), Carlos (viewer)
- [ ] Run full 14-step E2E test scenario
- [ ] Fix any issues found
- [ ] Write operator walkthrough doc for BBC team handoff

---

### M11 — UI/UX OVERHAUL
**Duration:** 3–4 days  
**GATE:** M2 ✅ (write layer must exist so overhaul includes new record forms)  
**Status:** ❌ Design system exists — not applied  
**Can run PARALLEL with M7, M8, M9**

**PURPOSE:**  
Apply the design system that already exists. This is not a redesign — the CSS module files and design tokens are already written. The components just don't use them. This milestone connects the design system to the components. The result transforms "code garbage" into a product that feels intentional.

**WHAT TO BUILD:**

1. **CSS Modules refactor** — `WorkspacePanels.tsx` (2,800 lines) must be split and refactored
   - Split into individual component files (one file per panel)
   - Each component imports from its CSS module (already exists)
   - Remove all inline `React.CSSProperties` — replace with CSS module class names
   - Apply design tokens from `--color-*`, `--space-*`, `--text-*` variables

2. **Sidebar fix**
   - Cap at 7 top-level items
   - Group workspace objects under expandable "Datos" section
   - Active state: `--color-accent` left border
   - Hover state: `--color-surface-raised`
   - Bottom controls pinned to sidebar bottom

3. **Table improvements**
   - Full-width table (`width: 100%`, no fixed pixel widths)
   - Remove column type labels from headers (show field name only)
   - Row height: 40px
   - Consistent status pill styles
   - Sort indicator in column headers

4. **Dashboard visual hierarchy**
   - KPI cards: larger number, smaller label, trend indicator
   - Section headers with proper `--text-md font-weight-semibold`
   - Primary action area (Queue) visually distinct from secondary sections

5. **Chat panel structural fix**
   - Message area: `flex: 1; overflow-y: auto;`
   - Input bar: `flex-shrink: 0` pinned to bottom
   - Session list: scrollable list, not fixed height

6. **Language consistency**
   - Audit every visible string in the workspace UI
   - Replace all English labels with Spanish equivalents
   - Status values: Activo, Pausado, Pendiente, En revisión, Completado, Error

7. **Empty states**
   - Every panel that can be empty must have a proper empty state
   - Illustration or icon + heading + subtext + optional CTA button
   - Example: "No hay registros" with "+ Nuevo registro" button

**HOW TO TEST:**
1. Open workspace → sidebar shows exactly 7 items
2. Click "Datos" → expands to show object list
3. Open Companies record list → table uses full available width
4. Column headers show field names only (no "text", "currency" type labels)
5. Chat panel → message area scrolls internally, input stays pinned to bottom
6. Send 20 messages → input stays at bottom, messages scroll up behind it
7. Open Home dashboard → KPI cards are visually dominant, queue section is secondary
8. Inspect all visible text → zero English labels in workspace UI

**PASS CRITERIA:**
- [ ] Zero inline `React.CSSProperties` in workspace panel components
- [ ] All components use CSS module class names referencing design tokens
- [ ] Sidebar has exactly 7 top-level items
- [ ] Tables use 100% available width
- [ ] Column headers show field names only
- [ ] Chat input always pinned to bottom regardless of message count
- [ ] Zero English labels visible to workspace users

**CURSOR TASK LIST:**
- [ ] Split `WorkspacePanels.tsx` into individual component files
- [ ] Refactor `DatasetPanel` to use `workspace-panels.module.css`
- [ ] Refactor `ChatPanel` to use CSS module (fix flex layout)
- [ ] Refactor `HomePanel` to use CSS module (fix card hierarchy)
- [ ] Refactor `AgentOverviewPanel` to use CSS module
- [ ] Refactor `TeamChatPanel` to use CSS module
- [ ] Fix sidebar: cap to 7 items, add "Datos" group with expand/collapse
- [ ] Fix table width to 100%
- [ ] Remove type labels from column headers
- [ ] Apply consistent status pill styles across all panels
- [ ] Audit and replace all English labels with Spanish
- [ ] Build empty state components for each panel
- [ ] Test: inspect all inline styles — should be zero

---

### M12 — EMAIL INTEGRATION
**Duration:** 2 days  
**GATE:** M6 ✅ (agent canvas with channels tab must exist)  
**Status:** ❌ Not built

**PURPOSE:**  
Operators can instruct agents to draft and send emails. BBC needs this for sending rate proposals to companies. The human-in-the-loop approval gate is non-negotiable — agents never send email autonomously.

**WHAT TO BUILD:**

1. **hErmes Email Gateway config** — in agent canvas → "Canales" tab → Email section
   - Fields: SMTP host/port, SMTP username, SMTP password (App Password for Gmail), IMAP host/port, From name
   - Stored in `workspace_agents.channel_config` JSONB
   - Test connection button → sends a test email to the Superwave admin address

2. **Email skill** — `skills/prisma-email/SKILL.md`
   - Teaches agent how to draft email content
   - Teaches agent to ALWAYS show a preview in chat before sending
   - Teaches agent to wait for explicit operator approval ("sí, envíalo" or "confirmar")
   - After approval: sends via hErmes email gateway
   - Logs sent email to `agent_activity` with recipient, subject, timestamp

3. **Email preview card in chat**
   - When agent prepares an email, it renders a special card in the chat panel (not a plain text message)
   - Card shows: To, Subject, preview of body (first 150 chars)
   - Two action buttons: "✓ Enviar" and "✗ Cancelar"
   - Clicking "Enviar" sends confirmation message → agent sends email

4. **Resend for transactional email** — separate from agent email
   - Install Resend SDK
   - Create email templates: user invitation, workspace notification
   - Store `RESEND_API_KEY` in Vercel env vars
   - Domain verification in Resend dashboard

**HOW TO TEST:**
1. Configure email agent with a Gmail SMTP/IMAP App Password
2. Click "Probar conexión" → test email arrives at admin address
3. Tell copilot: "Redacta una propuesta de tasa para Empresa ABC Corp y envíala a contacto@abccorp.com"
4. Chat shows email preview card with To, Subject, body preview
5. Click "✓ Enviar" → agent sends email
6. Check Gmail sent folder → email sent correctly
7. Check `agent_activity` → row with `action: 'sent_email'`, details include recipient + subject
8. Tell copilot: "Redacta otro email" but do NOT click confirm
9. Click "✗ Cancelar" → agent responds "Email cancelado" and does NOT send

**PASS CRITERIA:**
- [ ] Agent can draft email via conversation
- [ ] Email preview card renders in chat with approve/cancel buttons
- [ ] Agent ONLY sends after explicit approval
- [ ] Agent NEVER sends autonomously
- [ ] Sent email appears in `agent_activity`
- [ ] IMAP inbox monitoring works (agent can read incoming emails)

**CURSOR TASK LIST:**
- [ ] Add Email section to agent canvas Canales tab
- [ ] Build SMTP/IMAP config fields with test connection button
- [ ] Write `skills/prisma-email/SKILL.md` with approval gate instructions
- [ ] Build email preview card component for chat panel
- [ ] Add approve/cancel action buttons to preview card
- [ ] Install Resend SDK for transactional email
- [ ] Create user invitation email template in Resend
- [ ] Test: draft email via chat, verify preview card appears
- [ ] Test: approve → verify sent in Gmail
- [ ] Test: cancel → verify NOT sent

---

### M13 — EXTERNAL API POLLING
**Duration:** 1–2 days  
**GATE:** M9 ✅ (cron execution must work), M6 ✅  
**Status:** ❌ Not built

**PURPOSE:**  
Agents can pull data from any external API on a schedule and store it as workspace records. This is Superwave's own Close CRM sync, BBC's payer database sync, and any future client integration.

**WHAT TO BUILD:**

1. **`skills/prisma-api-fetch/SKILL.md`**
   - Teaches agent to make HTTP requests using hErmes `execute-code` pattern
   - Handles pagination (loop until no more results)
   - Maps API response fields to workspace field keys
   - Stores `last_run` timestamp in agent memory to enable incremental fetches
   - Handles errors gracefully (log to `agent_activity`, do not crash)

2. **API credentials management** — in agent canvas → "Conexiones" tab
   - Key-value store for API credentials (stored as env vars in Docker Compose)
   - Example: `CLOSE_API_KEY = sk_xxx`, `HUBSPOT_TOKEN = Bearer pat-xxx`
   - UI shows key names only (values masked with ••••••)
   - "Regenerate env file" button → updates `.env` file on VPS (manual redeploy required)

3. **Cron builder enhancement** — variable insertion
   - `{last_run}` inserts the ISO timestamp of the previous execution
   - `{workspace_id}` inserts the current workspace ID
   - `{today}` inserts today's date in YYYY-MM-DD format

**HOW TO TEST:**
1. Add `CLOSE_API_KEY` to agent via Conexiones tab
2. Add cron job: "every 15 minutes" → "Pull new contacts from Close CRM at https://api.close.com/api/v1/contact/?date_updated__gt={last_run}. For each contact, create or update a record in Companies with name, email, phone fields."
3. Wait 15 minutes
4. Check `records` table → new Company records from Close CRM
5. Wait another 15 minutes → only contacts updated after last run imported (incremental)
6. Simulate API error (wrong API key) → agent logs error to `agent_activity`, does not crash

**PASS CRITERIA:**
- [ ] Agent fetches external API data on schedule
- [ ] Incremental fetch via `{last_run}` works
- [ ] Fetched data creates/updates workspace records
- [ ] API errors logged gracefully without crashing cron
- [ ] `last_run` timestamp updated in agent memory after each run

**CURSOR TASK LIST:**
- [ ] Write `skills/prisma-api-fetch/SKILL.md`
- [ ] Add "Conexiones" tab to agent canvas with key-value credential store
- [ ] Add variable insertion support to cron prompt builder (`{last_run}`, `{today}`)
- [ ] Test: Close CRM sync — verify records created in workspace
- [ ] Test: incremental fetch — verify only new/updated records pulled on second run
- [ ] Test: API error handling — verify graceful failure and activity log entry

---

### M14 — FIELD MANAGEMENT UI
**Duration:** 1–2 days  
**GATE:** M2 ✅  
**Status:** ❌ Not built — can run PARALLEL with M7/M8

**PURPOSE:**  
Operators can add, edit, and remove fields from workspace objects without going through chat or seed scripts. This is the "customize it" capability that makes the workspace feel owned by the client, not installed by a developer.

**WHAT TO BUILD:**
1. "⚙ Gestionar campos" button in record list header (admin role only)
2. Slide-over panel showing all current fields for the object
3. Each field shows: icon (type), name, key, required badge, sort order handle
4. "Agregar campo" button → inline form: name, type dropdown, required toggle, options (for select)
5. Edit field: click field row → expand edit form
6. Delete field: trash icon → confirmation warning ("Los datos en este campo se perderán")
7. Reorder: drag handles update `sort_order`

**HOW TO TEST:**
1. Open Companies record list
2. Click "⚙ Gestionar campos"
3. Click "Agregar campo" → fill: name="Website", type=text, not required
4. Click "Guardar" → field appears in field list AND in the record table header
5. Open a record → "Website" field appears in the form
6. Drag "Website" field to position 2 → sort order updates, table column moves
7. Click trash on "Website" → confirm → field disappears from table and forms
8. Verify deletion in Supabase → `workspace_fields` row deleted

**PASS CRITERIA:**
- [ ] Add field → auto-appears in table and record forms
- [ ] Edit field name → table header updates
- [ ] Reorder fields → table column order changes
- [ ] Delete field → field removed from UI and Supabase
- [ ] Warning shown before deletion

**CURSOR TASK LIST:**
- [ ] Build "Gestionar campos" slide-over panel
- [ ] Build add field inline form with type dropdown and options builder
- [ ] Build edit field inline form
- [ ] Build delete confirmation modal with data loss warning
- [ ] Implement drag-to-reorder with Supabase `sort_order` update
- [ ] Add `PATCH /api/workspaces/[slug]/fields/[id]` API route
- [ ] Add `POST /api/workspaces/[slug]/fields` API route
- [ ] Add `DELETE /api/workspaces/[slug]/fields/[id]` API route
- [ ] Test: add field, verify auto-render in table
- [ ] Test: delete field, verify removal

---

### M15 — BOARD / KANBAN VIEW
**Duration:** 2 days  
**GATE:** M2 ✅, M11 ✅ (UI system must be in place)  
**Status:** ❌ Not built

**PURPOSE:**  
This single addition transforms data tables into a CRM. A board view grouped by status/stage makes the pipeline immediately visible. It is the single biggest UI upgrade that differentiates Prisma from a spreadsheet.

**WHAT TO BUILD:**
1. View toggle button in record list header: `Table 📋 | Board 📌`
2. Board view component:
   - Reads `workspace_views.group_by_field_id` to know which `select` or `status` field to group by
   - Renders one column per unique option value in that field
   - Each column: header (status label + record count) + scrollable card list + "+ Nuevo" button
3. Record card component:
   - Primary field (first `required` text field)
   - 2 secondary fields (configurable in view settings)
   - Status pill
   - Assigned user avatar (if relation field exists)
4. Drag-and-drop between columns:
   - Uses `@dnd-kit/core` or `react-beautiful-dnd`
   - On drop: `PATCH /api/workspaces/[slug]/records/[id]` updating the grouped field value
   - Optimistic UI: card moves immediately, reverts on error
5. `+ Nuevo` at column bottom creates a record pre-filled with that column's status value

**HOW TO TEST:**
1. Open Companies → toggle to Board view
2. Board renders columns for each status value (Prospecto, Calificado, En revisión, Cerrado)
3. Drag "Test Corp" from "Prospecto" column to "Calificado" column
4. Check Supabase → record's status field updated to "Calificado"
5. Reload → card appears in "Calificado" column
6. Click "+ Nuevo" in "En revisión" column → new record form opens, status pre-filled as "En revisión"
7. Save → card appears in "En revisión" column immediately

**PASS CRITERIA:**
- [ ] Board view renders all status columns
- [ ] Cards show correct field data
- [ ] Drag-to-move updates record in Supabase
- [ ] Reloading preserves new column position
- [ ] "+ Nuevo" pre-fills status from column
- [ ] Optimistic UI reverts on error

**CURSOR TASK LIST:**
- [ ] Add view toggle button to record list header
- [ ] Build `BoardView` component (column layout from status field options)
- [ ] Build `RecordCard` component
- [ ] Install and configure `@dnd-kit/core`
- [ ] Implement drag-and-drop with Supabase update on drop
- [ ] Implement optimistic UI with error revert
- [ ] Add `group_by_field_id` to `workspace_views` if not present
- [ ] Test: drag card between columns, verify Supabase update
- [ ] Test: reload after drag, verify position preserved

---

## PART 11: COMPLETE ROADMAP WITH STAGE GATES

### Stage Gate Definitions

A **Stage Gate** is a hard checkpoint. No work from the next stage begins until all items in the current stage pass their criteria. This is not flexible.

```
STAGE 0: FOUNDATION (Must pass before any UI work)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gate 0A:  M0 ✅ — hErmes running on VPS, agent creates tables in Supabase
Gate 0B:  M1 ✅ — All database tables + RLS (already complete)

                     ↓ GATE 0 PASSED

STAGE 1: MAKE IT FUNCTIONAL (Must pass before launch prep)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gate 1A:  M2 ✅ — Record CRUD works (create, edit, delete)
Gate 1B:  M6 ✅ — Agent endpoint registration + health check

These two are the highest priority items in the entire project.
Nothing else matters until these pass.

                     ↓ GATE 1 PASSED

STAGE 2: MAKE IT COMPLETE (Parallel work — all must pass)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gate 2A:  M7 ✅ — WhatsApp agent operational
Gate 2B:  M8 ✅ — Data import works
Gate 2C:  M9 ✅ — Cron execution + activity feed filters
Gate 2D:  M11 ✅ — UI/UX design system applied
Gate 2E:  M14 ✅ — Field management UI

M7, M8, M9, M11, M14 can all run in parallel after Stage 1 passes.

                     ↓ GATE 2 PASSED

STAGE 3: MAKE IT POLISHED (Parallel work — all must pass)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gate 3A:  M12 ✅ — Email integration
Gate 3B:  M13 ✅ — External API polling
Gate 3C:  M15 ✅ — Board/kanban view

                     ↓ GATE 3 PASSED

STAGE 4: LAUNCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gate 4A:  M10 ✅ — BBC 14-step E2E test passes
Gate 4B:  Performance: no page takes >3s to load
Gate 4C:  Security: no cross-workspace data leakage
Gate 4D:  Language: zero English labels in client workspace

                     ↓ GATE 4 PASSED = V1 SHIPPED
```

### Timeline Estimate

| Stage | Milestones | Estimated Days | Can Parallelize? |
|-------|-----------|---------------|-----------------|
| Stage 0 | M0 (re-confirm) | 1–2 days | No |
| Stage 1 | M2 + M6 | 3–5 days | Yes (M2 and M6 in parallel) |
| Stage 2 | M7 + M8 + M9 + M11 + M14 | 6–10 days | Yes (all parallel) |
| Stage 3 | M12 + M13 + M15 | 5–6 days | Yes (all parallel) |
| Stage 4 | M10 | 3–4 days | No |
| **Total** | | **~18–27 working days** | |

---

## PART 12: WHAT NOT TO DO

These are hard constraints. Never violate them.

```
❌ DO NOT run the Next.js app inside Docker. It goes on Vercel.
❌ DO NOT use :latest tag for hErmes. Always pin a specific version.
❌ DO NOT let agents communicate directly between containers. Use the database.
❌ DO NOT build hardcoded views for specific clients. Use the meta-model.
❌ DO NOT expose hErmes API servers to the public internet. They are behind Caddy.
❌ DO NOT store secrets in code. Use .env files on VPS and Vercel env settings.
❌ DO NOT build a self-service signup flow. Admin-provisioned only.
❌ DO NOT use OpenClaw. Replaced entirely by hErmes.
❌ DO NOT use SQLite. Everything goes in Supabase.
❌ DO NOT skip RLS policies. Every table must have workspace-scoped RLS.
❌ DO NOT hardcode column names in any frontend component.
❌ DO NOT build the browser automation feature. It is explicitly out of scope for v1.
❌ DO NOT let agents send email without explicit human approval in chat.
❌ DO NOT build drag-and-drop dashboard cards for v1. Defer to v1.1.
❌ DO NOT apply the design system to components that don't yet have CSS module files.
   Create the module file first, then refactor the component.
```

---

## PART 13: SKILLS MANIFEST

| Skill File | Purpose | Used By |
|-----------|---------|---------|
| `skills/prisma-database/SKILL.md` | Create/modify `workspace_objects` and `workspace_fields` via Supabase REST API | Copilot |
| `skills/prisma-views/SKILL.md` | Create saved views in `workspace_views` | Copilot |
| `skills/prisma-records/SKILL.md` | CRUD on `records` table. Agent event bus polling. | All agents |
| `skills/prisma-qualify/SKILL.md` | Lead qualification questions and scoring | WhatsApp agent |
| `skills/prisma-enrich/SKILL.md` | Record enrichment, CRM data lookup | CRM monitor agent |
| `skills/prisma-email/SKILL.md` | Draft and send email with human approval gate | Email-capable agents |
| `skills/prisma-api-fetch/SKILL.md` | HTTP requests to external APIs, pagination, field mapping | Worker agents with data sync |

---

## PART 14: ENVIRONMENT VARIABLES

### Vercel (Next.js app)
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
HERMES_API_BASE_URL=          # https://hermes-bbc.prisma.com.mx
HERMES_API_KEY=               # default copilot key (per workspace, resolved from DB)
OPENROUTER_API_KEY=           # fallback for chat when hErmes unavailable
RESEND_API_KEY=               # transactional email
NEXT_PUBLIC_APP_URL=          # https://prisma.com.mx
```

### VPS (Docker Compose .env)
```
BBC_COPILOT_API_KEY=
BBC_WHATSAPP_API_KEY=
BBC_CRM_API_KEY=
OPENROUTER_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
CLOSE_API_KEY=                # if using Close CRM sync
```

---

*Document complete. Total milestones: M0–M15. Stage gates: 0–4. Estimated time to v1 launch: 18–27 working days from Stage 0.*
