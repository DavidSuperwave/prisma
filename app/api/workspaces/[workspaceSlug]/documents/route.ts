import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin, getAssetBucketName } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");
    const sessionTitle = String(formData.get("sessionTitle") ?? "").trim();

    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "A non-empty file is required." }, { status: 400 });
    }

    const user = await getCurrentAppUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
    const allowedWorkspace = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);
    if (!allowedWorkspace) {
      return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
    }

    const supabase = requireSupabaseAdmin();
    const { data: workspaceRow, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("subdomain", workspaceSlug)
      .maybeSingle();

    if (workspaceError) {
      throw new Error(workspaceError.message);
    }

    if (!workspaceRow) {
      return Response.json({ error: "Workspace not found." }, { status: 404 });
    }

    const { data: documentsObject, error: objectError } = await supabase
      .from("workspace_objects")
      .select("id")
      .eq("workspace_id", workspaceRow.id)
      .eq("name", "Documents")
      .maybeSingle();

    if (objectError) {
      throw new Error(objectError.message);
    }

    if (!documentsObject) {
      return Response.json({ error: "Documents object not configured for this workspace." }, { status: 409 });
    }

    const safeFileName = `${Date.now()}-${sanitizeFileName(file.name)}`;
    const storagePath = `workspace-chat/${workspaceRow.id}/${safeFileName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const bucketName = getAssetBucketName();

    const { error: uploadError } = await supabase.storage.from(bucketName).upload(storagePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicAsset } = supabase.storage.from(bucketName).getPublicUrl(storagePath);

    const payload = {
      workspace_id: workspaceRow.id,
      object_id: documentsObject.id,
      data: {
        document_name: file.name,
        company_name: workspaceRow.name,
        owner: sessionTitle || "CEO chat upload",
        due_date: null,
        status: "pending",
        uploaded_via: "chat",
        public_url: publicAsset.publicUrl,
        storage_path: storagePath,
        mime_type: file.type || "application/octet-stream",
      },
    };

    const { data: recordRow, error: recordError } = await supabase
      .from("records")
      .insert(payload)
      .select("id, data")
      .single();

    if (recordError) {
      throw new Error(recordError.message);
    }

    const { error: activityError } = await supabase.from("agent_activity").insert({
      agent_id: "e1154eea-8490-48c2-99dc-451b5edc7752",
      workspace_id: workspaceRow.id,
      action: "document.uploaded_via_chat",
      details: {
        title: file.name,
        storage_path: storagePath,
        session_title: sessionTitle || "New chat",
        status: "pending",
      },
    });

    if (activityError) {
      throw new Error(activityError.message);
    }

    return Response.json({
      recordId: recordRow.id,
      documentName: file.name,
      publicUrl: publicAsset.publicUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload document.";
    return Response.json({ error: message }, { status: 400 });
  }
}
