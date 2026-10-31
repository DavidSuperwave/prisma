-- Cache auth.uid() via SELECT subquery so Postgres evaluates it once per
-- statement instead of once per row. Fixes the `auth_rls_initplan`
-- performance advisor on workspaces_insert (the only RLS policy flagged).

drop policy if exists workspaces_insert on public.workspaces;

create policy workspaces_insert on public.workspaces
for insert
with check (created_by = (select auth.uid()));
