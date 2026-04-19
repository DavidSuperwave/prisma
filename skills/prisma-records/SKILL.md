---
name: prisma-records
description: Create, update, and soft-delete Prisma workspace records through workspace-scoped APIs.
---

# prisma-records

Use this skill to write business data rows into Prisma's `records` table via workspace APIs.

## Objective

Perform safe record mutations for a single workspace:

- create records (`POST /api/workspaces/[slug]/records`)
- update records (`PATCH /api/workspaces/[slug]/records/[id]`)
- soft-delete records (`DELETE /api/workspaces/[slug]/records/[id]` -> `deleted_at` set)

## Required environment

- `PRISMA_APP_BASE_URL` (or equivalent app URL)
- Auth context with workspace access
- `HERMES_WORKSPACE_ID` or workspace slug/id supplied in task context

## Critical execution rules

- Never write outside the target workspace.
- Always verify object ownership (`object_id` belongs to workspace) before create.
- Treat `DELETE` as soft-delete only; do not perform hard data removal.
- If required fields are missing in payload, ask a clarifying question instead of guessing.
- After each write, read back the row and confirm the expected mutation.
- **CRM guardrail**: Do NOT use this endpoint for CRM objects (`kind` is one of `crm_people`, `crm_companies`, `crm_deals`). Those objects have locked fields, identifier-based deduplication, and auto-logged activities. Use the `prisma-crm` skill and its dedicated endpoints (`/api/workspaces/[slug]/crm/people|companies|deals`) instead. Writing CRM payloads through the generic records endpoint bypasses dedupe + activity logging and will create duplicates.
- **Imported datasets are writable.** Any `workspace_objects` row — including ones created by CSV/XLSX import (e.g. `Eas 17`, `Bronco inventory`) — exposes the same `POST/PATCH/DELETE /api/workspaces/[slug]/records` endpoints. Do NOT tell the user that imported tables are read-only, or that records can only be added through standard CRM flows. For any non-CRM object, resolve its `objectId` from the workspace schema and write directly via this skill.
- When a user asks in natural language ("add a red Bronco Sport to my Eas table"), match the table by fuzzy name against `workspace_objects.name`, then map loose attributes ("red", "2025", product name) to the closest `workspace_fields` columns (color fields, year fields, required text field). Only ask for clarification when no usable target can be found.

## Data contract

Record payload shape:

```json
{
  "objectId": "OBJECT_UUID",
  "data": {
    "name": "Acme SA de CV",
    "status": "new",
    "source": "whatsapp"
  }
}
```

## API workflow

1. Resolve workspace (`workspaceSlug`).
2. Validate target object exists in workspace.
3. Execute one mutation:
   - Create:
     - `POST /api/workspaces/[slug]/records`
   - Update:
     - `PATCH /api/workspaces/[slug]/records/[id]`
   - Soft-delete:
     - `DELETE /api/workspaces/[slug]/records/[id]`
4. Read the affected row through workspace queries and confirm fields.
5. Return concise write summary with record ID and changed keys.

## Safe write sequence

1. Confirm actor has workspace write role (`admin` or `operator`).
2. Confirm workspace + object existence.
3. Write mutation.
4. Read back row.
5. Verify `workspace_id`, `object_id`, and changed values.
6. Report success with IDs and mutation type.

## Error handling

- `401`: authentication missing -> request login/session refresh.
- `403`: workspace role insufficient -> stop and ask for elevated role.
- `404`: workspace/object/record missing -> confirm IDs before retry.
- `409`: data conflict -> return conflict detail and do not overwrite blindly.
- `5xx`: transient server/runtime issue -> retry once with idempotency awareness.

## Validation before success

- Create/update: returned `record.id` exists and values match request.
- Soft-delete: `deleted_at` is non-null and row is excluded from default active views.
- Any activity side-effects are logged when applicable (`agent_activity` events).
