# Hermes Extensions — End-to-End Validation Runbook

_Date: 2026-04-17_

This runbook validates the three Hermes capability extensions added in this cycle:

1. **Dynamic integrations** (Vault + per-workspace MCP + chat-paste scrubbing)
2. **Image search / generation / save** (SerpAPI + Gemini nano-banana-pro img2img)
3. **CMS sync** to the external Vercel-hosted site `gb-automotriz.vercel.app`

Run each step in order against a staging Prisma workspace and a Vercel preview
of the patched `gb-automotriz-web` site.

---

## 0. Pre-flight

Set the following environment variables in Prisma (`.env.local` or Vercel project):

| Var | Required | Purpose |
| --- | --- | --- |
| `PRISMA_SECRETS_KEY` | yes | Base64 32-byte key for AES-256-GCM vault |
| `OPENROUTER_API_KEY` | yes for gen | Image gen via `google/gemini-2.5-flash-image-preview` through OpenRouter |
| `OPENROUTER_IMAGE_MODEL` | no | Override the default image model (default: `google/gemini-2.5-flash-image-preview`) |
| `GOOGLE_GENAI_API_KEY` | optional | Direct Google fallback if OpenRouter is unset |
| `SERPAPI_KEY` | yes for search | Google Images via SerpAPI |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | yes | storage + vault |

On `gb-automotriz-web` (Vercel project):

| Var | Required | Purpose |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | yes | Vercel Blob read-write |
| `INVENTORY_WEBHOOK_SECRET` | yes | HMAC secret shared with Prisma vault |

Apply the DB migration:

```
supabase/migrations/20260417_000003_integrations_vault.sql
```

Verify the tables exist: `workspace_integrations`, `workspace_integration_secrets`, `workspace_outbound_events`.

---

## 1. Dynamic integration — Close API pull → CRM upsert

### 1.1 Vault setup (UI path)

1. Open `http://localhost:3000/workspaces/<slug>/settings/integrations`.
2. Click **Add integration**:
   - Provider: `close`
   - Label: `Close CRM`
   - Slug: `close`
   - Secret `apiKey`: paste a real Close API key (`api_...`)
3. Click **Save**. Expect a row to appear in the list.
4. Click **Test** on the row. Expect green ✓ and `GET /me` 200.

### 1.2 Chat-paste fallback (alternative path)

In chat, send:

```
Use this Close key to pull our last 10 leads: api_test1234567890abcdefghijklmnop
```

Expected:
- Message text stored as `Use this Close key to pull our last 10 leads: [redacted:close/apiKey]`.
- A new integration `close-auto` is created silently and a system note is prepended so the agent can call `integrations.call` with `slug: "close-auto"`.
- `workspace_outbound_events` has a row of kind `secret.scrubbed`.

### 1.3 Agent run

In chat, say:

```
Pull my last 10 Close leads and upsert them into the CRM pipeline as "lead".
```

Expected agent actions (visible in SSE stream):
1. `integrations.list` → returns Close integration(s).
2. `integrations.sync_leads` with `slug: close`, `limit: 10`, `stage: "lead"`.
3. Returns `{ fetched, upserted, failed, errors }`.

Validation:
- `GET /api/workspaces/<slug>/crm/people` returns the new contacts.
- `workspace_outbound_events` shows one row per outbound call.

---

## 2. Image search → generate → save (Bronco Sport)

### 2.1 Search

In chat, say:

```
I need a pic for a 2025 Ford Bronco Sport. Find me a few online.
```

Expected:
- Agent calls `images.search` with `query: "2025 Ford Bronco Sport"`.
- SSE renders an `ImagePickerCard` with 4–8 thumbnails.
- Each candidate has a `candidateId` cached for 5 min in `lib/images/candidateCache.ts`.

### 2.2 Generate (img2img)

Reply in chat:

```
Cool, but make our own version of the first one, studio shot, 3/4 angle.
```

Expected:
- Agent calls `images.generate` with `prompt` and `refs: [{ candidateId: <picked> }]`.
- New picker card appears with 3–4 generated variants.

### 2.3 Save to workspace media

Click **Use this** on a candidate in the picker card.

Expected:
- `POST /api/workspaces/<slug>/chat/select-image` fires.
- Image is uploaded to the `workspace-media` Supabase Storage bucket.
- Response `{ url, path, ... }`.
- If `recordId` was provided, the record's canonical `image` field is updated.

---

## 3. CMS sync — push new inventory to gb-automotriz

### 3.1 External site setup

Apply the patch from `docs/gb-automotriz-web-patch/` to
`https://github.com/jorgeaz2001-lgtm/gb-automotriz-web`:

```
cp -r docs/gb-automotriz-web-patch/lib/inventory.ts  ../gb-automotriz-web/lib/
cp -r docs/gb-automotriz-web-patch/app/api/inventory ../gb-automotriz-web/app/api/
cp    docs/gb-automotriz-web-patch/app/seminuevos/page.tsx ../gb-automotriz-web/app/seminuevos/page.tsx
cp    docs/gb-automotriz-web-patch/app/cars/[slug]/page.tsx ../gb-automotriz-web/app/cars/[slug]/page.tsx
```

In the site repo:

```
pnpm add @vercel/blob
# set BLOB_READ_WRITE_TOKEN, INVENTORY_WEBHOOK_SECRET in Vercel
vercel --prebuilt --prod=false
```

Note the preview URL, e.g. `https://gb-automotriz-web-git-feature-inventory-foo.vercel.app`.

### 3.2 Vault setup in Prisma

UI → Settings → Integrations → Add:
- Provider: `gb_automotriz_cms`
- Slug: `gb-site`
- Config: `{ "baseUrl": "<preview url>" }`
- Secret `hmacSecret`: same value as `INVENTORY_WEBHOOK_SECRET` on the site

Click **Test**. Expect `GET /api/inventory` to 200 with `{ vehicles: [...] }`.

### 3.3 Agent run

In chat, say:

```
Add these two new units to gb-automotriz:
- 2023 Ford Bronco Sport Outer Banks, $545,000, stock BR-2023-01
- 2022 Chevrolet Silverado Z71, $489,000, stock CH-2022-07
```

Expected agent actions:
1. `cms.list_inventory` with `slug: "gb-site"` (current state).
2. `cms.push_inventory` with a `vehicles` array.
3. Response includes `{ upserted, errors }`.

### 3.4 Verify on the Vercel preview

- `curl <preview>/api/inventory` → returns the two new vehicles plus existing.
- Visit `<preview>/seminuevos` → new cards appear.
- Visit `<preview>/cars/bronco-sport-outer-banks-2023` → detail page renders.
- `workspace_outbound_events` has two rows `kind: cms.push_inventory`, status 200.

---

## 4. Sign-off checklist

- [ ] Migration `20260417_000003_integrations_vault.sql` applied.
- [ ] Vault UI reachable; at least one Close integration created + tested.
- [ ] Chat-paste scrubbing redacts and creates an auto-integration.
- [ ] `integrations.sync_leads` pulls real Close leads into CRM.
- [ ] `images.search` → picker card renders 4+ candidates.
- [ ] `images.generate` (img2img) returns 3+ variants.
- [ ] `images.save` uploads to Supabase Storage and attaches to a record.
- [ ] Patched `gb-automotriz-web` preview serves `/api/inventory` (Vercel Blob).
- [ ] `cms.push_inventory` updates the site and `/seminuevos` revalidates within one request cycle.
- [ ] `workspace_outbound_events` has audit rows for every external call.

If any of the above fails, the failing tool call will be logged to
`workspace_outbound_events` with `ok=false` and a human-readable `error`.
