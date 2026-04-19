## Inventory API (Prisma-driven)

The `/seminuevos` and `/cars/[slug]` pages read live inventory from Vercel
Blob. Prisma (or any authorized caller) can update the inventory via a
signed webhook.

### Data shape

```ts
type Vehicle = {
  slug: string;          // unique, URL-safe
  brand: string;
  model: string;
  year: number;
  price: string;         // human-readable, e.g. "$599,000 MXN"
  image?: string;
  location?: string;
  description?: string;
  features?: string[];
  specs?: Record<string, string>;
  status?: "available" | "sold" | "reserved";
};
```

### Endpoints

#### `GET /api/inventory`

Public. Returns `{ vehicles: Vehicle[], updatedAt: string }`.

#### `POST /api/inventory/upsert`

Authenticated with HMAC-SHA256. Caller computes:

```
X-Prisma-Signature: sha256=<hex(hmac_sha256(body, INVENTORY_WEBHOOK_SECRET))>
```

Request body:

```json
{
  "op": "upsert" | "delete",
  "vehicles": [ Vehicle, ... ]
}
```

Response:

```json
{
  "ok": true, "op": "upsert", "count": 3, "total": 18,
  "skipped": [], "blobUrl": "https://...", "updatedAt": "..."
}
```

Missing or invalid signatures return `401`. Vehicles with missing required
fields (`slug`, `brand`, `model`, `year`, `price`) are skipped and surfaced
in `skipped[]`.

### Environment variables

| Name | Purpose |
| --- | --- |
| `INVENTORY_WEBHOOK_SECRET` | HMAC key. Share with Prisma's integration vault as `sharedSecret`. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob write credential (added automatically when the Blob integration is enabled). |

### Prisma agent reference

The Prisma agent uses this endpoint through its `cms.push_inventory` tool.
See `skills/prisma-cms-sync/SKILL.md` in the Prisma repo for the operator +
agent flow.
