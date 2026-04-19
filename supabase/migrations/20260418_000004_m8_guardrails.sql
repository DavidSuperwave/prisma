-- M8 guardrails: enforce core CRM invariants at DB level.

-- Prevent deletion of system-managed objects.
create or replace function public.prevent_system_object_delete()
returns trigger
language plpgsql
as $$
begin
  if old.is_system is true then
    raise exception 'Cannot delete system-managed CRM object (%).', old.name;
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_system_object_delete on public.workspace_objects;
create trigger prevent_system_object_delete
before delete on public.workspace_objects
for each row execute procedure public.prevent_system_object_delete();

-- Prevent downgrading kind/is_system on a system object.
create or replace function public.protect_system_object_update()
returns trigger
language plpgsql
as $$
begin
  if old.is_system is true then
    if new.is_system is false then
      raise exception 'Cannot unset is_system on a system-managed CRM object.';
    end if;
    if old.kind is not null and new.kind is distinct from old.kind then
      raise exception 'Cannot change kind of a system-managed CRM object.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_system_object_update on public.workspace_objects;
create trigger protect_system_object_update
before update on public.workspace_objects
for each row execute procedure public.protect_system_object_update();

-- Prevent deletion of locked fields; prevent key/type/lock downgrades.
create or replace function public.protect_locked_field()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_locked is true then
      raise exception 'Cannot delete locked CRM field (%).', old.key;
    end if;
    return old;
  end if;
  if old.is_locked is true then
    if new.is_locked is false then
      raise exception 'Cannot unlock a locked CRM field (%).', old.key;
    end if;
    if new.key is distinct from old.key then
      raise exception 'Cannot rename key of a locked CRM field (%).', old.key;
    end if;
    if new.type is distinct from old.type then
      raise exception 'Cannot change type of a locked CRM field (%).', old.key;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_locked_field_delete on public.workspace_fields;
create trigger protect_locked_field_delete
before delete on public.workspace_fields
for each row execute procedure public.protect_locked_field();

drop trigger if exists protect_locked_field_update on public.workspace_fields;
create trigger protect_locked_field_update
before update on public.workspace_fields
for each row execute procedure public.protect_locked_field();

-- Pipeline: require at least one active and one won stage when the pipeline
-- has any stage at all, so Won/Lost semantics remain valid.
create or replace function public.enforce_pipeline_stage_invariants()
returns trigger
language plpgsql
as $$
declare
  pipeline_uuid uuid;
  active_count integer;
  won_count integer;
begin
  if tg_op = 'DELETE' then
    pipeline_uuid := old.pipeline_id;
  else
    pipeline_uuid := new.pipeline_id;
  end if;

  select
    count(*) filter (where stage_type = 'active'),
    count(*) filter (where stage_type = 'won')
  into active_count, won_count
  from public.workspace_pipeline_stages
  where pipeline_id = pipeline_uuid;

  -- When a pipeline has zero stages we allow it (fresh pipeline being seeded).
  if active_count + won_count = 0 then
    return coalesce(new, old);
  end if;

  if active_count < 1 then
    raise exception 'Pipeline must keep at least one active stage.';
  end if;
  if won_count < 1 then
    raise exception 'Pipeline must keep at least one won stage.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists enforce_pipeline_stage_invariants_ins on public.workspace_pipeline_stages;
create constraint trigger enforce_pipeline_stage_invariants_ins
after insert on public.workspace_pipeline_stages
deferrable initially deferred
for each row execute procedure public.enforce_pipeline_stage_invariants();

drop trigger if exists enforce_pipeline_stage_invariants_upd on public.workspace_pipeline_stages;
create constraint trigger enforce_pipeline_stage_invariants_upd
after update of stage_type on public.workspace_pipeline_stages
deferrable initially deferred
for each row execute procedure public.enforce_pipeline_stage_invariants();

drop trigger if exists enforce_pipeline_stage_invariants_del on public.workspace_pipeline_stages;
create constraint trigger enforce_pipeline_stage_invariants_del
after delete on public.workspace_pipeline_stages
deferrable initially deferred
for each row execute procedure public.enforce_pipeline_stage_invariants();
