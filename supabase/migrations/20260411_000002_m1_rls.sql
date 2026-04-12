-- Prisma M1 RLS policies
-- Enforces workspace isolation based on workspace membership.

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

grant execute on function public.is_workspace_member(uuid) to anon, authenticated, service_role;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_objects enable row level security;
alter table public.workspace_fields enable row level security;
alter table public.workspace_views enable row level security;
alter table public.records enable row level security;
alter table public.workspace_agents enable row level security;
alter table public.agent_activity enable row level security;
alter table public.agent_events enable row level security;

drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
for select using (
  public.is_workspace_member(id)
);

drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces
for insert with check (
  created_by = auth.uid()
);

drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces
for update using (
  public.is_workspace_member(id)
)
with check (
  public.is_workspace_member(id)
);

drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members
for select using (
  public.is_workspace_member(workspace_id)
);

drop policy if exists workspace_members_insert on public.workspace_members;
create policy workspace_members_insert on public.workspace_members
for insert with check (
  public.is_workspace_member(workspace_id)
);

drop policy if exists workspace_members_update on public.workspace_members;
create policy workspace_members_update on public.workspace_members
for update using (
  public.is_workspace_member(workspace_id)
)
with check (
  public.is_workspace_member(workspace_id)
);

drop policy if exists workspace_members_delete on public.workspace_members;
create policy workspace_members_delete on public.workspace_members
for delete using (
  public.is_workspace_member(workspace_id)
);

drop policy if exists workspace_objects_all on public.workspace_objects;
create policy workspace_objects_all on public.workspace_objects
for all using (
  public.is_workspace_member(workspace_id)
)
with check (
  public.is_workspace_member(workspace_id)
);

drop policy if exists workspace_fields_all on public.workspace_fields;
create policy workspace_fields_all on public.workspace_fields
for all using (
  public.is_workspace_member(workspace_id)
)
with check (
  public.is_workspace_member(workspace_id)
);

drop policy if exists workspace_views_all on public.workspace_views;
create policy workspace_views_all on public.workspace_views
for all using (
  public.is_workspace_member(workspace_id)
)
with check (
  public.is_workspace_member(workspace_id)
);

drop policy if exists records_all on public.records;
create policy records_all on public.records
for all using (
  public.is_workspace_member(workspace_id)
)
with check (
  public.is_workspace_member(workspace_id)
);

drop policy if exists workspace_agents_all on public.workspace_agents;
create policy workspace_agents_all on public.workspace_agents
for all using (
  public.is_workspace_member(workspace_id)
)
with check (
  public.is_workspace_member(workspace_id)
);

drop policy if exists agent_activity_all on public.agent_activity;
create policy agent_activity_all on public.agent_activity
for all using (
  public.is_workspace_member(workspace_id)
)
with check (
  public.is_workspace_member(workspace_id)
);

drop policy if exists agent_events_all on public.agent_events;
create policy agent_events_all on public.agent_events
for all using (
  public.is_workspace_member(workspace_id)
)
with check (
  public.is_workspace_member(workspace_id)
);
