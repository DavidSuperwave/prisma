---
name: prisma-cms-sync
description: Keep the workspace `vehicles` records in Prisma as the source of truth and sync them to the gb-automotriz-web inventory site via HMAC-signed webhooks. Covers `cms.bootstrap_vehicles`, `cms.sync_inventory`, `cms.list_inventory`, and `cms.push_inventory`.
---

# prisma-cms-sync

Prisma's `cms.*` tools let the agent manage a client's public inventory
without any direct DB access on the site. All changes go through a signed
HTTP webhook the site verifies with a shared secret, and **the workspace
`vehicles` records are the source of truth** — not the site.

Target site: https://github.com/jorgeaz2001-lgtm/gb-automotriz-web
Endpoints:

- `GET {baseUrl}/api/inventory` — public, returns `{ vehicles: Vehicle[], updatedAt }`
- `POST {baseUrl}/api/inventory/upsert` — HMAC-verified, accepts
  `{ op: 'upsert' | 'delete', vehicles: Vehicle[] }`

## Vehicle schema (must match site exactly)

```ts
type Vehicle = {
  slug: string;          // unique, URL-safe
  brand: string;         // "Ford"
  model: string;         // "Bronco Sport"
  year: number;          // 2025
  price: string;         // "$599,000 MXN" (keep formatting identical to site)
  image?: string;        // public URL — see "Image URLs" below
  location?: string;
  description?: string;
  features?: string[];
  specs?: Record<string, string>;
  status?: "available" | "sold" | "reserved";
};
```

Required keys: `slug`, `brand`, `model`, `year`, `price`. Missing any of
these will make `cms.push_inventory` skip the row (and include it in
`details.skipped`).

## Data model in Prisma

Prisma stores vehicles as plain records on a workspace object whose slug is
`vehicles`. Fields match the Vehicle schema 1:1. If the object doesn't exist
yet, call `cms.bootstrap_vehicles` first — the agent should never try to
create the `vehicles` object with raw schema tools.

## Tools

### `cms.bootstrap_vehicles` — idempotent one-time setup

Creates (or updates) the `vehicles` workspace object and its fields so they
match the site contract. Safe to re-run.

```
{"type":"tool_call","id":"m0","name":"cms.bootstrap_vehicles","args":{}}
```

### `cms.sync_inventory` — pull from the site into records

Mirrors everything live on the site into Prisma records. Use this when the
workspace is new or the records have drifted from the site. Matches on
`slug` and upserts.

```
{"type":"tool_call","id":"m1","name":"cms.sync_inventory","args":{
  "slug":"gb-automotriz-prod"
}}
```

### `cms.list_inventory` — read-only view of what's live

```
{"type":"tool_call","id":"m2","name":"cms.list_inventory","args":{
  "slug":"gb-automotriz-prod"
}}
```

Use this to build a local-vs-remote diff before pushing.

### `cms.push_inventory` — confirm-before-commit

`cms.push_inventory` is a **write** tool. It always runs in two phases:

1. **Propose**: send the tool_call with `dryRun:true` (the default). The
   response is `{ proposal, confirmToken, expiresAt }`. The chat UI shows
   the user a card listing the slugs and the op (`upsert` or `delete`).
2. **Commit**: wait for the user to click Confirm. The next user turn
   contains the confirm token (look for `<<CONFIRM_PROPOSAL token=... >>`).
   Re-issue the SAME tool_call with **the exact same args** plus
   `dryRun:false` and `confirmToken:"<token>"`. Any mismatch between the
   two sets of args invalidates the token and the commit is refused.

#### Selecting which vehicles to push

Prefer pushing from records (the source of truth). Use one of:

- `recordIds: string[]` — exact record ids.
- `slugs: string[]`     — slugs to look up on the `vehicles` object.
- `all: true`           — push every `vehicles` record.

`vehicles: Vehicle[]` is still accepted for ad-hoc pushes but should be a
last resort — it bypasses record storage and makes drift more likely.

Push changed slugs (dry run):
```
{"type":"tool_call","id":"m3","name":"cms.push_inventory","args":{
  "slug":"gb-automotriz-prod",
  "op":"upsert",
  "slugs":["bronco-sport-2025-001"]
}}
```

Commit (after user confirmation):
```
{"type":"tool_call","id":"m3b","name":"cms.push_inventory","args":{
  "slug":"gb-automotriz-prod",
  "op":"upsert",
  "slugs":["bronco-sport-2025-001"],
  "dryRun":false,
  "confirmToken":"v1.abcdef..."
}}
```

Delete (by slug):
```
{"type":"tool_call","id":"m4","name":"cms.push_inventory","args":{
  "slug":"gb-automotriz-prod",
  "op":"delete",
  "slugs":["bronco-sport-2025-001"]
}}
```

Retries up to 3× on 5xx / network errors, exponential backoff. Every
attempt (success or failure) is logged to `workspace_outbound_events` so
operators can audit pushes later.

## Images

Vehicle images live on the record at `record.data.image` and must be a
long-lived **public URL** — not a Supabase signed URL, which will expire
and break the public site. The `images.save` tool writes the Supabase
Storage `publicUrl` (falling back to a signed URL only if the bucket is
private), so always go through it instead of constructing URLs by hand.

Image flow:

1. `images.search { query: "Ford Bronco Sport 2025" }` — free, returns
   web candidates.
2. `images.generate { prompt: "..." }` — **consumes image-generation
   credits the client pays for**. Always warn the user before calling it.
3. `images.save { candidateId, recordId }` — writes the chosen image to
   `record.data.image` (public URL) and attaches the asset to the record.

The UI exposes this on each vehicle row via an *Adjuntar imagen* action
that opens the same `ImagePickerCard` the chat uses.

## Suggested workflow

1. **Bootstrap** (once per workspace): `cms.bootstrap_vehicles`.
2. **Sync**: if Prisma is empty or drifted, run `cms.sync_inventory`.
3. **Edit** records in Prisma — this is where the operator makes price
   changes, status flips, new photos. Use `records.query` +
   `records.update_bulk` for agent-driven bulk edits.
4. **Diff**: `cms.list_inventory` → compare against records.
5. **Push** with `cms.push_inventory` (dryRun first, confirm, then
   commit). Report the response count and any `skipped` rows back to the
   user.

## Full worked example — bulk price change

User: *"Sube 5% el precio de todos los Ford Bronco."*

```
1. records.query { object: "vehicles", where: { brand: "Ford", model: "Bronco Sport" } }
   → 3 records returned.
2. records.update_bulk {
     object: "vehicles",
     updates: [
       { id: "rec_1", data: { price: "$629,000 MXN" } },
       { id: "rec_2", data: { price: "$649,000 MXN" } },
       { id: "rec_3", data: { price: "$669,000 MXN" } },
     ]
   }
3. cms.push_inventory {
     slug: "gb-automotriz-prod",
     op: "upsert",
     slugs: ["bronco-sport-2025-001","bronco-sport-2025-002","bronco-sport-2025-003"]
   }   // dryRun by default -> proposal card
4. (user confirms in the UI)
5. cms.push_inventory {
     slug: "gb-automotriz-prod",
     op: "upsert",
     slugs: [...same...],
     dryRun: false,
     confirmToken: "v1..."
   }
6. Report: "Actualicé 3 Bronco Sport. Ya aparecen con los nuevos precios en
    https://gb-automotriz.vercel.app/seminuevos."
```

## Setup checklist (operator side)

1. Deploy the `gb-automotriz-web` PR that adds the inventory API + Vercel
   Blob.
2. Set `INVENTORY_WEBHOOK_SECRET` and `BLOB_READ_WRITE_TOKEN` on the site's
   Vercel project.
3. In Prisma `Settings → Integrations`, add:
   - Provider: `GB Automotriz CMS`
   - Label: `GB Automotriz production`
   - `baseUrl` (config): `https://gb-automotriz.vercel.app`
   - `sharedSecret` (secret): same value as `INVENTORY_WEBHOOK_SECRET`
4. Hit **Test** in the UI. A green OK confirms the site is reachable and
   the public inventory endpoint responds.
5. Run `cms.bootstrap_vehicles` (once), then `cms.sync_inventory` to seed
   records from the live site.

## Related skills

- [`prisma-agent-tools`](../prisma-agent-tools/SKILL.md) — SSE tool envelope.
- [`prisma-integrations`](../prisma-integrations/SKILL.md) — the vault that holds
  the baseUrl + sharedSecret, plus `bindings.*` for generic pull/push.
- [`prisma-images`](../prisma-images/SKILL.md) — how to populate `record.data.image`
  before pushing.
