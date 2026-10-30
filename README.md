# TakoSync: A Mobile Inventory Monitoring and Stock Auditing System for Gelo’s Takoyaki

## Project overview

TakoSync is a React Native and Expo application for monitoring ingredient inventory and recording stock activity for Gelo’s Takoyaki’s three branches. It addresses the difficulty of keeping branch stock records current, identifying low or expiring items, and documenting differences between recorded and physically counted inventory.

> **Project source:** A standalone Project Charter file was not present in the repository during this review. This README reflects the supplied project brief, the existing backend documentation, and the behavior implemented in the code and migrations.

## Objectives

- Provide staff with inventory information for their assigned branch.
- Record stock receipts, deductions, usage, waste, and spoilage with a transaction history.
 set role = 'owner', branch_id = null, full_name = 'Owner name', active = true
- Record daily physical counts and discrepancies without silently overwriting recorded stock.
- Give the Owner a view of inventory and recent activity across the three branches.

## Modules and features

 set branch_id = '00000000-0000-4000-8000-000000000002', active = true

The Staff interface currently includes:
 A database trigger creates new profiles as inactive, unassigned Staff. Set up the initial Owner and activate/assign Staff through a trusted administrative process; no Owner UI for managing accounts/assignments is currently implemented.
- Supabase email/password sign-in, session restoration, and logout.
- A dashboard and ingredient inventory with search, category filters, and ingredient details.
- Stock-In receipts with batch and expiry information.
- Stock-Out and usage entries, including cooking-batch workflows.
- Waste and spoilage recording with spoiled, expired, spilled/damaged, and other reasons, plus optional notes.
- Low-stock and near-expiry alerts derived from branch inventory and active batches.
- Transaction history with filters and transaction details.
- Daily physical inventory checks that record observed quantities and discrepancies for Owner review.
- Bottom navigation for Dashboard, Inventory, Stocks, Alerts, and More; theme preference is stored on the device.

Inventory changes and daily checks are submitted to Supabase. Alert category toggles are UI state only: push delivery and persistent alert preferences are not implemented.

### Owner Module

The current Owner dashboard reads inventory, low-stock and near-expiry items, recent transactions, and daily checks awaiting review across accessible branches. The dashboard is read-only: its Stock-In, Stock-Out, Waste, and Daily Check quick actions explicitly report that those actions are unavailable there.

Owner Sales Monitoring and Sales Reports read completed records from the existing `sales`, `sale_items`, and `products` tables. Owners can filter by active branch and today, daily, weekly, monthly, or custom dates; reports include transaction, branch, product, and payment summaries. Reports export as CSV in the browser or as a shareable CSV file on iOS/Android. Cancelled and pending sales are excluded. This frontend does not write sales or change inventory; it reports only data already recorded by the backend. Product summaries require matching sale-item and product records and are omitted when that data is unavailable. The current client has read-only access to sales records, so the backend partner must populate `sales` and `sale_items` through the authorized checkout workflow before these views contain sales; no sales-writing endpoint or checkout integration was added in this phase.

Owner Products & Menu supports creating and editing menu products through the existing `products` table. Ingredients & Recipes lets Owners search, view, add, and edit ingredient records and categories, and create, review, edit, and remove ingredient lines for those menu products through the existing `ingredients`, `ingredient_categories`, and `recipes` tables. Recipe quantities use the ingredient's configured unit. These configuration changes do not write inventory movements or alter historical sales. The current backend does not yet connect recipe quantities to an atomic completed-sale workflow, so recipe configuration alone does not deduct stock; that consumption workflow remains a backend dependency.

Owner and Staff sign in with their registered Supabase Auth email and password. The app loads each user's active `profiles` record before routing: Staff go to the assigned-branch workspace, and Owners go to the live cross-branch monitoring dashboard. There is no demo login or authentication bypass.

The same Expo application can target the web using `npm run web`; this is not a separate web management product. Owner account/branch assignment and daily-check approval or rejection screens are not implemented.

## Architecture

```text
Expo app (React Native / web)
  ├─ screens, navigation, theme, and local UI state
  ├─ frontend/services/ (Supabase client and application data operations)
  └─ public Supabase key + Auth session
             │
             ▼
Supabase Auth + PostgreSQL
  ├─ shared data for the three branches
  ├─ Row Level Security (RLS)
  └─ database functions for inventory transactions and physical checks
```

The app calls Supabase directly through the Supabase JavaScript client. Database schema, policies, and transaction logic live under `backend/supabase/`. There is no separate Node/Express server. The database type contract is in `backend/types/`.

## Technology stack

| Area | Technology |
|---|---|
| Application | React Native 0.81, React 19, Expo SDK 54 |
| Language | TypeScript 5 |
| Web target | Expo web, React Native Web |
| Authentication and database client | Supabase Auth and `@supabase/supabase-js` |
| Database | Supabase PostgreSQL, SQL migrations, RLS, and PostgreSQL functions |
| Session storage | `@react-native-async-storage/async-storage` |
| Fonts | Poppins via Expo Google Fonts |

## Repository structure

```text
.
├── App.tsx                         # Expo entry point; forwards to frontend/App.tsx
├── app.json                        # Expo application configuration
├── assets/                         # Images used by the app
├── frontend/
│   ├── App.tsx                     # Loading, welcome, login, and Owner routing/UI
│   ├── navigation/                 # Staff bottom navigation
│   ├── owner/                      # Owner mobile dashboard, products, ingredients, recipes, and reports
│   ├── services/                   # Supabase client and application data operations
│   ├── staff/                      # Staff workspace and inventory workflows
│   │   ├── MenuWorkspace.tsx        # Staff menu, cart, and unavailable checkout state
│   │   └── menuPreviewData.ts       # Isolated UI-only menu examples; not production data
│   └── theme/                      # Theme provider and persisted theme preference
├── backend/
│   ├── README.md                   # Supabase setup notes
│   ├── supabase/
│   │   ├── config.toml
│   │   ├── migrations/             # Schema, three branches, RLS, and database functions
│   │   └── seed.sql                # Optional sample inventory fixtures
│   └── types/
│       └── database.ts             # Typed Supabase database contract
├── .env.example                    # Safe placeholder environment values
├── package.json
└── tsconfig.json
```

`.expo/`, dependencies, environment files other than `.env.example`, and build output are local/generated files and are excluded by `.gitignore`.

## Prerequisites

- Node.js LTS and npm.
- A device with Expo Go or an installed iOS/Android simulator for mobile use; a modern browser for web.
- A Supabase project for sign-in and live inventory workflows.
- The Supabase CLI only if you will apply migrations from the command line.

## Install and run

From the repository root:

```sh
npm install
cp .env.example .env
```

Edit `.env` with the URL and **public** publishable key (or legacy anon key) for your Supabase project, then start Expo:

```sh
npm run start
```

Use the Expo terminal to open a device/simulator, or run the web target:

```sh
npm run web
```

Other available launch commands are `npm run android` and `npm run ios` (a suitable simulator/device is required). Restart Expo after changing `.env`.

## Environment variables

`.env.example` contains placeholders only:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Expo embeds variables prefixed with `EXPO_PUBLIC_` in the client bundle. Only a client-safe publishable/anon key belongs here. Never use a service-role key, database password, or other privileged credential in the app. `.env` is ignored by Git.

Without both variables, the app intentionally disables sign-in and reports that Supabase is not configured.

## Database setup

1. Use the existing shared Supabase project and install the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. Before changing the remote database, inspect its migration history and preview pending SQL:

   ```sh
   supabase login
   supabase --workdir backend link --project-ref YOUR_PROJECT_REF
  supabase --workdir backend migration list --linked
  supabase --workdir backend db push --linked --dry-run
   ```

  If the existing database was created manually or does not have matching migration history, stop before `db push`. Have the database owner compare the live schema with the checked-in migrations and reconcile migration history deliberately; never mark a migration applied just to silence a mismatch.
3. Only after reviewing the dry run, apply pending migrations:

  ```sh
  supabase --workdir backend db push --linked
  ```

4. Configure Supabase Auth email settings and create Auth users through the dashboard or another trusted administrative process. `enable_signup = false` in `backend/supabase/config.toml` applies to a local Supabase stack; disable public sign-ups separately in the hosted project's dashboard.
5. Copy `.env.example` to `.env`, set the shared project URL and public publishable/anon key, then restart Expo. Each collaborator keeps their own ignored local `.env` file.

The migrations create three fixed branch records, the inventory and audit tables, branch-level RLS policies, and the RPC functions used for inventory transactions and daily checks. The base stock tables are `branch_inventory` and `inventory_movements`; security-invoker views named `inventory` and `inventory_transactions` preserve the existing app query contract. The migration `202610300001_business_schema_extensions.sql` adds product/recipe/sale metadata and audit logs. It intentionally does not allow client-side sale writes or deduct stock from sales until a trusted atomic checkout contract is implemented. No real product prices or recipe quantities are seeded.

New Auth users receive a Staff profile assigned to Branch 1. To designate the first Owner, create the Auth user, then promote the matching profile in the Supabase SQL editor:

```sql
update public.profiles
set role = 'owner', branch_id = null, full_name = 'Owner name'
where email = 'owner@example.com';
```

Assign Staff only to a fixed branch through a trusted administrative process. For example, Branch 2's ID is `00000000-0000-4000-8000-000000000002`:

```sql
update public.profiles
set branch_id = '00000000-0000-4000-8000-000000000002'
where email = 'staff@example.com' and role = 'staff';
```

Never accept role or branch assignments from user-editable Auth metadata.

`backend/supabase/seed.sql` is **optional sample data**, not real opening stock. It includes sample balances for four ingredients at Branch 1, zero balances for those ingredients at Branches 2 and 3, and example batches/expiry dates. Review it before use. For a remote project, run the reviewed SQL manually in the Supabase SQL editor only if you want those fixtures. Local Supabase resets use the configured seed file; `supabase --workdir backend db reset` resets the local database and should not be used against a production database.

## Authentication, branch access, and security

- Staff and Owners authenticate with their actual registered Supabase Auth email and password. The client checks that the linked profile is active and that Staff have an active branch assignment before entering the workspace. A Staff login is rejected on the Owner path and vice versa.
- A database trigger creates new profiles as Staff assigned to Branch 1. Set up the initial Owner and change Staff assignments through a trusted administrative process; no Owner UI for managing accounts/assignments is currently implemented.
- RLS scopes Staff inventory and activity reads to their active assigned branch. An active Owner can read across active branches. The database contains exactly three initially provisioned branch records.
- Direct client inventory writes are not granted. The `record_inventory_transactions` database function validates access and stock, updates inventory and batches, and records the ledger entry atomically. `submit_daily_stock_check` records physical counts and discrepancies without changing inventory.
- Never trust user-editable Auth metadata for roles or branch assignment. Never ship service-role credentials in the client.

## Shared collaborator workflow

- Invite all three developers to the same GitHub repository and Supabase project using their own accounts. Grant only the Supabase project access each developer needs.
- Each developer uses the same Supabase project URL and public client key in their own root `.env`; `.env` is ignored and must never be committed.
- Create schema changes only as new, uniquely named SQL files in `backend/supabase/migrations/`. Do not edit migrations already applied to the shared project.
- Review migration changes through a GitHub pull request. Merging a migration to `main` triggers `.github/workflows/supabase-migrations.yml`; configure the GitHub `supabase-production` environment with required reviewers before adding its secrets.
- Add `SUPABASE_PROJECT_ID` as an environment variable and `SUPABASE_ACCESS_TOKEN` plus `SUPABASE_DB_PASSWORD` as environment secrets for `supabase-production`. These privileged credentials are only used by GitHub Actions, never the Expo app.
- Collaborators must pull merged code locally. Applying database migrations updates the shared database, not each developer's local source files.

## Checks and troubleshooting

Run the available TypeScript check:

```sh
npm run typecheck
```

There is currently no configured test or lint script in `package.json`. To troubleshoot:

- **Sign-in disabled:** set both environment variables and restart Expo.
- **Auth/profile error:** verify that the Auth user exists, has a database profile, and is active. Check the trusted account provisioning and assigned branch.
- **Missing inventory or permission errors:** verify that migrations were applied to the linked Supabase project and inspect its RLS policies.
- **Sample quantities look unexpected:** review whether the optional seed fixtures were applied; they are not verified real inventory.
- **Web startup issues:** use `npm run web` and confirm dependencies are installed with `npm install`.

## Implementation status and limitations

| Capability | Status |
|---|---|
| Staff authentication, session restoration, and logout | Implemented against Supabase Auth; requires project configuration and provisioned accounts |
| Staff inventory, search, categories, ingredient details, and history | Implemented against Supabase |
| Stock-In, Stock-Out/usage, waste/spoilage | Implemented through the database transaction function |
| Low-stock and expiry alerts | Derived from saved inventory and batch dates; no push alert delivery |
| Daily physical stock check and discrepancy recording | Implemented; discrepancy checks are marked pending Owner review |
| Staff Menu / cart | Menu filters, selection, cart quantities, and preview totals are implemented with isolated UI-only sample data from the project brief; these are not live products or production prices |
| Staff checkout / sales submission | Not connected; checkout explicitly reports that no order was submitted and inventory was unchanged |
| Branch-to-branch stock transfers | Not implemented; the current frontend contract and transaction service do not support atomic transfers between branches |
| Owner Login screen | Supabase Auth email/password with active Owner profile check |
| Owner inventory, activity, and alert monitoring | Read-only dashboard using shared Supabase data for accessible branches |
| Owner Products & Menu | Create and edit products using the existing Supabase table |
| Owner ingredients, categories, and product recipes | CRUD through existing Supabase tables; configuration does not deduct inventory |
| Recipe-driven consumption after completed sales | Not implemented; requires a trusted backend checkout and atomic inventory workflow |
| Owner account and branch assignments | Not implemented in the app |
| Owner review/approval of physical checks | Pending checks are displayed; approval/rejection workflow is not implemented |
| Separate Owner web application | Not present; the Expo app has a web target |
| Live backend integration | Requires a configured Supabase project; live Auth, RLS, and database behavior cannot be verified from this repository alone |

The sample ingredient fixtures and opening quantities are demonstration data and must be replaced with verified business data before operational use. Alert preferences are not persisted or connected to a push service.

To replace the UI preview and implement POS safely, the frontend needs a branch-scoped product/menu catalog contract (including prices, availability, and categories), an order creation/read contract with line-item and total semantics, idempotent submission behavior, and a defined cancellation/refund flow. If sales should consume ingredient inventory, the backend must also define how recipes map to ingredients and provide an atomic order-and-inventory operation. Transfers similarly require a backend contract that records both branch sides atomically; the existing inventory transaction operation is branch-scoped and must not be used to simulate a transfer.

## Project scope

TakoSync is scoped to staff inventory operations and Owner monitoring/configuration for Gelo’s Takoyaki’s three branches. The current repository does not implement a separate custom backend, a separate web administration product, or Owner account/branch assignment and daily-check review workflows. No additional account types are part of the current database role model.

## Project team

**Programmers / development team**

- **Marbibi, Marjea A.** — Frontend Developer
- **Sahorda, Michelle Ann (Mitch)** — Backend Developer

Marjea leads frontend development, and Mitch leads backend development.

| Member | Project role |
|---|---|
| Lucero, Denise Mae | Project team member |
| Marbibi, Marjea A. | Frontend Developer |
| Sahorda, Michelle Ann | Backend Developer |
| San Esteban, Isabel | Designer |
| Zarate, Lorraine Jade | Tester |
