# Hermes Integrations Runbook

Prisma's workspace agent can act on 3rd-party APIs three ways. Pick the tier
that matches your operator's appetite for setup effort and security.

## 1. Vault (primary, recommended)

1. Operator opens `Settings → Integrations` in the workspace app.
2. Pick a provider (Close, HubSpot, Generic HTTP, GB Automotriz CMS).
3. Paste the API key / secret. The value is encrypted with AES-256-GCM using
   `PRISMA_SECRETS_KEY` before it hits Postgres. Nothing else ever returns
   plaintext secrets.
4. In chat: `integrations.list` to discover slugs, then
   `integrations.call { slug, method, path, ... }` to make authenticated HTTP
   calls. Use `integrations.sync_leads` to pull leads straight into CRM.

Credentials stay scoped to the workspace; agents cannot read other
workspaces' vaults because `workspace_integration_secrets` has an RLS policy
denying every non-service-role read.

## 2. MCP per-workspace (power users)

For providers that already publish an MCP server (or for a custom MCP server
hosted by you):

1. In the vault, create an integration with `auth_type: mcp` and set
   `config.url = https://mcp.example.com/mcp`. Optionally store a bearer in
   the `bearer` secret slot.
2. On next `bootstrap-agent` POST, Prisma writes a `mcp_config_url` pointing
   at `/api/workspaces/<slug>/agents/<agentId>/mcp-config` into the agent's
   `knowledge_scope`. Hermes should fetch that URL at startup and merge the
   returned `mcp_servers` block into its own config.
3. Hermes can then call any tool exposed by the remote MCP server.
4. Prisma now injects an internal MCP server entry (`prisma_internal`) that
   exposes the workspace tool registry over MCP at `/api/mcp/prisma`.
   Access is JWT-gated per agent session and short-lived.

The endpoint returns:

```json
{
  "agentId": "…",
  "rolePreset": "intake",
  "prismaSessionExpiresAt": "2026-04-17T18:30:00.000Z",
  "mcp_servers": {
    "prisma_internal": {
      "url": "https://app.example.com/api/mcp/prisma",
      "headers": {
        "Authorization": "Bearer <short-lived-jwt>",
        "x-prisma-access-token": "<workspace-session-token>"
      },
      "prompts": false,
      "resources": false,
      "tools": {
        "include": ["records.query", "records.update"]
      }
    },
    "close-mcp": { "url": "https://…", "headers": { "Authorization": "Bearer …" } }
  }
}
```

Per-server config supports Hermes MCP controls where provided by integration
config: `enabled`, `timeout`, `connect_timeout`, `tools.include`,
`tools.exclude`, `prompts`, `resources`, and optional `sampling`.

Role preset defaults for `prisma_internal` tool filtering:

- `intake`: schema/records/crm/documents/images/integrations
- `sales`: schema/records/crm/documents/images/integrations/recipes/automations
- `ops`: broad platform access, including bindings/cms/skills
- `custom`: explicit include/exclude from `knowledge_scope` only

You can override preset/filter behavior per agent through `workspace_agents`
`knowledge_scope` fields:

- `mcp_role_preset` (`intake|sales|ops|custom`)
- `mcp_tools_include` (string array of tool names)
- `mcp_tools_exclude` (string array of tool names)

## 3. Chat-paste fallback (convenience, degraded)

If an operator pastes something that looks like an API key directly into chat
(e.g. `sk-live-xxxx`), `lib/secretScrubber.ts` runs before the message is
persisted:

- Strips the secret out of the stored message, replacing it with a redaction
  marker like `<redacted:api_key:<id>>`.
- Creates an integration row automatically (`provider: generic_http`,
  `slug: auto-<timestamp>`) and stores the secret in the vault.
- Appends a system note to the prompt so Hermes knows to use
  `integrations.list` / `integrations.call` with the new slug.

Operators should prefer tier 1. Tier 3 exists to avoid leaking secrets when a
user pastes one anyway.

## Rotating the secrets key

1. Generate a new 32-byte key: `node -e
   "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. Run `scripts/rotate_secrets_key.mjs` (to be written when needed) which
   reads all `workspace_integration_secrets`, decrypts with the old
   `PRISMA_SECRETS_KEY_OLD`, re-encrypts with the new
   `PRISMA_SECRETS_KEY`, and updates rows in a single transaction.
3. Swap env vars and restart the app.

Losing `PRISMA_SECRETS_KEY` with no backup means every stored credential is
unrecoverable. Treat it like a database master key.

## MCP JWT settings

`prisma_internal` session JWTs are signed with:

- `PRISMA_MCP_JWT_SECRET` (recommended)
- fallback: `HERMES_API_KEY` (for compatibility only)

Token TTL is controlled by `PRISMA_MCP_JWT_TTL_SECONDS` (default 900 seconds).
Keep it short and rotate `PRISMA_MCP_JWT_SECRET` periodically.

## Browser-Use via MCP

Browser-Use Cloud is exposed to Hermes as the internal MCP server
`browser_use_internal` at `/api/mcp/browser-use`. The bootstrap emits this
entry whenever the workspace vault has an active `browser-use` integration OR
the global `BROWSER_USE_API_KEY` env is set.

### Create the vault integration

In `Settings → Integrations`:

1. Provider: **Browser-Use Cloud** (slug must be `browser-use`).
2. `auth_type: api_key`.
3. Secret `api_key` — paste the Browser-Use Cloud API key. Stored
   AES-256-GCM-encrypted; never returned to the client.
4. Optional config:
   - `profile_id` — persistent browser profile id (keeps logins/cookies).
   - `proxy` — object the browser-use API accepts (`server`, `username`,
     `password`, …).
   - `baseUrl` — override only if you are pointing at a staging endpoint.

If no vault row exists, the MCP server falls back to `BROWSER_USE_API_KEY`
from the process env. Per-workspace vault always wins over env.

### Exposed Hermes MCP tools

`browser_use_internal` publishes a deliberately narrow surface:

- `browser.run` — free-form agent task. Args: `{ task, profile_id?, max_steps? }`.
- `browser.scrape` — structured scrape. Args: `{ url, schema?, profile_id? }`.
- `browser.portal_check` — recurring portal audit. Args: `{ slug, task, profile_id? }`.
- `browser.form_submit` — form fill + submit. Args: `{ url, fields, profile_id? }`.

Each tool returns an MCP `tools/call` result with `structuredContent` of
shape `{ ok, data | error, runId? }`, mirroring the `prisma_internal` route.
The server always sends `Authorization: Bearer $api_key` to
`${BROWSER_USE_API_BASE_URL:-https://api.browser-use.com}/api/v1/run-task`.

### Session JWT + TTL

Same JWT as Phase 1. The `mcp-config` route mints a fresh short-lived token
via `issuePrismaMcpSessionToken({ workspaceId, workspaceSlug, agentId,
rolePreset, toolsInclude: browser.* })` and sets it as `Authorization: Bearer`
on the emitted `browser_use_internal` entry. TTL is governed by
`PRISMA_MCP_JWT_TTL_SECONDS` (default 900s) and the signing key by
`PRISMA_MCP_JWT_SECRET`.

### Troubleshooting

- **401 Missing/invalid MCP bearer token** — the session JWT expired, was
  never attached, or `PRISMA_MCP_JWT_SECRET` rotated. Rebootstrap the agent
  so Hermes fetches a fresh `mcp_servers` block.
- **412 `browser_use_not_configured`** — no workspace vault row and no env
  key. Add the `browser-use` integration or set `BROWSER_USE_API_KEY`.
- **502 upstream error** — Browser-Use Cloud returned an error. The tool
  result carries the upstream message verbatim; the outbound event is logged
  to `workspace_outbound_events` under `kind=browser_use.<tool>`.

## Memory + Messaging Gateway (Phase 3)

Phase 3 extends the `/api/workspaces/<slug>/agents/<agentId>/mcp-config`
response with two new top-level fields that Hermes consumes alongside
`mcp_servers`:

```json
{
  "mcp_servers": { "...": "..." },
  "memory": {
    "provider": "supermemory",
    "config": {
      "api_key_ref": "env:SUPERMEMORY_API_KEY",
      "namespace": "prisma:<workspaceId>:<agentId>"
    }
  },
  "gateway": {
    "enabled": true,
    "channels": [
      { "kind": "whatsapp", "phone_number_id": "...", "api_key_ref": "vault:meta-whatsapp:api_key" },
      { "kind": "telegram", "bot_token_ref": "env:TELEGRAM_BOT_TOKEN_OPERATOR" },
      { "kind": "email",    "address": "ops@example.com", "imap_ref": "vault:email-imap:password" }
    ]
  }
}
```

Both fields are always present. When no memory provider is configured the
response contains `memory: { "provider": "none" }`. When no channels are
wired up, `gateway: { "enabled": false, "channels": [] }`. This keeps the
response shape stable regardless of rollout state.

### Memory provider (Supermemory)

`lib/hermesMemoryConfig.ts#resolveHermesMemoryConfig` picks a provider using
this order:

1. If `SUPERMEMORY_API_KEY` is set in the Prisma env, emit
   `{ provider: "supermemory", config: { api_key_ref: "env:SUPERMEMORY_API_KEY", namespace: "prisma:<wsId>:<agentId>" } }`.
2. Else look up the workspace vault for an integration with
   `slug = "supermemory"` and `auth_type = api_key`. If active with secrets,
   emit `api_key_ref: "vault:supermemory:api_key"` plus `integration_id`.
3. Else emit `{ provider: "none" }`.

The raw API key is **never** embedded in the response. The `*_ref` string is
a pointer that Hermes resolves from its own env (`env:NAME`) or from the
vault via the secure path (`vault:<slug>:<key>`).

`lib/supermemory.ts` also now exports `recordConversationTurn(...)`. It is a
no-op when `SUPERMEMORY_API_KEY` is unset and is not yet invoked from
`app/api/chat/route.ts`; a follow-up phase wires it in.

### Vault integration slugs

Create these in `Settings → Integrations` to light up the gateway:

| Slug             | Purpose                              | auth_type   | Expected secret keys |
|------------------|--------------------------------------|-------------|----------------------|
| `supermemory`    | Fallback when env key unset          | `api_key`   | `api_key`            |
| `meta-whatsapp`  | Meta Cloud API WhatsApp sender       | `api_key`   | `api_key`            |
| `telegram`       | Bot API fallback when env not set    | `api_key`   | `bot_token`          |
| `email-imap`     | IMAP inbox for gateway email channel | `api_key`   | `password`           |
| `email-smtp`     | SMTP outbound for gateway email      | `api_key`   | `password`           |

Per-agent `channel_config` (stored on `workspace_agents`) drives which
channels are attempted. Example:

```json
{
  "whatsapp": { "phone_number_id": "123456789" },
  "telegram": { "env_var": "TELEGRAM_BOT_TOKEN_OPERATOR", "allowed_chat_ids": ["12345"] },
  "email": { "address": "ops@example.com" }
}
```

### The `*_ref` convention

Prisma never inlines plaintext secrets in the `mcp-config` response. Every
credential-bearing field is a `*_ref` string with one of these schemes:

- `env:<NAME>` &mdash; Hermes reads `process.env[NAME]` on its side.
- `vault:<slug>:<key_name>` &mdash; Hermes fetches the decrypted secret from
  Prisma's vault via the service-role API; plaintext never crosses the
  wire in the `mcp-config` payload.

### knowledge_scope side-effects

On `POST /api/admin/workspaces/<id>/bootstrap-agent` the existing
`mergeReadinessIntoKnowledgeScope` output is extended with:

- `memory_provider`: `"supermemory" | "none"` &mdash; mirrors the resolved
  provider at bootstrap time.
- `gateway_channels`: `string[]` &mdash; the `kind`s of channels resolved from
  `channel_config` + vault.

These are snapshots for observability; Hermes should always treat
`mcp-config` as the live source of truth.

### Rotation

Rotating `SUPERMEMORY_API_KEY` intentionally invalidates the namespace the
agent was attached to &mdash; Supermemory scopes container visibility by key.
This is the expected behaviour: after a rotation the agent gets a fresh,
empty namespace and any prior memory is orphaned under the old key. Plan
exports accordingly before rotating. Vault-stored Supermemory credentials
can be rotated per-workspace via `Settings → Integrations`.
