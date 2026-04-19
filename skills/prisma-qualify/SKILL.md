---
name: prisma-qualify
description: Qualify inbound leads from workspace_tasks, score intent, and route follow-up actions.
---

# prisma-qualify

Use this skill when new inbound leads enter `workspace_tasks` and need triage.

## Objective

- Read pending inbound tasks (`type = inbound_lead`)
- Score and classify lead quality
- Update/create lead records in `records`
- Route ownership and next actions through `workspace_tasks`

## Required inputs

- `workspace_id` (UUID)
- Inbound task payload (`channel`, contact info, message/body)
- Qualification rubric (default or client-specific variant)

## Qualification rubric (default)

Score 0-100:

- **Urgency (0-30)**: explicit timeline, immediate need, active request
- **Fit (0-30)**: use case matches offered workflow automation
- **Budget/intent (0-25)**: asks for proposal/demo/pricing
- **Contact quality (0-15)**: valid phone/email/company context

Recommended bands:

- `80-100`: hot -> assign immediately, high priority follow-up task
- `50-79`: warm -> schedule callback/task within 24h
- `0-49`: cold -> keep in nurture queue

## Write contract

1. Update CRM person record via `PATCH /api/workspaces/[slug]/crm/people/[recordId]`:
   - `stage` (use the locked key `stage`, valid values: `lead`, `qualified`, `opportunity`, `customer`, `unqualified`) — do NOT invent new keys or overwrite `stage` with free text.
   - `data.qualification_score` (number 0-100)
   - `data.qualification_band` (`hot|warm|cold`)
   - `owner_user_id` when assignment is known
2. Update task metadata with score rationale (via `PATCH /api/workspaces/[slug]/tasks/[taskId]`).
3. Add a `note` or `status_change` activity describing the qualification rationale (`POST /records/[recordId]/activities`). Stage changes are auto-logged by the CRM API when you transition `stage`.
4. If escalation needed, create a follow-up task with `recordId` set and a due date.

## Guardrails

- Never overwrite confirmed owner assignments without an explicit escalation reason.
- If source data is missing required identifiers, mark task `needs_review` instead of guessing.
- Keep all writes scoped to the same workspace.
- Always write via the `prisma-crm` endpoints, not `prisma-records`. The generic records endpoint bypasses dedupe and activity logging and will create duplicate people.

## Output format

Return concise result:

- processed task ID
- record ID touched
- score + band
- action taken (assigned / queued / nurture)
