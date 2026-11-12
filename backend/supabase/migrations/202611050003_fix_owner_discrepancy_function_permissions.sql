-- Restore secure ownership and execution permissions for inventory
-- discrepancy authorization functions.

begin;

-- Keep the unchecked implementation inaccessible to client roles.
revoke all on function
  public.authorize_inventory_discrepancy_adjustment_unchecked(uuid, text)
  from public, anon, authenticated;

-- Restrict the public-facing wrapper to authenticated users.
revoke all on function
  public.authorize_inventory_discrepancy_adjustment(uuid, text)
  from public, anon, authenticated;

-- Transfer both SECURITY DEFINER functions to the privileged owner.
alter function
  public.authorize_inventory_discrepancy_adjustment_unchecked(uuid, text)
  owner to postgres;

alter function
  public.authorize_inventory_discrepancy_adjustment(uuid, text)
  owner to postgres;

-- Only the guarded wrapper is callable by authenticated users.
grant execute on function
  public.authorize_inventory_discrepancy_adjustment(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
