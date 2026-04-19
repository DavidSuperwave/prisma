---
name: prisma-tasks
description: Create, assign, update, and orchestrate Prisma workspace tasks (lists, custom fields, statuses, subtasks, recurring) through workspace-scoped APIs.
---

# prisma-tasks

Use this skill to manage the Unified Tasks workspace — Prisma's ClickUp-style team task system. Tasks live in `workspace_tasks`, grouped by `workspace_task_lists`, and can use per-workspace `workspace_task_statuses` plus custom fields stored in `custom_data` (definitions in `workspace_fields` where `object_id` points to the `kind='tasks'` virtual object).

## Objective

Do ONE or more of the following, always scoped to a single workspace:

- Create / update / delete tasks (including subtasks)
- Assign tasks to users or agents
- Read and set custom fields on a task
- Manage lists (projects) and statuses
- Schedule a recurring task (the `tasks-recurring` cron clones occurrences from metadata)

## Required environment

- `PRISMA_APP_BASE_URL`
- Authenticated session with workspace access (admin for field/status definition changes)
- Workspace slug or id from task context (`HERMES_WORKSPACE_SLUG`)

## Endpoint map

Base: `/api/workspaces/[workspaceSlug]/tasks`

| Action | Method + Path |
| --- | --- |
| List tasks | `GET /tasks?listId=…&parentTaskId=…&topLevel=true&assignedToUserId=…` |
| Create task | `POST /tasks` |
| Update task | `PATCH /tasks/[taskId]` |
| Delete task | `DELETE /tasks/[taskId]` |
| List task lists | `GET /tasks/lists` |
| Create list | `POST /tasks/lists` |
| Update list | `PATCH /tasks/lists/[listId]` |
| Delete list | `DELETE /tasks/lists/[listId]` (blocked for the default list) |
| List statuses | `GET /tasks/statuses?listId=…` |
| Create status | `POST /tasks/statuses` |
| Update status | `PATCH /tasks/statuses/[statusId]` |
| Delete status | `DELETE /tasks/statuses/[statusId]` (blocked for system statuses) |
| List task fields | `GET /tasks/fields` |
| Create task field | `POST /tasks/fields` (admin only) |
| Delete task field | `DELETE /api/workspaces/[slug]/fields/[fieldId]` |
| Task-scoped activity | `GET /activity?taskId=…&limit=…` |

## Critical execution rules

- Never write outside the target workspace (`workspace_id` is implicit in the slug; the API enforces it).
- Always resolve or create a `listId` before creating a task. If no list is provided, the API falls back to the workspace default list.
- Subtasks MUST set `parentTaskId` and should inherit `listId` from the parent.
- Custom field values go in `customData` as a JSON object keyed by the field's `key` (slug). The field must already exist via `POST /tasks/fields`.
- Status keys MUST match `workspace_task_statuses.key` for the given list (or the global defaults when the list has no per-list statuses). Core system keys: `pending`, `in_progress`, `needs_review`, `follow_up`, `blocked`, `awaiting_approval`, `completed`.
- `priority` is one of `low | normal | high | urgent`.
- Dates (`dueAt`, `reminderAt`) are ISO 8601 strings (UTC).
- Only admins can create/delete custom fields, lists, or statuses. Operators can still create tasks, assign, and update.
- After every write, read back the response and confirm the change (the API returns the updated row).
- Do NOT hard-delete historical tasks unless the user asks; prefer setting `status` to `completed`.

## Task payload shape (create)

```json
{
  "title": "Call Ana about renewal",
  "description": "Optional context…",
  "listId": "<uuid of workspace_task_lists>",
  "parentTaskId": null,
  "priority": "high",
  "status": "pending",
  "type": "follow_up",
  "dueAt": "2026-04-20T17:00:00Z",
  "reminderAt": "2026-04-20T15:00:00Z",
  "assignedToUserId": "<user uuid | null>",
  "ownerAgentId": "<agent uuid | null>",
  "recordId": "<related record uuid | null>",
  "customData": { "deal_value": 1200, "stage": "proposal" },
  "metadata": { "source": "agent:hermes" },
  "sortOrder": 0
}
```

## Updating a task

`PATCH /tasks/[taskId]` accepts any subset of the create fields. To move a task across the board, send `{ "status": "in_progress" }`. To reschedule on the calendar, send `{ "dueAt": "…" }`. To reassign, send `{ "assignedToUserId": "…" }`.

## Custom fields (ClickUp parity)

1. Define a field once per workspace through `POST /tasks/fields`:

```json
{
  "name": "Money",
  "widget": "money",
  "description": "USD amount",
  "options": { "currency": "USD" }
}
```

Supported `widget` values: `short_text`, `long_text`, `number`, `money`, `percent`, `rating`, `date`, `datetime`, `single_select`, `labels`, `checkbox`, `email`, `phone`, `url`, `people`, `relationship`, `files`, `location`, `signature`, `rollup`, `formula`. The endpoint maps these to the underlying `workspace_fields.type`.

2. Set values on a task via `PATCH /tasks/[taskId]` with `customData` merging the new keys. Only include keys you want to change; existing keys are replaced when the payload key is present.

## Lists (projects)

Lists scope boards, smart views, and default statuses. Always prefer reusing an existing list with a matching name before creating a new one. Set `isDefault: true` at most once per workspace; the API enforces uniqueness.

## Statuses

- `listId: null` → workspace-default statuses applied to every list.
- `listId: <uuid>` → overrides defaults for that specific list.
- `category` must be `todo | in_progress | done | blocked`. The board groups and end-of-funnel analytics read this category.
- `is_system` statuses cannot be deleted.

## Recurring tasks

To schedule a recurrence, store metadata on an existing task:

```json
{
  "metadata": {
    "recurrence": {
      "frequency": "weekly",
      "interval": 1,
      "nextRun": "2026-04-20T17:00:00Z",
      "endAt": null
    }
  }
}
```

`frequency` accepts `daily | weekly | monthly | yearly`. The `/api/cron/tasks-recurring` endpoint (registered in `vercel.json` every 10 minutes) clones the task at `nextRun` as a brand-new `pending` task and advances `nextRun`. The clone carries `metadata.sourceRecurringTaskId` so downstream automations can correlate occurrences.

Do NOT try to pre-create future occurrences yourself; let the cron do it.

## Activity / audit

Every task write emits an `agent_events` row (`task.created|updated|assigned|status_changed|deleted|recurring_cloned`, `task_list.*`, `task_field.created`). Use `GET /activity?taskId=…` to retrieve a chronological feed for a single task.

## Safety checklist before mutating

- [ ] Correct workspace slug resolved
- [ ] `listId` exists (or intentionally falling back to the default list)
- [ ] `status` key is valid for the target list
- [ ] Required custom fields defined ahead of time
- [ ] If recurring, `frequency` and `nextRun` are set
- [ ] If assigning, `assignedToUserId` belongs to the workspace
