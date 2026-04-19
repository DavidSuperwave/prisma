"use server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listDashboardCardsForWorkspace } from "@/lib/platformStore";
import { generateUniqueObjectSlug } from "@/lib/objectSlug";

type FieldDefinition = {
  name: string;
  key: string;
  type: string;
  required?: boolean;
  options?: Record<string, unknown>;
  defaultValue?: string | null;
  sortOrder?: number;
};

type ViewDefinition = {
  name: string;
  filters?: Record<string, unknown>;
  sortBy?: string | null;
  sortOrder?: "asc" | "desc";
  columns?: string[];
  groupByFieldId?: string | null;
};

type DashboardCardSeed = {
  cardType: "metric" | "table" | "queue" | "activity" | "status" | "chart";
  title: string;
  subtitle?: string;
  position: number;
  gridWidth: number;
  config: Record<string, unknown>;
};

export type WorkspaceSchemaFieldProposal = {
  name: string;
  key: string;
  type: string;
  required?: boolean;
  options?: Record<string, unknown>;
};

export type WorkspaceSchemaObjectProposal = {
  name: string;
  singularName?: string | null;
  pluralName?: string | null;
  description?: string | null;
  icon?: string | null;
  fields: WorkspaceSchemaFieldProposal[];
};

export type WorkspaceSchemaProposal = {
  proposalId: string;
  title: string;
  objects: WorkspaceSchemaObjectProposal[];
  sourcePrompt?: string | null;
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

async function saveDashboardCardsToLocalState(workspaceId: string, cards: DashboardCardSeed[]) {
  const { readFile, writeFile, mkdir } = await import("node:fs/promises");
  const filePath = `${process.cwd()}/.data/platform-state.json`;

  let state: Record<string, unknown> = {};
  try {
    state = JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    state = {};
  }

  const existingCards = Array.isArray(state.dashboardCards) ? (state.dashboardCards as Array<Record<string, unknown>>) : [];
  const nextCards = existingCards.filter((card) => card.workspaceId !== workspaceId);

  cards.forEach((card, index) => {
    nextCards.push({
      id: `dash_${workspaceId}_${index}_${Date.now()}`,
      workspaceId,
      cardType: card.cardType,
      title: card.title,
      subtitle: card.subtitle,
      config: card.config,
      position: card.position,
      gridWidth: card.gridWidth,
      isVisible: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  state.dashboardCards = nextCards;
  await mkdir(`${process.cwd()}/.data`, { recursive: true });
  await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
}

async function ensureObject(workspaceId: string, objectDef: { name: string; singularName: string; pluralName: string; description: string; icon: string }) {
  const supabase = requireSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("workspace_objects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", objectDef.name)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing?.id) {
    return String(existing.id);
  }

  const slug = await generateUniqueObjectSlug(workspaceId, objectDef.name);
  const payload: Record<string, unknown> = {
    workspace_id: workspaceId,
    name: objectDef.name,
    singular_name: objectDef.singularName,
    plural_name: objectDef.pluralName,
    description: objectDef.description,
    icon: objectDef.icon,
    slug,
  };
  let attempt = await supabase
    .from("workspace_objects")
    .insert(payload)
    .select("id")
    .single();

  if (attempt.error && attempt.error.message.includes("slug")) {
    delete payload.slug;
    attempt = await supabase
      .from("workspace_objects")
      .insert(payload)
      .select("id")
      .single();
  }

  if (attempt.error) {
    throw attempt.error;
  }

  return String(attempt.data.id);
}

async function ensureFields(workspaceId: string, objectId: string, fields: FieldDefinition[]) {
  const supabase = requireSupabaseAdmin();
  const payload = fields.map((field, index) => ({
    workspace_id: workspaceId,
    object_id: objectId,
    name: field.name,
    key: field.key,
    type: field.type,
    required: field.required ?? false,
    options: field.options ?? {},
    default_value: field.defaultValue ?? null,
    sort_order: field.sortOrder ?? index + 1,
  }));

  const { error } = await supabase.from("workspace_fields").upsert(payload, {
    onConflict: "object_id,key",
  });

  if (error) {
    throw error;
  }
}

async function resolveActivityAgentId(workspaceId: string) {
  const supabase = requireSupabaseAdmin();
  const { data } = await supabase
    .from("workspace_agents")
    .select("id")
    .eq("workspace_id", workspaceId)
    .in("type", ["copilot", "worker"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function ensureView(workspaceId: string, objectId: string, view: ViewDefinition) {
  const supabase = requireSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("workspace_views")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("object_id", objectId)
    .eq("name", view.name)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const payload = {
    workspace_id: workspaceId,
    object_id: objectId,
    name: view.name,
    filters: view.filters ?? { conditions: [] },
    sort_by: view.sortBy ?? null,
    sort_order: view.sortOrder ?? "asc",
    columns: view.columns ?? [],
    group_by_field_id: view.groupByFieldId ?? null,
  };

  if (existing?.id) {
    const { error } = await supabase.from("workspace_views").update(payload).eq("id", existing.id);
    if (error) {
      throw error;
    }
    return;
  }

  const { error } = await supabase.from("workspace_views").insert(payload);
  if (error) {
    throw error;
  }
}

async function ensureDashboardCards(workspaceId: string, cards: DashboardCardSeed[]) {
  const supabase = requireSupabaseAdmin();
  const existing = await listDashboardCardsForWorkspace(workspaceId);
  if (existing.length > 0) {
    return;
  }

  const payload = cards.map((card) => ({
    workspace_id: workspaceId,
    card_type: card.cardType,
    title: card.title,
    subtitle: card.subtitle ?? null,
    position: card.position,
    grid_width: card.gridWidth,
    is_visible: true,
    config: card.config,
  }));

  const { error } = await supabase.from("workspace_dashboard_cards").insert(payload);
  if (error) {
    throw error;
  }
}

export async function bootstrapWorkspaceCrm(workspaceId: string) {
  const contactsObjectId = await ensureObject(workspaceId, {
    name: "Contacts",
    singularName: "Contact",
    pluralName: "Contacts",
    description: "Personas clave del pipeline comercial.",
    icon: "users",
  });

  await ensureFields(workspaceId, contactsObjectId, [
    { name: "Full Name", key: "full_name", type: "text", required: true },
    { name: "Email", key: "email", type: "text" },
    { name: "Phone", key: "phone", type: "text" },
    { name: "Position", key: "position", type: "text" },
    { name: "Source", key: "source", type: "select", options: { values: ["manual", "import", "web_form", "whatsapp", "referral", "ad_campaign"] } },
    { name: "Status", key: "status", type: "status" },
    { name: "Owner", key: "owner", type: "text" },
    { name: "Last Contacted", key: "last_contacted", type: "date" },
    { name: "Lead Score", key: "lead_score", type: "number" },
    { name: "Notes", key: "notes", type: "text" },
  ]);

  const companiesObjectId = await ensureObject(workspaceId, {
    name: "Companies",
    singularName: "Company",
    pluralName: "Companies",
    description: "Empresas y cuentas del workspace.",
    icon: "building-2",
  });

  await ensureFields(workspaceId, companiesObjectId, [
    { name: "Name", key: "name", type: "text", required: true },
    { name: "Industry", key: "industry", type: "text" },
    { name: "Website", key: "website", type: "text" },
    { name: "Size", key: "size", type: "select", options: { values: ["1-10", "11-50", "51-200", "201-500", "500+"] } },
    { name: "Annual Revenue", key: "annual_revenue", type: "currency" },
    { name: "Status", key: "status", type: "status" },
    { name: "Owner", key: "owner", type: "text" },
    { name: "Address", key: "address", type: "text" },
  ]);

  const dealsObjectId = await ensureObject(workspaceId, {
    name: "Deals",
    singularName: "Deal",
    pluralName: "Deals",
    description: "Oportunidades y pipeline comercial.",
    icon: "wallet-cards",
  });

  await ensureFields(workspaceId, dealsObjectId, [
    { name: "Title", key: "title", type: "text", required: true },
    { name: "Amount", key: "amount", type: "currency" },
    { name: "Stage", key: "stage", type: "status" },
    { name: "Company", key: "company", type: "relation" },
    { name: "Contact", key: "contact", type: "relation" },
    { name: "Expected Close", key: "expected_close", type: "date" },
    { name: "Owner", key: "owner", type: "text" },
    { name: "Probability", key: "probability", type: "number" },
    { name: "Source", key: "source", type: "text" },
    { name: "Notes", key: "notes", type: "text" },
  ]);

  await ensureView(workspaceId, contactsObjectId, {
    name: "New Leads",
    filters: { conditions: [{ field: "status", operator: "eq", value: "new" }] },
    sortBy: "updated_at",
    sortOrder: "desc",
    columns: ["full_name", "email", "source", "status", "owner"],
  });

  await ensureView(workspaceId, dealsObjectId, {
    name: "Pipeline",
    filters: { conditions: [] },
    sortBy: "expected_close",
    sortOrder: "asc",
    columns: ["title", "amount", "stage", "owner", "expected_close"],
  });

  await ensureDashboardCards(workspaceId, [
    {
      cardType: "metric",
      title: "Contactos",
      subtitle: "Total del CRM",
      position: 0,
      gridWidth: 1,
      config: { metricKey: "Registros" },
    },
    {
      cardType: "queue",
      title: "Seguimientos críticos",
      subtitle: "Contactos y deals por revisar",
      position: 1,
      gridWidth: 1,
      config: { limit: 5 },
    },
    {
      cardType: "activity",
      title: "Actividad comercial",
      subtitle: "Últimas acciones del equipo y agentes",
      position: 2,
      gridWidth: 2,
      config: { limit: 8 },
    },
    {
      cardType: "status",
      title: "Salud del pipeline",
      subtitle: "Capacidad operativa actual",
      position: 3,
      gridWidth: 1,
      config: {},
    },
  ]);

  return {
    createdObjects: ["Contacts", "Companies", "Deals"],
    createdViews: ["New Leads", "Pipeline"],
  };
}

export async function applyWorkspaceSchemaProposal(
  workspaceId: string,
  proposal: WorkspaceSchemaProposal,
  actorUserId?: string | null,
) {
  const createdObjects: Array<{ objectName: string; objectId: string; fieldCount: number; fieldKeys: string[] }> = [];

  for (const objectProposal of proposal.objects) {
    const objectName = objectProposal.name.trim();
    if (!objectName) {
      continue;
    }
    const objectId = await ensureObject(workspaceId, {
      name: objectName,
      singularName: objectProposal.singularName?.trim() || objectName,
      pluralName: objectProposal.pluralName?.trim() || `${objectName}s`,
      description: objectProposal.description?.trim() || "Created from CEO schema proposal.",
      icon: objectProposal.icon?.trim() || "database",
    });

    const normalizedFields: FieldDefinition[] = objectProposal.fields.map((field, index) => ({
      name: field.name,
      key: field.key,
      type: field.type,
      required: field.required ?? false,
      options: field.options ?? {},
      sortOrder: index + 1,
    }));

    if (normalizedFields.length > 0) {
      await ensureFields(workspaceId, objectId, normalizedFields);
    }

    createdObjects.push({
      objectName,
      objectId,
      fieldCount: normalizedFields.length,
      fieldKeys: normalizedFields.map((field) => field.key),
    });
  }

  const supabase = requireSupabaseAdmin();
  const activityAgentId = await resolveActivityAgentId(workspaceId);
  if (activityAgentId) {
    await supabase.from("agent_activity").insert({
      workspace_id: workspaceId,
      agent_id: activityAgentId,
      action: "schema.applied",
      details: {
        proposal_id: proposal.proposalId,
        title: proposal.title,
        objects: createdObjects,
        source_prompt: proposal.sourcePrompt ?? null,
        created_by: actorUserId ?? null,
      },
    });
  }

  return {
    proposalId: proposal.proposalId,
    title: proposal.title,
    createdObjects,
  };
}

export async function createWorkspaceDashboardPreset(workspaceId: string, preset: "operations" | "sales" | "crm" | "custom") {
  const cardsByPreset: Record<string, DashboardCardSeed[]> = {
    operations: [
      { cardType: "metric", title: "Pendientes", subtitle: "Cola operativa", position: 0, gridWidth: 1, config: { metricKey: "Pendientes" } },
      { cardType: "metric", title: "Agentes activos", subtitle: "Disponibles ahora", position: 1, gridWidth: 1, config: { metricKey: "Agentes activos" } },
      { cardType: "queue", title: "Prioridades", subtitle: "Lo que requiere atención hoy", position: 2, gridWidth: 1, config: { limit: 5 } },
      { cardType: "activity", title: "Actividad reciente", subtitle: "Cambios recientes", position: 3, gridWidth: 2, config: { limit: 8 } },
    ],
    sales: [
      { cardType: "metric", title: "Registros", subtitle: "Total del pipeline", position: 0, gridWidth: 1, config: { metricKey: "Registros" } },
      { cardType: "table", title: "Top deals", subtitle: "Oportunidades más valiosas", position: 1, gridWidth: 2, config: { rows: [] } },
      { cardType: "activity", title: "Actividad comercial", subtitle: "Últimos movimientos", position: 2, gridWidth: 1, config: { limit: 6 } },
    ],
    crm: [
      { cardType: "metric", title: "Contactos nuevos", subtitle: "Seguimiento inicial", position: 0, gridWidth: 1, config: { metricKey: "Registros" } },
      { cardType: "queue", title: "Stale leads", subtitle: "Contactos sin seguimiento", position: 1, gridWidth: 1, config: { limit: 4 } },
      { cardType: "activity", title: "Interacciones recientes", subtitle: "CRM + agentes", position: 2, gridWidth: 2, config: { limit: 8 } },
    ],
    custom: [
      { cardType: "metric", title: "Workspace", subtitle: "Comienza a personalizar", position: 0, gridWidth: 1, config: { value: "Nuevo" } },
    ],
  };
  const selectedCards = cardsByPreset[preset] ?? cardsByPreset.custom;

  try {
    const supabase = requireSupabaseAdmin();
    const { error: deleteError } = await supabase.from("workspace_dashboard_cards").delete().eq("workspace_id", workspaceId);
    if (deleteError) {
      throw deleteError;
    }

    await ensureDashboardCards(workspaceId, selectedCards);
    return;
  } catch {
    await saveDashboardCardsToLocalState(workspaceId, selectedCards);
  }
}
