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

## Assets
- `assets/takosync-logo.png` and `assets/takoyaki-plate.png` are crops from the reference screenshot supplied with the request. They are temporary reference-derived assets, not separate original/high-resolution brand files. Replace them with the original transparent logo and a clean food photo when available.

## Current scope
- Loading screen automatically transitions after 1.5 seconds.
- Welcome screen follows the reference's white/pink/navy palette and overlapping food image composition.
- Get Started opens a temporary demo login. Use `lorraine` / `jade123` for the Owner dashboard or `staff` / `tako-staff-2026` for the Staff dashboard.
- The demo login is checked in the client and is not secure authentication. Credentials bundled in a client app can be discovered or bypassed. The dashboard inventory is sample data and is not connected to a backend; do not use this access for production or real store data.
- Staff sign-in opens a staff workspace with a reusable blue-outlined pill navigation bar, dashboard, searchable and filterable ingredient inventory, stock actions, notifications with read states, settings, and local Stock-In / Stock-Out forms. The Stocks tab stays selected across both stock forms. Successful demo transactions update only in-memory sample quantities; they are discarded when the app restarts.
- Ingredient thumbnails use emoji placeholders because the project currently has no ingredient-specific photos. The dashboard summary uses the existing takoyaki plate image.
- No Supabase integration is configured in this stage.
