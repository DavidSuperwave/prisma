import { getCurrentAppUser } from "@/lib/auth";
import { getAssetBucketName, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getWorkspaceMembershipForSlug } from "@/lib/workspaceStore";
import { sanitizeFileName } from "@/app/api/workspaces/[workspaceSlug]/documents/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const user = await getCurrentAppUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const membership = await getWorkspaceMembershipForSlug(user.id, workspaceSlug, user.isPlatformAdmin);
    if (!membership) {
      return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
    }
    if (membership.role === "viewer") {
      return Response.json({ error: "Viewers cannot upload field images." }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const objectId = String(formData.get("objectId") ?? "").trim();
    const fieldId = String(formData.get("fieldId") ?? "").trim();

    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "A non-empty image file is required." }, { status: 400 });
    }
    if (!file.type.toLowerCase().startsWith("image/")) {
      return Response.json({ error: "Only image uploads are supported for image fields." }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return Response.json({ error: "Image is too large. Max size is 8 MB." }, { status: 413 });
    }
    if (!objectId || !fieldId) {
      return Response.json({ error: "objectId and fieldId are required." }, { status: 400 });
    }

    const supabase = requireSupabaseAdmin();
    const { data: fieldRow, error: fieldError } = await supabase
      .from("workspace_fields")
      .select("id, type")
      .eq("workspace_id", membership.workspaceId)
      .eq("object_id", objectId)
      .eq("id", fieldId)
      .maybeSingle();
    if (fieldError) throw new Error(fieldError.message);
    if (!fieldRow || String(fieldRow.type) !== "image") {
      return Response.json({ error: "Image field not found in this workspace." }, { status: 404 });
    }

    const storagePath = `workspace-field-uploads/${membership.workspaceId}/${objectId}/${fieldId}/${Date.now()}-${sanitizeFileName(file.name)}`;
    const bucketName = getAssetBucketName();
    const { error: uploadError } = await supabase.storage.from(bucketName).upload(
      storagePath,
      Buffer.from(await file.arrayBuffer()),
      {
        contentType: file.type,
        upsert: false,
      },
    );
    if (uploadError) throw new Error(uploadError.message);

    const { data: publicAsset } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
    return Response.json({
      path: storagePath,
      publicUrl: publicAsset.publicUrl,
      contentType: file.type,
      sizeBytes: file.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload image.";
    return Response.json({ error: message }, { status: 400 });
  }
}
