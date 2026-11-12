begin;

-- Private, transaction-scoped authorization for trusted sale processing.
create table private.sales_processing_authorizations (
  id bigint generated always as identity primary key,
  backend_pid integer not null,
  transaction_id bigint not null,
  sale_id uuid,
  created_at timestamptz not null default clock_timestamp()
);

revoke all on table private.sales_processing_authorizations
  from public, anon, authenticated, service_role;

grant usage on schema private to postgres;
grant insert, delete on table private.sales_processing_authorizations
  to postgres;

-- A caller-controlled GUC is no longer accepted as authorization.
create or replace function public.reject_unimplemented_inventory_movements()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if new.type in ('transfer_in', 'transfer_out')
    or (
      new.type = 'sales_consumption'
      and not exists (
        select 1
        from private.sales_processing_authorizations a
        where a.backend_pid = pg_backend_pid()
          and a.transaction_id = txid_current()
          and a.sale_id is not distinct from new.sale_id
      )
    ) then
    raise exception 'This movement type requires an approved atomic workflow';
  end if;

  return new;
end;
$function$;

-- Replace the forgeable flag in the trusted sale-processing implementation.
do $migration$
declare
  v_definition text;
  v_old text;
begin
  v_definition := pg_get_functiondef(
    'public.process_sale_inventory_unchecked(uuid)'::regprocedure
  );

  v_old := 'perform set_config(''app.sales_processing'', ''true'', true);';

  if position(v_old in v_definition) = 0 then
    raise exception 'Expected sales-processing GUC statement was not found';
  end if;

  v_definition := replace(
    v_definition,
    v_old,
    'insert into private.sales_processing_authorizations (backend_pid, transaction_id, sale_id)
      values (pg_backend_pid(), txid_current(), p_sale_id);'
  );

  v_old := 'perform public.record_inventory_transactions(v_sale.branch_id, v_inventory_lines);';

  if position(v_old in v_definition) = 0 then
    raise exception 'Expected inventory recorder call was not found';
  end if;

  v_definition := replace(
    v_definition,
    v_old,
    'perform public.record_inventory_transactions(v_sale.branch_id, v_inventory_lines);
      delete from private.sales_processing_authorizations
      where backend_pid = pg_backend_pid()
        and transaction_id = txid_current()
        and sale_id = p_sale_id;'
  );

  execute v_definition;
end;
$migration$;

notify pgrst, 'reload schema';

commit;
