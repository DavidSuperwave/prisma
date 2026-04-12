-- M1 RLS isolation verification
-- Requires:
-- 1) migration files applied
-- 2) seed file applied with USER_A_ID and USER_B_ID

begin;

-- Simulate USER_A session
select set_config('request.jwt.claim.sub', :'USER_A_ID', true);
select set_config('role', 'authenticated', true);

do $$
declare
  own_count integer;
  foreign_count integer;
begin
  select count(*) into own_count
  from public.records
  where workspace_id = 'a1111111-1111-1111-1111-111111111111';

  select count(*) into foreign_count
  from public.records
  where workspace_id = 'b2222222-2222-2222-2222-222222222222';

  if own_count < 1 then
    raise exception 'USER_A should see at least one record in Workspace A';
  end if;

  if foreign_count <> 0 then
    raise exception 'USER_A should see zero records in Workspace B, found %', foreign_count;
  end if;
end
$$;

-- Simulate USER_B session
select set_config('request.jwt.claim.sub', :'USER_B_ID', true);
select set_config('role', 'authenticated', true);

do $$
declare
  own_count integer;
  foreign_count integer;
begin
  select count(*) into own_count
  from public.records
  where workspace_id = 'b2222222-2222-2222-2222-222222222222';

  select count(*) into foreign_count
  from public.records
  where workspace_id = 'a1111111-1111-1111-1111-111111111111';

  if own_count < 1 then
    raise exception 'USER_B should see at least one record in Workspace B';
  end if;

  if foreign_count <> 0 then
    raise exception 'USER_B should see zero records in Workspace A, found %', foreign_count;
  end if;
end
$$;

rollback;
