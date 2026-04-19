---
name: prisma-images
description: Search, generate, and save images inside Prisma chat. Covers images.search (SerpAPI Google Images), images.generate (OpenRouter → google/gemini-2.5-flash-image-preview "nano-banana", text-to-image + img2img; falls back to direct Google GenAI), images.save, and the in-chat ImagePickerCard selection UX.
---

# prisma-images

Three tools, one candidate cache, one picker UI. Use these whenever a user
asks for a photo, a generated illustration, or wants to improve an existing
image.

## Tools

### `images.search`

Fetches real web photos via SerpAPI Google Images.

```
{"type":"tool_call","id":"i1","name":"images.search","args":{
  "query":"Ford Bronco Sport 2025 press photo",
  "count":8
}}
```

Result:

```json
{ "ok": true, "data": {
  "query": "Ford Bronco Sport 2025 press photo",
  "candidates": [
    { "id": "src_abc123", "url": "https://...", "thumb": "https://...",
      "source": "ford.com", "sourceUrl": "https://...", "title": "...",
      "width": 1920, "height": 1080 }
  ]
}}
```

The `id` stays valid for 30 minutes and is what `images.save` uses to pull
the right photo. Do **not** echo full URLs into chat; surface the candidates
array so the UI's `ImagePickerCard` can render a grid and let the user pick.

### `images.generate`

Text-to-image or image-to-image via OpenRouter routed to
`google/gemini-2.5-flash-image-preview` (a.k.a. "nano-banana"). Falls back to
direct Google GenAI if `OPENROUTER_API_KEY` is unset. Up to 4 candidates per
call.

Text-to-image:
```
{"type":"tool_call","id":"i2","name":"images.generate","args":{
  "prompt":"A 2025 Ford Bronco Sport parked at a dealership at golden hour, photo realistic, editorial lighting",
  "n":4,
  "aspect":"landscape"
}}
```

Image-to-image (use the user's reference photo or one we saved earlier):
```
{"type":"tool_call","id":"i3","name":"images.generate","args":{
  "prompt":"Same SUV but in our dealership parking lot with the GB Automotriz sign",
  "refs":["https://...signed.supabase.co/.../bronco-sport.png"],
  "n":2
}}
```

Candidates come back as `{ id, previewDataUrl, mimeType }`. The UI will
render them inline from the data URL so nothing else has to be downloaded.

### `images.save`

Persists a candidate (or a raw URL) to Supabase Storage and, optionally,
attaches it to a record (adds to `data.attachments` and sets `data.image`
so CMS sync has a canonical URL to push).

```
{"type":"tool_call","id":"i4","name":"images.save","args":{
  "candidateId":"gen_xxxx",
  "recordId":"<vehicle record id>",
  "caption":"Hero photo for Bronco Sport 2025 inventory page"
}}
```

Returns `{ path, publicUrl, signedUrl, mimeType, size, recordId }`.

## End-to-end: "I need a pic for a 2025 Bronco Sport"

1. Call `images.search` with a specific query (year + model + "press photo"
   or "dealership"). Present the candidates to the user — the UI renders the
   grid automatically when the tool_result has name `images.search`.
2. If the user likes one, they click "Use this" in the picker. That hits
   `/api/workspaces/<slug>/chat/select-image` which calls `images.save`.
   After you see the resulting chat follow-up ("saved image to record …"),
   proceed.
3. If no result looks right, call `images.generate` with a descriptive
   prompt. Use `aspect: "landscape"` for hero banners, `"square"` for grid
   tiles.
4. For touch-ups (e.g. "put it in front of our dealership"), call
   `images.generate` again with `refs: ["<signed URL of a saved image>"]`.
   This switches to img2img mode automatically.
5. Always save the winner with `images.save` before moving on to CMS sync
   (see `prisma-cms-sync`) so `record.data.image` is set.

## Tips

- **Do not paste base64 in prose.** Candidates already have `previewDataUrl`
  so the UI renders without you repeating bytes.
- **Name the candidateId, not the URL.** When asking `images.save` to
  persist, use `candidateId` from the prior tool_result. URLs are fine only
  for direct links the user provided.
- **Image rights.** SerpAPI returns a `source` (e.g. `ford.com`) and
  `sourceUrl`. Flag this in your message to the user so they know whether
  the photo is licensable for their site.
- **Aspect hints.** The Gemini prompt is augmented with the aspect arg; you
  do not need to include "16:9" in your prompt text.
- **Retry strategy.** If `images.generate` returns an error, apologize and
  try once more with a shortened prompt; don't loop.

## Related skills

- [`prisma-agent-tools`](../prisma-agent-tools/SKILL.md) — SSE tool envelope.
- [`prisma-cms-sync`](../prisma-cms-sync/SKILL.md) — push a saved image to the external inventory site.
