import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { generateUniqueObjectSlug } from "@/lib/objectSlug";

export type BootstrapDocumentsResult = {
  documentsObjectId: string | null;
  created: boolean;
};

const DOCUMENTS_OBJECT_NAME = "Documents";

const DOCUMENT_FIELDS: Array<{
  name: string;
  key: string;
  type: string;
  required?: boolean;
  options?: Record<string, unknown>;
  sortOrder: number;
}> = [
  { name: "Nombre del archivo", key: "document_name", type: "text", required: true, sortOrder: 0 },
  { name: "Empresa", key: "company_name", type: "text", sortOrder: 10 },
  { name: "Owner", key: "owner", type: "text", sortOrder: 20 },
  { name: "Vencimiento", key: "due_date", type: "date", sortOrder: 30 },
  {
    name: "Estado",
    key: "status",
    type: "status",
    options: { values: ["pending", "reviewed", "archived"] },
    sortOrder: 40,
  },
  { name: "Tipo", key: "kind", type: "text", sortOrder: 50 },
  { name: "MIME", key: "mime_type", type: "text", sortOrder: 60 },
];

/**
 * Ensures a workspace has a "Documents" meta-object with standard fields so the
 * Drive-style library is always available in the sidebar.
 */
export async function bootstrapDocuments(workspaceId: string): Promise<BootstrapDocumentsResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { documentsObjectId: null, created: false };
  }

  const { data: existing, error: existingError } = await supabase
    .from("workspace_objects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", DOCUMENTS_OBJECT_NAME)
    .maybeSingle();

  if (existingError) {
    return { documentsObjectId: null, created: false };
  }

  let objectId: string | null = existing?.id ? String(existing.id) : null;
  let created = false;

  if (!objectId) {
    const slug = await generateUniqueObjectSlug(workspaceId, DOCUMENTS_OBJECT_NAME);
    const insertPayload: Record<string, unknown> = {
      workspace_id: workspaceId,
      name: DOCUMENTS_OBJECT_NAME,
      singular_name: "Documento",
      plural_name: "Documentos",
      description: "Biblioteca de archivos del workspace.",
      icon: "folder",
      slug,
    };
    const attempt = await supabase
      .from("workspace_objects")
      .insert(insertPayload)
      .select("id")
      .single();
    let inserted = attempt.data;
    let insertError = attempt.error;
    if (insertError && insertError.message.includes("slug")) {
      delete insertPayload.slug;
      const retry = await supabase
        .from("workspace_objects")
        .insert(insertPayload)
        .select("id")
        .single();
      inserted = retry.data;
      insertError = retry.error;
    }

    if (insertError || !inserted) {
      return { documentsObjectId: null, created: false };
    }
    objectId = String(inserted.id);
    created = true;
  }

  for (const field of DOCUMENT_FIELDS) {
    await supabase
      .from("workspace_fields")
      .upsert(
        {
          workspace_id: workspaceId,
          object_id: objectId,
          name: field.name,
          key: field.key,
          type: field.type,
          required: Boolean(field.required),
          options: field.options ?? {},
          sort_order: field.sortOrder,
        },
        { onConflict: "object_id,key" },
      );
  }

  return { documentsObjectId: objectId, created };
}
