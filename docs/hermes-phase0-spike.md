# Hermes Phase 0 Spike Notes

This document captures the pre-build validation required by Phase 0 of the
`hermes-multi-agent-spine` plan.

## Scope

1. Verify whether `AIAgent` can be instantiated per request with tenant-aware
   `HERMES_HOME` isolation.
2. Source-dive Hermes adapter alternatives (`api_server`, `webhook`) so they can
   be used as fallback references without becoming the primary path.

## AIAgent Library-Mode Findings

Source inspected: upstream `run_agent.py` (`AIAgent` implementation).

- `AIAgent` accepts externally supplied session controls (`session_id`,
  `session_db`, `parent_session_id`, `gateway_session_key`) and can run as a
  normal Python object, not only through CLI entrypoints.
- Persistent artifacts are resolved through Hermes home helpers (`get_hermes_home`)
  and include:
  - session logs under `~/.hermes/sessions`
  - response/session stores under Hermes home
  - memory provider initialization context (`hermes_home`, `session_id`,
    agent identity)
- Memory/provider initialization and tool surface setup happen at instance
  construction time. This supports per-request persona composition if each request
  is given an isolated home and config.
- Risk: module-level imports still initialize dotenv/home helpers, so process-global
  caching can leak if a long-lived process mutates home paths unsafely.

### Decision

- Primary mode remains library-mode `AIAgent` in the shim.
- Isolation guardrail: the shim resolves one workspace home per request and
  serializes runtime init context for that request.
- Hard fallback remains subprocess-per-request if leakage appears in production.

## Adapter Alternatives Findings

Sources inspected:

- `gateway/platforms/api_server.py`
- `gateway/platforms/webhook.py`

### `api_server` adapter

- Exposes OpenAI-compatible routes:
  - `POST /v1/chat/completions`
  - `POST /v1/responses`
  - response retrieval/delete endpoints
- Exposes cron job REST management (`/api/jobs/*`) and SSE run events.
- Uses `aiohttp` and internally routes into `AIAgent`.
- Supports streamed tool progress in SSE pathways.
- Persists response/session state in Hermes-home-scoped SQLite stores.

### `webhook` adapter

- Exposes `POST /webhooks/{route_name}`.
- Validates HMAC signatures, applies event filtering, idempotency controls, and
  payload-to-prompt rendering.
- Useful for inbound webhook fan-in scenarios; not designed as a direct
  replacement for Prisma's chat transport.

### Decision

- Neither adapter becomes Prisma's primary runtime path.
- FastAPI shim remains primary because it gives strict request-shape control,
  tenant auth integration, and minimal coupling to undocumented gateway behavior.
- `api_server` and `webhook` stay as fallback references for:
  - SSE event schema alignment
  - webhook async delivery ideas
  - cron job API compatibility checks
