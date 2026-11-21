begin;

-- ST-02 c5 / OW-21 c4, c6 / BR-S6 (#30): the owner sets a maximum purchasing
-- quantity per sellable menu variant (flavor + portion type, Charter Rev 8
-- Products mapping). NULL means no maximum has been set yet.
alter table public.product_variants
  add column if not exists max_order_quantity integer;

alter table public.product_variants
  drop constraint if exists product_variants_max_order_quantity_positive;
alter table public.product_variants
  add constraint product_variants_max_order_quantity_positive
  check (max_order_quantity is null or max_order_quantity > 0);

comment on column public.product_variants.max_order_quantity is
  'Maximum quantity of this menu variant in a single order (ST-02 c5). NULL = no maximum set.';

-- Server-side enforcement. A trigger on sale_items covers every insert path,
-- including submit_sale, without redefining it. Raising here aborts the whole
-- sale transaction, so an over-limit order is never partly saved. Idempotent
-- replays of an existing sale insert no items and are unaffected.
create or replace function public.enforce_sale_item_max_order_quantity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max integer;
begin
  if new.product_variant_id is null then
    return new;
  end if;
  select variant.max_order_quantity into v_max
  from public.product_variants variant
  where variant.id = new.product_variant_id;
  if v_max is not null and new.quantity > v_max then
    raise exception using
      errcode = 'P0001',
      message = format('Order quantity exceeds the maximum of %s per order for this product', v_max);
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_sale_item_max_order_quantity() from public, anon, authenticated;

drop trigger if exists sale_items_enforce_max_order_quantity on public.sale_items;
create trigger sale_items_enforce_max_order_quantity
  before insert on public.sale_items
  for each row
  execute function public.enforce_sale_item_max_order_quantity();

commit;
