-- Drive-style documents overhaul
-- Adds workspace_folders for nested folder hierarchy and a folder_id column
-- on records so documents (records under the Documents object) can be grouped.

create table if not exists public.workspace_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.workspace_folders(id) on delete cascade,
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uniqueness across (workspace, parent, lower(name)). Supports null parent
-- for root-level folders by coalescing to the zero-uuid for the index.
create unique index if not exists idx_workspace_folders_unique_sibling
  on public.workspace_folders (
    workspace_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

create index if not exists idx_workspace_folders_workspace
  on public.workspace_folders (workspace_id, parent_id, name);

drop trigger if exists set_workspace_folders_updated_at on public.workspace_folders;
create trigger set_workspace_folders_updated_at
before update on public.workspace_folders
for each row execute procedure public.set_updated_at();

alter table public.records
  add column if not exists folder_id uuid references public.workspace_folders(id) on delete set null;

create index if not exists idx_records_folder
  on public.records (workspace_id, object_id, folder_id);

alter table public.workspace_folders enable row level security;

drop policy if exists workspace_folders_all on public.workspace_folders;
create policy workspace_folders_all on public.workspace_folders
for all using (
  public.is_workspace_member(workspace_id)
)
with check (
  public.is_workspace_member(workspace_id)
);
