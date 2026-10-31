-- Normalized extraction runtime tables:
-- - field_extraction_configs
-- - record_field_provenance
-- - extraction_review_items

create table if not exists public.field_extraction_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  object_id uuid not null references public.workspace_objects(id) on delete cascade,
  field_id uuid not null references public.workspace_fields(id) on delete cascade,
  source_ref text,
  prompt_template text not null default '',
  validation_rule jsonb not null default '{}'::jsonb,
  confidence_threshold numeric(5,4) not null default 0.7000 check (confidence_threshold >= 0 and confidence_threshold <= 1),
  enabled boolean not null default true,
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, field_id)
);

create index if not exists idx_field_extraction_configs_workspace_object
  on public.field_extraction_configs (workspace_id, object_id);

create index if not exists idx_field_extraction_configs_enabled
  on public.field_extraction_configs (workspace_id, enabled);

drop trigger if exists trg_field_extraction_configs_updated_at
  on public.field_extraction_configs;
create trigger trg_field_extraction_configs_updated_at
before update on public.field_extraction_configs
for each row execute function public.set_updated_at();

alter table public.field_extraction_configs enable row level security;

drop policy if exists field_extraction_configs_select
  on public.field_extraction_configs;
create policy field_extraction_configs_select
  on public.field_extraction_configs
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists field_extraction_configs_insert
  on public.field_extraction_configs;
create policy field_extraction_configs_insert
  on public.field_extraction_configs
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists field_extraction_configs_update
  on public.field_extraction_configs;
create policy field_extraction_configs_update
  on public.field_extraction_configs
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists field_extraction_configs_delete
  on public.field_extraction_configs;
create policy field_extraction_configs_delete
  on public.field_extraction_configs
  for delete using (public.is_workspace_member(workspace_id));

create table if not exists public.record_field_provenance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  record_id uuid not null references public.records(id) on delete cascade,
  object_id uuid not null references public.workspace_objects(id) on delete cascade,
  field_id uuid not null references public.workspace_fields(id) on delete cascade,
  extraction_config_id uuid references public.field_extraction_configs(id) on delete set null,
  source_document_id uuid references public.records(id) on delete set null,
  source_type text not null default 'document' check (source_type in ('document', 'web', 'manual', 'agent')),
  value_snapshot jsonb not null default 'null'::jsonb,
  source_quote text,
  source_span jsonb,
  source_bbox jsonb,
  model text,
  prompt_version integer,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_record_field_provenance_record_field
  on public.record_field_provenance (workspace_id, record_id, field_id, created_at desc);

create index if not exists idx_record_field_provenance_field
  on public.record_field_provenance (workspace_id, field_id, created_at desc);

create index if not exists idx_record_field_provenance_document
  on public.record_field_provenance (workspace_id, source_document_id);

alter table public.record_field_provenance enable row level security;

drop policy if exists record_field_provenance_select
  on public.record_field_provenance;
create policy record_field_provenance_select
  on public.record_field_provenance
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists record_field_provenance_insert
  on public.record_field_provenance;
create policy record_field_provenance_insert
  on public.record_field_provenance
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists record_field_provenance_update
  on public.record_field_provenance;
create policy record_field_provenance_update
  on public.record_field_provenance
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists record_field_provenance_delete
  on public.record_field_provenance;
create policy record_field_provenance_delete
  on public.record_field_provenance
  for delete using (public.is_workspace_member(workspace_id));

create table if not exists public.extraction_review_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  record_id uuid not null references public.records(id) on delete cascade,
  object_id uuid not null references public.workspace_objects(id) on delete cascade,
  field_id uuid not null references public.workspace_fields(id) on delete cascade,
  extraction_config_id uuid references public.field_extraction_configs(id) on delete set null,
  provenance_id uuid references public.record_field_provenance(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'dismissed')),
  reason text not null default 'low_confidence' check (reason in ('low_confidence', 'missing_value', 'conflict', 'validation_failed', 'manual_flag')),
  proposed_value jsonb not null default 'null'::jsonb,
  current_value jsonb not null default 'null'::jsonb,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  notes text,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_extraction_review_items_queue
  on public.extraction_review_items (workspace_id, status, created_at desc);

create index if not exists idx_extraction_review_items_record_field
  on public.extraction_review_items (workspace_id, record_id, field_id, created_at desc);

drop trigger if exists trg_extraction_review_items_updated_at
  on public.extraction_review_items;
create trigger trg_extraction_review_items_updated_at
before update on public.extraction_review_items
for each row execute function public.set_updated_at();

alter table public.extraction_review_items enable row level security;

drop policy if exists extraction_review_items_select
  on public.extraction_review_items;
create policy extraction_review_items_select
  on public.extraction_review_items
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists extraction_review_items_insert
  on public.extraction_review_items;
create policy extraction_review_items_insert
  on public.extraction_review_items
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists extraction_review_items_update
  on public.extraction_review_items;
create policy extraction_review_items_update
  on public.extraction_review_items
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists extraction_review_items_delete
  on public.extraction_review_items;
create policy extraction_review_items_delete
  on public.extraction_review_items
  for delete using (public.is_workspace_member(workspace_id));
