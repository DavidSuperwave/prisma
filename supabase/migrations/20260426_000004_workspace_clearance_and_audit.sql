-- Workspace feature flags, clearance controls, and audit logging.

create table if not exists public.workspace_feature_flags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  can_use_agents boolean not null default true,
  can_view_billing boolean not null default false,
  can_invite_members boolean not null default true,
  can_create_automations boolean not null default false,
  can_export_data boolean not null default true,
  can_access_connectors boolean not null default false,
  simplified_mode boolean not null default true,
  max_members integer not null default 3,
  max_agents integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_members
  add column if not exists clearance_level integer default 2,
  add column if not exists visible_sections text[] default array['dashboard', 'agents', 'records']::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_members_clearance_level_check'
  ) then
    alter table public.workspace_members
      add constraint workspace_members_clearance_level_check
      check (clearance_level between 1 and 4);
  end if;
end
$$;

alter table public.workspace_objects
  add column if not exists min_clearance_level integer default 1;

alter table public.workspace_agents
  add column if not exists min_clearance_level integer default 1,
  add column if not exists allowed_user_ids uuid[] default array[]::uuid[];

create table if not exists public.workspace_audit_log (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  risk_level text not null default 'low',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_audit_log_risk_level_check'
  ) then
    alter table public.workspace_audit_log
      add constraint workspace_audit_log_risk_level_check
      check (risk_level in ('low', 'medium', 'high'));
  end if;
end
$$;

create index if not exists idx_workspace_feature_flags_workspace
  on public.workspace_feature_flags (workspace_id);

create index if not exists idx_workspace_audit_log_workspace_created
  on public.workspace_audit_log (workspace_id, created_at desc);

create index if not exists idx_workspace_audit_log_risk
  on public.workspace_audit_log (workspace_id, risk_level, created_at desc);

drop trigger if exists trg_workspace_feature_flags_updated_at on public.workspace_feature_flags;
create trigger trg_workspace_feature_flags_updated_at
before update on public.workspace_feature_flags
for each row execute function public.set_updated_at();

alter table public.workspace_feature_flags enable row level security;
alter table public.workspace_audit_log enable row level security;

-- Feature flags are workspace-scoped and require membership.
drop policy if exists workspace_feature_flags_all on public.workspace_feature_flags;
drop policy if exists workspace_feature_flags_select on public.workspace_feature_flags;
drop policy if exists workspace_feature_flags_insert on public.workspace_feature_flags;
drop policy if exists workspace_feature_flags_update on public.workspace_feature_flags;
drop policy if exists workspace_feature_flags_delete on public.workspace_feature_flags;

create policy workspace_feature_flags_select
  on public.workspace_feature_flags
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy workspace_feature_flags_insert
  on public.workspace_feature_flags
  for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy workspace_feature_flags_update
  on public.workspace_feature_flags
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy workspace_feature_flags_delete
  on public.workspace_feature_flags
  for delete
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- Audit log: members can read their workspace audit entries; writes go through
-- the service-role client only (no INSERT/UPDATE/DELETE policies for authenticated).
drop policy if exists workspace_audit_log_all on public.workspace_audit_log;
drop policy if exists workspace_audit_log_select on public.workspace_audit_log;

create policy workspace_audit_log_select
  on public.workspace_audit_log
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));
