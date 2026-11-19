-- MANUAL SEED - NOT A MIGRATION AND NOT APPLIED ANYWHERE.
--
-- Sets the Staff POS add-on prices to the approved values:
--   Japanese mayonnaise  PHP 10
--   Takoyaki sauce       PHP 15
--   Flakes               PHP 10
--
-- Why this exists: the Staff POS reads add-on names and prices straight from
-- public.menu_addons (see loadStaffMenuCatalog). The catalog migration only seeds the
-- rows with `on conflict do nothing`, so a database whose rows already exist with other
-- prices (or were added by hand) is never corrected by migrations.
--
-- menu_addons is global, not per branch: columns are id, addon_code (unique),
-- addon_name (unique), price, active. One row per add-on therefore covers all branches.
--
-- Behaviour:
--   * Matches an existing row by add-on code OR by a known name variant (the catalog
--     migration seeds the mayonnaise row as 'Japanese white sauce'), and only updates
--     price and active. Names/codes are NOT renamed, so sale history and receipts are
--     unchanged. Rename the row yourself if you want the POS to say 'Japanese mayonnaise'
--     (the POS matches both names).
--   * Inserts a row only when no matching row exists.
--   * Idempotent: running it twice changes nothing the second time.
--
-- Run only in an approved Development project (or in Production after an administrator
-- review). Requires an Owner/admin SQL session because RLS restricts writes to owners.

begin;

do $$
declare
  v_item record;
  v_updated integer;
begin
  for v_item in
    select * from (values
      ('japanese-mayonnaise', 'Japanese mayonnaise', 10::numeric,
        array['japanese-white-sauce', 'japanese-mayonnaise', 'japanese-mayo'],
        array['japanese white sauce', 'japanese mayonnaise', 'japanese mayo']),
      ('takoyaki-sauce', 'Takoyaki sauce', 15::numeric,
        array['takoyaki-sauce'],
        array['takoyaki sauce']),
      ('flakes', 'Flakes', 10::numeric,
        array['flakes', 'bonito-flakes'],
        array['flakes', 'bonito flakes'])
    ) as item(addon_code, addon_name, price, codes, names)
  loop
    update public.menu_addons
    set price = v_item.price,
        active = true
    where addon_code = any (v_item.codes)
       or lower(btrim(addon_name)) = any (v_item.names);
    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      insert into public.menu_addons (addon_code, addon_name, price, active)
      values (v_item.addon_code, v_item.addon_name, v_item.price, true);
    end if;
  end loop;
end;
$$;

-- Review before committing.
select addon_code, addon_name, price, active
from public.menu_addons
order by addon_name;

commit;

notify pgrst, 'reload schema';
