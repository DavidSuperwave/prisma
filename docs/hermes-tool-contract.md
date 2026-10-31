# Hermes Tool Execution Contract

This repository enforces a single tool execution path for workspace chat:

1. Hermes emits `tool_call` envelopes in `/api/chat`.
2. Prisma normalizes the tool name/args and resolves aliases to a registry name.
3. Prisma executes the call once through `lib/agentTools/executor.ts` (`runTool`).
4. Prisma streams a `tool_result` frame back into the same Hermes turn.

## Guardrails

- No direct user-visible image shortcut path runs before Hermes by default (`PRISMA_ENABLE_IMAGE_SHORTCUTS=false`).
- Deprecated builder route (`/builder-turn`) returns compatibility `410` unless explicitly re-enabled.
- Aliases exist only to map common Hermes/native naming drift to a valid Prisma registry tool (for example `image_generate` -> `images.generate`).
- Shim delegation/cron placeholders are gated by env flags:
  - `PRISMA_ENABLE_SHIM_DELEGATE=true`
  - `PRISMA_ENABLE_SHIM_CRON=true`

## Why this matters

Keeping one execution loop prevents duplicate side effects (for example one write in Hermes-native path and another in Prisma inline tools) and keeps audit/history behavior consistent.
