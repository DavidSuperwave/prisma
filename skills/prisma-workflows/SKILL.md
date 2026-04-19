---
name: prisma-workflows
description: Define and operate Prisma workflows (trigger-action automations) and sequences (multi-step outreach cadences) scoped to a single workspace.
---

# prisma-workflows

Use this skill when the user wants to automate work in response to CRM events — e.g. "when a lead stage moves to qualified, send a WhatsApp and create a task" or "enroll every new person in the onboarding cadence."

## Trigger-action model

A workflow has:

- `trigger`: event that fires the workflow. Supported events:
  - `lead.created`, `lead.stage_changed`, `lead.qualified`, `lead.lost`
  - `deal.created`, `deal.stage_changed`, `deal.won`, `deal.lost`
  - `contact.created`, `contact.updated`
  - `task.created`, `task.completed`, `task.overdue`
  - `form.submitted`, `whatsapp.received`, `meta.lead_received`
- `conditions` (optional): array of `{ field, operator, value }` filters against the triggering record.
- `actions`: ordered array. Supported action types:
  - `send_email` (uses a template), `send_sms`, `send_whatsapp`
  - `update_record` (set fields on the triggering record)
  - `create_task`, `create_deal`, `create_note`
  - `agent_handoff` (enqueue a hand-off via `workspace_tasks` for a specific agent)

Each action runs inside a `workspace_workflow_runs` record which tracks retries, last status, and errors.

## Templates

`workspace_templates` stores email/sms/whatsapp templates with merge tags:

- `{{first_name}}`, `{{full_name}}`, `{{email}}`, `{{phone}}`
- `{{company.name}}`, `{{company.domain}}`
- `{{deal.amount}}`, `{{deal.stage}}`, `{{deal.expected_close_date}}`
- `{{owner.name}}`

Templates are referenced by actions (`send_email` → `templateId`) and can also be used from the manual send UI.

## Sequences (cadences)

`workspace_sequences` + `workspace_sequence_enrollments` model a multi-step outreach:

- Step kinds: `send` (email/sms/whatsapp with template), `wait` (duration in hours/days), `branch` (conditional split).
- Enrollments advance automatically when due; manual pause/resume/exit is always available.
- Enroll from a smart view (bulk) or from an individual record page.

## Safe execution rules

- Only admins can create/modify workflows. Operators can enable/disable existing ones.
- A workflow MUST NOT fire on events triggered by itself (the engine flags re-entrancy).
- `update_record` must only touch fields that belong to the triggering object; unknown keys are rejected.
- Destructive actions (delete record, mass-update) are NOT supported via workflows. Use an explicit bulk operation instead.

## Authoring checklist

1. Define the trigger and the minimal conditions that should fire it.
2. Write the smallest possible action chain (1-3 actions is typical).
3. Reference templates by ID; never inline long message bodies.
4. Dry-run on a sample record if available; verify the workflow run log before enabling.
5. Document the business intent in the workflow `description` so other admins understand why it exists.
