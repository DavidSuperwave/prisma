import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listWorkspaceMembershipsForUser } from "@/lib/workspaceStore";
import {
  applyWorkspaceSchemaProposal,
  bootstrapWorkspaceCrm,
  createWorkspaceDashboardPreset,
  type WorkspaceSchemaProposal,
} from "@/lib/workspaceActions";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type ActionRequest = {
  action?: "bootstrap-crm" | "create-dashboard" | "apply-schema-proposal" | "run-scenario";
  preset?: "operations" | "sales" | "crm" | "custom";
  proposal?: WorkspaceSchemaProposal;
  scenario?: {
    key?: "close-import" | "seasonal-analysis" | "quote-approval" | "calendar-scheduling";
    title?: string;
    sourceRecordId?: string | null;
    sourceObjectId?: string | null;
    dueAt?: string | null;
    metadata?: Record<string, unknown>;
  };
};

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
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

export async function POST(request: Request, context: Context) {
  const user = await getCurrentAppUser();
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { workspaceSlug } = await context.params;
  const memberships = await listWorkspaceMembershipsForUser(user.id, user.isPlatformAdmin);
  const membership = memberships.find((entry) => entry.workspace.subdomain === workspaceSlug);

  if (!membership) {
    return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as ActionRequest;
  const supabase = requireSupabaseAdmin();

  if (body.action === "bootstrap-crm") {
    const result = await bootstrapWorkspaceCrm(membership.workspaceId);
    const activityAgentId = await resolveActivityAgentId(membership.workspaceId);
    if (activityAgentId) {
      await supabase.from("agent_activity").insert({
        workspace_id: membership.workspaceId,
        agent_id: activityAgentId,
        action: "scenario.bootstrap_crm",
        details: {
          preset: "crm",
          created_by: user.id,
          objects: result.createdObjects,
        },
      });
    }
    return Response.json({ result }, { status: 201 });
  }

  if (body.action === "create-dashboard") {
    const preset = body.preset ?? "operations";
    const cards = await createWorkspaceDashboardPreset(membership.workspaceId, preset);
    const activityAgentId = await resolveActivityAgentId(membership.workspaceId);
    if (activityAgentId) {
      await supabase.from("agent_activity").insert({
        workspace_id: membership.workspaceId,
        agent_id: activityAgentId,
        action: "scenario.dashboard_preset_created",
        details: {
          preset,
          created_by: user.id,
        },
      });
    }
    return Response.json({ cards }, { status: 201 });
  }

  if (body.action === "apply-schema-proposal") {
    if (!user.isPlatformAdmin && membership.role !== "admin") {
      return Response.json({ error: "Only admins can apply schema proposals." }, { status: 403 });
    }
    if (!body.proposal || !Array.isArray(body.proposal.objects) || body.proposal.objects.length === 0) {
      return Response.json({ error: "A proposal with at least one object is required." }, { status: 400 });
    }

    const result = await applyWorkspaceSchemaProposal(membership.workspaceId, body.proposal, user.id);
    return Response.json({ result }, { status: 201 });
  }

  if (body.action === "run-scenario") {
    if (!user.isPlatformAdmin && membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to run scenarios." }, { status: 403 });
    }
    const scenarioKey = body.scenario?.key;
    const scenarioTitle = body.scenario?.title?.trim();
    if (!scenarioKey || !scenarioTitle) {
      return Response.json({ error: "scenario.key and scenario.title are required." }, { status: 400 });
    }

    const { data: task, error: taskError } = await supabase
      .from("workspace_tasks")
      .insert({
        workspace_id: membership.workspaceId,
        source_record_id: body.scenario?.sourceRecordId ?? null,
        source_object_id: body.scenario?.sourceObjectId ?? null,
        type: "scenario_action",
        title: scenarioTitle,
        status: "pending",
        priority: "high",
        due_at: body.scenario?.dueAt ?? null,
        approval_required: scenarioKey === "quote-approval",
        approval_status: scenarioKey === "quote-approval" ? "pending" : "not_required",
        metadata: {
          scenario_key: scenarioKey,
          ...(body.scenario?.metadata ?? {}),
        },
        created_by: user.id,
      })
      .select("id, status, approval_status")
      .single();

    if (taskError) {
      throw new Error(taskError.message);
    }

    const activityAgentId = await resolveActivityAgentId(membership.workspaceId);
    if (activityAgentId) {
      await supabase.from("agent_activity").insert({
        workspace_id: membership.workspaceId,
        agent_id: activityAgentId,
        action: "scenario.requested",
        details: {
          scenario_key: scenarioKey,
          title: scenarioTitle,
          task_id: String(task.id),
          created_by: user.id,
        },
      });
    }

    return Response.json(
      {
        task: {
          id: String(task.id),
          status: String(task.status),
          approvalStatus: String(task.approval_status ?? "not_required"),
        },
      },
      { status: 201 },
    );
  }

  return Response.json({ error: "Unsupported action." }, { status: 400 });
}
