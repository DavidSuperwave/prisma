import { getCurrentAppUser, type AuthenticatedAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getWorkspaceMembershipForSlug,
  type PrismaCrmKind,
  type WorkspaceMembership,
} from "@/lib/workspaceStore";

export type ReportsAuthorization = {
  user: AuthenticatedAppUser;
  membership: WorkspaceMembership;
  workspaceId: string;
};

export type ReportsAuthorizationResult = ReportsAuthorization | { error: Response };

export async function authorizeReportsRead(workspaceSlug: string): Promise<ReportsAuthorizationResult> {
  const user = await getCurrentAppUser();
  if (!user) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const membership = await getWorkspaceMembershipForSlug(
    user.id,
    workspaceSlug,
    user.isPlatformAdmin,
  );
  if (!membership) {
    return {
      error: Response.json(
        { error: "You do not have access to this workspace." },
        { status: 403 },
      ),
    };
  }

  return { user, membership, workspaceId: membership.workspaceId };
}

export function requireSupabaseAdminReports() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return supabase;
}

export async function resolveCrmObjectId(
  supabase: ReturnType<typeof requireSupabaseAdminReports>,
  workspaceId: string,
  kind: PrismaCrmKind,
): Promise<string | null> {
  const { data } = await supabase
    .from("workspace_objects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("kind", kind)
    .maybeSingle();
  return data ? String(data.id) : null;
}

export type DateRangePreset = "7d" | "30d" | "90d" | "month" | "quarter" | "all";

export function parseDateRange(searchParams: URLSearchParams): {
  from: Date | null;
  to: Date;
  preset: DateRangePreset;
} {
  const presetParam = (searchParams.get("range") ?? "30d") as DateRangePreset;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const now = new Date();

  if (fromParam || toParam) {
    const from = fromParam ? new Date(fromParam) : null;
    const to = toParam ? new Date(toParam) : now;
    return { from: Number.isNaN(from?.getTime() ?? NaN) ? null : from, to, preset: presetParam };
  }

  const to = now;
  const from = new Date(now);
  switch (presetParam) {
    case "7d":
      from.setDate(from.getDate() - 7);
      return { from, to, preset: "7d" };
    case "90d":
      from.setDate(from.getDate() - 90);
      return { from, to, preset: "90d" };
    case "month":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to,
        preset: "month",
      };
    case "quarter": {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return {
        from: new Date(now.getFullYear(), quarterStartMonth, 1),
        to,
        preset: "quarter",
      };
    }
    case "all":
      return { from: null, to, preset: "all" };
    case "30d":
    default:
      from.setDate(from.getDate() - 30);
      return { from, to, preset: "30d" };
  }
}

export function daysBetween(a: Date, b: Date) {
  const ms = Math.abs(b.getTime() - a.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

export function startOfMonthUtc(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex, 1));
}

export function formatMonthKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
