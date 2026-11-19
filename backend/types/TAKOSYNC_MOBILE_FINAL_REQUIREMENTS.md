# TAKOSYNC — Final Mobile Application Requirements & Implementation Reference

**Status:** Working baseline approved by the project owner  
**Last updated:** 19 November 2026  
**Applies to:** TakoSync Staff Mobile App, Owner Mobile App, and the shared backend/database required by those mobile apps.

## 1. Source-of-truth policy

Only the following approved project documents define mobile-app scope:

1. `PROJECT_CHARTER_v5.09.11.2026.docx.pdf`
2. `User_Story_v5.11.11.2026 - STAFF (MOBILE APP).pdf`
3. `User_Story_v5.11.11.2026 - OWNER (MOBILE APP).pdf`
4. `User_Story_v5.11.11.2026 - SUMMARY.pdf` — use only the sections that correspond to the approved mobile modules.

`STICKER SHEET.pdf` is the approved visual/design reference.

The mobile user stories take precedence for the behavior of their respective mobile modules. The Summary contains both Owner Web Portal and mobile scope. Do not import web-only requirements into the Owner Mobile App.

Old audits, README files, Copilot suggestions, SQL proposals, and undocumented assumptions are not authority to add features. They may be used to understand the existing code, but a feature found only there must be recorded as **not approved / excluded pending owner approval**, not implemented.

Do not silently invent business rules. If approved documents conflict or do not define a necessary behavior, document the exact conflict and ask the owner before making a product decision.

## 2. Owner-approved decisions

| Area | Approved decision |
|---|---|
| Staff credentials | Employee name is the username; Employee ID is the initial password, as stated in the approved Summary. |
| Forced password change | No forced first-login password change. The approved stories do not establish such a requirement. Do not block workspace access to force a change. |
| Staff access | Staff can access only their assigned branch. Enforce this in the backend/database, not only by hiding UI controls. |
| Owner access | Owner has authorized access to all three branches. Staff credentials must never receive Owner access. |
| Business-day session expiry | Deferred. Do not implement it in this phase. Do not block login based on business hours or business-day expiry. A normal secure authentication session is still required. |
| Inventory | Required. Inventory transactions and balances must work with persisted backend data. |
| POS | Required. Confirmed sales must be saved and trigger the correct inventory consumption exactly once. |
| Alerts | Required in-app low-stock and expiration alerts remain in scope because they are explicit in the mobile stories. |
| Push notifications | Not approved. Do not add push delivery, device notification registration, or a new notification subsystem unless separately approved. |
| Refunds / sale cancellation with inventory reversal | Not found as an approved mobile workflow. Exclude unless the owner approves a documented change. |
| Branch-to-branch inventory transfers | Not found as an approved mobile workflow. Exclude unless the owner approves a documented change. |
| Database security | Implement the safest maintainable approach that preserves approved workflows, least privilege, role separation, and branch isolation. Do not weaken authorization to make screens work. |

### Credential clarification

For Staff, the approved Summary says:
- Username: employee name.
- Initial password: Employee ID.

Do not reinterpret this as Employee ID being both username and password unless the owner changes the requirement. Do not require a password change after login.

Owner Mobile login uses the authorized Owner email and password as described by OM-01.

## 3. Staff Mobile App — approved feature scope

Implement and verify the acceptance criteria in the Staff Mobile User Stories:

- **ST-01:** Login and Branch Account Access.
- **ST-02:** POS and Sales Recording.
- **ST-03:** View Menu and Product Information.
- **ST-04:** View Branch Inventory without losing the active POS order.
- **ST-05:** Generate Receipt for a successfully recorded sale.
- **ST-06:** Generate Daily Sales for the assigned branch.
- **ST-07:** Prepared Batter Batch Recording.
- **ST-08:** Stock-In Recording.
- **ST-09:** Waste and Spillage Recording.
- **ST-10:** Low-Stock and Expiration Alerts (in-app).
- **ST-11:** Physical Inventory Count, draft editing, submitted-count correction/revision workflow, and audit history.
- **ST-12–ST-18:** Inventory Reporting and its six specified reports.
- **ST-19:** Inventory Transaction History.
- **ST-20:** Staff Profile and Logout.

### Critical Staff business rules

1. Only confirmed and recorded sales cause inventory consumption. An unconfirmed, cancelled, or incomplete order must not consume inventory.
2. Prevent duplicate sale submission and duplicate inventory deduction, including retry/network failure scenarios.
3. Prepared batter is a two-stage process:
   - Preparing a batch deducts configured raw ingredients and creates five prepared-batter bottles.
   - Completed takoyaki sales consume prepared batter using the configured yield of 25 pieces per bottle.
   - Do not deduct the raw ingredients again during the sale.
4. Stock-In increases expected inventory and records quantity, unit, date, applicable expiration date, and optional supplier/reference details.
5. Waste/spillage records represent known losses. An unexplained count difference must be recorded as a discrepancy, not silently classified as waste.
6. A physical count does not change expected inventory by itself. Owner-authorized adjustment applies the validated actual quantity.
7. Preserve count revisions and adjustment audit information as required by the stories.
8. Staff must never read or write another branch's records by changing client parameters or calling backend endpoints directly.

## 4. Owner Mobile App — approved feature scope

Implement and verify the acceptance criteria in the Owner Mobile User Stories:

- **OM-01:** Owner Login and Account Access.
- **OM-02:** Owner Dashboard.
- **OM-03–OM-08:** Sales Summaries: Daily, Weekly, Monthly, Branch Sales, and Products Sold.
- **OM-09:** Multi-Branch Inventory Monitoring and Compare Branches.
- **OM-10:** Low-Stock and Expiration Monitoring (in-app).
- **OM-11:** Review Inventory Discrepancies, validate counts, authorize adjustments, and review count-correction requests.
- **OM-12–OM-18:** Separate read-only record views: Sales Transactions, Sales Consumption, Stock-In, Waste and Spillage, Physical Inventory Counts, and Authorized Adjustments.
- **OM-19:** Owner Profile and Logout.

### Critical Owner business rules

1. Owner data access covers Branch 1, Branch 2, and Branch 3.
2. Sales reports include only confirmed and recorded sales.
3. Owner historical sales and inventory record views are read-only, except the explicitly authorized discrepancy/count-correction workflow.
4. Owner-authorized inventory adjustment must preserve previous expected quantity, actual quantity, adjusted quantity, reason, approving owner, date/time, and related discrepancy reference.
5. Staff accounts must not receive Owner privileges.
6. Owner mobile scope does not automatically include Owner Web Portal administration features unless the Owner Mobile User Stories explicitly include them.

## 5. Shared backend and database requirements

The backend must make the approved mobile workflows genuinely operational:

- Authenticate Staff and Owner using the correct role-specific credentials.
- Enforce Staff assigned-branch isolation server-side and in database policies.
- Enforce Owner authorization for cross-branch access and owner-only adjustment actions.
- Validate all submitted IDs, quantities, branch relationships, roles, and state transitions on the server.
- Use atomic database transactions/RPCs for sale recording and inventory consumption.
- Ensure retry-safe/idempotent sale processing so one sale cannot deduct stock more than once.
- Preserve a traceable inventory ledger/history for all approved transaction types.
- Ensure prepared-batter production and consumption follow the two-stage rule.
- Ensure count submission, correction, owner validation, and adjustment preserve immutable audit history.
- Use least-privilege grants and Row Level Security (RLS) where applicable.
- Never expose service-role credentials or privileged secrets in the mobile app.
- Do not rely on client-side role checks as the security boundary.
- Review every migration, function, trigger, policy, and grant before changing it.
- Do not broadly drop policies/triggers across every public table as a shortcut.
- Do not expose an unchecked privileged helper through a callable wrapper. Verify authorization at every public entry point.
- Keep the database schema and app types consistent; add migrations safely and document rollback considerations.

## 6. Deferred, excluded, and unapproved work

### Deferred — do not implement in this phase
- Business-day session expiration and business-hours-based session enforcement. This is explicitly deferred by the owner. Current login must remain available regardless of business hours.
- Any related scheduled session-closing behavior.

### Excluded unless the owner approves a change
- Push notifications and a new push-notification delivery system.
- Refund workflow or completed-sale cancellation with inventory reversal.
- Branch-to-branch inventory transfers.
- Features appearing only in old audits, README notes, Copilot suggestions, or unapproved SQL proposals.
- Owner Web Portal-only features in the Owner Mobile App.

### Still required despite the owner's “notifications not really” clarification
- The in-app Low-Stock and Expiration Alerts described in ST-10 and OM-10 remain approved mobile requirements. This does not authorize push notifications.

## 7. Design and UI reference

Follow `STICKER SHEET.pdf` for visual consistency:
- Primary: `#EC1358`
- Secondary: `#0F1025`
- Accent: `#FCA639`
- White: `#FFFFFF`
- Primary text: `#000000`
- Secondary text: `#B2B3C4`
- Canvas: `#F5F5F4`
- Card surface: `#FDFDFC`
- Divider: `#E3E3E6`
- Success: `#589144`
- Warning: `#FDE672`
- Error: `#F52F2E`
- Discrepancy: `#B9244C`
- Information: `#595EC0`
- Neutral: `#B7B7BE`
- Batter Cream: `#F6EED0`
- Typography: Poppins.
- Standard touch targets: 48 px; compact controls: 40 px.
- Use clear status text and icons, not color alone.
- Avoid gradients and decorative shadows.
- Maintain consistent spacing, typography, containers, form states, loading states, empty states, and error feedback across Staff and Owner modules.

## 8. Implementation and completion rules

1. Do not start by repeating a broad audit. First inspect the repository and map the approved stories to the actual screens, hooks, services, database objects, and tests.
2. Produce a concise gap list with exact story IDs and file paths. Then implement the highest-priority real workflow.
3. Work in small, complete vertical slices. Each slice must include UI, data/service integration, backend/database changes where needed, authorization, and tests.
4. Do not mark a story complete because a screen exists or mock data renders. It is complete only when its acceptance criteria are implemented and verified.
5. Never replace real backend integration with hardcoded/mock data to make a test pass. If mocks are used in unit tests, clearly label them and separately verify the real integration path.
6. Keep existing working functionality. Avoid unrelated refactors and do not delete code without proving it is obsolete and safe to remove.
7. Do not change production data or run destructive migrations against Production. Use a dedicated safe Development/test environment.
8. Do not claim hosted database, deployed Edge Function, or physical-device verification unless it was actually performed.
9. Run relevant tests and type checks after each slice. Report exact commands and pass/fail counts.
10. At the end of each implementation slice, report:
    - Story IDs completed or advanced.
    - Exact files changed.
    - What behavior now works.
    - Tests run and results.
    - What remains incomplete.
    - Any blocker requiring the owner's decision.
11. Do not inflate completion percentages. Distinguish source implementation, local automated verification, hosted backend verification, and real-device verification.
12. If a requirement is ambiguous, stop only that decision, explain the conflict with exact source/story references, and ask the owner. Continue other unblocked approved work.

## 9. Recommended implementation order

Use dependencies and actual repository condition to adjust this order, but do not expand scope:

1. Authentication, role separation, and branch authorization (ST-01, OM-01).
2. Shared data model, RLS, and secure backend access.
3. Owner product/menu/recipe configuration dependency only to the extent required by the existing approved mobile workflow and configured backend; do not add web screens to mobile.
4. Staff POS and confirmed sale persistence (ST-02, ST-03, ST-05).
5. Atomic, idempotent inventory consumption and prepared batter rules (ST-07).
6. Staff inventory operations: Stock-In, Waste/Spillage, physical counts (ST-08, ST-09, ST-11).
7. Owner discrepancy review and authorized adjustment (OM-11).
8. Staff and Owner inventory views, alerts, reports, records, and histories (ST-04, ST-10, ST-12–ST-19, OM-02–OM-10, OM-12–OM-18).
9. Daily sales, profiles, logout, error/loading/empty states, and final UI consistency (ST-06, ST-20, OM-19).
10. End-to-end Development-environment and real-device verification.

## 10. Change control

Any proposed feature not present in the approved sources must be listed as:
- Feature / proposal
- Where it was found
- Why it is not currently approved
- Risk or dependency if omitted
- Owner decision required

Do not implement it until the owner explicitly approves it. Update this file only after a decision is made, and record the decision date and rationale.

## 11. Implementation status snapshot — 19 November 2026

The approved 39-story denominator and the established **31 complete / 8 partial (89.7%)** source estimate are unchanged. The authentication work below advances existing stories but does not satisfy all hosted-backend or device acceptance criteria, so no story classification is upgraded.

| Story / area | Source implementation advanced | Current status and remaining evidence |
|---|---|---|
| ST-01 Staff login and branch access | Staff are not forced to change the Employee ID initial password. A local additive SQL candidate requires a live Auth session and active assigned-branch authorization. | PARTIAL. The candidate migration is unexecuted; hosted Auth/RLS and Android access remain unverified. |
| OM-01 Owner login and account access | Owner Mobile uses an Email field and a dedicated email-login action that validates the active Owner profile and resulting Auth identity. The existing username action is retained for the separate Web Portal. | PARTIAL. Local source tests do not verify deployed Edge Function, live Owner account configuration, RLS, or Android behavior. |
| Shared branch / sale processing authorization | The local additive migration validates session and sale-branch access at the public sale-processing entry point and revokes direct execution of internal sale helpers. | Not database-verified. Existing duplicate migration version `202611180001` and lack of an approved Development target block execution or deployment. |

### Verification boundaries for this snapshot

- Frontend and Edge Function checks are local source-level verification only.
- Local verification passed: `npm.cmd run typecheck`; `npm.cmd test` (**217/217 frontend, 32/32 Edge Function tests**); `npm.cmd run test:edge` (**32/32**); and `npx.cmd expo export --platform android` (**725 modules bundled**). `git diff --check` passed with line-ending normalization warnings. No lint script is defined.
- Focused Owner/Staff authentication tests passed (**18/18**). Static SQL test-plan checks match **23/23** and **48/48** assertions.
- The new PostgreSQL/pgTAP assertions have not been executed; no database connection, SQL, migration, seed, reset, or Production operation was used.
- No hosted `staff-auth` deployment, approved Development Supabase verification, Android emulator, or physical-device test was performed.
- The Owner Web Portal login implementation was not changed; it continues using its existing username action.

The next required gate is for an administrator to resolve the duplicate migration version and approve an isolated Development Supabase project. Then apply/review the full migration sequence there and run the branch/session/sale RLS tests before any deployment decision. Android verification remains a separate requirement.
