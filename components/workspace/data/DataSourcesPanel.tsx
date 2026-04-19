"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Pill, Select, TextInput, Textarea } from "@/components/workspace/ui";

type Binding = {
  id: string;
  objectId: string;
  integrationId: string;
  label: string;
  direction: "pull" | "push" | "two_way";
  mode: "manual" | "on_demand" | "scheduled";
  cadence: string | null;
  mapping: Record<string, unknown>;
  matchKey: string | null;
  status: "active" | "paused" | "error";
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
};

type IntegrationOption = {
  slug: string;
  label: string;
  provider: string;
};

export type DataSourcesPanelProps = {
  workspaceSlug: string;
  objectId: string;
  objectName: string;
};

/**
 * Data Sources panel — lists the object<->integration bindings for a single
 * workspace object. Operators can pause/resume, run a binding on demand,
 * delete it, or add a new one. Adding a source here is optional: the same
 * bindings can be created by the agent via `bindings.create` in chat.
 */
export function DataSourcesPanel({ workspaceSlug, objectId, objectName }: DataSourcesPanelProps) {
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bindingsRes, integrationsRes] = await Promise.all([
        fetch(
          `/api/workspaces/${encodeURIComponent(workspaceSlug)}/bindings?objectId=${encodeURIComponent(objectId)}`,
        ),
        fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/integrations`),
      ]);
      if (!bindingsRes.ok) throw new Error("No pudimos cargar los data sources.");
      const bindingsBody = (await bindingsRes.json()) as { bindings?: Binding[] };
      setBindings(bindingsBody.bindings ?? []);
      if (integrationsRes.ok) {
        const integrationsBody = (await integrationsRes.json()) as {
          integrations?: Array<{ slug: string; label: string; provider: string; status?: string }>;
        };
        setIntegrations(
          (integrationsBody.integrations ?? [])
            .filter((i) => !i.status || i.status === "active")
            .map((i) => ({ slug: i.slug, label: i.label, provider: i.provider })),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, objectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runNow = async (bindingId: string) => {
    setBusyId(bindingId);
    try {
      const res = await fetch(`/api/agent-tools/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "bindings.run_now",
          args: { bindingId, dryRun: false },
          workspaceSlug,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || body.ok === false) {
        setError(body.error ?? "Falló la ejecución.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusyId(null);
      void load();
    }
  };

  const remove = async (bindingId: string) => {
    if (!confirm("¿Eliminar este data source?")) return;
    setBusyId(bindingId);
    try {
      await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/bindings/${encodeURIComponent(bindingId)}`,
        { method: "DELETE" },
      );
    } finally {
      setBusyId(null);
      void load();
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold">Data sources</h3>
          <p className="text-sm text-muted-foreground">
            Integraciones que alimentan o reciben registros de <strong>{objectName}</strong>.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? "default" : "primary"}>
          {showForm ? "Cancelar" : "Agregar fuente"}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive mb-3">{error}</p> : null}

      {showForm ? (
        <AddBindingForm
          integrations={integrations}
          onCancel={() => setShowForm(false)}
          onCreated={async () => {
            setShowForm(false);
            await load();
          }}
          workspaceSlug={workspaceSlug}
          objectId={objectId}
        />
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : bindings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay data sources configurados. Pídele al agente algo como
          «usa mi integración de Close para jalar leads a este objeto» o agrega uno manualmente arriba.
        </p>
      ) : (
        <ul className="space-y-2">
          {bindings.map((binding) => (
            <li key={binding.id} className="border rounded-lg p-3 flex flex-col gap-2 bg-background">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{binding.label}</span>
                <Pill tone={binding.status === "active" ? "success" : binding.status === "paused" ? "neutral" : "danger"}>
                  {binding.status}
                </Pill>
                <Pill tone="info">{binding.direction}</Pill>
                <Pill tone="neutral">{binding.mode}</Pill>
                {binding.cadence ? <Pill tone="neutral">cron: {binding.cadence}</Pill> : null}
                {binding.matchKey ? <Pill tone="neutral">match: {binding.matchKey}</Pill> : null}
              </div>
              <div className="text-xs text-muted-foreground">
                {binding.lastRunAt
                  ? `Última ejecución: ${new Date(binding.lastRunAt).toLocaleString()} (${binding.lastStatus ?? "—"})`
                  : "Nunca se ha ejecutado."}
                {binding.lastError ? ` — ${binding.lastError}` : ""}
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Ver mapping</summary>
                <pre className="mt-2 p-2 bg-muted rounded overflow-auto max-h-48">
                  {JSON.stringify(binding.mapping, null, 2)}
                </pre>
              </details>
              <div className="flex gap-2">
                <Button
                  compact
                  variant="default"
                  disabled={busyId === binding.id}
                  onClick={() => void runNow(binding.id)}
                >
                  {busyId === binding.id ? "Ejecutando…" : "Ejecutar ahora"}
                </Button>
                <Button
                  compact
                  variant="ghost"
                  disabled={busyId === binding.id}
                  onClick={() => void remove(binding.id)}
                >
                  Eliminar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type AddBindingFormProps = {
  workspaceSlug: string;
  objectId: string;
  integrations: IntegrationOption[];
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
};

function AddBindingForm({ workspaceSlug, objectId, integrations, onCancel, onCreated }: AddBindingFormProps) {
  const [integrationSlug, setIntegrationSlug] = useState(integrations[0]?.slug ?? "");
  const [direction, setDirection] = useState<"pull" | "push" | "two_way">("pull");
  const [mode, setMode] = useState<"manual" | "on_demand" | "scheduled">("on_demand");
  const [cadence, setCadence] = useState("0 * * * *");
  const [matchKey, setMatchKey] = useState("");
  const [label, setLabel] = useState("");
  const [mappingText, setMappingText] = useState(
    '{\n  "__path": "/",\n  "__method": "GET",\n  "id": "external_id"\n}',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!integrationSlug && integrations.length > 0) setIntegrationSlug(integrations[0].slug);
  }, [integrations, integrationSlug]);

  const canSubmit = useMemo(() => Boolean(integrationSlug) && mappingText.trim().length > 0, [integrationSlug, mappingText]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      let mapping: Record<string, unknown>;
      try {
        mapping = JSON.parse(mappingText);
      } catch {
        throw new Error("El mapping debe ser JSON válido.");
      }
      const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/bindings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          objectId,
          integrationSlug,
          direction,
          mode,
          cadence: mode === "scheduled" ? cadence : null,
          matchKey: matchKey || null,
          label: label || undefined,
          mapping,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "No pudimos crear el data source.");
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border rounded-lg p-3 mb-3 bg-muted/40 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Integración
          <Select value={integrationSlug} onChange={(event) => setIntegrationSlug(event.target.value)}>
            {integrations.length === 0 ? <option value="">No hay integraciones activas</option> : null}
            {integrations.map((i) => (
              <option key={i.slug} value={i.slug}>
                {i.label} ({i.provider})
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          Etiqueta (opcional)
          <TextInput value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Auto" />
        </label>
        <label className="text-sm">
          Dirección
          <Select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}>
            <option value="pull">pull</option>
            <option value="push">push</option>
            <option value="two_way">two_way</option>
          </Select>
        </label>
        <label className="text-sm">
          Modo
          <Select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
            <option value="manual">manual</option>
            <option value="on_demand">on_demand</option>
            <option value="scheduled">scheduled</option>
          </Select>
        </label>
        {mode === "scheduled" ? (
          <label className="text-sm">
            Cron
            <TextInput value={cadence} onChange={(event) => setCadence(event.target.value)} placeholder="0 * * * *" />
          </label>
        ) : null}
        <label className="text-sm">
          matchKey (campo local para deduplicar)
          <TextInput value={matchKey} onChange={(event) => setMatchKey(event.target.value)} placeholder="slug / email / external_id" />
        </label>
      </div>
      <label className="text-sm block">
        Mapping JSON
        <Textarea
          value={mappingText}
          onChange={(event) => setMappingText(event.target.value)}
          rows={8}
          className="font-mono text-xs"
        />
        <span className="text-xs text-muted-foreground">
          Incluye <code>__path</code> y <code>__method</code> como metadatos; el resto son pares <code>externalPath: localKey</code>.
        </span>
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={!canSubmit || submitting}>
          {submitting ? "Creando…" : "Crear data source"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
