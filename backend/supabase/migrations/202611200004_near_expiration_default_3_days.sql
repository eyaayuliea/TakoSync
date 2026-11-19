begin;

-- Approved inventory status rule (owner message pt29u): Near Expiration = within 3 days of the
-- expiration date. ST-10 / OM-10 define the window as the owner's expiration alert period, which
-- stays configurable (1-365 days); 3 days becomes the default instead of 7.
-- Status classification itself lives in the mobile app (frontend/services/inventoryStatusRules.ts);
-- no SQL view or function computes Low Stock / Near Expiration / Expired / Out of Stock.
-- NOT applied by this change set.

alter table public.owner_inventory_settings
  alter column near_expiration_days set default 3;

-- Only the old untouched default (7) is moved to 3. Any other value the owner configured is kept.
update public.owner_inventory_settings
set near_expiration_days = 3
where near_expiration_days = 7;

commit;
