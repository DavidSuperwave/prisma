# GB Automotriz Inventory Demo

This runbook creates a client workspace from a file, loads vehicle inventory into the meta-model, and links that inventory to the existing public landing-site inventory API.

## Goal

- Prisma workspace: `gb-automotriz-demo`
- Object: `Vehicles`
- Record key: `stock_number`
- Landing repo: `https://github.com/jorgeaz2001-lgtm/gb-automotriz-web`
- Public inventory API: `/api/public/sites/gb-automotriz-demo/inventory`

## Seed From File

1. Edit the inventory file:

```bash
data/gb-automotriz-inventory.json
```

2. Run the seed:

```bash
npm run seed:client-workspace
```

3. To soft-delete current vehicle rows for that workspace object before reimporting:

```bash
npm run seed:client-workspace -- --reset-records
```

The script upserts the workspace, `Vehicles` object, fields, available-inventory view, vehicle records, import history, project metadata, and landing-site metadata.

## Demo Test

Start Prisma:

```bash
npm run dev
```

Then open:

```bash
http://localhost:3000/api/public/sites/gb-automotriz-demo/inventory
```

Change a vehicle price or status inside the Prisma workspace, then refresh that API route. The updated record should appear immediately because the public route reads from Supabase.

## Vercel Integration Direction

For the GB Automotriz landing page, the clean launch path is:

1. Import `jorgeaz2001-lgtm/gb-automotriz-web` into Vercel.
2. Add environment variables that point the landing page to Prisma's public inventory API.
3. In the landing page, fetch the public route server-side or with ISR/revalidation.
4. Keep Prisma as the source of truth for inventory and price edits.

Recommended landing-page env shape:

```bash
PRISMA_PUBLIC_INVENTORY_API=https://<prisma-domain>/api/public/sites/gb-automotriz-demo/inventory
```

If the landing page needs instant updates, add a revalidation webhook after this file-based demo is validated.
