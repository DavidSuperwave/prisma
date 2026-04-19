import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Demo data generator for the CRM. Every record created by this helper has
 * `data.__demo = true` so the same rows can be cleared later with `clearDemoData`.
 *
 * Seeds ~12 people, 5 companies, and 8 deals with cross-links (people -> company,
 * deal -> primary contact + company). Stages use the canonical vocabulary
 * (`lead | qualified | opportunity | customer | unqualified`).
 */

export type DemoSeedResult = {
  companies: number;
  people: number;
  deals: number;
  activities: number;
  skippedExisting: boolean;
};

type CrmObjectLookup = {
  peopleObjectId: string | null;
  companiesObjectId: string | null;
  dealsObjectId: string | null;
};

async function loadObjectIds(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<CrmObjectLookup> {
  const { data } = await supabase
    .from("workspace_objects")
    .select("id, kind")
    .eq("workspace_id", workspaceId)
    .in("kind", ["crm_people", "crm_companies", "crm_deals"]);
  const out: CrmObjectLookup = { peopleObjectId: null, companiesObjectId: null, dealsObjectId: null };
  for (const row of (data ?? []) as Array<{ id: string; kind: string }>) {
    if (row.kind === "crm_people") out.peopleObjectId = String(row.id);
    else if (row.kind === "crm_companies") out.companiesObjectId = String(row.id);
    else if (row.kind === "crm_deals") out.dealsObjectId = String(row.id);
  }
  return out;
}

const COMPANIES = [
  { name: "Acme Manufacturing", domain: "acme.mx", industry: "Manufactura", size: "500+" },
  { name: "Helix Health", domain: "helixhealth.com", industry: "Salud", size: "200-500" },
  { name: "BrightBit Labs", domain: "brightbit.io", industry: "SaaS", size: "50-200" },
  { name: "Norte Logistics", domain: "nortelogistics.mx", industry: "Logística", size: "50-200" },
  { name: "Altura Ventures", domain: "altura.vc", industry: "Venture Capital", size: "10-50" },
];

const PEOPLE: Array<{
  full_name: string;
  email: string;
  phone: string;
  stage: string;
  source: string;
  score: number;
  companyDomain: string;
}> = [
  { full_name: "Ana Ruiz", email: "ana@acme.mx", phone: "+525511111111", stage: "qualified", source: "Web", score: 78, companyDomain: "acme.mx" },
  { full_name: "Carlos Mendoza", email: "carlos@acme.mx", phone: "+525522222222", stage: "opportunity", source: "Referido", score: 85, companyDomain: "acme.mx" },
  { full_name: "Diana Soto", email: "diana@helixhealth.com", phone: "+525533333333", stage: "lead", source: "LinkedIn", score: 42, companyDomain: "helixhealth.com" },
  { full_name: "Ernesto Paredes", email: "ernesto@brightbit.io", phone: "+525544444444", stage: "customer", source: "Inbound", score: 92, companyDomain: "brightbit.io" },
  { full_name: "Fernanda López", email: "fer@brightbit.io", phone: "+525555555555", stage: "qualified", source: "Evento", score: 68, companyDomain: "brightbit.io" },
  { full_name: "Gerardo Nava", email: "g.nava@nortelogistics.mx", phone: "+525566666666", stage: "opportunity", source: "Web", score: 74, companyDomain: "nortelogistics.mx" },
  { full_name: "Hilda Ramírez", email: "hilda@altura.vc", phone: "+525577777777", stage: "lead", source: "Partner", score: 38, companyDomain: "altura.vc" },
  { full_name: "Ivan Salcedo", email: "ivan@acme.mx", phone: "+525588888888", stage: "unqualified", source: "Cold", score: 12, companyDomain: "acme.mx" },
  { full_name: "Jimena Torres", email: "jimena@helixhealth.com", phone: "+525599999999", stage: "qualified", source: "Web", score: 61, companyDomain: "helixhealth.com" },
  { full_name: "Kevin Ortiz", email: "kevin@nortelogistics.mx", phone: "+525510101010", stage: "customer", source: "Referido", score: 88, companyDomain: "nortelogistics.mx" },
  { full_name: "Laura Vera", email: "laura@altura.vc", phone: "+525512121212", stage: "lead", source: "LinkedIn", score: 30, companyDomain: "altura.vc" },
  { full_name: "Mauricio Peña", email: "mauricio@brightbit.io", phone: "+525513131313", stage: "opportunity", source: "Inbound", score: 71, companyDomain: "brightbit.io" },
];

const DEAL_TEMPLATES: Array<{ title: string; amount: number; currency: string; companyDomain: string; contactEmail: string; closeOffsetDays: number }> = [
  { title: "Licencia anual SaaS", amount: 480000, currency: "MXN", companyDomain: "acme.mx", contactEmail: "ana@acme.mx", closeOffsetDays: 20 },
  { title: "Implementación fase 1", amount: 220000, currency: "MXN", companyDomain: "acme.mx", contactEmail: "carlos@acme.mx", closeOffsetDays: 45 },
  { title: "Piloto clínico", amount: 150000, currency: "MXN", companyDomain: "helixhealth.com", contactEmail: "diana@helixhealth.com", closeOffsetDays: 60 },
  { title: "Renovación enterprise", amount: 620000, currency: "MXN", companyDomain: "brightbit.io", contactEmail: "ernesto@brightbit.io", closeOffsetDays: 10 },
  { title: "Add-on analytics", amount: 95000, currency: "MXN", companyDomain: "brightbit.io", contactEmail: "fer@brightbit.io", closeOffsetDays: 30 },
  { title: "Integración ERP", amount: 310000, currency: "MXN", companyDomain: "nortelogistics.mx", contactEmail: "gerardo@nortelogistics.mx", closeOffsetDays: 25 },
  { title: "Due diligence", amount: 50000, currency: "USD", companyDomain: "altura.vc", contactEmail: "hilda@altura.vc", closeOffsetDays: 75 },
  { title: "Upsell storage", amount: 78000, currency: "MXN", companyDomain: "brightbit.io", contactEmail: "mauricio@brightbit.io", closeOffsetDays: 15 },
];

export async function seedDemoData(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string | null,
): Promise<DemoSeedResult> {
  const { peopleObjectId, companiesObjectId, dealsObjectId } = await loadObjectIds(supabase, workspaceId);
  if (!peopleObjectId || !companiesObjectId || !dealsObjectId) {
    throw new Error("CRM objects are not provisioned. Run CRM bootstrap first.");
  }

  // 1. Check for existing demo rows and skip if present to avoid duplicates.
  const { data: existing } = await supabase
    .from("records")
    .select("id")
    .eq("workspace_id", workspaceId)
    .contains("data", { __demo: true })
    .limit(1);
  if ((existing ?? []).length > 0) {
    return { companies: 0, people: 0, deals: 0, activities: 0, skippedExisting: true };
  }

  const nowIso = () => new Date().toISOString();

  // 2. Seed companies first.
  const companyRows = COMPANIES.map((c) => ({
    workspace_id: workspaceId,
    object_id: companiesObjectId,
    data: { ...c, __demo: true },
    created_by: userId,
  }));
  const { data: insertedCompanies, error: cErr } = await supabase
    .from("records")
    .insert(companyRows)
    .select("id, data");
  if (cErr) throw new Error(cErr.message);
  const companyIdByDomain = new Map<string, string>();
  for (const row of insertedCompanies ?? []) {
    const domain = (row.data as { domain?: string }).domain;
    if (domain) companyIdByDomain.set(domain, String(row.id));
  }

  // 3. Seed people with company links.
  const personRows = PEOPLE.map((p) => ({
    workspace_id: workspaceId,
    object_id: peopleObjectId,
    data: {
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      stage: p.stage,
      source: p.source,
      score: p.score,
      company_id: companyIdByDomain.get(p.companyDomain) ?? null,
      __demo: true,
    },
    created_by: userId,
  }));
  const { data: insertedPeople, error: pErr } = await supabase
    .from("records")
    .insert(personRows)
    .select("id, data");
  if (pErr) throw new Error(pErr.message);
  const personIdByEmail = new Map<string, string>();
  for (const row of insertedPeople ?? []) {
    const email = (row.data as { email?: string }).email;
    if (email) personIdByEmail.set(email, String(row.id));
  }

  // 4. Seed deals (attempt to attach to a pipeline stage if present).
  const { data: stageRows } = await supabase
    .from("workspace_pipeline_stages")
    .select("id, stage_type, sort_order")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });
  const activeStages = ((stageRows ?? []) as Array<{ id: string; stage_type: string }>).filter(
    (s) => s.stage_type === "active",
  );
  const wonStage = ((stageRows ?? []) as Array<{ id: string; stage_type: string }>).find(
    (s) => s.stage_type === "won",
  );
  const stageCycle = [...activeStages, ...(wonStage ? [wonStage] : [])];

  const dealRows = DEAL_TEMPLATES.map((d, idx) => {
    const closeDate = new Date();
    closeDate.setDate(closeDate.getDate() + d.closeOffsetDays);
    const stage = stageCycle[idx % Math.max(stageCycle.length, 1)] ?? null;
    return {
      workspace_id: workspaceId,
      object_id: dealsObjectId,
      data: {
        title: d.title,
        amount: d.amount,
        currency: d.currency,
        close_date: closeDate.toISOString().slice(0, 10),
        company_id: companyIdByDomain.get(d.companyDomain) ?? null,
        primary_contact_id: personIdByEmail.get(d.contactEmail) ?? null,
        stage_id: stage ? stage.id : null,
        __demo: true,
      },
      created_by: userId,
    };
  });
  const { data: insertedDeals, error: dErr } = await supabase
    .from("records")
    .insert(dealRows)
    .select("id, data");
  if (dErr) throw new Error(dErr.message);

  // 5. Seed a handful of activities on the first few people + deals.
  const activityTargets: Array<{
    recordId: string;
    objectId: string;
    subject: string;
    body: string;
    type: string;
  }> = [];
  for (let i = 0; i < Math.min(5, (insertedPeople ?? []).length); i++) {
    const row = insertedPeople![i];
    activityTargets.push({
      recordId: String(row.id),
      objectId: peopleObjectId,
      subject: "Llamada de descubrimiento",
      body: "Primera llamada. Interés en automatizar reportes.",
      type: "call",
    });
  }
  for (let i = 0; i < Math.min(3, (insertedDeals ?? []).length); i++) {
    const row = insertedDeals![i];
    activityTargets.push({
      recordId: String(row.id),
      objectId: dealsObjectId,
      subject: "Propuesta enviada",
      body: "Se envió SOW preliminar; esperamos feedback.",
      type: "note",
    });
  }
  if (activityTargets.length > 0) {
    const activityRows = activityTargets.map((a) => ({
      workspace_id: workspaceId,
      record_id: a.recordId,
      object_id: a.objectId,
      type: a.type,
      subject: a.subject,
      body: a.body,
      data: { __demo: true },
      author_user_id: userId,
      created_at: nowIso(),
    }));
    await supabase.from("record_activities").insert(activityRows);
  }

  return {
    companies: insertedCompanies?.length ?? 0,
    people: insertedPeople?.length ?? 0,
    deals: insertedDeals?.length ?? 0,
    activities: activityTargets.length,
    skippedExisting: false,
  };
}

export async function clearDemoData(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<{ records: number; activities: number }> {
  const { data: rows } = await supabase
    .from("records")
    .select("id")
    .eq("workspace_id", workspaceId)
    .contains("data", { __demo: true });
  const ids = ((rows ?? []) as Array<{ id: string }>).map((r) => String(r.id));

  let activitiesDeleted = 0;
  if (ids.length > 0) {
    const { data: activityRows } = await supabase
      .from("record_activities")
      .delete()
      .in("record_id", ids)
      .select("id");
    activitiesDeleted = (activityRows ?? []).length;

    await supabase.from("records").delete().in("id", ids);
  }

  // Also clear any stray activities tagged with __demo (defensive).
  const { data: strays } = await supabase
    .from("record_activities")
    .delete()
    .eq("workspace_id", workspaceId)
    .contains("data", { __demo: true })
    .select("id");

  return { records: ids.length, activities: activitiesDeleted + (strays ?? []).length };
}

export async function hasDemoData(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("records")
    .select("id")
    .eq("workspace_id", workspaceId)
    .contains("data", { __demo: true })
    .limit(1);
  return (data ?? []).length > 0;
}
