# TakoSync Supabase backend

The backend is Supabase PostgreSQL and Auth; there is no separate application server. The Expo client-facing Supabase client and application queries/mutations live in `../frontend/services/`. The database schema, access policies, and transactional logic are maintained here:

- `supabase/migrations/` — three fixed branches, schema, RLS, and database functions.
- `supabase/seed.sql` — optional sample balances and example batches; not production data.
- `types/database.ts` — TypeScript contract for the Supabase schema.

From the repository root, install the [Supabase CLI](https://supabase.com/docs/guides/cli), authenticate, link your project, and apply migrations:

```sh
supabase login
supabase --workdir backend link --project-ref YOUR_PROJECT_REF
supabase --workdir backend db push
```

Configure the root `.env` using `../.env.example`. Only the Supabase URL and public publishable/anon key belong in the Expo client. Never put service-role keys or database passwords in frontend configuration.

The migrations provision exactly three branch records and do not grant clients permission to create or delete branches. RLS scopes Staff inventory/activity reads to the active assigned branch and allows active Owners to read across active branches. Inventory mutations are performed through `record_inventory_transactions`; `submit_daily_stock_check` records physical counts and discrepancies without changing inventory.

Migration `202610280002_default_ingredients.sql` provisions eight ingredients and zero-quantity inventory rows for active branches while preserving existing balances. `supabase/seed.sql` additionally provides demonstration balances for four ingredients at Branch 1, zero balances for those ingredients at Branches 2 and 3, and example batches. Review it before running. For a remote database, apply the seed manually only when desired; local `supabase db reset` is destructive to the local database and runs the configured seed.

New Auth users receive a Staff profile assigned to Branch 1. Bootstrap the Owner and manage branch assignments through a trusted administrative process; those management screens are not implemented in the app. The root [README](../README.md) documents setup, security, and current feature limitations.
