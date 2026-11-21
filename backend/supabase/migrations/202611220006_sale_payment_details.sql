-- ST-05 c2, c5 / ST-02 c8 (Charter Rev 8 BR-S5): the receipt shows the employee
-- who processed the sale and, for cash, the cash received and the change.
--
-- submit_sale has been patched by later migrations, so it is left as is.
-- submit_sale_with_payment calls it and saves the payment details in the same
-- transaction; a retry of the same checkout returns the same sale.
begin;

alter table public.sales
  add column if not exists cash_received numeric(12, 2),
  add column if not exists change_amount numeric(12, 2),
  add column if not exists served_by_name text;

alter table public.sales drop constraint if exists sales_cash_payment_details_check;
alter table public.sales
  add constraint sales_cash_payment_details_check
  check (
    (cash_received is null and change_amount is null)
    or (
      cash_received >= 0
      and change_amount >= 0
      and change_amount = cash_received - total_amount
      and lower(btrim(payment_method)) = 'cash'
    )
  );

comment on column public.sales.cash_received is 'ST-05 c5: cash handed over by the customer (cash payments only).';
comment on column public.sales.change_amount is 'ST-05 c5: change given back, cash_received - total_amount.';
comment on column public.sales.served_by_name is
  'ST-05 c2: the employee''s name when the sale was recorded, so every receipt can show it (staff can only read their own profile).';

create or replace function public.submit_sale_with_payment(
  p_transaction_reference text,
  p_branch_id uuid,
  p_payment_method text,
  p_total_amount numeric,
  p_items jsonb,
  p_addons jsonb default '[]'::jsonb,
  p_cash_received numeric default null
)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_is_cash boolean := lower(btrim(coalesce(p_payment_method, ''))) = 'cash';
  v_name text;
begin
  if v_is_cash then
    if p_cash_received is null then
      raise exception 'Enter the cash received.';
    end if;
    if p_cash_received <> round(p_cash_received, 2) or p_cash_received > 9999999999.99 then
      raise exception 'Enter the cash received in pesos with at most two decimals.';
    end if;
    if p_cash_received < round(p_total_amount, 2) then
      raise exception 'Cash received is less than the total.';
    end if;
  elsif p_cash_received is not null then
    raise exception 'Cash received applies only to cash payments.';
  end if;

  -- All sale rules, authorization, and idempotency stay in submit_sale.
  select * into v_sale
  from public.submit_sale(
    p_transaction_reference, p_branch_id, p_payment_method, p_total_amount, p_items, p_addons
  );

  select * into v_sale from public.sales where id = v_sale.id for update;

  -- A retry must carry the same payment details as the first attempt.
  if v_is_cash and v_sale.cash_received is not null and v_sale.cash_received <> p_cash_received then
    raise exception 'Transaction reference was already used with a different cash amount';
  end if;

  if v_sale.served_by_name is null then
    select nullif(btrim(full_name), '') into v_name from public.profiles where id = v_sale.staff_id;
  end if;

  update public.sales
  set cash_received = case when v_is_cash then coalesce(cash_received, p_cash_received) else cash_received end,
      change_amount = case when v_is_cash then coalesce(change_amount, p_cash_received - total_amount) else change_amount end,
      served_by_name = coalesce(served_by_name, v_name)
  where id = v_sale.id
  returning * into v_sale;

  return v_sale;
end;
$$;

revoke all on function public.submit_sale_with_payment(text, uuid, text, numeric, jsonb, jsonb, numeric) from public, anon;
grant execute on function public.submit_sale_with_payment(text, uuid, text, numeric, jsonb, jsonb, numeric) to authenticated;
alter function public.submit_sale_with_payment(text, uuid, text, numeric, jsonb, jsonb, numeric) owner to postgres;

notify pgrst, 'reload schema';
commit;
