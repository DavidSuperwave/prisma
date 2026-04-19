# gb-automotriz-web inventory patch

Changes the site at https://github.com/jorgeaz2001-lgtm/gb-automotriz-web needs
so that Prisma's `cms.push_inventory` tool can drive its inventory.

This folder contains drop-in files. Copy them into a fresh branch in the site
repo, add the listed dependency, set the two env vars in Vercel, and push to
trigger a preview deploy.

## 1. Add dependency

```
npm install @vercel/blob
```

## 2. Set Vercel env vars (all environments)

- `INVENTORY_WEBHOOK_SECRET` — any long random string; share with Prisma's
  vault integration as the `sharedSecret` secret.
- `BLOB_READ_WRITE_TOKEN` — provisioned automatically when you add the
  Vercel Blob integration to the project.

## 3. Files to copy

```
lib/inventory.ts                       -> lib/inventory.ts
app/api/inventory/route.ts             -> app/api/inventory/route.ts
app/api/inventory/upsert/route.ts      -> app/api/inventory/upsert/route.ts
app/seminuevos/page.tsx                -> replace existing app/seminuevos/page.tsx
app/cars/[slug]/page.tsx               -> replace existing app/cars/[slug]/page.tsx
README.inventory.md                    -> append the contents to the root README
```

All files live next to this README in `docs/gb-automotriz-web-patch/`.

## 4. Verify locally

```
npm run dev
# In another terminal, seed with one vehicle:
curl -X POST http://localhost:3000/api/inventory/upsert \
  -H "Content-Type: application/json" \
  -H "X-Prisma-Signature: sha256=$(node -e "console.log(require('crypto').createHmac('sha256', process.env.INVENTORY_WEBHOOK_SECRET).update(process.argv[1]).digest('hex'))" '{\"op\":\"upsert\",\"vehicles\":[{\"slug\":\"test-1\",\"brand\":\"Ford\",\"model\":\"Bronco Sport\",\"year\":2025,\"price\":\"$1\"}]}')" \
  -d '{"op":"upsert","vehicles":[{"slug":"test-1","brand":"Ford","model":"Bronco Sport","year":2025,"price":"$1"}]}'

curl http://localhost:3000/api/inventory
# -> { "vehicles":[{...}], "updatedAt":"..." }
```

## 5. Deploy

Push the branch, open a PR, let Vercel build a preview. Hand the preview URL
to Prisma's `Settings → Integrations → GB Automotriz CMS` as `baseUrl`.
