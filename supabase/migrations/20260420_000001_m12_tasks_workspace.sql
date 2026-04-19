-- M12: Unified Tasks workspace (ClickUp-style).
-- Promotes workspace_tasks into a first-class list/board-ready surface with
-- custom fields backed by the meta-model (workspace_fields on a virtual
-- 'tasks' workspace_object), per-list custom status sets, and subtasks.

-- 1. Extend workspace_objects kind constraint to include 'tasks' -------------

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'workspace_objects_kind_check') then
    alter table public.workspace_objects
      drop constraint workspace_objects_kind_check;
  end if;

  alter table public.workspace_objects
    add constraint workspace_objects_kind_check
    check (kind is null or kind in ('crm_people', 'crm_companies', 'crm_deals', 'tasks'));
end
$$;

-- 2. Task lists (ClickUp-style projects) -------------------------------------

create table if not exists public.workspace_task_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  icon text,
  color text,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create index if not exists idx_workspace_task_lists_workspace
  on public.workspace_task_lists (workspace_id, sort_order);

drop trigger if exists set_workspace_task_lists_updated_at on public.workspace_task_lists;
create trigger set_workspace_task_lists_updated_at
before update on public.workspace_task_lists
for each row execute procedure public.set_updated_at();

-- Enforce one default list per workspace.
create or replace function public.enforce_single_default_task_list()
returns trigger
language plpgsql
as $$
begin
  if new.is_default is true then
    update public.workspace_task_lists
    set is_default = false, updated_at = now()
    where workspace_id = new.workspace_id
      and id <> new.id
      and is_default is true;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_single_default_task_list on public.workspace_task_lists;
create trigger enforce_single_default_task_list
after insert or update of is_default on public.workspace_task_lists
for each row execute procedure public.enforce_single_default_task_list();

-- 3. Task statuses (per-list custom or workspace default when list_id = null)

create table if not exists public.workspace_task_statuses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  list_id uuid references public.workspace_task_lists(id) on delete cascade,
  key text not null,
  label text not null,
  color text,
  category text not null default 'todo'
    check (category in ('todo', 'in_progress', 'done', 'blocked')),
  sort_order integer not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_workspace_task_statuses_workspace_key
  on public.workspace_task_statuses (workspace_id, coalesce(list_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

create index if not exists idx_workspace_task_statuses_list
  on public.workspace_task_statuses (list_id, sort_order);

drop trigger if exists set_workspace_task_statuses_updated_at on public.workspace_task_statuses;
create trigger set_workspace_task_statuses_updated_at
before update on public.workspace_task_statuses
for each row execute procedure public.set_updated_at();

-- 4. Extend workspace_tasks --------------------------------------------------

alter table public.workspace_tasks
  add column if not exists list_id uuid references public.workspace_task_lists(id) on delete set null,
  add column if not exists parent_task_id uuid references public.workspace_tasks(id) on delete cascade,
  add column if not exists custom_data jsonb not null default '{}'::jsonb,
  add column if not exists sort_order integer not null default 0,
  add column if not exists description text;

create index if not exists idx_workspace_tasks_list
  on public.workspace_tasks (workspace_id, list_id, status, sort_order);

create index if not exists idx_workspace_tasks_parent
  on public.workspace_tasks (parent_task_id)
  where parent_task_id is not null;

-- 5. RLS ---------------------------------------------------------------------

alter table public.workspace_task_lists enable row level security;
alter table public.workspace_task_statuses enable row level security;

drop policy if exists workspace_task_lists_all on public.workspace_task_lists;
create policy workspace_task_lists_all on public.workspace_task_lists
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists workspace_task_statuses_all on public.workspace_task_statuses;
create policy workspace_task_statuses_all on public.workspace_task_statuses
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

-- 6. Seed virtual tasks object + default list + default status set -----------

do $$
declare
  ws record;
  tasks_obj_id uuid;
  default_list_id uuid;
begin
  for ws in select id from public.workspaces loop
    -- Tasks virtual object ------------------------------------------------
    select id into tasks_obj_id
    from public.workspace_objects
    where workspace_id = ws.id and kind = 'tasks'
    limit 1;

    if tasks_obj_id is null then
      insert into public.workspace_objects (
        workspace_id, name, singular_name, plural_name, description, icon, kind, is_system
      ) values (
        ws.id, 'Tasks', 'Tarea', 'Tareas',
        'Tareas operativas del workspace (manuales + generadas por agentes).',
        'check-square', 'tasks', true
      )
      returning id into tasks_obj_id;
    end if;

    -- Locked core fields for the tasks object (so the Smart View editor
    -- can filter/sort/group by them like any other meta-model field).
    insert into public.workspace_fields (workspace_id, object_id, name, key, type, required, options, is_locked, sort_order)
    values
      (ws.id, tasks_obj_id, 'Título',      'title',                'text',   true,  '{}'::jsonb, true, 0),
      (ws.id, tasks_obj_id, 'Estado',      'status',               'status', true,
        jsonb_build_object('values', jsonb_build_array(
          'pending','in_progress','needs_review','follow_up','blocked','awaiting_approval','completed'
        )), true, 10),
      (ws.id, tasks_obj_id, 'Prioridad',   'priority',             'status', false,
        jsonb_build_object('values', jsonb_build_array('low','normal','high','urgent')), true, 20),
      (ws.id, tasks_obj_id, 'Asignado a',  'assigned_to_user_id',  'text',   false, '{}'::jsonb, true, 30),
      (ws.id, tasks_obj_id, 'Agente',      'owner_agent_id',       'text',   false, '{}'::jsonb, true, 40),
      (ws.id, tasks_obj_id, 'Vence',       'due_at',               'date',   false, '{}'::jsonb, true, 50),
      (ws.id, tasks_obj_id, 'Recordatorio','reminder_at',          'date',   false, '{}'::jsonb, true, 60),
      (ws.id, tasks_obj_id, 'Tipo',        'type',                 'text',   false, '{}'::jsonb, true, 70),
      (ws.id, tasks_obj_id, 'Lista',       'list_id',              'relation', false,
        jsonb_build_object('relation_kind', 'task_list'), true, 80),
      (ws.id, tasks_obj_id, 'Tarea padre', 'parent_task_id',       'relation', false,
        jsonb_build_object('relation_kind', 'task'), true, 90),
      (ws.id, tasks_obj_id, 'Descripción', 'description',          'text',   false, '{}'::jsonb, true, 100)
    on conflict (object_id, key) do update
      set is_locked = true;

    -- Default list --------------------------------------------------------
    select id into default_list_id
    from public.workspace_task_lists
    where workspace_id = ws.id and is_default = true
    limit 1;

    if default_list_id is null then
      insert into public.workspace_task_lists (workspace_id, name, description, icon, color, is_default, sort_order)
      values (ws.id, 'General', 'Lista de tareas por defecto.', 'list-checks', '#2563eb', true, 0)
      returning id into default_list_id;
    end if;

    -- Workspace-default status set (list_id = null) -----------------------
    insert into public.workspace_task_statuses (workspace_id, list_id, key, label, color, category, sort_order, is_system)
    values
      (ws.id, null, 'pending',           'Pendiente',        '#94a3b8', 'todo',        0,  true),
      (ws.id, null, 'in_progress',       'En progreso',      '#2563eb', 'in_progress', 10, true),
      (ws.id, null, 'needs_review',      'Por revisar',      '#f59e0b', 'in_progress', 20, true),
      (ws.id, null, 'follow_up',         'Seguimiento',      '#7c3aed', 'in_progress', 30, true),
      (ws.id, null, 'blocked',           'Bloqueada',        '#dc2626', 'blocked',     40, true),
      (ws.id, null, 'awaiting_approval', 'Pend. aprobación', '#e11d48', 'blocked',     50, true),
      (ws.id, null, 'completed',         'Completada',       '#16a34a', 'done',        60, true)
    on conflict do nothing;

    -- Backfill: every existing task without a list goes into the default.
    update public.workspace_tasks
    set list_id = default_list_id
    where workspace_id = ws.id and list_id is null;

  end loop;
end
$$;
