import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const DIACRITIC_RE = /[\u0300-\u036f]/g;

/**
 * Derive a URL/agent-safe slug candidate from a human name. This mirrors the
 * SQL `pg_temp.prisma_slugify_object_name` used by the backfill migration so
 * server-side creates produce slugs identical to the backfilled ones.
 */
export function slugifyObjectName(input: string | null | undefined): string {
  if (typeof input !== "string") return "";
  return input
    .normalize("NFD")
    .replace(DIACRITIC_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generate a slug that is unique within a workspace. If the preferred slug is
 * already taken, suffix with -2, -3, ... until a free value is found. Falls
 * back to an id-derived slug if the input has no alphanumerics (or is empty).
 *
 * The caller is responsible for retrying on a 23505 unique violation in the
 * (rare) race between the availability check and the insert.
 */
export async function generateUniqueObjectSlug(
  workspaceId: string,
  preferredName: string,
  fallbackObjectId?: string,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const base = slugifyObjectName(preferredName);
  const safeBase =
    base.length > 0
      ? base
      : fallbackObjectId
        ? `objeto-${fallbackObjectId.slice(0, 8)}`
        : `objeto-${Math.random().toString(36).slice(2, 10)}`;

  if (!supabase) {
    return safeBase;
  }

  const { data, error } = await supabase
    .from("workspace_objects")
    .select("slug")
    .eq("workspace_id", workspaceId);

  if (error) {
    // Column missing in old schema: treat as available.
    if (error.message.includes("slug")) return safeBase;
    return safeBase;
  }

  const taken = new Set(
    (data ?? [])
      .map((row) => (typeof (row as { slug?: unknown }).slug === "string" ? (row as { slug: string }).slug : ""))
      .filter((value) => value.length > 0),
  );

  if (!taken.has(safeBase)) return safeBase;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${safeBase}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Extremely unlikely fallback.
  return `${safeBase}-${Math.random().toString(36).slice(2, 6)}`;
}
