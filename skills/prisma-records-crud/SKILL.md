---
name: prisma-records-crud
description: Explore, read, update, and bulk-modify any workspace object through the agent chat. Covers objects.list, objects.describe, records.query, records.get, records.bulk_update, records.bulk_delete, plus the mandatory dryRun + confirmToken commit pattern.
---

# prisma-records-crud

Prisma stores every user-facing table in `workspace_objects` + `records.data`
JSONB. Non-CRM objects (imports like `Eas 17`, custom tables, tasks, etc.)
are fully reachable via the generic `objects.*` / `records.*` namespace —
you should never tell the user "that table is read-only" or "I can only
read CRM data".

## Mandatory first step for any object question

When the user mentions an object by its human name (`Eas 17`, `Vehicles`,
`Inventario`), your FIRST `tool_call` must be `objects.list` to resolve the
real UUID. `crm.query`'s `objectId` arg is a UUID, not a name — passing
`"Eas 17"` will always 400.

```
{"type":"tool_call","id":"t1","name":"objects.list","args":{"includeCounts":true}}
```

Find the object in the response, then use its `id` as `objectId`. If you
also need the field list, call `objects.describe`:

```
{"type":"tool_call","id":"t2","name":"objects.describe","args":{"objectName":"Eas 17"}}
```

## Reading records

`records.query` is generic — it works for any object, not just CRM. The
filter DSL mirrors the one in `crm.query`:

```json
{
  "logical": "and",
  "rules": [
    { "field": "Modelo",   "op": "contains", "value": "TERRITORY" },
    { "field": "Versión",  "op": "contains", "value": "TITANIUM" }
  ]
}
```

Supported ops: `eq`, `neq`, `contains`, `icontains`, `starts_with`,
`ends_with`, `in`, `nin`, `gt`, `gte`, `lt`, `lte`, `is_null`, `is_not_null`.

Full example:

```
{"type":"tool_call","id":"t3","name":"records.query","args":{
  "objectName":"Eas 17",
  "filter":{
    "logical":"and",
    "rules":[
      {"field":"Modelo","op":"contains","value":"TERRITORY"},
      {"field":"Versión","op":"contains","value":"TITANIUM"}
    ]
  },
  "limit":50
}}
```

Response includes `{ records, total, fields, object }`. Use `total` to
answer "cuántos…" questions; only show the first few `records` unless the
user asks for more.

Fetch a single record + its history:

```
{"type":"tool_call","id":"t4","name":"records.get","args":{
  "recordId":"...","includeHistory":true
}}
```

## Writing — ALWAYS confirm-before-commit

Every write tool (`records.create`, `records.update`, `records.delete`,
`records.bulk_update`, `records.bulk_delete`) takes:

- `dryRun?: boolean` (default `true`)
- `confirmToken?: string`

### Step 1 — Propose (dryRun:true, default)

```
{"type":"tool_call","id":"w1","name":"records.bulk_update","args":{
  "objectName":"Eas 17",
  "filter":{"logical":"and","rules":[
    {"field":"Modelo","op":"contains","value":"TERRITORY"}
  ]},
  "patch":{"Precio":650000}
}}
```

The tool_result will be:

```json
{
  "ok": true,
  "data": {
    "dryRun": true,
    "proposal": {
      "action": "records.bulk_update",
      "summary": "Update 7 records in Eas 17.",
      "count": 7,
      "targets": ["...uuid1...", "...uuid2..."],
      "diff": [ { "id":"...", "before": {...}, "after": {...}, "changes":[...] } ]
    },
    "confirmToken": "v1.abc123...",
    "expiresAt": "2026-04-17T21:05:00.000Z"
  }
}
```

The platform automatically emits a `write_proposal` SSE frame; the chat UI
renders a red confirmation card with the diff and Confirm / Cancel buttons.

### Step 2 — Wait for user

Do NOT emit the commit call yourself. The platform is designed so that the
user has to click Confirm in the UI. That click injects a new user message
that ends with `<<CONFIRM_PROPOSAL toolName=records.bulk_update token=v1.abc123...>>`.

If the user clicks Cancel you'll see `<<CANCEL_PROPOSAL toolName=... >>`.
Apologize briefly and drop the plan.

### Step 3 — Commit (dryRun:false + confirmToken)

Re-issue the SAME tool_call with the **exact same args** (filter/patch/etc.)
plus `dryRun:false` and the token:

```
{"type":"tool_call","id":"w2","name":"records.bulk_update","args":{
  "objectName":"Eas 17",
  "filter":{"logical":"and","rules":[
    {"field":"Modelo","op":"contains","value":"TERRITORY"}
  ]},
  "patch":{"Precio":650000},
  "dryRun":false,
  "confirmToken":"v1.abc123..."
}}
```

If any arg differs from the proposal the platform rejects the commit with
`fingerprint_mismatch`. Tokens expire in 5 minutes; if you get `expired`,
re-propose with `dryRun:true` and ask the user to confirm again.

## Worked example — "cuántos TERRITORY TITANIUM hay en Eas 17"

1. `objects.list { includeCounts:true }` → find `Eas 17`'s `id`.
2. `records.query { objectId, filter:{ logical:"and", rules:[
     {field:"Modelo",op:"contains",value:"TERRITORY"},
     {field:"Versión",op:"contains",value:"TITANIUM"} ]}, limit:5 }`.
3. Answer: `"Hay {total} TERRITORY TITANIUM. Ejemplos: …"`.

No writes at any step.

## Worked example — "sube el precio de todos los TERRITORY TITANIUM a 650k"

1. Same `objects.list` + `records.query` as above (to show the user the
   count before proposing).
2. `records.bulk_update { objectId, filter: {...}, patch:{ Precio:650000 } }`
   with the default `dryRun:true`.
3. Wait for the user to Confirm.
4. Re-issue with `dryRun:false` and the `confirmToken`.
5. Read the `committed.count` from the result and report:
   `"Actualicé {count} registros. Precio ahora $650,000 MXN."`.

## Updating records from attached PDFs

When the user attaches a PDF and asks you to update the database from it
(car promos, price lists, catalog updates, etc.), follow this contract:

1. **Read the PDF first.** The chat prompt already includes a short excerpt
   for every attached PDF, but call `documents.analyze` with the PDF's
   `recordId` when you need the full text (or when the excerpt says
   `truncated: true`). If `ocrUsed: true` comes back, mention to the user
   that the text was transcribed from a scan so they can double-check.

   ```
   {"type":"tool_call","id":"p1","name":"documents.analyze","args":{
     "recordId":"<pdf-uuid>"
   }}
   ```

2. **Locate the target records** with `objects.list` + `records.query` (or
   `crm.query` for people/companies/deals). Never create duplicates without
   first checking whether the PDF's rows already exist in the database.

3. **Propose the changes** via the usual write tools, passing
   `sourceDocumentId: "<pdf-uuid>"` so the record keeps an audit trail in
   `data.provenance`. Default `dryRun:true` still applies — the UI shows
   the confirmation card with the diff:

   ```
   {"type":"tool_call","id":"p2","name":"records.bulk_update","args":{
     "objectSlug":"vehicles",
     "filter":{"logical":"and","rules":[
       {"field":"Modelo","op":"contains","value":"CIVIC"}
     ]},
     "patch":{"Precio_Promo":329900},
     "sourceDocumentId":"<pdf-uuid>"
   }}
   ```

4. **Wait for the user to click Confirm.** Never fabricate a
   `<<CONFIRM_PROPOSAL …>>` marker yourself. When the user confirms,
   re-issue the tool_call with the exact same args plus `dryRun:false` and
   the `confirmToken` (the `sourceDocumentId` must match — it's part of the
   signed proposal fingerprint).

5. **Never bypass the confirmation card for PDF-sourced writes**, even if
   the user sounds impatient. The user explicitly wants to see every change
   before it lands in the database.

The same `sourceDocumentId` arg is available on `records.create`,
`records.update`, `records.bulk_update`, `crm.create_person`,
`crm.update_person`, `crm.create_company`, `crm.update_company`,
`crm.create_deal`, and `crm.update_deal`.

## Permissions

- Any member can `objects.list` / `objects.describe` / `records.query` /
  `records.get`.
- `viewer` members cannot trigger any write tool — the server returns 403
  on the dryRun step already.
- Admins and platform admins can write.

## Related skills

- [`prisma-cms-sync`](../prisma-cms-sync/SKILL.md) — pushing records out to
  external sites (also uses the dryRun + confirmToken pattern).
- [`prisma-crm`](../prisma-crm/SKILL.md) — the CRM-specific write tools
  (`crm.update_person` etc.) still exist for dedupe semantics.
- [`prisma-agent-tools`](../prisma-agent-tools/SKILL.md) — tool envelope
  format and SSE contract.
