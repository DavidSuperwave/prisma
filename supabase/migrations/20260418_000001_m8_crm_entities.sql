-- M8 CRM entities: foundation for Close.com-grade CRM on top of Prisma meta-model.
-- Adds kind/is_system/is_locked flags, pipelines + stages, activity timeline,
-- custom activity types. Backfills or seeds system CRM objects + default Sales pipeline.

-- 1. Workspace objects gain explicit kind + is_system flag ---------------------

alter table public.workspace_objects
  add column if not exists kind text,
  add column if not exists is_system boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workspace_objects_kind_check'
  ) then
    alter table public.workspace_objects
      add constraint workspace_objects_kind_check
      check (kind is null or kind in ('crm_people', 'crm_companies', 'crm_deals'));
  end if;
end
$$;

create unique index if not exists idx_workspace_objects_workspace_kind_unique
  on public.workspace_objects (workspace_id, kind)
  where kind is not null;

-- 2. Fields gain is_locked flag ------------------------------------------------

alter table public.workspace_fields
  add column if not exists is_locked boolean not null default false;

-- 3. Pipelines + stages --------------------------------------------------------

create table if not exists public.workspace_pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create index if not exists idx_workspace_pipelines_workspace
  on public.workspace_pipelines (workspace_id, sort_order);

drop trigger if exists set_workspace_pipelines_updated_at on public.workspace_pipelines;
create trigger set_workspace_pipelines_updated_at
before update on public.workspace_pipelines
for each row execute procedure public.set_updated_at();

create or replace function public.enforce_single_default_pipeline()
returns trigger
language plpgsql
as $$
begin
  if new.is_default is true then
    update public.workspace_pipelines
    set is_default = false, updated_at = now()
    where workspace_id = new.workspace_id
      and id <> new.id
      and is_default is true;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_single_default_pipeline on public.workspace_pipelines;
create trigger enforce_single_default_pipeline
after insert or update of is_default on public.workspace_pipelines
for each row execute procedure public.enforce_single_default_pipeline();

create table if not exists public.workspace_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pipeline_id uuid not null references public.workspace_pipelines(id) on delete cascade,
  name text not null,
  stage_type text not null default 'active' check (stage_type in ('active', 'won', 'lost')),
  sort_order integer not null default 0,
  probability numeric(5, 2) not null default 0,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_pipeline_stages_pipeline
  on public.workspace_pipeline_stages (workspace_id, pipeline_id, sort_order);

drop trigger if exists set_workspace_pipeline_stages_updated_at on public.workspace_pipeline_stages;
create trigger set_workspace_pipeline_stages_updated_at
before update on public.workspace_pipeline_stages
for each row execute procedure public.set_updated_at();

-- 4. Custom activity types -----------------------------------------------------

create table if not exists public.workspace_activity_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null,
  name text not null,
  icon text,
  custom_fields jsonb not null default '[]'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create index if not exists idx_workspace_activity_types_workspace
  on public.workspace_activity_types (workspace_id, key);

drop trigger if exists set_workspace_activity_types_updated_at on public.workspace_activity_types;
create trigger set_workspace_activity_types_updated_at
before update on public.workspace_activity_types
for each row execute procedure public.set_updated_at();

-- 5. Record activity timeline --------------------------------------------------

create table if not exists public.record_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  record_id uuid not null references public.records(id) on delete cascade,
  object_id uuid not null references public.workspace_objects(id) on delete cascade,
  type text not null,
  activity_type_id uuid references public.workspace_activity_types(id) on delete set null,
  author_user_id uuid references auth.users(id) on delete set null,
  author_agent_id uuid references public.workspace_agents(id) on delete set null,
  subject text,
  body text,
  data jsonb not null default '{}'::jsonb,
  is_pinned boolean not null default false,
  occurred_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_record_activities_record
  on public.record_activities (record_id, occurred_at desc)
  where deleted_at is null;

create index if not exists idx_record_activities_workspace_type
  on public.record_activities (workspace_id, type, occurred_at desc)
  where deleted_at is null;

create index if not exists idx_record_activities_pinned
  on public.record_activities (record_id)
  where is_pinned = true and deleted_at is null;

drop trigger if exists set_record_activities_updated_at on public.record_activities;
create trigger set_record_activities_updated_at
before update on public.record_activities
for each row execute procedure public.set_updated_at();

create or replace function public.enforce_pinned_notes_limit()
returns trigger
language plpgsql
as $$
declare
  pinned_count integer;
begin
  if new.is_pinned is not true then
    return new;
  end if;
  select count(*) into pinned_count
  from public.record_activities
  where record_id = new.record_id
    and is_pinned = true
    and (deleted_at is null)
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if pinned_count >= 5 then
    raise exception 'Max 5 pinned notes per record';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_pinned_notes_limit on public.record_activities;
create trigger enforce_pinned_notes_limit
before insert or update of is_pinned on public.record_activities
for each row execute procedure public.enforce_pinned_notes_limit();

-- 6. RLS -----------------------------------------------------------------------

alter table public.workspace_pipelines enable row level security;
alter table public.workspace_pipeline_stages enable row level security;
alter table public.workspace_activity_types enable row level security;
alter table public.record_activities enable row level security;

drop policy if exists workspace_pipelines_all on public.workspace_pipelines;
create policy workspace_pipelines_all on public.workspace_pipelines
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists workspace_pipeline_stages_all on public.workspace_pipeline_stages;
create policy workspace_pipeline_stages_all on public.workspace_pipeline_stages
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists workspace_activity_types_all on public.workspace_activity_types;
create policy workspace_activity_types_all on public.workspace_activity_types
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists record_activities_all on public.record_activities;
create policy record_activities_all on public.record_activities
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

-- 7. Backfill + seed CRM objects for every workspace --------------------------

do $$
declare
  ws record;
  existing_obj record;
  people_id uuid;
  companies_id uuid;
  deals_id uuid;
  pipeline_id uuid;
begin
  for ws in select id from public.workspaces loop

    -- People --------------------------------------------------------------------
    select id into people_id
    from public.workspace_objects
    where workspace_id = ws.id
      and (
        name ilike '%lead%'
        or singular_name ilike '%lead%'
        or plural_name ilike '%lead%'
        or name ilike '%people%'
        or name ilike '%contact%'
      )
    order by created_at asc
    limit 1;

    if people_id is not null then
      update public.workspace_objects
      set kind = 'crm_people',
          is_system = true,
          singular_name = coalesce(singular_name, 'Persona'),
          plural_name = coalesce(plural_name, 'Personas'),
          icon = coalesce(icon, 'users')
      where id = people_id and kind is null;
    else
      insert into public.workspace_objects (workspace_id, name, singular_name, plural_name, description, icon, kind, is_system)
      values (ws.id, 'People', 'Persona', 'Personas', 'Contactos y prospectos del CRM.', 'users', 'crm_people', true)
      returning id into people_id;
    end if;

    -- Companies ----------------------------------------------------------------
    select id into companies_id
    from public.workspace_objects
    where workspace_id = ws.id
      and (
        name ilike '%compan%'
        or name ilike '%empresa%'
        or name ilike '%account%'
        or name ilike '%cuenta%'
      )
    order by created_at asc
    limit 1;

    if companies_id is not null then
      update public.workspace_objects
      set kind = 'crm_companies',
          is_system = true,
          singular_name = coalesce(singular_name, 'Empresa'),
          plural_name = coalesce(plural_name, 'Empresas'),
          icon = coalesce(icon, 'building-2')
      where id = companies_id and kind is null;
    else
      insert into public.workspace_objects (workspace_id, name, singular_name, plural_name, description, icon, kind, is_system)
      values (ws.id, 'Companies', 'Empresa', 'Empresas', 'Cuentas y empresas del CRM.', 'building-2', 'crm_companies', true)
      returning id into companies_id;
    end if;

    -- Deals --------------------------------------------------------------------
    select id into deals_id
    from public.workspace_objects
    where workspace_id = ws.id
      and (
        name ilike '%deal%'
        or name ilike '%opportun%'
        or name ilike '%oportunidad%'
        or name ilike '%venta%'
      )
    order by created_at asc
    limit 1;

    if deals_id is not null then
      update public.workspace_objects
      set kind = 'crm_deals',
          is_system = true,
          singular_name = coalesce(singular_name, 'Oportunidad'),
          plural_name = coalesce(plural_name, 'Oportunidades'),
          icon = coalesce(icon, 'trending-up')
      where id = deals_id and kind is null;
    else
      insert into public.workspace_objects (workspace_id, name, singular_name, plural_name, description, icon, kind, is_system)
      values (ws.id, 'Deals', 'Oportunidad', 'Oportunidades', 'Oportunidades de venta del CRM.', 'trending-up', 'crm_deals', true)
      returning id into deals_id;
    end if;

    -- Locked core fields - people ---------------------------------------------
    insert into public.workspace_fields (workspace_id, object_id, name, key, type, required, options, is_locked, sort_order)
    values
      (ws.id, people_id, 'Nombre completo', 'full_name', 'text', true,  '{}'::jsonb, true, 0),
      (ws.id, people_id, 'Email',           'email',     'text', false, '{}'::jsonb, true, 10),
      (ws.id, people_id, 'Teléfono',        'phone',     'text', false, '{}'::jsonb, true, 20),
      (ws.id, people_id, 'Etapa',           'stage',     'status', true,
        jsonb_build_object('values', jsonb_build_array('new','qualified','customer','lost')),
        true, 30),
      (ws.id, people_id, 'Fuente',          'source',    'text', false, '{}'::jsonb, true, 40),
      (ws.id, people_id, 'Owner',           'owner_user_id', 'text', false, '{}'::jsonb, true, 50),
      (ws.id, people_id, 'Score',           'score',     'number', false, '{}'::jsonb, true, 60),
      (ws.id, people_id, 'Empresa',         'company_id','relation', false,
        jsonb_build_object('relation_kind', 'crm_companies'),
        true, 70)
    on conflict (object_id, key) do update
      set is_locked = true;

    -- Locked core fields - companies ------------------------------------------
    insert into public.workspace_fields (workspace_id, object_id, name, key, type, required, options, is_locked, sort_order)
    values
      (ws.id, companies_id, 'Nombre',   'name',          'text', true,  '{}'::jsonb, true, 0),
      (ws.id, companies_id, 'Dominio',  'domain',        'text', false, '{}'::jsonb, true, 10),
      (ws.id, companies_id, 'Industria','industry',      'text', false, '{}'::jsonb, true, 20),
      (ws.id, companies_id, 'Tamaño',   'size',          'text', false, '{}'::jsonb, true, 30),
      (ws.id, companies_id, 'Owner',    'owner_user_id', 'text', false, '{}'::jsonb, true, 40)
    on conflict (object_id, key) do update
      set is_locked = true;

    -- Default Sales pipeline ---------------------------------------------------
    select id into pipeline_id
    from public.workspace_pipelines
    where workspace_id = ws.id and is_default = true
    limit 1;

    if pipeline_id is null then
      insert into public.workspace_pipelines (workspace_id, name, description, is_default, sort_order)
      values (ws.id, 'Ventas', 'Pipeline comercial por defecto.', true, 0)
      returning id into pipeline_id;

      insert into public.workspace_pipeline_stages (workspace_id, pipeline_id, name, stage_type, sort_order, probability, color)
      values
        (ws.id, pipeline_id, 'Nuevo',      'active', 0,  10,  '#2563eb'),
        (ws.id, pipeline_id, 'Calificado', 'active', 10, 30,  '#7c3aed'),
        (ws.id, pipeline_id, 'Propuesta',  'active', 20, 60,  '#f59e0b'),
        (ws.id, pipeline_id, 'Ganado',     'won',    30, 100, '#16a34a'),
        (ws.id, pipeline_id, 'Perdido',    'lost',   40, 0,   '#dc2626');
    end if;

    -- Locked core fields - deals -----------------------------------------------
    insert into public.workspace_fields (workspace_id, object_id, name, key, type, required, options, is_locked, sort_order)
    values
      (ws.id, deals_id, 'Título',             'title',              'text',     true,  '{}'::jsonb, true, 0),
      (ws.id, deals_id, 'Monto',              'amount',             'currency', false, '{}'::jsonb, true, 10),
      (ws.id, deals_id, 'Moneda',             'currency',           'text',     false, jsonb_build_object('default', 'USD'), true, 20),
      (ws.id, deals_id, 'Pipeline',           'pipeline_id',        'relation', false, jsonb_build_object('relation_kind','pipeline'), true, 30),
      (ws.id, deals_id, 'Etapa',              'stage_id',           'relation', true,  jsonb_build_object('relation_kind','pipeline_stage'), true, 40),
      (ws.id, deals_id, 'Confianza (%)',      'confidence',         'number',   false, '{}'::jsonb, true, 50),
      (ws.id, deals_id, 'Cierre estimado',    'close_date',         'date',     false, '{}'::jsonb, true, 60),
      (ws.id, deals_id, 'Empresa',            'company_id',         'relation', false, jsonb_build_object('relation_kind','crm_companies'), true, 70),
      (ws.id, deals_id, 'Contacto principal', 'primary_contact_id', 'relation', false, jsonb_build_object('relation_kind','crm_people'), true, 80),
      (ws.id, deals_id, 'Owner',              'owner_user_id',      'text',     false, '{}'::jsonb, true, 90)
    on conflict (object_id, key) do update
      set is_locked = true;

    -- Default activity types ---------------------------------------------------
    insert into public.workspace_activity_types (workspace_id, key, name, icon, is_system, custom_fields)
    values
      (ws.id, 'note',              'Nota',                 'sticky-note',  true,  '[]'::jsonb),
      (ws.id, 'inbound',           'Mensaje entrante',     'inbox',        true,  '[]'::jsonb),
      (ws.id, 'outbound_email',    'Email enviado',        'mail',         true,  '[]'::jsonb),
      (ws.id, 'outbound_sms',      'SMS enviado',          'message-square', true, '[]'::jsonb),
      (ws.id, 'outbound_whatsapp', 'WhatsApp enviado',     'message-circle', true, '[]'::jsonb),
      (ws.id, 'call_logged',       'Llamada registrada',   'phone',        true,  '[]'::jsonb),
      (ws.id, 'status_change',     'Cambio de etapa',      'flag',         true,  '[]'::jsonb),
      (ws.id, 'task_completed',    'Tarea completada',     'check-square', true,  '[]'::jsonb),
      (ws.id, 'deal_created',      'Oportunidad creada',   'trending-up',  true,  '[]'::jsonb),
      (ws.id, 'deal_won',          'Oportunidad ganada',   'trophy',       true,  '[]'::jsonb),
      (ws.id, 'deal_lost',         'Oportunidad perdida',  'flag-off',     true,  '[]'::jsonb),
      (ws.id, 'demo_completed',    'Demo completada',      'video',        false, '[]'::jsonb),
      (ws.id, 'contract_sent',     'Contrato enviado',     'file-signature', false, '[]'::jsonb)
    on conflict (workspace_id, key) do nothing;

  end loop;
end
$$;
