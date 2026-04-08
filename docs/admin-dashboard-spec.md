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
- Avoid shared unrestricted DB keys inside OpenClaw containers.
