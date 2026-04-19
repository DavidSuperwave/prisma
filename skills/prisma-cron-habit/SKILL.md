---
name: prisma-cron-habit
description: Own recurring work through Hermes' native `cronjob` tool instead of Prisma's `/api/cron/*` routes. Cover 5-field cron syntax, recovery plans, and safe dry-run-first authoring of destructive schedules.
---

# prisma-cron-habit

Use this skill whenever the operator describes **recurring work** ("every
morning", "day 10 of the month", "every 30 minutes", "each Monday at 9"). In
Phase 4 of Prisma, recurring work that the agent can do through its own tools
lives in Hermes `cronjob`, not in Prisma's platform cron routes.

## Preferred tool

- **Primary**: Hermes' native `cronjob` — the agent owns the schedule, tool
  chain, and recovery plan. Execution shows up in the agent's session logs.
- **Fallback** (`automations.*`): ONLY if the recurring work is a Prisma-native
  engine — CRM sequences (`crm.enroll_in_sequence`) or smart-view refreshes.
  Those stay inside Prisma because the engine ticks them.
- **Do NOT** point the user at `/api/cron/lead-score-refresh`,
  `/api/cron/sequence-tick`, `/api/cron/tasks-recurring`, or
  `/api/cron/workflow-tick`. Those are platform jobs, already wired to Vercel
  cron, and are tracked for sunset in `docs/hermes-cron-migration-plan.md`.

## 5-field cron syntax

Hermes uses standard 5-field cron: `minute hour day-of-month month day-of-week`.

| Schedule | Cron |
|---|---|
| Every 30 minutes | `*/30 * * * *` |
| Every day at 08:00 | `0 8 * * *` |
| Day 10 of every month at 09:00 | `0 9 10 * *` |
| Every Monday at 07:00 | `0 7 * * 1` |

Timezone defaults to the workspace timezone; pass `timezone` explicitly when the
operator mentions one.

## Required arguments

Every `cronjob` call MUST include:

- `name`: short human-readable identifier, e.g. `"bbc-portal-morning-sweep"`.
- `schedule`: 5-field cron string.
- `plan`: ordered list of Prisma MCP tool calls the cron should execute.
- `recovery_plan`: what to do if a tick is missed or a step fails. At minimum:
  "Log to Prisma activity; on next tick, resume from the failed step and alert
  the operator via `crm.add_task` if two ticks fail in a row."
- Optional: `timezone`, `max_runtime_seconds`, `overlap: false`.

## Dry-run-first for destructive schedules

Any cron whose plan writes, sends, posts, or publishes MUST be authored in two
passes:

1. **First author**: every destructive step uses `dryRun: true`. Surface the
   WriteProposalCard so the operator can approve the plan. Do not schedule yet.
2. **After approval**: either
   - replay the exact same plan with a stored `confirmToken` so the cron runs
     with `dryRun: false`, or
   - call `skills.publish_automation` to persist the approved plan as a named
     template, then reference that template from the cron.

Read-only steps (`records.query`, `browser.portal_check`, `documents.analyze`)
do not need this gate.

## Examples

### Poll BBC portal every morning at 08:00

```
{"type":"tool_call","id":"c1","name":"cronjob","args":{
  "name":"bbc-portal-morning-sweep",
  "schedule":"0 8 * * *",
  "plan":[
    {"tool":"browser.portal_check","args":{"slug":"bbc-supplier-portal"}},
    {"tool":"documents.analyze","args":{"source":"$1.latest_document"}},
    {"tool":"records.create","args":{
      "object":"bbc_alerts",
      "data":"$2.summary",
      "dryRun":false
    }}
  ],
  "recovery_plan":"If portal_check fails, retry on next tick. If documents.analyze fails twice in a row, add a task via crm.add_task and skip records.create."
}}
```

Step 3 is destructive, so on the first authoring pass it uses `dryRun: true`
until the operator approves. `records.create` only flips to `dryRun: false`
after the WriteProposalCard confirmation.

### Publish Ford promos on day 10 at 09:00

```
{"type":"tool_call","id":"c2","name":"cronjob","args":{
  "name":"ford-monthly-promo-publish",
  "schedule":"0 9 10 * *",
  "plan":[
    {"tool":"records.query","args":{
      "object":"promos",
      "filters":{"brand":"ford","status":"ready"}
    }},
    {"tool":"cms.publish","args":{
      "source":"$1",
      "channel":"ford-site",
      "dryRun":false
    }}
  ],
  "recovery_plan":"If no ready promos are found, log an activity entry and skip. If cms.publish returns a 5xx, retry once after 10 minutes via the next tick; otherwise open a task."
}}
```

First pass authors `cms.publish` with `dryRun: true`. After the operator
approves, publish the plan as a template with `skills.publish_automation` and
reference it from the cron so subsequent ticks run live.

## When to pick `automations.*` instead

Use `automations.*` (NOT `cronjob`) when:

- Enrolling records into a CRM **sequence** — Prisma's sequence engine owns
  the tick cadence.
- Recomputing a **smart view** that Prisma already refreshes on a schedule.

For everything else — portal polls, document analyses, outbound messaging,
scheduled CRM maintenance — prefer `cronjob`.

## Related

- [`prisma-agent-tools`](../prisma-agent-tools/SKILL.md) — tool envelope contract and confirm-token flow.
- [`prisma-integrations`](../prisma-integrations/SKILL.md) — credentials used by cron steps that hit 3rd-party APIs.
- `docs/hermes-cron-migration-plan.md` — decision matrix for retiring Prisma's platform cron routes.
