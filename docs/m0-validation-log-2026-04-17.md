# M0 Validation Log - 2026-04-17

## Scope

- Project ref: `ahxnjhqnmudixefxbxdg`
- Validation target: migrations under `supabase/migrations/`
- Validation method:
  - `user-supabase.list_migrations`
  - `user-supabase.list_tables` (schema `public`, compact mode)

## Local migration files discovered

1. `20260411_000001_m1_foundation.sql`
2. `20260411_000002_m1_rls.sql`
3. `20260412_add_workspace_limits.sql`
4. `20260412_m5_dashboard_and_agent_templates.sql`
5. `20260413_stage2_import_history.sql`
6. `20260413_stage3_m15_group_by_field_id.sql`
7. `20260414_stage4_tasks_and_evidence.sql`
8. `20260415_stage5_conversations_and_readiness.sql`

## Remote migration state

`list_migrations` returned:

- `20260412025506 m1_foundation_schema`
- `20260412025518 m1_workspace_rls`
- `20260416071603 20260412_add_workspace_limits`
- `20260416071607 20260412_m5_dashboard_and_agent_templates`
- `20260416071612 20260413_stage2_import_history`
- `20260416071625 20260413_stage3_m15_group_by_field_id`
- `20260414224819 stage4_tasks_and_evidence`
- `20260416003218 stage5_conversations_and_readiness`

Additional historical migration present (outside this 8-file set):

- `20260407181103 create_intake_submissions_and_assets_bucket`

## Table presence check (public schema)

`list_tables` confirms all expected platform tables exist:

- `workspaces`
- `workspace_members`
- `workspace_objects`
- `workspace_fields`
- `workspace_views`
- `records`
- `workspace_agents`
- `agent_activity`
- `agent_events`
- `agent_templates`
- `workspace_dashboard_cards`
- `workspace_import_history`
- `workspace_tasks`
- `workspace_evidence_links`
- `workspace_conversations`
- `workspace_conversation_messages`

Legacy intake table also present:

- `intake_submissions`

## Result

- Status: PASS
- Conclusion: All 8 migrations from `supabase/migrations/` are already applied on the live project and corresponding tables are present.
- Action required: none.
