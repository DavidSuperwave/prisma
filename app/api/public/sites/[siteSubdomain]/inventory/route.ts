import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ siteSubdomain: string }>;
};

const PUBLIC_FIELDS = [
  "stock_number",
  "year",
  "make",
  "model",
  "trim",
  "vin",
  "price",
  "mileage",
  "status",
  "website_url",
  "hero_image_url",
  "image_urls",
] as const;

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

function pickPublicVehicleFields(data: Record<string, unknown>) {
  const vehicle: Record<string, unknown> = Object.fromEntries(
    PUBLIC_FIELDS.map((field) => [field, data[field]]).filter(([, value]) => value !== undefined),
  );
  if (typeof vehicle.image_urls === "string") {
    vehicle.image_urls = vehicle.image_urls
      .split(/[\n,]+/)
      .map((url: string) => url.trim())
      .filter(Boolean);
  }
  if (!vehicle.hero_image_url && Array.isArray(vehicle.image_urls) && vehicle.image_urls.length > 0) {
    vehicle.hero_image_url = vehicle.image_urls[0];
  }
  return vehicle;
}

export async function GET(_request: Request, context: Context) {
  try {
    const { siteSubdomain } = await context.params;
    const normalizedSubdomain = decodeURIComponent(siteSubdomain).trim();
    if (!normalizedSubdomain) {
      return Response.json({ error: "siteSubdomain is required." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { data: site, error: siteError } = await supabase
      .from("landing_sites")
      .select("id, workspace_id, subdomain, publish_status, content")
      .eq("subdomain", normalizedSubdomain)
      .maybeSingle();
    if (siteError) throw new Error(siteError.message);
    if (!site) return Response.json({ error: "Site not found." }, { status: 404 });

    const content =
      site.content && typeof site.content === "object" && !Array.isArray(site.content)
        ? (site.content as Record<string, unknown>)
        : {};
    const inventoryLink =
      content.inventoryLink && typeof content.inventoryLink === "object" && !Array.isArray(content.inventoryLink)
        ? (content.inventoryLink as Record<string, unknown>)
        : {};
    const objectSlug =
      typeof inventoryLink.objectSlug === "string" && inventoryLink.objectSlug.trim().length > 0
        ? inventoryLink.objectSlug.trim()
        : "vehicles";
    const objectName =
      typeof inventoryLink.objectName === "string" && inventoryLink.objectName.trim().length > 0
        ? inventoryLink.objectName.trim()
        : "Vehicles";

    let { data: objectRow, error: objectError } = await supabase
      .from("workspace_objects")
      .select("id, slug, name")
      .eq("workspace_id", String(site.workspace_id))
      .eq("slug", objectSlug)
      .maybeSingle();
    if (objectError && objectError.message.includes("slug")) {
      const fallback = await supabase
        .from("workspace_objects")
        .select("id, name")
        .eq("workspace_id", String(site.workspace_id))
        .eq("name", objectName)
        .maybeSingle();
      objectRow = fallback.data as typeof objectRow;
      objectError = fallback.error;
    }
    if (objectError) throw new Error(objectError.message);
    if (!objectRow) {
      return Response.json(
        { error: `Inventory object not found for slug: ${objectSlug}` },
        { status: 404 },
      );
    }

    const { data: records, error: recordsError } = await supabase
      .from("records")
      .select("id, data, updated_at")
      .eq("workspace_id", String(site.workspace_id))
      .eq("object_id", String(objectRow.id))
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (recordsError) throw new Error(recordsError.message);

    return Response.json({
      site: {
        id: String(site.id),
        subdomain: String(site.subdomain),
        publishStatus: String(site.publish_status),
      },
      inventory: {
        workspaceId: String(site.workspace_id),
        objectId: String(objectRow.id),
        objectSlug: String(objectRow.slug ?? objectSlug),
        objectName: String(objectRow.name ?? "Vehicles"),
        count: records?.length ?? 0,
        vehicles: (records ?? []).map((record) => ({
          id: String(record.id),
          updatedAt: String(record.updated_at),
          ...pickPublicVehicleFields((record.data as Record<string, unknown>) ?? {}),
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read inventory.";
    return Response.json({ error: message }, { status: 400 });
  }
}
