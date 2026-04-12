# M0 Validation Checklist

Use this checklist as the quality gate before M1. Do not proceed if any required check fails.

## Prerequisites

- One hErmes container is running and reachable.
- `skills/prisma-database/SKILL.md` is mounted into the hErmes skills directory.
- Supabase project contains `workspace_objects` and `workspace_fields`.
- Runtime env vars are configured:
  - `HERMES_API_BASE_URL`
  - `HERMES_API_KEY`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY`

## 1) Health Check

Command:

```bash
curl http://localhost:8642/health
```

Expected:

- HTTP 200
- Body contains `{"status":"ok"}` (or equivalent healthy status payload)

## 2) Create Object and Fields Through Conversation

Command:

```bash
curl -X POST http://localhost:8642/v1/chat/completions \
  -H "Authorization: Bearer YOUR_HERMES_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "hermes-agent",
    "messages": [
      {
        "role": "user",
        "content": "Create a Companies object with fields: name (text, required), industry (text), annual_sales (currency), status (select: active/inactive)."
      }
    ]
  }'
```

Expected:

- Assistant confirms object and 4 fields were created.

## 3) Verify Supabase Rows

Check:

- `workspace_objects` includes `Companies`.
- `workspace_fields` includes:
  - `name`
  - `industry`
  - `annual_sales`
  - `status`

Expected:

- Exactly one object row and 4 linked field rows for the workspace.

## 4) Query Records Through Conversation

Command:

```bash
curl -X POST http://localhost:8642/v1/chat/completions \
  -H "Authorization: Bearer YOUR_HERMES_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "hermes-agent",
    "messages": [
      { "role": "user", "content": "Show me all Companies records in this workspace." }
    ]
  }'
```

Expected:

- Agent returns current records (or empty-state response with correct object reference).

## 5) App Proxy Check (`/api/chat`)

From the Prisma app:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{ "message": "List workspace objects." }'
```

Expected:

- Response streams as SSE chunks with `delta` events and a final `done`.

## Pass Criteria

- hErmes remains stable for at least 1 hour.
- Conversational object/field creation works end to end.
- Conversational read/query works end to end.
- API proxy streams responses correctly.
- Typical round-trip latency is below 10 seconds.

## Failure Policy

If any check fails:

1. Capture exact request/response and timestamps.
2. Fix runtime/skill/schema issue.
3. Re-run full checklist from step 1.
4. Only then start M1.
