git push# TakoSync Supabase backend

The backend is Supabase PostgreSQL and Auth; there is no separate application server. The Expo client-facing Supabase client and application queries/mutations live in `../frontend/services/`. The database schema, access policies, and transactional logic are maintained here:


From the repository root, install the [Supabase CLI](https://supabase.com/docs/guides/cli), authenticate, and link the existing shared project:

```sh
supabase login
supabase --workdir backend link --project-ref YOUR_PROJECT_REF
supabase --workdir backend migration list --remote
supabase --workdir backend db push --remote --include-all --dry-run
```

Review the migration history and dry-run before applying anything to an existing database. The enum compatibility migration is intentionally ordered before the menu and sales migrations, so `--include-all` is required when the remote has already recorded a later version. Confirm that the preview includes only expected migrations; if it includes any other missing migration, or the schema/history differs, stop and reconcile with the project administrator. Do not reset the database or blindly mark migrations applied. After review, apply with `supabase --workdir backend db push --remote --include-all`.

Copy the root `.env.example` to the root `.env` and set `EXPO_PUBLIC_SUPABASE_URL` plus `EXPO_PUBLIC_SUPABASE_ANON_KEY` to this same project. Only a client-safe publishable/anon key belongs in Expo. Never put service-role keys or database passwords in frontend configuration or Git.

The migrations provision exactly three branch records and do not grant clients permission to create or delete branches. RLS scopes Staff inventory/activity reads to the active assigned branch and allows active Owners to read across active branches. Inventory mutations are performed through `record_inventory_transactions`; `submit_daily_stock_check` records physical counts and discrepancies without changing inventory. The base tables are `branch_inventory` and `inventory_movements`; security-invoker views named `inventory` and `inventory_transactions` preserve the existing app query contract while enforcing the base-table RLS policies.

Migration `202610300001_business_schema_extensions.sql` adds products, recipes, sales, sale items, audit logs, branch addresses, expiration tracking, and the remaining standard ingredients. These structures are protected by RLS. Migration `202611020000_inventory_transaction_type_labels.sql` idempotently adds the inventory transaction enum labels before dependent catalog and sales migrations. Migrations `202611020001` through `202611020003` add the catalog, atomic sale and prepared-batter inventory RPCs, and transaction-reference locking. Sale writes remain unavailable directly to client roles; Staff checkout calls the trusted `submit_sale` RPC, which validates the branch, menu prices, and sale reference before processing inventory atomically. Recipe-driven consumption only applies to active recipes configured for automatic consumption. No real menu prices or recipe quantities are seeded, and no cancellation/refund workflow currently reverses completed sales.

The sale migration checks for duplicate `sales_consumption` movements using a text comparison, which remains valid if a legacy database lacks that enum label. Its unique index uses the immutable `notes LIKE 'sale:%'` predicate and keys by branch, sale reference, ingredient, and transaction type.

Migration `202610280002_default_ingredients.sql` provisions eight ingredients and zero-quantity inventory rows for active branches while preserving existing balances. `supabase/seed.sql` additionally provides demonstration balances for four ingredients at Branch 1, zero balances for those ingredients at Branches 2 and 3, and example batches. Review it before running. For a remote database, apply the seed manually only when desired; local `supabase db reset` is destructive to the local database and runs the configured seed.

The `auth.users` trigger creates an inactive, unassigned Staff profile for each new Auth user. The `staff_requires_branch` constraint permits that inactive bootstrap state but requires every active Staff profile to have a branch. Create Auth users through Supabase Dashboard or another trusted Admin API; never insert profiles without matching Auth users. Before sharing credentials, use the SQL Editor as a trusted administrator to set the Owner profile to `role = 'owner'`, `branch_id = null`, `active = true`, and each Staff profile to its assigned branch with `active = true`. Public sign-ups should remain disabled in the hosted Auth settings.

Before provisioning or distributing access, audit existing profiles against the approved account roster. The bootstrap migration intentionally does not change existing profiles:

```sql
select
  p.id,
  p.email,
  p.role,
  p.branch_id,
  b.code as branch_code,
  p.active
from public.profiles as p
left join public.branches as b on b.id = p.branch_id
order by p.role, p.email;
```

Investigate any active account not on the approved roster and correct it through a trusted administrative process. Do not rely on the bootstrap migration to deactivate existing accounts. The root [README](../README.md) documents the shared GitHub workflow and app setup.

## Three-collaborator workflow

All three developers should have their own GitHub and Supabase project access. Each keeps a local ignored `.env` with the same project URL and public key. Schema changes are new migration files reviewed in a pull request; never rewrite a migration already applied to the shared project.

The repository includes `.github/workflows/supabase-migrations.yml`, which applies migrations after migration changes are merged to `main` (or by manual workflow dispatch). Before enabling it, create a protected GitHub environment named `supabase-production`, require a reviewer, and configure:

- Environment secret `SUPABASE_DB_URL` containing the session pooler connection string from the Supabase
  dashboard's **Connect** dialog. Use the session pooler (port `5432`) with host
  `<region>.pooler.supabase.com`, username `postgres.<project-ref>`, database `postgres`, and
  `sslmode=require`.

Do not use the service-role key for this workflow. The database URL is a privileged deployment
credential and must remain in a GitHub environment secret. The workflow does not distribute source
code to collaborators; everyone still pulls merged commits from GitHub.

The workflow uses the session pooler URL explicitly because the hosted GitHub runner may otherwise select an
unreachable IPv6 address for the direct database host. It previews pending SQL before applying migrations.
