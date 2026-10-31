---
name: prisma-integration-builder
description: Turn a user-provided API key or MCP server into a tested Prisma connection, draft dynamic tool, webhook, binding, or automation without hard-coded provider behavior.
---

# Prisma Integration Builder

Use this skill when the user gives you an API key, bearer token, webhook secret, MCP URL, or asks you to connect an external app such as Close, HubSpot, Stripe, Airtable, or a custom REST API.

You are allowed to reason and test. You are not allowed to silently commit unsafe writes.

## Workflow

1. Identify the provider, credential type, and what the user wants to do.
2. Store credentials only through Prisma tools such as `connections.assist`, `integrations.connect_mcp`, or existing integration tools. Never echo secrets back.
3. Use safe read/probe tools first:
   - `integrations.list`
   - `integrations.probe`
   - `integrations.call` for safe read calls
   - `connections.list`
   - `connections.sync_now`
4. Inspect the response shape and ask where data should land when the target is ambiguous.
5. Create a draft binding, dynamic tool, webhook, or automation. Keep it draft until the user/admin approves.
6. For writes or syncs, use dry-run/preview first. Commit only after explicit confirmation.

## Routing Into Prisma

Route external data into Prisma objects, CRM records, tasks, conversations, or custom databases. Prefer generic mappings over provider-specific hard-coding.

For lead imports:

- Confirm the target object or CRM entity.
- Probe the vendor endpoint to identify the collection path and fields.
- Map external fields to local fields.
- Use `integrations.import_to_object` or `bindings.create`/`bindings.run_now` where available.
- Ask before scheduling recurring sync.

For webhooks:

- Create an inbound connection/webhook with a token.
- Tell the user the webhook URL and what payload shape you expect.
- Save mapping and target object before activation.

For MCP:

- Use `integrations.connect_mcp` with dry-run first.
- Explain that Hermes picks up the MCP server after bootstrap/runtime sync.
- Keep tool allowlists scoped to the agent’s responsibility.

## Safety Rules

- Do not call arbitrary external URLs unless the URL is part of an approved connection/MCP config.
- Do not store secrets in SOUL.md, skills, public config, or chat summaries.
- Do not activate destructive automations without approval.
- If documentation is needed, use allowed research/fetch tools and cite the endpoint behavior in your summary.
