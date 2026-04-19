"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Columns3, GripVertical, Eye, EyeOff } from "lucide-react";

export type ColumnOption = {
  key: string;
  label: string;
};

type Props = {
  /** All columns available to toggle (ordered by field.sortOrder). */
  options: ColumnOption[];
  /** Currently visible columns, in desired order. */
  value: string[];
  onChange: (next: string[]) => void;
  onReset?: () => void;
  buttonLabel?: string;
};

/**
 * Column picker for dynamic tables.
 * - Toggle column visibility via checkbox.
 * - Reorder columns via drag-and-drop in the popover.
 * Minimal vanilla HTML5 drag APIs — no external deps.
 */
export function ColumnPicker({ options, value, onChange, onReset, buttonLabel }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const visibleKeys = new Set(value);

  // Build the ordered list for the popover:
  // first the currently visible columns in their chosen order, then hidden ones.
  const visibleInOrder = value
    .map((key) => options.find((opt) => opt.key === key))
    .filter((opt): opt is ColumnOption => Boolean(opt));
  const hidden = options.filter((opt) => !visibleKeys.has(opt.key));

  function toggle(key: string) {
    if (visibleKeys.has(key)) {
      onChange(value.filter((k) => k !== key));
    } else {
      onChange([...value, key]);
    }
  }

  function handleDragStart(index: number) {
    dragIndexRef.current = index;
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
  }

  function handleDrop(targetIndex: number) {
    const source = dragIndexRef.current;
    dragIndexRef.current = null;
    if (source === null || source === targetIndex) return;
    const next = [...value];
    const [moved] = next.splice(source, 1);
    next.splice(targetIndex, 0, moved);
    onChange(next);
  }

  return (
    <div ref={ref} style={wrapStyle}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={triggerStyle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Columns3 size={14} aria-hidden />
        <span>{buttonLabel ?? "Columnas"}</span>
      </button>
      {open ? (
        <div role="menu" style={popoverStyle}>
          <div style={popoverHeaderStyle}>
            <span>Visibles ({visibleInOrder.length})</span>
            {onReset ? (
              <button type="button" onClick={onReset} style={resetButtonStyle}>
                Restablecer
              </button>
            ) : null}
          </div>
          <div style={listStyle}>
            {visibleInOrder.map((opt, index) => (
              <div
                key={opt.key}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
                style={rowStyle}
              >
                <GripVertical size={14} aria-hidden style={{ color: "var(--workspace-muted)", cursor: "grab" }} />
                <span style={labelStyle}>{opt.label}</span>
                <button
                  type="button"
                  onClick={() => toggle(opt.key)}
                  style={toggleButtonStyle}
                  aria-label={`Ocultar ${opt.label}`}
                >
                  <Eye size={14} aria-hidden />
                </button>
              </div>
            ))}
            {hidden.length > 0 ? (
              <>
                <div style={sectionLabelStyle}>Ocultas</div>
                {hidden.map((opt) => (
                  <div key={opt.key} style={{ ...rowStyle, opacity: 0.7 }}>
                    <span style={{ width: 14 }} />
                    <span style={labelStyle}>{opt.label}</span>
                    <button
                      type="button"
                      onClick={() => toggle(opt.key)}
                      style={toggleButtonStyle}
                      aria-label={`Mostrar ${opt.label}`}
                    >
                      <EyeOff size={14} aria-hidden />
                    </button>
                  </div>
                ))}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const wrapStyle: CSSProperties = { position: "relative", display: "inline-flex" };

const triggerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 12px",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--workspace-text)",
  background: "#ffffff",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const popoverStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  zIndex: 40,
  width: 260,
  background: "var(--workspace-surface)",
  border: "1px solid var(--workspace-border)",
  borderRadius: "var(--radius-md)",
  boxShadow: "0 12px 32px rgba(17, 24, 39, 0.14)",
  padding: 10,
};

const popoverHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--workspace-muted)",
  padding: "4px 6px 8px",
};

const resetButtonStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--workspace-accent-strong)",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
};

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  maxHeight: 320,
  overflowY: "auto",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  borderRadius: 8,
  background: "transparent",
};

const labelStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  color: "var(--workspace-text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const toggleButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  background: "transparent",
  border: "none",
  color: "var(--workspace-muted)",
  cursor: "pointer",
  borderRadius: 6,
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--workspace-muted)",
  padding: "8px 6px 4px",
};
