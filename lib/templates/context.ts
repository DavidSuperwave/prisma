import type { SupabaseClient } from "@supabase/supabase-js";

type RecordRow = {
  id: string;
  workspace_id: string;
  object_id: string;
  data: Record<string, unknown>;
};

export type TemplateContextKind = "crm_people" | "crm_companies" | "crm_deals";

export type BuildTemplateContextInput = {
  supabase: SupabaseClient;
  workspaceId: string;
  recordId: string;
  recordKind?: TemplateContextKind | null;
  extra?: Record<string, unknown>;
  user?: { id?: string | null; email?: string | null; name?: string | null } | null;
};

type OwnerLookup = { id: string; name: string | null; email: string | null };

function parseFirstName(fullName: unknown): string {
  if (typeof fullName !== "string") return "";
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function fetchRecord(
  supabase: SupabaseClient,
  workspaceId: string,
  recordId: string,
): Promise<RecordRow | null> {
  const { data, error } = await supabase
    .from("records")
    .select("id, workspace_id, object_id, data")
    .eq("workspace_id", workspaceId)
    .eq("id", recordId)
    .maybeSingle();
  if (error || !data) return null;
  return data as RecordRow;
}

async function fetchOwner(
  supabase: SupabaseClient,
  ownerId: string | null,
): Promise<OwnerLookup | null> {
  if (!ownerId) return null;
  try {
    const auth = (supabase as unknown as { auth?: { admin?: { getUserById?: (id: string) => Promise<{ data?: { user?: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } } }> } } }).auth;
    const admin = auth?.admin;
    if (!admin?.getUserById) return null;
    const res = await admin.getUserById(ownerId);
    const user = res?.data?.user;
    if (!user) return null;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const name =
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.name === "string" && meta.name) ||
      null;
    return { id: user.id, name, email: user.email ?? null };
  } catch {
    return null;
  }
}

/**
 * Builds a nested template context for merge-tag rendering. Expands the record's
 * company + primary contact and the owner user when available.
 */
export async function buildTemplateContext(input: BuildTemplateContextInput): Promise<Record<string, unknown>> {
  const { supabase, workspaceId, recordId, extra, user } = input;
  const record = await fetchRecord(supabase, workspaceId, recordId);
  if (!record) {
    return {
      record: {},
      person: {},
      company: {},
      deal: {},
      owner: {},
      user: user ?? {},
      ...extra,
    };
  }

  const data = toRecord(record.data);
  const kind = input.recordKind ?? (await detectKind(supabase, record.object_id));

  let companyData: Record<string, unknown> = {};
  const companyId = typeof data.company_id === "string" ? data.company_id : null;
  if (companyId) {
    const company = await fetchRecord(supabase, workspaceId, companyId);
    if (company) companyData = toRecord(company.data);
  } else if (kind === "crm_companies") {
    companyData = data;
  }

  let primaryContactData: Record<string, unknown> = {};
  const primaryContactId = typeof data.primary_contact_id === "string" ? data.primary_contact_id : null;
  if (primaryContactId) {
    const person = await fetchRecord(supabase, workspaceId, primaryContactId);
    if (person) primaryContactData = toRecord(person.data);
  }

  const personData = kind === "crm_people" ? data : primaryContactData;
  const dealData = kind === "crm_deals" ? data : {};

  const ownerId = typeof data.owner_user_id === "string" ? data.owner_user_id : null;
  const owner = await fetchOwner(supabase, ownerId);

  const firstName = parseFirstName(personData.full_name ?? data.full_name);
  const fullName =
    (typeof personData.full_name === "string" && personData.full_name) ||
    (typeof data.full_name === "string" && data.full_name) ||
    "";

  return {
    record: data,
    person: {
      ...personData,
      first_name: firstName,
      full_name: fullName,
      email: personData.email ?? data.email ?? "",
      phone: personData.phone ?? data.phone ?? "",
    },
    first_name: firstName,
    full_name: fullName,
    email: personData.email ?? data.email ?? "",
    phone: personData.phone ?? data.phone ?? "",
    company: {
      ...companyData,
      name: companyData.name ?? "",
      domain: companyData.domain ?? "",
    },
    deal: {
      ...dealData,
      title: dealData.title ?? "",
      amount: dealData.amount ?? "",
      stage: dealData.stage_id ?? dealData.stage ?? "",
      expected_close_date: dealData.close_date ?? "",
    },
    owner: {
      name: owner?.name ?? "",
      email: owner?.email ?? "",
      id: owner?.id ?? ownerId ?? "",
    },
    user: {
      name: user?.name ?? owner?.name ?? "",
      email: user?.email ?? owner?.email ?? "",
      id: user?.id ?? "",
    },
    ...extra,
  };
}

async function detectKind(
  supabase: SupabaseClient,
  objectId: string,
): Promise<TemplateContextKind | null> {
  const { data, error } = await supabase
    .from("workspace_objects")
    .select("kind")
    .eq("id", objectId)
    .maybeSingle();
  if (error || !data) return null;
  const kind = (data as { kind?: string | null }).kind ?? null;
  if (kind === "crm_people" || kind === "crm_companies" || kind === "crm_deals") return kind;
  return null;
}

export function sampleTemplateContext(): Record<string, unknown> {
  return {
    first_name: "Ana",
    full_name: "Ana García",
    email: "ana@example.com",
    phone: "+525512345678",
    person: {
      first_name: "Ana",
      full_name: "Ana García",
      email: "ana@example.com",
      phone: "+525512345678",
    },
    company: {
      name: "Acme Inc",
      domain: "acme.com",
    },
    deal: {
      title: "Plan anual Acme",
      amount: 12500,
      stage: "Proposal",
      expected_close_date: "2026-05-15",
    },
    owner: { name: "Carlos Pérez", email: "carlos@prisma.com" },
    user: { name: "Carlos Pérez", email: "carlos@prisma.com" },
  };
}
