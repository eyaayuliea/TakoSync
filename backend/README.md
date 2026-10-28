# TakoSync Supabase backend

The backend is hosted in Supabase; this repository does not add a separate server. Its source of truth is:

- `supabase/migrations/` — schema, fixed branch records, RLS, and atomic inventory/daily-check functions.
- `supabase/seed.sql` — optional sample ingredient and opening-stock fixtures.
- `services/takosync.ts` — typed client-facing auth, query, and mutation operations.
- `types/database.ts` — TypeScript database contract.

From the repository root, install the Supabase CLI, authenticate, link your project, and apply migrations:

```sh
supabase login
supabase --workdir backend link --project-ref YOUR_PROJECT_REF
supabase --workdir backend db push
```

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the root `.env` using `.env.example`. The Expo app must only receive the public publishable/anon key; never put service-role keys or database passwords in frontend configuration.

The migration seeds three fixed branches and blocks client branch creation/deletion. RLS scopes Staff to their active assigned branch and permits Owners to read all active branches. Inventory changes go through `record_inventory_transactions`; daily physical counts go through `submit_daily_stock_check` and do not mutate inventory.

Before using real stock, review and replace the fixture values in `supabase/seed.sql`. User creation, Owner bootstrap, project Auth settings, fixture instructions, and current UI limitations are documented in the repository [README](../README.md).
