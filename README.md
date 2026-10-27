# TakoSync starter app

An Expo + React Native + TypeScript starter implementing the Loading, Welcome, and temporary Get Started destination screens based on the supplied design reference.

## Requirements
- Node.js LTS
- npm
- Expo Go on an Android device, or an Android emulator

## Run
1. Extract this folder and open `TakoSync` in VS Code.
2. Open the integrated terminal in this folder.
3. Install dependencies: `npm install`
4. Start Expo: `npx expo start`
5. Scan the QR code with Expo Go, or press `a` to launch an available Android emulator.

Type-check with `npm run typecheck` after dependencies are installed.

## Assets
- `assets/takosync-logo.png` and `assets/takoyaki-plate.png` are crops from the reference screenshot supplied with the request. They are temporary reference-derived assets, not separate original/high-resolution brand files. Replace them with the original transparent logo and a clean food photo when available.

## Current scope
- Loading screen automatically transitions after 1.5 seconds.
- Welcome screen follows the reference's white/pink/navy palette and overlapping food image composition.
- Get Started opens a clear placeholder screen; no login, backend, or inventory features are included yet.
- No Supabase integration is configured in this stage.
