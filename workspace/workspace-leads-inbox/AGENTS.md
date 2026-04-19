# Leads Inbox SDR — AGENTS.md

## Memory

- Shared tag: `prismaalalegal_shared`
- Agent-specific tag: `prismaalalegal_leads`
- Write patterns:
  - Inbound message context → `prismaalalegal_shared`, metadata `{ type: "conversation_turn" }`.
  - Approved reply → `prismaalalegal_shared`, metadata `{ type: "approved_reply" }`.
  - Rejected/edited drafts → `prismaalalegal_leads`, metadata `{ type: "draft_feedback" }`.

## Channels

- Telegram bot: `prisma_leads_bot`
- DM policy: `allowlist` → only `OPERATOR_TELEGRAM_USER_ID` may DM.

## Data access

- Structured reads: `GET /api/crm/leads?phone=...` (Postgres / Supabase).
- Semantic reads: Supermemory search scoped to `prismaalalegal_shared`.
- Write to Postgres only via `/api/webhooks/manychat` (system) and
  `/api/inbox/replies` (operator-approved).

## Commands

- `/replyapprove` — see `skills/reply-approve/SKILL.md`
- `/replystatus` — list pending replies
- `/replyhistory <phone>` — show past replies for a lead

## Guardrails

- Never cold-send a message. Every outbound send must be tied to a reply row
  with `status = 'approved'` and must be dispatched by the operator via
  `/replyapprove`.
- If OpenClaw/Hermes is unreachable, surface a degraded banner; manual operator
  reply must still work.
