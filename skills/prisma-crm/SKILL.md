---
name: prisma-crm
description: Create, update, query, and import CRM records (People, Companies, Deals) in Prisma. Covers REST endpoints, dedupe rules, locked fields, tool envelopes for in-chat agents, the unified `/crm/query` read API, smart views, sequences, and the Excel/CSV import path from chat.
---

# prisma-crm

Use this skill any time the user or an agent needs to **read or write** Prisma's CRM. CRM is a locked subset of the meta-model (`workspace_objects.kind` ∈ `crm_people | crm_companies | crm_deals`) with protected fields, dedupe, activity auto-logging, and a pipeline-backed deal stage model.

> **Never** post CRM payloads to `/api/workspaces/[slug]/records`. That endpoint bypasses dedupe, activity logging, sequences, and lead scoring, and creates duplicates. Always go through the dedicated `/crm/*` routes or the `crm.*` agent tools.

## Two ways to act on CRM

1. **Direct REST** — server actions, scripts, and any non-chat caller use `fetch` against the routes below. Workspace authorization is enforced by `_shared.ts` (`authorizeCrmRead` / `authorizeCrmWrite`).
2. **Agent tool envelopes** — when running inside the chat runtime, prefer emitting SSE `tool_call` frames. The platform executes the tool against the same REST endpoints (so dedupe + logging still apply) and streams back a `tool_result`. See [`skills/prisma-agent-tools/SKILL.md`](../prisma-agent-tools/SKILL.md) for the full registry and envelope shape.

## Endpoints

### Write (POST/PATCH)
| Action | Endpoint |
| --- | --- |
| Upsert a contact | `POST /api/workspaces/[slug]/crm/people` |
| Update a contact | `PATCH /api/workspaces/[slug]/crm/people/[recordId]` |
| Upsert a company | `POST /api/workspaces/[slug]/crm/companies` |
| Update a company | `PATCH /api/workspaces/[slug]/crm/companies/[recordId]` |
| Create a deal | `POST /api/workspaces/[slug]/crm/deals` |
| Update / move a deal | `PATCH /api/workspaces/[slug]/crm/deals/[recordId]` |
| Soft-delete (any kind) | `DELETE /api/workspaces/[slug]/records/[recordId]` |
| Bulk action (assign, tag, change stage) | `POST /api/workspaces/[slug]/crm/bulk` |
| Activity (note/call/meeting/email) | `POST /api/workspaces/[slug]/records/[recordId]/activities` |
| Task | `POST /api/workspaces/[slug]/tasks` |
| Bulk import (CSV/XLSX rows) | `POST /api/workspaces/[slug]/imports` |
| Demo data (admin only) | `POST` / `DELETE /api/workspaces/[slug]/crm/demo-seed` |

### Read
| Action | Endpoint |
| --- | --- |
| **Unified read with filter DSL** | `GET` or `POST /api/workspaces/[slug]/crm/query` |
| Activity timeline | `GET /api/workspaces/[slug]/records/[recordId]/activities` |
| Saved smart views | `GET /api/workspaces/[slug]/views?objectId=...` |

### Schema (admins only — non-locked fields only)
| Action | Endpoint |
| --- | --- |
| Add field | `POST /api/workspaces/[slug]/fields` |
| Rename / re-label / reorder | `PATCH /api/workspaces/[slug]/fields/[fieldId]` |
| Delete | `DELETE /api/workspaces/[slug]/fields/[fieldId]` |

## Deduplication rules

| Kind | Dedupe key | Behavior |
| --- | --- | --- |
| `crm_people` | `email`, then `phone` | Server upserts the existing record; never creates a duplicate. |
| `crm_companies` | `domain`, then normalized `name` | Same — upsert semantics. |
| `crm_deals` | _none_ | Each deal is unique. If the same `title + companyId` already has an open deal, the API returns `409 duplicate_deal` — confirm with the user before retrying. |

If no dedupe field is present on a person or company, **refuse and ask the user** for the missing identifier instead of creating an orphan.

## Locked / system fields

These have `is_locked=true`. You may set their values normally, but cannot rename, delete, or hide them through the fields API.

- People: `full_name`, `email`, `phone`, `stage`, `company_id`, `owner_user_id`
- Companies: `name`, `domain`, `industry`, `size`, `owner_user_id`
- Deals: `title`, `amount`, `currency`, `pipeline_id`, `stage_id`, `company_id`, `primary_contact_id`, `expected_close_date`, `owner_user_id`

## Stage vocabularies

People `stage` (canonical, lowercase): `new | lead | qualified | opportunity | customer | lost | unqualified`. Other strings are accepted but the API normalizes/validates against the locked enum.

Deals use `workspace_pipeline_stages` rows with `stage_type` ∈ `active | won | lost`. Always supply `stageId` (UUID) or omit it to use the pipeline default. When a deal moves to a `won` stage, the server auto-logs a `deal_won` activity (similarly `deal_lost`, `status_change`).

A pipeline must always have at least one `active` and one `won` stage (DB trigger enforces this).

## Payload shapes

### Person (POST `/crm/people`)
```json
{
  "fullName": "Alice Kim",
  "email": "alice@acme.com",
  "phone": "+15550100",
  "stage": "qualified",
  "companyId": "COMPANY_UUID",
  "ownerUserId": "USER_UUID",
  "data": { "source": "whatsapp" }
}
```

### Company (POST `/crm/companies`)
```json
{
  "name": "Acme Inc.",
  "domain": "acme.com",
  "industry": "saas",
  "size": "11-50",
  "ownerUserId": "USER_UUID"
}
```

### Deal (POST `/crm/deals`)
```json
{
  "title": "Acme renewal",
  "amount": 12000,
  "currency": "USD",
  "pipelineId": "PIPELINE_UUID",
  "stageId": "STAGE_UUID",
  "companyId": "COMPANY_UUID",
  "primaryContactId": "PERSON_UUID",
  "expectedCloseDate": "2026-06-30"
}
```

### Activity (POST `/records/[recordId]/activities`)
```json
{
  "type": "note",
  "subject": "Called customer",
  "body": "Agreed to review quote on Friday.",
  "isPinned": false
}
```

## Reading with `/crm/query`

`/crm/query` is the canonical read endpoint for filtered lists. It accepts the filter DSL from `lib/crm/filters.ts`, search, pagination, and field projection.

```http
POST /api/workspaces/{slug}/crm/query
Content-Type: application/json

{
  "kind": "crm_people",
  "filter": {
    "logical": "and",
    "rules": [
      { "field": "stage", "op": "eq", "value": "qualified" },
      { "field": "company_id", "op": "eq", "value": "COMPANY_UUID" }
    ]
  },
  "search": "alice",
  "projection": ["id", "data.full_name", "data.email", "data.stage"],
  "sort": [{ "field": "created_at", "direction": "desc" }],
  "limit": 50,
  "offset": 0
}
```

Response shape: `{ records, total, limit, offset }`.

Either `kind` or `objectId` must be supplied. `GET` form supports the same params via querystring (`?kind=crm_people&search=...&filter=<json>`).

## Bulk operations

`POST /crm/bulk` is a single endpoint for fan-out actions:

```json
{ "action": "change-owner", "objectId": "OBJECT_UUID", "recordIds": ["..."], "ownerUserId": "USER_UUID" }
{ "action": "change-stage", "objectId": "OBJECT_UUID", "recordIds": ["..."], "stage": "qualified" }
{ "action": "tag", "objectId": "OBJECT_UUID", "recordIds": ["..."], "tags": ["vip"] }
{ "action": "delete", "objectId": "OBJECT_UUID", "recordIds": ["..."] }
```

For sequences, use the dedicated route:
```
POST /api/workspaces/[slug]/sequences/[sequenceId]/enrollments
{ "recordIds": ["PERSON_UUID", ...] }
```

## Importing from chat (Excel / CSV)

When a user attaches a spreadsheet and asks to "importa" / "carga" leads:

1. The chat route detects the intent and invokes the `crm.import_attachment` tool with `dryRun: true`.
2. The tool downloads the file from Supabase storage, parses it via `lib/spreadsheetParser.ts`, builds a header → field-key mapping using known aliases (`email`, `phone`, `full_name`, `name`, `domain`, ...), and returns a **proposal**:
   ```json
   {
     "proposal": {
       "kind": "crm_people",
       "headers": ["Nombre", "Email", "Telefono"],
       "mapping": { "Nombre": "full_name", "Email": "email", "Telefono": "phone" },
       "dedupeFieldKey": "email",
       "totalRows": 248,
       "preview": [ /* first 5 rows */ ]
     }
   }
   ```
3. The UI surfaces the proposal as a `import_proposal` SSE frame so the user can confirm or tweak the mapping. On confirmation, call the same tool with `dryRun: false`, which forwards mapped rows to `POST /imports` with the chosen `mode` (`skip | update | upsert`).

For server-to-server imports (no chat in the loop), call `/imports` directly with the rows already mapped to field keys.

## Demo data

`POST /api/workspaces/[slug]/crm/demo-seed` (admin) populates 5 companies, 12 people, 8 deals, and a handful of activities, all tagged with `data.__demo = true`. `DELETE` removes only those tagged rows. The CRM list pages and the Reports page render a `DemoDataBanner` for admins to manage this state.

## Safe execution sequence

1. Resolve the `workspaceSlug` (path or current chat context).
2. Decide the kind (`people | companies | deals`).
3. For dedupe-aware kinds, ensure the dedupe field is present (`email`/`phone` for people, `domain`/`name` for companies). Refuse otherwise.
4. POST the payload. The response `{ record, created: boolean }` tells you whether a new row was created or an existing one was updated.
5. For deals, supply `pipelineId` + `stageId` if not using the default pipeline. When moving stages, the server logs the activity automatically — do **not** double-log.
6. Add notes/calls/meetings via the activities endpoint, never by stuffing them into `data`.
7. Persist any agent-driven table preferences via `crm.save_view` (see prisma-agent-tools).

## Error handling

- `400 validation` — missing identifying field, unknown kind, invalid stage/pipeline reference.
- `403 permission` — caller is not a member, or write requires `admin`/`operator`.
- `404 not_found` — record/pipeline/stage doesn't exist or is in another workspace.
- `409 duplicate_deal` — same `title` is already open for that company.
- `422 stage_mismatch` — `stageId` doesn't belong to `pipelineId`.

## Related skills

- [`prisma-agent-tools`](../prisma-agent-tools/SKILL.md) — the SSE `tool_call` envelope, full tool registry, and how `crm.import_attachment` plumbs through chat.
- [`prisma-database`](../prisma-database/SKILL.md) — for raw schema reads when you genuinely need SQL.
