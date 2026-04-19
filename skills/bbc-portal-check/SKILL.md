---
name: bbc-portal-check
description: Daily BBC client-portal audit. Logs in via Browser-Use Cloud, pulls the latest portal artifacts, analyzes them as documents, and files structured findings back into the workspace.
---

# bbc-portal-check

Use this skill to run the recurring **BBC portal daily check** end-to-end from
a Prisma agent session. The agent drives Browser-Use Cloud to open the portal,
collects whatever is new (statements, alerts, forms), runs Prisma's document
analyzer on any PDFs/HTML artifacts, and creates Prisma records that the ops
team reviews in the Tasks/Documents UI.

## Required MCP servers

- `prisma_internal` — records, documents, tasks, activity, integrations.
- `browser_use_internal` — `browser.portal_check`, `browser.scrape`,
  `browser.run`. Emitted automatically when the workspace has a `browser-use`
  integration or `BROWSER_USE_API_KEY` env is set.

## Required vault integrations

Before running, verify with `integrations.list` that the workspace has:

- [ ] `browser-use` — `auth_type: api_key`, secret `api_key`, optional
      `config.profile_id` pointing at a browser-use profile with BBC login
      cookies persisted. A workspace `proxy` may also be configured here.
- [ ] `bbc-portal` (optional) — generic integration to capture credentials
      metadata and portal URLs (e.g. `config.login_url`, `config.dashboard_url`).

If either is missing, stop and ask the operator to add it in
`Settings → Integrations`. Never ask the user to paste API keys in chat.

## Workflow (confirm before commit)

Prisma's write tools follow a two-phase protocol: first call with
`dryRun: true`, show the operator the preview + `confirmToken`, and only then
call again with `dryRun: false` and the confirm token.

1. `integrations.list` — confirm `browser-use` (and `bbc-portal` if used)
   are `active`. Abort with a clear operator message if not.
2. `browser.portal_check`
   ```json
   {
     "slug": "bbc",
     "task": "Log in, open the Daily Audit dashboard, and list every new item since yesterday. For each, capture title, type, date, and the artifact URL."
   }
   ```
   Surface the returned `runId` in your reply so the operator can trace it.
3. For each artifact URL that looks like a document:
   - `documents.create` with `dryRun: true` using the URL / file reference.
   - On `confirmToken` back, call `documents.create` with `dryRun: false`.
   - Then `documents.analyze` on the returned document id to extract fields.
4. `records.create` (or `records.bulk_update`) to file the findings against
   the `bbc_portal_check` object. Always run the `dryRun: true` step first and
   read back the preview. Only commit after the operator acknowledges.
5. `activity.append` — summarize the run (count of new items, any errors) so
   the daily audit shows up in the workspace activity feed.

## Output contract

Return a short, structured summary to the operator:

```json
{
  "runId": "browser-use run id",
  "newItems": 4,
  "createdRecords": ["…uuid…"],
  "warnings": ["…human-readable strings…"]
}
```

Include the browser-use `runId` and any `warnings` verbatim. Do not paraphrase
Browser-Use error messages — paste them so they can be diagnosed.

## Failure handling

- 401 on `browser.portal_check` → session JWT expired or Prisma MCP secret
  rotated. Tell the operator to rebootstrap the agent.
- 412 `browser_use_not_configured` → add the `browser-use` vault entry.
- 502 from `browser_use_internal` → upstream Browser-Use error. Retry once;
  if it fails again, log and stop.
- Any write failure → stop immediately, do not retry with the same args.

## Related skills

- [`prisma-database`](../prisma-database/SKILL.md) — schema for the
  `bbc_portal_check` object.
- [`prisma-integrations`](../prisma-integrations/SKILL.md) — vault management.
