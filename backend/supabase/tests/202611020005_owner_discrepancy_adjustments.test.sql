begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.authorize_inventory_discrepancy_adjustment(uuid,text)',
    'execute'
  ),
  'the former one-step adjustment RPC is unavailable to authenticated clients'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.authorize_inventory_discrepancy_adjustment_unchecked(uuid,text)',
    'execute'
  ),
  'the unchecked legacy adjustment function remains unavailable'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.request_inventory_count_correction(uuid,uuid,numeric,text)',
    'execute'
  ),
  'anonymous clients cannot submit correction requests'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.decide_inventory_count_correction(uuid,text,text)',
    'execute'
  ),
  'anonymous clients cannot decide correction requests'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.validate_inventory_count_correction(uuid,text)',
    'execute'
  ),
  'anonymous clients cannot validate counts'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.request_inventory_count_correction(uuid,uuid,numeric,text)',
    'execute'
  ),
  'authenticated requests use the Staff-checked correction RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.decide_inventory_count_correction(uuid,text,text)',
    'execute'
  ),
  'Owner decisions use the role-checked decision RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.validate_inventory_count_correction(uuid,text)',
    'execute'
  ),
  'Validate Count is a separately callable guarded RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.inventory_discrepancy_adjustments', 'INSERT'),
  'authenticated clients cannot directly insert inventory adjustment audit rows'
);
select ok(
  not has_table_privilege('authenticated', 'public.inventory_discrepancy_adjustments', 'UPDATE'),
  'authenticated clients cannot alter inventory adjustment audit rows'
);
select ok(
  not has_table_privilege('authenticated', 'public.inventory_discrepancy_adjustments', 'DELETE'),
  'authenticated clients cannot delete inventory adjustment audit rows'
);
select ok(
  not has_table_privilege('authenticated', 'public.inventory_count_correction_requests', 'INSERT'),
  'correction request history cannot be written directly by clients'
);
select ok(
  not has_table_privilege('authenticated', 'public.inventory_count_correction_requests', 'UPDATE'),
  'correction request decisions cannot be rewritten directly by clients'
);
select ok(
  not has_table_privilege('authenticated', 'public.inventory_count_validations', 'INSERT'),
  'Validate Count audit rows cannot be written directly by clients'
);

select * from finish();
rollback;
