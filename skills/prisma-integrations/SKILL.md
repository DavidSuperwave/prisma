---
name: prisma-integrations
description: Use 3rd-party APIs (Close, HubSpot, any REST service) from inside Prisma's chat agent via the integrations vault. Covers `integrations.list`, `integrations.call`, `integrations.sync_leads`, and the secret-scrubbing fallback.
---

# prisma-integrations

This skill lets the Prisma agent call **any 3rd-party HTTP API** without a
hand-coded integration, using credentials operators saved in
`Settings → Integrations`. Credentials live in an AES-256-GCM encrypted vault
and are injected server-side; tool args never carry secrets.

## Tools

### `integrations.list`

No args. Returns every active integration for the workspace:

```json
{ "ok": true, "data": [
  { "slug": "close-prod", "provider": "close", "label": "Close production",
    "authType": "api_key", "status": "active", "hasSecrets": true, "config": {} }
] }
```

Call this **first** any time you think you need to hit an outside API. If the
list is empty, tell the operator: *"Please add the integration in
Settings → Integrations and come back."* Do **not** ask them to paste the key
in chat unless they insist.

### `integrations.call`

Authenticated HTTP call through a provider adapter. The adapter enforces
base URL, path shape, and auth injection.

```
{"type":"tool_call","id":"c1","name":"integrations.call","args":{
  "slug":"close-prod",
  "method":"GET",
  "path":"/lead/",
  "query":{"_limit":25}
}}
```

Result:

```json
{ "ok": true, "data": { "status": 200, "data": { /* provider JSON */ } } }
```

Rules:

- `path` must be relative to the provider base URL. The adapter rejects
  anything that looks like a full URL or path traversal.
- `body` is always a JSON-serializable object. The `Content-Type` header is
  added automatically.
- Failures return `{ ok: false, error, status, details }` — surface the
  error text to the operator and stop; do not retry with the same args.

### `integrations.sync_leads`

High-level helper. Pulls contacts from the provider and upserts them into
Prisma's CRM as people (using `/api/workspaces/<slug>/crm/people`, so dedupe
and lead scoring still apply).

```
{"type":"tool_call","id":"c2","name":"integrations.sync_leads","args":{
  "slug":"close-prod",
  "limit":50,
  "stage":"lead",
  "source":"close",
  "dryRun":true
}}
```

With `dryRun: true` the tool returns a `preview` array so you can confirm
with the operator before actually writing. Supported providers today: Close,
HubSpot.

## Secret-scrubbing fallback

If an operator pastes something that looks like a Close / HubSpot / generic
API key into chat, `lib/secretScrubber.ts` will:

1. Create the integration row automatically (slug like `close-auto-2`).
2. Replace the secret in the persisted message with
   `<redacted:close:close-auto-2>`.
3. Inject a system note into the prompt telling you the new slug.

When you see a system note like *"User pasted a close secret. Saved as
integration slug=\"close-auto-2\". Use integrations.call with that slug"*, **do
not ask the user to paste the key again**. Go straight to
`integrations.list` to confirm, then `integrations.call` /
`integrations.sync_leads` using the slug.

## Worked example: "pull leads from Close into our pipeline"

User: *"Aquí tienes mi Close API key `api_1a2b3c4d...`. Importa los leads
nuevos a nuestro pipeline."*

1. The scrubber creates `close-auto-1` and injects a system note.
2. Emit:
   ```
   {"type":"tool_call","id":"c1","name":"integrations.sync_leads",
    "args":{"slug":"close-auto-1","limit":25,"dryRun":true,"stage":"lead"}}
   ```
3. Summarize the preview: *"Encontré 23 contactos en Close. ¿Los creo como
   leads?"*
4. On "sí", call again with `dryRun: false`.
5. Report back: `{ fetched: 23, upserted: 21, failed: 2 }` — if there are
   errors, paste them verbatim.

## When to prefer MCP instead

If the provider already has a public MCP server (or the operator hosts one),
tell them to use `auth_type: mcp` in the integrations form. After the next
agent bootstrap, Hermes will have that MCP server's tools available
natively, and you won't need `integrations.call` for it.

## Permissions

Creating, updating, or deleting integrations requires `admin` or `operator`
role. `integrations.list`, `integrations.call`, and `integrations.sync_leads`
all inherit the chat caller's role. Viewers get `403`.

## Related skills

- [`prisma-agent-tools`](../prisma-agent-tools/SKILL.md) — tool envelope contract.
- [`prisma-crm`](../prisma-crm/SKILL.md) — what `integrations.sync_leads` writes into.
- [`prisma-cms-sync`](../prisma-cms-sync/SKILL.md) — outbound CMS pushes using the same vault.
