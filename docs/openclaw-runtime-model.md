# OpenClaw Runtime Model (Shared Droplet)

## Goal
Run multiple isolated OpenClaw instances on one droplet while preserving strict client separation and centralized control from Prisma dashboard.

## Isolation model

- One container per workspace or per workspace-role pair.
- Separate environment payload per container (`env_secret_ref`).
- Dedicated container name convention: `openclaw-{workspace_slug}-{role}`.
- Network-level isolation via per-service routing and explicit inbound webhook mapping.

## Data access model

- Agent containers do not receive broad Supabase service-role keys.
- Containers call Prisma internal APIs with short-lived workspace-scoped tokens.
- Control plane validates token claims and executes privileged DB writes.
- Workspace IDs are required on every mutable operation.

## Control-plane entities

- `agent_definitions`: source-of-truth for prompts, models, tools, integration config.
- `agent_deployments`: runtime state (host, container, image, version, health, status).
- `usage_events`: execution, message, and deployment telemetry.

## Deployment workflow

1. Operator creates/updates agent definition.
2. Control plane generates runtime config bundle.
3. Provisioning service deploys/restarts target container on droplet.
4. Deployment status and health are written to `agent_deployments`.
5. Runtime actions produce `usage_events` for observability and billing.

## Future hardening

- Signed deployment manifests and checksum validation.
- Secret rotation jobs per workspace.
- Runtime attestation and policy checks before rollout.
- Blue/green or canary deployment strategy for production agents.
