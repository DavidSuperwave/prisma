import {
  isAccessError,
  isUuid,
  requireSupabaseAdmin,
  resolveDocumentsAccess,
} from "@/app/api/workspaces/[workspaceSlug]/documents/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

export type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
};

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const access = await resolveDocumentsAccess(workspaceSlug);
    if (isAccessError(access)) {
      return Response.json({ error: access.error }, { status: access.status });
    }

    const supabase = requireSupabaseAdmin();
    const { data: folders, error: foldersError } = await supabase
      .from("workspace_folders")
      .select("id, name, parent_id, created_at, updated_at")
      .eq("workspace_id", access.workspace.id)
      .order("name", { ascending: true });
    if (foldersError) throw new Error(foldersError.message);

    // Count files per folder (including root => null)
    const { data: counts, error: countsError } = await supabase
      .from("records")
      .select("folder_id, id")
      .eq("workspace_id", access.workspace.id)
      .eq("object_id", access.documentsObjectId)
      .is("deleted_at", null);
    if (countsError) throw new Error(countsError.message);

    const countByFolder = new Map<string | null, number>();
    for (const row of counts ?? []) {
      const key = row.folder_id ? String(row.folder_id) : null;
      countByFolder.set(key, (countByFolder.get(key) ?? 0) + 1);
    }

    const result: FolderNode[] = (folders ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      parentId: row.parent_id ? String(row.parent_id) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      fileCount: countByFolder.get(String(row.id)) ?? 0,
    }));

    return Response.json({
      folders: result,
      rootFileCount: countByFolder.get(null) ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list folders.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const access = await resolveDocumentsAccess(workspaceSlug);
    if (isAccessError(access)) {
      return Response.json({ error: access.error }, { status: access.status });
    }
    if (access.role === "viewer") {
      return Response.json({ error: "Viewers cannot create folders." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      parent_id?: unknown;
      parentId?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) {
      return Response.json({ error: "A folder name between 1 and 120 characters is required." }, { status: 400 });
    }

    const rawParent = body.parent_id ?? body.parentId ?? null;
    const parentId = rawParent == null || rawParent === "" ? null : isUuid(rawParent) ? rawParent : null;

    const supabase = requireSupabaseAdmin();

    if (parentId) {
      const { data: parent } = await supabase
        .from("workspace_folders")
        .select("id")
        .eq("id", parentId)
        .eq("workspace_id", access.workspace.id)
        .maybeSingle();
      if (!parent) {
        return Response.json({ error: "Parent folder not found in this workspace." }, { status: 404 });
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from("workspace_folders")
      .insert({
        workspace_id: access.workspace.id,
        parent_id: parentId,
        name,
        created_by: access.userId,
      })
      .select("id, name, parent_id, created_at, updated_at")
      .single();

    if (insertError) {
      if (insertError.message.includes("idx_workspace_folders_unique_sibling")) {
        return Response.json({ error: "A folder with that name already exists here." }, { status: 409 });
      }
      throw new Error(insertError.message);
    }

    return Response.json({
      folder: {
        id: String(inserted.id),
        name: String(inserted.name),
        parentId: inserted.parent_id ? String(inserted.parent_id) : null,
        createdAt: String(inserted.created_at),
        updatedAt: String(inserted.updated_at),
        fileCount: 0,
      } satisfies FolderNode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create folder.";
    return Response.json({ error: message }, { status: 400 });
  }
}
