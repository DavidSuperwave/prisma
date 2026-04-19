import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { PrismaCrmKind } from "@/lib/workspaceStore";
import { generateUniqueObjectSlug } from "@/lib/objectSlug";

type CrmObjectSeed = {
  kind: PrismaCrmKind;
  name: string;
  singularName: string;
  pluralName: string;
  description: string;
  icon: string;
  matchNames: string[];
  fields: Array<{
    name: string;
    key: string;
    type: string;
    required?: boolean;
    options?: Record<string, unknown>;
    sortOrder: number;
  }>;
};

const CRM_OBJECT_SEEDS: CrmObjectSeed[] = [
  {
    kind: "crm_people",
    name: "People",
    singularName: "Persona",
    pluralName: "Personas",
    description: "Contactos y prospectos del CRM.",
    icon: "users",
    matchNames: ["lead", "people", "contact", "persona"],
    fields: [
      { name: "Nombre completo", key: "full_name", type: "text", required: true, sortOrder: 0 },
      { name: "Email", key: "email", type: "text", sortOrder: 10 },
      { name: "Teléfono", key: "phone", type: "text", sortOrder: 20 },
      {
        name: "Etapa",
        key: "stage",
        type: "status",
        required: true,
        options: { values: ["new", "qualified", "customer", "lost"] },
        sortOrder: 30,
      },
      { name: "Fuente", key: "source", type: "text", sortOrder: 40 },
      { name: "Owner", key: "owner_user_id", type: "text", sortOrder: 50 },
      { name: "Score", key: "score", type: "number", sortOrder: 60 },
      {
        name: "Empresa",
        key: "company_id",
        type: "relation",
        options: { relation_kind: "crm_companies" },
        sortOrder: 70,
      },
    ],
  },
  {
    kind: "crm_companies",
    name: "Companies",
    singularName: "Empresa",
    pluralName: "Empresas",
    description: "Cuentas y empresas del CRM.",
    icon: "building-2",
    matchNames: ["compan", "empresa", "account", "cuenta"],
    fields: [
      { name: "Nombre", key: "name", type: "text", required: true, sortOrder: 0 },
      { name: "Dominio", key: "domain", type: "text", sortOrder: 10 },
      { name: "Industria", key: "industry", type: "text", sortOrder: 20 },
      { name: "Tamaño", key: "size", type: "text", sortOrder: 30 },
      { name: "Owner", key: "owner_user_id", type: "text", sortOrder: 40 },
    ],
  },
  {
    kind: "crm_deals",
    name: "Deals",
    singularName: "Oportunidad",
    pluralName: "Oportunidades",
    description: "Oportunidades de venta del CRM.",
    icon: "trending-up",
    matchNames: ["deal", "opportun", "oportunidad", "venta"],
    fields: [
      { name: "Título", key: "title", type: "text", required: true, sortOrder: 0 },
      { name: "Monto", key: "amount", type: "currency", sortOrder: 10 },
      { name: "Moneda", key: "currency", type: "text", options: { default: "USD" }, sortOrder: 20 },
      {
        name: "Pipeline",
        key: "pipeline_id",
        type: "relation",
        options: { relation_kind: "pipeline" },
        sortOrder: 30,
      },
      {
        name: "Etapa",
        key: "stage_id",
        type: "relation",
        required: true,
        options: { relation_kind: "pipeline_stage" },
        sortOrder: 40,
      },
      { name: "Confianza (%)", key: "confidence", type: "number", sortOrder: 50 },
      { name: "Cierre estimado", key: "close_date", type: "date", sortOrder: 60 },
      {
        name: "Empresa",
        key: "company_id",
        type: "relation",
        options: { relation_kind: "crm_companies" },
        sortOrder: 70,
      },
      {
        name: "Contacto principal",
        key: "primary_contact_id",
        type: "relation",
        options: { relation_kind: "crm_people" },
        sortOrder: 80,
      },
      { name: "Owner", key: "owner_user_id", type: "text", sortOrder: 90 },
    ],
  },
];

const DEFAULT_PIPELINE = {
  name: "Ventas",
  description: "Pipeline comercial por defecto.",
  stages: [
    { name: "Nuevo", stageType: "active" as const, probability: 10, color: "#2563eb", sortOrder: 0 },
    { name: "Calificado", stageType: "active" as const, probability: 30, color: "#7c3aed", sortOrder: 10 },
    { name: "Propuesta", stageType: "active" as const, probability: 60, color: "#f59e0b", sortOrder: 20 },
    { name: "Ganado", stageType: "won" as const, probability: 100, color: "#16a34a", sortOrder: 30 },
    { name: "Perdido", stageType: "lost" as const, probability: 0, color: "#dc2626", sortOrder: 40 },
  ],
};

const DEFAULT_ACTIVITY_TYPES: Array<{ key: string; name: string; icon: string; isSystem: boolean }> = [
  { key: "note", name: "Nota", icon: "sticky-note", isSystem: true },
  { key: "inbound", name: "Mensaje entrante", icon: "inbox", isSystem: true },
  { key: "outbound_email", name: "Email enviado", icon: "mail", isSystem: true },
  { key: "outbound_sms", name: "SMS enviado", icon: "message-square", isSystem: true },
  { key: "outbound_whatsapp", name: "WhatsApp enviado", icon: "message-circle", isSystem: true },
  { key: "call_logged", name: "Llamada registrada", icon: "phone", isSystem: true },
  { key: "status_change", name: "Cambio de etapa", icon: "flag", isSystem: true },
  { key: "task_completed", name: "Tarea completada", icon: "check-square", isSystem: true },
  { key: "deal_created", name: "Oportunidad creada", icon: "trending-up", isSystem: true },
  { key: "deal_won", name: "Oportunidad ganada", icon: "trophy", isSystem: true },
  { key: "deal_lost", name: "Oportunidad perdida", icon: "flag-off", isSystem: true },
  { key: "demo_completed", name: "Demo completada", icon: "video", isSystem: false },
  { key: "contract_sent", name: "Contrato enviado", icon: "file-signature", isSystem: false },
];

export type BootstrapCrmResult = {
  peopleObjectId: string | null;
  companiesObjectId: string | null;
  dealsObjectId: string | null;
  defaultPipelineId: string | null;
  createdActivityTypes: number;
  created: boolean;
};

export async function bootstrapCrm(workspaceId: string): Promise<BootstrapCrmResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      peopleObjectId: null,
      companiesObjectId: null,
      dealsObjectId: null,
      defaultPipelineId: null,
      createdActivityTypes: 0,
      created: false,
    };
  }

  const result: BootstrapCrmResult = {
    peopleObjectId: null,
    companiesObjectId: null,
    dealsObjectId: null,
    defaultPipelineId: null,
    createdActivityTypes: 0,
    created: true,
  };

  for (const seed of CRM_OBJECT_SEEDS) {
    const existingByKind = await supabase
      .from("workspace_objects")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("kind", seed.kind)
      .maybeSingle();

    let objectId: string | null = existingByKind.data ? String(existingByKind.data.id) : null;

    if (!objectId) {
      const matchClauses = seed.matchNames.map((needle) => `name.ilike.%${needle}%`).join(",");
      const candidates = await supabase
        .from("workspace_objects")
        .select("id, kind, name, created_at")
        .eq("workspace_id", workspaceId)
        .or(matchClauses)
        .order("created_at", { ascending: true });

      const reusable = (candidates.data ?? []).find((row) => !row.kind);
      if (reusable) {
        objectId = String(reusable.id);
        await supabase
          .from("workspace_objects")
          .update({
            kind: seed.kind,
            is_system: true,
            singular_name: seed.singularName,
            plural_name: seed.pluralName,
            icon: seed.icon,
          })
          .eq("id", objectId);
      }
    }

    if (!objectId) {
      const slug = await generateUniqueObjectSlug(workspaceId, seed.name);
      const insertPayload: Record<string, unknown> = {
        workspace_id: workspaceId,
        name: seed.name,
        singular_name: seed.singularName,
        plural_name: seed.pluralName,
        description: seed.description,
        icon: seed.icon,
        kind: seed.kind,
        is_system: true,
        slug,
      };
      let attempt = await supabase
        .from("workspace_objects")
        .insert(insertPayload)
        .select("id")
        .single();
      if (attempt.error && attempt.error.message.includes("slug")) {
        delete insertPayload.slug;
        attempt = await supabase
          .from("workspace_objects")
          .insert(insertPayload)
          .select("id")
          .single();
      }
      const inserted = attempt.data;
      const insertError = attempt.error;

      if (insertError || !inserted) {
        continue;
      }
      objectId = String(inserted.id);
    }

    for (const field of seed.fields) {
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
            is_locked: true,
            sort_order: field.sortOrder,
          },
          { onConflict: "object_id,key" },
        );
    }

    if (seed.kind === "crm_people") result.peopleObjectId = objectId;
    if (seed.kind === "crm_companies") result.companiesObjectId = objectId;
    if (seed.kind === "crm_deals") result.dealsObjectId = objectId;
  }

  const existingDefaultPipeline = await supabase
    .from("workspace_pipelines")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .maybeSingle();

  if (existingDefaultPipeline.data) {
    result.defaultPipelineId = String(existingDefaultPipeline.data.id);
  } else {
    const { data: pipelineRow, error: pipelineError } = await supabase
      .from("workspace_pipelines")
      .insert({
        workspace_id: workspaceId,
        name: DEFAULT_PIPELINE.name,
        description: DEFAULT_PIPELINE.description,
        is_default: true,
        sort_order: 0,
      })
      .select("id")
      .single();

    if (!pipelineError && pipelineRow) {
      result.defaultPipelineId = String(pipelineRow.id);
      const stageRows = DEFAULT_PIPELINE.stages.map((stage) => ({
        workspace_id: workspaceId,
        pipeline_id: result.defaultPipelineId,
        name: stage.name,
        stage_type: stage.stageType,
        probability: stage.probability,
        color: stage.color,
        sort_order: stage.sortOrder,
      }));
      await supabase.from("workspace_pipeline_stages").insert(stageRows);
    }
  }

  for (const activityType of DEFAULT_ACTIVITY_TYPES) {
    const { error } = await supabase
      .from("workspace_activity_types")
      .upsert(
        {
          workspace_id: workspaceId,
          key: activityType.key,
          name: activityType.name,
          icon: activityType.icon,
          is_system: activityType.isSystem,
          custom_fields: [],
        },
        { onConflict: "workspace_id,key" },
      );
    if (!error) {
      result.createdActivityTypes += 1;
    }
  }

  return result;
}
