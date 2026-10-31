"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Button, Card, Pill, TextInput, Textarea } from "@/components/workspace/ui";

type BuiltInSkill = {
  slug: string;
  title: string;
  description: string;
  enabled: boolean;
};

type LocalSkill = {
  slug: string;
  title: string;
  description: string;
  promoted: boolean;
};

type WorkflowRow = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: { type?: string; schedule?: string } | null;
  updatedAt: string;
};

type GatewayConfig = {
  enabled: boolean;
  allowedUsers: string[];
};

type Props = {
  workspaceSlug: string;
};

export function HermesOpsPanel({ workspaceSlug }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [builtInSkills, setBuiltInSkills] = useState<BuiltInSkill[]>([]);
  const [localSkills, setLocalSkills] = useState<LocalSkill[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig>({ enabled: false, allowedUsers: [] });

  const [newSkillSlug, setNewSkillSlug] = useState("");
  const [newSkillTitle, setNewSkillTitle] = useState("");
  const [newSkillDescription, setNewSkillDescription] = useState("");

  const [schedulePrompt, setSchedulePrompt] = useState("");
  const [scheduleCron, setScheduleCron] = useState("*/15 * * * *");
  const [scheduleTargetAgentId, setScheduleTargetAgentId] = useState("");
  const [scheduleSkillsCsv, setScheduleSkillsCsv] = useState("");
  const [scheduleDeliverTo, setScheduleDeliverTo] = useState("");

  const [gatewayEnabled, setGatewayEnabled] = useState(false);
  const [gatewayAllowedUsersCsv, setGatewayAllowedUsersCsv] = useState("");

  const [wizardVendorName, setWizardVendorName] = useState("");
  const [wizardDocsUrl, setWizardDocsUrl] = useState("");
  const [wizardApiKey, setWizardApiKey] = useState("");

  const activeBuiltInCount = useMemo(() => builtInSkills.filter((entry) => entry.enabled).length, [builtInSkills]);
  const activeWorkflowsCount = useMemo(() => workflows.filter((entry) => entry.enabled).length, [workflows]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [skillsRes, workflowsRes, gatewayRes] = await Promise.all([
        fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/skills`, { credentials: "include" }),
        fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/workflows`, { credentials: "include" }),
        fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/gateway/native`, { credentials: "include" }),
      ]);

      const skillsJson = (await skillsRes.json().catch(() => ({}))) as {
        builtIn?: BuiltInSkill[];
        local?: LocalSkill[];
        error?: string;
      };
      if (!skillsRes.ok) {
        throw new Error(skillsJson.error ?? `Failed to load skills (${skillsRes.status})`);
      }
      setBuiltInSkills(Array.isArray(skillsJson.builtIn) ? skillsJson.builtIn : []);
      setLocalSkills(Array.isArray(skillsJson.local) ? skillsJson.local : []);

      const workflowsJson = (await workflowsRes.json().catch(() => ({}))) as {
        workflows?: WorkflowRow[];
      };
      setWorkflows(Array.isArray(workflowsJson.workflows) ? workflowsJson.workflows : []);

      const gatewayJson = (await gatewayRes.json().catch(() => ({}))) as GatewayConfig & { error?: string };
      if (gatewayRes.ok) {
        setGatewayConfig({
          enabled: gatewayJson.enabled === true,
          allowedUsers: Array.isArray(gatewayJson.allowedUsers) ? gatewayJson.allowedUsers : [],
        });
        setGatewayEnabled(gatewayJson.enabled === true);
        setGatewayAllowedUsersCsv(
          Array.isArray(gatewayJson.allowedUsers) ? gatewayJson.allowedUsers.join(", ") : "",
        );
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load Hermes settings.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function mutateSkills(payload: Record<string, unknown>) {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/skills`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(json.error ?? `Skills action failed (${response.status})`);
  }

  async function createLocalSkill() {
    const slug = newSkillSlug.trim();
    if (!slug) throw new Error("Skill slug is required.");
    await mutateSkills({
      action: "create_local",
      slug,
      title: newSkillTitle.trim() || slug,
      description: newSkillDescription.trim() || "Workspace-local Hermes skill",
    });
    setNewSkillSlug("");
    setNewSkillTitle("");
    setNewSkillDescription("");
    setSuccess("Local skill created.");
  }

  async function toggleWorkflowEnabled(workflowId: string, enabled: boolean) {
    const response = await fetch(
      `/api/workspaces/${encodeURIComponent(workspaceSlug)}/workflows/${encodeURIComponent(workflowId)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      },
    );
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(json.error ?? `Workflow update failed (${response.status})`);
    setSuccess(enabled ? "Automation resumed." : "Automation paused.");
  }

  async function runWorkflowNow(workflowId: string) {
    const response = await fetch(
      `/api/workspaces/${encodeURIComponent(workspaceSlug)}/workflows/${encodeURIComponent(workflowId)}/runs`,
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(json.error ?? `Run-now failed (${response.status})`);
    setSuccess("Automation run queued.");
  }

  async function createScheduledAutomation() {
    const prompt = schedulePrompt.trim();
    const cron = scheduleCron.trim();
    const targetAgentId = scheduleTargetAgentId.trim();
    if (!prompt || !cron || !targetAgentId) {
      throw new Error("Prompt, cron, and target agent ID are required.");
    }
    const attachedSkills = scheduleSkillsCsv
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const response = await fetch(
      `/api/workspaces/${encodeURIComponent(workspaceSlug)}/automations/schedule`,
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          cron,
          targetAgentId,
          attachedSkills,
          deliverTo: scheduleDeliverTo.trim() || undefined,
        }),
      },
    );
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(json.error ?? `Automation scheduling failed (${response.status})`);
    setSuccess("Automation scheduled.");
    setSchedulePrompt("");
  }

  async function saveGatewayConfig() {
    const allowedUsers = gatewayAllowedUsersCsv
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const response = await fetch(
      `/api/workspaces/${encodeURIComponent(workspaceSlug)}/gateway/native`,
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: gatewayEnabled,
          allowedUsers,
        }),
      },
    );
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(json.error ?? `Gateway update failed (${response.status})`);
    setSuccess("Native gateway settings saved.");
  }

  async function runIntegrationWizard() {
    if (!wizardVendorName.trim() || !wizardApiKey.trim()) {
      throw new Error("Vendor name and API key are required.");
    }
    const response = await fetch(
      `/api/workspaces/${encodeURIComponent(workspaceSlug)}/integrations/wizard`,
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendorName: wizardVendorName.trim(),
          docsUrl: wizardDocsUrl.trim() || undefined,
          apiKey: wizardApiKey.trim(),
        }),
      },
    );
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(json.error ?? `Wizard failed (${response.status})`);
    setSuccess("Integration wizard completed.");
    setWizardApiKey("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Skills</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ws-muted, #6b7280)" }}>
              Built-in active: {activeBuiltInCount}/{builtInSkills.length} · Local: {localSkills.length}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <strong style={{ fontSize: 13 }}>Built-in tap skills</strong>
              {builtInSkills.map((skill) => (
                <div key={skill.slug} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={rowTitleStyle}>{skill.slug}</div>
                    <div style={rowMetaStyle}>{skill.description}</div>
                  </div>
                  <Pill tone={skill.enabled ? "success" : "warning"}>{skill.enabled ? "enabled" : "disabled"}</Pill>
                  <Button
                    compact
                    onClick={() =>
                      void runAction(async () => {
                        await mutateSkills({
                          action: "toggle_builtin",
                          slug: skill.slug,
                          enabled: !skill.enabled,
                        });
                        setSuccess(skill.enabled ? "Built-in skill disabled." : "Built-in skill enabled.");
                      })
                    }
                    disabled={busy}
                  >
                    {skill.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    compact
                    onClick={() =>
                      void runAction(async () => {
                        await mutateSkills({
                          action: "fork_builtin",
                          sourceSlug: skill.slug,
                          slug: `${skill.slug}-fork`,
                        });
                        setSuccess("Built-in skill forked to local.");
                      })
                    }
                    disabled={busy}
                  >
                    Fork
                  </Button>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <strong style={{ fontSize: 13 }}>Local skills</strong>
              {localSkills.length === 0 ? (
                <p style={emptyCopyStyle}>No local skills yet.</p>
              ) : (
                localSkills.map((skill) => (
                  <div key={skill.slug} style={rowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={rowTitleStyle}>{skill.slug}</div>
                      <div style={rowMetaStyle}>{skill.description}</div>
                    </div>
                    <Pill tone={skill.promoted ? "info" : "warning"}>{skill.promoted ? "promoted" : "local"}</Pill>
                    <Button
                      compact
                      onClick={() =>
                        void runAction(async () => {
                          await mutateSkills({
                            action: skill.promoted ? "unpromote_local" : "promote_local",
                            slug: skill.slug,
                          });
                          setSuccess(skill.promoted ? "Local skill unpromoted." : "Local skill promoted.");
                        })
                      }
                      disabled={busy}
                    >
                      {skill.promoted ? "Unpromote" : "Promote"}
                    </Button>
                    <Button
                      compact
                      variant="danger"
                      onClick={() =>
                        void runAction(async () => {
                          await mutateSkills({
                            action: "delete_local",
                            slug: skill.slug,
                          });
                          setSuccess("Local skill deleted.");
                        })
                      }
                      disabled={busy}
                    >
                      Delete
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--workspace-border, #e5e7eb)", paddingTop: 12, display: "grid", gap: 8 }}>
            <strong style={{ fontSize: 13 }}>Create local skill</strong>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <TextInput value={newSkillSlug} onChange={(event) => setNewSkillSlug(event.target.value)} placeholder="integrations/vendor" />
              <TextInput value={newSkillTitle} onChange={(event) => setNewSkillTitle(event.target.value)} placeholder="Title (optional)" />
            </div>
            <Textarea
              rows={2}
              value={newSkillDescription}
              onChange={(event) => setNewSkillDescription(event.target.value)}
              placeholder="What this skill does..."
            />
            <div>
              <Button variant="primary" onClick={() => void runAction(createLocalSkill)} disabled={busy}>
                Create local skill
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Automations</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ws-muted, #6b7280)" }}>
              Active: {activeWorkflowsCount}/{workflows.length}
            </p>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <strong style={{ fontSize: 13 }}>Schedule agent automation</strong>
            <Textarea
              rows={3}
              value={schedulePrompt}
              onChange={(event) => setSchedulePrompt(event.target.value)}
              placeholder="Prompt executed by the target agent on each run..."
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              <TextInput value={scheduleCron} onChange={(event) => setScheduleCron(event.target.value)} placeholder="*/15 * * * *" />
              <TextInput
                value={scheduleTargetAgentId}
                onChange={(event) => setScheduleTargetAgentId(event.target.value)}
                placeholder="target agent id"
              />
              <TextInput
                value={scheduleDeliverTo}
                onChange={(event) => setScheduleDeliverTo(event.target.value)}
                placeholder="deliver_to (optional)"
              />
            </div>
            <TextInput
              value={scheduleSkillsCsv}
              onChange={(event) => setScheduleSkillsCsv(event.target.value)}
              placeholder="attached skills CSV (optional)"
            />
            <div>
              <Button variant="primary" onClick={() => void runAction(createScheduledAutomation)} disabled={busy}>
                Schedule automation
              </Button>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--workspace-border, #e5e7eb)", paddingTop: 12, display: "grid", gap: 8 }}>
            <strong style={{ fontSize: 13 }}>Existing automations</strong>
            {workflows.length === 0 ? (
              <p style={emptyCopyStyle}>No workflows yet.</p>
            ) : (
              workflows.map((workflow) => (
                <div key={workflow.id} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={rowTitleStyle}>{workflow.name}</div>
                    <div style={rowMetaStyle}>
                      {workflow.trigger?.type ?? "unknown"}
                      {workflow.trigger?.schedule ? ` · ${workflow.trigger.schedule}` : ""}
                    </div>
                  </div>
                  <Pill tone={workflow.enabled ? "success" : "warning"}>
                    {workflow.enabled ? "active" : "paused"}
                  </Pill>
                  <Button
                    compact
                    onClick={() => void runAction(() => toggleWorkflowEnabled(workflow.id, !workflow.enabled))}
                    disabled={busy}
                  >
                    {workflow.enabled ? "Pause" : "Resume"}
                  </Button>
                  <Button compact onClick={() => void runAction(() => runWorkflowNow(workflow.id))} disabled={busy}>
                    Run now
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 16, display: "grid", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Connect an Integration (Wizard)</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ws-muted, #6b7280)" }}>
              Scaffolds a skill and projects credentials into workspace HERMES_HOME.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <TextInput value={wizardVendorName} onChange={(event) => setWizardVendorName(event.target.value)} placeholder="Vendor name" />
            <TextInput value={wizardDocsUrl} onChange={(event) => setWizardDocsUrl(event.target.value)} placeholder="Docs URL (optional)" />
          </div>
          <TextInput type="password" value={wizardApiKey} onChange={(event) => setWizardApiKey(event.target.value)} placeholder="API key" />
          <div>
            <Button variant="primary" onClick={() => void runAction(runIntegrationWizard)} disabled={busy}>
              Run integration wizard
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 16, display: "grid", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Native Gateway (Opt-in)</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ws-muted, #6b7280)" }}>
              Deferred premium path for dedicated Hermes messaging identities.
            </p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={gatewayEnabled}
              onChange={(event) => setGatewayEnabled(event.target.checked)}
            />
            Enable native gateway
          </label>
          <TextInput
            value={gatewayAllowedUsersCsv}
            onChange={(event) => setGatewayAllowedUsersCsv(event.target.value)}
            placeholder="allowed users CSV"
          />
          <div style={{ fontSize: 12, color: "var(--ws-muted, #6b7280)" }}>
            Current status: {gatewayConfig.enabled ? "enabled" : "disabled"}
          </div>
          <div>
            <Button variant="primary" onClick={() => void runAction(saveGatewayConfig)} disabled={busy}>
              Save gateway settings
            </Button>
          </div>
        </div>
      </Card>

      {loading ? <p style={emptyCopyStyle}>Loading Hermes settings…</p> : null}
      {error ? <p style={{ ...emptyCopyStyle, color: "#b91c1c" }}>{error}</p> : null}
      {success ? <p style={{ ...emptyCopyStyle, color: "#047857" }}>{success}</p> : null}
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  border: "1px solid var(--workspace-border, #e5e7eb)",
  borderRadius: 8,
  background: "var(--workspace-panel-soft, #f9fafb)",
  color: "var(--workspace-text, #111827)",
};

const rowTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--workspace-text, #111827)",
};

const rowMetaStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--workspace-muted, #6b7280)",
};

const emptyCopyStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--ws-muted, #6b7280)",
};
