# M10 Smart Views — Progress Log (2026-04-17)

This log tracks the continuation of the M10 "Smart Views" feature from
`PRISMA-MASTER-SPEC-V1.md`. Not to be confused with the M10 "BBC Launch" stage
gate (which is the terminal roadmap milestone, not a feature).

## Scope

Extend `workspace_views` from a simple saved-column list into true Smart Views
with filter DSL, scope, sort/column config, pinning, and per-object view mode
(`table` | `board` | `kpi` | `pipeline`).

## What was already in place before this pass

- DB migration `20260418_000003_m10_smart_views.sql` adds columns:
  - `scope`, `filter_dsl`, `sort_config`, `column_config`,
    `is_pinned`, `view_mode`, `created_by_user_id`.
- `lib/workspaceStore.ts` — `PrismaWorkspaceView` + `mapView` + fallback read
  path for environments missing the new columns.
- API routes:
  - `GET/POST /api/workspaces/[workspaceSlug]/views`
  - `GET/PATCH/DELETE /api/workspaces/[workspaceSlug]/views/[viewId]`
  - Scope/role validation, fallback-on-missing-column handling.
- Filter engine: `lib/crm/filters.ts` (`parseFilterDsl`, `matchesFilter`,
  `filterRecords`).
- UI: `SmartViewsBar` (select/pin/activate), `SmartViewEditor`
  (rule builder, scope picker, save/update/delete).
- `useColumnConfig` consumes saved view `column_config`.
- Pinned smart views surfaced in workspace nav via `buildWorkspaceNavItems`.

## Gaps closed in this pass

### 1. `SmartViewEditor` was hardcoding `viewMode: "table"`

Both the create (`POST`) and update (`PATCH`) payloads ignored view_mode, so a
user could never persist anything other than table. Fixed in
`components/workspace/crm/SmartViewEditor.tsx`:

- Added local `viewMode` state initialized from `currentView?.viewMode` and
  normalized to `"table" | "board" | "kpi" | "pipeline"`.
- Included `viewMode` in the JSON bodies for `handleSaveNew` and
  `handleUpdateCurrent`.
- Propagated the same value through `onSaved(...)` so the in-memory
  `SavedSmartView` reflects the persisted mode without a refetch.
- Added a `<select aria-label="Modo de visualización">` in the editor UI with
  options Tabla / Tablero / KPI / Pipeline.

### 2. `useColumnConfig` set state inside an effect (`react-hooks/set-state-in-effect`)

When `activeViewId` changed, the effect synchronously called `setColumnsState`
during commit, triggering a cascading render warning on Next.js 16. Fixed in
`lib/useColumnConfig.ts` by moving the adoption of a new view's
`column_config` into a render-phase guard backed by `useRef`, so React schedules
the state adoption with the same render that observed the change instead of
after commit.

### 3. `DealsView` ignored the persisted `view_mode`

The kanban/table toggle in `DealsView` was driven only by local state and a
report drilldown flag, so saving a view with `board`/`pipeline` mode had no
visual effect. Fixed in `components/workspace/crm/DealsView.tsx`:

- Added an effect that mirrors `activeView?.viewMode` into the local
  `viewMode` state:
  - `board`, `pipeline` → `kanban` renderer
  - `table`, `kpi` → `table` renderer
- Manual toggles still work — they just overwrite the state until the user
  picks a different saved view.

### 4. `WorkspacePanels.tsx` unescaped quotes

Two instances of `hoja "{firstSheet.name}"` replaced with `&quot;…&quot;` to
satisfy `react/no-unescaped-entities`.

## What was already correct (verified in this pass)

- `PeopleView` and `CompaniesView` already:
  - Lazy-initialize `activeFilter` from the initial saved view's `filter_dsl`.
  - Apply the filter via `filterRecords(records, activeFilter)` before search.
  - Re-apply the saved filter when the user picks another view through
    `SmartViewsBar.handleSelectFromMenu` → `onApplyFilter`.
- `workspace_views` pinned entries surface in the left nav via
  `buildWorkspaceNavItems` with private-view visibility scoped to
  `createdByUserId === user.id`.

## Verification

- `npx tsc --noEmit` → clean (0 errors).
- `npm run lint` → 0 errors, only 4 pre-existing warnings
  (`@next/next/no-img-element` x2, one `react-hooks/exhaustive-deps` in
  `WorkspacePanels.tsx`, one `import/no-anonymous-default-export` in
  `eslint.config.mjs`). None touched by this pass.

## Remaining / deferred

- `PeopleView` and `CompaniesView` currently render only in table mode. If the
  product wants a `board`/`kpi` renderer for those entities as well, we would
  need to either:
  - add alternative renderers inside each view, or
  - promote the renderers into a shared `TableView` / `KanbanView` / `KpiPanel`
    pair (the empty scaffolds `components/workspace/views/*` already exist
    for exactly this refactor).
- `sort_config` is persisted via the API but there is no UI yet to edit sort
  rules per saved view. Tables sort by insertion order at the moment.
- `column_config` PATCH: on reorder / show / hide within `ColumnPicker`, the
  change lives in `localStorage` via `useColumnConfig` but is not pushed back
  to the saved view's `column_config` column. A "Guardar columnas en la vista"
  action would close the loop.

## Files touched

- `components/workspace/crm/SmartViewEditor.tsx`
- `components/workspace/crm/DealsView.tsx`
- `components/workspace/WorkspacePanels.tsx`
- `lib/useColumnConfig.ts`
- `docs/m10-smart-views-progress-2026-04-17.md` (this file)
