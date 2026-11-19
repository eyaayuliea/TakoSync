begin;

-- public.record_inventory_transactions_idempotent validated each transaction
-- entry with jsonb_object_length(), which does not exist in PostgreSQL. Every
-- Staff Stock-In / Stock-Out / Waste submit therefore failed with
-- "function jsonb_object_length(jsonb) does not exist".
-- The intended rule is "exactly nine keys"; count them with jsonb_object_keys().
-- The live function body is patched in place so nothing else changes.
do $migration$
declare
  v_definition text;
  v_old constant text := 'jsonb_object_length(v_entry)';
  v_new constant text := '(select count(*) from jsonb_object_keys(v_entry))';
begin
  v_definition := pg_get_functiondef(
    'public.record_inventory_transactions_idempotent(uuid, uuid, jsonb)'::regprocedure
  );

  if position(v_old in v_definition) = 0 then
    -- Already corrected; nothing to do.
    return;
  end if;

  execute replace(v_definition, v_old, v_new);
end;
$migration$;

-- Keep the original ownership and grants explicit.
revoke all on function public.record_inventory_transactions_idempotent(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.record_inventory_transactions_idempotent(uuid, uuid, jsonb)
  to authenticated;
alter function public.record_inventory_transactions_idempotent(uuid, uuid, jsonb) owner to postgres;

notify pgrst, 'reload schema';

commit;
