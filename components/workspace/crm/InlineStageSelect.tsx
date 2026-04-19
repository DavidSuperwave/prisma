"use client";

import { useState, type CSSProperties } from "react";

type StageOption = { value: string; label: string; tone?: "success" | "info" | "danger" | "neutral" };

type Props = {
  value: string;
  options: StageOption[];
  disabled?: boolean;
  onSave: (nextValue: string) => Promise<void> | void;
  /** If true, renders as plain text when not hovered/focused (pretty default). */
  compact?: boolean;
};

/**
 * Inline stage editor for CRM tables.
 * - Renders as a chip by default.
 * - Clicking it reveals a native <select> to change the value, which calls `onSave`.
 * - Rolls back on error so the UI stays consistent with the server.
 */
export function InlineStageSelect({ value, options, disabled, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit(next: string) {
    if (next === current) {
      setEditing(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSave(next);
      setCurrent(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setPending(false);
    }
  }

  if (editing) {
    return (
      <select
        autoFocus
        value={current}
        disabled={pending}
        onChange={(event) => void commit(event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setEditing(false);
        }}
        style={selectStyle}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  const tone = options.find((opt) => opt.value === current)?.tone ?? "neutral";
  const label = options.find((opt) => opt.value === current)?.label ?? current;

  return (
    <span
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={(event) => {
        if (disabled) return;
        event.stopPropagation();
        setEditing(true);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setEditing(true);
        }
      }}
      style={{ ...chipStyle(tone), cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.7 : 1 }}
      title={error ?? label}
    >
      {label}
    </span>
  );
}

function chipStyle(tone: "success" | "info" | "danger" | "neutral"): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: "var(--radius-pill)",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "capitalize",
    whiteSpace: "nowrap",
  };
  if (tone === "success") return { ...base, background: "rgba(66, 211, 139, 0.14)", color: "#0f8f52" };
  if (tone === "info") return { ...base, background: "rgba(56, 189, 248, 0.14)", color: "#0369a1" };
  if (tone === "danger") return { ...base, background: "rgba(239, 68, 68, 0.14)", color: "#b91c1c" };
  return { ...base, background: "rgba(17, 24, 39, 0.06)", color: "var(--workspace-text)" };
}

const selectStyle: CSSProperties = {
  height: 28,
  padding: "0 8px",
  border: "1px solid var(--workspace-border)",
  borderRadius: 8,
  background: "#ffffff",
  color: "var(--workspace-text)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};
