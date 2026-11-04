begin;

do $migration$
declare
  v_process_function_source text;
begin
  select routine.prosrc
  into v_process_function_source
  from pg_proc routine
  where routine.oid = to_regprocedure('public.process_sale_inventory(uuid)');

  if v_process_function_source is null then
    raise exception 'Required public.process_sale_inventory(uuid) function is missing';
  end if;

  if position('is_business_session_active' in v_process_function_source) > 0 then
    return;
  end if;

  if to_regprocedure('public.process_sale_inventory_integrity_unchecked(uuid)') is not null then
    raise exception 'Unexpected process_sale_inventory_integrity_unchecked(uuid) already exists';
  end if;

  execute 'alter function public.process_sale_inventory(uuid) rename to process_sale_inventory_integrity_unchecked';
  execute 'revoke all on function public.process_sale_inventory_integrity_unchecked(uuid) from public, anon, authenticated';

  execute $function$
    create function public.process_sale_inventory(p_sale_id uuid)
    returns jsonb
    language plpgsql
    volatile
    security definer
    set search_path = public, pg_temp
    as $body$
    begin
      if not public.is_business_session_active() then
        raise exception using
          errcode = '42501',
          message = 'The business session has expired; authenticate again for the next business date';
      end if;

      return public.process_sale_inventory_integrity_unchecked(p_sale_id);
    end;
    $body$;
  $function$;

  execute 'revoke all on function public.process_sale_inventory(uuid) from public, anon';
  execute 'grant execute on function public.process_sale_inventory(uuid) to authenticated';
  execute 'alter function public.process_sale_inventory_integrity_unchecked(uuid) owner to postgres';
  execute 'alter function public.process_sale_inventory(uuid) owner to postgres';
end;
$migration$;

notify pgrst, 'reload schema';

commit;
