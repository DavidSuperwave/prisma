"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Pill, Select, TextInput, Textarea } from "@/components/workspace/ui";

type ProviderSpec = {
  provider: string;
  label: string;
  authType: string;
  secretKeys: string[];
  configKeys: string[];
};

type IntegrationRow = {
  id: string;
  slug: string;
  label: string;
  provider: string;
  authType: string;
  status: "active" | "paused" | "error";
  config: Record<string, unknown>;
  hasSecrets: boolean;
  createdAt: string;
  updatedAt: string;
};

type RecipeRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  method: string;
  pathTemplate: string;
  successCount: number;
  lastUsedAt: string | null;
  updatedAt: string;
};

type Props = {
  workspaceSlug: string;
};

export function IntegrationsManager({ workspaceSlug }: Props) {
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [providers, setProviders] = useState<ProviderSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [label, setLabel] = useState("");
  const [configJson, setConfigJson] = useState("{}");
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; status: number; preview: string | null; error?: string | null }>>({});
  const [recipesByIntegration, setRecipesByIntegration] = useState<Record<string, RecipeRow[]>>({});
  const [expandedRecipes, setExpandedRecipes] = useState<Record<string, boolean>>({});

  const activeProviderSpec = useMemo(
    () => providers.find((p) => p.provider === selectedProvider) ?? null,
    [providers, selectedProvider],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/integrations`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { integrations: IntegrationRow[]; providers: ProviderSpec[] };
      setIntegrations(data.integrations ?? []);
      setProviders(data.providers ?? []);
      if (!selectedProvider && data.providers?.[0]) setSelectedProvider(data.providers[0].provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, selectedProvider]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setLabel("");
    setConfigJson("{}");
    setSecretValues({});
    setError(null);
  };

  const handleCreate = async () => {
    if (!activeProviderSpec) return;
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    let config: Record<string, unknown> = {};
    try {
      const parsed = configJson.trim() ? JSON.parse(configJson) : {};
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Config must be a JSON object.");
      }
      config = parsed as Record<string, unknown>;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid config JSON.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/integrations`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: activeProviderSpec.provider,
          label: label.trim(),
          config,
          secrets: secretValues,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error((errJson as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      resetForm();
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create integration");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this integration? Stored credentials will be removed.")) return;
    await fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/integrations/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  };

  const loadRecipes = useCallback(
    async (integrationId: string) => {
      try {
        const res = await fetch(
          `/api/workspaces/${encodeURIComponent(workspaceSlug)}/integrations/${integrationId}/recipes`,
          { credentials: "include" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { recipes?: RecipeRow[] };
        setRecipesByIntegration((prev) => ({ ...prev, [integrationId]: data.recipes ?? [] }));
      } catch {
        // ignore — recipes are an enhancement
      }
    },
    [workspaceSlug],
  );

  // Preload recipe counts once integrations load.
  useEffect(() => {
    for (const integration of integrations) {
      if (recipesByIntegration[integration.id] === undefined) {
        void loadRecipes(integration.id);
      }
    }
  }, [integrations, loadRecipes, recipesByIntegration]);

  const toggleRecipes = (integrationId: string) => {
    setExpandedRecipes((prev) => ({ ...prev, [integrationId]: !prev[integrationId] }));
    if (recipesByIntegration[integrationId] === undefined) {
      void loadRecipes(integrationId);
    }
  };

  const handleDeleteRecipe = async (integrationId: string, recipeId: string) => {
    if (!confirm("Delete this recipe? The agent will no longer be able to reuse it.")) return;
    await fetch(
      `/api/workspaces/${encodeURIComponent(workspaceSlug)}/integrations/${integrationId}/recipes`,
      {
        method: "DELETE",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipeId }),
      },
    );
    await loadRecipes(integrationId);
  };

  const handleTest = async (id: string) => {
    const res = await fetch(
      `/api/workspaces/${encodeURIComponent(workspaceSlug)}/integrations/${id}/test`,
      { method: "POST", credentials: "include" },
    );
    const data = await res.json().catch(() => ({}));
    setTestResults((prev) => ({
      ...prev,
      [id]: {
        ok: Boolean((data as { ok?: boolean }).ok),
        status: Number((data as { status?: number }).status ?? 0),
        preview: (data as { preview?: string | null }).preview ?? null,
        error: (data as { error?: string | null }).error ?? null,
      },
    }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Integrations</h1>
          <p style={{ color: "var(--ws-muted, #6b7280)", margin: "4px 0 0", fontSize: 13 }}>
            Connect 3rd-party APIs the agent can use. Credentials are encrypted at rest.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Add integration"}
        </Button>
      </div>

      {showForm ? (
        <Card>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>Provider</span>
                <Select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)}>
                  {providers.map((p) => (
                    <option key={p.provider} value={p.provider}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>Label</span>
                <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Close production" />
              </label>
            </div>

            {activeProviderSpec?.secretKeys.map((keyName) => (
              <label key={keyName} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{keyName}</span>
                <TextInput
                  type="password"
                  autoComplete="new-password"
                  value={secretValues[keyName] ?? ""}
                  onChange={(e) => setSecretValues((prev) => ({ ...prev, [keyName]: e.target.value }))}
                  placeholder={`Enter ${keyName}`}
                />
              </label>
            ))}

            {(activeProviderSpec?.configKeys.length ?? 0) > 0 ? (
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>
                  Config JSON (keys: {activeProviderSpec?.configKeys.join(", ")})
                </span>
                <Textarea rows={4} value={configJson} onChange={(e) => setConfigJson(e.target.value)} />
              </label>
            ) : null}

            {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}

            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="primary" onClick={handleCreate} disabled={submitting}>
                {submitting ? "Saving..." : "Save integration"}
              </Button>
              <Button onClick={() => { resetForm(); setShowForm(false); }}>Cancel</Button>
            </div>
          </div>
        </Card>
      ) : null}

      {loading ? (
        <div style={{ color: "var(--ws-muted, #6b7280)" }}>Loading...</div>
      ) : integrations.length === 0 ? (
        <Card>
          <div style={{ padding: 24, textAlign: "center", color: "var(--ws-muted, #6b7280)" }}>
            No integrations yet. Add one to let the agent call external APIs.
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {integrations.map((integration) => {
            const test = testResults[integration.id];
            const recipes = recipesByIntegration[integration.id];
            const recipeCount = recipes?.length ?? 0;
            const isExpanded = Boolean(expandedRecipes[integration.id]);
            return (
              <Card key={integration.id}>
                <div style={{ padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, flexWrap: "wrap" }}>
                      <span>{integration.label}</span>
                      <Pill tone={integration.status === "active" ? "success" : integration.status === "paused" ? "warning" : "danger"}>
                        {integration.status}
                      </Pill>
                      <Pill tone="info">{integration.provider}</Pill>
                      {integration.hasSecrets ? <Pill tone="info">credentials stored</Pill> : <Pill tone="warning">no credentials</Pill>}
                      {recipes !== undefined ? (
                        <Pill tone={recipeCount > 0 ? "info" : "warning"}>
                          {recipeCount} {recipeCount === 1 ? "recipe" : "recipes"}
                        </Pill>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ws-muted, #6b7280)", marginTop: 4 }}>
                      slug: <code>{integration.slug}</code>
                    </div>
                    {test ? (
                      <div style={{ fontSize: 12, marginTop: 6, color: test.ok ? "#047857" : "#b91c1c" }}>
                        Test: {test.ok ? "OK" : "FAIL"} ({test.status}){test.error ? ` — ${test.error}` : ""}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button compact onClick={() => toggleRecipes(integration.id)}>
                      {isExpanded ? "Hide recipes" : "Recipes"}
                    </Button>
                    <Button compact onClick={() => handleTest(integration.id)}>Test</Button>
                    <Button compact variant="danger" onClick={() => handleDelete(integration.id)}>Delete</Button>
                  </div>
                </div>
                {isExpanded ? (
                  <div style={{ padding: "0 12px 12px", borderTop: "1px solid var(--workspace-border, #e5e7eb)" }}>
                    {recipes === undefined ? (
                      <div style={{ fontSize: 12, color: "var(--ws-muted, #6b7280)", padding: 8 }}>Loading...</div>
                    ) : recipes.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--ws-muted, #6b7280)", padding: 8 }}>
                        No recipes yet. Ask the chat agent to probe this API and save a recipe.
                      </div>
                    ) : (
                      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                        {recipes.map((recipe) => (
                          <li
                            key={recipe.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "6px 8px",
                              border: "1px solid var(--workspace-border, #e5e7eb)",
                              borderRadius: 6,
                              background: "#fff",
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{recipe.name}</div>
                              <div style={{ fontSize: 11, color: "var(--ws-muted, #6b7280)", fontFamily: "ui-monospace, monospace" }}>
                                {recipe.method} {recipe.pathTemplate}
                              </div>
                              {recipe.description ? (
                                <div style={{ fontSize: 12, color: "var(--ws-muted, #6b7280)", marginTop: 2 }}>{recipe.description}</div>
                              ) : null}
                              <div style={{ fontSize: 11, color: "var(--ws-muted, #6b7280)", marginTop: 2 }}>
                                slug: <code>{recipe.slug}</code> · {recipe.successCount} successes
                                {recipe.lastUsedAt ? ` · last used ${new Date(recipe.lastUsedAt).toLocaleString()}` : ""}
                              </div>
                            </div>
                            <Button compact variant="danger" onClick={() => handleDeleteRecipe(integration.id, recipe.id)}>
                              Delete
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
