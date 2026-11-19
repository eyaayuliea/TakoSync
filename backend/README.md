git push# TakoSync Supabase backend

The backend is Supabase PostgreSQL and Auth; there is no separate application server. The Expo client-facing Supabase client and application queries/mutations live in `../frontend/services/`. The database schema, access policies, and transactional logic are maintained here:


## Database safety and setup

The linked project (`lofltjhvivcjuyezxaif`) is **Production**. **Decision (2026-11-19, project owner): Production is the approved target for the `fix/core-workflow-db` work.** There is no separate Development project; the same project that the team already uses through the app's `.env` is where these migrations are applied. This replaces the earlier rule that forbade linking the CLI to Production, running remote SQL or pushing/repairing migrations. It does **not** relax the points below.

Rules for working against Production:

- Only a person who has Supabase project access and the database password runs these commands (the CLI must be logged in with `supabase login` and linked with `supabase link --project-ref lofltjhvivcjuyezxaif`). The database password and service-role key never go into Git, `.env`, or the Expo app.
- Take a backup first: `supabase db dump -f <folder>/schema.sql` and `supabase db dump --data-only -f <folder>/data.sql` into a timestamped folder outside the repository, and check that the files are not empty.
- Compare ledgers with `supabase migration list`. For each pending migration, verify against the real schema whether its effects already exist; use `supabase migration repair --status applied <version>` only for versions whose effects are verifiably complete (for example `202611180000`, see [Migration renumbering](#migration-renumbering-202611180001--202611180000)). Never repair blindly.
- Run `supabase db push --dry-run`, read the SQL, then `supabase db push`. If a migration fails, stop and inspect; do not improvise destructive fixes.
- Afterwards run `NOTIFY pgrst, 'reload schema';`, apply the manual add-on prices in `supabase/manual/menu_addons_standard_prices.sql`, and verify read-only (the staff RPCs and `inventory_count_correction_requests` exist, add-on prices are correct).
- Do not use Production for destructive tests or test sales. Do one hand-checked end-to-end sale after the push and record how it was handled.

**Status at the time of this commit: nothing described here has been run against Production.** The CLI on the author's machine was logged in to a different account without access to this project, and no database password was available.

The migration history was unresolved when the Production audit was written (see [Production migration-history blocker](#production-migration-history-blocker)). The local source used to contain two different migrations with version `202611180001`; one has since been renumbered to `202611180000` (see [Migration renumbering](#migration-renumbering-202611180001--202611180000)).

The repository's GitHub workflow is still manual and Development-only (it refuses identical Development and Production refs and does not target Production). Applying migrations to Production is done by hand with the steps above, not by that workflow. Do not configure Production credentials in the workflow's Development environment.

Copy the root `.env.example` to the root `.env` and set `EXPO_PUBLIC_SUPABASE_URL` plus `EXPO_PUBLIC_SUPABASE_ANON_KEY` to this same project. Only a client-safe publishable/anon key belongs in Expo. Never put service-role keys or database passwords in frontend configuration or Git.

The migrations seed three initial branch records and do not grant authenticated clients permission to create or delete branches. A read-only aggregate on 2026-11-19 confirmed three total and active branches, but the schema does not enforce an exactly-three-branches invariant against privileged database changes. RLS scopes Staff inventory/activity reads to the active assigned branch and allows active Owners to read across active branches. Staff can read the Owner-configured expiration-alert window but cannot change it. Inventory mutations are performed through `record_inventory_transactions`; `submit_daily_stock_check` records physical counts and discrepancies without changing inventory. The base tables are `branch_inventory` and `inventory_movements`; security-invoker views named `inventory` and `inventory_transactions` preserve the existing app query contract while enforcing the base-table RLS policies.

Migration `202610300001_business_schema_extensions.sql` adds products, recipes, sales, sale items, audit logs, branch addresses, expiration tracking, and the remaining standard ingredients. These structures are protected by RLS. Migration `202611020000_inventory_transaction_type_labels.sql` idempotently adds the inventory transaction enum labels before dependent catalog and sales migrations. Migrations `202611020001` through `202611020003` add the catalog, atomic sale and prepared-batter inventory RPCs, and transaction-reference locking. Migration `202611020005_owner_discrepancy_adjustments.sql` adds the Owner-authorized, audited discrepancy adjustment operation; `202611020006_staff_expiration_alert_settings.sql` permits active Staff to read the expiration window without granting write access. Sale writes remain unavailable directly to client roles; Staff checkout calls the trusted `submit_sale` RPC, which validates the branch, menu prices, and sale reference before processing inventory atomically. The migrations seed starter variant prices and a shared-batter recipe; product-specific recipe rows are disabled for automatic consumption by default. These defaults have not been confirmed against the approved business catalog and recipes. Recipe-driven consumption only applies to active recipes configured for automatic consumption. No cancellation/refund workflow currently reverses completed sales.

## Authentication sessions and business hours

The checked-in source intends to remove business-day or closing-time session expiration while preserving profile, role, and branch checks. Read-only production metadata on 2026-11-19 shows no `business_session_required` policies and no closing-time check in `is_business_session_active`; however, the production function only checks whether the profile is active and does not check `auth.sessions`. The version `202611180001` is absent from the production migration ledger. Therefore production is not verified to enforce the complete intended session/revocation behavior; Supabase Auth token/session policy and refresh behavior also apply.

The older `202611040001_business_day_session_expiration.sql` migration is superseded and must not be used to restore timed access restrictions. Business-day settings and their Owner interface may still be used to record closing-hour configuration, but these settings do not expire sessions. In the checked-in source, the compatibility RPCs `authorize_business_session` and `business_session_status` report active Auth-session status without a closing-time deadline; production behavior is not verified to match, as described above.

The persistent-session database regression test is `supabase/tests/202611180001_persistent_business_sessions.test.sql`; the three-branch integration test also verifies that a configured past closing time does not end an active Auth session. These SQL tests require the approved Development Supabase database and are not part of the local `npm test` command.

### Local authentication hardening candidate

The additive migration `202611190001_enforce_authenticated_branch_access.sql` updates Owner and Staff branch helpers to require a valid Auth session, an active profile, and an active branch; Staff remain restricted to their assigned branch. It also wraps the existing sale-inventory processor with session and sale-branch checks and revokes direct client execution of internal helpers. The wrapper prefers the existing integrity-aware helper and does not add a second inventory deduction.

The migration and its pgTAP regression coverage are source changes only. They have not been applied or executed against any database. Do not deploy them until an administrator reconciles the migration history (see [Migration renumbering](#migration-renumbering-202611180001--202611180000)) and approves an isolated Development environment. The migration runner intentionally fails closed while local versions are duplicated.

Owner Mobile tries the `owner-email-login` Edge Function action and falls back to Supabase Auth email/password sign-in if that action is unavailable. In either path, the client loads the authenticated profile, rejects inactive or non-Owner profiles, and signs the account out on role mismatch. The existing `owner-login` username action is retained for the separate Web Portal. Local Edge/service tests cover both paths; no hosted Edge Function was deployed or tested.

### Migration renumbering (`202611180001` -> `202611180000`)

Two files used the version `202611180001`:

- `202611180001_batter_preparation_date.sql` (unchanged), and
- `202611180001_remove_business_day_session_expiration.sql`, now **`202611180000_remove_business_day_session_expiration.sql`** (`git mv`, contents unchanged).

Why `202611180000`: the session-removal migration redefines `is_business_session_active`, `authorize_business_session`, `business_session_status`, `is_active_owner`, `can_access_branch(uuid)`, `authorize_inventory_discrepancy_adjustment` and `process_sale_inventory`. Two later migrations redefine some of those functions, so it must run before them: `202611180004_allow_staff_initial_password_access.sql` replaces `can_access_branch` (the removal migration's version still blocks Staff with `must_change_password`, so running it after `...0004` would undo that fix), and `202611190001_enforce_authenticated_branch_access.sql` replaces `is_active_owner`, `can_access_branch` and `process_sale_inventory`. It depends only on migrations up to `202611050009`/`202611130003`. It has no dependency on the batter preparation-date migration (and vice versa), and `202611180002` needs only the batter one. Version `202611180000` sorts after `202611170001` and before `202611180001`, so the order is: `...170001`, `...180000` (session removal), `...180001` (batter date), `...180002`, `...180003`, `...180004`, `...190001`. Applying the full chain in this order on an empty local database (PGlite with stubbed Supabase Auth) succeeded with no errors; the test was local only and no remote database was touched.

**Production implication - back up, verify, then repair or push as described in [Database safety and setup](#database-safety-and-setup).** Production's ledger has no row for `202611180001`, but the session-removal effects are already present there (no `business_session_required` policies, no closing-time check), apparently applied by hand; the batter preparation-date column and RPC are not. After the rename, `supabase db push` against Production would try to apply `202611180000` (idempotent `create or replace`/`drop ... if exists`, but it would also redefine `can_access_branch` and re-grant functions) and `202611180001` for the first time. Before any push an administrator must decide, from the actual production schema and deployment logs, whether to:

1. mark `202611180000` as applied with `supabase migration repair --status applied 202611180000` (only if its SQL has truly taken full effect, including the `auth.sessions` check in `is_business_session_active`), or let it run; and
2. let `202611180001` and the later migrations run normally.

Neither command has been run yet. Production is the approved target, so take the backup first and verify the schema before choosing between these options.

### Production migration-history blocker

A read-only migration listing against the linked production project on 2026-11-19 found 16 migration versions recorded and 23 local migration entries pending. The two local files `202611180001_batter_preparation_date.sql` and `202611180001_remove_business_day_session_expiration.sql` share one version; a read-only query of `supabase_migrations.schema_migrations` returned no row for that version. Yet production metadata shows some session-removal effects and does not show the batter preparation-date column or RPC. This points to unrecorded/manual schema changes or migration-history drift; the exact SQL applied cannot be established from the ledger. Other pending migrations include security, sales, idempotency, and inventory-count changes. Production is now the approved target (see above), so the migration history must be reconciled there: take a backup, confirm from the actual schema which SQL has already taken effect, repair only those versions, and push the rest. The duplicate version has already been renumbered to `202611180000`.

The expanded read-only catalog audit found 34 production public tables, all with RLS enabled, 52 policies across 32 tables, 60 validated checks, 60 validated foreign keys, 34 validated primary keys, 21 validated unique constraints, 85 valid indexes, and two `security_invoker` compatibility views. No client table-level write grants were found; the minimum-stock and batch-expiration column grants are constrained by Owner-only RLS policies. `SECURITY DEFINER` functions inspected have a fixed `public, pg_temp` search path. These structural checks do not replace role/RLS integration tests.

Production remains incompatible with current service calls: `prepare_batter_batch` is only `(uuid,text)`; `record_inventory_transactions_idempotent` is absent; `submit_daily_stock_check` lacks the request-ID/revision contract; and inventory-count correction/validation tables and RPCs are missing. The live `is_business_session_active()` checks only for an active profile and does not inspect `auth.sessions`. No corrected migration was created or applied because migration provenance is unresolved. The user has confirmed that the linked target is Production; the earlier Development reference is not an approved test target. Production is the approved target for the current work (see [Database safety and setup](#database-safety-and-setup)); apply the pending migrations there after a backup. See the root [AUDIT_REPORT.md](../AUDIT_REPORT.md) before any deployment.

The sale migration checks for duplicate `sales_consumption` movements using a text comparison, which remains valid if a legacy database lacks that enum label. Its unique index uses the immutable `notes LIKE 'sale:%'` predicate and keys by branch, sale reference, ingredient, and transaction type.

Migration `202610280002_default_ingredients.sql` provisions eight ingredients and zero-quantity inventory rows for active branches while preserving existing balances. `supabase/seed.sql` additionally provides demonstration balances for four ingredients at Branch 1, zero balances for those ingredients at Branches 2 and 3, and example batches. Review it before running and restrict it to a disposable local stack or explicitly approved, isolated Development project. Never execute it against Production. Local `supabase db reset` is destructive to the local database and runs the configured seed.

The initial `auth.users` bootstrap migration creates inactive, unassigned Staff profiles; the latest local bootstrap migration assigns the initial Branch 1 ID while keeping the profile inactive. The `staff_requires_branch` constraint permits an inactive profile without a branch but requires an active Staff profile to have one. Production's effective behavior is unknown until migration provenance is reconciled. The Owner Web Portal contains Staff account management. First-Owner provisioning and hosted account behavior still require a trusted administrator and Development verification. Never insert profiles without matching Auth users, accept roles or branches from user-editable Auth metadata, or perform account SQL against Production.

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

Investigate any active account not on the approved roster and correct it through a trusted administrative process. Do not rely on the bootstrap migration to deactivate existing accounts. The root [README](../README.md) documents the gated Development workflow and app setup.

## Three-collaborator workflow

All collaborators should use GitHub accounts with least-privilege access. Keep local client configuration out of Git. Schema changes must be reviewed as forward-only migrations; never rewrite a migration already applied to a database.

The repository migration workflow is manual and Development-only; there is no push-to-main deployment. It remains blocked unless an administrator configures `SUPABASE_DEVELOPMENT_PROJECT_REF`, `SUPABASE_PRODUCTION_PROJECT_REF`, `TAKOSYNC_DEVELOPMENT_MIGRATIONS_APPROVED=true`, and `TAKOSYNC_MIGRATIONS_RECONCILED=true`, plus a protected `supabase-development` environment with a reviewer and the `SUPABASE_DB_URL` secret. The secret must be the Development project's Session Pooler URL (port `5432`, database `postgres`, `sslmode=require`). The workflow requires a manual confirmation, rejects identical project references, validates unique local migration versions before remote access, previews the SQL, and applies only to the Development URL. The duplicate `202611180001` version was renumbered locally, so the uniqueness check now passes; every other administrative gate above still applies.

Never configure Production credentials in the Development environment. The database URL is privileged and must remain in the protected GitHub environment secret. Production release is a separate administrator-approved operation after migration history has been reconciled and Development tests have passed; this repository workflow does not deploy to Production.
