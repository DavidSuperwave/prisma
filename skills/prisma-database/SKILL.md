---
name: prisma-database
description: Create and update Prisma workspace schema rows in Supabase through the meta-model tables.
---

# prisma-database

Use this skill to create and update Prisma workspace schema rows in Supabase through the meta-model tables.

## Objective

Translate workspace requirements into:

- `workspace_objects` rows for each object
- `workspace_fields` rows for each field on each object

The goal is to keep the UI dynamic: do not create hardcoded client tables.

## Required Environment

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `HERMES_WORKSPACE_ID` (or workspace id passed in the task)

## Critical execution rules

- `workspace_id` must be a real UUID. If `HERMES_WORKSPACE_ID` is not a UUID, stop and ask for the correct workspace UUID before attempting writes.
- Prefer HTTP requests to Supabase REST over shell commands. Use Python's standard library (`urllib.request`, `json`) if code execution is available.
- Do not assume `curl` exists in the runtime container.
- Before creating anything, verify the workspace exists by querying `workspaces?id=eq.<workspace_uuid>` or `workspaces?subdomain=eq.<slug>`.
- After every write, immediately read the created rows back and confirm success.

## Table Contract

### `workspace_objects`

Required columns:

- `workspace_id` (uuid)
- `name` (text, plural display)
- `singular_name` (text)
- `plural_name` (text)
- `description` (text, nullable)
- `icon` (text, nullable)

### `workspace_fields`

Required columns:

- `workspace_id` (uuid)
- `object_id` (uuid -> workspace_objects.id)
- `name` (text, human label)
- `key` (text, snake_case unique per object)
- `type` (`text|number|currency|date|boolean|select|relation|file|status`)
- `required` (boolean)
- `options` (jsonb, usually for select/status)
- `default_value` (text, nullable)
- `sort_order` (int)

## Workflow

1. Resolve target `workspace_id`.
2. For each requested object, insert one `workspace_objects` row.
3. For each requested field:
   - normalize `key` to snake_case
   - map type to allowed values
   - set `options` for select/status fields
   - assign deterministic `sort_order`
4. Return created object + field IDs and a short summary.

## Safe write sequence

1. Read `HERMES_WORKSPACE_ID`.
2. If it is not UUID-shaped, do not write.
3. Verify the target workspace exists.
4. Create the `workspace_objects` row and capture the returned `id`.
5. Create the `workspace_fields` rows using that `object_id`.
6. Read the object and fields back from Supabase.
7. Only then report success.

## Required tool choice

- Prefer the `terminal` tool for Supabase writes and reads.
- Avoid `exec` / code-execution sandboxes for this skill unless the user explicitly asks for them.
- Source runtime secrets first with `. /opt/data/.env >/dev/null 2>&1` before terminal-based Supabase commands.
- Use `python3` with `urllib.request` and `json` inside the terminal for deterministic HTTP requests.
- After each write, perform a terminal-based read-back verification against the same workspace.

## Terminal recipe

Use a single terminal command shaped like this:

```bash
. /opt/data/.env >/dev/null 2>&1 && python3 - <<'PY'
import json, os, urllib.request
base = os.environ["SUPABASE_URL"].rstrip("/")
key = os.environ["SUPABASE_SERVICE_KEY"]
workspace_id = os.environ["HERMES_WORKSPACE_ID"]
# verify workspace exists first
# create object with urllib.request.Request(..., method="POST")
# parse returned object id
# create fields
# read object + fields back and summarize
PY
```

## Supabase REST Examples

### Create object

`POST {SUPABASE_URL}/rest/v1/workspace_objects`

Headers:

- `apikey: {SUPABASE_SERVICE_KEY}`
- `Authorization: Bearer {SUPABASE_SERVICE_KEY}`
- `Content-Type: application/json`
- `Prefer: return=representation`

Body:

```json
{
  "workspace_id": "WORKSPACE_UUID",
  "name": "Companies",
  "singular_name": "Company",
  "plural_name": "Companies",
  "description": "Client accounts and prospects",
  "icon": "building"
}
```

### Create fields

`POST {SUPABASE_URL}/rest/v1/workspace_fields`

Body:

```json
[
  {
    "workspace_id": "WORKSPACE_UUID",
    "object_id": "OBJECT_UUID",
    "name": "Name",
    "key": "name",
    "type": "text",
    "required": true,
    "options": {},
    "default_value": null,
    "sort_order": 1
  },
  {
    "workspace_id": "WORKSPACE_UUID",
    "object_id": "OBJECT_UUID",
    "name": "Status",
    "key": "status",
    "type": "status",
    "required": false,
    "options": { "values": ["active", "inactive"] },
    "default_value": "active",
    "sort_order": 2
  }
]
```

## Validation Before Success

- Confirm object rows were created.
- Confirm each field row exists and references the correct `object_id`.
- Confirm field keys are unique for the object.
- Return a final summary with counts and IDs.
