-- Workspace billing primitives for Stripe subscription + usage metering.

create table if not exists public.workspace_billing (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_metered_subscription_item_id text,
  stripe_meter_event_name text,
  stripe_base_price_id text,
  stripe_overage_price_id text,
  stripe_hosting_price_id text,
  billing_mode text not null default 'meter_events',
  agent_count integer not null default 1,
  plan_base_price_cents integer not null default 25000,
  hosting_price_cents integer not null default 0,
  status text not null default 'active',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_billing
  add column if not exists stripe_metered_subscription_item_id text,
  add column if not exists stripe_meter_event_name text,
  add column if not exists stripe_base_price_id text,
  add column if not exists stripe_overage_price_id text,
  add column if not exists stripe_hosting_price_id text,
  add column if not exists billing_mode text default 'meter_events',
  add column if not exists agent_count integer default 1,
  add column if not exists plan_base_price_cents integer default 25000,
  add column if not exists hosting_price_cents integer default 0,
  add column if not exists status text default 'active',
  add column if not exists trial_ends_at timestamptz,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.workspace_billing
set
  billing_mode = coalesce(billing_mode, 'meter_events'),
  agent_count = greatest(coalesce(agent_count, 1), 1),
  plan_base_price_cents = coalesce(plan_base_price_cents, 25000),
  hosting_price_cents = coalesce(hosting_price_cents, 0),
  status = coalesce(status, 'active'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.workspace_billing
  alter column billing_mode set default 'meter_events',
  alter column billing_mode set not null,
  alter column agent_count set default 1,
  alter column agent_count set not null,
  alter column plan_base_price_cents set default 25000,
  alter column plan_base_price_cents set not null,
  alter column hosting_price_cents set default 0,
  alter column hosting_price_cents set not null,
  alter column status set default 'active',
  alter column status set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_billing_mode_check'
  ) then
    alter table public.workspace_billing
      add constraint workspace_billing_mode_check
      check (billing_mode in ('usage_records', 'meter_events'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_billing_status_check'
  ) then
    alter table public.workspace_billing
      add constraint workspace_billing_status_check
      check (status in ('active', 'past_due', 'cancelled', 'trialing'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_billing_agent_count_check'
  ) then
    alter table public.workspace_billing
      add constraint workspace_billing_agent_count_check
      check (agent_count >= 1 and agent_count <= 10);
  end if;
end
$$;

create table if not exists public.credit_usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid references public.workspace_agents(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  model text not null default 'unknown',
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens bigint not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  event_type text not null default 'agent_call',
  metadata jsonb not null default '{}'::jsonb,
  stripe_usage_record_id text,
  created_at timestamptz not null default now()
);

alter table public.credit_usage_events
  add column if not exists model text default 'unknown',
  add column if not exists prompt_tokens integer default 0,
  add column if not exists completion_tokens integer default 0,
  add column if not exists total_tokens bigint default 0,
  add column if not exists cost_usd numeric(12, 6) default 0,
  add column if not exists event_type text default 'agent_call',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists stripe_usage_record_id text,
  add column if not exists created_at timestamptz default now();

update public.credit_usage_events
set
  model = coalesce(model, 'unknown'),
  prompt_tokens = greatest(coalesce(prompt_tokens, 0), 0),
  completion_tokens = greatest(coalesce(completion_tokens, 0), 0),
  total_tokens = greatest(coalesce(total_tokens, 0), 0),
  cost_usd = greatest(coalesce(cost_usd, 0), 0),
  event_type = coalesce(event_type, 'agent_call'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now());

alter table public.credit_usage_events
  alter column model set default 'unknown',
  alter column model set not null,
  alter column prompt_tokens set default 0,
  alter column prompt_tokens set not null,
  alter column completion_tokens set default 0,
  alter column completion_tokens set not null,
  alter column total_tokens set default 0,
  alter column total_tokens set not null,
  alter column cost_usd set default 0,
  alter column cost_usd set not null,
  alter column event_type set default 'agent_call',
  alter column event_type set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'credit_usage_events_prompt_tokens_check'
  ) then
    alter table public.credit_usage_events
      add constraint credit_usage_events_prompt_tokens_check
      check (prompt_tokens >= 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'credit_usage_events_completion_tokens_check'
  ) then
    alter table public.credit_usage_events
      add constraint credit_usage_events_completion_tokens_check
      check (completion_tokens >= 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'credit_usage_events_total_tokens_check'
  ) then
    alter table public.credit_usage_events
      add constraint credit_usage_events_total_tokens_check
      check (total_tokens >= 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'credit_usage_events_cost_usd_check'
  ) then
    alter table public.credit_usage_events
      add constraint credit_usage_events_cost_usd_check
      check (cost_usd >= 0);
  end if;
end
$$;

create index if not exists idx_workspace_billing_workspace
  on public.workspace_billing (workspace_id);

create index if not exists idx_workspace_billing_status
  on public.workspace_billing (status, updated_at desc);

create index if not exists idx_credit_usage_workspace_created
  on public.credit_usage_events (workspace_id, created_at desc);

create index if not exists idx_credit_usage_agent_created
  on public.credit_usage_events (agent_id, created_at desc);

create index if not exists idx_credit_usage_user_created
  on public.credit_usage_events (user_id, created_at desc);

create index if not exists idx_credit_usage_event_type_created
  on public.credit_usage_events (workspace_id, event_type, created_at desc);

drop trigger if exists trg_workspace_billing_updated_at on public.workspace_billing;
create trigger trg_workspace_billing_updated_at
before update on public.workspace_billing
for each row execute function public.set_updated_at();

alter table public.workspace_billing enable row level security;
alter table public.credit_usage_events enable row level security;

drop policy if exists workspace_billing_all on public.workspace_billing;
create policy workspace_billing_all
  on public.workspace_billing
  for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists credit_usage_events_all on public.credit_usage_events;
create policy credit_usage_events_all
  on public.credit_usage_events
  for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
