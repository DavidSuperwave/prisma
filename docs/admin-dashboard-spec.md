# Prisma Admin Dashboard Spec

## Information architecture

### `/admin`
- Platform KPI cards: workspaces, templates, sites, agents, deployments, provisioning jobs.
- Latest provisioning activity feed.

### `/admin/clients`
- Workspace list (client accounts).
- Per-workspace project and site counts.
- Intended next step: workspace members and role assignments.

### `/admin/templates`
- Template registry and vertical coverage.
- Section schema count per template.
- Intended next step: visual template editor with versioning.

### `/admin/agents`
- Agent definition inventory (role, model, workspace).
- Intended next step: prompt/tool editor and role presets.

### `/admin/deployments`
- Runtime deployment inventory (droplet host, container name, status).
- Intended next step: restart/rollout controls and health logs.

### `/admin/usage`
- Usage event stream.
- Provisioning queue visibility.
- Intended next step: billing-usage counters and SLA alerts.

## Intake provisioning states

- `submitted`: intake captured, files uploaded, provisioning queued.
- `paid`: Stripe webhook confirms payment.
- `reviewing`: workspace/project/site draft created and ready for operator review.
- `ready_to_publish`: operator has approved content and branding.
- `published`: landing site released to subdomain.

## Initial role model

- `owner`: full tenant control and billing.
- `admin`: manage users, templates, and deployments.
- `operator`: day-to-day onboarding and content edits.
- `viewer`: read-only workspace access.
- `client`: restricted client-side access.

## Security baseline

- Enforce workspace boundaries in API reads/writes.
- Keep service-role operations inside control-plane backend.
- Pass short-lived scoped tokens to runtime agents.
- Avoid shared unrestricted DB keys inside hErmes containers.

## Current product maturity notes (UI/UX scope)

- Agent canvas is functional but not complete:
  - No full deploy/restart controls yet.
  - No rich editor yet.
  - No advanced validation yet.
  - No emergency admin pause/stop flow yet.
- Team chat is foundational, not complete:
  - No threaded replies yet.
  - No read receipts yet.
  - No search yet.
  - No notifications yet.
  - No record preview cards yet.
  - No persistent member directory UX yet.
- CRM is bootstrap-level, not full product-level:
  - No dedicated three-column CRM record detail yet.
  - No board/kanban pipeline yet.
  - No rich associations UI yet.
  - No activity-specific CRM views yet.
- Dashboard builder via conversation is partially realized:
  - Quick actions can create presets.
  - Copilot does not yet parse/confirm/execute arbitrary dashboard-building requests from conversation content.

## Follow-up testing still needed

- Multi-user isolation for team chat.
- Richer CRUD coverage around CRM records.
- Cross-workspace security checks for the workspace action routes.
- End-to-end flows combining team chat + agents + CRM updates.
