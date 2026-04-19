/**
 * Web image search. Uses SerpAPI Google Images when SERPAPI_KEY is set.
 * Falls back to a clear error otherwise — we don't hit random APIs.
 */

export type ImageCandidate = {
  url: string;
  thumb: string | null;
  source: string | null;
  sourceUrl: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  license: string | null;
};

type SearchParams = {
  query: string;
  count?: number;
  safe?: boolean;
};

export async function searchImages({ query, count = 8, safe = true }: SearchParams): Promise<ImageCandidate[]> {
  const apiKey = process.env.SERPAPI_KEY?.trim();
  if (!apiKey) {
    throw new Error("SERPAPI_KEY is not set. Configure it to enable image search.");
  }
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_images");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(Math.min(Math.max(count, 1), 24)));
  url.searchParams.set("safe", safe ? "active" : "off");
  url.searchParams.set("api_key", apiKey);
  const resp = await fetch(url.toString(), { method: "GET" });
  if (!resp.ok) {
    throw new Error(`SerpAPI error ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
  }
  const json = (await resp.json()) as { images_results?: Array<Record<string, unknown>> };
  const rows = json.images_results ?? [];
  return rows.slice(0, count).map((row) => ({
    url: typeof row.original === "string" ? row.original : String(row.link ?? ""),
    thumb: typeof row.thumbnail === "string" ? row.thumbnail : null,
    source: typeof row.source === "string" ? row.source : null,
    sourceUrl: typeof row.link === "string" ? row.link : null,
    title: typeof row.title === "string" ? row.title : null,
    width: typeof row.original_width === "number" ? row.original_width : null,
    height: typeof row.original_height === "number" ? row.original_height : null,
    license: null,
  }));
}
