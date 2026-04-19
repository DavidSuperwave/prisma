"use client";

/**
 * CMS sync panel for the vehicles object. Shows a live vs local diff between
 *   - the current inventory published on the client website (via cms.list_inventory)
 *   - the workspace `vehicles` records (the source of truth)
 *
 * Actions:
 *   Pull  -> cms.sync_inventory (upserts site vehicles into records)
 *   Push  -> cms.push_inventory (dryRun first, renders WriteProposalCard for confirm)
 *
 * The Push confirm flow reuses the same confirmToken contract used by chat
 * (WriteProposalCard), so the server-side HMAC path is identical.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Pill } from "@/components/workspace/ui";
import {
  WriteProposalCard,
  type WriteProposalPayload,
} from "@/components/workspace/chat/WriteProposalCard";

type Vehicle = {
  slug: string;
  brand: string;
  model: string;
  year?: number | string;
  price?: string;
  image?: string | null;
  [key: string]: unknown;
};

type Integration = {
  id: string;
  slug: string;
  provider: string;
  name?: string | null;
};

type DiffEntry = {
  slug: string;
  status: "only-local" | "only-remote" | "changed" | "same";
  localPrice?: string;
  remotePrice?: string;
  local?: Vehicle | null;
  remote?: Vehicle | null;
};

type Props = {
  workspaceSlug: string;
};

async function runTool(name: string, workspaceSlug: string, args: unknown) {
  const res = await fetch("/api/agent-tools/run", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, args, workspaceSlug }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: unknown;
    error?: string;
  };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json.data;
}

function normalizeVehicle(input: unknown): Vehicle | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const slug = typeof obj.slug === "string" ? obj.slug : "";
  if (!slug) return null;
  return {
    slug,
    brand: String(obj.brand ?? ""),
    model: String(obj.model ?? ""),
    year: obj.year as number | string | undefined,
    price: typeof obj.price === "string" ? obj.price : undefined,
    image: typeof obj.image === "string" ? obj.image : null,
    ...obj,
  };
}

function computeDiff(local: Vehicle[], remote: Vehicle[]): DiffEntry[] {
  const localBySlug = new Map(local.map((v) => [v.slug, v]));
  const remoteBySlug = new Map(remote.map((v) => [v.slug, v]));
  const slugs = new Set<string>([...localBySlug.keys(), ...remoteBySlug.keys()]);
  const entries: DiffEntry[] = [];
  for (const slug of slugs) {
    const l = localBySlug.get(slug) ?? null;
    const r = remoteBySlug.get(slug) ?? null;
    if (l && !r) entries.push({ slug, status: "only-local", local: l, localPrice: l.price });
    else if (!l && r)
      entries.push({ slug, status: "only-remote", remote: r, remotePrice: r.price });
    else if (l && r) {
      const changed =
        (l.price ?? "") !== (r.price ?? "") ||
        (l.image ?? "") !== (r.image ?? "") ||
        String(l.year ?? "") !== String(r.year ?? "") ||
        l.brand !== r.brand ||
        l.model !== r.model;
      entries.push({
        slug,
        status: changed ? "changed" : "same",
        local: l,
        remote: r,
        localPrice: l.price,
        remotePrice: r.price,
      });
    }
  }
  entries.sort((a, b) => {
    const order = { changed: 0, "only-local": 1, "only-remote": 2, same: 3 } as const;
    return order[a.status] - order[b.status] || a.slug.localeCompare(b.slug);
  });
  return entries;
}

export function CmsSyncPanel({ workspaceSlug }: Props) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [slug, setSlug] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<Vehicle[]>([]);
  const [remote, setRemote] = useState<Vehicle[]>([]);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  const [proposal, setProposal] = useState<{
    payload: WriteProposalPayload;
    confirmToken: string;
    expiresAt: string | null;
    op: "upsert" | "delete";
    slug: string;
    recordSelector: { recordIds?: string[]; slugs?: string[]; all?: boolean };
  } | null>(null);
  const [proposalState, setProposalState] = useState<"pending" | "confirmed" | "cancelled">("pending");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/workspaces/${encodeURIComponent(workspaceSlug)}/integrations`,
          { credentials: "include" },
        );
        const json = (await res.json()) as { integrations?: Integration[] };
        if (cancelled) return;
        const gb = (json.integrations ?? []).filter((i) => i.provider === "gb_automotriz_cms");
        setIntegrations(gb);
        if (gb.length > 0) setSlug(gb[0].slug);
      } catch {
        // leave list empty; user will see "no integrations".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  const loadDiff = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const [remoteData, localData] = await Promise.all([
        runTool("cms.list_inventory", workspaceSlug, { slug }),
        runTool("records.query", workspaceSlug, {
          object: "vehicles",
          limit: 500,
        }).catch(() => null),
      ]);

      const remoteVehicles = Array.isArray((remoteData as { vehicles?: unknown[] })?.vehicles)
        ? ((remoteData as { vehicles: unknown[] }).vehicles
            .map(normalizeVehicle)
            .filter(Boolean) as Vehicle[])
        : [];
      const records = (localData as { records?: Array<{ data?: unknown }> } | null)?.records ?? [];
      const localVehicles = records
        .map((r) => normalizeVehicle(r.data))
        .filter(Boolean) as Vehicle[];

      setRemote(remoteVehicles);
      setLocal(localVehicles);
      setLastFetchedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar el diff.");
    } finally {
      setLoading(false);
    }
  }, [slug, workspaceSlug]);

  const diff = useMemo(() => computeDiff(local, remote), [local, remote]);

  const handlePull = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      await runTool("cms.sync_inventory", workspaceSlug, { slug });
      await loadDiff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pull falló.");
    } finally {
      setLoading(false);
    }
  }, [slug, workspaceSlug, loadDiff]);

  const handlePushDryRun = useCallback(
    async (selector: { recordIds?: string[]; slugs?: string[]; all?: boolean }, op: "upsert" | "delete") => {
      if (!slug) return;
      setLoading(true);
      setError(null);
      try {
        const data = (await runTool("cms.push_inventory", workspaceSlug, {
          slug,
          op,
          ...selector,
          dryRun: true,
        })) as {
          proposal?: WriteProposalPayload;
          confirmToken?: string;
          expiresAt?: string | null;
        };
        if (!data?.proposal || !data.confirmToken) {
          throw new Error("Respuesta inválida de cms.push_inventory.");
        }
        setProposal({
          payload: data.proposal,
          confirmToken: data.confirmToken,
          expiresAt: data.expiresAt ?? null,
          op,
          slug,
          recordSelector: selector,
        });
        setProposalState("pending");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No pudimos proponer el push.");
      } finally {
        setLoading(false);
      }
    },
    [slug, workspaceSlug],
  );

  const handleConfirm = useCallback(async () => {
    if (!proposal) return;
    setLoading(true);
    setError(null);
    try {
      await runTool("cms.push_inventory", workspaceSlug, {
        slug: proposal.slug,
        op: proposal.op,
        ...proposal.recordSelector,
        dryRun: false,
        confirmToken: proposal.confirmToken,
      });
      setProposalState("confirmed");
      await loadDiff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Push falló.");
      setProposalState("pending");
    } finally {
      setLoading(false);
    }
  }, [proposal, workspaceSlug, loadDiff]);

  const handleCancel = useCallback(() => {
    setProposalState("cancelled");
    setTimeout(() => setProposal(null), 400);
  }, []);

  const changedSlugs = diff.filter((d) => d.status === "changed").map((d) => d.slug);
  const onlyLocalSlugs = diff.filter((d) => d.status === "only-local").map((d) => d.slug);
  const onlyRemoteSlugs = diff.filter((d) => d.status === "only-remote").map((d) => d.slug);

  if (integrations.length === 0) {
    return (
      <Card>
        <div style={{ padding: 12, fontSize: 13, color: "#6b7280" }}>
          No hay integración <code>gb_automotriz_cms</code> conectada. Pide al agente:
          <br />
          <em>&quot;Conecta mi sitio gb-automotriz con baseUrl X y sharedSecret Y&quot;</em>.
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "#475569" }}>Integración</label>
            <select
              className="ws-input"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              style={{ maxWidth: 220 }}
            >
              {integrations.map((integ) => (
                <option key={integ.id} value={integ.slug}>
                  {integ.name ?? integ.slug}
                </option>
              ))}
            </select>
            <Button variant="default" onClick={() => void loadDiff()} disabled={loading || !slug}>
              {loading ? "Cargando…" : "Recalcular diff"}
            </Button>
            <Button variant="default" onClick={() => void handlePull()} disabled={loading || !slug}>
              Pull del sitio
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                void handlePushDryRun(
                  changedSlugs.length + onlyLocalSlugs.length > 0
                    ? { slugs: [...changedSlugs, ...onlyLocalSlugs] }
                    : { all: true },
                  "upsert",
                )
              }
              disabled={loading || !slug || (changedSlugs.length + onlyLocalSlugs.length === 0 && local.length === 0)}
            >
              Push cambios
            </Button>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#475569", flexWrap: "wrap" }}>
            <Pill tone="success">Locales: {local.length}</Pill>
            <Pill tone="neutral">Sitio: {remote.length}</Pill>
            <Pill tone="warning">Cambios: {changedSlugs.length}</Pill>
            <Pill tone="warning">Solo local: {onlyLocalSlugs.length}</Pill>
            <Pill tone="warning">Solo sitio: {onlyRemoteSlugs.length}</Pill>
            {lastFetchedAt ? (
              <span>· última lectura {new Date(lastFetchedAt).toLocaleTimeString("es-MX")}</span>
            ) : null}
          </div>
          {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div> : null}
        </div>
      </Card>

      {proposal ? (
        <WriteProposalCard
          toolName="cms.push_inventory"
          proposal={proposal.payload}
          confirmToken={proposal.confirmToken}
          expiresAt={proposal.expiresAt}
          state={proposalState}
          onConfirm={() => void handleConfirm()}
          onCancel={() => handleCancel()}
        />
      ) : null}

      <Card>
        <div style={{ padding: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "6px 8px" }}>Slug</th>
                <th style={{ padding: "6px 8px" }}>Estado</th>
                <th style={{ padding: "6px 8px" }}>Local</th>
                <th style={{ padding: "6px 8px" }}>Sitio</th>
                <th style={{ padding: "6px 8px" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {diff.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 16, color: "#6b7280" }}>
                    {loading ? "Cargando…" : "Pulsa \"Recalcular diff\" para comparar."}
                  </td>
                </tr>
              ) : (
                diff.map((entry) => (
                  <tr
                    key={entry.slug}
                    style={{ borderTop: "1px solid var(--ws-border, #e5e7eb)", verticalAlign: "top" }}
                  >
                    <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      {entry.slug}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <Pill
                        tone={
                          entry.status === "same"
                            ? "success"
                            : entry.status === "changed"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {entry.status}
                      </Pill>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      {entry.local ? `${entry.local.brand} ${entry.local.model} · ${entry.localPrice ?? "—"}` : "—"}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      {entry.remote ? `${entry.remote.brand} ${entry.remote.model} · ${entry.remotePrice ?? "—"}` : "—"}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      {entry.status === "changed" || entry.status === "only-local" ? (
                        <Button
                          compact
                          variant="default"
                          onClick={() =>
                            void handlePushDryRun({ slugs: [entry.slug] }, "upsert")
                          }
                          disabled={loading}
                        >
                          Push
                        </Button>
                      ) : entry.status === "only-remote" ? (
                        <Button
                          compact
                          variant="ghost"
                          onClick={() => void handlePull()}
                          disabled={loading}
                        >
                          Pull
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
