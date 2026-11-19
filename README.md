# TakoSync: A Mobile Inventory Monitoring and Stock Auditing System for Gelo’s Takoyaki

## Staff web preview

For a development-only Staff web preview, set `EXPO_PUBLIC_APP_MODE=staff` before running `npm run web`. Production builds must continue to use the native Staff entry point and must not rely on this preview flag for access control.

## Project overview

TakoSync is a React Native and Expo application for monitoring ingredient inventory and recording stock activity for Gelo’s Takoyaki’s three branches. It addresses the difficulty of keeping branch stock records current, identifying low or expiring items, and documenting differences between recorded and physically counted inventory.

> **Project source:** The Project Charter, mobile user stories, summary, and sticker sheet are maintained under `docs/`. This README summarizes the project objectives and the implementation state; refer to those documents and [AUDIT_REPORT.md](AUDIT_REPORT.md) for acceptance criteria and verification status.

## Objectives

- Provide staff with inventory information for their assigned branch.
- Record stock receipts, deductions, usage, waste, and spoilage with a transaction history.
- Record daily physical counts and discrepancies without silently overwriting recorded stock.
- Give the Owner a view of inventory and recent activity across the three branches.

## Modules and features

The Staff interface currently includes:
- Local migrations create inactive Staff profiles; the latest local bootstrap migration assigns Branch 1 as the initial branch. The Owner Web Portal includes Staff account management. Production provisioning behavior is unverified because its migration history is unresolved.
- The client implements Supabase email/password sign-in, session restoration, token refresh, logout, and role/branch routing. Production session persistence, explicit revocation, and RLS behavior remain unverified against the linked database; business hours are intended to remain reporting data rather than an expiration deadline.
- A dashboard and ingredient inventory with search, category filters, and ingredient details.
- Stock-In receipts with batch and expiry information.
- Stock-Out and usage entries, including cooking-batch workflows.
- Waste and spoilage recording with spoiled, expired, spilled/damaged, and other reasons, plus optional notes.
- Low Stock, Out of Stock, Near Expiration, and Expired alerts derived from branch inventory, active batches, and the Owner-configured expiration window.
- Transaction history with filters and transaction details.
- Daily physical inventory checks that record observed quantities and discrepancies for Owner review.
- Bottom navigation for Dashboard, Inventory, Stocks, Alerts, and More; theme preference is stored on the device.

Inventory changes and daily checks are submitted to Supabase. Alert category toggles are UI state only: push delivery and persistent alert preferences are not implemented. Staff can read, but cannot change, the Owner-configured expiration window.

### Owner Module

The current Owner dashboard reads inventory, low-stock and near-expiry items, recent transactions, and daily checks awaiting review across accessible branches. The dashboard is read-only: its Stock-In, Stock-Out, Waste, and Daily Check quick actions explicitly report that those actions are unavailable there.

Owner Sales Monitoring and Sales Reports read completed records from the existing `sales`, `sale_items`, and `products` tables. Owners can filter by active branch and today, daily, weekly, monthly, or custom dates; reports include transaction, branch, product, and payment summaries. Reports export as CSV in the browser or as a shareable CSV file on iOS/Android. Cancelled and pending sales are excluded. Staff checkout submits sales through the trusted `submit_sale` RPC; the database validates the branch, menu price, and transaction reference, then atomically records configured recipe consumption. Product summaries require matching sale-item and product records and are omitted when that data is unavailable. The client has read-only access to sales tables and cannot write sale rows directly.

Owner Products & Menu supports creating and editing menu products through the existing `products` table. Ingredients & Recipes lets Owners search, view, add, and edit ingredient records and categories, and create, review, edit, and remove ingredient lines for those menu products through the existing `ingredients`, `ingredient_categories`, and `recipes` tables. Recipe quantities use the ingredient's configured unit. These configuration changes do not write inventory movements or alter historical sales. Configured active recipes are consumed only when a sale completes through the atomic backend workflow. A cancellation/refund workflow that reverses completed-sale inventory has not been implemented.

Stock & Expiration Settings lets Owners search and filter branch inventory, edit each ingredient's branch-specific minimum stock, enable or disable ingredient expiration tracking, and add or edit dates on existing active stock-in batches. The persisted owner-wide alert window controls nearing-expiration status; expired batches are identified separately. Batch quantities and stock levels are not changed by these settings, and expiration alerts are dashboard indicators only—notification delivery is not implemented. Apply the `202610310001_stock_expiration_settings.sql` migration before using this screen. Expiration dates can only be attached to existing stock-in batches; creating stock or standalone batch records is intentionally not supported here.

Owner Mobile signs in with the authorized Owner email and password through the dedicated `owner-email-login` action in the `staff-auth` Edge Function, with a direct Supabase Auth fallback if that action is unavailable. The active profile and Owner role are still checked before routing. The existing Owner username action remains available to the separate Web Portal. Staff use the configured username/password flow. There is no demo login or authentication bypass. Hosted Auth, Edge Function, session revocation, and RLS behavior remain unverified.

On web, the Expo app opens the Owner Web Management Portal by default; setting `EXPO_PUBLIC_APP_MODE=staff` selects the Staff web preview for development-only visual testing. The portal includes Owner authentication, a branch/period-filtered dashboard, sales reports, six separately filtered inventory reports, audit/activity history, Staff account management, product and ingredient/category configuration, prepared-batter recipe settings, stock/expiration settings, and discrepancy review. These screens use the existing Supabase service contracts; hosted data, authorization, and RLS behavior remain unverified. No browser acceptance test was run for the latest reporting/settings changes. The latest checked-in migration removes business-hour session expiration, but the linked production migration history is incomplete and ambiguous; do not assume that behavior is deployed. Owner account and branch assignments are managed through the Owner Staff Accounts feature.

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

## Database setup and safety

The linked Supabase project (`lofltjhvivcjuyezxaif`) is **Production**. As decided by the project owner on 2026-11-19, Production is the approved target for the `fix/core-workflow-db` migrations; there is no separate Development project. Back up first, verify the schema, repair only verified migrations and review `supabase db push --dry-run` before pushing. The required steps, safety rules and current status are in [backend/README.md](backend/README.md#database-safety-and-setup). The repository's GitHub workflow stays manual and Development-only and never targets Production. See also [AUDIT_REPORT.md](AUDIT_REPORT.md).

For source-only app work, copy `.env.example` to `.env`, set only the client-safe Supabase URL and publishable/anon key for an explicitly approved environment, then restart Expo. Never put service-role keys or database passwords in frontend configuration or Git. `enable_signup = false` in `backend/supabase/config.toml` applies only to a local Supabase stack; hosted sign-up settings require administrator verification.

The migrations seed three initial branch records, the inventory and audit tables, branch-level RLS policies, and RPC functions for inventory transactions, daily checks, batter preparation, and atomic sale submission. A read-only aggregate on 2026-11-19 confirmed three total and active branches; the schema does not enforce an exactly-three-branches invariant against privileged database changes. The catalog migration also seeds starter variant prices and a shared-batter recipe; product-specific recipe rows are not enabled for automatic consumption by default. These values have not been confirmed against the approved business catalog and recipes. The base stock tables are `branch_inventory` and `inventory_movements`; security-invoker views named `inventory` and `inventory_transactions` preserve the existing app query contract. Sale table writes remain unavailable to clients; checkout uses the trusted `submit_sale` RPC. Completed sales cannot currently be cancelled or reversed through an inventory-restoring workflow.

The read-only production catalog audit on 2026-11-19 found 34 public tables with RLS enabled, 52 policies, and two security-invoker compatibility views. Production still lacks the current batter-preparation, retry-safe inventory, and inventory-count correction RPC/schema contracts used by the app; the duplicate `202611180001` migration version and unrecorded schema effects remain unresolved. The user has confirmed that the linked project is Production, so it must not be used for tests. Provision or identify a separate approved Development project before database testing. Do not push or repair production migration history. See [AUDIT_REPORT.md](./AUDIT_REPORT.md) for the verified state and the administrator/Development reconciliation steps.

In the latest local migration sequence, Auth bootstrap creates inactive Staff profiles and assigns the initial Branch 1 ID; earlier migrations created unassigned inactive profiles. Production's effective behavior is unknown until migration provenance is reconciled. The Owner Web Portal contains Staff account management, but first-Owner provisioning and hosted account behavior require a trusted administrator and must be verified against the approved Development project before any production operation. Never accept role or branch assignments from user-editable Auth metadata.

`backend/supabase/seed.sql` is **optional sample data**, not real opening stock. It includes sample balances for four ingredients at Branch 1, zero balances for those ingredients at Branches 2 and 3, and example batches/expiry dates. Review it before use and restrict it to a disposable local stack or an explicitly approved, isolated Development project. Never execute it against Production. A local `supabase --workdir backend db reset` is destructive to that local database and must not be used against a remote database.

## Authentication, branch access, and security

- Owner Mobile authenticates by registered email/password; Staff use the approved employee-name/Employee-ID credential flow. The mobile Owner action is separate from the Owner Web Portal's existing username action. The client verifies the linked profile role, and database branch access requires an active Auth session, an active profile, and the Staff member's assigned branch. A Staff login is rejected on the Owner path and vice versa.
- The latest local bootstrap migration creates inactive Staff profiles with the Branch 1 assignment. The Owner Web Portal includes Staff account management; production behavior remains unverified until its migration history is reconciled.
- RLS scopes Staff inventory and activity reads to their active assigned branch. An active Owner can read across active branches. The additive `202611190001_enforce_authenticated_branch_access.sql` source candidate requires a valid Auth session at the branch and sale-processing helpers; it is unexecuted and does not establish hosted behavior. A read-only aggregate on 2026-11-19 confirmed three total and active branches; no database invariant enforces exactly three records.
- Direct client inventory writes are not granted. The `record_inventory_transactions` database function validates access and stock, updates inventory and batches, and records the ledger entry atomically. `submit_daily_stock_check` records physical counts and discrepancies without changing inventory.
- Never trust user-editable Auth metadata for roles or branch assignment. Never ship service-role credentials in the client.

## Shared collaborator workflow

- The migration workflow no longer runs on pushes to `main` and never targets Production. Do not enable Development migration runs until the administrator has approved a separate project, reconciled the duplicate version and migration provenance, and confirmed the sequence.
- To enable the protected Development-only workflow later, configure repository variables `SUPABASE_DEVELOPMENT_PROJECT_REF`, `SUPABASE_PRODUCTION_PROJECT_REF`, `TAKOSYNC_DEVELOPMENT_MIGRATIONS_APPROVED=true`, and `TAKOSYNC_MIGRATIONS_RECONCILED=true`. Create a protected GitHub environment named `supabase-development` with a required reviewer and the environment secret `SUPABASE_DB_URL` (the Development project's session pooler, port 5432, database `postgres`, `sslmode=require`; URL username must match the Development project ref).
- The workflow requires a manual confirmation, rejects identical Development and Production refs, validates migration version uniqueness before connecting, previews pending SQL, and only then applies to the Development URL. It cannot run successfully with the current duplicate migration version.
- Keep database credentials out of source control and frontend configuration. Collaborators use only client-safe keys for explicitly approved environments and pull merged source code as usual.

## Checks and troubleshooting

Run the TypeScript check and automated test suites:

```sh
npm run typecheck
npm run test:frontend
npm run test:edge
npm test
npx expo export --platform android
```

`npm test` runs the typecheck, frontend tests, and Edge Function tests. The Android export validates the JavaScript bundle but does not produce or install a native APK. No lint script is currently defined in `package.json`. On Windows PowerShell, invoke npm and npx as `npm.cmd` and `npx.cmd`. To troubleshoot:

- **Sign-in disabled:** set both environment variables and restart Expo.
- **Auth/profile error:** verify that the Auth user exists, has a database profile, and is active. Check the trusted account provisioning and assigned branch.
- **Missing inventory or permission errors:** verify that migrations were applied to the linked Supabase project and inspect its RLS policies.
- **Sample quantities look unexpected:** review whether the optional seed fixtures were applied; they are not verified real inventory.
- **Web startup issues:** use `npm run web` and confirm dependencies are installed with `npm install`.

## Implementation status and limitations

| Capability | Status |
|---|---|
| Staff authentication, session restoration, and logout | Implemented in client source; hosted session/revocation behavior requires verification |
| Staff inventory, search, categories, ingredient details, and history | Implemented against Supabase |
| Stock-In, Stock-Out/usage, waste/spoilage | Implemented through the database transaction function |
| Low-stock and expiry alerts | Uses the persisted Owner-configured window; Staff alert categories distinguish low stock, out of stock, near expiration, and expired; no push alert delivery |
| Daily physical stock check and discrepancy recording | Counts remain unchanged until an active Owner authorizes a reasoned, audited adjustment through the database operation |
| Staff Menu / cart | Loads the branch-visible menu from Supabase; checkout uses the atomic sale operation |
| Staff checkout / sales submission | Connected to the atomic `submit_sale` RPC; requires configured branch-visible menu items, prices, and recipes |
| Branch-to-branch stock transfers | Not implemented; the current frontend contract and transaction service do not support atomic transfers between branches |
| Owner Mobile Login screen | Supabase Auth email/password through `owner-email-login`, with active Owner profile check; hosted behavior requires verification |
| Owner inventory, activity, and alert monitoring | Read-only dashboard using shared Supabase data for accessible branches |
| Owner Products & Menu | Create and edit products using the existing Supabase table |
| Owner ingredients, categories, and product recipes | CRUD through existing Supabase tables; configuration does not deduct inventory |
| Recipe-driven consumption after completed sales | Implemented through the trusted atomic sale workflow for configured automatic-consumption recipes |
| Owner account and branch assignments | Staff account management is implemented in the Owner mobile and web interfaces; hosted behavior requires verification |
| Owner review/approval of physical checks | Implemented through discrepancy review, reasoned decisions, validation, and audited adjustments; hosted behavior requires verification |
| Owner Web Management Portal | Default Expo web route with dashboard, sales/inventory reporting, configuration, audit history, and discrepancy review; hosted behavior and browser acceptance require verification |
| Live backend integration | Requires a configured Supabase project; live Auth, RLS, and database behavior cannot be verified from this repository alone |

The sample ingredient fixtures and opening quantities are demonstration data and must be replaced with verified business data before operational use. Alert preferences are not persisted or connected to a push service.

Before operational POS use, configure and verify the live branch-visible catalog, prices, and automatic-consumption recipes. Sale submission is idempotent by transaction reference and stock changes are committed atomically. A cancellation/refund workflow must be defined before completed sales can be reversed; transfers still require a backend contract that records both branch sides atomically, and the existing branch-scoped inventory transaction operation must not be used to simulate a transfer.

## Project scope

TakoSync is scoped to staff inventory operations and Owner monitoring/configuration for Gelo’s Takoyaki’s three branches. The Owner Web Management Portal is the default Expo web route and shares the existing Supabase service/backend contracts; there is no separate custom backend. Owner account/branch assignment and daily-check review workflows are implemented in the Owner interfaces but require hosted verification. No additional account types are part of the current database role model.

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
