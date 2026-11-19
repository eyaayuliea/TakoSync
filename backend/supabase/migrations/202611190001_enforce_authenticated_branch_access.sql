begin;

-- This helper now validates the live Auth session only; business hours and
-- business-day expiration are not authentication requirements.
create or replace function public.is_active_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_business_session_active()
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and role = 'owner'
        and active
    );
$$;

create or replace function public.can_access_branch(target_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_business_session_active()
    and exists (
      select 1
      from public.branches
      where id = target_branch and active
    )
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and active
        and (
          role = 'owner'
          or (role = 'staff' and branch_id = target_branch)
        )
    );
$$;

revoke all on function public.is_active_owner() from public, anon;
grant execute on function public.is_active_owner() to authenticated;
revoke all on function public.can_access_branch(uuid) from public, anon;
grant execute on function public.can_access_branch(uuid) to authenticated;
alter function public.is_active_owner() owner to postgres;
alter function public.can_access_branch(uuid) owner to postgres;

do $migration$
declare
  v_helper_name text;
  v_wrapper text;
begin
  if to_regprocedure('public.process_sale_inventory_integrity_unchecked(uuid)') is not null then
    v_helper_name := 'process_sale_inventory_integrity_unchecked';
  elsif to_regprocedure('public.process_sale_inventory_unchecked(uuid)') is not null then
    v_helper_name := 'process_sale_inventory_unchecked';
  else
    raise exception 'No internal sale inventory implementation exists';
  end if;

  v_wrapper := format($ddl$
    create or replace function public.process_sale_inventory(p_sale_id uuid)
    returns jsonb
    language plpgsql
    volatile
    security definer
    set search_path = public, pg_temp
    as $function$
    declare
      v_branch_id uuid;
    begin
      if not public.is_business_session_active() then
        raise exception using
          errcode = '42501',
          message = 'Authentication session is not active';
      end if;

      select branch_id into v_branch_id
      from public.sales
      where id = p_sale_id;
      if not found then
        raise exception 'Sale was not found';
      end if;
      if not public.can_access_branch(v_branch_id) then
        raise exception using
          errcode = '42501',
          message = 'Sale processing access denied';
      end if;

      return public.%I(p_sale_id);
    end;
    $function$;
  $ddl$, v_helper_name);
  execute v_wrapper;

  if to_regprocedure('public.process_sale_inventory_unchecked(uuid)') is not null then
    execute 'revoke all on function public.process_sale_inventory_unchecked(uuid) from public, anon, authenticated, service_role';
    execute 'alter function public.process_sale_inventory_unchecked(uuid) owner to postgres';
  end if;
  if to_regprocedure('public.process_sale_inventory_integrity_unchecked(uuid)') is not null then
    execute 'revoke all on function public.process_sale_inventory_integrity_unchecked(uuid) from public, anon, authenticated, service_role';
    execute 'alter function public.process_sale_inventory_integrity_unchecked(uuid) owner to postgres';
  end if;
end;
$migration$;

revoke all on function public.process_sale_inventory(uuid) from public, anon;
grant execute on function public.process_sale_inventory(uuid) to authenticated;
alter function public.process_sale_inventory(uuid) owner to postgres;

notify pgrst, 'reload schema';
commit;
