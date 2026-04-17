import { getCurrentAppUser } from "@/lib/auth";
import {
  deriveReadinessFromKnowledgeScope,
  evaluateAgentReadiness,
  executionBlockReason,
} from "@/lib/agentReadiness";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";

const defaultSystemPrompt = `Eres agente de Prisma. Hablas en espanol para negocios mexicanos con tono claro, cercano y orientado a conversion. Tu trabajo es ayudar al visitante a entender como un agente IA por WhatsApp puede resolver su caso y mover la conversacion al siguiente paso.

Empieza con respuestas cortas y utiles. Despues de responder, empuja el workflow con una siguiente pregunta concreta que ayude a calificar la oportunidad, por ejemplo:
- que tipo de negocio tiene
- que proceso quiere automatizar
- si busca leads, soporte, citas, seguimiento o cobranza
- si quiere una demo, propuesta o implementacion por vertical

Evita buzzwords, evita exagerar y no des respuestas vagas. Si te preguntan por industrias, explica que la misma base se adapta para legal, salud, belleza, ventas, operaciones y otros servicios. Siempre intenta cerrar cada respuesta con un siguiente paso accionable.`;

type ChatHistoryMessage = { role: string; content: string };

type ChatRequest = {
  message?: string;
  history?: ChatHistoryMessage[];
  conversation_id?: string;
  conversationId?: string;
  agent_id?: string;
  agentId?: string;
  workspace_id?: string;
  workspaceId?: string;
  app_context?: {
    current_tab?: string;
    current_object?: string | null;
    current_view?: string | null;
    current_record_title?: string | null;
    queue_preview?: string[];
  };
  appContext?: {
    current_tab?: string;
    current_object?: string | null;
    current_view?: string | null;
    current_record_title?: string | null;
    queue_preview?: string[];
  };
};

type ChatProvider = "hermes" | "openrouter";

type SchemaProposalField = {
  name: string;
  key: string;
  type: string;
  required?: boolean;
};

type SchemaProposalObject = {
  name: string;
  singularName: string;
  pluralName: string;
  description: string;
  icon: string;
  fields: SchemaProposalField[];
};

type SchemaProposalPayload = {
  proposalId: string;
  title: string;
  rationale: string;
  requiresApproval: boolean;
  sourcePrompt: string;
  objects: SchemaProposalObject[];
  suggestedNextAction: string;
};

type AgentRuntimeRecord = {
  id: string;
  workspace_id: string;
  name: string;
  api_endpoint: string;
  api_key: string;
  status: string;
  soul_md: string | null;
  knowledge_scope: Record<string, unknown> | null;
};

const sseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

const PUBLIC_CHAT_WINDOW_MS = 60_000;
const PUBLIC_CHAT_LIMIT = 20;
const publicChatCounters = new Map<string, { count: number; windowStart: number }>();

function formatSse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function resolveProvider() {
  const configured = (process.env.PRISMA_CHAT_PROVIDER ?? "auto").toLowerCase();
  if (configured === "hermes") {
    return "hermes" as ChatProvider;
  }
  if (configured === "openrouter") {
    return "openrouter" as ChatProvider;
  }

  return process.env.HERMES_API_BASE_URL && process.env.HERMES_API_KEY ? "hermes" : "openrouter";
}

function getClientFingerprint(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwardedFor.split(",")[0]?.trim() || "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  return `${ip}:${userAgent.slice(0, 120)}`;
}

function enforcePublicChatRateLimit(request: Request, payload: ChatRequest) {
  const isScoped = Boolean(payload.workspace_id ?? payload.workspaceId ?? payload.agent_id ?? payload.agentId);
  if (isScoped) {
    return null;
  }

  const key = getClientFingerprint(request);
  const now = Date.now();
  const existing = publicChatCounters.get(key);
  if (!existing || now - existing.windowStart >= PUBLIC_CHAT_WINDOW_MS) {
    publicChatCounters.set(key, { count: 1, windowStart: now });
    return null;
  }

  if (existing.count >= PUBLIC_CHAT_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((PUBLIC_CHAT_WINDOW_MS - (now - existing.windowStart)) / 1000));
    return Response.json(
      { error: "Too many requests. Please wait a moment before sending another message." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  existing.count += 1;
  publicChatCounters.set(key, existing);
  return null;
}

function slugifyFieldKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeObjectName(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0
    ? trimmed.slice(0, 1).toUpperCase() + trimmed.slice(1)
    : "Records";
}

function inferSchemaObjectsFromMessage(message: string): SchemaProposalObject[] {
  const lower = message.toLowerCase();
  const crmIntent =
    lower.includes("crm") ||
    lower.includes("pipeline") ||
    lower.includes("ventas") ||
    lower.includes("clientes");
  const receivablesIntent =
    lower.includes("cobranza") || lower.includes("cartera") || lower.includes("factura");
  const operationsIntent =
    lower.includes("operacion") || lower.includes("workflow") || lower.includes("proceso");

  if (crmIntent) {
    return [
      {
        name: "Companies",
        singularName: "Company",
        pluralName: "Companies",
        description: "Cuentas principales y su estado comercial.",
        icon: "building-2",
        fields: [
          { name: "Name", key: "name", type: "text", required: true },
          { name: "Industry", key: "industry", type: "text" },
          { name: "Status", key: "status", type: "status", required: true },
          { name: "Owner", key: "owner", type: "text" },
          { name: "Priority", key: "priority", type: "select" },
        ],
      },
      {
        name: "Leads",
        singularName: "Lead",
        pluralName: "Leads",
        description: "Pipeline comercial para calificación y seguimiento.",
        icon: "users",
        fields: [
          { name: "Full Name", key: "full_name", type: "text", required: true },
          { name: "Email", key: "email", type: "text" },
          { name: "Phone", key: "phone", type: "text" },
          { name: "Stage", key: "stage", type: "status", required: true },
          { name: "Next Action", key: "next_action", type: "text" },
          { name: "Due Date", key: "due_date", type: "date" },
        ],
      },
    ];
  }

  if (receivablesIntent) {
    return [
      {
        name: "Receivables",
        singularName: "Receivable",
        pluralName: "Receivables",
        description: "Control de cobranza y seguimiento de cuentas por cobrar.",
        icon: "wallet-cards",
        fields: [
          { name: "Debtor", key: "debtor", type: "text", required: true },
          { name: "Invoice Number", key: "invoice_number", type: "text", required: true },
          { name: "Amount", key: "amount", type: "currency", required: true },
          { name: "Status", key: "status", type: "status", required: true },
          { name: "Due Date", key: "due_date", type: "date", required: true },
          { name: "Assigned Collector", key: "assigned_collector", type: "text" },
        ],
      },
    ];
  }

  const guessedName = operationsIntent ? "Operations Queue" : "Core Records";
  const normalizedName = normalizeObjectName(guessedName);
  return [
    {
      name: normalizedName,
      singularName: normalizedName.endsWith("s") ? normalizedName.slice(0, -1) : normalizedName,
      pluralName: normalizedName.endsWith("s") ? normalizedName : `${normalizedName}s`,
      description: "Estructura inicial para operar el flujo solicitado desde chat.",
      icon: "file-stack",
      fields: [
        { name: "Title", key: "title", type: "text", required: true },
        { name: "Status", key: "status", type: "status", required: true },
        { name: "Owner", key: "owner", type: "text" },
        { name: "Priority", key: "priority", type: "select" },
        { name: "Due Date", key: "due_date", type: "date" },
      ],
    },
  ];
}

function shouldProposeSchema(message: string, hasWorkspaceContext: boolean) {
  if (!hasWorkspaceContext) {
    return false;
  }
  const lower = message.toLowerCase();
  return (
    lower.includes("crear tabla") ||
    lower.includes("crear base") ||
    lower.includes("database") ||
    lower.includes("crm") ||
    lower.includes("schema") ||
    lower.includes("esquema") ||
    lower.includes("twin")
  );
}

function buildSchemaProposal(message: string): SchemaProposalPayload {
  const objects = inferSchemaObjectsFromMessage(message).map((objectDef) => ({
    ...objectDef,
    fields: objectDef.fields.map((field) => ({
      ...field,
      key: slugifyFieldKey(field.key || field.name),
    })),
  }));
  const title =
    objects.length > 1
      ? `Propuesta inicial (${objects.length} objetos)`
      : `Propuesta para ${objects[0]?.name ?? "workspace"}`;
  return {
    proposalId: `proposal-${Date.now()}`,
    title,
    rationale:
      "Inferí la estructura mínima para operar tu flujo primero en datos y luego en automatización.",
    requiresApproval: true,
    sourcePrompt: message,
    objects,
    suggestedNextAction:
      "Si confirmas esta propuesta, crearé objetos y campos en el workspace y dejaré trazabilidad en actividad.",
  };
}

function streamSchemaProposalResponse(proposal: SchemaProposalPayload) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          formatSse({
            type: "delta",
            content:
              "Preparé una propuesta de esquema concreta para arrancar en modo database-first.",
          }),
        ),
      );
      controller.enqueue(encoder.encode(formatSse({ type: "schema_proposal", proposal })));
      controller.enqueue(encoder.encode(formatSse({ type: "done" })));
      controller.close();
    },
  });
  return new Response(stream, { headers: sseHeaders });
}

async function logSchemaProposalActivity(
  workspaceId: string,
  agentId: string | null,
  proposal: SchemaProposalPayload,
) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !agentId || !workspaceId) {
    return;
  }

  await supabase.from("agent_activity").insert({
    workspace_id: workspaceId,
    agent_id: agentId,
    action: "schema.proposed",
    details: {
      proposal_id: proposal.proposalId,
      title: proposal.title,
      objects: proposal.objects.map((entry) => ({
        name: entry.name,
        fields: entry.fields.length,
      })),
      source_prompt: proposal.sourcePrompt,
    },
  });
}

function extractDeltaText(parsed: Record<string, unknown>) {
  const choices = parsed.choices as
    | Array<{ delta?: { content?: string | unknown[] | null; reasoning?: string | null } }>
    | undefined;
  const messageChoices = parsed.choices as Array<{ message?: { content?: string } }> | undefined;
  const d0 = choices?.[0]?.delta;
  const deltaContent = d0?.content;
  if (typeof deltaContent === "string" && deltaContent.length > 0) {
    return deltaContent;
  }
  if (Array.isArray(deltaContent)) {
    const joined = deltaContent
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item && typeof (item as { text?: string }).text === "string") {
          return (item as { text: string }).text;
        }
        return "";
      })
      .join("");
    if (joined.length > 0) {
      return joined;
    }
  }
  const reasoning = d0?.reasoning;
  if (typeof reasoning === "string" && reasoning.length > 0) {
    return reasoning;
  }

  if (typeof parsed.delta === "string" && parsed.delta.length > 0) {
    return parsed.delta;
  }

  const deltaObj = parsed.delta;
  if (deltaObj && typeof deltaObj === "object") {
    const rec = deltaObj as Record<string, unknown>;
    const nested = rec.text ?? rec.content;
    if (typeof nested === "string" && nested.length > 0) {
      return nested;
    }
  }

  if (typeof parsed.output_text === "string" && parsed.output_text.length > 0) {
    return parsed.output_text;
  }

  const output = parsed.output as Array<{ content?: Array<{ text?: string }> }> | undefined;
  const outputText = output?.flatMap((item) => item.content ?? []).map((item) => item.text).find(Boolean);
  if (typeof outputText === "string" && outputText.length > 0) {
    return outputText;
  }

  const messageContent = messageChoices?.[0]?.message?.content;
  if (typeof messageContent === "string" && messageContent.length > 0) {
    return messageContent;
  }

  return "";
}

function extractErrorText(parsed: Record<string, unknown>) {
  const withError = parsed.error as { message?: string } | undefined;
  if (typeof withError?.message === "string" && withError.message.length > 0) {
    return withError.message;
  }

  if (parsed.type === "error" && typeof parsed.message === "string") {
    return parsed.message;
  }

  return "";
}

function isDonePayload(rawPayload: string, parsed: Record<string, unknown>) {
  if (rawPayload === "[DONE]") {
    return true;
  }

  const payloadType = typeof parsed.type === "string" ? parsed.type : "";
  return payloadType === "response.completed" || payloadType === "response.output_text.done";
}

function streamFromSseUpstream(upstream: Response) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.body?.getReader();
      if (!reader) {
        controller.enqueue(encoder.encode(formatSse({ type: "error", error: "No upstream stream available." })));
        controller.enqueue(encoder.encode(formatSse({ type: "done" })));
        controller.close();
        return;
      }

      let buffer = "";
      let sentDone = false;

      const emitDone = () => {
        if (sentDone) {
          return;
        }
        sentDone = true;
        controller.enqueue(encoder.encode(formatSse({ type: "done" })));
      };

      const flushPart = (part: string) => {
        const lines = part
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("data:"));

        for (const line of lines) {
          const payload = line.slice(5).trim();
          if (!payload) {
            continue;
          }

          if (payload === "[DONE]") {
            emitDone();
            continue;
          }

          try {
            const parsed = JSON.parse(payload) as Record<string, unknown>;
            const errorText = extractErrorText(parsed);
            if (errorText) {
              controller.enqueue(encoder.encode(formatSse({ type: "error", error: errorText })));
              continue;
            }

            if (isDonePayload(payload, parsed)) {
              emitDone();
              continue;
            }

            const delta = extractDeltaText(parsed);
            if (delta) {
              controller.enqueue(encoder.encode(formatSse({ type: "delta", content: delta })));
            }
          } catch {
            controller.enqueue(encoder.encode(formatSse({ type: "error", error: "No se pudo leer la respuesta del modelo." })));
          }
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          flushPart(part);
        }
      }

      if (buffer) {
        flushPart(buffer);
      }

      emitDone();
      controller.close();
    },
  });
}

async function streamFromJsonUpstream(upstream: Response) {
  const payload = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
  const text = payload ? extractDeltaText(payload) : "";

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const content = text || "No se recibio texto del agente.";
      controller.enqueue(encoder.encode(formatSse({ type: "delta", content })));
      controller.enqueue(encoder.encode(formatSse({ type: "done" })));
      controller.close();
    },
  });

  return new Response(stream, { headers: sseHeaders });
}

async function resolveWorkspaceContext(workspaceIdentifier?: string | null) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !workspaceIdentifier) {
    return null;
  }

  let workspaceId = workspaceIdentifier;
  let workspaceQuery = supabase
    .from("workspaces")
    .select("id, name, subdomain")
    .limit(1);

  if (/^[0-9a-fA-F-]{36}$/.test(workspaceIdentifier)) {
    workspaceQuery = workspaceQuery.eq("id", workspaceIdentifier);
  } else {
    workspaceQuery = workspaceQuery.eq("subdomain", workspaceIdentifier);
  }

  const { data: workspaceRow, error: workspaceError } = await workspaceQuery.maybeSingle();
  if (workspaceError) {
    throw new Error(workspaceError.message);
  }

  if (!workspaceRow) {
    return null;
  }

  workspaceId = String(workspaceRow.id);

  const [{ data: objectRows }, { data: agentRows }, { data: activityRows }] = await Promise.all([
    supabase
      .from("workspace_objects")
      .select("name")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    supabase
      .from("workspace_agents")
      .select("name, type, status")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    supabase
      .from("agent_activity")
      .select("action")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const objectNames = (objectRows ?? []).map((row) => String(row.name));
  const agentNames = (agentRows ?? []).map(
    (row) => `${String(row.name)} (${String(row.type)}, ${String(row.status)})`,
  );
  const recentActions = (activityRows ?? []).map((row) => String(row.action));

  return {
    workspaceId,
    workspaceName: String(workspaceRow.name),
    workspaceSlug: String(workspaceRow.subdomain),
    objectNames,
    agentNames,
    recentActions,
  };
}

async function resolveAgentRuntime(payload: ChatRequest) {
  const supabase = getSupabaseAdmin();
  const requestedAgentId = payload.agent_id ?? payload.agentId;
  const requestedWorkspaceId = payload.workspace_id ?? payload.workspaceId;

  if (!supabase || !requestedAgentId) {
    return null;
  }

  let scopedWorkspaceId = requestedWorkspaceId;

  if (requestedWorkspaceId && !/^[0-9a-fA-F-]{36}$/.test(requestedWorkspaceId)) {
    const { data: workspaceRow, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("subdomain", requestedWorkspaceId)
      .maybeSingle();

    if (workspaceError) {
      throw new Error(workspaceError.message);
    }

    scopedWorkspaceId = workspaceRow?.id ? String(workspaceRow.id) : requestedWorkspaceId;
  }

  let query = supabase
    .from("workspace_agents")
    .select("id, workspace_id, name, api_endpoint, api_key, status, soul_md, knowledge_scope")
    .eq("id", requestedAgentId)
    .limit(1);

  if (scopedWorkspaceId && /^[0-9a-fA-F-]{36}$/.test(scopedWorkspaceId)) {
    query = query.eq("workspace_id", scopedWorkspaceId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return data as AgentRuntimeRecord;
}

async function proxyToHermes({
  payload,
  baseUrl,
  apiKey,
  model,
  agent,
  workspaceContext,
}: {
  payload: ChatRequest & { message: string };
  baseUrl: string;
  apiKey: string;
  model?: string;
  agent?: AgentRuntimeRecord | null;
  workspaceContext?: {
    workspaceId: string;
    workspaceName: string;
    workspaceSlug: string;
    objectNames: string[];
    agentNames: string[];
    recentActions: string[];
  } | null;
}) {
  const appContext = payload.app_context ?? payload.appContext ?? null;
  const conversationId =
    payload.conversation_id ??
    payload.conversationId ??
    (agent ? `${agent.workspace_id}:${agent.id}` : process.env.HERMES_DEFAULT_CONVERSATION) ??
    undefined;

  const appContextLines =
    appContext
      ? [
          `Current UI tab: ${appContext.current_tab ?? "unknown"}`,
          `Current dataset: ${appContext.current_object ?? "none"}`,
          `Current view: ${appContext.current_view ?? "none"}`,
          `Current record: ${appContext.current_record_title ?? "none"}`,
          `Queue preview: ${appContext.queue_preview?.join(", ") || "none"}`,
        ]
      : [];

  const inputLines = [
    ...(workspaceContext
      ? [
          `Workspace context: ${workspaceContext.workspaceName} (${workspaceContext.workspaceSlug})`,
          `Workspace ID: ${workspaceContext.workspaceId}`,
          `Objects: ${workspaceContext.objectNames.join(", ") || "none"}`,
          `Agents: ${workspaceContext.agentNames.join(", ") || "none"}`,
          `Recent activity: ${workspaceContext.recentActions.join(", ") || "none"}`,
        ]
      : []),
    ...appContextLines,
    payload.message.trim(),
  ].filter((line) => line.length > 0);

  const requestBody: Record<string, unknown> = {
    input: inputLines.join("\n"),
    conversation: conversationId,
    stream: true,
    store: true,
    metadata: {
      ...(agent ? { agent_id: agent.id, workspace_id: agent.workspace_id, agent_name: agent.name } : {}),
      ...(payload.agent_id || payload.agentId ? { requested_agent_id: payload.agent_id ?? payload.agentId } : {}),
    },
  };

  if (model) {
    requestBody.model = model;
  }

  const hermesResponse = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!hermesResponse.ok || !hermesResponse.body) {
    const errorText = await hermesResponse.text();
    return Response.json({ error: errorText || "Unable to reach hErmes runtime." }, { status: 502 });
  }

  const contentType = hermesResponse.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    return new Response(streamFromSseUpstream(hermesResponse), { headers: sseHeaders });
  }

  return streamFromJsonUpstream(hermesResponse);
}

async function callHermes(payload: ChatRequest & { message: string }) {
  const agent = await resolveAgentRuntime(payload);
  if (agent) {
    const computedReadiness = evaluateAgentReadiness({
      apiEndpoint: agent.api_endpoint,
      apiKey: agent.api_key,
      soulMd: agent.soul_md,
    });
    const readiness = deriveReadinessFromKnowledgeScope(agent.knowledge_scope, computedReadiness);
    const blockReason = executionBlockReason(agent.status, readiness);
    if (blockReason) {
      return Response.json(
        {
          error: blockReason,
          readiness: {
            state: readiness.state,
            issues: readiness.issues,
          },
        },
        { status: 409 },
      );
    }
  }

  const workspaceContext = await resolveWorkspaceContext(payload.workspace_id ?? payload.workspaceId ?? null);

  const baseUrl = agent?.api_endpoint ?? process.env.HERMES_API_BASE_URL;
  const apiKey = agent?.api_key ?? process.env.HERMES_API_KEY;
  const model = agent ? undefined : process.env.HERMES_MODEL ?? undefined;

  if (!baseUrl || !apiKey) {
    return Response.json(
      { error: "HERMES_API_BASE_URL or HERMES_API_KEY is missing for hErmes mode." },
      { status: 500 },
    );
  }

  return proxyToHermes({ payload, baseUrl, apiKey, model, agent, workspaceContext });
}

async function authorizeWorkspaceRequest(payload: ChatRequest) {
  const requestedWorkspaceId = payload.workspace_id ?? payload.workspaceId;
  const requestedAgentId = payload.agent_id ?? payload.agentId;
  const requiresWorkspaceAccess = Boolean(requestedWorkspaceId || requestedAgentId);

  if (!requiresWorkspaceAccess) {
    return null;
  }

  const user = await getCurrentAppUser();
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membershipByWorkspaceId = new Map(memberships.map((entry) => [entry.workspaceId, entry]));
  const membershipBySlug = new Map(memberships.map((entry) => [entry.workspace.subdomain, entry]));

  if (requestedWorkspaceId) {
    const allowedMembership = membershipByWorkspaceId.get(requestedWorkspaceId) ?? membershipBySlug.get(requestedWorkspaceId);
    if (!allowedMembership) {
      return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
    }
  }

  if (requestedAgentId) {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return Response.json({ error: "Supabase admin client not configured." }, { status: 500 });
    }

    const { data: agentRow, error } = await supabase
      .from("workspace_agents")
      .select("id, workspace_id")
      .eq("id", requestedAgentId)
      .maybeSingle();

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (!agentRow) {
      return Response.json({ error: "Agent not found." }, { status: 404 });
    }

    if (!membershipByWorkspaceId.has(String(agentRow.workspace_id))) {
      return Response.json({ error: "You do not have access to this agent." }, { status: 403 });
    }
  }

  return null;
}

async function callOpenRouter(payload: ChatRequest & { message: string }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? "[REDACTED]";

  if (!apiKey) {
    return Response.json({ error: "OPENROUTER_API_KEY is missing for OpenRouter mode." }, { status: 500 });
  }

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: "system", content: defaultSystemPrompt },
        ...(payload.history ?? []).slice(-10).map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content,
        })),
        { role: "user", content: payload.message.trim() },
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errorText = await upstream.text();
    return Response.json(
      {
        error: errorText || "Unable to reach OpenRouter",
      },
      { status: 502 },
    );
  }

  return new Response(streamFromSseUpstream(upstream), { headers: sseHeaders });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as ChatRequest;
  const message = payload.message?.trim();
  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  const publicRateLimitFailure = enforcePublicChatRateLimit(request, payload);
  if (publicRateLimitFailure) {
    return publicRateLimitFailure;
  }

  const authorizationFailure = await authorizeWorkspaceRequest(payload);
  if (authorizationFailure) {
    return authorizationFailure;
  }

  const workspaceIdentifier = payload.workspace_id ?? payload.workspaceId ?? null;
  if (shouldProposeSchema(message, Boolean(workspaceIdentifier))) {
    const proposal = buildSchemaProposal(message);
    const workspaceContext = await resolveWorkspaceContext(workspaceIdentifier);
    await logSchemaProposalActivity(
      workspaceContext?.workspaceId ?? "",
      payload.agent_id ?? payload.agentId ?? null,
      proposal,
    );
    return streamSchemaProposalResponse(proposal);
  }

  const isWorkspaceScoped = Boolean(payload.workspace_id ?? payload.workspaceId ?? payload.agent_id ?? payload.agentId);
  if (isWorkspaceScoped) {
    return callHermes({ ...payload, message });
  }

  const provider = resolveProvider();
  if (provider === "hermes") {
    return callHermes({ ...payload, message });
  }

  return callOpenRouter({ ...payload, message });
}
