-- M11 sequences (cadences): ordered outreach flows with automatic enrollment progression.

create table if not exists public.workspace_sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  enabled boolean not null default true,
  steps jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create index if not exists idx_workspace_sequences_workspace
  on public.workspace_sequences (workspace_id, enabled, updated_at desc);

drop trigger if exists set_workspace_sequences_updated_at on public.workspace_sequences;
create trigger set_workspace_sequences_updated_at
before update on public.workspace_sequences
for each row execute procedure public.set_updated_at();

create table if not exists public.workspace_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sequence_id uuid not null references public.workspace_sequences(id) on delete cascade,
  record_id uuid not null references public.records(id) on delete cascade,
  status text not null default 'active' check (status in ('active','paused','completed','exited')),
  current_step integer not null default 0,
  next_run_at timestamptz,
  enrolled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sequence_id, record_id)
);

create index if not exists idx_workspace_sequence_enrollments_due
  on public.workspace_sequence_enrollments (workspace_id, status, next_run_at);

drop trigger if exists set_workspace_sequence_enrollments_updated_at on public.workspace_sequence_enrollments;
create trigger set_workspace_sequence_enrollments_updated_at
before update on public.workspace_sequence_enrollments
for each row execute procedure public.set_updated_at();

alter table public.workspace_sequences enable row level security;
alter table public.workspace_sequence_enrollments enable row level security;

drop policy if exists workspace_sequences_all on public.workspace_sequences;
create policy workspace_sequences_all on public.workspace_sequences
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists workspace_sequence_enrollments_all on public.workspace_sequence_enrollments;
create policy workspace_sequence_enrollments_all on public.workspace_sequence_enrollments
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
