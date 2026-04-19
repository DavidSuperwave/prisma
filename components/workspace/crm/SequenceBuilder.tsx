"use client";

import { useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";

type StepType = "email" | "sms" | "whatsapp" | "wait" | "exit";

type SequenceStep = { type: StepType } & Record<string, unknown>;

type TemplateLite = { id: string; name: string; channel: "email" | "sms" | "whatsapp" };

export type SequenceModel = {
  id: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  steps: SequenceStep[];
};

type Props = {
  workspaceSlug: string;
  canManage: boolean;
  initialSequence: SequenceModel | null;
  templates: TemplateLite[];
};

const STEP_OPTIONS: { value: StepType; label: string }[] = [
  { value: "email", label: "Enviar email" },
  { value: "sms", label: "Enviar SMS" },
  { value: "whatsapp", label: "Enviar WhatsApp" },
  { value: "wait", label: "Esperar" },
  { value: "exit", label: "Salir" },
];

const container: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const panel: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 18,
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-lg)",
  background: "var(--workspace-surface)",
  boxShadow: "0 8px 24px rgba(17, 24, 39, 0.04)",
};

const label: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--workspace-muted)",
};

const input: CSSProperties = {
  height: 34,
  padding: "8px 12px",
  fontSize: 13,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  outline: "none",
  fontFamily: "inherit",
  width: "100%",
};

const textarea: CSSProperties = {
  ...input,
  height: 64,
  padding: "8px 12px",
  resize: "vertical",
};

const primaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 14px",
  fontSize: 13,
  fontWeight: 600,
  color: "#ffffff",
  background: "var(--workspace-accent)",
  border: "1px solid var(--workspace-accent)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostBtn: CSSProperties = {
  ...primaryBtn,
  color: "var(--workspace-text)",
  background: "#ffffff",
  borderColor: "var(--workspace-border)",
};

const dangerBtn: CSSProperties = {
  ...ghostBtn,
  color: "#b91c1c",
  borderColor: "rgba(239, 68, 68, 0.32)",
};

const stepCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  background: "#ffffff",
};

function emptySequence(): SequenceModel {
  return {
    id: null,
    name: "",
    description: null,
    enabled: true,
    steps: [],
  };
}

function channelFor(type: StepType): "email" | "sms" | "whatsapp" | null {
  if (type === "email" || type === "sms" || type === "whatsapp") return type;
  return null;
}

export function SequenceBuilder({ workspaceSlug, canManage, initialSequence, templates }: Props) {
  const [sequence, setSequence] = useState<SequenceModel>(initialSequence ?? emptySequence());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    if (!canManage) return;
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const endpoint = sequence.id
        ? `/api/workspaces/${workspaceSlug}/sequences/${sequence.id}`
        : `/api/workspaces/${workspaceSlug}/sequences`;
      const method = sequence.id ? "PATCH" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sequence.name,
          description: sequence.description,
          enabled: sequence.enabled,
          steps: sequence.steps,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        sequence?: { id: string };
        error?: string;
      };
      if (!response.ok || !json.sequence) {
        setError(json.error ?? "No se pudo guardar la secuencia.");
        return;
      }
      setSequence((prev) => ({ ...prev, id: json.sequence!.id }));
      setStatus("Guardado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setSubmitting(false);
    }
  }

  function addStep() {
    setSequence((prev) => ({ ...prev, steps: [...prev.steps, { type: "email" }] }));
  }

  function updateStep(index: number, next: SequenceStep) {
    setSequence((prev) => {
      const steps = [...prev.steps];
      steps[index] = next;
      return { ...prev, steps };
    });
  }

  function removeStep(index: number) {
    setSequence((prev) => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setSequence((prev) => {
      const steps = [...prev.steps];
      const target = index + direction;
      if (target < 0 || target >= steps.length) return prev;
      const [s] = steps.splice(index, 1);
      steps.splice(target, 0, s);
      return { ...prev, steps };
    });
  }

  return (
    <div style={container}>
      <div style={panel}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <div>
            <div style={label}>Nombre</div>
            <input
              type="text"
              value={sequence.name}
              onChange={(event) => setSequence({ ...sequence, name: event.target.value })}
              placeholder="Nueva secuencia"
              style={input}
              disabled={!canManage}
            />
          </div>
          <div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--workspace-text)",
                height: "100%",
              }}
            >
              <input
                type="checkbox"
                checked={sequence.enabled}
                onChange={(event) => setSequence({ ...sequence, enabled: event.target.checked })}
                disabled={!canManage}
              />
              Habilitado
            </label>
          </div>
        </div>

        <div>
          <div style={label}>Descripción</div>
          <textarea
            value={sequence.description ?? ""}
            onChange={(event) => setSequence({ ...sequence, description: event.target.value || null })}
            style={textarea}
            disabled={!canManage}
          />
        </div>
      </div>

      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong style={{ fontSize: 14 }}>Pasos</strong>
          {canManage ? (
            <button type="button" onClick={addStep} style={{ ...ghostBtn, marginLeft: "auto" }}>
              <Plus size={14} />
              Paso
            </button>
          ) : null}
        </div>

        {sequence.steps.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--workspace-muted)", margin: 0 }}>Sin pasos todavía.</p>
        ) : (
          sequence.steps.map((step, index) => {
            const ch = channelFor(step.type);
            const tpls = ch ? templates.filter((t) => t.channel === ch) : [];
            return (
              <div key={index} style={stepCard}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--workspace-muted)", fontWeight: 600 }}>#{index + 1}</span>
                  <span style={{ fontSize: 13 }}>
                    {STEP_OPTIONS.find((s) => s.value === step.type)?.label ?? step.type}
                  </span>
                  {canManage ? (
                    <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                      <button type="button" onClick={() => moveStep(index, -1)} style={ghostBtn}>
                        <ArrowUp size={12} />
                      </button>
                      <button type="button" onClick={() => moveStep(index, 1)} style={ghostBtn}>
                        <ArrowDown size={12} />
                      </button>
                      <button type="button" onClick={() => removeStep(index)} style={dangerBtn}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : null}
                </div>

                <div style={label}>Tipo</div>
                <select
                  value={step.type}
                  onChange={(event) => updateStep(index, { type: event.target.value as StepType })}
                  style={input}
                  disabled={!canManage}
                >
                  {STEP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                {ch ? (
                  <>
                    <div style={label}>Plantilla</div>
                    <select
                      value={typeof step.templateId === "string" ? step.templateId : ""}
                      onChange={(event) =>
                        updateStep(index, { ...step, templateId: event.target.value || undefined })
                      }
                      style={input}
                      disabled={!canManage}
                    >
                      <option value="">— Selecciona —</option>
                      {tpls.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}

                {step.type === "wait" ? (
                  <>
                    <div style={label}>Minutos / Horas / Días</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        type="number"
                        placeholder="min"
                        value={typeof step.minutes === "number" ? step.minutes : ""}
                        onChange={(event) =>
                          updateStep(index, { ...step, minutes: event.target.value ? Number(event.target.value) : undefined })
                        }
                        style={input}
                        disabled={!canManage}
                        min={0}
                      />
                      <input
                        type="number"
                        placeholder="horas"
                        value={typeof step.hours === "number" ? step.hours : ""}
                        onChange={(event) =>
                          updateStep(index, { ...step, hours: event.target.value ? Number(event.target.value) : undefined })
                        }
                        style={input}
                        disabled={!canManage}
                        min={0}
                      />
                      <input
                        type="number"
                        placeholder="días"
                        value={typeof step.days === "number" ? step.days : ""}
                        onChange={(event) =>
                          updateStep(index, { ...step, days: event.target.value ? Number(event.target.value) : undefined })
                        }
                        style={input}
                        disabled={!canManage}
                        min={0}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {error ? <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{error}</p> : null}
      {status ? <p style={{ color: "#047857", fontSize: 12, margin: 0 }}>{status}</p> : null}

      {canManage ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={save} disabled={submitting} style={primaryBtn}>
            <Save size={14} />
            {sequence.id ? "Guardar" : "Crear secuencia"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
