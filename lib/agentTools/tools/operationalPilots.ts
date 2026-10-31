import { fetchInternalJson } from "../executor";
import { signProposal, verifyProposal } from "../confirmToken";
import { registerTool, type ToolContext, type ToolResult } from "../registry";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type PilotKind = "bbc" | "automotive" | "despacho";

type FieldSpec = {
  key: string;
  name: string;
  type: string;
  required?: boolean;
  options?: Record<string, unknown>;
};

type ObjectSpec = {
  slug: string;
  name: string;
  singularName: string;
  pluralName: string;
  description: string;
  icon: string;
  fields: FieldSpec[];
  viewName: string;
};

type AgentSpec = {
  name: string;
  description: string;
  soulMd: string;
  skills: string[];
  mcpToolsInclude: string[];
  read: string[];
  write: string[];
};

type WorkflowSpec = {
  name: string;
  description: string;
  enabled: boolean;
  trigger: Record<string, unknown>;
  steps: Array<Record<string, unknown>>;
};

type PilotSpec = {
  kind: PilotKind;
  title: string;
  intent: string;
  agent: AgentSpec;
  objects: ObjectSpec[];
  workflows: WorkflowSpec[];
  setupBlockers: string[];
};

type SetupArgs = {
  pilot?: string;
  dryRun?: boolean;
  confirmToken?: string;
  includeAgent?: boolean;
  includeObjects?: boolean;
  includeWorkflows?: boolean;
};

const slug = (ctx: { workspaceSlug: string }) => encodeURIComponent(ctx.workspaceSlug);

const COMMON_AGENT_TOOLS = [
  "schema.catalog",
  "records.query",
  "records.create",
  "records.update",
  "crm.add_task",
  "crm.add_activity",
  "documents.analyze",
  "documents.extract_field",
  "documents.extract_collection",
  "automations.list",
  "automations.run_now",
  "peer.list_agents",
  "peer_delegate",
];

function statusOptions(values: string[]) {
  return { values };
}

function pilotSpecs(): Record<PilotKind, PilotSpec> {
  return {
    bbc: {
      kind: "bbc",
      title: "BBC Factoring operational pilot",
      intent:
        "Validate uploaded factoring packets, extract required fields, route missing data to review, and prepare HubSpot/status sync once credentials are available.",
      agent: {
        name: "BBC Intake Worker",
        description: "Validates factoring onboarding packets and routes incomplete applications.",
        skills: ["prisma-database", "prisma-records", "prisma-tasks", "prisma-api-fetch"],
        mcpToolsInclude: COMMON_AGENT_TOOLS,
        read: ["factoring-applications", "portal-uploads", "buyers", "credit-decisions"],
        write: ["factoring-applications", "portal-uploads", "buyers", "credit-decisions"],
        soulMd: [
          "# BBC Intake Worker",
          "",
          "You validate BBC Factoring onboarding packets. You are precise, audit-friendly, and conservative.",
          "Always inspect uploaded documents before judging completeness. Use document extraction tools for PDFs, spreadsheets, and scanned files.",
          "When evidence is missing or low confidence, create review/task output instead of guessing.",
          "Keep statuses on factoring application records current and summarize blockers clearly for the operator.",
        ].join("\n"),
      },
      objects: [
        {
          slug: "factoring-applications",
          name: "Factoring Applications",
          singularName: "Factoring Application",
          pluralName: "Factoring Applications",
          description: "Client onboarding packet and validation status for factoring review.",
          icon: "file-check-2",
          viewName: "Active applications",
          fields: [
            { key: "client_name", name: "Client name", type: "text", required: true },
            { key: "annual_revenue_mxn", name: "Annual revenue MXN", type: "currency" },
            { key: "status", name: "Status", type: "status", required: true, options: statusOptions(["new", "documents_pending", "in_review", "complete", "sent_to_hubspot"]) },
            { key: "portal_client_id", name: "Portal client ID", type: "text" },
            { key: "missing_fields", name: "Missing fields", type: "text" },
            { key: "last_validation_summary", name: "Last validation summary", type: "text" },
          ],
        },
        {
          slug: "portal-uploads",
          name: "Portal Uploads",
          singularName: "Portal Upload",
          pluralName: "Portal Uploads",
          description: "Documents received from the client portal.",
          icon: "folder-sync",
          viewName: "Recent uploads",
          fields: [
            { key: "client_name", name: "Client name", type: "text", required: true },
            { key: "document_type", name: "Document type", type: "select", required: true, options: statusOptions(["solicitud_factoraje", "ventas_proyecciones", "cuentas_por_cobrar", "other"]) },
            { key: "source_document_id", name: "Source document ID", type: "text" },
            { key: "application_id", name: "Application ID", type: "text" },
            { key: "parse_status", name: "Parse status", type: "status", options: statusOptions(["new", "parsed", "needs_review", "failed"]) },
          ],
        },
        {
          slug: "buyers",
          name: "Buyers",
          singularName: "Buyer",
          pluralName: "Buyers",
          description: "Debtors/buyers evaluated for creditworthiness.",
          icon: "building-2",
          viewName: "Buyer risk review",
          fields: [
            { key: "name", name: "Name", type: "text", required: true },
            { key: "payment_terms", name: "Payment terms", type: "text" },
            { key: "monthly_volume", name: "Monthly volume", type: "currency" },
            { key: "risk_notes", name: "Risk notes", type: "text" },
          ],
        },
        {
          slug: "credit-decisions",
          name: "Credit Decisions",
          singularName: "Credit Decision",
          pluralName: "Credit Decisions",
          description: "Structured credit evaluation output and decision state.",
          icon: "badge-check",
          viewName: "Decision queue",
          fields: [
            { key: "application_id", name: "Application ID", type: "text", required: true },
            { key: "decision", name: "Decision", type: "status", options: statusOptions(["draft", "approved", "rejected", "needs_more_info"]) },
            { key: "summary", name: "Summary", type: "text" },
            { key: "evidence_notes", name: "Evidence notes", type: "text" },
          ],
        },
      ],
      workflows: [
        {
          name: "BBC packet validation run",
          description: "Manual pilot run that prompts the BBC worker to validate recent portal uploads.",
          enabled: false,
          trigger: { type: "activity.custom" },
          steps: [
            { type: "create_task", title: "Review BBC factoring packet validation output", taskType: "document_review" },
          ],
        },
      ],
      setupBlockers: [
        "Portal polling/webhook credentials are still required before automatic upload monitoring can run.",
        "HubSpot private app credentials and field mapping are required before status sync can be enabled.",
      ],
    },
    automotive: {
      kind: "automotive",
      title: "Automotive operations pilot",
      intent:
        "Sync used inventory, ingest monthly promotion documents, route leads to call-center tasks, and prepare CMS sync once the site endpoint is configured.",
      agent: {
        name: "Inventory Ops Worker",
        description: "Keeps inventory, promotions, and call-center routing organized.",
        skills: ["prisma-database", "prisma-records", "prisma-api-fetch", "gb-inventory-sync"],
        mcpToolsInclude: [...COMMON_AGENT_TOOLS, "crm.import_attachment", "cms.sync_inventory", "cms.push_inventory", "connections.sync_now"],
        read: ["vehicles", "promotions", "lead-sources", "call-center-tasks"],
        write: ["vehicles", "promotions", "lead-sources", "call-center-tasks"],
        soulMd: [
          "# Inventory Ops Worker",
          "",
          "You operate an automotive group workspace. Your job is to keep vehicle inventory, promotions, and lead routing clean.",
          "Use spreadsheet/import tools for inventory, document tools for promotions, and task tools for call-center handoff.",
          "Do not design websites. Treat websites and CMS endpoints as channels that receive approved operational data.",
        ].join("\n"),
      },
      objects: [
        {
          slug: "vehicles",
          name: "Vehicles",
          singularName: "Vehicle",
          pluralName: "Vehicles",
          description: "Used and new vehicle inventory managed by the operations team.",
          icon: "car",
          viewName: "Available inventory",
          fields: [
            { key: "stock_number", name: "Stock number", type: "text", required: true },
            { key: "brand", name: "Brand", type: "select", options: statusOptions(["Ford", "Mazda", "Jeep", "Lincoln", "Other"]) },
            { key: "model", name: "Model", type: "text", required: true },
            { key: "year", name: "Year", type: "number" },
            { key: "price", name: "Price", type: "currency" },
            { key: "status", name: "Status", type: "status", options: statusOptions(["available", "reserved", "sold", "needs_review"]) },
            { key: "source", name: "Source", type: "text" },
          ],
        },
        {
          slug: "promotions",
          name: "Promotions",
          singularName: "Promotion",
          pluralName: "Promotions",
          description: "Monthly brand promotions extracted from uploaded files and routed for approval.",
          icon: "badge-percent",
          viewName: "Pending promotions",
          fields: [
            { key: "brand", name: "Brand", type: "select", required: true, options: statusOptions(["Ford", "Mazda", "Jeep", "Lincoln", "Other"]) },
            { key: "title", name: "Title", type: "text", required: true },
            { key: "month", name: "Month", type: "text" },
            { key: "publish_status", name: "Publish status", type: "status", options: statusOptions(["draft", "pending_review", "approved", "published"]) },
            { key: "terms", name: "Terms", type: "text" },
            { key: "source_document_id", name: "Source document ID", type: "text" },
          ],
        },
        {
          slug: "lead-sources",
          name: "Lead Sources",
          singularName: "Lead Source",
          pluralName: "Lead Sources",
          description: "Inbound sources feeding the unified lead/call-center workflow.",
          icon: "radio",
          viewName: "Active lead sources",
          fields: [
            { key: "name", name: "Name", type: "text", required: true },
            { key: "channel", name: "Channel", type: "select", options: statusOptions(["Meta", "Google", "Website", "Phone", "Chatbot", "Other"]) },
            { key: "status", name: "Status", type: "status", options: statusOptions(["active", "paused", "needs_mapping"]) },
          ],
        },
        {
          slug: "call-center-tasks",
          name: "Call Center Tasks",
          singularName: "Call Center Task",
          pluralName: "Call Center Tasks",
          description: "Operational queue for centralized lead follow-up.",
          icon: "headphones",
          viewName: "Open call-center work",
          fields: [
            { key: "lead_name", name: "Lead name", type: "text", required: true },
            { key: "phone", name: "Phone", type: "text" },
            { key: "interest", name: "Interest", type: "text" },
            { key: "status", name: "Status", type: "status", options: statusOptions(["new", "assigned", "contacted", "booked", "closed"]) },
            { key: "assigned_to", name: "Assigned to", type: "text" },
          ],
        },
      ],
      workflows: [
        {
          name: "Automotive promotion review task",
          description: "Manual pilot workflow to route extracted promotions for operator approval.",
          enabled: false,
          trigger: { type: "activity.custom" },
          steps: [{ type: "create_task", title: "Review extracted automotive promotion", taskType: "promotion_review" }],
        },
      ],
      setupBlockers: [
        "Universe export/API shape is required before recurring inventory sync can be scheduled.",
        "CMS endpoint and HMAC credentials are required before approved vehicles/promotions can publish externally.",
      ],
    },
    despacho: {
      kind: "despacho",
      title: "Despacho lead operations pilot",
      intent:
        "Capture inbound social leads, create CRM records, assign follow-up tasks, and test a simple nurture workflow.",
      agent: {
        name: "Despacho Lead Worker",
        description: "Captures and follows up with inbound professional-services leads.",
        skills: ["prisma-crm", "prisma-tasks", "prisma-reply-approve"],
        mcpToolsInclude: [...COMMON_AGENT_TOOLS, "crm.create_person", "crm.create_deal", "crm.enroll_in_sequence"],
        read: ["prospects", "lead-followups"],
        write: ["prospects", "lead-followups"],
        soulMd: [
          "# Despacho Lead Worker",
          "",
          "You qualify inbound leads for an accounting/legal practice. Keep replies concise, practical, and sales-oriented.",
          "Create CRM records, tasks, and follow-up suggestions. Do not design websites; track delivery and lead capture operations only.",
        ].join("\n"),
      },
      objects: [
        {
          slug: "prospects",
          name: "Prospects",
          singularName: "Prospect",
          pluralName: "Prospects",
          description: "Inbound leads from ads, comments, DMs, forms, or WhatsApp.",
          icon: "user-round-plus",
          viewName: "New prospects",
          fields: [
            { key: "full_name", name: "Full name", type: "text", required: true },
            { key: "phone", name: "Phone", type: "text" },
            { key: "email", name: "Email", type: "text" },
            { key: "source", name: "Source", type: "select", options: statusOptions(["ManyChat", "Instagram", "Facebook", "Website", "WhatsApp", "Other"]) },
            { key: "keyword", name: "Keyword", type: "text" },
            { key: "stage", name: "Stage", type: "status", options: statusOptions(["new", "contacted", "qualified", "won", "lost"]) },
          ],
        },
        {
          slug: "lead-followups",
          name: "Lead Followups",
          singularName: "Lead Followup",
          pluralName: "Lead Followups",
          description: "Tasks and next actions for inbound prospect nurture.",
          icon: "messages-square",
          viewName: "Open followups",
          fields: [
            { key: "prospect_name", name: "Prospect name", type: "text", required: true },
            { key: "channel", name: "Channel", type: "select", options: statusOptions(["WhatsApp", "Email", "Phone", "DM"]) },
            { key: "next_action", name: "Next action", type: "text" },
            { key: "due_date", name: "Due date", type: "date" },
            { key: "status", name: "Status", type: "status", options: statusOptions(["open", "done", "blocked"]) },
          ],
        },
      ],
      workflows: [
        {
          name: "Despacho inbound lead follow-up",
          description: "Create a follow-up task when a prospect enters the workspace.",
          enabled: true,
          trigger: { type: "record.created" },
          steps: [{ type: "create_task", title: "Follow up with new despacho prospect", taskType: "lead_follow_up" }],
        },
      ],
      setupBlockers: [
        "ManyChat or webhook connection is required before inbound social comments can arrive automatically.",
      ],
    },
  };
}

function normalizePilot(value: unknown): PilotKind | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["bbc", "bbc_factoring", "factoring", "factoraje"].includes(normalized)) return "bbc";
  if (["automotive", "auto", "automotriz", "grupo_automotriz"].includes(normalized)) return "automotive";
  if (["despacho", "legal", "accounting", "contable"].includes(normalized)) return "despacho";
  return null;
}

function renderDraft(spec: PilotSpec, flags: { includeAgent: boolean; includeObjects: boolean; includeWorkflows: boolean }) {
  return {
    pilot: spec.kind,
    title: spec.title,
    intent: spec.intent,
    willCreate: {
      agent: flags.includeAgent ? spec.agent : null,
      objects: flags.includeObjects
        ? spec.objects.map((object) => ({
            slug: object.slug,
            name: object.name,
            fields: object.fields.map((field) => ({
              key: field.key,
              name: field.name,
              type: field.type,
              required: Boolean(field.required),
            })),
            viewName: object.viewName,
          }))
        : [],
      workflows: flags.includeWorkflows ? spec.workflows : [],
    },
    setupBlockers: spec.setupBlockers,
    nextStep:
      "If this draft matches the client operation, rerun operational_pilot.setup with dryRun:false to create the pilot scaffolding.",
  };
}

function buildProposal(spec: PilotSpec, flags: { includeAgent: boolean; includeObjects: boolean; includeWorkflows: boolean }) {
  return {
    action: "operational_pilot.setup",
    pilot: spec.kind,
    summary: `Create ${spec.title} scaffolding for chat-driven pilot validation.`,
    includeAgent: flags.includeAgent,
    includeObjects: flags.includeObjects,
    includeWorkflows: flags.includeWorkflows,
    counts: {
      agents: flags.includeAgent ? 1 : 0,
      objects: flags.includeObjects ? spec.objects.length : 0,
      workflows: flags.includeWorkflows ? spec.workflows.length : 0,
    },
  };
}

async function listObjects(ctx: ToolContext) {
  const response = await fetchInternalJson<{
    objects?: Array<{ id: string; slug?: string | null; name: string; fields?: Array<{ key: string }> }>;
  }>(ctx, `/api/workspaces/${slug(ctx)}/objects?includeFields=true`);
  if (!response.ok) throw new Error(response.error ?? "Unable to list objects.");
  return response.data?.objects ?? [];
}

async function ensureObject(ctx: ToolContext, spec: ObjectSpec) {
  const objects = await listObjects(ctx);
  const existing = objects.find((object) => object.slug === spec.slug || object.name === spec.name);
  if (existing) return { id: existing.id, slug: existing.slug ?? spec.slug, created: false };
  const created = await fetchInternalJson<{ object?: { id: string; slug: string } }>(
    ctx,
    `/api/workspaces/${slug(ctx)}/objects`,
    {
      method: "POST",
      body: JSON.stringify({
        name: spec.name,
        singularName: spec.singularName,
        pluralName: spec.pluralName,
        description: spec.description,
        icon: spec.icon,
        slug: spec.slug,
      }),
    },
  );
  if (!created.ok || !created.data?.object?.id) {
    throw new Error(created.error ?? `Unable to create object ${spec.name}.`);
  }
  return { id: created.data.object.id, slug: created.data.object.slug, created: true };
}

async function ensureFields(ctx: ToolContext, objectId: string, spec: ObjectSpec) {
  const objects = await listObjects(ctx);
  const current = objects.find((object) => object.id === objectId);
  const existingKeys = new Set((current?.fields ?? []).map((field) => String(field.key)));
  const created: string[] = [];
  for (const field of spec.fields) {
    if (existingKeys.has(field.key)) continue;
    const response = await fetchInternalJson(ctx, `/api/workspaces/${slug(ctx)}/fields`, {
      method: "POST",
      body: JSON.stringify({
        objectId,
        key: field.key,
        name: field.name,
        type: field.type,
        required: Boolean(field.required),
        options: field.options ?? {},
      }),
    });
    if (!response.ok) throw new Error(response.error ?? `Unable to create field ${field.key}.`);
    created.push(field.key);
  }
  return created;
}

async function ensureView(ctx: ToolContext, objectId: string, spec: ObjectSpec) {
  const existing = await fetchInternalJson<{ views?: Array<{ id: string; name: string }> }>(
    ctx,
    `/api/workspaces/${slug(ctx)}/views?objectId=${encodeURIComponent(objectId)}`,
  );
  if (existing.ok && existing.data?.views?.some((view) => view.name === spec.viewName)) {
    return null;
  }
  const response = await fetchInternalJson<{ viewId?: string }>(ctx, `/api/workspaces/${slug(ctx)}/views`, {
    method: "POST",
    body: JSON.stringify({
      name: spec.viewName,
      objectId,
      scope: "org",
      viewMode: "table",
      columns: spec.fields.slice(0, 8).map((field) => field.key),
      columnConfig: spec.fields.slice(0, 8).map((field, index) => ({ key: field.key, visible: true, order: index })),
      isPinned: true,
    }),
  });
  if (!response.ok) throw new Error(response.error ?? `Unable to create view ${spec.viewName}.`);
  return response.data?.viewId ?? null;
}

async function ensureAgent(ctx: ToolContext, spec: PilotSpec) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase admin unavailable.");
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("subdomain", ctx.workspaceSlug)
    .maybeSingle();
  if (workspaceError) throw new Error(workspaceError.message);
  if (!workspace) throw new Error("Workspace not found.");

  const { data: found, error: agentError } = await supabase
    .from("workspace_agents")
    .select("id, name")
    .eq("workspace_id", String(workspace.id))
    .eq("name", spec.agent.name)
    .maybeSingle();
  if (agentError) throw new Error(agentError.message);
  if (found) return { id: found.id, created: false };
  const response = await fetchInternalJson<{ agent?: { id: string } }>(ctx, `/api/workspaces/${slug(ctx)}/agents`, {
    method: "POST",
    body: JSON.stringify({
      name: spec.agent.name,
      role: "custom",
      description: spec.agent.description,
      soulMd: spec.agent.soulMd,
      skills: spec.agent.skills,
      mcpToolsInclude: spec.agent.mcpToolsInclude,
      knowledgeScope: {
        read: spec.agent.read,
        write: spec.agent.write,
        channels: ["workspace_chat"],
        surfaces: ["operational_pilot"],
      },
      isActive: false,
    }),
  });
  if (!response.ok || !response.data?.agent?.id) {
    throw new Error(response.error ?? `Unable to create agent ${spec.agent.name}.`);
  }
  return { id: response.data.agent.id, created: true };
}

async function ensureWorkflow(ctx: ToolContext, workflow: WorkflowSpec) {
  const existing = await fetchInternalJson<{ workflows?: Array<{ id: string; name: string }> }>(
    ctx,
    `/api/workspaces/${slug(ctx)}/workflows`,
  );
  if (existing.ok && existing.data?.workflows?.some((row) => row.name === workflow.name)) {
    return null;
  }
  const response = await fetchInternalJson<{ workflow?: { id: string } }>(
    ctx,
    `/api/workspaces/${slug(ctx)}/workflows`,
    {
      method: "POST",
      body: JSON.stringify(workflow),
    },
  );
  if (!response.ok) throw new Error(response.error ?? `Unable to create workflow ${workflow.name}.`);
  return response.data?.workflow?.id ?? null;
}

registerTool({
  name: "operational_pilot.setup",
  description:
    "Draft or apply a Hermes-first operational pilot setup for bbc, automotive, or despacho. Defaults to dryRun:true and returns a confirmToken. Use this when an admin asks to test whether agents can configure and execute a real operational workflow before building reusable templates.",
  args: {
    pilot: { type: "string", required: true, description: "bbc | automotive | despacho" },
    dryRun: { type: "boolean", description: "Default true. false applies the setup." },
    confirmToken: { type: "string", description: "Token from dryRun proposal; required when dryRun:false." },
    includeAgent: { type: "boolean", description: "Default true." },
    includeObjects: { type: "boolean", description: "Default true." },
    includeWorkflows: { type: "boolean", description: "Default true." },
  },
  handler: async (rawArgs, ctx): Promise<ToolResult> => {
    const args = rawArgs as SetupArgs;
    const pilot = normalizePilot(args.pilot);
    if (!pilot) {
      return { ok: false, error: "pilot must be one of: bbc, automotive, despacho.", status: 400 };
    }
    const spec = pilotSpecs()[pilot];
    const flags = {
      includeAgent: args.includeAgent !== false,
      includeObjects: args.includeObjects !== false,
      includeWorkflows: args.includeWorkflows !== false,
    };
    const dryRun = args.dryRun !== false;
    const proposal = buildProposal(spec, flags);
    if (dryRun) {
      const token = signProposal(proposal);
      return {
        ok: true,
        data: { dryRun: true, proposal, confirmToken: token.token, expiresAt: token.expiresAt, ...renderDraft(spec, flags) },
      };
    }
    const verification = verifyProposal(args.confirmToken, proposal);
    if (!verification.ok) {
      return {
        ok: false,
        error: `Confirmation token invalid (${verification.reason}). Re-run with dryRun:true to get a fresh token.`,
        status: 409,
      };
    }

    try {
      const createdObjects: Array<{ id: string; slug: string; created: boolean; fieldsCreated: string[]; viewId: string | null }> = [];
      const createdWorkflows: Array<{ name: string; id: string | null }> = [];
      let agent: { id: string; created: boolean } | null = null;

      if (flags.includeObjects) {
        for (const objectSpec of spec.objects) {
          const object = await ensureObject(ctx, objectSpec);
          const fieldsCreated = await ensureFields(ctx, object.id, objectSpec);
          const viewId = await ensureView(ctx, object.id, objectSpec);
          createdObjects.push({ ...object, fieldsCreated, viewId });
        }
      }

      if (flags.includeAgent) {
        agent = await ensureAgent(ctx, spec);
      }

      if (flags.includeWorkflows) {
        for (const workflow of spec.workflows) {
          const id = await ensureWorkflow(ctx, workflow);
          createdWorkflows.push({ name: workflow.name, id });
        }
      }

      return {
        ok: true,
        data: {
          dryRun: false,
          pilot: spec.kind,
          title: spec.title,
          agent,
          objects: createdObjects,
          workflows: createdWorkflows,
          setupBlockers: spec.setupBlockers,
          nextStep:
            "Run sample documents, spreadsheet imports, webhook payloads, or lead records through the created worker and workflows, then capture pilot failures before turning this into a reusable template.",
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Operational pilot setup failed.",
        status: 400,
      };
    }
  },
});
