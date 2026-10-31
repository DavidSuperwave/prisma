# Grupo Automotriz – Operations Workflow (Pilot)

## Inventory

- List vehicle inventory and sync with CMS. Operators must see stock, trim, and pricing by territory.
- Apply promotion rules: percentage off MSRP, stackable with dealer cash when configured in the ops sheet.
- Reconcile spreadsheet uploads against CMS truth (`cms.list_inventory` / `cms.push_inventory`).

## Leads and routing

- Inbound lead creates or updates a person record, assigns territory from ZIP or store code.
- Hot leads: score by budget fit + intent; route to the correct rep queue and notify via workspace conversations.

## Success criteria

- Single source of truth for inventory; promotions applied consistently before hand-off to sales.
