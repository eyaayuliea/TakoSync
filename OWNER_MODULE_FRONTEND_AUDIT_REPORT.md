# TakoSync Owner Module Frontend Audit Report

Audit date: 18 November 2026  
Scope: Owner mobile frontend source, shared Owner components, Owner Web Portal route, available runtime page, and the supplied Owner user stories and Sticker Sheet.  
Method: static source inspection, route/component tracing, runtime inspection of `http://localhost:8081/`, and TypeScript validation. No source code was modified.

## 1. Executive Summary

The Owner Module is substantially implemented in source and has a strong foundation: Poppins is loaded, the documented palette is represented in shared tokens, the Owner navigation has the expected major areas, and the Owner workflow includes sales, inventory, alerts, discrepancy review, six record types, profile, logout, and reusable loading/empty/error states. The discrepancy flow also contains explicit approval/validation states and confirmation copy, which is important for inventory correctness.

The current quality is nevertheless uneven. The implementation contains two visual systems: a newer shared-token/record-screen system and older, large screen-level style blocks in `OwnerMobileWorkspace.tsx`, `OwnerWorkspace.tsx`, and `OwnerSalesWorkspace.tsx`. The older screens use many hardcoded colors, 7–11px text sizes, 12–20px radii, and values that differ from the Sticker Sheet. The runtime browser currently renders `OwnerPortalWeb` on web, so the mobile screens cannot be visually verified in the shared browser without changing runtime configuration; the report therefore distinguishes verified source behavior from unverified mobile rendering.

The most important functional gap is the login contract: the user stories require an Email field and email-specific errors, while the Owner mobile and web login paths use `username`, `signInOwner()` sends `username`, and the service returns username-oriented errors. The mobile login disables the form and changes the button label, but does not cover the form with the required spinner/loading screen. The most important visual risks are inconsistent tokens and very small text/touch affordances in the legacy Owner workspace. The most important data-verification risk is that several record screens intentionally fall back to mock repositories/data, so frontend presence must not be reported as production backend compliance.

## 2. Overall Quality Score

Overall assessment: **66/100** for the inspected frontend implementation. This reflects broad feature coverage and good structural effort, reduced by route ambiguity, inconsistent visual systems, acceptance-criteria mismatches, and mock/fallback data that limits production verification.

| Category | Score | Reasoning |
|---|---:|---|
| Color Consistency | 62/100 | `ownerTokens.ts` correctly defines the Sticker Sheet palette, but legacy workspaces define alternate values such as `#F20D55`, `#101027`, `#FF9418`, `#858591`, `#C92F3C`, and `#F5F5F7`; this creates visible drift. |
| Typography Consistency | 55/100 | Poppins is loaded and shared tokens match the documented hierarchy, but many legacy screens use 7–11px labels/body text and local font maps rather than the shared scale. |
| Spacing and Alignment | 63/100 | Shared spacing tokens are present, but screen-level padding, card gaps, header heights, and compact layouts vary significantly across Owner screens. |
| Cards and Containers | 60/100 | Shared cards and dialogs are available, but many screens use 12–20px radii and bespoke fills; the Sticker Sheet specifies 8px controls/cards and no decorative shadows. |
| Buttons and Forms | 70/100 | Login validation, password visibility, disabled states, duplicate-submit locks, 48px controls, and shared button variants exist. Login loading presentation and field/error wording do not fully match the stories. |
| Icons and Status Indicators | 68/100 | An outlined icon system and semantic badges exist, but legacy text glyphs/emoji and some tiny icon implementations are mixed with the shared icon component. |
| Navigation Consistency | 72/100 | The mobile route includes Dashboard, Sales, Inventory, Discrepancies, Alerts, and More plus record subroutes. Header and back-navigation patterns differ across screen families. |
| Responsive Design | 61/100 | Keyboard-aware login and scrollable lists are present, but the browser route is web-only, many mobile views use very small typography, and several long screens use nested/large ScrollViews rather than a single consistent list strategy. |
| Functional UI Compliance | 70/100 | OM-02, OM-09–OM-19 have substantial source coverage and state handling. OM-01 is mismatched on email semantics; exact acceptance behavior cannot be confirmed for all data-backed states. |
| Code and Component Reusability | 65/100 | Shared Owner components/tokens are a good base, but the 3,305-line mobile workspace and duplicated screen styles indicate significant remaining consolidation work. |

TypeScript validation: `cmd /c npm run typecheck` passed. This confirms type correctness only; it does not prove backend behavior, production data, or visual compliance.

## 3. Screen-by-Screen Assessment

Priority reflects the enhancement priority, not a claim that every issue blocks use.

| Screen / Feature | User Story | Visual Consistency | Functional Compliance | Issues Found | Priority |
|---|---|---|---|---|---|
| Owner login | OM-01 | Partial | Partial | Uses Username rather than Email; service errors are username-oriented; mobile loading is label/disabled-state only, not a covering spinner state. | High |
| Owner dashboard | OM-02 | Partial | Mostly implemented in source | Total sales, branch cards, inventory, alerts, activities, refresh/error paths are present; legacy styles drift from shared tokens and loading uses indicators rather than documented skeletons in the inspected path. | High |
| Sales summaries | OM-03 | Partial | Mostly implemented in source | Period/branch selection and details are present; legacy analytics styles are separate from shared record components; exact date-picker and payment behavior requires runtime/data verification. | High |
| Daily sales summary | OM-04 | Partial | Partially verifiable | Daily selection and sales calculations are represented; exact future-date prevention and production loading/error behavior not fully verified from the active web route. | Medium |
| Weekly sales summary | OM-05 | Partial | Partially verifiable | Weekly range logic exists; visual scale and selectors differ from record screens; production data behavior not verified. | Medium |
| Monthly sales summary | OM-06 | Partial | Partially verifiable | Monthly period logic and pagination-related code exist; production loading-more behavior not verified. | Medium |
| Branch sales summary | OM-07 | Partial | Mostly implemented in source | Branch metrics are calculated, but cards/styles are bespoke and branch comparison needs device-level visual verification. | Medium |
| Products sold summary | OM-08 | Partial | Mostly implemented in source | Product summary logic exists; the active runtime did not expose the mobile route for confirming sorting/empty states. | Medium |
| Multi-branch inventory | OM-09 | Partial | Mostly implemented in source | Branch selection and comparison routes exist; legacy styles use alternate palette/radii and the browser currently exposes the web portal instead. | High |
| Low-stock and expiration monitoring | OM-10 | Partial | Mostly implemented in source | Tabs, counts, branch filters, alerts, and refresh logic exist; alert colors and legacy styles are not fully tokenized. | High |
| Review inventory discrepancies | OM-11 | Partial | Strong source coverage | Pending/approved/rejected/validated states, reason validation, confirmation, save feedback, and correction flow are present; production persistence and exact all-branch data need backend verification. | Critical |
| View sales/inventory records menu | OM-12 | Partial | Implemented in source | Six separate record routes exist; menu and record screens use a different compact visual language from dashboard/sales. | Medium |
| Sales transaction records | OM-13 | Partial | Partially verifiable | List/detail/loading/empty/retry/pagination paths exist; repository includes mock/fallback behavior, so production completeness is not established. | High |
| Sales consumption records | OM-14 | Partial | Partially verifiable | Linked-sale details, paging, empty/error states exist; a mock repository path limits production verification. | High |
| Stock-in records | OM-15 | Partial | Partially verifiable | Branch, quantity, expiration, supplier/reference, detail and read-only presentation exist; data source/fallback behavior requires verification. | Medium |
| Waste and spillage records | OM-16 | Partial | Partially verifiable | Category, remarks, employee, details and pagination exist; compact typography and mock data reduce confidence in production UX. | Medium |
| Physical inventory count records | OM-17 | Partial | Strong source coverage | Counts, differences, result/status badges, employee details, revision history and discrepancy link are represented. Visual consistency remains weak and production state coverage is unverified. | High |
| Authorized adjustment records | OM-18 | Partial | Partially verifiable | Detail view includes previous/actual/adjusted quantity, reason, approving owner, date, and related discrepancy; repository behavior and production records are not verified. | High |
| Owner profile and logout | OM-19 | Partial | Mostly implemented in source | Profile fields and confirmation dialog exist; custom screen uses 8–12px text, 36px logout control, 18px dialog radius, and must be device-tested for back-button/session clearing. | High |

## 4. Detailed Issues Found

### AUD-001 — Owner login uses username instead of the required email contract

- Affected: OM-01 mobile and web login; [OwnerLoginScreen.tsx](frontend/owner/OwnerLoginScreen.tsx:37), [OwnerPortalWeb.tsx](frontend/owner/OwnerPortalWeb.tsx:32), [takosync.ts](frontend/services/takosync.ts:667).
- Category: Functional UI compliance / access.
- Current implementation: The mobile label is `Username *`, accessibility labels say username, `signInOwner(username, password)` normalizes a username, and the edge-function body uses `{ action: 'owner-login', username, password }`. Errors include `Invalid username. Please try again.`.
- Expected: The OM-01 acceptance criteria require an `Email` field, blank-email validation, `Email not found. Please check your email.`, and an email-based owner login contract.
- Why it matters: The UI communicates a different credential model from the approved story and can prevent an owner from knowing which identity is expected.
- Severity: **High**.

### AUD-002 — Mobile login does not present the specified covering loading screen

- Affected: [OwnerLoginScreen.tsx](frontend/owner/OwnerLoginScreen.tsx:55).
- Category: Loading / interaction safety.
- Current implementation: `submitting` disables fields and changes the button text to `Logging in...`; no `ActivityIndicator` or overlay covers the form in this component.
- Expected: A loading screen with a spinner and `Logging in…` covers the form while the request is pending, with duplicate submission prevented.
- Why it matters: The current lock prevents duplicates, but the visual state is easy to miss and does not match the explicit acceptance behavior.
- Severity: **Medium**.

### AUD-003 — Login error placement and copy are not field-specific

- Affected: [OwnerLoginScreen.tsx](frontend/owner/OwnerLoginScreen.tsx:94), [takosync.ts](frontend/services/takosync.ts:701).
- Category: Validation / feedback.
- Current implementation: `loginError` renders in a top banner; service errors are not mapped to `fieldErrors.username` or `fieldErrors.password`. The password is cleared only when the exact incorrect-password string is returned.
- Expected: Unknown email appears under Email; wrong password appears under Password; connection failure preserves entries and re-enables Log In.
- Why it matters: Users receive less targeted recovery guidance and the frontend cannot guarantee the specified field-level behavior.
- Severity: **Medium**.

### AUD-004 — Two competing color/token systems create cross-screen drift

- Affected: [ownerTokens.ts](frontend/owner/shared/ownerTokens.ts:1), [OwnerMobileWorkspace.tsx](frontend/owner/OwnerMobileWorkspace.tsx:101), [OwnerWorkspace.tsx](frontend/owner/OwnerWorkspace.tsx:700), [OwnerSalesWorkspace.tsx](frontend/owner/OwnerSalesWorkspace.tsx:1).
- Category: Design system.
- Current implementation: Shared tokens correctly include `#EC1358`, `#0F1025`, `#FCA639`, `#F5F5F4`, `#FDFDFC`, and documented statuses, while legacy screens use `#F20D55`, `#101027`, `#FF9418`, `#858591`, `#F5F5F7`, and `#C92F3C`.
- Expected: One Owner palette and semantic token layer, with deviations documented only when needed by platform behavior.
- Why it matters: Similar statuses and actions can look different depending on the route, weakening recognition and brand consistency.
- Severity: **High**.

### AUD-005 — Legacy screens do not follow the 8px radius/no-shadow component guidance

- Affected: [OwnerLoginScreen.tsx](frontend/owner/OwnerLoginScreen.tsx:213), [OwnerProfileScreen.tsx](frontend/owner/OwnerProfileScreen.tsx:219), [OwnerMobileWorkspace.tsx](frontend/owner/OwnerMobileWorkspace.tsx:2886), [ownerComponents.tsx](frontend/owner/shared/ownerComponents.tsx:66).
- Category: Containers / components.
- Current implementation: Login uses a 24px card radius and decorative shadow; profile uses 12px/18px radii and a 36px logout button; dashboard/legacy cards use 12–20px radii. Shared components use 8px controls but 16px cards and 24px sheets.
- Expected: Standard 8px controls/cards per Sticker Sheet, with bottom-sheet radius treated as a deliberate exception and no decorative shadows.
- Why it matters: Cards and actions do not establish a stable visual grammar across screens.
- Severity: **Medium**.

### AUD-006 — Legacy Owner typography is below the documented readable scale

- Affected: [OwnerMobileWorkspace.tsx](frontend/owner/OwnerMobileWorkspace.tsx:2888), [OwnerWorkspace.tsx](frontend/owner/OwnerWorkspace.tsx:734), [OwnerProfileScreen.tsx](frontend/owner/OwnerProfileScreen.tsx:227).
- Category: Typography / accessibility.
- Current implementation: Many labels, metadata, and values are 7–11px; profile name is 12px and detail values are 8px. The Sticker Sheet defines 11px small text, 12px caption, 14px body/label, and 16–20px titles.
- Expected: Use the shared Poppins scale, allowing compact adaptation only where content remains readable and hierarchy is retained.
- Why it matters: Dense lists and owner-level metrics become difficult to scan on a small device, especially for quantity, branch, and status information.
- Severity: **High**.

### AUD-007 — Status colors and supporting surfaces are not consistently semantic

- Affected: [OwnerMobileWorkspace.tsx](frontend/owner/OwnerMobileWorkspace.tsx:120), [OwnerWorkspace.tsx](frontend/owner/OwnerWorkspace.tsx:716), [ownerComponents.tsx](frontend/owner/shared/ownerComponents.tsx:69).
- Category: Status indicators.
- Current implementation: Shared badges map warning/error/critical/info, but legacy code uses pale custom fills and alternate red/green/orange values. Some status text is tiny and some icon/status combinations are text glyphs rather than the outlined icon system.
- Expected: Use the Sticker Sheet status color plus an outlined icon and explicit label for warning, error, success, discrepancy, and expiration states.
- Why it matters: Color meaning changes between routes and may be inaccessible when color is the only cue.
- Severity: **Medium**.

### AUD-008 — Runtime route prevents direct mobile visual verification on web

- Affected: [App.tsx](frontend/App.tsx:95), [OwnerPortalWeb.tsx](frontend/owner/OwnerPortalWeb.tsx:13).
- Category: Verification / product surface.
- Current implementation: On web, unless `EXPO_PUBLIC_APP_MODE === 'staff'`, `App()` returns `OwnerPortalWeb`. The shared browser therefore shows the Owner Web Management Portal login, not `OwnerMobileWorkspace`.
- Expected: The audit/build should make it explicit which surface is being reviewed, or expose a supported mobile-preview route/configuration for browser QA.
- Why it matters: A visual review can otherwise mistakenly sign off the web portal while mobile screens remain untested.
- Severity: **High**.

### AUD-009 — Record screens mix shared components with local implementations and mock/fallback repositories

- Affected: [SalesTransactionRecords.tsx](frontend/owner/SalesTransactionRecords.tsx:41), [SalesConsumptionRecords.tsx](frontend/owner/SalesConsumptionRecords.tsx:57), [StockInRecordsScreen.tsx](frontend/owner/StockInRecordsScreen.tsx:36), [WasteSpillageRecordsScreen.tsx](frontend/owner/WasteSpillageRecordsScreen.tsx:41), [AuthorizedAdjustmentRecordsScreen.tsx](frontend/owner/AuthorizedAdjustmentRecordsScreen.tsx:11).
- Category: Data verification / reusability.
- Current implementation: Record screens have separate local styles and several use `get...MockList()` or forced test states. They do implement loading, error, empty, pagination, and details.
- Expected: Production repositories should be the default path, with explicit fixture injection only for tests/previews; record tiles, detail rows, headers, and states should share one implementation.
- Why it matters: Source presence cannot prove production acceptance criteria, and visual differences multiply as each screen evolves separately.
- Severity: **High**.

### AUD-010 — Mobile workspace is a monolithic screen coordinator

- Affected: [OwnerMobileWorkspace.tsx](frontend/owner/OwnerMobileWorkspace.tsx:230).
- Category: Code/component quality.
- Current implementation: The file is approximately 3,305 lines and owns navigation state, dashboard, inventory, alerts, discrepancies, records routing, product management, menus, modals, data refresh, and local styles.
- Expected: Extract route-level screens and shared feature components while retaining a single navigation contract.
- Why it matters: It increases regression risk and makes cross-screen standardization harder, particularly for loading, filtering, and dialog behavior.
- Severity: **Medium**.

### AUD-011 — Profile screen is visually undersized relative to the design system

- Affected: [OwnerProfileScreen.tsx](frontend/owner/OwnerProfileScreen.tsx:219).
- Category: Typography / touch targets.
- Current implementation: Profile values are 8px, the logout action is 36px high, dialog buttons are 31px high, and dialog radius is 18px.
- Expected: Preserve readable caption/body sizes and the 48px standard or 40px compact control target.
- Why it matters: Profile and logout are security-sensitive; small labels/buttons increase the chance of missed information or accidental interaction.
- Severity: **High**.

### AUD-012 — Console runtime warning indicates invalid text-node rendering

- Affected: Active app runtime; source location not isolated during this audit.
- Category: Runtime quality.
- Current implementation: The shared browser recorded repeated React Native Web errors: `Unexpected text node: . A text node cannot be a child of a <View>.`
- Expected: Render only `<Text>` children inside View-like containers and remove empty string/conditional text nodes.
- Why it matters: The warning may indicate hidden rendering defects and should be resolved before visual sign-off.
- Severity: **Medium**.

## 5. Design System Compliance

### Correctly implemented

- [ownerTokens.ts](frontend/owner/shared/ownerTokens.ts:1) contains the documented primary, navy, orange, white, black, status, canvas, card, and divider values.
- Poppins 400/500/600/700 is loaded in [App.tsx](frontend/App.tsx:1) and used by the shared Owner typography tokens.
- [ownerComponents.tsx](frontend/owner/shared/ownerComponents.tsx:6) provides shared icons, headers, cards, buttons, badges, detail rows, read-only pills, states, inputs, tabs, modals, and sheets.
- Shared controls target 48px and compact controls target 40px in [ownerTokens.ts](frontend/owner/shared/ownerTokens.ts:22).
- Login has masked password by default, show/hide behavior, inline blank-field validation, disabled submission state, keyboard handling, and duplicate-submit protection.
- Record/detail screens consistently communicate read-only behavior and include branch/date/reference information in source.

### Non-compliant or inconsistent

- The legacy Owner workspaces hardcode alternate palette values instead of consuming `ownerColors`.
- The documented 8px corner radius is not consistently applied; large rounded cards and pill-like buttons are common.
- Decorative login shadow conflicts with the Sticker Sheet's no-decorative-shadow guidance.
- Legacy text is often smaller than the documented small-text minimum, particularly profile, inventory, dashboard metadata, and record list rows.
- Status colors are not always paired with a consistent outlined semantic icon and readable label.
- There is no clear single source for page headers/navigation geometry across dashboard, analytics, records, discrepancy, and profile screens.
- The web portal has its own large-screen style system in [OwnerPortalWeb.tsx](frontend/owner/OwnerPortalWeb.tsx:102), which is appropriate as a separate web surface but should not be used as evidence of mobile consistency.

## 6. Cross-Screen Comparison

The record family is the most consistent functional group: Sales Transactions, Sales Consumption, Stock-In, Waste/Spillage, Physical Counts, and Authorized Adjustments all expose loading, empty/error states, detail views, read-only cues, branch/date metadata, and scrollable content. Physical Count and Authorized Adjustment screens also share concepts for validation and revision history.

The dashboard, inventory, alerts, and sales analytics form a second group but visibly deviate from the record family in source. They use bespoke cards, local color constants, local typography, and larger radii. The profile screen is a third visual variant, with its own miniature type scale and button sizing. The discrepancy flow is functionally richer than the other screens but has its own `om*` style namespace and custom modal/list cards.

Intentional differences include the web portal's desktop sidebar/table layout and a bottom sheet versus centered dialog. Accidental differences include the same status/action types receiving different color values, different card radii, different title sizes, and different button dimensions across mobile routes.

## 7. Component Reusability Recommendations

| Component | Screens | Current inconsistency | Suggested shared implementation | Benefit |
|---|---|---|---|---|
| Owner page header | Dashboard, Sales, Inventory, Alerts, Records, Profile | Multiple top bars, back buttons, title sizes, and avatar/header actions | One `OwnerPageHeader` using shared 56px header geometry and semantic icon buttons | Stable navigation and easier accessibility QA |
| Period selector | Sales, Daily, Weekly, Monthly, Branch, Products | Period state is shared but presentation is screen-specific | `OwnerPeriodSelector` with Today/Week/Month/Custom and validation | Consistent reporting context and fewer date bugs |
| Branch selector/filter | Sales, Inventory, Alerts, Discrepancies, Records | Branch chips/dropdowns differ by route | `OwnerBranchSelector` with All/Branch 1/2/3 and selected state | Clear branch scope across all business data |
| Metric/summary card | Dashboard, Sales, Branch Sales, Inventory | Different card radii, typography, and local colors | `OwnerMetricCard` with tokenized label/value/status slots | Faster design-system alignment |
| Inventory status badge | Dashboard, Inventory, Alerts, Count details | Normal/Low/Out/Expiration states use alternate fills and glyphs | `OwnerStatusBadge` backed by shared semantic tone and icon map | Better recognition and color-independent meaning |
| Alert card | Dashboard and Alerts | Summary cards and full alert cards use different local layouts | `OwnerAlertCard` with ingredient, branch, quantity/date, severity, action | Supports OM-02 and OM-10 consistently |
| Record list tile/detail section | OM-13–OM-18 | Six screen-specific tile/detail style blocks | `OwnerRecordList`, `OwnerRecordTile`, `OwnerRecordDetailSection` | Reduces duplication and makes read-only fields uniform |
| Loading/empty/error states | Dashboard, analytics, records, settings | Shared states exist but some screens use local indicators/copy | One state contract with skeleton/indicator, exact error copy, Retry | Consistent recovery behavior |
| Confirmation dialog | Logout and discrepancy validation | Profile and discrepancy dialogs use different radii/sizes/copy layout | `OwnerConfirmationDialog` with risk level, Cancel, confirm, loading | Safer high-impact actions |

## 8. Functional and Acceptance Criteria Gaps

### Fully or substantially represented in source

- OM-02 dashboard data sections, period state, refresh/error plumbing, branch summaries, alerts, activities, and discrepancy entry points.
- OM-07 branch sales metrics and OM-08 product summary logic.
- OM-09 branch selection, comparison view, read-only inventory presentation, and “Not tracked” handling paths.
- OM-10 low-stock/expiration tabs, counts, branch filters, refresh-driven snapshots, and empty/error states.
- OM-11 discrepancy review, reason validation, confirmation, approve/reject/validate paths, disabled validation for pending correction requests, save feedback, and adjustment messaging.
- OM-12 six separate record types and OM-13–OM-18 list/detail/read-only flows, with several loading/empty/error/pagination paths.
- OM-19 profile presentation and logout confirmation flow.

### Partially implemented or not fully verifiable

- OM-01: email requirement is not met in the inspected UI/service contract; field-specific error wording differs; mobile loading screen is incomplete.
- OM-03–OM-06: selection and summary logic is present, but exact picker behavior, future-date blocking, scroll-position restoration, loading-more, payment detail, and production data outcomes were not all verifiable from the active runtime.
- OM-13–OM-18: source screens exist, but mock/fallback repositories and forced states mean production backend correctness cannot be inferred from frontend code.
- OM-19: device Back behavior after logout and complete session invalidation require runtime authentication testing.

### Not assessed

- Backend authorization/RLS, exact Supabase production records, timeout behavior under real network failure, and whether all data queries exclude cancelled/uncompleted sales were not independently verified.
- Pixel-level mobile rendering at the target Android sizes was not assessed because the shared browser route resolved to the web portal. The report uses source evidence for mobile claims and marks visual runtime conclusions as partial.

## 9. Enhancement Priority Ranking

| Rank | Screen / Component | Main Problem | Impact | Recommended Action |
|---:|---|---|---|---|
| 1 | OM-11 discrepancy review | Inventory approval is business-critical and has the largest correctness risk | Incorrect inventory overwrite or unclear approval state | Device-test the complete pending → reason → confirmation → validated/adjusted flow against production repositories; standardize the confirmation component. |
| 2 | OM-01 login | Email/user story mismatch and incomplete loading/error presentation | Access confusion and failed acceptance scenarios | Align labels, service payload/errors, field-level feedback, timeout state, and spinner overlay with OM-01. |
| 3 | Shared design tokens | Legacy screens use competing colors, typography, radii | Cross-screen inconsistency and reduced readability | Make dashboard, inventory, alerts, sales, discrepancy, and profile consume shared Owner tokens. |
| 4 | OwnerMobileWorkspace | Monolithic coordinator with duplicated screen styles | High regression cost and inconsistent future changes | Extract route-level screens and shared feature components in a controlled refactor. |
| 5 | OM-13–OM-18 repositories | Mock/fallback paths limit production verification | Risk of signing off screens that do not reflect real data | Trace each repository to production Supabase queries and add integration coverage for branch/date/order/detail states. |
| 6 | Dashboard and alerts | Key business information is dense and visually bespoke | Owner may miss low stock, expiry, or branch context | Apply readable typography, tokenized alert cards, skeletons, and explicit branch/quantity hierarchy. |
| 7 | Profile/logout | Very small text and sub-40px actions | Security and session-control usability risk | Bring profile/dialog controls to the documented sizes and test Back after logout. |
| 8 | Runtime warning | Invalid text node warning in browser console | Possible hidden rendering issues | Isolate the offending conditional render and remove empty text children. |

## 10. Recommended Improvement Roadmap

### Phase 1 — Critical Fixes

- Align OM-01 to Email semantics and the documented error/loading states.
- Exercise and verify OM-11 against real persistence, authorization, and adjustment history.
- Confirm that logout clears session state and protected navigation cannot be reopened with Back.
- Replace any production-default mock/fallback record paths with explicit test fixtures.
- Resolve the React Native Web invalid text-node warning.

### Phase 2 — Design Standardization

- Make `ownerTokens.ts` the only Owner mobile source for colors, typography, spacing, radii, and icon sizes.
- Standardize page headers, buttons, inputs, tabs, cards, badges, dialogs, loading, empty, and error states.
- Bring body/label/caption text up to the Sticker Sheet scale, especially in profile, inventory, and record lists.
- Standardize status color plus icon plus label for Low Stock, Out of Stock, Near Expiry, Expired, Discrepancy, Saved, and Error.

### Phase 3 — Screen-Level Enhancements

- Refine Dashboard hierarchy for total sales, branch comparison, inventory status, alerts, and recent activities.
- Make Sales selectors and summary tabs visibly preserve period/branch context.
- Improve Inventory comparison and Alerts branch filtering with consistent controls.
- Consolidate OM-13–OM-18 into the shared record list/detail pattern while retaining type-specific fields.
- Keep discrepancy actions visually distinct from read-only record viewing.

### Phase 4 — Final Polish

- Validate Android small-screen layouts, keyboard behavior, scroll positions, modal placement, and long-list performance.
- Add visible focus/pressed/disabled/loading states where applicable.
- Verify contrast, non-color status cues, accessible names, and minimum touch targets.
- Add a supported mobile-preview or device QA route so future audits can inspect the actual mobile surface.

## 11. Final Verdict

1. **Is the Owner Module visually consistent?** Not yet. The record family is relatively consistent, but dashboard, analytics, inventory, alerts, discrepancy, and profile screens use divergent styles.
2. **Does it follow the TakoSync design system?** Partially. The shared token/component layer follows it well; legacy screen styles do not consistently consume that layer.
3. **Are the screens consistent with one another?** Functionally, mostly; visually, only within subgroups. Web and mobile are separate surfaces and should not be compared as identical layouts.
4. **Which screens are already good and need minimal improvement?** The shared Owner components, the core discrepancy state model, Physical Count detail structure, and the record screens' loading/empty/error/read-only patterns are the strongest foundations.
5. **Which screens need the most attention?** Login, Dashboard, Sales/Analytics, Inventory/Alerts, Profile, and the cross-screen styling around the record routes.
6. **What should be enhanced first?** Fix OM-01 contract/loading/error behavior and fully verify OM-11 inventory approval/persistence; then consolidate the visual token system.
7. **What are the biggest risks if the current issues remain?** Owners may enter the wrong credential type, miss or misinterpret low-stock/expiry/discrepancy signals, approve inventory changes without sufficient clarity, and experience inconsistent or unreadable mobile screens. Mock/fallback data also creates a risk of false confidence about production compliance.

