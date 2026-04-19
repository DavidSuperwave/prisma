"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export type ColumnConfigEntry = { key: string; hidden?: boolean };

function toKeyArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.length > 0) {
      out.push(item);
    } else if (item && typeof item === "object") {
      const row = item as ColumnConfigEntry;
      if (typeof row.key === "string" && row.key.length > 0 && !row.hidden) {
        out.push(row.key);
      }
    }
  }
  return out.length > 0 ? out : null;
}

type Options = {
  /** Local storage key namespace (e.g. `crm:people:${slug}`). */
  storageKey: string;
  /** Default ordered list of column keys to show. */
  defaultColumns: string[];
  /** Optional active smart view id (persists server-side via PATCH). */
  activeViewId?: string | null;
  /** Optional initial column_config from the active view. */
  initialViewColumnConfig?: unknown;
  /** Workspace slug for building PATCH URL. */
  workspaceSlug: string;
};

/**
 * Manage which columns are visible (and in what order) for a CRM table.
 *
 * Persistence order of priority:
 *   1. If `activeViewId` is provided, PATCH to `/views/:viewId` with { columnConfig }.
 *   2. Otherwise persist to localStorage under `storageKey`.
 */
export function useColumnConfig({
  storageKey,
  defaultColumns,
  activeViewId,
  initialViewColumnConfig,
  workspaceSlug,
}: Options) {
  const effectiveDefault = useMemo(() => defaultColumns.slice(), [defaultColumns]);

  const computeInitial = useCallback((): string[] => {
    if (activeViewId) {
      const fromView = toKeyArray(initialViewColumnConfig);
      if (fromView) return fromView;
    }
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          const fromLocal = toKeyArray(parsed);
          if (fromLocal) return fromLocal;
        }
      } catch {
        // ignore
      }
    }
    return effectiveDefault;
  }, [activeViewId, initialViewColumnConfig, storageKey, effectiveDefault]);

  const [columns, setColumnsState] = useState<string[]>(computeInitial);

  // Detect when the active view changes and adopt its column_config without
  // triggering a cascading render: `useState` updater runs during the render
  // that observes the change, rather than after commit.
  const lastActiveViewIdRef = useRef(activeViewId ?? null);
  if ((activeViewId ?? null) !== lastActiveViewIdRef.current) {
    lastActiveViewIdRef.current = activeViewId ?? null;
    if (activeViewId) {
      const fromView = toKeyArray(initialViewColumnConfig);
      if (fromView) {
        setColumnsState(fromView);
      }
    }
  }

  const persist = useCallback(
    async (next: string[]) => {
      if (activeViewId) {
        try {
          await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceSlug)}/views/${encodeURIComponent(activeViewId)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ columnConfig: next }),
            },
          );
        } catch {
          // best effort
        }
        return;
      }
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
    },
    [activeViewId, storageKey, workspaceSlug],
  );

  const setColumns = useCallback(
    (next: string[]) => {
      setColumnsState(next);
      void persist(next);
    },
    [persist],
  );

  const reset = useCallback(() => {
    setColumns(effectiveDefault);
  }, [effectiveDefault, setColumns]);

  return { columns, setColumns, reset };
}
