# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Prisma is a multi-tenant AI agent platform built on Next.js 16 + Supabase. It combines:
- Marketing/intake surfaces (`/`, `/intake`)
- Authenticated workspace app (`/workspaces/*`)
- Admin control plane (`/admin/*`)
- Hermes-first agent runtime with MCP tool integration

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Next.js dev server (port 3000)
npm run build        # Production build
npm run lint         # ESLint check
npm run typecheck    # TypeScript check (npx tsc --noEmit)
```

## Environment Setup

Copy `.env.local.example` to `.env.local`. Key variable groups:

- **Chat/Runtime**: `PRISMA_CHAT_PROVIDER=hermes`, `HERMES_API_BASE_URL`, `HERMES_API_KEY`, `HERMES_MODEL`
- **Supabase**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **MCP Auth**: `PRISMA_MCP_JWT_SECRET` (required)
- **Admin**: `PRISMA_PLATFORM_ADMIN_EMAILS`

## Architecture

### Data Model (Meta-Model Driven)

The system uses a dynamic schema rather than hardcoded CRM pages:

- `workspaces` - Tenant containers with `subdomain` as slug
- `workspace_objects` - Dynamic object definitions (Contacts, Companies, Deals, Tasks, etc.)
- `workspace_fields` - Field definitions per object with `type`, `options`, `sort_order`
- `workspace_views` - Saved views with filters, sorts, columns, grouping
- `records` - JSONB data rows belonging to an object
- `workspace_tasks` - Task tracking with lists, statuses, assignments
- `workspace_agents` - Per-workspace agent configurations (3 agents per workspace: main, agent-2, agent-3)

### Key Store Patterns

**`lib/platformStore.ts`** - Admin/platform-level CRUD (workspaces, projects, templates, deployments). Uses Supabase when available, falls back to local `.data/platform-state.json` for development.

**`lib/workspaceStore.ts`** - Workspace data access (objects, fields, views, records, tasks, agents). All functions require `workspaceId` scoping. Provides mapping functions (`mapRecord`, `mapField`, etc.) and derived helpers (`deriveQueueItems`, `applyViewToRecords`).

### Agent Tool System

Tools are registered in `lib/agentTools/registry.ts` and imported via `lib/agentTools/executor.ts`:

```typescript
// Tool structure
type ToolDefinition = {
  name: string;           // e.g., "crm.update_person"
  description: string;
  args: ToolArgShape;     // JSON-schema-like arg definitions
  handler: (args, ctx) => Promise<ToolResult>;
};

// Context passed to handlers
type ToolContext = {
  workspaceSlug: string;
  origin: string;
  cookieHeader?: string;
  agentId?: string | null;
};
```

Tool handlers typically call workspace REST APIs via `fetchInternal()` to preserve auth/activity tracking.

Available tool modules: `crm`, `records`, `schema`, `integrations`, `images`, `automations`, `documents`, `bindings`, `connections`, `delegation`, `agents`, `skills`

### Workflow Engine

`lib/workflows/engine.ts` processes workspace automation workflows triggered by events:

- Event types: `record.created`, `lead.qualified`, `deal.stage_changed`, `task.due`, `whatsapp.message_received`, etc.
- Step types: `send_whatsapp`, `update_record`, `create_task`, `create_deal`, `agent_prompt`, `delay`, `branch`, `run_recipe`

### API Route Structure

Workspace APIs follow: `app/api/workspaces/[workspaceSlug]/<resource>/route.ts`

Key patterns:
- All routes verify workspace membership via `getWorkspaceMembershipForSlug()`
- CRM entities: `/crm/people`, `/crm/companies`, `/crm/deals`
- Generic records: `/records`, `/records/[recordId]`
- Tasks: `/tasks`, `/tasks/lists`, `/tasks/statuses`
- Conversations: `/conversations`, `/conversations/[conversationId]/messages`

### Host Routing

`proxy.ts` + `middleware.ts` handle subdomain routing:
- `app.domain.com` → `/admin`
- `intake.domain.com` → `/intake`
- `domain.com` → marketing homepage

## Schema Source of Truth

Database schema lives in `supabase/migrations/`. The migrations follow a milestone pattern:
- `20260411_*` - M1 foundation + RLS
- `20260417_*` - M2 soft delete, M7 inbound
- `20260418_*` - M8 CRM entities, M10 smart views
- `20260419_*` - M11 workflows, sequences, templates
- `20260420_*` - M12/M13 tasks, pipelines
- `20260424_*` - Hermes runtime, extraction tables

## Key Constraints

- Workspace isolation is strict: all API logic must scope by `workspace_id`
- Prefer extending the meta-model over hardcoded vertical CRM screens
- Hermes is the sole chat runtime; OpenRouter is utility-only (JSON parsing fallback)
- Reuse `platformStore` and `workspaceStore` patterns before adding new data paths
- Agent limit per workspace defaults to 3 (configurable via `agent_limit` column or metadata)

## Product Roadmap

Source of truth: `docs/PRISMA-MASTER-SPEC-V1.md`

Stage execution order:
1. Stage 1: M2 + M6 (critical blockers)
2. Stage 2: M7 + M8 + M9 + M11 + M14 (parallel)
3. Stage 3: M12 + M13 + M15 (polish layer)
4. Stage 4: M10 (launch gate)
