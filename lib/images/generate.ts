/**
 * Image generation via OpenRouter (preferred) or Google GenAI (fallback).
 *
 * OpenRouter path: POST /api/v1/chat/completions with an image-capable model
 * like `google/gemini-2.5-flash-image-preview` (a.k.a. "nano-banana"). The
 * response contains images under `choices[0].message.images[]`.
 *
 * img2img: include the reference image(s) in the user turn as
 * `{ type: "image_url", image_url: { url: <http or data: URL> } }` entries.
 *
 * Env:
 *   - OPENROUTER_API_KEY (already used elsewhere in Prisma for chat)
 *   - OPENROUTER_IMAGE_MODEL (optional, defaults to google/gemini-2.5-flash-image-preview)
 *   - GOOGLE_GENAI_API_KEY (optional fallback; used only if OPENROUTER_API_KEY is missing)
 *   - GOOGLE_GENAI_IMAGE_MODEL (optional fallback model id)
 */

export type GeneratedImage = {
  dataUrl: string;
  mimeType: string;
  base64: string;
  seed: number | null;
};

type GenerateParams = {
  prompt: string;
  refs?: string[];
  n?: number;
  aspect?: "square" | "landscape" | "portrait";
};

async function fetchAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch reference image: ${resp.status}`);
  const ct = resp.headers.get("content-type") ?? "image/png";
  const buf = Buffer.from(await resp.arrayBuffer());
  return { base64: buf.toString("base64"), mimeType: ct.split(";")[0].trim() };
}

function buildAspectInstruction(aspect?: string): string {
  switch (aspect) {
    case "landscape":
      return " Use a landscape 16:9 aspect ratio.";
    case "portrait":
      return " Use a portrait 9:16 aspect ratio.";
    case "square":
      return " Use a square 1:1 aspect ratio.";
    default:
      return "";
  }
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Expected a base64 data URL from image model.");
  return { mimeType: match[1], base64: match[2] };
}

// ---------- OpenRouter path ----------

function imageDebugEnabled(): boolean {
  return process.env.PRISMA_IMAGE_DEBUG === "1";
}

function imageDebugLog(message: string, extra?: unknown) {
  if (!imageDebugEnabled()) return;
  if (extra !== undefined) {
    console.info(`[images.generate] ${message}`, extra);
  } else {
    console.info(`[images.generate] ${message}`);
  }
}

function isPublicOrigin(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!parsed.protocol.startsWith("http")) return false;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return false;
    if (host.endsWith(".local")) return false;
    return true;
  } catch {
    return false;
  }
}

async function generateOneViaOpenRouter(params: {
  prompt: string;
  refs?: string[];
  aspect?: string;
  apiKey: string;
  model: string;
}): Promise<GeneratedImage> {
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };
  const content: ContentPart[] = [
    { type: "text", text: `${params.prompt}${buildAspectInstruction(params.aspect)}` },
  ];
  if (params.refs && params.refs.length > 0) {
    for (const ref of params.refs) {
      if (ref.startsWith("data:")) {
        content.push({ type: "image_url", image_url: { url: ref } });
      } else {
        // Some models won't fetch arbitrary http(s) URLs; inline them as data URIs.
        const { base64, mimeType } = await fetchAsBase64(ref);
        content.push({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64}` },
        });
      }
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${params.apiKey}`,
    "X-Title": "Prisma Image Studio",
  };
  // OpenRouter rejects or silently drops non-public HTTP-Referer values on some
  // upstream providers. Only forward the header when we have a real origin.
  const refererCandidate = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL;
  if (isPublicOrigin(refererCandidate)) {
    headers["HTTP-Referer"] = refererCandidate as string;
  }

  imageDebugLog(`request start`, {
    model: params.model,
    refs: params.refs?.length ?? 0,
    aspect: params.aspect ?? null,
    promptPreview: params.prompt.slice(0, 160),
  });

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: params.model,
      modalities: ["image", "text"],
      messages: [{ role: "user", content }],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    imageDebugLog(`request failed with ${resp.status}`, text.slice(0, 500));
    throw new Error(`OpenRouter image API error ${resp.status}: ${text.slice(0, 500)}`);
  }

  type ORImage = {
    type?: string;
    image_url?: { url?: string };
    url?: string;
    b64_json?: string;
    mime_type?: string;
    mimeType?: string;
  };
  type ORContentPart = {
    type?: string;
    image_url?: { url?: string };
    url?: string;
    b64_json?: string;
    image?: { url?: string; b64_json?: string };
    mime_type?: string;
    mimeType?: string;
  };
  const json = (await resp.json()) as {
    choices?: Array<{
      message?: {
        images?: ORImage[];
        content?: string | ORContentPart[];
      };
    }>;
  };
  const msg = json.choices?.[0]?.message;

  const asGeneratedFromDataUrl = (dataUrl: string): GeneratedImage => {
    const { mimeType, base64 } = parseDataUrl(dataUrl);
    return { dataUrl, mimeType, base64, seed: null };
  };

  const asGeneratedFromHttpUrl = async (url: string): Promise<GeneratedImage> => {
    const { base64, mimeType } = await fetchAsBase64(url);
    return {
      dataUrl: `data:${mimeType};base64,${base64}`,
      mimeType,
      base64,
      seed: null,
    };
  };

  const asGeneratedFromBase64 = (
    base64: string,
    mimeHint?: string | null,
  ): GeneratedImage => {
    const mimeType = mimeHint && mimeHint.includes("/") ? mimeHint : "image/png";
    return {
      dataUrl: `data:${mimeType};base64,${base64}`,
      mimeType,
      base64,
      seed: null,
    };
  };

  // Preferred shape: message.images[] with image_url.url
  for (const img of msg?.images ?? []) {
    const url = img.image_url?.url ?? img.url;
    if (url && url.startsWith("data:")) {
      imageDebugLog(`got data URL from message.images`);
      return asGeneratedFromDataUrl(url);
    }
    if (typeof img.b64_json === "string" && img.b64_json.length > 0) {
      imageDebugLog(`got b64_json from message.images`);
      return asGeneratedFromBase64(img.b64_json, img.mime_type ?? img.mimeType ?? null);
    }
  }
  // Secondary: message.images[] with http(s) URL
  for (const img of msg?.images ?? []) {
    const url = img.image_url?.url ?? img.url;
    if (url && /^https?:\/\//i.test(url)) {
      imageDebugLog(`fetching http image from message.images`, url);
      return await asGeneratedFromHttpUrl(url);
    }
  }
  // Tertiary: some providers return image parts in message.content
  if (Array.isArray(msg?.content)) {
    for (const part of msg!.content as ORContentPart[]) {
      const url = part?.image_url?.url ?? part?.url ?? part?.image?.url;
      if (url && url.startsWith("data:")) {
        imageDebugLog(`got data URL from message.content part`);
        return asGeneratedFromDataUrl(url);
      }
      const base64 = part?.b64_json ?? part?.image?.b64_json;
      if (typeof base64 === "string" && base64.length > 0) {
        imageDebugLog(`got b64_json from message.content part`);
        return asGeneratedFromBase64(base64, part?.mime_type ?? part?.mimeType ?? null);
      }
    }
    for (const part of msg!.content as ORContentPart[]) {
      const url = part?.image_url?.url ?? part?.url ?? part?.image?.url;
      if (url && /^https?:\/\//i.test(url)) {
        imageDebugLog(`fetching http image from message.content part`, url);
        return await asGeneratedFromHttpUrl(url);
      }
    }
  }

  // Everything failed — log the response shape so we can see what burned the credit.
  try {
    console.warn(
      "[images.generate] unexpected OpenRouter shape",
      JSON.stringify(json).slice(0, 2000),
    );
  } catch {
    console.warn("[images.generate] unexpected OpenRouter shape (unserializable)");
  }
  throw new Error("OpenRouter returned no image in response.");
}

// ---------- Google GenAI fallback path ----------

async function generateOneViaGoogle(params: {
  prompt: string;
  refs?: string[];
  aspect?: string;
  apiKey: string;
  model: string;
}): Promise<GeneratedImage> {
  const parts: Array<Record<string, unknown>> = [];
  parts.push({ text: `${params.prompt}${buildAspectInstruction(params.aspect)}` });
  if (params.refs && params.refs.length > 0) {
    for (const ref of params.refs) {
      if (ref.startsWith("data:")) {
        const match = /^data:([^;]+);base64,(.+)$/.exec(ref);
        if (!match) throw new Error("Invalid data URL in refs.");
        parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
      } else {
        const { base64, mimeType } = await fetchAsBase64(ref);
        parts.push({ inline_data: { mime_type: mimeType, data: base64 } });
      }
    }
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini image API error ${resp.status}: ${text.slice(0, 500)}`);
  }
  type InlineData = { mimeType?: string; mime_type?: string; data?: string };
  const json = (await resp.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: InlineData; inline_data?: InlineData }> };
    }>;
  };
  const candidate = json.candidates?.[0];
  const outParts = candidate?.content?.parts ?? [];
  for (const p of outParts) {
    const inline: InlineData | undefined = p.inlineData ?? p.inline_data;
    const mime = inline?.mimeType ?? inline?.mime_type ?? "image/png";
    const data = inline?.data;
    if (data) {
      return { dataUrl: `data:${mime};base64,${data}`, mimeType: mime, base64: data, seed: null };
    }
  }
  throw new Error("Gemini returned no image parts.");
}

export async function generateImages({
  prompt,
  refs,
  n = 4,
  aspect,
}: GenerateParams): Promise<GeneratedImage[]> {
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const googleKey = process.env.GOOGLE_GENAI_API_KEY?.trim();

  let makeOne: () => Promise<GeneratedImage>;
  if (openRouterKey) {
    const model =
      process.env.OPENROUTER_IMAGE_MODEL?.trim() || "google/gemini-2.5-flash-image-preview";
    makeOne = () =>
      generateOneViaOpenRouter({ prompt, refs, aspect, apiKey: openRouterKey, model });
  } else if (googleKey) {
    const model =
      process.env.GOOGLE_GENAI_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image-preview";
    makeOne = () => generateOneViaGoogle({ prompt, refs, aspect, apiKey: googleKey, model });
  } else {
    throw new Error(
      "Image generation needs OPENROUTER_API_KEY (recommended) or GOOGLE_GENAI_API_KEY.",
    );
  }

  const count = Math.min(Math.max(n, 1), 4);
  const promises: Array<Promise<GeneratedImage>> = [];
  for (let i = 0; i < count; i += 1) promises.push(makeOne());
  const results = await Promise.allSettled(promises);
  const ok = results
    .filter((r): r is PromiseFulfilledResult<GeneratedImage> => r.status === "fulfilled")
    .map((r) => r.value);
  if (ok.length === 0) {
    const firstError = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    throw new Error(
      firstError?.reason instanceof Error ? firstError.reason.message : "Image generation failed.",
    );
  }
  return ok;
}
