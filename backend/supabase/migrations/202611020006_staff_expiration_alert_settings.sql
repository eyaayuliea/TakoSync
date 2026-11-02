create policy owner_inventory_settings_staff_read
on public.owner_inventory_settings
for select to authenticated
using (exists (
  select 1
  from public.profiles
  where id = (select auth.uid())
    and role = 'staff'
    and active
));
