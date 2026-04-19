/**
 * Image studio tools:
 *   images.search   -> web image search candidates (SerpAPI)
 *   images.generate -> text-to-image or image-to-image via Gemini nano-banana-pro
 *   images.save     -> persist a candidate to Supabase Storage, attach to record
 */

import { registerTool, type ToolContext } from "../registry";
import { generateImages } from "@/lib/images/generate";
import { searchImages } from "@/lib/images/search";
import { saveImage } from "@/lib/images/storage";
import { getCandidate, putGeneratedCandidate, putSearchCandidate } from "@/lib/images/candidateCache";

async function resolveWorkspaceId(ctx: ToolContext): Promise<string | null> {
  const mod = await import("@/lib/supabaseAdmin");
  const supabase = mod.getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("subdomain", ctx.workspaceSlug)
    .maybeSingle();
  return data ? String(data.id) : null;
}

registerTool({
  name: "images.search",
  description:
    "Search the web for real photos matching a query (e.g. 'Ford Bronco Sport 2025 press photo'). Returns candidate URLs the user can pick from; does NOT save anything by itself.",
  args: {
    query: { type: "string", required: true },
    count: { type: "number", description: "1-16, default 8" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const query = String(args.query ?? "").trim();
    if (!query) return { ok: false, error: "`query` is required.", status: 400 };
    const count = typeof args.count === "number" ? Math.min(Math.max(args.count, 1), 16) : 8;
    try {
      const results = await searchImages({ query, count });
      const candidates = results.map((row) => {
        const id = putSearchCandidate({ workspaceId, sourceUrl: row.url });
        return {
          id,
          url: row.url,
          thumb: row.thumb,
          source: row.source,
          sourceUrl: row.sourceUrl,
          title: row.title,
          width: row.width,
          height: row.height,
        };
      });
      return { ok: true, data: { query, candidates } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Search failed.", status: 500 };
    }
  },
});

registerTool({
  name: "images.generate",
  description:
    "Generate images with Gemini nano-banana-pro. Supports text-to-image and image-to-image when `refs` contains URLs or data: URIs. Returns candidates the user can pick from.",
  args: {
    prompt: { type: "string", required: true },
    refs: { type: "array", description: "Optional reference image URLs (HTTP(S) or data:). Enables img2img." },
    n: { type: "number", description: "Number of candidates (1-4, default 4)" },
    aspect: { type: "string", description: "square | landscape | portrait" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const prompt = String(args.prompt ?? "").trim();
    if (!prompt) return { ok: false, error: "`prompt` is required.", status: 400 };
    const refs = Array.isArray(args.refs)
      ? (args.refs as unknown[]).filter((r): r is string => typeof r === "string")
      : undefined;
    const n = typeof args.n === "number" ? Math.min(Math.max(args.n, 1), 4) : 4;
    const aspect = typeof args.aspect === "string" ? (args.aspect as "square" | "landscape" | "portrait") : undefined;
    try {
      const images = await generateImages({ prompt, refs, n, aspect });
      const candidates = images.map((img) => {
        const id = putGeneratedCandidate({ workspaceId, base64: img.base64, mimeType: img.mimeType });
        return {
          id,
          // Return a small data URL preview so UIs can render without another hop.
          previewDataUrl: img.dataUrl,
          mimeType: img.mimeType,
        };
      });
      return { ok: true, data: { prompt, mode: refs && refs.length > 0 ? "img2img" : "text2img", candidates } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Generation failed.", status: 500 };
    }
  },
});

registerTool({
  name: "images.save",
  description:
    "Persist a previously surfaced image candidate to Supabase Storage. Accepts either `candidateId` from images.search/generate, or a direct `url`. Optionally attaches to a record.",
  args: {
    candidateId: { type: "string", description: "ID from images.search/generate candidates[]" },
    url: { type: "string", description: "Direct URL if bypassing candidate cache" },
    recordId: { type: "string", description: "Attach to this record's data.attachments and set data.image" },
    caption: { type: "string" },
  },
  handler: async (args, ctx) => {
    const workspaceId = await resolveWorkspaceId(ctx);
    if (!workspaceId) return { ok: false, error: "Workspace not found.", status: 404 };
    const candidateId = typeof args.candidateId === "string" ? args.candidateId : null;
    const directUrl = typeof args.url === "string" ? args.url : null;
    if (!candidateId && !directUrl) {
      return { ok: false, error: "Provide `candidateId` or `url`.", status: 400 };
    }
    try {
      let saved;
      if (candidateId) {
        const entry = getCandidate(candidateId, workspaceId);
        if (!entry) return { ok: false, error: "Candidate expired or not found.", status: 404 };
        if (entry.sourceUrl) {
          saved = await saveImage(
            { kind: "url", url: entry.sourceUrl },
            {
              workspaceId,
              recordId: typeof args.recordId === "string" ? args.recordId : null,
              caption: typeof args.caption === "string" ? args.caption : null,
            },
          );
        } else {
          saved = await saveImage(
            { kind: "data", base64: entry.base64, mimeType: entry.mimeType },
            {
              workspaceId,
              recordId: typeof args.recordId === "string" ? args.recordId : null,
              caption: typeof args.caption === "string" ? args.caption : null,
            },
          );
        }
      } else {
        saved = await saveImage(
          { kind: "url", url: directUrl! },
          {
            workspaceId,
            recordId: typeof args.recordId === "string" ? args.recordId : null,
            caption: typeof args.caption === "string" ? args.caption : null,
          },
        );
      }
      return { ok: true, data: saved };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Save failed.", status: 500 };
    }
  },
});
