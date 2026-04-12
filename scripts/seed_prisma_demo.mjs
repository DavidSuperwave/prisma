import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const demoPassword = process.env.PRISMA_DEMO_PASSWORD ?? "PrismaDemo!2026";
const runtimeEndpoint = process.env.HERMES_API_BASE_URL;
const runtimeApiKey = process.env.HERMES_API_KEY ?? "replace-me";
const runtimeModel = "moonshotai/kimi-k2.5";

if (!runtimeEndpoint) {
  throw new Error("HERMES_API_BASE_URL is required to seed runtime agent metadata.");
}

async function listAllUsers() {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw error;
    }
    users.push(...data.users);
    if (data.users.length < 200) {
      break;
    }
    page += 1;
  }

  return users;
}

async function ensureUser(email, roleLabel) {
  const users = await listAllUsers();
  const existing = users.find((user) => user.email === email);

  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, {
      password: demoPassword,
      email_confirm: true,
      user_metadata: {
        ...existing.user_metadata,
        prisma_role_label: roleLabel,
      },
    });
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: demoPassword,
    email_confirm: true,
    user_metadata: {
      prisma_role_label: roleLabel,
    },
  });

  if (error) {
    throw error;
  }

  return data.user.id;
}

async function ensureWorkspace({ name, subdomain, primaryColor, metadata }) {
  const { data: existing, error: existingError } = await supabase
    .from("workspaces")
    .select("id, name, subdomain")
    .eq("subdomain", subdomain)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    const { data, error } = await supabase
      .from("workspaces")
      .update({
        name,
        primary_color: primaryColor,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id, name, subdomain")
      .single();

    if (error) {
      throw error;
    }
    return data;
  }

  const { data, error } = await supabase
    .from("workspaces")
    .insert({
      name,
      subdomain,
      primary_color: primaryColor,
      metadata,
    })
    .select("id, name, subdomain")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function ensureMembership(workspaceId, userId, role) {
  const { error } = await supabase.from("workspace_members").upsert(
    {
      workspace_id: workspaceId,
      user_id: userId,
      role,
    },
    {
      onConflict: "workspace_id,user_id",
    },
  );

  if (error) {
    throw error;
  }
}

async function ensureObject(workspaceId, objectDef) {
  const { data: existing, error: existingError } = await supabase
    .from("workspace_objects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", objectDef.name)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    const { data, error } = await supabase
      .from("workspace_objects")
      .update({
        singular_name: objectDef.singularName,
        plural_name: objectDef.pluralName,
        description: objectDef.description,
        icon: objectDef.icon,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) {
      throw error;
    }
    return data.id;
  }

  const { data, error } = await supabase
    .from("workspace_objects")
    .insert({
      workspace_id: workspaceId,
      name: objectDef.name,
      singular_name: objectDef.singularName,
      plural_name: objectDef.pluralName,
      description: objectDef.description,
      icon: objectDef.icon,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function ensureFields(workspaceId, objectId, fields) {
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

async function ensureView(workspaceId, objectId, view) {
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
  };

  if (existing) {
    const { error } = await supabase
      .from("workspace_views")
      .update(payload)
      .eq("id", existing.id);

    if (error) {
      throw error;
    }
    return existing.id;
  }

  const { data, error } = await supabase
    .from("workspace_views")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function ensureRecord(workspaceId, objectId, seedKey, data) {
  const { data: existing, error: existingError } = await supabase
    .from("records")
    .select("id, data")
    .eq("workspace_id", workspaceId)
    .eq("object_id", objectId);

  if (existingError) {
    throw existingError;
  }

  const match = (existing ?? []).find((record) => record.data?.seed_key === seedKey);
  const payload = {
    workspace_id: workspaceId,
    object_id: objectId,
    data: {
      seed_key: seedKey,
      ...data,
    },
  };

  if (match) {
    const { error } = await supabase
      .from("records")
      .update({
        data: payload.data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id);

    if (error) {
      throw error;
    }
    return match.id;
  }

  const { data: inserted, error } = await supabase
    .from("records")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return inserted.id;
}

async function ensureAgent(workspaceId, agent) {
  const { data: existing, error: existingError } = await supabase
    .from("workspace_agents")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("container_name", agent.container_name)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    const { data, error } = await supabase
      .from("workspace_agents")
      .update({
        ...agent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) {
      throw error;
    }
    return data.id;
  }

  const { data, error } = await supabase
    .from("workspace_agents")
    .insert(agent)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function ensureActivity(agentId, workspaceId, action, seedKey, details) {
  const { data: existing, error: existingError } = await supabase
    .from("agent_activity")
    .select("id, details")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentId)
    .eq("action", action)
    .limit(50);

  if (existingError) {
    throw existingError;
  }

  const match = (existing ?? []).find((row) => row.details?.seed_key === seedKey);
  const payload = {
    agent_id: agentId,
    workspace_id: workspaceId,
    action,
    details: {
      seed_key: seedKey,
      ...details,
    },
  };

  if (match) {
    const { error } = await supabase.from("agent_activity").update(payload).eq("id", match.id);
    if (error) {
      throw error;
    }
    return match.id;
  }

  const { data, error } = await supabase
    .from("agent_activity")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function main() {
  const adminId = await ensureUser("demo-admin@prisma.local", "admin");
  const operatorId = await ensureUser("demo-operator@prisma.local", "operator");
  const outsiderId = await ensureUser("demo-outsider@prisma.local", "admin");

  const demoWorkspace = await ensureWorkspace({
    name: "BBC Factoring Demo",
    subdomain: "bbc-demo",
    primaryColor: "#335CFF",
    metadata: {
      vertical: "factoring",
      seeded_by: "scripts/seed_prisma_demo.mjs",
      experience_mode: "premium-ops",
    },
  });

  const sandboxWorkspace = await ensureWorkspace({
    name: "Ops Sandbox",
    subdomain: "ops-sandbox",
    primaryColor: "#6B7280",
    metadata: {
      vertical: "internal",
      seeded_by: "scripts/seed_prisma_demo.mjs",
    },
  });

  await ensureMembership(demoWorkspace.id, adminId, "admin");
  await ensureMembership(demoWorkspace.id, operatorId, "operator");
  await ensureMembership(sandboxWorkspace.id, outsiderId, "admin");

  const objectDefs = [
    {
      name: "Companies",
      singularName: "Company",
      pluralName: "Companies",
      description: "Core client and prospect accounts in the factoring pipeline.",
      icon: "building-2",
      fields: [
        { name: "Name", key: "name", type: "text", required: true },
        { name: "Industry", key: "industry", type: "text" },
        { name: "Annual Sales", key: "annual_sales", type: "currency" },
        { name: "Owner", key: "owner", type: "text" },
        {
          name: "Status",
          key: "status",
          type: "status",
          options: { values: ["active", "review", "onboarding"] },
          defaultValue: "review",
        },
      ],
      views: [
        {
          name: "Active companies",
          filters: { conditions: [{ field: "status", operator: "eq", value: "active" }] },
          sortBy: "name",
          sortOrder: "asc",
          columns: ["name", "industry", "annual_sales", "owner", "status"],
        },
      ],
      records: [
        {
          seedKey: "company-nova",
          data: {
            name: "Nova Textiles",
            industry: "Manufactura",
            annual_sales: "$72M MXN",
            owner: "Mariana Soto",
            status: "active",
          },
        },
        {
          seedKey: "company-cumbre",
          data: {
            name: "Cumbre Logistics",
            industry: "Logistica",
            annual_sales: "$48M MXN",
            owner: "Diego Reyes",
            status: "review",
          },
        },
      ],
    },
    {
      name: "Leads",
      singularName: "Lead",
      pluralName: "Leads",
      description: "Inbound opportunities captured by channel agents.",
      icon: "sparkles",
      fields: [
        { name: "Company name", key: "company_name", type: "text", required: true },
        { name: "Channel", key: "channel", type: "select", options: { values: ["whatsapp", "web", "referral"] } },
        { name: "Score", key: "score", type: "number" },
        { name: "Owner", key: "owner", type: "text" },
        {
          name: "Status",
          key: "status",
          type: "status",
          options: { values: ["new", "pending_docs", "needs_review", "qualified"] },
          defaultValue: "new",
        },
      ],
      views: [
        {
          name: "Needs review",
          filters: { conditions: [{ field: "status", operator: "eq", value: "needs_review" }] },
          sortBy: "score",
          sortOrder: "desc",
          columns: ["company_name", "channel", "score", "owner", "status"],
        },
      ],
      records: [
        {
          seedKey: "lead-orbit",
          data: {
            company_name: "Orbit Foods",
            channel: "whatsapp",
            score: 83,
            owner: "Intake Agent",
            status: "needs_review",
          },
        },
        {
          seedKey: "lead-alfa",
          data: {
            company_name: "Alfa Services",
            channel: "web",
            score: 71,
            owner: "Gerardo",
            status: "pending_docs",
          },
        },
      ],
    },
    {
      name: "Receivables",
      singularName: "Receivable",
      pluralName: "Receivables",
      description: "Factoring opportunities and payer timing data.",
      icon: "wallet-cards",
      fields: [
        { name: "Debtor name", key: "debtor_name", type: "text", required: true },
        { name: "Total amount", key: "total_amount", type: "currency" },
        { name: "Credit days", key: "credit_days", type: "number" },
        { name: "Aging bucket", key: "aging_bucket", type: "select", options: { values: ["0-30", "31-60", "61-90"] } },
        {
          name: "Status",
          key: "status",
          type: "status",
          options: { values: ["monitoring", "follow_up", "overdue"] },
          defaultValue: "monitoring",
        },
      ],
      views: [
        {
          name: "Follow-up this week",
          filters: { conditions: [{ field: "status", operator: "eq", value: "follow_up" }] },
          sortBy: "credit_days",
          sortOrder: "desc",
          columns: ["debtor_name", "total_amount", "credit_days", "aging_bucket", "status"],
        },
      ],
      records: [
        {
          seedKey: "recv-uno",
          data: {
            debtor_name: "Grupo Norte",
            total_amount: "$850K MXN",
            credit_days: 72,
            aging_bucket: "61-90",
            status: "follow_up",
          },
        },
        {
          seedKey: "recv-dos",
          data: {
            debtor_name: "Retail del Bajio",
            total_amount: "$420K MXN",
            credit_days: 28,
            aging_bucket: "0-30",
            status: "monitoring",
          },
        },
      ],
    },
    {
      name: "Documents",
      singularName: "Document",
      pluralName: "Documents",
      description: "Checklist and compliance files tied to qualification and underwriting.",
      icon: "file-stack",
      fields: [
        { name: "Document name", key: "document_name", type: "text", required: true },
        { name: "Company name", key: "company_name", type: "text" },
        { name: "Owner", key: "owner", type: "text" },
        { name: "Due date", key: "due_date", type: "date" },
        {
          name: "Status",
          key: "status",
          type: "status",
          options: { values: ["pending", "received", "needs_review", "approved"] },
          defaultValue: "pending",
        },
      ],
      views: [
        {
          name: "Pending docs",
          filters: { conditions: [{ field: "status", operator: "eq", value: "pending" }] },
          sortBy: "due_date",
          sortOrder: "asc",
          columns: ["document_name", "company_name", "owner", "due_date", "status"],
        },
      ],
      records: [
        {
          seedKey: "doc-constancia",
          data: {
            document_name: "Constancia fiscal",
            company_name: "Orbit Foods",
            owner: "Andrea",
            due_date: "2026-04-18",
            status: "pending",
          },
        },
        {
          seedKey: "doc-balance",
          data: {
            document_name: "Balance 2025",
            company_name: "Nova Textiles",
            owner: "Luis",
            due_date: "2026-04-14",
            status: "needs_review",
          },
        },
      ],
    },
  ];

  const objectIdMap = new Map();

  for (const objectDef of objectDefs) {
    const objectId = await ensureObject(demoWorkspace.id, objectDef);
    objectIdMap.set(objectDef.name, objectId);
    await ensureFields(demoWorkspace.id, objectId, objectDef.fields);

    for (const view of objectDef.views) {
      await ensureView(demoWorkspace.id, objectId, view);
    }

    for (const record of objectDef.records) {
      await ensureRecord(demoWorkspace.id, objectId, record.seedKey, record.data);
    }
  }

  const sandboxObjectId = await ensureObject(sandboxWorkspace.id, {
    name: "Companies",
    singularName: "Company",
    pluralName: "Companies",
    description: "Isolation test workspace data.",
    icon: "building-2",
  });
  await ensureFields(sandboxWorkspace.id, sandboxObjectId, [
    { name: "Name", key: "name", type: "text", required: true },
  ]);
  await ensureRecord(sandboxWorkspace.id, sandboxObjectId, "sandbox-company", { name: "Isolated Sandbox Co" });

  const copilotId = await ensureAgent(demoWorkspace.id, {
    workspace_id: demoWorkspace.id,
    name: "BBC CEO Agent",
    type: "copilot",
    description: "Coordinates the workspace, summarizes activity, and drafts structure changes.",
    container_name: "hermes-m0-copilot",
    api_endpoint: runtimeEndpoint,
    api_key: runtimeApiKey,
    hermes_version: "v2026.4.1",
    status: "active",
    soul_md:
      "You are the BBC workspace CEO agent. Keep responses operational, concise, and grounded in the workspace state. Prefer next steps over general advice.",
    skills: ["prisma-database"],
    knowledge_scope: {
      model: runtimeModel,
      read: ["Companies", "Leads", "Receivables", "Documents"],
      write: ["workspace_views", "records"],
      approvals: ["rate_offer", "outbound_message"],
    },
    cron_jobs: [],
    channel_config: {},
    memory_limit_mb: 512,
    cpu_limit: 0.5,
  });

  const intakeId = await ensureAgent(demoWorkspace.id, {
    workspace_id: demoWorkspace.id,
    name: "WhatsApp Intake Agent",
    type: "channel",
    description: "Qualifies inbound leads and captures missing documents before human review.",
    container_name: "hermes-bbc-intake-demo",
    api_endpoint: runtimeEndpoint,
    api_key: runtimeApiKey,
    hermes_version: "v2026.4.1",
    status: "active",
    soul_md:
      "You are the intake agent. Ask concise qualification questions, capture missing information, and stop when a human review is required.",
    skills: ["prisma-database"],
    knowledge_scope: {
      model: runtimeModel,
      read: ["Leads", "Documents"],
      write: ["Leads", "Documents"],
      channels: ["whatsapp"],
    },
    cron_jobs: [],
    channel_config: {
      platform: "whatsapp",
      mode: "demo",
    },
    memory_limit_mb: 384,
    cpu_limit: 0.3,
  });

  const monitorId = await ensureAgent(demoWorkspace.id, {
    workspace_id: demoWorkspace.id,
    name: "Receivables Monitor",
    type: "worker",
    description: "Tracks overdue receivables and prepares recommendations for operator review.",
    container_name: "hermes-bbc-monitor-demo",
    api_endpoint: runtimeEndpoint,
    api_key: runtimeApiKey,
    hermes_version: "v2026.4.1",
    status: "active",
    soul_md:
      "You are the receivables monitor. Detect exceptions, summarize risk, and propose next actions without executing them automatically.",
    skills: ["prisma-database"],
    knowledge_scope: {
      model: runtimeModel,
      read: ["Receivables", "Companies"],
      write: ["agent_activity"],
    },
    cron_jobs: [
      {
        schedule: "every 30 minutes",
        prompt: "Review receivables with follow_up or overdue status and log the queue summary.",
      },
    ],
    channel_config: {},
    memory_limit_mb: 384,
    cpu_limit: 0.3,
  });

  await ensureActivity(copilotId, demoWorkspace.id, "workspace.seeded", "seeded-home", {
    title: "Workspace seeded for product walkthrough",
    impact: "Demo data, views, and agents are ready for testing.",
    status: "success",
  });

  await ensureActivity(intakeId, demoWorkspace.id, "lead.qualified", "qualified-orbit", {
    lead: "Orbit Foods",
    score: 83,
    status: "needs_review",
    next_step: "Collect tax certificate and aging report.",
  });

  await ensureActivity(monitorId, demoWorkspace.id, "receivable.flagged", "receivable-follow-up", {
    debtor: "Grupo Norte",
    aging_bucket: "61-90",
    recommendation: "Escalate to operator and prepare approval note.",
    status: "warning",
  });

  console.log(JSON.stringify(
    {
      demoPassword,
      users: {
        admin: "demo-admin@prisma.local",
        operator: "demo-operator@prisma.local",
        outsider: "demo-outsider@prisma.local",
      },
      workspace: {
        name: demoWorkspace.name,
        subdomain: demoWorkspace.subdomain,
      },
      agents: {
        copilotId,
        intakeId,
        monitorId,
      },
    },
    null,
    2,
  ));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
