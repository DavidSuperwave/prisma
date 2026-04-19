import {
  isAccessError,
  isUuid,
  requireSupabaseAdmin,
  resolveDocumentsAccess,
} from "@/app/api/workspaces/[workspaceSlug]/documents/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string; folderId: string }>;
};

async function detectCycle(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  workspaceId: string,
  folderId: string,
  candidateParentId: string,
): Promise<boolean> {
  if (folderId === candidateParentId) return true;
  let cursor: string | null = candidateParentId;
  const visited = new Set<string>();
  while (cursor !== null) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    const result: { data: { parent_id: string | null } | null } = await supabase
      .from("workspace_folders")
      .select("parent_id")
      .eq("id", cursor)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const parentId: string | null = result.data?.parent_id ?? null;
    if (parentId === folderId) return true;
    cursor = parentId;
  }
  return false;
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceSlug, folderId } = await context.params;
    if (!isUuid(folderId)) {
      return Response.json({ error: "Invalid folder id." }, { status: 400 });
    }

    const access = await resolveDocumentsAccess(workspaceSlug);
    if (isAccessError(access)) {
      return Response.json({ error: access.error }, { status: access.status });
    }
    if (access.role === "viewer") {
      return Response.json({ error: "Viewers cannot edit folders." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      parent_id?: unknown;
      parentId?: unknown;
    };

    const supabase = requireSupabaseAdmin();
    const { data: folder } = await supabase
      .from("workspace_folders")
      .select("id, parent_id, name")
      .eq("id", folderId)
      .eq("workspace_id", access.workspace.id)
      .maybeSingle();
    if (!folder) {
      return Response.json({ error: "Folder not found." }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (!trimmed || trimmed.length > 120) {
        return Response.json({ error: "Folder name must be 1-120 characters." }, { status: 400 });
      }
      updates.name = trimmed;
    }

    if ("parent_id" in body || "parentId" in body) {
      const raw = body.parent_id ?? body.parentId;
      const nextParent = raw == null || raw === "" ? null : isUuid(raw) ? raw : null;
      if (nextParent) {
        const { data: parentRow } = await supabase
          .from("workspace_folders")
          .select("id")
          .eq("id", nextParent)
          .eq("workspace_id", access.workspace.id)
          .maybeSingle();
        if (!parentRow) {
          return Response.json({ error: "Parent folder not found." }, { status: 404 });
        }
        const cycle = await detectCycle(supabase, access.workspace.id, folderId, nextParent);
        if (cycle) {
          return Response.json({ error: "Cannot move a folder inside itself." }, { status: 400 });
        }
      }
      updates.parent_id = nextParent;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No changes provided." }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("workspace_folders")
      .update(updates)
      .eq("id", folderId)
      .eq("workspace_id", access.workspace.id)
      .select("id, name, parent_id, created_at, updated_at")
      .single();

    if (updateError) {
      if (updateError.message.includes("idx_workspace_folders_unique_sibling")) {
        return Response.json({ error: "A folder with that name already exists here." }, { status: 409 });
      }
      throw new Error(updateError.message);
    }

    return Response.json({
      folder: {
        id: String(updated.id),
        name: String(updated.name),
        parentId: updated.parent_id ? String(updated.parent_id) : null,
        createdAt: String(updated.created_at),
        updatedAt: String(updated.updated_at),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update folder.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { workspaceSlug, folderId } = await context.params;
    if (!isUuid(folderId)) {
      return Response.json({ error: "Invalid folder id." }, { status: 400 });
    }
    const access = await resolveDocumentsAccess(workspaceSlug);
    if (isAccessError(access)) {
      return Response.json({ error: access.error }, { status: access.status });
    }
    if (access.role === "viewer") {
      return Response.json({ error: "Viewers cannot delete folders." }, { status: 403 });
    }

    const url = new URL(request.url);
    const cascade = url.searchParams.get("cascade") === "true";

    const supabase = requireSupabaseAdmin();

    const { data: childFolders } = await supabase
      .from("workspace_folders")
      .select("id")
      .eq("workspace_id", access.workspace.id)
      .eq("parent_id", folderId);

    const { data: childFiles } = await supabase
      .from("records")
      .select("id")
      .eq("workspace_id", access.workspace.id)
      .eq("object_id", access.documentsObjectId)
      .eq("folder_id", folderId)
      .is("deleted_at", null);

    const hasChildren = (childFolders?.length ?? 0) > 0 || (childFiles?.length ?? 0) > 0;

    if (hasChildren && !cascade) {
      return Response.json(
        { error: "Folder is not empty.", requiresCascade: true },
        { status: 409 },
      );
    }

    if (cascade && (childFiles?.length ?? 0) > 0) {
      // Move files to root rather than cascade-deleting records/blobs.
      await supabase
        .from("records")
        .update({ folder_id: null })
        .eq("workspace_id", access.workspace.id)
        .eq("object_id", access.documentsObjectId)
        .eq("folder_id", folderId);
    }

    const { error: deleteError } = await supabase
      .from("workspace_folders")
      .delete()
      .eq("id", folderId)
      .eq("workspace_id", access.workspace.id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete folder.";
    return Response.json({ error: message }, { status: 400 });
  }
}
