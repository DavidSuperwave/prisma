-- Align intake_submissions with lib/intakeStore.ts read/write contract.
-- This keeps local migrations compatible with the live project table shape.

create table if not exists public.intake_submissions (
  id text primary key,
  workspace_id uuid references public.workspaces(id) on delete set null,
  project_id text,
  lifecycle_status text not null default 'submitted',
  business_name text not null,
  contact_name text not null,
  contact_email text not null,
  whatsapp_number text not null,
  website_url text,
  industry text not null,
  primary_color text,
  service_description text not null,
  tone_guidance text,
  notes text,
  social_links jsonb not null default '{}'::jsonb,
  assets jsonb not null default '[]'::jsonb,
  payment_status text not null default 'pending',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.intake_submissions
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists project_id text,
  add column if not exists lifecycle_status text default 'submitted',
  add column if not exists business_name text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists whatsapp_number text,
  add column if not exists website_url text,
  add column if not exists industry text,
  add column if not exists primary_color text,
  add column if not exists service_description text,
  add column if not exists tone_guidance text,
  add column if not exists notes text,
  add column if not exists social_links jsonb default '{}'::jsonb,
  add column if not exists assets jsonb default '[]'::jsonb,
  add column if not exists payment_status text default 'pending',
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.intake_submissions
set
  lifecycle_status = coalesce(lifecycle_status, 'submitted'),
  social_links = coalesce(social_links, '{}'::jsonb),
  assets = coalesce(assets, '[]'::jsonb),
  payment_status = coalesce(payment_status, 'pending'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.intake_submissions
  alter column business_name set not null,
  alter column contact_name set not null,
  alter column contact_email set not null,
  alter column whatsapp_number set not null,
  alter column industry set not null,
  alter column service_description set not null,
  alter column lifecycle_status set not null,
  alter column social_links set not null,
  alter column assets set not null,
  alter column payment_status set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

alter table public.intake_submissions
  alter column lifecycle_status set default 'submitted',
  alter column social_links set default '{}'::jsonb,
  alter column assets set default '[]'::jsonb,
  alter column payment_status set default 'pending',
  alter column created_at set default now(),
  alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'intake_submissions_lifecycle_status_check'
  ) then
    alter table public.intake_submissions
      add constraint intake_submissions_lifecycle_status_check
      check (lifecycle_status in ('submitted', 'paid', 'reviewing', 'ready_to_publish', 'published'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'intake_submissions_payment_status_check'
  ) then
    alter table public.intake_submissions
      add constraint intake_submissions_payment_status_check
      check (payment_status in ('pending', 'paid'));
  end if;
end
$$;

create index if not exists idx_intake_submissions_created_at
  on public.intake_submissions (created_at desc);

create index if not exists idx_intake_submissions_workspace
  on public.intake_submissions (workspace_id, created_at desc);

create index if not exists idx_intake_submissions_contact_email
  on public.intake_submissions (contact_email);

create index if not exists idx_intake_submissions_payment_status
  on public.intake_submissions (payment_status, created_at desc);

drop trigger if exists trg_intake_submissions_updated_at on public.intake_submissions;
create trigger trg_intake_submissions_updated_at
before update on public.intake_submissions
for each row execute function public.set_updated_at();

alter table public.intake_submissions enable row level security;
