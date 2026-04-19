---
name: prisma-reply-approve
description: Operator approval flow for agent-drafted replies. Lets the leads-inbox agent (or a Telegram operator via the leads bot) approve, edit, or list pending replies and dispatch them via ManyChat. Backed by the `crm_replies` table and the `/api/inbox/replies` REST endpoints. Also records approved replies into Supermemory for calibration.
---

# prisma-reply-approve

This skill is owned by the **leads-inbox** agent. It implements three operator
commands and their REST backings.

## Commands

| Command              | Behavior                                                     |
|----------------------|--------------------------------------------------------------|
| `/replyapprove`      | Approve the most recent pending reply for the active lead    |
| `/replystatus`       | List all pending replies across conversations                |
| `/replyhistory <ph>` | Show approved + sent replies for the given phone/subscriber  |

### Two approval flows

1. **Agent draft accepted** — operator types `/replyapprove`. The skill picks
   the latest `crm_replies` row with `status='pending'` for that conversation,
   marks it `approved`, sends the `agent_draft` text via ManyChat, stamps
   `sent_at`, and mirrors the result to Supermemory as an
   `approved_reply` memory.
2. **Operator override** — operator types their own reply text in the
   Telegram channel. The bot captures it and stores it as `operator_edit` on
   the current pending row. When the operator then types `/replyapprove`, the
   final outbound text is `operator_edit`, not `agent_draft`. Both values are
   preserved for post-hoc learning.

## REST endpoints

| Method | Path                                       | Purpose                                    |
|--------|--------------------------------------------|--------------------------------------------|
| GET    | `/api/inbox/replies?status=pending`        | List pending replies (optionally by lead)  |
| GET    | `/api/inbox/replies?phone=+52...`          | History for a lead                         |
| POST   | `/api/inbox/replies/:id/approve`           | Send via ManyChat + mark `sent`            |
| POST   | `/api/inbox/replies/:id/edit`              | Attach `operator_edit` text                |
| POST   | `/api/inbox/replies/:id/cancel`            | Mark `cancelled` without sending           |

All routes require a workspace membership (RLS enforced by Supabase).

## Memory side-effects

On successful approval, the skill writes to Supermemory with:

```json
{
  "containerTags": ["prismaalalegal_shared"],
  "metadata": {
    "type": "approved_reply",
    "workspace_id": "<uuid>",
    "conversation_id": "<uuid>",
    "lead_id": "<uuid>",
    "phone": "<e164>",
    "operator_edited": true | false,
    "agent_draft": "<string>",
    "final_text": "<string>"
  }
}
```

Supermemory write failures are logged but do not block the ManyChat send; the
authoritative record is the `crm_replies` row.

## Guardrails

- Archived conversations (`crm_conversations.status != 'active'`) must refuse
  approval. The API returns HTTP 409 and the skill tells the operator to
  unarchive first.
- If ManyChat send fails (non-2xx), the reply row is marked `failed` with the
  provider error stored in `error`, and the operator is notified. The row is
  still visible in the UI for retry.
- The skill never invents recipients: it only acts on rows linked to an
  existing `crm_conversations.lead_id`.
