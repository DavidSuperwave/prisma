"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Plus,
  Save,
  Trash2,
  Zap,
} from "lucide-react";

type TriggerType =
  | "cron"
  | "lead.created"
  | "lead.updated"
  | "lead.stage_changed"
  | "lead.qualified"
  | "company.created"
  | "deal.created"
  | "deal.stage_changed"
  | "deal.won"
  | "deal.lost"
  | "task.due"
  | "task.completed"
  | "task.overdue"
  | "form.submitted"
  | "whatsapp.message_received"
  | "meta.lead_received"
  | "activity.custom";

type StepType =
  | "send_email"
  | "send_sms"
  | "send_whatsapp"
  | "update_record"
  | "create_task"
  | "create_note"
  | "create_deal"
  | "agent_handoff"
  | "delay"
  | "wait"
  | "enroll_in_sequence"
  | "run_recipe";

type WorkflowStep = { id?: string; type: StepType } & Record<string, unknown>;

type TemplateLite = { id: string; name: string; channel: "email" | "sms" | "whatsapp" };
type SequenceLite = { id: string; name: string };

export type WorkflowModel = {
  id: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: { type?: TriggerType } & Record<string, unknown>;
  steps: WorkflowStep[];
};

type Props = {
  workspaceSlug: string;
  canManage: boolean;
  initialWorkflow: WorkflowModel | null;
  templates: TemplateLite[];
  sequences: SequenceLite[];
};

const TRIGGER_OPTIONS: { value: TriggerType; label: string }[] = [
  { value: "cron", label: "Programado (cron)" },
  { value: "lead.created", label: "Lead creado" },
  { value: "lead.updated", label: "Lead actualizado" },
  { value: "lead.stage_changed", label: "Cambio de etapa (persona)" },
  { value: "lead.qualified", label: "Lead calificado" },
  { value: "company.created", label: "Empresa creada" },
  { value: "deal.created", label: "Oportunidad creada" },
  { value: "deal.stage_changed", label: "Oportunidad cambia etapa" },
  { value: "deal.won", label: "Oportunidad ganada" },
  { value: "deal.lost", label: "Oportunidad perdida" },
  { value: "task.due", label: "Tarea vence" },
  { value: "task.completed", label: "Tarea completada" },
  { value: "task.overdue", label: "Tarea vencida" },
  { value: "form.submitted", label: "Formulario recibido" },
  { value: "whatsapp.message_received", label: "WhatsApp entrante" },
  { value: "meta.lead_received", label: "Meta lead ads" },
  { value: "activity.custom", label: "Actividad custom" },
];

const STEP_OPTIONS: { value: StepType; label: string }[] = [
  { value: "run_recipe", label: "Ejecutar receta de integración" },
  { value: "send_email", label: "Enviar email" },
  { value: "send_sms", label: "Enviar SMS" },
  { value: "send_whatsapp", label: "Enviar WhatsApp" },
  { value: "create_task", label: "Crear tarea" },
  { value: "create_note", label: "Crear nota" },
  { value: "update_record", label: "Actualizar registro" },
  { value: "create_deal", label: "Crear oportunidad" },
  { value: "agent_handoff", label: "Hand-off a agente" },
  { value: "wait", label: "Esperar" },
  { value: "enroll_in_sequence", label: "Inscribir en secuencia" },
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
  fontFamily: "inherit",
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

function emptyWorkflow(): WorkflowModel {
  return {
    id: null,
    name: "",
    description: null,
    enabled: true,
    trigger: { type: "lead.created" },
    steps: [],
  };
}

function StepEditor({
  step,
  templates,
  sequences,
  onChange,
  disabled,
}: {
  step: WorkflowStep;
  templates: TemplateLite[];
  sequences: SequenceLite[];
  onChange: (next: WorkflowStep) => void;
  disabled: boolean;
}) {
  const update = (patch: Partial<WorkflowStep>) => onChange({ ...step, ...patch });
  const channelFor = (type: StepType): "email" | "sms" | "whatsapp" | null => {
    if (type === "send_email") return "email";
    if (type === "send_sms") return "sms";
    if (type === "send_whatsapp") return "whatsapp";
    return null;
  };

  const channel = channelFor(step.type);
  const relevantTemplates = channel
    ? templates.filter((entry) => entry.channel === channel)
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={label}>Acción</div>
      <select
        value={step.type}
        onChange={(event) => update({ type: event.target.value as StepType })}
        style={input}
        disabled={disabled}
      >
        {STEP_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {channel ? (
        <>
          <div style={label}>Plantilla</div>
          <select
            value={typeof step.templateId === "string" ? step.templateId : ""}
            onChange={(event) => update({ templateId: event.target.value || undefined })}
            style={input}
            disabled={disabled}
          >
            <option value="">— Selecciona plantilla —</option>
            {relevantTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
          <div style={label}>Destinatario opcional</div>
          <input
            type="text"
            value={typeof step.to === "string" ? step.to : ""}
            onChange={(event) => update({ to: event.target.value || undefined })}
            placeholder="(usa email/phone del registro)"
            style={input}
            disabled={disabled}
          />
        </>
      ) : null}

      {step.type === "create_task" ? (
        <>
          <div style={label}>Título</div>
          <input
            type="text"
            value={typeof step.title === "string" ? step.title : ""}
            onChange={(event) => update({ title: event.target.value })}
            placeholder="Llamar al lead"
            style={input}
            disabled={disabled}
          />
          <div style={label}>Vence en (horas)</div>
          <input
            type="number"
            value={typeof step.dueInHours === "number" ? step.dueInHours : ""}
            onChange={(event) => update({ dueInHours: event.target.value ? Number(event.target.value) : undefined })}
            style={input}
            disabled={disabled}
            min={0}
          />
        </>
      ) : null}

      {step.type === "create_note" ? (
        <>
          <div style={label}>Asunto</div>
          <input
            type="text"
            value={typeof step.subject === "string" ? step.subject : ""}
            onChange={(event) => update({ subject: event.target.value })}
            style={input}
            disabled={disabled}
          />
          <div style={label}>Cuerpo</div>
          <textarea
            value={typeof step.body === "string" ? step.body : ""}
            onChange={(event) => update({ body: event.target.value })}
            style={textarea}
            disabled={disabled}
          />
        </>
      ) : null}

      {step.type === "update_record" ? (
        <>
          <div style={label}>Patch JSON</div>
          <textarea
            value={
              typeof step.patch === "string"
                ? step.patch
                : JSON.stringify(step.patch ?? {}, null, 2)
            }
            onChange={(event) => {
              try {
                const parsed = JSON.parse(event.target.value || "{}");
                update({ patch: parsed });
              } catch {
                update({ patch: event.target.value });
              }
            }}
            style={{ ...textarea, fontFamily: "ui-monospace, SFMono-Regular, monospace", height: 90 }}
            disabled={disabled}
          />
        </>
      ) : null}

      {step.type === "create_deal" ? (
        <>
          <div style={label}>Título</div>
          <input
            type="text"
            value={typeof step.title === "string" ? step.title : ""}
            onChange={(event) => update({ title: event.target.value })}
            style={input}
            disabled={disabled}
          />
          <div style={label}>Monto</div>
          <input
            type="number"
            value={typeof step.amount === "number" ? step.amount : ""}
            onChange={(event) => update({ amount: event.target.value ? Number(event.target.value) : undefined })}
            style={input}
            disabled={disabled}
          />
        </>
      ) : null}

      {step.type === "agent_handoff" ? (
        <>
          <div style={label}>Agent ID</div>
          <input
            type="text"
            value={typeof step.ownerAgentId === "string" ? step.ownerAgentId : ""}
            onChange={(event) => update({ ownerAgentId: event.target.value })}
            style={input}
            disabled={disabled}
          />
          <div style={label}>Razón</div>
          <input
            type="text"
            value={typeof step.reason === "string" ? step.reason : ""}
            onChange={(event) => update({ reason: event.target.value })}
            style={input}
            disabled={disabled}
          />
        </>
      ) : null}

      {step.type === "delay" || step.type === "wait" ? (
        <>
          <div style={label}>Minutos / Horas / Días</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="number"
              placeholder="min"
              value={typeof step.minutes === "number" ? step.minutes : ""}
              onChange={(event) => update({ minutes: event.target.value ? Number(event.target.value) : undefined })}
              style={input}
              disabled={disabled}
              min={0}
            />
            <input
              type="number"
              placeholder="horas"
              value={typeof step.hours === "number" ? step.hours : ""}
              onChange={(event) => update({ hours: event.target.value ? Number(event.target.value) : undefined })}
              style={input}
              disabled={disabled}
              min={0}
            />
            <input
              type="number"
              placeholder="días"
              value={typeof step.days === "number" ? step.days : ""}
              onChange={(event) => update({ days: event.target.value ? Number(event.target.value) : undefined })}
              style={input}
              disabled={disabled}
              min={0}
            />
          </div>
        </>
      ) : null}

      {step.type === "enroll_in_sequence" ? (
        <>
          <div style={label}>Secuencia</div>
          <select
            value={typeof step.sequenceId === "string" ? step.sequenceId : ""}
            onChange={(event) => update({ sequenceId: event.target.value || undefined })}
            style={input}
            disabled={disabled}
          >
            <option value="">— Selecciona —</option>
            {sequences.map((seq) => (
              <option key={seq.id} value={seq.id}>
                {seq.name}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {step.type === "run_recipe" ? (
        <>
          <div style={label}>Integración (slug)</div>
          <input
            type="text"
            value={typeof step.integrationSlug === "string" ? step.integrationSlug : ""}
            onChange={(event) => update({ integrationSlug: event.target.value })}
            placeholder="close"
            style={input}
            disabled={disabled}
          />
          <div style={label}>Receta (slug)</div>
          <input
            type="text"
            value={typeof step.recipeSlug === "string" ? step.recipeSlug : ""}
            onChange={(event) => update({ recipeSlug: event.target.value })}
            placeholder="list-recent-leads"
            style={input}
            disabled={disabled}
          />
          <div style={label}>Guardar como (saveAs)</div>
          <input
            type="text"
            value={typeof step.saveAs === "string" ? step.saveAs : ""}
            onChange={(event) => update({ saveAs: event.target.value || undefined })}
            placeholder="(opcional, default = recipeSlug)"
            style={input}
            disabled={disabled}
          />
          <div style={label}>Variables JSON</div>
          <textarea
            value={
              typeof step.vars === "string"
                ? step.vars
                : JSON.stringify(step.vars ?? {}, null, 2)
            }
            onChange={(event) => {
              try {
                const parsed = JSON.parse(event.target.value || "{}");
                update({ vars: parsed });
              } catch {
                update({ vars: event.target.value });
              }
            }}
            style={{ ...textarea, fontFamily: "ui-monospace, SFMono-Regular, monospace", height: 90 }}
            disabled={disabled}
            placeholder='{ "limit": 25 }'
          />
        </>
      ) : null}
    </div>
  );
}

export function WorkflowBuilder({
  workspaceSlug,
  canManage,
  initialWorkflow,
  templates,
  sequences,
}: Props) {
  const [workflow, setWorkflow] = useState<WorkflowModel>(initialWorkflow ?? emptyWorkflow());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const triggerLabel = useMemo(() => {
    const option = TRIGGER_OPTIONS.find((o) => o.value === workflow.trigger.type);
    return option?.label ?? workflow.trigger.type ?? "—";
  }, [workflow.trigger.type]);

  async function save() {
    if (!canManage) return;
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const endpoint = workflow.id
        ? `/api/workspaces/${workspaceSlug}/workflows/${workflow.id}`
        : `/api/workspaces/${workspaceSlug}/workflows`;
      const method = workflow.id ? "PATCH" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workflow.name,
          description: workflow.description,
          enabled: workflow.enabled,
          trigger: workflow.trigger,
          steps: workflow.steps,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        workflow?: { id: string };
        error?: string;
      };
      if (!response.ok || !json.workflow) {
        setError(json.error ?? "No se pudo guardar el workflow.");
        return;
      }
      setWorkflow((prev) => ({ ...prev, id: json.workflow!.id }));
      setStatus("Guardado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setSubmitting(false);
    }
  }

  function addStep() {
    setWorkflow((prev) => ({
      ...prev,
      steps: [...prev.steps, { type: "send_email" }],
    }));
  }

  function updateStep(index: number, next: WorkflowStep) {
    setWorkflow((prev) => {
      const steps = [...prev.steps];
      steps[index] = next;
      return { ...prev, steps };
    });
  }

  function removeStep(index: number) {
    setWorkflow((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setWorkflow((prev) => {
      const steps = [...prev.steps];
      const target = index + direction;
      if (target < 0 || target >= steps.length) return prev;
      const [step] = steps.splice(index, 1);
      steps.splice(target, 0, step);
      return { ...prev, steps };
    });
  }

  return (
    <div style={container}>
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Zap size={18} color="var(--workspace-accent)" />
          <strong style={{ fontSize: 15 }}>Workflow</strong>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              padding: "4px 8px",
              background: workflow.enabled ? "rgba(16,185,129,0.15)" : "rgba(107,114,128,0.15)",
              color: workflow.enabled ? "#047857" : "#374151",
              borderRadius: "var(--radius-pill)",
              fontWeight: 600,
            }}
          >
            {workflow.enabled ? "Activo" : "Pausado"}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={label}>Nombre</div>
            <input
              type="text"
              value={workflow.name}
              onChange={(event) => setWorkflow({ ...workflow, name: event.target.value })}
              placeholder="Nuevo workflow"
              style={input}
              disabled={!canManage}
            />
          </div>
          <div>
            <div style={label}>Trigger</div>
            <select
              value={workflow.trigger.type ?? ""}
              onChange={(event) => {
                const nextType = event.target.value as TriggerType;
                const nextTrigger: Record<string, unknown> = { ...workflow.trigger, type: nextType };
                if (nextType === "cron" && typeof nextTrigger.schedule !== "string") {
                  nextTrigger.schedule = "*/30 * * * *";
                }
                if (nextType !== "cron") {
                  delete nextTrigger.schedule;
                }
                setWorkflow({ ...workflow, trigger: nextTrigger });
              }}
              style={input}
              disabled={!canManage}
            >
              {TRIGGER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {workflow.trigger.type === "cron" ? (
              <div style={{ marginTop: 8 }}>
                <div style={label}>Cron (5 campos, granularidad 5 min)</div>
                <input
                  type="text"
                  value={typeof workflow.trigger.schedule === "string" ? workflow.trigger.schedule : ""}
                  onChange={(event) =>
                    setWorkflow({
                      ...workflow,
                      trigger: { ...workflow.trigger, schedule: event.target.value },
                    })
                  }
                  placeholder="*/30 * * * *"
                  style={{ ...input, fontFamily: "ui-monospace, SFMono-Regular, monospace" }}
                  disabled={!canManage}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <div style={label}>Descripción</div>
          <textarea
            value={workflow.description ?? ""}
            onChange={(event) => setWorkflow({ ...workflow, description: event.target.value || null })}
            style={textarea}
            disabled={!canManage}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--workspace-text)" }}>
          <input
            type="checkbox"
            checked={workflow.enabled}
            onChange={(event) => setWorkflow({ ...workflow, enabled: event.target.checked })}
            disabled={!canManage}
          />
          Habilitado
        </label>
      </div>

      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Activity size={16} color="var(--workspace-muted)" />
          <strong style={{ fontSize: 14 }}>Pasos</strong>
          <span style={{ fontSize: 12, color: "var(--workspace-muted)" }}>Trigger: {triggerLabel}</span>
          {canManage ? (
            <button type="button" onClick={addStep} style={{ ...ghostBtn, marginLeft: "auto" }}>
              <Plus size={14} />
              Paso
            </button>
          ) : null}
        </div>

        {workflow.steps.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--workspace-muted)", margin: 0 }}>Sin pasos todavía.</p>
        ) : (
          workflow.steps.map((step, index) => (
            <div key={index} style={stepCard}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--workspace-muted)", fontWeight: 600 }}>#{index + 1}</span>
                <span style={{ fontSize: 13 }}>
                  {STEP_OPTIONS.find((s) => s.value === step.type)?.label ?? step.type}
                </span>
                {canManage ? (
                  <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                    <button type="button" onClick={() => moveStep(index, -1)} style={ghostBtn} title="Subir">
                      <ArrowUp size={12} />
                    </button>
                    <button type="button" onClick={() => moveStep(index, 1)} style={ghostBtn} title="Bajar">
                      <ArrowDown size={12} />
                    </button>
                    <button type="button" onClick={() => removeStep(index)} style={dangerBtn}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ) : null}
              </div>
              <StepEditor
                step={step}
                templates={templates}
                sequences={sequences}
                onChange={(next) => updateStep(index, next)}
                disabled={!canManage}
              />
            </div>
          ))
        )}
      </div>

      {error ? <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{error}</p> : null}
      {status ? <p style={{ color: "#047857", fontSize: 12, margin: 0 }}>{status}</p> : null}

      {canManage ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={save} disabled={submitting} style={primaryBtn}>
            <Save size={14} />
            {workflow.id ? "Guardar" : "Crear workflow"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
