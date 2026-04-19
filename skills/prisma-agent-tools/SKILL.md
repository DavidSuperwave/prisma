---
name: prisma-agent-tools
description: Invoke Prisma platform tools (CRM writes, queries, schema changes, imports) from inside the Hermes chat runtime by emitting SSE `tool_call` envelopes. Documents the full registry, args, and chat-driven Excel import flow.
---

# prisma-agent-tools

Use this skill any time an in-chat agent needs to **take action** in Prisma — create or update CRM records, query the meta-model, change schema, import a spreadsheet attached to the conversation, etc.

The chat runtime (`app/api/chat/route.ts`) listens for tool envelopes inside the model's SSE stream, executes them server-side via `lib/agentTools/executor.ts`, and pipes a `tool_result` back. All write tools call the same internal REST endpoints documented in [`prisma-crm`](../prisma-crm/SKILL.md), so dedupe, activity logging, sequences, and lead scoring still apply.

> Prefer tool calls over `tryHandleRecordCreateIntent` heuristics for any write or for any read that benefits from a structured response. Only fall back to plain text when no tool fits.

## Envelope shape

Emit a normal SSE `data:` frame whose JSON has `type: "tool_call"`, a unique `id`, the registered `name`, and an `args` object. Do this **before** any prose so the platform can attach the result to the same turn.

```
data: {"type":"tool_call","id":"call_abc","name":"crm.create_person","args":{
  "fullName":"Alice Kim",
  "email":"alice@acme.com",
  "stage":"qualified"
}}

```

The platform replies with:

```
data: {"type":"tool_result","id":"call_abc","name":"crm.create_person","result":{
  "ok":true,
  "data":{"record":{...},"created":true}
}}
```

On failure the result is `{ ok: false, error: "...", status: 4xx|5xx }`. Chain the next message on the result, and apologize/refuse if the action could not be completed.

For external (non-Hermes) callers there is also a synchronous endpoint:
`POST /api/agent-tools/run` with `{ name, args, workspaceSlug }`.

## Registry

All tools live under `lib/agentTools/tools/` and are registered at module load. Argument names are camelCase. Required args are marked.

### CRM writes (use these instead of `/records` for CRM kinds)

| Tool | Purpose | Required args |
| --- | --- | --- |
| `crm.create_person` | Upsert a person (dedupe by email→phone) | one of `email`/`phone`/`fullName` |
| `crm.update_person` | Patch a person (stage, owner, custom data) | `recordId` |
| `crm.delete_person` | Soft-delete | `recordId` |
| `crm.create_company` | Upsert a company (dedupe by domain→name) | one of `domain`/`name` |
| `crm.update_company` | Patch a company | `recordId` |
| `crm.delete_company` | Soft-delete | `recordId` |
| `crm.create_deal` | Create a deal | `title` (and `companyId` strongly recommended) |
| `crm.update_deal` | Patch a deal (any field via `data`) | `recordId` |
| `crm.change_stage` | Move a deal to another pipeline stage | `recordId`, `stageId` |
| `crm.delete_deal` | Soft-delete | `recordId` |
| `crm.assign_owner` | Bulk re-assign owner across many records | `objectId`, `recordIds`, `ownerUserId` |
| `crm.enroll_in_sequence` | Enroll one or more records in a sequence | `sequenceId`, `recordIds` |
| `crm.add_activity` | Log a note/call/meeting/email on a record | `recordId`, `type` |
| `crm.add_task` | Create a task (optionally tied to a record) | `title` |
| `crm.complete_task` | Mark a task as completed | `taskId` |

### CRM reads & saved views

| Tool | Purpose |
| --- | --- |
| `crm.query` | Filtered/paginated read across `crm_people | crm_companies | crm_deals`. Args: `kind` _or_ `objectId`, `filter` (DSL — see below), `search`, `projection`, `sort`, `limit`, `offset`. |
| `crm.save_view` | Create or update a smart view (column layout, sort, filter, scope, pin). Pass `viewId` to update an existing view; omit it to create. |

### Schema management (admin only)

| Tool | Purpose | Required args |
| --- | --- | --- |
| `schema.add_field` | Add a custom field to any object (CRM or generic) | `objectId`, `name`, `type` |
| `schema.rename_field` | Rename / re-label a non-locked field | `fieldId`, `name` |
| `schema.reorder_fields` | Set the explicit field order for an object | `objectId`, `fieldIds[]` |
| `schema.hide_field` | Hide (soft) a non-locked field | `fieldId` |

Locked system fields (see prisma-crm) cannot be renamed, hidden, or deleted.

### Generic record fallbacks (non-CRM kinds only)

| Tool | Purpose |
| --- | --- |
| `records.create` | Create a record under any non-CRM object. **Do not use for CRM kinds.** |
| `records.update` | Patch any record's `data` JSON |
| `records.delete` | Soft-delete any record |

### Imports / spreadsheets

| Tool | Purpose |
| --- | --- |
| `crm.import_attachment` | Parse an attached XLSX/CSV `Documents` record and import rows into a CRM kind. Supports `dryRun: true` to return a column-mapping proposal first. Args: `documentRecordId` (required), `kind` (or `objectId`), `mapping?`, `dedupeFieldKey?`, `mode?` (`skip|update|upsert`, default `upsert`), `dryRun?`. |

## Filter DSL (used by `crm.query` and `crm.save_view`)

```json
{
  "logical": "and" | "or",
  "rules": [
    { "field": "stage", "op": "eq", "value": "qualified" },
    { "field": "data.lead_score", "op": "gte", "value": 70 },
    { "logical": "or", "rules": [...] }
  ]
}
```

Operators (mirroring `lib/crm/filters.ts`): `eq`, `neq`, `in`, `nin`, `contains`, `starts_with`, `ends_with`, `gt`, `gte`, `lt`, `lte`, `is_null`, `is_not_null`, `between`.

Field keys can be top-level columns (`stage`, `created_at`) or `data.<key>` for JSONB attributes.

## Excel import flow (chat → CRM)

When the user attaches a spreadsheet and asks to import:

1. **Detect intent** in the user's message (the chat route already handles common Spanish/English phrasings — "importa", "carga estos contactos", "sube este excel"). If the agent itself wants to trigger the flow, emit:
   ```json
   {"type":"tool_call","id":"call_imp1","name":"crm.import_attachment",
    "args":{"documentRecordId":"<DOC_ID>","kind":"crm_people","dryRun":true}}
   ```
2. **Read the proposal** from the `tool_result` payload — `{ proposal: { headers, mapping, dedupeFieldKey, totalRows, preview } }` — and stream a friendly summary to the user. The platform also forwards a structured `import_proposal` SSE frame so the UI can render a confirmation dialog.
3. **On confirmation** (UI button or user reply), re-invoke the tool with the user-tweaked `mapping` and `dryRun: false`:
   ```json
   {"type":"tool_call","id":"call_imp2","name":"crm.import_attachment","args":{
     "documentRecordId":"<DOC_ID>",
     "kind":"crm_people",
     "mapping":{ "Nombre": "full_name", "Email": "email", "Telefono": "phone" },
     "mode":"upsert"
   }}
   ```
4. The result echoes the `/imports` response (`{ inserted, updated, skipped, errors }`). Report counts back to the user; surface row-level errors verbatim if `errors.length > 0`.

## Patterns and good behavior

- **Read before mass write.** Before assigning owners to "all unqualified leads", run `crm.query` first to get the count and confirm with the user.
- **Don't double-log activities.** `change_stage` and `update_deal` (when transitioning to won/lost stages) auto-create activities. Adding another `crm.add_activity` would duplicate the timeline.
- **Refuse on missing dedupe fields.** A `crm.create_person` without `email` _and_ without `phone` is almost always a mistake — ask the user instead of creating an orphan.
- **Re-use saved views.** When the user asks for "leads de esta semana sin owner", craft a `crm.query` call with the right filter and offer to persist it via `crm.save_view`.
- **Surface ids.** Always echo back the `recordId` (and `created: true|false`) from a write so subsequent tool calls in the same turn can target the right row.

## Permissions

Tool calls inherit the chat caller's session (workspace membership + role). Writes require `admin` or `operator`; reads require any membership. Schema tools require `admin` (or platform admin). The executor returns `403` if not allowed — surface that to the user verbatim.

## Related skills

- [`prisma-crm`](../prisma-crm/SKILL.md) — endpoint catalog, payload shapes, and dedupe rules invoked by every `crm.*` tool.
- [`prisma-records`](../prisma-records/SKILL.md) — for non-CRM object writes via `records.*` tools.
- [`prisma-database`](../prisma-database/SKILL.md) — when you need raw SQL beyond what the tools expose.
