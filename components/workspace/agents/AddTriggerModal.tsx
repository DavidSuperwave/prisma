"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { buildCronExpression, describeCron } from "@/lib/agentTools/cronExpression";

export type TriggerModalSubmit = {
  cron: string;
  prompt: string;
  timezone: string;
  startsAt: string | null;
};

type Props = {
  open: boolean;
  canEdit: boolean;
  onClose: () => void;
  onSave: (payload: TriggerModalSubmit) => Promise<void> | void;
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.52)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 120,
};

const modalStyle: CSSProperties = {
  width: "min(560px, 94vw)",
  maxHeight: "88vh",
  overflow: "auto",
  background: "var(--workspace-panel)",
  border: "1px solid var(--workspace-border)",
  borderRadius: 18,
  padding: 18,
  display: "grid",
  gap: 14,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  color: "var(--workspace-muted)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid var(--workspace-border)",
  background: "white",
  color: "var(--workspace-text)",
  fontSize: 13,
};

const primaryButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "none",
  background: "rgba(99,102,241,0.95)",
  color: "white",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid var(--workspace-border)",
  background: "white",
  color: "var(--workspace-text)",
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
};

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

function splitTime(value: string) {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  return {
    hour: Number.isInteger(hour) ? hour : 9,
    minute: Number.isInteger(minute) ? minute : 0,
  };
}

export function AddTriggerModal({ open, canEdit, onClose, onSave }: Props) {
  const [repeat, setRepeat] = useState<"daily" | "weekly" | "monthly" | "custom">("daily");
  const [timeValue, setTimeValue] = useState("09:00");
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [startsAt, setStartsAt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [customCron, setCustomCron] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  useEffect(() => {
    if (!open) return;
    setRepeat("daily");
    setTimeValue("09:00");
    setWeekday(1);
    setDayOfMonth(1);
    setStartsAt("");
    setPrompt("");
    setCustomCron("");
    setSaving(false);
    setError(null);
  }, [open]);

  const cronPreview = useMemo(() => {
    try {
      if (repeat === "custom") {
        return customCron.trim();
      }
      const { hour, minute } = splitTime(timeValue);
      return buildCronExpression({
        repeat,
        atHour: hour,
        atMinute: minute,
        weekday,
        day: dayOfMonth,
      });
    } catch {
      return "";
    }
  }, [customCron, dayOfMonth, repeat, timeValue, weekday]);

  const previewLabel = cronPreview ? describeCron(cronPreview, timezone) : "Completa los campos";

  if (!open) {
    return null;
  }

  return (
    <div style={overlayStyle} onClick={() => (saving ? null : onClose())}>
      <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--workspace-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Trigger jobs
          </p>
          <h3 style={{ margin: "4px 0 0", fontSize: 20, color: "var(--workspace-text)" }}>Anadir trigger</h3>
        </div>

        <label style={labelStyle}>
          Repeat
          <select
            value={repeat}
            onChange={(event) => setRepeat(event.target.value as "daily" | "weekly" | "monthly" | "custom")}
            style={inputStyle}
            disabled={!canEdit || saving}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly on...</option>
            <option value="monthly">Monthly on...</option>
            <option value="custom">Custom cron</option>
          </select>
        </label>

        {repeat === "weekly" ? (
          <label style={labelStyle}>
            Weekday
            <select
              value={weekday}
              onChange={(event) => setWeekday(Number.parseInt(event.target.value, 10))}
              style={inputStyle}
              disabled={!canEdit || saving}
            >
              {WEEKDAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {repeat === "monthly" ? (
          <label style={labelStyle}>
            Day of month
            <input
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(event) => setDayOfMonth(Number.parseInt(event.target.value || "1", 10))}
              style={inputStyle}
              disabled={!canEdit || saving}
            />
          </label>
        ) : null}

        {repeat === "custom" ? (
          <label style={labelStyle}>
            Cron expression
            <input
              value={customCron}
              onChange={(event) => setCustomCron(event.target.value)}
              placeholder="2 17 * * 0"
              style={inputStyle}
              disabled={!canEdit || saving}
            />
          </label>
        ) : (
          <label style={labelStyle}>
            At
            <input
              type="time"
              value={timeValue}
              onChange={(event) => setTimeValue(event.target.value)}
              style={inputStyle}
              disabled={!canEdit || saving}
            />
          </label>
        )}

        <label style={labelStyle}>
          Starts
          <input
            type="date"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            style={inputStyle}
            disabled={!canEdit || saving}
          />
        </label>

        <label style={labelStyle}>
          Instructions
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Que debe hacer cuando se ejecute"
            style={{ ...inputStyle, minHeight: 104, resize: "vertical" }}
            disabled={!canEdit || saving}
          />
        </label>

        <p style={{ margin: 0, fontSize: 12, color: "var(--workspace-muted)" }}>{previewLabel}</p>
        {error ? <p style={{ margin: 0, fontSize: 12, color: "#b42318" }}>{error}</p> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            style={{ ...primaryButtonStyle, opacity: !canEdit || saving ? 0.7 : 1, cursor: !canEdit || saving ? "not-allowed" : "pointer" }}
            disabled={!canEdit || saving}
            onClick={async () => {
              const promptValue = prompt.trim();
              const cron = cronPreview.trim();
              if (!cron) {
                setError("Debes definir una expresion cron valida.");
                return;
              }
              if (!promptValue) {
                setError("Las instrucciones son obligatorias.");
                return;
              }
              setSaving(true);
              setError(null);
              try {
                await onSave({
                  cron,
                  prompt: promptValue,
                  timezone,
                  startsAt: startsAt || null,
                });
              } catch (err) {
                setError(err instanceof Error ? err.message : "No se pudo guardar el trigger.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
