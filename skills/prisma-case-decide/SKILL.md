---
name: prisma-case-decide
description: Operator commands used by the qualified-leads agent to accept or reject a qualified case. Moves the lead's `pipeline_stage` to `accepted` or `rejected` and records the decision in Supermemory under `prismaalalegal_shared` so future qualifications calibrate against past outcomes.
---

# prisma-case-decide

Owned by the **qualified-leads** agent. Implements three operator commands:

| Command                   | Behavior                                                            |
|---------------------------|---------------------------------------------------------------------|
| `/caseaccept`             | Move the current lead to `pipeline_stage='accepted'`                |
| `/casereject <reason>`    | Move the current lead to `pipeline_stage='rejected'` with a reason  |
| `/casereview <phone>`     | Force re-evaluation of a previously rejected/skipped lead           |

## REST backings

| Method | Path                                         | Purpose                        |
|--------|----------------------------------------------|--------------------------------|
| POST   | `/api/inbox/cases/:leadId/accept`            | Accept a case                  |
| POST   | `/api/inbox/cases/:leadId/reject`            | Reject a case with reason      |
| POST   | `/api/inbox/cases/:leadId/review`            | Reset pipeline for review      |

All routes require workspace membership.

## Payloads

```json
POST /api/inbox/cases/:leadId/accept
{
  "practiceArea": "personal_injury",
  "keyFactors": ["clear_liability", "high_damages"],
  "notes": "..."
}
```

```json
POST /api/inbox/cases/:leadId/reject
{
  "reason": "Statute of limitations expired",
  "keyFactors": ["sol_expired"]
}
```

## Memory side-effects

Each accepted/rejected decision is mirrored to Supermemory with
`containerTags: ["prismaalalegal_shared"]` and metadata:

```json
{
  "type": "case_decision",
  "decision": "accepted" | "rejected",
  "lead_id": "<uuid>",
  "phone": "<e164>",
  "workspace_id": "<uuid>",
  "practice_area": "...",
  "key_factors": ["..."],
  "reason": "..."         // only on reject
}
```

On subsequent qualification runs, the agent searches this tag for
`type=case_decision` entries with matching `practice_area` / `phone` /
similar-reason patterns, and uses them to calibrate its confidence.

## Guardrails

- Route returns 404 if the lead doesn't exist in the caller's workspace.
- Already-accepted / already-rejected leads return 409 `code=already_decided`
  unless the caller explicitly uses `/casereview`.
- `/casereview` only resets `pipeline_stage` back to `new_lead`; it does not
  erase the prior decision from Supermemory (history preserved for learning).
