# Prisma Codebase Audit - 2026-04-21

## 1) Executive Summary

Prisma already has a broad, usable product surface: public marketing/intake, authenticated workspace CRM/data/task operations, admin control plane, and a Hermes-first agent runtime with tool execution. The platform is clearly beyond prototype stage and supports real operator workflows across intake, workspace operations, CRM records, and agent configuration.

The largest scope gap is not "missing features", but uneven completion depth. Several surfaces are production-like (workspace CRM + admin leads/billing), while some are still transitional (`InboxPanel` mock state, legacy builder-turn wiring, hidden-yet-live CRM ops routes, and split usage telemetry models). This creates ambiguity for day-to-day polishing because the app presents both mature and partially wired paths in the same navigation.

Top risks to address before pure UI polish: unauthenticated tool-run route, webhook token bypass when token is empty, clearance defaults that can block standard users, MCP/runtime mismatch (`/api/mcp/prisma` referenced but missing), and billing/usage model drift (`usage_events` vs `credit_usage_events`).

## 2) Feature Inventory (Active / Working / In Progress / Stub / Dead)

Status legend used in this audit:
- `working`: active and end-to-end functional
- `in_progress`: partially wired or behaviorally inconsistent
- `stub`: UI/demo scaffolding with mock data
- `dead`: orphan/superseded/no live call site

### A. Marketing, Auth, Intake

| Feature | Entry points | Primary use case | Data/API path | Status | Notes |
|---|---|---|---|---|---|
| Marketing homepage | [`app/page.tsx`](app/page.tsx), [`components/landing/LandingPage.tsx`](components/landing/LandingPage.tsx) | Explain value proposition, drive leads to intake/signup | Static + client UI components | working | Core CTA flow is live |
| Public intake form | [`app/intake/page.tsx`](app/intake/page.tsx), [`app/api/intake/route.ts`](app/api/intake/route.ts) | Capture lead/company details and queue for admin processing | `intakeStore` + lead scoring | working | End-to-end works with Supabase or local fallback |
| Workspace login/signup | [`app/login/page.tsx`](app/login/page.tsx), [`app/signup/page.tsx`](app/signup/page.tsx) | Member authentication into workspace app | Auth helpers + session cookies | working | `/login` forces non-admin next-path behavior |
| Admin login/signup | [`app/admin/(auth)/login/page.tsx`](app/admin/(auth)/login/page.tsx), [`app/admin/(auth)/signup/page.tsx`](app/admin/(auth)/signup/page.tsx) | Platform-admin authentication | Admin auth flow | working | Gated by `requireAdminUser` in dashboard layout |

### B. Workspace App (`/workspaces/[workspaceSlug]`)

| Feature | Entry points | Primary use case | Data/API path | Status | Notes |
|---|---|---|---|---|---|
| Home tab | [`app/workspaces/[workspaceSlug]/page.tsx`](app/workspaces/[workspaceSlug]/page.tsx), [`components/workspace/WorkspacePanels.tsx`](components/workspace/WorkspacePanels.tsx) | Workspace overview and operational summary | `workspaceStore` snapshot + derived helpers | working | Main operator landing surface |
| Chat tab | [`components/workspace/WorkspacePanels.tsx`](components/workspace/WorkspacePanels.tsx), [`app/api/chat/route.ts`](app/api/chat/route.ts) | Conversational operations over workspace data | Hermes responses + tool executor | working | Chat runtime is the primary live orchestration path |
| Agents tab (V2) | [`components/workspace/agents/AgentsPanelV2.tsx`](components/workspace/agents/AgentsPanelV2.tsx) | Configure agents, skills, triggers, knowledge, connections | `/api/workspaces/[slug]/agents/*`, `/api/chat` | working | New V2 path is active and broad |
| Agent config sections | [`components/workspace/agents/sections`](components/workspace/agents/sections) | Fine-grained control of activation, skills, triggers, connections | Agents + integrations + connections APIs | working | Header action buttons in panel are presently non-functional |
| Inbox tab | [`components/workspace/inbox/InboxPanel.tsx`](components/workspace/inbox/InboxPanel.tsx), [`components/workspace/inbox/mockData.ts`](components/workspace/inbox/mockData.ts) | Unified channel inbox and CRM side context | Local mock seed only | stub | Route is visible, but no real inbox backend wiring in panel |
| Data tab | [`components/workspace/data`](components/workspace/data), [`app/api/workspaces/[workspaceSlug]/records/*`](app/api/workspaces/[workspaceSlug]/records) | Manage dynamic-object records and views | `workspaceStore` + records APIs | working | Major CRUD paths are live |
| Fields/channels/import/team chat tabs | [`components/workspace/panels`](components/workspace/panels), [`components/workspace/teamChat`](components/workspace/teamChat) | Schema management, channels, imports, internal collaboration | Workspace APIs by tab | in_progress | Some tabs hidden from nav but routable |
| Record detail tab | [`app/workspaces/[workspaceSlug]/page.tsx`](app/workspaces/[workspaceSlug]/page.tsx) | Drill into a specific record | State-driven record selection | in_progress | `?tab=record` without record id falls back to non-record content |
| Integrations settings page | [`app/workspaces/[workspaceSlug]/settings/integrations/page.tsx`](app/workspaces/[workspaceSlug]/settings/integrations/page.tsx) | Explain integrations and direct users to action points | Mostly explanatory UI | in_progress | Uses `selectedTab: "agents"` and appears as agents-selected |

### C. CRM Verticals

| Feature | Entry points | Primary use case | Data/API path | Status | Notes |
|---|---|---|---|---|---|
| CRM people/companies/deals | [`app/workspaces/[workspaceSlug]/crm/[entity]/page.tsx`](app/workspaces/[workspaceSlug]/crm/[entity]/page.tsx) | Core pipeline and relationship management | `workspaceStore` + CRM routes | working | Core list/detail/edit flow in place |
| CRM duplicates | [`app/workspaces/[workspaceSlug]/crm/[entity]/duplicates/page.tsx`](app/workspaces/[workspaceSlug]/crm/[entity]/duplicates/page.tsx) | De-duplication/merge assistance | Duplicate APIs | working | People/companies duplicate handling is present |
| CRM reports | [`app/workspaces/[workspaceSlug]/crm/reports/page.tsx`](app/workspaces/[workspaceSlug]/crm/reports/page.tsx) + reports APIs | Funnel/velocity/forecast reporting | CRM reports endpoints | working | Reporting endpoints are implemented |
| CRM templates/workflows/sequences UIs | [`app/workspaces/[workspaceSlug]/crm/templates`](app/workspaces/[workspaceSlug]/crm/templates), [`.../workflows`](app/workspaces/[workspaceSlug]/crm/workflows), [`.../sequences`](app/workspaces/[workspaceSlug]/crm/sequences) | Message ops and automation orchestration | Workspace routes + workflows/sequences routes | in_progress | Data-backed routes are live but hidden in sidebar via nav flag |

### D. Admin Control Plane

| Feature | Entry points | Primary use case | Data/API path | Status | Notes |
|---|---|---|---|---|---|
| Admin overview | [`app/admin/(dashboard)/page.tsx`](app/admin/(dashboard)/page.tsx) | Global workspace/agent/deployment snapshot | `platformStore` + billing reads | working | Central command view is functional |
| Leads queue | [`app/admin/(dashboard)/leads/page.tsx`](app/admin/(dashboard)/leads/page.tsx), [`app/api/admin/leads`](app/api/admin/leads) | Review, annotate, export, and convert intake leads | `intakeStore` + leads APIs | working | Core lead->workspace flow exists |
| Billing | [`app/admin/(dashboard)/billing/page.tsx`](app/admin/(dashboard)/billing/page.tsx) | Workspace billing and credit usage review | `workspace_billing`, `credit_usage_events` | working | Strong new surface |
| Usage | [`app/admin/(dashboard)/usage/page.tsx`](app/admin/(dashboard)/usage/page.tsx), [`app/api/admin/usage/route.ts`](app/api/admin/usage/route.ts) | Platform operational event feed | `usage_events` via `platformStore` | in_progress | Different telemetry model than billing/chat usage |
| Clients/workspaces | [`app/admin/(dashboard)/clients/page.tsx`](app/admin/(dashboard)/clients/page.tsx), [`app/admin/(dashboard)/workspaces/[workspaceSlug]/page.tsx`](app/admin/(dashboard)/workspaces/[workspaceSlug]/page.tsx) | Tenant management and detail | `platformStore` + workspace APIs | working | Labeling mismatch ("Workspaces" nav, "Clients" page title) |
| Hermes lab | [`app/admin/(dashboard)/workspaces/[workspaceSlug]/hermes-lab/page.tsx`](app/admin/(dashboard)/workspaces/[workspaceSlug]/hermes-lab/page.tsx), [`components/workspace/settings/HermesOpsPanel.tsx`](components/workspace/settings/HermesOpsPanel.tsx) | Admin ops for skills, automations, integrations, gateway | Workspace APIs + Hermes tooling | working | Real API-backed, not mock |
| Users | [`app/admin/(dashboard)/users/page.tsx`](app/admin/(dashboard)/users/page.tsx) | View platform auth users | `listAdminUsers` | in_progress | Copy explicitly says membership controls are "next UI step" |

### E. Agent Runtime and Tools

| Feature | Entry points | Primary use case | Data/API path | Status | Notes |
|---|---|---|---|---|---|
| Hermes chat runtime | [`app/api/chat/route.ts`](app/api/chat/route.ts) | Streamed LLM responses with tool calls | Hermes `/v1/responses` (+ optional shim) | working | Primary runtime path |
| Tool registry + executor | [`lib/agentTools/registry.ts`](lib/agentTools/registry.ts), [`lib/agentTools/executor.ts`](lib/agentTools/executor.ts) | Register/validate/execute workspace tools | Tool modules in `lib/agentTools/tools` | working | Broad tool surface (~77 names) |
| MCP config emission | [`app/api/workspaces/[workspaceSlug]/agents/[agentId]/mcp-config/route.ts`](app/api/workspaces/[workspaceSlug]/agents/[agentId]/mcp-config/route.ts) | Return Hermes-compatible MCP server config | JWT session + policy include/exclude | in_progress | References `/api/mcp/prisma`, but only `/api/mcp/browser-use` exists |
| `.well-known` skills tap | [`app/.well-known/skills/index.json/route.ts`](app/.well-known/skills/index.json/route.ts), [`app/.well-known/skills/[skillSlug]/route.ts`](app/.well-known/skills/[skillSlug]/route.ts) | Public skill index + markdown exposure | `lib/skillsTap.ts` | working | Public and useful for discovery |

## 3) Stubs and Mock-Only Features

- Inbox UX is currently mock-backed (`createInboxMockState`) in [`components/workspace/inbox/InboxPanel.tsx`](components/workspace/inbox/InboxPanel.tsx), so this should either be clearly labeled demo or wired to real inbox APIs.
- Workspace integrations page is mostly a guidance/CTA surface while real integration management is done in admin Hermes Lab.
- Admin users page is explicitly incomplete for membership-management UX.
- CRM templates/workflows/sequences are live endpoints and pages but hidden from workspace nav by `AGENT_OPS_UI_ENABLED=false` in [`lib/workspaceNav.ts`](lib/workspaceNav.ts).
- [`scripts/build_skills_tap_index.mjs`](scripts/build_skills_tap_index.mjs) appears to create an artifact that runtime `.well-known` routes do not consume.

## 4) Dead Code / Unused / Superseded Candidates

### Component-level
- Legacy `AgentsPanel` and alias `AgentOverviewPanel` in [`components/workspace/WorkspacePanels.tsx`](components/workspace/WorkspacePanels.tsx) are superseded by [`components/workspace/agents/AgentsPanelV2.tsx`](components/workspace/agents/AgentsPanelV2.tsx).
- `QueuePanel` and `ActivityPanel` exports are not mounted by current route wiring.
- [`components/workspace/agents/HermesDocsLink.tsx`](components/workspace/agents/HermesDocsLink.tsx) has no importers.
- [`app/(marketing)/layout.tsx`](app/(marketing)/layout.tsx) is orphaned relative to current root page wiring.

### Unused exports/helpers (from call-site scan)
- `createTemplate`, `queueProvisioningFromIntake` in [`lib/platformStore.ts`](lib/platformStore.ts)
- `getWorkspaceSnapshot`, `listWorkspaceImportHistory`, `listWorkspaceSummaries`, `taskToRecord`, `tasksToRecords` in [`lib/workspaceStore.ts`](lib/workspaceStore.ts)
- `emitEvent`, `MAX_WORKFLOW_DEPTH` in [`lib/workflows/engine.ts`](lib/workflows/engine.ts)
- `getConnectionSecret` in [`lib/connections/store.ts`](lib/connections/store.ts)
- `extractSingleSelectEnumValues` in [`lib/fieldExtraction.ts`](lib/fieldExtraction.ts)
- `computeOverageTokens` in [`lib/billing/computeOverage.ts`](lib/billing/computeOverage.ts)

## 5) Potential Issues, Bugs, and Conflicts (Ranked)

### Critical

1. **Unauthenticated tool execution endpoint**
   - [`app/api/agent-tools/run/route.ts`](app/api/agent-tools/run/route.ts) accepts `name` + `workspaceSlug` and forwards `cookieHeader` into `runTool` without explicit auth gating.
2. **Webhook token bypass when expected token is blank**
   - In [`app/api/workspaces/[workspaceSlug]/webhooks/[webhookSlug]/route.ts`](app/api/workspaces/[workspaceSlug]/webhooks/[webhookSlug]/route.ts), check is `if (expectedToken && providedToken !== expectedToken)`; empty `expectedToken` skips verification.
3. **Clearance defaults conflict with route requirements**
   - Migration sets `workspace_members.clearance_level default 2` in [`supabase/migrations/20260426_000004_workspace_clearance_and_audit.sql`](supabase/migrations/20260426_000004_workspace_clearance_and_audit.sql), while records/agents routes enforce `requiredClearanceLevel: 3`.
4. **RLS policy footgun on audit/feature flags**
   - Same migration enables RLS on `workspace_feature_flags` and `workspace_audit_log` with broad authenticated policy; risky if any client-side Supabase query path is introduced.
5. **`intake_submissions` RLS enabled without explicit policies in migration**
   - [`supabase/migrations/20260426_000001_align_intake_submissions_schema.sql`](supabase/migrations/20260426_000001_align_intake_submissions_schema.sql) enables RLS; policy definitions are not in that file.

### High

1. **MCP config references missing route**
   - [`app/api/workspaces/[workspaceSlug]/agents/[agentId]/mcp-config/route.ts`](app/api/workspaces/[workspaceSlug]/agents/[agentId]/mcp-config/route.ts) emits `/api/mcp/prisma`, but only [`app/api/mcp/browser-use/route.ts`](app/api/mcp/browser-use/route.ts) is present.
2. **Legacy builder-turn still wired in older panel**
   - [`components/workspace/WorkspacePanels.tsx`](components/workspace/WorkspacePanels.tsx) `sendTestMessage()` calls `/builder-turn`, which now deprecates behind env guard.
3. **Policy vs prompt contract mismatch**
   - [`lib/agentTools/mcpPolicy.ts`](lib/agentTools/mcpPolicy.ts) namespace presets can exclude `peer.list_agents`/`cms.*` in some modes, while prompt text in [`app/api/chat/route.ts`](app/api/chat/route.ts) instructs these as universally available and references nonexistent `crm.find_*`.
4. **Hermes home-root mismatch risk**
   - Python shim default root in [`services/hermes-shim/app/main.py`](services/hermes-shim/app/main.py) differs from Node runtime conventions unless explicitly aligned via env.
5. **Billing activation gap**
   - `reportToStripeMetered` relies on `workspace_billing` rows; workspace creation flow does not clearly guarantee row provisioning.
6. **Dual usage telemetry**
   - Billing surfaces depend on `credit_usage_events`, while admin usage page reads `usage_events`; users can see conflicting usage narratives.

### Medium

1. **Possible unhandled rejection around tool-call timeout race**
   - `Promise.race` timeout reject around `runTool` path in [`app/api/chat/route.ts`](app/api/chat/route.ts).
2. **Connection sync update path does not strongly validate update error before incrementing counters**
   - [`lib/connections/runtime.ts`](lib/connections/runtime.ts).
3. **Usage cost model ambiguity**
   - `logAgentUsage` treats full token total as overage cost candidate; included token allowance helper exists but is not used.
4. **Clearance schema partially modeled**
   - New columns (`min_clearance_level`, `allowed_user_ids`, limits) exist but are not consistently consumed in TS access logic.
5. **Duplicate naming semantics**
   - Two `computeLeadScore` functions with different contexts (`intake` vs `crm`) and two `findCrmObjectByKind` implementations increase maintenance ambiguity.

### Low

- Integrations settings page uses `selectedTab: "agents"` and highlights the wrong section context.
- Sidebar naming mismatch: "Workspaces" nav label routes to `/admin/clients`.
- Typo "hErmes" in deployments copy.
- `?tab=record` can render non-record content when no record is selected.
- Chat connected-app indicators include hardcoded "connected" assumptions (e.g., Supabase status).

## 6) Schema Drift Summary

- `20260424` to `20260426` migrations generally align with active Hermes/extraction/connections/intake/billing/clearance code paths.
- Notable drift risk: platform admin store references tables (`landing_templates`, `projects`, `landing_sites`, `usage_events`, `provisioning_jobs`) that are not clearly defined in the visible migration set, causing runtime fallback behavior and potential environment skew.
- Clearance and feature-limit columns introduced in migration are only partially integrated into authorization/business logic.

## 7) Test Coverage Snapshot

- Present E2E: [`tests/e2e/admin-intake-smoke.spec.ts`](tests/e2e/admin-intake-smoke.spec.ts) + [`playwright.config.ts`](playwright.config.ts).
- Current smoke test mocks `/api/intake`, so storage, scoring persistence, and admin lead queue effects are not validated end-to-end.
- Coverage gaps: chat tool path, MCP config behavior, billing usage write/report flow, clearance enforcement permutations, workflow execution edge cases.

## 8) Suggested 7-Day Polish Sequence

### Day 1 - Security hardening
- Require auth + workspace scoping on `/api/agent-tools/run`.
- Enforce non-empty webhook token requirements and reject unsecured webhook routes.
- Tighten `workspace_feature_flags`/`workspace_audit_log` RLS policy scope.
- Add or verify explicit `intake_submissions` RLS policies.

### Day 2 - Authorization and billing correctness
- Align clearance defaults with route thresholds (or route thresholds with intended default roles).
- Ensure workspace creation always provisions `workspace_billing`.
- Refine usage cost model to distinguish included vs overage tokens.

### Day 3 - Hermes runtime alignment
- Implement `/api/mcp/prisma` or remove advertisement from mcp-config.
- Migrate remaining legacy builder-turn call sites to `/api/chat`.
- Align policy presets and prompt instructions (`peer.list_agents`, `cms.*`, `crm.*` naming).
- Standardize `PRISMA_HERMES_HOME_ROOT` across Node and shim.

### Day 4 - Dead-code cleanup
- Remove legacy agent panel artifacts and unused exports listed in section 4.
- Remove/replace orphan marketing layout and stale alias routes as appropriate.

### Day 5 - Inbox go/no-go
- Either wire `InboxPanel` to real data contracts or relabel as preview and hide from production nav.

### Day 6 - UX and terminology polish
- Resolve admin label inconsistencies ("clients" vs "workspaces").
- Fix tab-highlighting mismatch in integrations settings.
- Clean low-risk inconsistencies (copy typo, record-tab behavior, chat status labels).

### Day 7 - Test net expansion
- Add Playwright flow: intake submit -> admin lead review -> create workspace.
- Add runtime regression tests for chat tool-call path and clearance denial scenarios.
- Add billing write assertions for `credit_usage_events` and Stripe-report branch behavior.

## 9) Appendices

### Appendix A - Full API Route Inventory (normalized)

| Route | Methods | Purpose |
|---|---|---|
| `/api/admin/agents` | GET, POST, PATCH | List, create, and update platform-scoped agent definitions (`platformStore`). |
| `/api/admin/deployments` | GET, POST | List and register agent deployments for workspaces. |
| `/api/admin/intakes/[intakeId]/approve` | POST | Approve a queued intake submission from the admin pipeline. |
| `/api/admin/leads` | GET | List and filter intake submissions (JSON or CSV) for admins. |
| `/api/admin/leads/[leadId]` | PATCH | Update intake lead status, notes, or linked workspace/project IDs. |
| `/api/admin/leads/[leadId]/create-workspace` | POST | Provision a workspace (and related IDs) from an intake lead. |
| `/api/admin/projects/manual-create` | POST | Manually create a platform project/workspace bundle. |
| `/api/admin/provisioning` | GET | List recent provisioning jobs with optional limit. |
| `/api/admin/sites/[siteId]/publish` | POST | Trigger publish workflow for a marketing site record. |
| `/api/admin/templates` | GET, POST, PATCH, DELETE | CRUD for reusable admin/workspace templates. |
| `/api/admin/usage` | GET | List recent usage/billing events, optionally scoped by workspace. |
| `/api/admin/users` | GET | List users visible to the platform admin console. |
| `/api/admin/workspaces` | GET, POST | List workspaces and create new tenant workspaces. |
| `/api/admin/workspaces/[workspaceId]/bootstrap-agent` | POST | Bootstrap default Hermes/MCP agents for a workspace by ID. |
| `/api/agent-tools/run` | POST | Execute a registered agent tool by name for a workspace (internal/tool bridge). |
| `/api/chat` | POST | Stream or complete Hermes chat with tools, readiness, and billing hooks. |
| `/api/crm/leads` | GET | Paginated CRM leads for a workspace (`workspaceId` query), with aggregates. |
| `/api/crm/leads/[id]` | GET, PATCH | Load or update a single CRM lead (membership-checked). |
| `/api/cron/lead-score-refresh` | GET | Cron: recompute lead/person scores across workspaces (authorized). |
| `/api/cron/sequence-tick` | GET | Cron: advance outbound sequences (`sequences/engine`). |
| `/api/cron/tasks-recurring` | GET | Cron: expand recurring tasks from `workspace_tasks` metadata. |
| `/api/cron/workflow-tick` | GET | Cron: evaluate cron workflows and drain pending workflow runs. |
| `/api/health` | GET | Health/degraded/down probes for app, Supabase, and optional gateway. |
| `/api/inbox/cases/[leadId]/accept` | POST | Accept a lead case (pipeline stage + Supermemory calibration context). |
| `/api/inbox/cases/[leadId]/reject` | POST | Reject a lead case with optional notes/metadata. |
| `/api/inbox/cases/[leadId]/review` | POST | Record an operator review decision on a lead case. |
| `/api/inbox/conversations/[id]` | GET, PATCH | Load or update inbox conversation metadata for operators. |
| `/api/inbox/draft` | POST | Request an AI draft reply for a conversation (with degraded fallback). |
| `/api/inbox/replies` | GET, POST | List CRM replies or create a pending reply row for approval/sending. |
| `/api/inbox/replies/[id]` | GET, PATCH | Fetch or edit a single pending reply before approval. |
| `/api/inbox/replies/[id]/approve` | POST | Approve a pending reply for dispatch. |
| `/api/inbox/replies/[id]/cancel` | POST | Cancel a pending reply row. |
| `/api/intake` | POST | Public intake form POST (stores submission, scoring, optional user shell). |
| `/api/mcp/browser-use` | POST | JSON-RPC MCP shim for Browser-Use Cloud (JWT-scoped). |
| `/api/stripe/checkout` | POST | Create a Stripe Checkout session tied to an intake submission. |
| `/api/stripe/webhook` | POST | Stripe webhook: mark paid and optionally provision workspace from intake. |
| `/api/webhooks/manychat` | POST | Verified ManyChat inbound webhook -> inbound CRM pipeline + ack. |
| `/api/workspaces/[workspaceSlug]/actions` | POST | Run workspace bootstrap/dashboard/schema/scenario actions (`workspaceActions`). |
| `/api/workspaces/[workspaceSlug]/activity` | GET | Recent workspace activity feed for the tenant. |
| `/api/workspaces/[workspaceSlug]/activity-types` | GET, POST | List or create custom activity types for timeline entries. |
| `/api/workspaces/[workspaceSlug]/agents` | POST | Create an additional workspace agent from template or payload. |
| `/api/workspaces/[workspaceSlug]/agents/[agentId]` | GET, PATCH, POST | Read/update agent config or POST to probe liveness/cron registration. |
| `/api/workspaces/[workspaceSlug]/agents/[agentId]/builder-turn` | POST | One Hermes "builder" turn for editing agent instructions safely. |
| `/api/workspaces/[workspaceSlug]/agents/[agentId]/mcp-config` | GET | Return MCP server config blob for Hermes (`mcp_servers` emission). |
| `/api/workspaces/[workspaceSlug]/agents/[agentId]/whatsapp/pair` | POST, DELETE | Pair or remove WhatsApp channel linkage for an agent. |
| `/api/workspaces/[workspaceSlug]/agents/catalog` | GET | List available agent templates/catalog entries for the workspace. |
| `/api/workspaces/[workspaceSlug]/automations/schedule` | POST | Schedule a cron-like automation via `runTool` (agent automation). |
| `/api/workspaces/[workspaceSlug]/bindings` | GET, POST | List or create integration/object bindings for the workspace. |
| `/api/workspaces/[workspaceSlug]/bindings/[bindingId]` | GET, PATCH, DELETE | Read, update, or delete a single binding. |
| `/api/workspaces/[workspaceSlug]/chat/select-image` | POST | Pick or attach an image for chat context (workspace-scoped). |
| `/api/workspaces/[workspaceSlug]/connections` | GET, POST | List workspace connections or create a new stored connection. |
| `/api/workspaces/[workspaceSlug]/connections/[connectionId]` | GET, PATCH, DELETE | Read, update, or delete one workspace connection record. |
| `/api/workspaces/[workspaceSlug]/connections/[connectionId]/test` | POST | Test connection credentials and connectivity. |
| `/api/workspaces/[workspaceSlug]/conversations` | GET, POST | List conversations or start a new Hermes-backed conversation. |
| `/api/workspaces/[workspaceSlug]/conversations/[conversationId]` | GET, PATCH, DELETE | Load, rename/archive, or delete a conversation. |
| `/api/workspaces/[workspaceSlug]/conversations/[conversationId]/generate-title` | POST | Auto-generate a title for a conversation via LLM. |
| `/api/workspaces/[workspaceSlug]/conversations/[conversationId]/messages` | GET, POST | Paginated messages or append a user/assistant message. |
| `/api/workspaces/[workspaceSlug]/crm/[entity]/export` | GET | Export CRM entity rows (CSV/stream) for people/companies/deals-style entities. |
| `/api/workspaces/[workspaceSlug]/crm/bootstrap` | POST | Bootstrap default CRM objects/fields for the workspace once. |
| `/api/workspaces/[workspaceSlug]/crm/bulk` | POST | Apply bulk mutations across CRM records in one request. |
| `/api/workspaces/[workspaceSlug]/crm/companies` | POST | Create a company CRM record under the workspace. |
| `/api/workspaces/[workspaceSlug]/crm/companies/[recordId]` | PATCH | Update one company CRM record. |
| `/api/workspaces/[workspaceSlug]/crm/companies/duplicates` | GET | Find likely duplicate companies for dedupe workflows. |
| `/api/workspaces/[workspaceSlug]/crm/deals` | POST | Create a deal CRM record. |
| `/api/workspaces/[workspaceSlug]/crm/deals/[recordId]` | PATCH | Update one deal CRM record. |
| `/api/workspaces/[workspaceSlug]/crm/demo-seed` | GET, POST, DELETE | Inspect, seed, or tear down demo CRM fixtures for demos. |
| `/api/workspaces/[workspaceSlug]/crm/merge` | POST | Merge duplicate CRM records into a survivor row. |
| `/api/workspaces/[workspaceSlug]/crm/people` | POST | Create a person CRM record. |
| `/api/workspaces/[workspaceSlug]/crm/people/[recordId]` | PATCH | Update one person CRM record. |
| `/api/workspaces/[workspaceSlug]/crm/people/duplicates` | GET | Find likely duplicate people for dedupe workflows. |
| `/api/workspaces/[workspaceSlug]/crm/query` | GET, POST | Flexible CRM query endpoint (filters/search across entities). |
| `/api/workspaces/[workspaceSlug]/crm/reports/activity` | GET | Activity-volume style CRM analytics for dashboards. |
| `/api/workspaces/[workspaceSlug]/crm/reports/forecast` | GET | Forecast-style CRM metrics for reporting UI. |
| `/api/workspaces/[workspaceSlug]/crm/reports/funnel` | GET | Funnel conversion report for pipeline stages. |
| `/api/workspaces/[workspaceSlug]/crm/reports/pipeline` | GET | Pipeline totals/stage breakdown report. |
| `/api/workspaces/[workspaceSlug]/crm/reports/velocity` | GET | Velocity / throughput metrics for deals or stages. |
| `/api/workspaces/[workspaceSlug]/crm/reports/win-rate` | GET | Win-rate style outcome metrics for CRM reporting. |
| `/api/workspaces/[workspaceSlug]/documents` | GET, POST | List documents or upload/create a document shell for records. |
| `/api/workspaces/[workspaceSlug]/documents/[recordId]` | PATCH, DELETE | Update document metadata or delete a document row. |
| `/api/workspaces/[workspaceSlug]/documents/[recordId]/analyze` | POST | Run document analysis/extraction over stored file content. |
| `/api/workspaces/[workspaceSlug]/documents/[recordId]/content` | GET | Fetch parsed text/content for a document-backed record. |
| `/api/workspaces/[workspaceSlug]/extraction-review` | GET, POST | Queue or list AI extraction review items for operator approval. |
| `/api/workspaces/[workspaceSlug]/extraction-review/[itemId]` | PATCH | Apply approve/reject edits to a single extraction review item. |
| `/api/workspaces/[workspaceSlug]/fields` | POST | Create a field on a workspace object (optional extraction config). |
| `/api/workspaces/[workspaceSlug]/fields/[fieldId]` | PATCH, DELETE | Update field definition or soft-remove a field. |
| `/api/workspaces/[workspaceSlug]/fields/[fieldId]/extraction-config` | GET, PUT, DELETE | Read, replace, or clear structured extraction configuration for a field. |
| `/api/workspaces/[workspaceSlug]/folders` | GET, POST | List root folders or create an import/board folder. |
| `/api/workspaces/[workspaceSlug]/folders/[folderId]` | PATCH, DELETE | Rename/move archive state or delete a folder. |
| `/api/workspaces/[workspaceSlug]/gateway/native` | GET, POST | Read or update Hermes native gateway flags (allowed users, enabled). |
| `/api/workspaces/[workspaceSlug]/imports` | GET, POST | POST bulk-import rows; GET recent import history rows. |
| `/api/workspaces/[workspaceSlug]/inbound/form` | POST | Public/workspace inbound handler for embedded web forms. |
| `/api/workspaces/[workspaceSlug]/inbound/meta` | POST | Meta (Facebook/Instagram) lead-gen webhook intake for the workspace. |
| `/api/workspaces/[workspaceSlug]/inbound/whatsapp` | POST | WhatsApp inbound webhook normalization for CRM/messaging. |
| `/api/workspaces/[workspaceSlug]/integrations` | GET, POST | List integrations or connect/register a new integration stub. |
| `/api/workspaces/[workspaceSlug]/integrations/[integrationId]` | GET, PATCH, DELETE | Read integration config, update secrets/settings, or disconnect. |
| `/api/workspaces/[workspaceSlug]/integrations/[integrationId]/recipes` | GET, DELETE | List automation recipes for an integration or delete recipe bindings. |
| `/api/workspaces/[workspaceSlug]/integrations/[integrationId]/test` | POST | Smoke-test an integration's OAuth/API connectivity. |
| `/api/workspaces/[workspaceSlug]/integrations/wizard` | POST | Run integration wizard steps (guided setup payloads). |
| `/api/workspaces/[workspaceSlug]/objects` | GET | List workspace objects (meta-model definitions). |
| `/api/workspaces/[workspaceSlug]/objects/[objectId]` | PATCH, DELETE | Update object metadata or archive/delete an object definition. |
| `/api/workspaces/[workspaceSlug]/records` | POST | Create a generic meta-model record row for an object. |
| `/api/workspaces/[workspaceSlug]/records/bulk` | POST | Bulk create/update/delete generic records in one request. |
| `/api/workspaces/[workspaceSlug]/records/query` | POST | Advanced query/filter across records for grids and APIs. |
| `/api/workspaces/[workspaceSlug]/records/[recordId]` | GET, PATCH, DELETE | Read, patch JSONB data, or delete one record. |
| `/api/workspaces/[workspaceSlug]/records/[recordId]/activities` | GET, POST | Timeline activities for a record or append a new activity entry. |
| `/api/workspaces/[workspaceSlug]/records/[recordId]/activities/[activityId]` | PATCH, DELETE | Edit or delete one activity row on a record timeline. |
| `/api/workspaces/[workspaceSlug]/sequences` | GET, POST | List outbound sequences or create/configure a sequence. |
| `/api/workspaces/[workspaceSlug]/sequences/[sequenceId]` | GET, PATCH, DELETE | Read, edit, or delete one sequence definition. |
| `/api/workspaces/[workspaceSlug]/sequences/[sequenceId]/enrollments` | GET, POST | List enrollments or enroll records into the sequence. |
| `/api/workspaces/[workspaceSlug]/sequences/[sequenceId]/enrollments/[enrollmentId]` | PATCH | Update enrollment state (pause, step, completion, etc.). |
| `/api/workspaces/[workspaceSlug]/skills` | GET, POST | List workspace skills from tap + disk; actions to fork/enable skills. |
| `/api/workspaces/[workspaceSlug]/tasks` | GET, POST | List workspace tasks or create a new task row. |
| `/api/workspaces/[workspaceSlug]/tasks/[taskId]` | PATCH, DELETE | Update task fields or delete a task. |
| `/api/workspaces/[workspaceSlug]/tasks/fields` | GET, POST | List task custom field definitions or register a new field. |
| `/api/workspaces/[workspaceSlug]/tasks/lists` | GET, POST | List task boards/lists or create a list. |
| `/api/workspaces/[workspaceSlug]/tasks/lists/[listId]` | PATCH, DELETE | Update list properties or delete a list. |
| `/api/workspaces/[workspaceSlug]/tasks/statuses` | GET, POST | List statuses or create a column status for Kanban lists. |
| `/api/workspaces/[workspaceSlug]/tasks/statuses/[statusId]` | PATCH, DELETE | Rename/reorder constraints or delete a task status. |
| `/api/workspaces/[workspaceSlug]/tasks/statuses/reorder` | POST | Bulk reorder Kanban statuses for a list. |
| `/api/workspaces/[workspaceSlug]/team-chat` | GET, POST | Workspace team chat: list channels/DMs/messages or post/create actions. |
| `/api/workspaces/[workspaceSlug]/templates` | GET, POST | List reusable templates or save a new template JSON. |
| `/api/workspaces/[workspaceSlug]/templates/[templateId]` | GET, PATCH, DELETE | Fetch, revise, or delete one template. |
| `/api/workspaces/[workspaceSlug]/views` | GET, POST | List saved views or persist a new view definition. |
| `/api/workspaces/[workspaceSlug]/views/[viewId]` | GET, PATCH, DELETE | Load, edit, or remove a saved view (filters/columns/etc.). |
| `/api/workspaces/[workspaceSlug]/webhooks/[webhookSlug]` | POST | Signed inbound webhook per connection -> `ingestConnectionPayload`. |
| `/api/workspaces/[workspaceSlug]/workflows` | GET, POST | List automation workflows or create a workflow graph. |
| `/api/workspaces/[workspaceSlug]/workflows/[workflowId]` | GET, PATCH, DELETE | Read workflow, update definition, or delete workflow. |
| `/api/workspaces/[workspaceSlug]/workflows/[workflowId]/runs` | GET, POST | List prior runs or manually enqueue/trigger a workflow run. |

Total normalized routes in inventory: **128**

### Appendix B - Tool Inventory by Namespace

Registered tool namespaces in [`lib/agentTools/tools`](lib/agentTools/tools):
- `crm.*` (record/person/company/deal/task/sequence operations)
- `records.*` + `objects.*`
- `schema.*`
- `integrations.*`
- `images.*`
- `automations.*` + `automation_schedule`
- `documents.*`
- `bindings.*`
- `connections.*`
- `peer.*` + `peer_delegate`
- `agents.*`
- `skills.*`
- `recipes.*`
- `cms.*`

Policy preset coverage in [`lib/agentTools/mcpPolicy.ts`](lib/agentTools/mcpPolicy.ts):

| Namespace | intake preset | sales preset | ops preset | Notes |
|---|---|---|---|---|
| general | yes | yes | yes | includes non-dotted tools like `peer_delegate` |
| objects/schema/records/crm/documents/images/integrations | yes | yes | yes | core data + utility |
| recipes/automations | no | yes | yes | absent for intake |
| bindings | no | no | yes | ops-focused |
| cms | no | no | yes | conflicts with "always in scope" prompt wording |
| skills | no | no | yes | ops-focused by policy |
| peer/connections/agents | policy-dependent via include/exclude | policy-dependent | policy-dependent | not in base namespace presets |

### Appendix C - Evidence Snippets

```24:29:app/api/agent-tools/run/route.ts
const cookieHeader = request.headers.get("cookie") ?? undefined;
const result = await runTool({
  name,
  args,
  ctx: { workspaceSlug, origin, cookieHeader },
});
```

```49:52:app/api/workspaces/[workspaceSlug]/webhooks/[webhookSlug]/route.ts
const providedToken = readProvidedToken(request);
const expectedToken = (connection.webhookToken ?? "").trim();
if (expectedToken && providedToken !== expectedToken) {
```

```20:21:supabase/migrations/20260426_000004_workspace_clearance_and_audit.sql
add column if not exists clearance_level integer default 2,
```

```49:49:app/api/workspaces/[workspaceSlug]/records/route.ts
      requiredClearanceLevel: 3,
```

```214:215:app/api/workspaces/[workspaceSlug]/agents/[agentId]/mcp-config/route.ts
mcp_servers.prisma_internal = buildMcpServerConfig({
  url: new URL("/api/mcp/prisma", request.url).toString(),
```

```4543:4558:components/workspace/WorkspacePanels.tsx
async function sendTestMessage() {
  const response = await fetch(`/api/workspaces/${workspaceSlug}/agents/${selectedAgent.id}/builder-turn`, {
```

```5:5:lib/workspaceNav.ts
export const AGENT_OPS_UI_ENABLED = false;
```

```378:378:components/workspace/inbox/InboxPanel.tsx
const seed = useMemo(() => createInboxMockState(workspaceSlug), [workspaceSlug]);
```
