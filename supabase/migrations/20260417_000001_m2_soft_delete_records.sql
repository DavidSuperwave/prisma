-- M2 soft delete support for workspace records
alter table public.records
  add column if not exists deleted_at timestamptz;

create index if not exists idx_records_workspace_deleted_at
  on public.records (workspace_id, deleted_at)
  where deleted_at is null;
