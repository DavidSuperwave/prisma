# Qualified Leads — AGENTS.md

## Memory

- Shared tag: `prismaalalegal_shared`
- Agent-specific tag: `prismaalalegal_cases`
- Writes:
  - Accepted case → `prismaalalegal_shared`, metadata `{ type: "case_decision", decision: "accepted" }`.
  - Rejected case → `prismaalalegal_shared`, metadata `{ type: "case_decision", decision: "rejected", reason: "..." }`.
  - Calibration notes (e.g., "similar to accepted case Y") → `prismaalalegal_cases`.

## Channels

- Telegram bot: `prisma_qualified_bot`
- DM policy: `allowlist` → only `OPERATOR_TELEGRAM_USER_ID` may DM.

## Data access

- Structured pipeline writes: `PATCH /api/crm/leads/:id` with `pipeline_stage`
  set to `accepted` or `rejected`.
- Reads: `GET /api/crm/leads`, `GET /api/inbox/replies`.

## Commands

- `/caseaccept` — see `skills/case-accept/SKILL.md`
- `/casereject <reason>` — see `skills/case-reject/SKILL.md`
- `/casereview <phone>` — re-evaluate a previously skipped or rejected lead.

## Qualification heuristics (reference)

1. Practice area must match the firm's configured matters.
2. Damages or opportunity_value above the configured threshold.
3. Jurisdiction matches firm's operating states.
4. Statute of limitations has not expired.

All heuristics should be backed by examples pulled from
`prismaalalegal_shared` past case decisions (both accepted and rejected) so
confidence calibrates over time.
