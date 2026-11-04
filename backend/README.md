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

The migrations provision exactly three branch records and do not grant clients permission to create or delete branches. RLS scopes Staff inventory/activity reads to the active assigned branch and allows active Owners to read across active branches. Staff can read the Owner-configured expiration-alert window but cannot change it. Inventory mutations are performed through `record_inventory_transactions`; `submit_daily_stock_check` records physical counts and discrepancies without changing inventory. The base tables are `branch_inventory` and `inventory_movements`; security-invoker views named `inventory` and `inventory_transactions` preserve the existing app query contract while enforcing the base-table RLS policies.

Migration `202610300001_business_schema_extensions.sql` adds products, recipes, sales, sale items, audit logs, branch addresses, expiration tracking, and the remaining standard ingredients. These structures are protected by RLS. Migration `202611020000_inventory_transaction_type_labels.sql` idempotently adds the inventory transaction enum labels before dependent catalog and sales migrations. Migrations `202611020001` through `202611020003` add the catalog, atomic sale and prepared-batter inventory RPCs, and transaction-reference locking. Migration `202611020005_owner_discrepancy_adjustments.sql` adds the Owner-authorized, audited discrepancy adjustment operation; `202611020006_staff_expiration_alert_settings.sql` permits active Staff to read the expiration window without granting write access. Sale writes remain unavailable directly to client roles; Staff checkout calls the trusted `submit_sale` RPC, which validates the branch, menu prices, and sale reference before processing inventory atomically. Recipe-driven consumption only applies to active recipes configured for automatic consumption. No real menu prices or recipe quantities are seeded, and no cancellation/refund workflow currently reverses completed sales.

## Business-day authentication expiration

Migration `202611040001_business_day_session_expiration.sql` adds server-enforced session authorization using Supabase Auth session IDs and PostgreSQL time. The default schedule is 16:00 opening, 22:00 normal closing, 23:00 extended closing, and `Asia/Manila`; the current Manila business date receives a default settings row. Opening time is stored and validated as configuration, but this feature does not add a new before-opening login restriction—the existing login policy remains unchanged. The deadline is the normal close unless an owner enables that date's extension.

Immediately after password sign-in, the app calls `authorize_business_session`. On app restore it calls `business_session_status`. All currently RLS-protected public tables receive an additional restrictive policy and a write guard; existing role and branch policies remain in force. Session rows have no client grants and cannot be changed by Staff or Owners. The Owner app's **More → Business closing time** control displays the server's current Manila date and close time and calls the owner-only `set_business_day_settings` RPC to authorize or disable the 11 PM extension. The RPC is the only client route for changing today's or a future date's schedule. Configuration changes apply to sessions for that business date and update the Owner app's local expiration timer.

Supabase Auth controls JWT refresh independently of PostgreSQL. This migration does not revoke or claim to prevent issuance of a refreshed JWT. A refresh cannot create or change the immutable business-session row, however, and all protected database reads, writes, and RPCs are rejected at or after the configured closing timestamp. A session from a previous business date must sign in again; inactive or deleted Auth sessions are rejected.

To apply manually, confirm the target is the same Supabase project configured for the app, then open that project's SQL Editor and execute the **entire** `202611040001_business_day_session_expiration.sql` migration. The script first checks that the existing migrations through `202611020006_staff_expiration_alert_settings.sql` are recorded as applied; if not, it aborts before changing the database. After a successful run, the same script prints one row of verification results and today's effective schedule. The separate file `supabase/manual/202611040001_business_day_session_expiration_verification.sql` contains additional read-only detail only if needed. Creating the migration file does not update the hosted database. If the SQL Editor is used, reconcile local/remote migration history before a future CLI `db push`; do not rerun or mark a migration applied without confirming its status.

The database test `supabase/tests/202611040001_business_day_session_expiration.test.sql` exercises normal and extended deadlines at controlled timestamps, including the exact closing boundary and Manila-to-UTC conversion. New authenticated business tables and security-definer RPCs must continue to apply the session gate; the restrictive policies and write triggers cover relations existing when this migration runs.

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
