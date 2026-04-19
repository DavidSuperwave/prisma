# Hermes Cron Migration Plan

## Context

Prisma currently runs four platform cron routes, all gated by `CRON_SECRET`
and triggered by Vercel's platform scheduler:

- `app/api/cron/lead-score-refresh`
- `app/api/cron/sequence-tick`
- `app/api/cron/tasks-recurring`
- `app/api/cron/workflow-tick`

Under Phase 4 of the agent-as-canvas plan, recurring work that the agent can
drive through its own Prisma MCP tools moves to Hermes' native `cronjob`. This
keeps the schedule, tool chain, and recovery plan owned by the agent (and
visible in its session logs) instead of hidden in a Vercel function.
Infrastructure-level jobs that are not agent-shaped stay in Prisma.

This doc is the sunset plan. **No routes are deleted by this document.**

## Decision matrix

| Route | Owner | Status | Hermes replacement |
|---|---|---|---|
| `/api/cron/lead-score-refresh` | platform | **stays** | none — batch health job |
| `/api/cron/sequence-tick` | agent | **replace** | `cronjob` + `crm.enroll_in_sequence` |
| `/api/cron/tasks-recurring` | agent | **replace** | `cronjob` + `crm.add_task` |
| `/api/cron/workflow-tick` | platform | **stays for now** | revisit in Phase 5 once the workflow engine is agent-driven |

"Replace" means the agent authors a Hermes `cronjob` that performs the same
effect through Prisma MCP tools; the Vercel route is retired only after the
migration steps below complete.

## Migration steps (per replaceable job)

For each route marked **replace**:

1. **Confirm tool access.** Ensure the workspace agent has the relevant Prisma
   MCP tools. The `ops` role preset covers `crm.enroll_in_sequence` and
   `crm.add_task`. Verify via the agent's `mcp-config` endpoint
   (`/api/workspaces/<slug>/agents/<agentId>/mcp-config`).
2. **Author the cron via the agent.** Use `cronjob` with a descriptive `name`,
   a 5-field `schedule`, an explicit tool `plan`, and a `recovery_plan`. The
   `prisma-cron-habit` skill has worked examples. Destructive steps start
   with `dryRun: true` and are promoted only after operator approval.
3. **Observe a few ticks.** Confirm execution through Hermes session/activity
   logs and — optionally — the Prisma activity feed.
4. **Flip the Vercel route to a no-op.** For one release, the handler returns
   `200` immediately and logs a single deprecation line (e.g.
   `console.warn("[deprecated] /api/cron/sequence-tick — use Hermes cronjob")`).
   Do NOT remove the route in the same release.
5. **Delete the route.** After one clean release with the no-op in place and
   no regressions reported, remove the route directory and its entry from the
   Vercel cron config.

## Verification checklist

An operator can confirm a migrated cron is healthy by:

- **Hermes**: `cronjob list` shows the job, last run timestamp, and success
  status. Recent runs have no errors and executed every tool in the plan.
- **Prisma activity feed**: the workspace `/api/workspaces/<slug>/activity`
  feed shows tool calls that match the cron's plan around the expected tick
  times.
- **Supabase (optional)**: query `activity` for the corresponding
  `workspace_id` and filter to the window around the tick, e.g.
  ```sql
  select created_at, actor_type, action, metadata
  from activity
  where workspace_id = '<uuid>'
    and created_at > now() - interval '1 day'
  order by created_at desc;
  ```
  Look for `actor_type = 'agent'` rows whose `action` matches the cron's tool
  chain (`crm.add_task`, `crm.enroll_in_sequence`, etc.).
- **Old route**: confirm the corresponding Vercel cron hit logs only the
  deprecation line for the transition release, then disappears entirely after
  deletion.

## Related

- `skills/prisma-cron-habit/SKILL.md` — operator-visible guidance the agent
  follows when authoring `cronjob` schedules.
- `skills/prisma-integrations/SKILL.md` — vault + credentials used by cron
  steps that call 3rd-party APIs.
- `docs/hermes-extensions-e2e-runbook.md` — broader Phase 1–4 e2e context.
