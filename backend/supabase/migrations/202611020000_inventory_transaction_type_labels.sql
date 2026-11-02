alter type public.inventory_transaction_type
  add value if not exists 'sales_consumption';
alter type public.inventory_transaction_type
  add value if not exists 'transfer_in';
alter type public.inventory_transaction_type
  add value if not exists 'transfer_out';
