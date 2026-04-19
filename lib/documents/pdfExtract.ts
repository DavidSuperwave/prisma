/**
 * Shared PDF text extraction.
 *
 * Strategy:
 *   1. Use `pdf-parse` v2 (`PDFParse` class + `.getText()`) to pull the native
 *      text layer. Works for 95% of text-based PDFs (brochures, invoices,
 *      digital promos).
 *   2. If the per-page character average falls below `OCR_CHARS_PER_PAGE_FLOOR`
 *      the PDF is likely scanned (image-only). Fall back to a vision LLM OCR
 *      pass: render each page to PNG via `PDFParse.getScreenshot()` (which
 *      uses pdfjs-dist's built-in canvas factory, so we do NOT depend on
 *      `@napi-rs/canvas`). Send the PNG to the same Hermes/OpenRouter
 *      endpoint the chat already uses.
 *   3. Return the combined text plus a flag so callers can tell the user OCR
 *      was used.
 *
 * Error handling: the helper reports specific failures on the
 * `ocrError` / parser-level error path rather than throwing, so the UI and
 * agent can surface something actionable instead of a silent empty result.
 */

const HARD_MAX_CHARS = 120_000;
const DEFAULT_MAX_CHARS = 24_000;
/**
 * If the per-page character density falls below this floor we assume the PDF
 * is a scanned image and try OCR. Calibrated empirically — a one-pager with a
 * short heading is ~40 chars, so anything below this is almost certainly not
 * a real text layer.
 */
const OCR_CHARS_PER_PAGE_FLOOR = 25;
/**
 * Absolute floor: if the document has fewer than this many total characters
 * we will try OCR regardless of page count, to handle scanned single-pagers.
 */
const OCR_TOTAL_CHARS_FLOOR = 60;
const OCR_MAX_PAGES = 20;
const OCR_RENDER_SCALE = 2;

export type PdfExtractOptions = {
  maxChars?: number;
  /**
   * When true skip OCR fallback even if the text layer looks empty. Useful
   * when the caller only wants a cheap probe.
   */
  disableOcr?: boolean;
};

export type PdfExtractResult = {
  text: string;
  pageCount: number;
  textLength: number;
  truncated: boolean;
  ocrUsed: boolean;
  ocrError?: string;
  parseError?: string;
};

function clampChars(requested: number | undefined): number {
  const base = typeof requested === "number" ? requested : DEFAULT_MAX_CHARS;
  return Math.max(500, Math.min(base, HARD_MAX_CHARS));
}

type PdfParseTextResult = {
  text: string;
  total: number;
  pages?: Array<{ text: string; num: number }>;
};

type PdfParseScreenshotResult = {
  total: number;
  pages?: Array<{
    dataUrl?: string;
    data?: Uint8Array;
    pageNumber: number;
    width: number;
    height: number;
  }>;
};

type PdfParseClass = (new (options: {
  data: Uint8Array | Buffer;
  verbosity?: number;
}) => {
  getText(params?: unknown): Promise<PdfParseTextResult>;
  getScreenshot(params?: {
    scale?: number;
    imageBuffer?: boolean;
    imageDataUrl?: boolean;
    partial?: number[];
    first?: number;
    last?: number;
  }): Promise<PdfParseScreenshotResult>;
  destroy(): Promise<void>;
}) & {
  setWorker?: (workerSrc?: string) => string;
};

/**
 * pdfjs-dist in Node/Next.js tries to spawn a fake worker by doing
 *   await import(GlobalWorkerOptions.workerSrc)
 * The default workerSrc is the relative path `"./pdf.worker.mjs"`, which does
 * NOT exist inside the Turbopack / Next.js server chunks directory at
 * runtime. Result:
 *   "Setting up fake worker failed: Cannot find module '.../pdf.worker.mjs'"
 *
 * The fix is to set `workerSrc` to the absolute filesystem path (wrapped as a
 * `file://` URL because ES-module `import()` requires a URL). We resolve the
 * path once at module load and cache it.
 */
let resolvedWorkerSrc: string | null = null;

async function resolveWorkerSrc(): Promise<string | null> {
  if (resolvedWorkerSrc) return resolvedWorkerSrc;
  try {
    const { createRequire } = await import("node:module");
    const { pathToFileURL } = await import("node:url");
    const req = createRequire(import.meta.url);
    // Try the paths shipped by pdf-parse@2 first (it bundles its own worker
    // copy under dist/worker/pdf.worker.mjs), then fall back to pdfjs-dist.
    const candidates = [
      "pdf-parse/dist/worker/pdf.worker.mjs",
      "pdfjs-dist/legacy/build/pdf.worker.mjs",
      "pdfjs-dist/build/pdf.worker.mjs",
    ];
    for (const candidate of candidates) {
      try {
        const absolute = req.resolve(candidate);
        resolvedWorkerSrc = pathToFileURL(absolute).href;
        return resolvedWorkerSrc;
      } catch {
        // try next candidate
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function disablePdfWorker(PDFParseCtor: PdfParseClass): Promise<void> {
  const workerUrl = await resolveWorkerSrc();
  if (!workerUrl) return;
  try {
    PDFParseCtor.setWorker?.(workerUrl);
  } catch {
    // fall through: also set GlobalWorkerOptions directly below
  }
  try {
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
      GlobalWorkerOptions?: { workerSrc?: string };
    };
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    }
  } catch {
    // pdfjs-dist is a transitive dep of pdf-parse; if it somehow isn't
    // resolvable the pdf-parse import below will fail with a clearer error.
  }
}

let pdfParseCached: PdfParseClass | null = null;

async function loadPdfParse(): Promise<PdfParseClass | null> {
  if (pdfParseCached) return pdfParseCached;
  try {
    const mod = (await import("pdf-parse")) as unknown as { PDFParse?: PdfParseClass } & {
      default?: { PDFParse?: PdfParseClass };
    };
    const ctor = mod.PDFParse ?? mod.default?.PDFParse ?? null;
    if (ctor) {
      await disablePdfWorker(ctor);
      pdfParseCached = ctor;
    }
    return ctor;
  } catch {
    return null;
  }
}

type NativeParseOutcome = {
  text: string;
  pageCount: number;
  error?: string;
  instance: InstanceType<PdfParseClass> | null;
};

async function runPdfParse(buffer: Buffer): Promise<NativeParseOutcome> {
  const PDFParse = await loadPdfParse();
  if (!PDFParse) {
    return {
      text: "",
      pageCount: 0,
      error: "pdf-parse module unavailable (install `pdf-parse`).",
      instance: null,
    };
  }

  const instance = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await instance.getText();
    return {
      text: (result.text ?? "").trim(),
      pageCount: result.total ?? result.pages?.length ?? 0,
      instance,
    };
  } catch (err) {
    const message =
      err instanceof Error && err.message
        ? err.message
        : "Native PDF text extraction failed.";
    return {
      text: "",
      pageCount: 0,
      error: message,
      instance,
    };
  }
}

type VisionConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
  provider: "hermes" | "openrouter";
};

function resolveVisionConfig(): VisionConfig | null {
  const hermesBase = process.env.HERMES_API_BASE_URL?.trim();
  const hermesKey = process.env.HERMES_API_KEY?.trim();
  if (hermesBase && hermesKey) {
    return {
      endpoint: `${hermesBase.replace(/\/$/, "")}/v1/chat/completions`,
      apiKey: hermesKey,
      model: process.env.HERMES_VISION_MODEL?.trim() || process.env.HERMES_MODEL?.trim() || "gpt-4o-mini",
      provider: "hermes",
    };
  }
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openrouterKey) {
    return {
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: openrouterKey,
      model: process.env.OPENROUTER_VISION_MODEL?.trim() || "openai/gpt-4o-mini",
      provider: "openrouter",
    };
  }
  return null;
}

/**
 * Render one PDF page to a PNG data URL. Primary path uses pdf-parse's
 * built-in screenshot helper (uses pdfjs-dist's embedded canvas factory, so no
 * external canvas dependency is required). If that fails for any reason we
 * fall back to a direct `@napi-rs/canvas` + `pdfjs-dist` render; if that also
 * fails we return a specific error string so the caller can surface it.
 */
async function rasterizePage(
  instance: InstanceType<PdfParseClass> | null,
  buffer: Buffer,
  pageIndex: number,
): Promise<{ dataUrl: string | null; error?: string }> {
  let screenshotError: string | undefined;
  // Primary: pdf-parse built-in screenshot (no extra deps required).
  if (instance) {
    try {
      const shot = await instance.getScreenshot({
        scale: OCR_RENDER_SCALE,
        imageDataUrl: true,
        partial: [pageIndex + 1],
      });
      const page = shot.pages?.find((entry) => entry.pageNumber === pageIndex + 1);
      if (page?.dataUrl && page.dataUrl.length > 100) {
        return { dataUrl: page.dataUrl };
      }
      screenshotError = "getScreenshot returned no page data.";
    } catch (err) {
      screenshotError = err instanceof Error ? err.message : String(err);
    }
  }

  // Fallback: direct pdfjs-dist + @napi-rs/canvas if the dev has it installed.
  try {
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
      getDocument: (args: { data: Uint8Array; disableWorker?: boolean; isEvalSupported?: boolean }) => {
        promise: Promise<{
          numPages: number;
          getPage: (n: number) => Promise<{
            getViewport: (args: { scale: number }) => { width: number; height: number };
            render: (args: { canvasContext: unknown; viewport: unknown }) => { promise: Promise<void> };
          }>;
        }>;
      };
    };
    type CanvasModule = {
      createCanvas: (
        width: number,
        height: number,
      ) => {
        getContext: (kind: "2d") => unknown;
        toBuffer: (mime: "image/png") => Buffer;
      };
    };
    let canvasMod: CanvasModule | null = null;
    try {
      canvasMod = (await import("@napi-rs/canvas")) as unknown as CanvasModule;
    } catch {
      return {
        dataUrl: null,
        error: screenshotError
          ? `Rasterización no disponible: pdf-parse.getScreenshot falló (${screenshotError}) y @napi-rs/canvas no está instalado.`
          : "Rasterización no disponible (`pdf-parse.getScreenshot()` falló y `@napi-rs/canvas` no está instalado).",
      };
    }
    if (!canvasMod) {
      return { dataUrl: null, error: "No canvas backend available." };
    }

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      isEvalSupported: false,
    }).promise;
    if (pageIndex + 1 > doc.numPages) return { dataUrl: null };
    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
    const canvas = canvasMod.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const png = canvas.toBuffer("image/png");
    return { dataUrl: `data:image/png;base64,${png.toString("base64")}` };
  } catch (err) {
    return {
      dataUrl: null,
      error: err instanceof Error ? err.message : "PDF page rasterization failed.",
    };
  }
}

async function ocrPageWithVision(
  config: VisionConfig,
  dataUrl: string,
  pageLabel: string,
): Promise<string> {
  const body = {
    model: config.model,
    max_tokens: 2000,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You are an OCR engine. Transcribe ALL visible text from the image verbatim, preserving line breaks and rough layout. Do not summarize, explain, or add commentary. Output only the transcribed text.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Transcribe ${pageLabel} of the attached PDF scan.` },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  };

  const res = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`vision ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
      .join("\n");
  }
  return "";
}

async function runVisionOcr(
  instance: InstanceType<PdfParseClass> | null,
  buffer: Buffer,
  pageCount: number,
): Promise<{ text: string; used: boolean; error?: string }> {
  const config = resolveVisionConfig();
  if (!config) {
    return {
      text: "",
      used: false,
      error: "No vision endpoint configured (set HERMES_API_* or OPENROUTER_API_KEY).",
    };
  }
  const limit = Math.max(1, Math.min(pageCount || 1, OCR_MAX_PAGES));
  const parts: string[] = [];
  let firstRasterError: string | undefined;
  for (let i = 0; i < limit; i += 1) {
    const { dataUrl, error } = await rasterizePage(instance, buffer, i);
    if (!dataUrl) {
      if (i === 0) {
        return {
          text: "",
          used: false,
          error:
            error ??
            "PDF page rasterization unavailable (getScreenshot failed and no canvas fallback).",
        };
      }
      if (!firstRasterError) firstRasterError = error;
      break;
    }
    try {
      const pageText = await ocrPageWithVision(config, dataUrl, `page ${i + 1}`);
      const trimmed = pageText.trim();
      if (trimmed) {
        parts.push(`\n--- Page ${i + 1} ---\n${trimmed}`);
      }
    } catch (err) {
      if (parts.length === 0) {
        return {
          text: "",
          used: false,
          error: err instanceof Error ? err.message : "Vision OCR request failed.",
        };
      }
      break;
    }
  }
  return {
    text: parts.join("\n").trim(),
    used: parts.length > 0,
    error: parts.length === 0 ? firstRasterError : undefined,
  };
}

export async function extractPdfText(
  buffer: Buffer,
  opts: PdfExtractOptions = {},
): Promise<PdfExtractResult> {
  const maxChars = clampChars(opts.maxChars);

  const parsed = await runPdfParse(buffer);
  const nativeText = parsed.text;
  const pageCount = parsed.pageCount;
  const charsPerPage = pageCount > 0 ? nativeText.length / pageCount : nativeText.length;
  const looksScanned =
    pageCount > 0 &&
    charsPerPage < OCR_CHARS_PER_PAGE_FLOOR &&
    nativeText.length < OCR_TOTAL_CHARS_FLOOR;
  const needsOcr = nativeText.length === 0 || looksScanned;
  const instance = parsed.instance;

  try {
    if (!opts.disableOcr && needsOcr) {
      const ocr = await runVisionOcr(instance, buffer, pageCount);
      if (ocr.used && ocr.text.length > nativeText.length) {
        const full = ocr.text;
        const truncated = full.length > maxChars;
        return {
          text: truncated ? full.slice(0, maxChars) : full,
          pageCount,
          textLength: full.length,
          truncated,
          ocrUsed: true,
          parseError: parsed.error,
        };
      }
      // Fall through with native text, but surface the OCR error for debugging.
      const truncated = nativeText.length > maxChars;
      return {
        text: truncated ? nativeText.slice(0, maxChars) : nativeText,
        pageCount,
        textLength: nativeText.length,
        truncated,
        ocrUsed: false,
        ocrError: ocr.error,
        parseError: parsed.error,
      };
    }

    const truncated = nativeText.length > maxChars;
    return {
      text: truncated ? nativeText.slice(0, maxChars) : nativeText,
      pageCount,
      textLength: nativeText.length,
      truncated,
      ocrUsed: false,
      parseError: parsed.error,
    };
  } finally {
    if (instance) {
      try {
        await instance.destroy();
      } catch {
        // noop: best-effort cleanup
      }
    }
  }
}
