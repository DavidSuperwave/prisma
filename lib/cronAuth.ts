/**
 * Authorize a Vercel Cron (or manual) invocation of an internal cron route.
 *
 * Accepts either:
 *   - `Authorization: Bearer <CRON_SECRET>` header (recommended)
 *   - Vercel cron: `x-vercel-cron: 1` (platform-signed request)
 *
 * Falls through (allows) when no `CRON_SECRET` is configured, so existing
 * dev setups keep working.
 */
export function authorizeCronRequest(request: Request): { ok: true } | { ok: false; response: Response } {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return { ok: true };
  }
  const headers = request.headers;
  const auth = headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) {
    return { ok: true };
  }
  if (headers.get("x-vercel-cron") === "1") {
    return { ok: true };
  }
  return {
    ok: false,
    response: Response.json({ error: "Unauthorized cron invocation." }, { status: 401 }),
  };
}
