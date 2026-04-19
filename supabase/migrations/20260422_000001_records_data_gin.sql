-- Speed up JSONB filter pushdowns on records.data (e.g. `data @> '{...}'`)
-- used by the records query API when the agent or operator filters on a
-- specific field value. The composite index pairs workspace_id with the
-- JSONB path_ops variant, which is faster and smaller than the default
-- GIN for pure containment operators.

create index if not exists idx_records_data_gin
  on public.records using gin (data jsonb_path_ops);

-- The workspace_id + updated_at DESC index already exists for pagination.
-- Make sure there's also a partial index for the common "not-deleted" read
-- path so the planner can skip deleted rows without a filter on every page.
create index if not exists idx_records_workspace_object_active
  on public.records (workspace_id, object_id, updated_at desc)
  where deleted_at is null;
