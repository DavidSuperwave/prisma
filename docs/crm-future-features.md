# CRM — Deferred Features & Productionization

Last updated: 2026-04-17

This file is the canonical "things we explicitly deferred" list so nothing falls
off. Items here are implemented partially (stubs, hidden UI) or not at all, by
deliberate choice.

## How to re-enable an item

- Hidden agent-ops UI: flip `AGENT_OPS_UI_ENABLED` in `lib/workspaceNav.ts` to `true`.
- Cron jobs: add a `vercel.json` with a `crons:` block pointing at `/api/cron/*`.
- Outbound channels: implement the provider inside `lib/workflows/engine.ts` where
  `send_email / send_sms / send_whatsapp` currently emit `outbound_<channel>_stub`
  events.

## 1. Outbound delivery providers (BLOCKING for live sequences / workflows)

Email, SMS, and WhatsApp sends are currently stubs that only emit
`outbound_email_stub` / `outbound_sms_stub` / `outbound_whatsapp_stub` events
(no real delivery). Recommended providers: SES or Resend for email, Twilio for
SMS, `hermes-sidecar` (Baileys bridge) for WhatsApp. Wiring point is the
`executeStep` switch in `lib/workflows/engine.ts` — replace the stub emissions
with provider calls, persist delivery ids, and log failures back as activity.

## 2. Cron / scheduler wiring

Three endpoints exist and are idempotent but are never invoked:
`/api/cron/workflow-tick`, `/api/cron/sequence-tick`, `/api/cron/lead-score-refresh`.
There is no `vercel.json` yet. Suggested schedules:
`workflow-tick * * * * *`, `sequence-tick * * * * *`, `lead-score-refresh 0 3 * * *`.
Add the `crons` block to `vercel.json` at the repo root and set
`CRON_SECRET` for bearer-token auth on the endpoints.

## 3. Hidden agent-ops UI (temporarily disabled in sidebar)

- Plantillas — `/crm/templates`
- Workflows — `/crm/workflows`
- Secuencias — `/crm/sequences`
- `EnrollInSequenceButton` on record detail page

All routes and APIs remain live; only the sidebar entries and the record-page
enrol button are hidden. Flip `AGENT_OPS_UI_ENABLED` in `lib/workspaceNav.ts`
to re-expose.

## 4. Unified email / inbox view (Close-style)

Not started. Thread inbound emails onto contacts via an IMAP/Gmail integration,
surface a per-contact thread in the record detail page, and let reps reply from
the app. Needs an `email_threads` + `email_messages` schema and inbound webhook
wiring in `lib/inbound/`.

## 5. Round-robin / assignment rules

Not started. Assign inbound leads to sales reps by rotation + availability +
territory. Lives naturally inside `lib/workflows/engine.ts` as a new
`assign_owner` action fed by a `workspace_assignment_rules` table.

## 6. Calendar / booking integration

Not started. Public per-rep booking link, two-way sync with Google / Microsoft
calendars, and auto-created `activities` of type `meeting` on booking.

## 7. Click-to-call / power dialer

Not started. Close-parity — WebRTC softphone (Twilio Voice or Vonage), call
recording, transcription, and auto-logged `call` activities on the record.

## 8. SLA rules + escalation

Not started. Time-bound response targets per stage/owner with escalation tasks
when breached. Naturally implemented as a workflow template fed by a
`workspace_sla_rules` table.

## 9. Multi-pipeline selector in DealsView

Schema already supports multiple pipelines per workspace (`workspace_pipelines`),
but `DealsView` hardcodes the default pipeline. Add a pipeline picker in the
toolbar and persist the last-used pipeline per user.

## 10. Workflow builder — visual branch editor

The engine supports `branch` steps (boolean split on a filter DSL), but the
builder UI only renders a linear step list. Needs a tree/graph editor.

## 11. SmartViewEditor — sort and column pickers

Schema has `sortConfig` + `columnConfig`; the editor currently only edits
`filterDsl`. The rest is read back from defaults. Add multi-sort chips and a
drag-sortable column picker.

## 12. Bulk "change owner" — member picker

The bulk bar currently takes a free-text user-id. Replace with a member picker
backed by the workspace members list.

## 13. Deal `won_at` column

Velocity reports currently approximate the close date with
`records.updated_at` when `stage.type = 'won'`. Add a real `won_at` column (or
`closed_at` per-outcome) and set it in the stage-transition code path.

## 14. `record_merges` audit table

Merges currently log a `merged` activity and stamp `data.merged_into` on the
loser row. There is no dedicated audit/undo table, so merges are effectively
irreversible. Add `record_merges (id, workspace_id, winner_id, loser_id, merged_at, merged_by, snapshot jsonb)`.

## 15. Bulk-bar "Enrolar en secuencia"

The button exists in `BulkActionBar` and is disabled via
`sequencesAvailable={false}` passed from each CRM entity page. Sequences are
agent-operated only for now (by deliberate product decision). To enable in the
bulk bar: flip `sequencesAvailable` to `true` in the CRM entity page and add an
`enroll_sequence` handler in `/api/workspaces/[slug]/crm/bulk/route.ts`.

## 16. Test suite

No tests yet. Priority targets, in order:
- `lib/crm/filters.ts` — DSL evaluator (operators, nested groups, relative dates, dotted paths).
- `lib/crm/score.ts` — scoring rubric (weights, tiers, override behavior).
- `lib/workflows/engine.ts` — step execution, branch evaluation, and the re-entrancy guard.

## 17. Activity report — user name enrichment

The activity report currently renders raw user UUIDs or `agent:<id>` strings in
the "actor" column. Join through `workspace_members` / `workspace_agents` to
render display names + avatars.

## 18. Re-entrancy depth propagation across action-emitted events

When a workflow action indirectly emits a new event (e.g. `create_task` leads
to a `task_created` event that triggers another workflow), the new event
defaults to `depth = 0`. Depth is only tracked on the initial emission. Fix
requires threading the current depth through `safeEmitEvent` calls made from
inside `executeStep`.
