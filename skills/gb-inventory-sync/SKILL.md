---
name: gb-inventory-sync
description: Keep GB Automotriz CRM inventory in lock-step with the CMS. Prefers the GB CMS API (`cms.list_inventory` / `cms.sync_inventory`) and falls back to Browser-Use scraping when endpoints are unavailable.
---

# gb-inventory-sync

Use this skill whenever the operator asks to *"sync GB inventory"*, *"refresh
the vehicle catalog"*, or otherwise reconcile GB Automotriz's public site with
Prisma CRM records.

Primary path is the GB Automotriz CMS integration. Browser-Use Cloud is the
fallback — we only scrape the public catalog pages when the CMS endpoints are
missing, rate-limited, or disabled.

## Required MCP servers

- `prisma_internal` — `cms.list_inventory`, `cms.sync_inventory`,
  `records.query`, `records.bulk_update`, `integrations.list`,
  `integrations.call`.
- `browser_use_internal` — `browser.scrape`, `browser.run`. Only used as
  fallback when the CMS endpoints are unreachable.

## Required vault integrations

Check `integrations.list` first:

- [ ] `gb-automotriz` — provider `gb_automotriz_cms`, `auth_type: api_key`,
      with `api_key` secret and `config.baseUrl`.
- [ ] `browser-use` — provider `browser_use`, `auth_type: api_key`, secret
      `api_key`. Only required for the fallback path, but we always check for
      it up front so a partial failure doesn't strand the sync.

If the GB integration is missing, stop and tell the operator to add it. Do
**not** attempt to scrape without at least one credentialed path.

## Workflow (confirm before commit)

Prisma writes are two-phase (`dryRun: true` → `confirmToken` → `dryRun: false`).
Follow that protocol for every record write.

1. `integrations.list` — confirm `gb-automotriz` is `active`.
2. `cms.list_inventory { slug: "gb-automotriz" }` — pull the canonical list.
   On `200`, jump to step 4.
3. **Fallback**: if step 2 returns `404`, `501`, or an upstream error:
   ```json
   {
     "name": "browser.scrape",
     "args": {
       "url": "https://gbautomotriz.com/inventario",
       "schema": {
         "type": "array",
         "items": {
           "type": "object",
           "properties": {
             "sku": {"type": "string"},
             "title": {"type": "string"},
             "price": {"type": "number"},
             "url": {"type": "string"}
           },
           "required": ["sku", "title", "url"]
         }
       }
     }
   }
   ```
   Normalize the scraped payload into the same shape `cms.list_inventory`
   returns before proceeding.
4. `records.query` the current `vehicles` object to build an `{ sku → record }`
   map for diffing.
5. `records.bulk_update` with `dryRun: true` against the diff. The tool
   returns a preview plus `confirmToken`. Surface the counts
   (`create / update / retire`) to the operator and ask for confirmation.
6. On confirmation, call `records.bulk_update` again with the same payload,
   `dryRun: false`, and the `confirmToken` from step 5.
7. Optional: `cms.sync_inventory { slug: "gb-automotriz", dryRun: false }` to
   push the reconciled catalog back into the CMS (only when the operator asks
   for a two-way sync).
8. `activity.append` — summarize the run: source (`cms` vs `browser_scrape`),
   counts, and any records that failed.

## Output contract

```json
{
  "source": "cms | browser_scrape",
  "fetched": 128,
  "created": 4,
  "updated": 17,
  "retired": 2,
  "failed": [],
  "runId": "browser-use run id (only when fallback was used)"
}
```

## Guardrails

- Never call `records.bulk_update` with `dryRun: false` without a matching
  `confirmToken` from the immediately preceding dry run.
- Do not scrape if the CMS path worked — scraping burns browser-use minutes
  and risks rate limits.
- Retain the browser-use `runId` in activity/events so ops can replay a run.
- If >20% of records fail, stop and surface the errors instead of committing
  a lossy sync.

## Related skills

- [`prisma-cms-sync`](../prisma-cms-sync/SKILL.md) — shared CMS push logic.
- [`prisma-integrations`](../prisma-integrations/SKILL.md) — vault management.
- [`prisma-database`](../prisma-database/SKILL.md) — schema for the
  `vehicles` object.
