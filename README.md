# TakoSync: A Mobile Inventory Monitoring and Stock Auditing System for Gelo’s Takoyaki

## Project overview

TakoSync is a React Native and Expo application for monitoring ingredient inventory and recording stock activity for Gelo’s Takoyaki’s three branches. It addresses the difficulty of keeping branch stock records current, identifying low or expiring items, and documenting differences between recorded and physically counted inventory.

The app has a mobile-first interface and an Expo web target. One Supabase project provides the shared database and authentication for the available clients. This repository does not contain a separate web administration application or a custom application server.

> **Project source:** A standalone Project Charter file was not present in the repository during this review. This README reflects the supplied project brief, the existing backend documentation, and the behavior implemented in the code and migrations.

## Objectives

- Provide staff with inventory information for their assigned branch.
- Record stock receipts, deductions, usage, waste, and spoilage with a transaction history.
- Support low-stock and near-expiry monitoring.
- Record daily physical counts and discrepancies without silently overwriting recorded stock.
- Give the Owner a view of inventory and recent activity across the three branches.

## Modules and features

### Staff Module

The Staff interface currently includes:

- Supabase email/password sign-in, session restoration, and logout.
- A dashboard and ingredient inventory with search, category filters, and ingredient details.
- Stock-In receipts with batch and expiry information.
- Stock-Out and usage entries, including cooking-batch and Fast-Log workflows.
- Waste and spoilage recording with reasons and notes.
- Low-stock and near-expiry alerts derived from branch inventory and active batches.
- Transaction history with filters and transaction details.
- Daily physical inventory checks that record observed quantities and discrepancies for Owner review.
- Bottom navigation for Dashboard, Inventory, Stocks, Notifications, and More; theme preference is stored on the device.

Inventory changes and daily checks are submitted to Supabase. Notification category toggles are UI state only: push delivery and persistent notification preferences are not implemented.

### Owner Module

The current Owner dashboard reads inventory, low-stock and near-expiry items, recent transactions, and daily checks awaiting review across accessible branches. The dashboard is read-only: its Stock-In, Stock-Out, Waste, and Daily Check quick actions explicitly report that those actions are unavailable there.

The same Expo application can target the web using `npm run web`; this is not a separate web management product. Owner-side ingredient management, staff/branch assignment, and daily-check approval or rejection screens are not implemented.

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
│   ├── services/                   # Supabase client and application data operations
│   ├── staff/                      # Staff workspace and inventory workflows
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
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
```

Expo embeds variables prefixed with `EXPO_PUBLIC_` in the client bundle. Only a client-safe publishable/anon key belongs here. Never use a service-role key, database password, or other privileged credential in the app. `.env` is ignored by Git.

Without both variables, the app intentionally disables sign-in and reports that Supabase is not configured.

## Database setup

1. Create a Supabase project and install the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. From the repository root, authenticate, link the project, and apply migrations:

   ```sh
   supabase login
   supabase --workdir backend link --project-ref YOUR_PROJECT_REF
   supabase --workdir backend db push
   ```

3. Configure Supabase Auth email settings and create accounts through the Supabase dashboard or another trusted administrative process. `enable_signup = false` in `backend/supabase/config.toml` applies to a local Supabase stack; disable public sign-ups separately in the hosted project's dashboard.
4. Configure `.env` as described above.

The migrations create three fixed branch records, the inventory and audit tables, branch-level RLS policies, and the RPC functions used for inventory transactions and daily checks. The second migration provisions eight default ingredient records and inventory rows. The app cannot create or delete branches.

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

- Staff authenticate with Supabase email/password. The login form accepts `staff` as a username and maps it to `staff@YOUR_PROJECT_REF.supabase.co`; provision that exact Auth email and password through a trusted process. Owners sign in with their account email.
- A database trigger creates new profiles as Staff assigned to Branch 1. Set up the initial Owner and change Staff assignments through a trusted administrative process; no Owner UI for managing accounts/assignments is currently implemented.
- RLS scopes Staff inventory and activity reads to their active assigned branch. An active Owner can read across active branches. The database contains exactly three initially provisioned branch records.
- Direct client inventory writes are not granted. The `record_inventory_transactions` database function validates access and stock, updates inventory and batches, and records the ledger entry atomically. `submit_daily_stock_check` records physical counts and discrepancies without changing inventory.
- Never trust user-editable Auth metadata for roles or branch assignment. Never ship service-role credentials in the client.

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
| Stock-In, Stock-Out/usage, waste/spoilage, Fast-Log | Implemented through the database transaction function |
| Low-stock and expiry alerts | Derived from saved inventory and batch dates; no push notification delivery |
| Daily physical stock check and discrepancy recording | Implemented; discrepancy checks are marked pending Owner review |
| Owner inventory, activity, and alert monitoring | Read-only dashboard for accessible branches |
| Owner management of ingredients, accounts, or branch assignments | Not implemented in the app |
| Owner review/approval of physical checks | Pending checks are displayed; approval/rejection workflow is not implemented |
| Separate Owner web application | Not present; the Expo app has a web target |
| Live backend integration | Requires a configured Supabase project; live Auth, RLS, and database behavior cannot be verified from this repository alone |

The sample ingredient fixtures and opening quantities are demonstration data and must be replaced with verified business data before operational use. Notification preferences are not persisted or connected to a push service.

## Project scope

TakoSync is scoped to staff inventory operations and Owner monitoring for Gelo’s Takoyaki’s three branches. The current repository does not implement a separate custom backend, a separate web administration product, or the Owner management/review workflows listed above. No additional account types are part of the current database role model.

## Project team

**Programmers / development team**

- **Marbibi, Marjea A.**
- **Sahorda, Michelle Ann**

These members are recognized as the project's programmers/development team. This README does not attribute specific features to an individual.

| Member | Project role |
|---|---|
| Lucero, Denise Mae | Project team member |
| Marbibi, Marjea A. | Programmer / development team |
| Sahorda, Michelle Ann | Programmer / development team |
| San Esteban, Isabel | Project team member |
| Zarate, Lorraine Jade | Project team member |
