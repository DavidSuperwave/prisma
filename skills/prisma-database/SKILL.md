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
