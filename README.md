# TakoSync starter app

An Expo + React Native + TypeScript starter implementing the Loading, Welcome, temporary demo login, and sample dashboard screens.

## Requirements
- Node.js LTS
- npm
- Expo Go on an Android device, or an Android emulator

## Run
1. Extract this folder and open `TakoSync` in VS Code.
2. Open the integrated terminal in this folder.
3. Install dependencies: `npm install`
4. Start Expo: `npx expo start`
5. Scan the QR code with Expo Go, or press `a` to launch an available Android emulator. To run in a browser, use `npm run web`.

Type-check with `npm run typecheck` after dependencies are installed.

## Project structure

- `App.tsx` is the Expo entrypoint and re-exports the application root from `frontend/App.tsx`.
- `frontend/App.tsx` contains the existing Loading, Welcome, demo Login, Owner dashboard, and Staff routing.
- `frontend/staff/StaffWorkspace.tsx` contains the Staff screens, navigation state, and in-memory mock inventory and transaction workflows.
- `frontend/navigation/BottomNavigation.tsx` contains the shared Staff bottom navigation and route-to-tab mapping.
- `assets/` contains the existing image assets used by the frontend.
- `app.json`, `package.json`, and `tsconfig.json` remain at the repository root as Expo and package-manager configuration.

## Backend and data boundary

This repository currently has no backend server, Supabase SDK or configuration, API client, database queries, or server-side authentication. Staff inventory, receipts, sample history, and demo sign-in are frontend-only, local/mock behavior. Transaction updates exist only in application state and are lost on restart. A separate `backend/` directory is therefore not created; adding one without backend code would be misleading.

For a future Supabase integration, keep credentials that must remain secret (including service-role keys) on a trusted server or Supabase-managed function. A mobile client must not contain privileged secrets. Any client-side Supabase configuration should use only public project credentials and be isolated behind a data/service layer before replacing the current mock state.

## Assets
- `assets/takosync-logo.png` and `assets/takoyaki-plate.png` are crops from the reference screenshot supplied with the request. They are temporary reference-derived assets, not separate original/high-resolution brand files. Replace them with the original transparent logo and a clean food photo when available.

## Current scope
- Loading screen automatically transitions after 1.5 seconds.
- Welcome screen follows the reference's white/pink/navy palette and overlapping food image composition.
- Get Started opens a temporary demo login. Use `lorraine` / `jade123` for the Owner dashboard or `staff` / `tako-staff-2026` for the Staff dashboard.
- The demo login is checked in the client and is not secure authentication. Credentials bundled in a client app can be discovered or bypassed. The dashboard inventory is sample data and is not connected to a backend; do not use this access for production or real store data.
- Staff sign-in opens a staff workspace with a reusable blue-outlined pill navigation bar, dashboard, searchable and filterable ingredient inventory, stock actions, notifications with read states, settings, and local Stock-In / Stock-Out forms. The Stocks tab stays selected across the Stocks hub, movement forms, and receipt screens. Stock-In uses a local review, confirmation, receipt, and history flow; Stock-Out, Fast-Log, and Waste use local validation and confirmation. Sample transaction state is held in memory only and is discarded when the app restarts.
- Ingredient thumbnails use emoji placeholders because the project currently has no ingredient-specific photos. The dashboard summary uses the existing takoyaki plate image.
- No Supabase integration is configured in this stage.
