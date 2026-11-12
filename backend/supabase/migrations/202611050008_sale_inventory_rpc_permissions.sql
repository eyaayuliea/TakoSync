begin;

-- Internal implementation: never directly executable by API clients.
revoke all on function public.process_sale_inventory_unchecked(uuid)
  from public, anon, authenticated;

-- Guarded entry point: authenticated users may execute it.
revoke all on function public.process_sale_inventory(uuid)
  from public, anon;
grant execute on function public.process_sale_inventory(uuid)
  to authenticated;

-- Ensure both functions execute with the intended privileged ownership.
alter function public.process_sale_inventory_unchecked(uuid)
  owner to postgres;
alter function public.process_sale_inventory(uuid)
  owner to postgres;

notify pgrst, 'reload schema';

commit;
