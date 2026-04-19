import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getWorkspaceMembershipForSlug, listWorkspaceObjects } from "@/lib/workspaceStore";
import { computeFieldDiff, logRecordHistory } from "@/lib/recordHistory";
import { signProposal, verifyProposal } from "@/lib/agentTools/confirmToken";
import { evaluateFilter, normalizeFilterInput } from "@/lib/recordsQuery";
import { resolveObject } from "@/lib/objectResolver";
import { appendDocumentProvenance } from "@/lib/documents/provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ workspaceSlug: string }>;
};

type BulkBody = {
  action?: "update" | "delete";
  objectId?: string;
  objectSlug?: string;
  objectName?: string;
  recordIds?: string[];
  filter?: unknown;
  filters?: unknown;
  patch?: Record<string, unknown>;
  dryRun?: boolean;
  confirmToken?: string;
  actorAgentId?: string | null;
  limit?: number;
  sourceDocumentId?: string | null;
};

const MAX_SCAN = 5000;
const MAX_TARGETS = 500;

function requireSupabaseAdmin() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params;
    const user = await getCurrentAppUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    const membership = await getWorkspaceMembershipForSlug(
      user.id,
      workspaceSlug,
      user.isPlatformAdmin,
    );
    if (!membership) {
      return Response.json({ error: "You do not have access to this workspace." }, { status: 403 });
    }
    if (!user.isPlatformAdmin && membership.role === "viewer") {
      return Response.json({ error: "You do not have permission to modify records." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as BulkBody;
    const action = body.action;
    if (action !== "update" && action !== "delete") {
      return Response.json({ error: 'action must be "update" or "delete".' }, { status: 400 });
    }
    if (action === "update") {
      if (!body.patch || typeof body.patch !== "object" || Array.isArray(body.patch) || Object.keys(body.patch).length === 0) {
        return Response.json({ error: "patch object is required for update." }, { status: 400 });
      }
    }

    const dryRun = body.dryRun !== false;

    const objects = await listWorkspaceObjects(membership.workspaceId);
    const reference = body.objectId || body.objectSlug || body.objectName;
    const resolution = resolveObject(objects, reference);
    if (!resolution.ok) {
      return Response.json(
        {
          error: `No pude encontrar un objeto que coincida con "${reference ?? ""}". Revisa las sugerencias.`,
          reference: reference ?? null,
          suggestions: resolution.suggestions,
          availableObjects: objects.map((o) => ({ id: o.id, slug: o.slug, name: o.name })),
        },
        { status: 404 },
      );
    }
    const targetObject = resolution.object;
    const resolutionMeta =
      resolution.matched === "id" || resolution.matched === "slug" || resolution.matched === "exact"
        ? undefined
        : {
            matched: resolution.matched,
            reference: reference ?? null,
            resolvedTo: { id: targetObject.id, slug: targetObject.slug, name: targetObject.name },
            alternatives: resolution.suggestions,
          };

    const supabase = requireSupabaseAdmin();

    // Resolve targets by id list OR filter scan
    let targetRows: Array<{ id: string; data: Record<string, unknown> }> = [];
    if (Array.isArray(body.recordIds) && body.recordIds.length > 0) {
      const ids = body.recordIds.filter((x): x is string => typeof x === "string" && x.length > 0);
      if (ids.length === 0) {
        return Response.json({ error: "recordIds must contain at least one id." }, { status: 400 });
      }
      if (ids.length > MAX_TARGETS) {
        return Response.json({ error: `Too many recordIds (max ${MAX_TARGETS}).` }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("records")
        .select("id, data")
        .eq("workspace_id", membership.workspaceId)
        .eq("object_id", targetObject.id)
        .is("deleted_at", null)
        .in("id", ids);
      if (error) throw new Error(error.message);
      targetRows = (data ?? []).map((r) => ({
        id: String((r as { id: unknown }).id),
        data: ((r as { data?: unknown }).data ?? {}) as Record<string, unknown>,
      }));
    } else {
      const filter = normalizeFilterInput(body.filter ?? body.filters);
      if (!filter) {
        return Response.json({ error: "Provide recordIds[] or a filter." }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("records")
        .select("id, data")
        .eq("workspace_id", membership.workspaceId)
        .eq("object_id", targetObject.id)
        .is("deleted_at", null)
        .limit(MAX_SCAN);
      if (error) throw new Error(error.message);
      const rows = (data ?? []).map((r) => ({
        id: String((r as { id: unknown }).id),
        data: ((r as { data?: unknown }).data ?? {}) as Record<string, unknown>,
      }));
      targetRows = rows.filter((r) => evaluateFilter(filter, r.data));
      if (targetRows.length > MAX_TARGETS) {
        return Response.json(
          {
            error: `Filter matched ${targetRows.length} rows; refuse-to-commit limit is ${MAX_TARGETS}. Tighten the filter or pass recordIds.`,
            matched: targetRows.length,
          },
          { status: 400 },
        );
      }
    }

    if (targetRows.length === 0) {
      return Response.json({ error: "No records matched.", targets: [] }, { status: 404 });
    }

    const sourceDocumentId =
      typeof body.sourceDocumentId === "string" && body.sourceDocumentId.trim().length > 0
        ? body.sourceDocumentId.trim()
        : null;

    const proposal = buildProposal({
      action,
      objectId: targetObject.id,
      objectName: targetObject.name,
      patch: body.patch ?? null,
      targetRows,
      sourceDocumentId,
    });

    if (dryRun) {
      const token = signProposal(proposal);
      return Response.json({
        proposal,
        confirmToken: token.token,
        expiresAt: token.expiresAt,
        dryRun: true,
        resolution: resolutionMeta,
      });
    }

    // Commit path — verify token
    const verification = verifyProposal(body.confirmToken, proposal);
    if (!verification.ok) {
      return Response.json(
        {
          error: `Confirmation token invalid (${verification.reason}). Re-run with dryRun:true to get a fresh token.`,
        },
        { status: 409 },
      );
    }

    const nowIso = new Date().toISOString();
    const committed: Array<{ id: string; diff?: unknown }> = [];

    if (action === "update" && body.patch) {
      for (const row of targetRows) {
        const mergedBase: Record<string, unknown> = { ...row.data, ...body.patch };
        const merged = sourceDocumentId
          ? appendDocumentProvenance(mergedBase, sourceDocumentId, "records.bulk_update")
          : mergedBase;
        const { data: updated, error } = await supabase
          .from("records")
          .update({ data: merged })
          .eq("id", row.id)
          .eq("workspace_id", membership.workspaceId)
          .is("deleted_at", null)
          .select("id, data")
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!updated) continue;
        const newData = ((updated as { data?: unknown }).data ?? {}) as Record<string, unknown>;
        const diff = computeFieldDiff(row.data, newData);
        if (diff.length > 0) {
          await logRecordHistory({
            supabase,
            workspaceId: membership.workspaceId,
            objectId: targetObject.id,
            recordId: row.id,
            actor: { userId: user.id, agentId: body.actorAgentId ?? null },
            type: "record.updated",
            diff,
            subject: "Actualización masiva confirmada",
          });
        }
        committed.push({ id: row.id, diff });
      }
    } else if (action === "delete") {
      for (const row of targetRows) {
        const { error } = await supabase
          .from("records")
          .update({ deleted_at: nowIso })
          .eq("id", row.id)
          .eq("workspace_id", membership.workspaceId)
          .is("deleted_at", null);
        if (error) throw new Error(error.message);
        await logRecordHistory({
          supabase,
          workspaceId: membership.workspaceId,
          objectId: targetObject.id,
          recordId: row.id,
          actor: { userId: user.id, agentId: body.actorAgentId ?? null },
          type: "record.deleted",
          subject: "Eliminación masiva confirmada",
        });
        committed.push({ id: row.id });
      }
    }

    return Response.json({
      committed,
      count: committed.length,
      action,
      dryRun: false,
      resolution: resolutionMeta,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk operation failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}

function buildProposal(args: {
  action: "update" | "delete";
  objectId: string;
  objectName: string;
  patch: Record<string, unknown> | null;
  targetRows: Array<{ id: string; data: Record<string, unknown> }>;
  sourceDocumentId?: string | null;
}) {
  const { action, objectId, objectName, patch, targetRows, sourceDocumentId } = args;
  const sourceTag = sourceDocumentId ? ` (source: document ${sourceDocumentId})` : "";
  if (action === "update" && patch) {
    const diffs = targetRows.map((row) => {
      const after: Record<string, unknown> = { ...row.data, ...patch };
      const changes = computeFieldDiff(row.data, after);
      return { id: row.id, before: row.data, after, changes };
    });
    return {
      action: "records.bulk_update",
      objectId,
      objectName,
      patch,
      targets: diffs.map((d) => d.id),
      diff: diffs,
      summary: `Update ${targetRows.length} record${targetRows.length === 1 ? "" : "s"} in ${objectName}${sourceTag}.`,
      count: targetRows.length,
      ...(sourceDocumentId ? { sourceDocumentId } : {}),
    };
  }
  return {
    action: "records.bulk_delete",
    objectId,
    objectName,
    targets: targetRows.map((r) => r.id),
    diff: targetRows.map((r) => ({ id: r.id, before: r.data })),
    summary: `Soft-delete ${targetRows.length} record${targetRows.length === 1 ? "" : "s"} in ${objectName}${sourceTag}.`,
    count: targetRows.length,
    ...(sourceDocumentId ? { sourceDocumentId } : {}),
  };
}
