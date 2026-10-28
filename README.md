# TakoSync

TakoSync is an Expo + React Native + TypeScript application for branch-based inventory operations.

## Run

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set your Supabase project URL and public publishable/anon key.
3. Start Expo with `npx expo start`.
4. Type-check with `npm run typecheck`.

The client intentionally refuses sign-in when Supabase configuration is missing. No credentials or live Supabase project are included in this repository.

## Project structure

- `App.tsx` is the Expo entrypoint.
- `frontend/App.tsx` handles Supabase email/password authentication and Owner routing.
- `frontend/services/supabase.ts` configures the public-key Supabase client and persists Auth sessions with AsyncStorage.
- `frontend/staff/StaffWorkspace.tsx` contains Staff navigation and inventory workflows.
- `backend/services/takosync.ts` contains authentication, inventory, transaction, daily-check, and Owner read services.
- `backend/types/database.ts` contains the typed database contract.
- `backend/supabase/migrations/` contains the SQL schema, RLS policies, and transactional RPCs.
- `backend/supabase/seed.sql` contains optional sample inventory fixtures.

## Connect a Supabase project

1. Create or select your Supabase project.
2. Install the Supabase CLI if needed, then from this repository run:

   ```sh
   supabase login
   supabase --workdir backend link --project-ref YOUR_PROJECT_REF
   supabase --workdir backend db push
   ```

   This applies `backend/supabase/migrations/202610280001_initial_schema.sql`. The migration creates exactly three fixed branch records. The app cannot insert or delete branches.
3. In the Supabase dashboard, configure Auth email settings and disable public sign-ups. Create user accounts through the dashboard or a trusted administrative process. Do not add a service-role key to the app.
4. New Auth users receive a Staff profile assigned to Branch 1 by the database trigger. Change the assigned branch only through the trusted SQL editor or an authorized Owner management workflow. To designate the initial Owner after creating their Auth user, use the Supabase SQL editor:

   ```sql
   update public.profiles
   set role = 'owner', branch_id = null, full_name = 'Owner name'
   where email = 'owner@example.com';
   ```

   To assign a Staff account to another branch, update `branch_id` to one of the seeded branch UUIDs ending in `0001`, `0002`, or `0003`. Never accept role or branch assignments from user-editable Auth metadata.
5. Copy `.env.example` to `.env`. Use the project URL and the client-safe publishable key (or legacy anon key):

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
   ```

   Restart Expo after editing environment values. `EXPO_PUBLIC_` values are bundled into the application; only the public key belongs here. `.env` is ignored by Git.
6. If using the sample ingredients and opening quantities, review `backend/supabase/seed.sql` first and run it in the Supabase SQL editor. These records are fixtures, not verified real-world balances. Remove or replace them before using production inventory. The seed contains sample Branch 1 quantities, empty Branch 2/3 quantities, sample categories, and example batch expiry dates.

## Database and security

The migration creates:

- `branches` — exactly three fixed Gelo's Takoyaki branches.
- `profiles` — Auth-linked user profile, Owner/Staff role, active state, and assigned branch.
- `ingredient_categories` and `ingredients` — master ingredient details and units.
- `inventory` — one quantity and minimum-stock threshold per branch/ingredient.
- `ingredient_batches` — received quantities, remaining quantities, and expiry dates.
- `inventory_transactions` — stock-in, stock-out, usage, waste, spoilage, and owner adjustment ledger.
- `daily_stock_checks` and `daily_stock_count_lines` — immutable physical observations and recorded differences.

RLS is enabled on every application table. Staff reads are limited to their assigned active branch; Owners can read across active branches. Profile changes are Owner-only, and inventory/transaction mutations are not granted directly to clients. `record_inventory_transactions` validates branch access and stock availability, adjusts quantities atomically, records a ledger entry, creates batches on Stock-In, and consumes available batches on deductions. `submit_daily_stock_check` stores the observed quantities and discrepancy status without changing inventory.

Never put a Supabase service-role key, database password, or other privileged credential in Expo configuration or frontend code.

## Connected workflows and current limits

- Sign-in and session restoration use Supabase Auth. The database supplies role, name, and assigned-branch identity.
- Staff inventory, low-stock/near-expiry alerts, ingredient detail, transaction history, Stock-In, Stock-Out/usage, Fast-Log, waste/spoilage, and daily physical checks read from or write to Supabase.
- Owner dashboard reads inventory and recent activity across accessible branches, and lists daily checks awaiting review.
- Daily checks are audit observations; recorded stock is never overwritten by a physical count.
- Existing theme and notification preferences remain on-device. They are not represented as server-side push-notification settings.
- The current Owner UI is a monitoring screen. It does not yet include workflows for ingredient/master-data management, branch assignment, or approving/rejecting daily checks. The database permissions and pending-check records do not imply those UI workflows exist.
- The only configured seed ingredient set is a sample. Add the actual ingredients and opening quantities through an authorized setup workflow before operational use.

Live authentication, RLS behavior, and RPC operations require your Supabase project credentials and are not verifiable from this repository alone.

## Assets

`assets/takosync-logo.png` and `assets/takoyaki-plate.png` are reference-derived assets from the original UI work. Replace them with original high-resolution brand assets when available.
