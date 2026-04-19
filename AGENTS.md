# AGENTS.md

## Prisma platform context

Prisma is a multi-tenant AI agent platform built on Next.js + Supabase.
The UI is a control plane and workspace lens over a database-first meta-model.

This repository includes:

- Marketing + intake surfaces (`/`, `/intake`)
- Authenticated workspace app (`/workspaces/*`)
- Admin control plane (`/admin/*`)
- Workspace APIs for objects, fields, records, tasks, conversations, and agents
- Skill definitions under `skills/` for Hermes runtime behavior

## Locked architecture assumptions

- Workspace model is **3 peer agents** per workspace (`main`, `agent-2`, `agent-3`), with hand-offs through `workspace_tasks` rows.
- Schema is dynamic and meta-model-driven, not hardcoded CRM pages:
  - `workspace_objects`
  - `workspace_fields`
  - `workspace_views`
  - `records` (JSONB data rows)
- Agent runtime is Hermes.
- Supabase is system of record (schema, RLS, activity, tasks, conversation persistence).

Current rollout mode in this repo uses a **shared Hermes endpoint** for bootstrap and chat validation. Full per-workspace Docker provisioning is planned but not the active default.

## Core tables and capabilities already present

Primary schema and RLS are in `supabase/migrations/`:

- Foundation + RLS (M1): workspaces, members, objects, fields, views, records, agents, activity
- Imports + board grouping + tasks/evidence + conversation persistence
- Admin and workspace APIs already implemented for most CRUD workflows

Skills present today:

- `skills/prisma-database`
- `skills/prisma-api-fetch`

## Local development

### Services

| Service | Port | Command |
|---|---|---|
| Next.js dev server | 3000 | `npm run dev` |

### Standard commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npx tsc --noEmit`

## Required environment

Use `.env.local` (copy from `.env.local.example`).

Key groups:

- Chat/runtime: `PRISMA_CHAT_PROVIDER`, `HERMES_API_BASE_URL`, `HERMES_API_KEY`, `OPENROUTER_API_KEY`
- Supabase server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Supabase public auth: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or anon key)
- Admin access: `PRISMA_PLATFORM_ADMIN_EMAILS`
- Optional ops/billing: Stripe vars + `OPS_WEBHOOK_URL`

## Guardrails for agents working this repo

- Do not reframe this project as a static marketing site; it is an agent platform with Supabase-backed multi-tenant workflows.
- Prefer extending the meta-model and generic workspace views over hardcoded vertical CRM screens.
- Keep workspace isolation strict in API logic (`workspace_id` scoping everywhere).
- Reuse existing API/store patterns in `lib/platformStore.ts` and `lib/workspaceStore.ts` before adding new data paths.
