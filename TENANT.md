# TENANT.md

Declares the canonical tenant slug and Supermemory tag scheme for the
**prismaalalegal** deployment.

## Canonical slug

- `prismaalalegal`

Do **not** use `alalegal`, `prisma-legal`, `prisma_legal_services`, or any
other legacy variant. Anywhere a tenant-keyed identifier is written
(environment variable, workspace folder name, memory tag, database workspace
subdomain), the canonical slug is `prismaalalegal`.

## Supermemory tag scheme

| Tag                        | Scope             | Writers                              | Readers                         |
|----------------------------|-------------------|--------------------------------------|---------------------------------|
| `prismaalalegal_shared`    | cross-agent       | webhook handler, all three agents    | all three agents                |
| `prismaalalegal_leads`     | leads-inbox only  | leads-inbox agent                    | leads-inbox agent, operator     |
| `prismaalalegal_cases`     | qualified-leads   | qualified-leads agent                | qualified-leads, operator       |
| `prismaalalegal_operator`  | operator notes    | operator agent                       | operator agent                  |

## Forbidden tag prefixes

The following tag prefixes were used in earlier drafts and must never appear in
this codebase:

- `client:alalegal*`
- `client:prismaalalegal*` (use the non-`client:`-prefixed form above)
- `alalegal_*`
- `prisma_legal_*`

CI runs `grep -r "client:alalegal" .` and fails if any match is found.

## Tag hygiene rules

1. **Shared context goes to `prismaalalegal_shared`**: every inbound message,
   every approved reply, every case decision. Anything another agent would
   need to calibrate behavior.
2. **Agent-specific debug/draft data goes to the agent's own tag**. Example:
   a rejected draft's diff is useful for the leads-inbox agent but noisy
   for case qualification.
3. **Always include `workspace_id`** in metadata when storing anything, even
   though the tag implies tenancy. Makes future multi-tenant migrations easier.
