-- Stage 4: first-class tasks and evidence links (M16)

create table if not exists public.workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_record_id uuid references public.records(id) on delete set null,
  source_object_id uuid references public.workspace_objects(id) on delete set null,
  type text not null default 'follow_up',
  title text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_agent_id uuid references public.workspace_agents(id) on delete set null,
  status text not null default 'pending',
  priority text not null default 'normal',
  due_at timestamptz,
  approval_required boolean not null default false,
  approval_status text not null default 'not_required',
  blocking_reason text,
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_tasks_workspace_status
  on public.workspace_tasks (workspace_id, status, created_at desc);

create index if not exists idx_workspace_tasks_workspace_due_at
  on public.workspace_tasks (workspace_id, due_at desc);

drop trigger if exists set_workspace_tasks_updated_at on public.workspace_tasks;
create trigger set_workspace_tasks_updated_at
before update on public.workspace_tasks
for each row execute procedure public.set_updated_at();

alter table public.workspace_tasks enable row level security;

drop policy if exists workspace_tasks_all on public.workspace_tasks;
create policy workspace_tasks_all on public.workspace_tasks
for all using (
  public.is_workspace_member(workspace_id)
)
with check (
  public.is_workspace_member(workspace_id)
);

create table if not exists public.workspace_evidence_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_record_id uuid not null references public.records(id) on delete cascade,
  related_record_id uuid references public.records(id) on delete set null,
  related_task_id uuid references public.workspace_tasks(id) on delete set null,
  source_anchor text,
  quote text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_evidence_links_workspace
  on public.workspace_evidence_links (workspace_id, created_at desc);

drop trigger if exists set_workspace_evidence_links_updated_at on public.workspace_evidence_links;
create trigger set_workspace_evidence_links_updated_at
before update on public.workspace_evidence_links
for each row execute procedure public.set_updated_at();

alter table public.workspace_evidence_links enable row level security;

drop policy if exists workspace_evidence_links_all on public.workspace_evidence_links;
create policy workspace_evidence_links_all on public.workspace_evidence_links
for all using (
  public.is_workspace_member(workspace_id)
)
with check (
  public.is_workspace_member(workspace_id)
);
