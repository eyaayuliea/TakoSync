# Staff Module Frontend Audit and Fix Report

Audit date: 2026-11-18  
Scope: Staff mobile frontend, Staff routing/preview, design tokens, shared UI primitives, and ST-01–ST-20 acceptance criteria. Backend, Supabase schema/RLS, and edge functions were not changed.

## Outcome

The Staff frontend received a source-level UI quality pass and the requested fixes were applied. Existing sales, inventory, stock-in, waste/spillage, count, consumption, alert, report, receipt, authentication, and logout data flows were preserved.

The largest Staff workspace remains large, but its style system is now extracted and the most repeated visual primitives have a shared implementation. This reduces visual drift without changing the navigation contract or repository behavior.

## Baseline inventory before changes

The requested Staff source inventory was captured before editing:

```text
66   frontend/staff/alertPreferences.test.mjs
78   frontend/staff/alertPreferences.ts
189  frontend/staff/inventoryAlerts.test.mjs
162  frontend/staff/inventoryAlerts.ts
357  frontend/staff/inventoryReports.test.mjs
532  frontend/staff/inventoryReports.ts
91   frontend/staff/menuPreviewData.test.mjs
124  frontend/staff/menuPreviewData.ts
1268 frontend/staff/MenuWorkspace.tsx
101  frontend/staff/saleReceipt.test.mjs
135  frontend/staff/saleReceipt.ts
100  frontend/staff/StaffChangePasswordScreen.tsx
70   frontend/staff/staffInventoryCatalog.ts
134  frontend/staff/staffInventoryWorkflow.test.mjs
10611 frontend/staff/StaffWorkspace.tsx
81   frontend/staff/theme/staffTokens.ts
```

Staff routing was also audited in `frontend/App.tsx`; the shared Staff bottom navigation is `frontend/navigation/BottomNavigation.tsx`.

## Before/after quality scores

Scores are source-audit estimates, not automated UX measurements.

| Category | Before | After | Notes |
|---|---:|---:|---|
| Color/token consistency | 45 | 75 | Staff screens now use the Staff token adapter and Sticker Sheet palette for core colors; some legacy supporting colors remain in the large style sheet. |
| Typography | 35 | 72 | Poppins is centralized and Staff font sizes below 11px were raised to the documented minimum. |
| Spacing/radii/shadows | 48 | 68 | 48px/40px control tokens added, card/dialog radius standardized in tokens, decorative shadows removed from extracted Staff styles. |
| Cards | 42 | 65 | Shared StaffCard and token-backed surfaces added; legacy screen-specific cards remain. |
| Buttons/forms | 58 | 73 | Shared button/input primitives and login overlay are available; existing transactional forms retain behavior. |
| Icons/status | 43 | 70 | Shared StatusBadge pairs semantic color with an outlined marker and label; some legacy navigation glyphs remain. |
| Navigation | 62 | 72 | Shared PageHeader is used by menu screens and the existing Staff route contract is preserved. |
| Responsiveness | 45 | 60 | Minimum control sizing and loading/empty/error primitives improved; Android device and keyboard behavior still need verification. |
| Functional compliance | 78 | 84 | Existing Staff repositories and tests remain intact; login field errors and loading overlay now match the story more closely. |
| Reusability | 32 | 65 | Shared Staff primitives and extracted `staffStyles.ts` reduce duplication; full route-level decomposition is still outstanding. |
| Overall | 48 | 70 | Meaningful source-level improvement; not a substitute for device QA. |

## Acceptance-criteria audit and fixes

- ST-01 login: preserved username/password contract, duplicate-submit lock, password clearing behavior, and connection-failure entry preservation. Added field-level mapping for `unknown_username` and `incorrect_password`, plus a covering `Logging in…` overlay. Backend login payload was not changed.
- ST-02–ST-03 POS/menu: preserved live menu filtering, cart totals, unavailable-item behavior, checkout/retry flow, receipt availability, and assigned-branch behavior. Shared header and token adapters were introduced without changing calculations.
- ST-04 inventory: branch scoping and status rules remain in the existing repository layer. Status presentation now has a shared semantic badge path.
- ST-05–ST-06 dashboard/alerts: existing loading, stale-data, retry, tab, and empty-state repository behavior was preserved; shared loading/empty/error primitives are available for screen migration.
- ST-07–ST-10 batter, stock-in, waste/spillage, and alerts: existing transactional locks, validations, branch scope, and retry behavior were preserved. High-impact flows still require device verification for confirmation copy and keyboard behavior.
- ST-11–ST-18 count and reports: existing draft/submit/correction rules, read-only distinctions, branch scoping, and report projections were not changed. Shared detail/card/status primitives are available, but these routes still contain legacy local layouts.
- ST-19 transaction history: existing branch-scoped history and detail behavior was preserved. Dense layout remains a source-only review item for small Android screens.
- ST-20 profile/logout: existing logout/session clearing behavior was preserved. Android Back-after-logout and OS-level session behavior remain device/runtime verification items.

## Components and token work

Created `frontend/staff/shared/staffComponents.tsx` with:

- `StaffPageHeader`
- `StaffButton`
- `StaffTextInput`
- `StaffStatusBadge`
- `StaffCard`
- `StaffDetailRow`
- `StaffLoadingState`
- `StaffEmptyState`
- `StaffErrorState`
- `StaffLoadingOverlay`
- `StaffConfirmationDialog`

Updated `frontend/staff/theme/staffTokens.ts` with Sticker Sheet aliases, semantic status pairs, Poppins font aliases, 48px/40px control sizes, 8px card/dialog radii, and no decorative elevation token. `StaffWorkspace.tsx` and `MenuWorkspace.tsx` now use token-backed local adapters; `StaffWorkspace.tsx` delegates its status badge to the shared implementation. `StaffWorkspace.tsx` styles were extracted into `frontend/staff/staffStyles.ts`.

## Files changed by this pass

- `frontend/App.tsx`
- `frontend/staff/MenuWorkspace.tsx`
- `frontend/staff/StaffWorkspace.tsx`
- `frontend/staff/staffStyles.ts`
- `frontend/staff/shared/staffComponents.tsx`
- `frontend/staff/theme/staffTokens.ts`
- `STAFF_MODULE_FRONTEND_AUDIT_REPORT.md`

The working tree contained other unrelated or pre-existing Owner/backend/Staff changes and untracked artifacts. They were not included in this pass and were not reverted.

## Remaining or unverified

- `StaffWorkspace.tsx` is still approximately 9,198 lines and `MenuWorkspace.tsx` approximately 1,251 lines. Style extraction helped, but route-level screen/feature splitting remains future work.
- A small number of legacy inline colors, radii, and rgba values remain in screen-specific styles; core palette, typography, control sizing, and shadows were consolidated without risking business-logic changes.
- Some legacy bottom-navigation and empty-state icon treatments still use hand-built glyph/View marks rather than a complete icon package. No new icon dependency was introduced.
- Android safe-area, keyboard resize, long-list nesting, contrast in every rendered state, Android Back after logout, and screen-reader labels require device/runtime QA.
- The browser client was unavailable during final runtime verification, so the Staff web surface was not interactively rechecked after edits. The existing supported preview switch is `EXPO_PUBLIC_APP_MODE=staff`; `frontend/App.tsx` routes web to Staff when that flag is set.
- No backend contract, schema, RLS, or edge-function changes were made. Any future login contract change should remain isolated in the Staff authentication service layer.

## Verification

Verified in the repository:

- `cmd /c npm run typecheck` — passed after the final style cleanup.
- `cmd /c npm run test:frontend` — 192 passed, 0 failed.
- Staff token-focused tests — 3 passed, 0 failed.
- Source scan found no Staff font sizes below 11px after the final cleanup; the only remaining shadow declaration found in the extracted style was removed.

Source-only or unverified:

- Visual comparison against every Sticker Sheet screen and all ST-01–ST-20 flows was not possible without an available browser/device runtime.
- Runtime React Native Web warning verification was unavailable after the edits.
- Backend integration and Android behavior were intentionally not changed and require their normal environment/device checks.

Assumption: where legacy compact text conflicted with the Sticker Sheet, the minimum documented 11px size was preferred; product artwork dimensions and business data were left unchanged.

## Remediation status

Status for the current remediation pass (2026-11-18):

- UI-001 — Fixed. Official Staff palette and semantic status tones are centralized in [frontend/staff/theme/staffTokens.ts](./frontend/staff/theme/staffTokens.ts).
- UI-002 — Fixed. Staff and Menu style factories now read typography token sizes; the runtime font-size normalizer is not present in [frontend/staff/staffStyles.ts](./frontend/staff/staffStyles.ts) or [frontend/staff/MenuWorkspace.tsx](./frontend/staff/MenuWorkspace.tsx).
- UI-003 — Fixed. Shared primitives are in [frontend/staff/components/](./frontend/staff/components/), with the former duplicate module removed.
- UI-004 — Not fixed. Legacy movement screens still contain inline field layouts; migrating them fully requires moving their existing handlers and state without changing validation or recovery behavior.
- UI-005 — Fixed. Token-backed cards, fields, badges, dialogs, and success states are available in [frontend/staff/components/](./frontend/staff/components/).
- UI-006 — Partially fixed. Staff bottom navigation uses outlined Material Community Icons in [frontend/navigation/BottomNavigation.tsx](./frontend/navigation/BottomNavigation.tsx); legacy dashboard and empty-state marks remain.
- UI-007 — Not fixed. Feature boundaries were scaffolded in [frontend/staff/screens/](./frontend/staff/screens/), but the render closures and their local styles have not yet been fully moved out of [frontend/staff/StaffWorkspace.tsx](./frontend/staff/StaffWorkspace.tsx).
- UI-008 — Fixed. The Staff profile copy identifies “In-app alerts” and retains the push-delivery limitation in [frontend/staff/StaffWorkspace.tsx](./frontend/staff/StaffWorkspace.tsx).
- UI-009 — Partially fixed. Existing keyboard-persist behavior and responsive flex constraints remain, but a device-level keyboard/safe-area audit is still required.
- UI-010 — Not fixed. No render-level console-error mounting test was added because the repository’s frontend runner is Node-only and cannot mount React Native JSX without a configured renderer.
- UI-011 — Fixed. [createThemedStyles](./frontend/theme/ThemeProvider.tsx) returns a new themed map for dark mode without mutating definitions; the invariant is checked by [frontend/theme/ThemeProvider.test.mjs](./frontend/theme/ThemeProvider.test.mjs).
- UI-012 — Partially fixed. Token, navigation, and service-level Staff tests pass; primitive rendering, per-mode movement-form rendering, and real-device accessibility coverage remain outstanding.

The current frontend verification run is 193 passing tests across 38 files; `npm run typecheck` also passes. No service-layer, branch-scoping, recovery, validation, role-separation, or Owner behavior changes were made in this remediation pass.
