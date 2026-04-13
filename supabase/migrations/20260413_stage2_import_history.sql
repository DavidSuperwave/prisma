-- Stage 2: data import history tracking (M8)

create table if not exists public.workspace_import_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  object_id uuid not null references public.workspace_objects(id) on delete cascade,
  file_name text not null,
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  error_rows integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_import_history_workspace
  on public.workspace_import_history (workspace_id, created_at desc);

drop trigger if exists set_workspace_import_history_updated_at on public.workspace_import_history;
create trigger set_workspace_import_history_updated_at
before update on public.workspace_import_history
for each row execute procedure public.set_updated_at();

alter table public.workspace_import_history enable row level security;

drop policy if exists workspace_import_history_all on public.workspace_import_history;
create policy workspace_import_history_all on public.workspace_import_history
for all using (
  public.is_workspace_member(workspace_id)
)
with check (
  public.is_workspace_member(workspace_id)
);
