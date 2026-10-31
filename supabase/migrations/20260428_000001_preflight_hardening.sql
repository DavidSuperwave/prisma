-- Preflight hardening before Vercel deploy.
-- - Adds workspace_members.is_platform_admin (DB-driven admin flag).
-- - Locks down function search_path on helpers flagged by Supabase advisors.
-- - Adds missing RLS policies for agent_templates, intake_submissions,
--   and workspace_dashboard_cards.
-- - Codifies the intake-assets storage bucket and its object policies.

-- ============================================================================
-- 1. Platform admin flag on workspace_members
-- ============================================================================
alter table public.workspace_members
  add column if not exists is_platform_admin boolean not null default false;

create index if not exists idx_workspace_members_platform_admin
  on public.workspace_members (user_id)
  where is_platform_admin = true;

-- ============================================================================
-- 2. Pin search_path on helper functions flagged by get_advisors.
--    These are trigger/utility functions; pinning search_path prevents
--    search-path injection via role-level overrides.
-- ============================================================================
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.sync_workspace_conversation_after_message()
  set search_path = public, pg_temp;
alter function public.enforce_single_default_pipeline()
  set search_path = public, pg_temp;
alter function public.enforce_pinned_notes_limit()
  set search_path = public, pg_temp;
alter function public.prevent_system_object_delete()
  set search_path = public, pg_temp;
alter function public.protect_system_object_update()
  set search_path = public, pg_temp;
alter function public.protect_locked_field()
  set search_path = public, pg_temp;
alter function public.enforce_pipeline_stage_invariants()
  set search_path = public, pg_temp;
alter function public.enforce_single_default_task_list()
  set search_path = public, pg_temp;

-- ============================================================================
-- 3. RLS policies for tables where RLS was enabled but no policies existed.
-- ============================================================================

-- agent_templates: global catalog. Readable by any signed-in user; writes only
-- via service role (no insert/update/delete policy for authenticated).
alter table public.agent_templates enable row level security;

drop policy if exists agent_templates_select on public.agent_templates;
create policy agent_templates_select
  on public.agent_templates
  for select
  to anon, authenticated
  using (
    coalesce(is_active, true) = true
  );

-- intake_submissions: writes always go through /api/intake (service role),
-- so we do NOT grant any authenticated/anon insert policy. Reads are blocked
-- explicitly so PostgREST cannot leak submissions.
alter table public.intake_submissions enable row level security;

drop policy if exists intake_submissions_insert on public.intake_submissions;

drop policy if exists intake_submissions_select_none on public.intake_submissions;
create policy intake_submissions_select_none
  on public.intake_submissions
  for select
  to anon, authenticated
  using (false);

-- workspace_dashboard_cards: workspace-scoped.
alter table public.workspace_dashboard_cards enable row level security;

drop policy if exists workspace_dashboard_cards_all on public.workspace_dashboard_cards;
create policy workspace_dashboard_cards_all
  on public.workspace_dashboard_cards
  for all
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ============================================================================
-- 4. Storage: codify the intake-assets bucket so a fresh Supabase project
-- reproduces the current setup.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('intake-assets', 'intake-assets', true)
on conflict (id) do update set public = excluded.public;

-- Note: the bucket is public, so object URLs already serve without a SELECT
-- policy. Adding one would enable anonymous LIST of objects metadata, which the
-- Supabase public_bucket_allows_listing advisor flags. We intentionally skip a
-- storage.objects SELECT policy here.
drop policy if exists "intake-assets read public" on storage.objects;

-- Authenticated members of *any* workspace can upload to intake-assets; the
-- app enforces per-workspace path conventions server-side via service role.
drop policy if exists "intake-assets insert authenticated" on storage.objects;
create policy "intake-assets insert authenticated"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'intake-assets');

drop policy if exists "intake-assets update authenticated" on storage.objects;
create policy "intake-assets update authenticated"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'intake-assets')
  with check (bucket_id = 'intake-assets');

drop policy if exists "intake-assets delete authenticated" on storage.objects;
create policy "intake-assets delete authenticated"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'intake-assets');
