/**
 * Hermes-native image generation.
 *
 * Prisma treats Hermes as the only runtime for user-visible image generation.
 * This helper calls Hermes image endpoints and normalizes diverse response
 * payloads into a stable `{ dataUrl, mimeType, base64 }` shape.
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

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Expected a base64 data URL from image model.");
  return { mimeType: match[1], base64: match[2] };
}

function toDataUrl(base64: string, mimeType: string) {
  return `data:${mimeType};base64,${base64}`;
}

function parseImageCandidates(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const direct = record.images;
  if (Array.isArray(direct)) return direct.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");

  const dataImages = (record.data as Record<string, unknown> | undefined)?.images;
  if (Array.isArray(dataImages)) {
    return dataImages.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
  }

  const output = record.output;
  if (Array.isArray(output)) {
    const out: Array<Record<string, unknown>> = [];
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown[] }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (part && typeof part === "object") out.push(part as Record<string, unknown>);
      }
    }
    return out;
  }

  if (Array.isArray(payload)) {
    return (payload as unknown[]).filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
  }

  return [];
}

async function normalizeImageCandidate(entry: Record<string, unknown>): Promise<GeneratedImage | null> {
  const dataUrlRaw =
    (typeof entry.data_url === "string" ? entry.data_url : null) ??
    (typeof entry.dataUrl === "string" ? entry.dataUrl : null) ??
    (typeof entry.url === "string" && String(entry.url).startsWith("data:") ? String(entry.url) : null);
  if (dataUrlRaw) {
    const parsed = parseDataUrl(dataUrlRaw);
    return { dataUrl: dataUrlRaw, mimeType: parsed.mimeType, base64: parsed.base64, seed: null };
  }

  const base64Raw =
    (typeof entry.base64 === "string" ? entry.base64 : null) ??
    (typeof entry.b64_json === "string" ? entry.b64_json : null) ??
    (typeof (entry.image as { base64?: unknown } | undefined)?.base64 === "string"
      ? ((entry.image as { base64: string }).base64 as string)
      : null);
  if (base64Raw) {
    const mimeType =
      (typeof entry.mime_type === "string" ? entry.mime_type : null) ??
      (typeof entry.mimeType === "string" ? entry.mimeType : null) ??
      "image/png";
    return {
      dataUrl: toDataUrl(base64Raw, mimeType),
      mimeType,
      base64: base64Raw,
      seed: null,
    };
  }

  const urlRaw =
    (typeof entry.url === "string" ? entry.url : null) ??
    (typeof (entry.image_url as { url?: unknown } | undefined)?.url === "string"
      ? ((entry.image_url as { url: string }).url as string)
      : null);
  if (urlRaw && /^https?:\/\//i.test(urlRaw)) {
    const fetched = await fetchAsBase64(urlRaw);
    return {
      dataUrl: toDataUrl(fetched.base64, fetched.mimeType),
      mimeType: fetched.mimeType,
      base64: fetched.base64,
      seed: null,
    };
  }

  return null;
}

async function requestHermesImageGeneration(params: {
  baseUrl: string;
  apiKey: string;
  prompt: string;
  refs?: string[];
  n: number;
  aspect?: "square" | "landscape" | "portrait";
}): Promise<GeneratedImage[]> {
  const model = process.env.HERMES_IMAGE_MODEL?.trim() || process.env.HERMES_MODEL?.trim() || undefined;
  const preparedRefs: Array<{ dataUrl: string }> = [];
  for (const ref of params.refs ?? []) {
    if (ref.startsWith("data:")) {
      preparedRefs.push({ dataUrl: ref });
      continue;
    }
    const fetched = await fetchAsBase64(ref);
    preparedRefs.push({ dataUrl: toDataUrl(fetched.base64, fetched.mimeType) });
  }

  const basePayload: Record<string, unknown> = {
    prompt: params.prompt,
    n: params.n,
    aspect: params.aspect ?? "square",
    ...(preparedRefs.length > 0 ? { refs: preparedRefs.map((entry) => entry.dataUrl) } : {}),
    ...(model ? { model } : {}),
  };

  const endpoints = [
    `${params.baseUrl.replace(/\/$/, "")}/v1/image_generate`,
    `${params.baseUrl.replace(/\/$/, "")}/v1/tools/image_generate`,
    `${params.baseUrl.replace(/\/$/, "")}/image_generate`,
  ];

  let lastError = "Hermes image endpoint did not return usable output.";
  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(basePayload),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        lastError = `Hermes image API error ${resp.status}: ${text.slice(0, 300)}`;
        continue;
      }

      const payload = (await resp.json().catch(() => ({}))) as unknown;
      const candidates = parseImageCandidates(payload);
      const normalized = (
        await Promise.all(candidates.map((candidate) => normalizeImageCandidate(candidate)))
      ).filter((entry): entry is GeneratedImage => Boolean(entry));
      if (normalized.length > 0) {
        return normalized.slice(0, params.n);
      }
      lastError = "Hermes image response had no image candidates.";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Hermes image request failed.";
    }
  }

  throw new Error(lastError);
}

export async function generateImages({
  prompt,
  refs,
  n = 4,
  aspect,
}: GenerateParams): Promise<GeneratedImage[]> {
  const count = Math.min(Math.max(n, 1), 4);
  const baseUrl = process.env.HERMES_API_BASE_URL?.trim();
  const apiKey = process.env.HERMES_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new Error("Hermes runtime is required for image generation (HERMES_API_BASE_URL + HERMES_API_KEY).");
  }

  const generated = await requestHermesImageGeneration({
    baseUrl,
    apiKey,
    prompt,
    refs,
    n: count,
    aspect,
  });
  if (generated.length === 0) {
    throw new Error("Hermes image generation returned no images.");
  }
  return generated;
}
