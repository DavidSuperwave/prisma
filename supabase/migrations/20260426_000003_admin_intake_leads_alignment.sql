-- Align intake_submissions and workspaces with admin leads spec.
-- Keeps existing intake lifecycle/payment fields intact for backward compatibility.

alter table public.intake_submissions
  add column if not exists full_name text,
  add column if not exists email text,
  add column if not exists business_location text,
  add column if not exists reason text,
  add column if not exists brand_assets text[] default '{}'::text[],
  add column if not exists lead_score integer default 0,
  add column if not exists status text default 'new',
  add column if not exists admin_notes text,
  add column if not exists referral_source text;

update public.intake_submissions
set
  full_name = coalesce(nullif(full_name, ''), nullif(contact_name, '')),
  email = coalesce(nullif(email, ''), nullif(contact_email, '')),
  business_location = coalesce(nullif(business_location, ''), nullif(industry, '')),
  reason = coalesce(nullif(reason, ''), nullif(service_description, '')),
  brand_assets = coalesce(brand_assets, '{}'::text[]),
  status = coalesce(
    nullif(status, ''),
    case
      when workspace_id is not null or project_id is not null or lifecycle_status = 'published' then 'workspace_created'
      when lifecycle_status in ('paid', 'reviewing', 'ready_to_publish') then 'contacted'
      when lifecycle_status in ('submitted', 'published') then 'new'
      else 'new'
    end
  ),
  lead_score = coalesce(
    lead_score,
    (
      case
        when website_url is not null and btrim(website_url) <> '' then 1
        else 0
      end
      + case
          when array_length(brand_assets, 1) is not null and array_length(brand_assets, 1) > 0 then 2
          else 0
        end
      + case
          when coalesce(lower(business_location), '') similar to '%(cdmx|ciudad de mexico|monterrey|guadalajara)%' then 1
          else 0
        end
      + case
          when coalesce(lower(reason), '') like '%actualizar%' then 1
          else 0
        end
    )
  );

alter table public.intake_submissions
  alter column full_name set not null,
  alter column email set not null,
  alter column business_location set not null,
  alter column reason set not null,
  alter column brand_assets set default '{}'::text[],
  alter column brand_assets set not null,
  alter column lead_score set default 0,
  alter column lead_score set not null,
  alter column status set default 'new',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'intake_submissions_status_check'
  ) then
    alter table public.intake_submissions
      add constraint intake_submissions_status_check
      check (status in ('new', 'contacted', 'workspace_created', 'rejected'));
  end if;
end
$$;

create index if not exists idx_intake_submissions_status_created
  on public.intake_submissions (status, created_at desc);

create index if not exists idx_intake_submissions_lead_score
  on public.intake_submissions (lead_score desc, created_at desc);

create index if not exists idx_intake_submissions_email
  on public.intake_submissions (email);

alter table public.workspaces
  add column if not exists intake_submission_id text references public.intake_submissions(id) on delete set null;

create index if not exists idx_workspaces_intake_submission
  on public.workspaces (intake_submission_id);
