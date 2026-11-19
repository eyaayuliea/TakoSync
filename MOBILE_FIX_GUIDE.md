# Mobile Fix and Verification Guide

Scope: Staff Mobile and Owner Mobile only. The Owner Web Portal is excluded.
This guide follows the latest mobile status in sections 75–77 of
[AUDIT_REPORT.md](AUDIT_REPORT.md) and the approved scope in
[TAKOSYNC_MOBILE_FINAL_REQUIREMENTS.md](backend/types/TAKOSYNC_MOBILE_FINAL_REQUIREMENTS.md).

## Current status

- The latest audit treats the approved 39-story scope as source-complete with
  Development database and Android verification still open. No story has been
  verified against a Development database or on an Android device, so the
  audit claims no completion percentage.
- Local checks in this preparation passed TypeScript typecheck, **307 frontend
  tests**, **35 Edge Function tests**, and **49 focused Owner, Staff, and sales
  tests**. The Android check exported a JavaScript bundle (732 modules); it did
  not build an APK or verify device behavior.
- Authentication tests use mocked clients. No live Owner or Staff login was
  attempted, and the deployed `staff-auth` function's availability was not
  checked.
- Owner summaries include recorded sales with `status = completed`, regardless
  of inventory-processing status. Pending, processing, and failed inventory
  updates remain separately visible for review or retry.

## Phase 5–6 setup progress

- No migration, seed, SQL/RLS test, remote login, or Edge Function deployment
  was run in this preparation. Development deployment remains paused.
- Sections 76–77 of the audit say an isolated Development target and hosted
  verification are not established. Earlier environment/workflow statements
  are not independently verified here; confirm them before use.
- The Android export loaded the existing local Expo environment configuration
  but made no backend request and did not alter its URL or keys. Its output is
  only a JavaScript bundle, not a native Android build.

## 1. Unblock Development testing

- [ ] Confirm an isolated Development project and its non-secret project
  reference. Do not use Production for test data or acceptance testing.
- [ ] Confirm required reviewers and protection for the GitHub environment used by
  [supabase-migrations.yml](.github/workflows/supabase-migrations.yml):
  `supabase-development`. Verify configuration and protections without
  exposing secrets. Keep migration approval unset/false until migration review
  and explicit approval.
- [ ] Run a preview-only workflow after the Development target is confirmed.
  Review its output and migration sequence; do not apply migrations without
  separate explicit approval.
- [x] Confirm
  `backend/supabase/tests/202611180001_persistent_business_sessions.test.sql`
  matches the approved no-expiry behavior. It asserts there is no time-based
  expiration; do not restore business-day expiry to satisfy it.
- [ ] Deploy `staff-auth` to Development separately; the migration workflow
  does not deploy Edge Functions. Test Staff username login, Owner email login,
  active/inactive accounts, role rejection, session restoration, and logout.
- [ ] Seed Development with three branches, an active Owner, active Staff
  assigned to each branch, the approved ingredient catalog, products/variants/
  prices/add-ons/recipes, and inventory batches with expiration dates. Branch
  and menu fixtures come from migrations; `seed.sql` provides catalog, stock,
  and batches only. Provision Auth accounts through an approved Development
  admin path. Do not put credentials or keys in the repository.
- [ ] Run the relevant pgTAP and shell integration tests against Development.
  Confirm branch isolation, role checks, sale/inventory atomicity and retries,
  prepared batter, stock transactions, count corrections, reports, and audit
  records.

## 2. Owner decisions and implementation status

- [x] **ST-01, criteria 13/15/17:** persistent sessions remain; no inactivity
  timeout or business-day expiry is added.
- [x] **OM-08 vs. OM-03–OM-07 (audit section 76):** include recorded sales with
  `status = completed`, even when inventory processing is pending, processing,
  or failed; keep inventory retry/review status separate. Cancelled and
  uncompleted orders are excluded. Dashboard, Products Sold, reports, payment
  summaries, and exports use this eligibility rule.
- [x] **ST-20 alert toggles:** local low-stock/expiration visibility toggles
  are removed. The current Stock-In “alerts updated” banner is not a toggle.
- [x] **OM-01 login:** the `staff-auth` `owner-email-login` action is required
  for field-specific account errors. Direct Supabase Auth fallback is removed;
  an unavailable or invalid Edge response shows a connection error.

## 3. Development acceptance checklist

The checklist below covers remaining Development and Android verification.
Source-complete status is not evidence that hosted behavior is operationally
verified.

### Staff Mobile

- [ ] **ST-01 — Login and branch access:** Verify correct credentials, rejected
  inactive/unknown roles, session restore/revocation, and server-side access
  only to the assigned branch. Apply the decision above before implementing
  any timeout behavior.
- [ ] **ST-02 — POS and sales:** Verify menu/cart/payment/confirmation, persisted
  sale and receipt, atomic inventory consumption exactly once, and retry with
  the same transaction reference. A failed or unconfirmed sale must not deduct
  stock. Check the user-facing unavailable-item, empty-order, cancel-order, and
  offline-error behavior.
- [ ] **ST-03 — Menu/products:** Verify hosted branch visibility, availability,
  variants, add-ons, prices, and product details.
- [ ] **ST-04 — Inventory:** Verify Staff sees only assigned-branch inventory
  and that opening inventory does not discard the active POS order.
- [ ] **ST-05 — Receipt:** Generate/share a receipt from a saved sale and check
  sale, item, variant, add-on, branch, and inventory-processing details.
- [ ] **ST-06 — Daily sales:** Check saved completed sales, assigned branch,
  totals/breakdowns, and Manila business-day boundaries.
- [ ] **ST-07 — Prepared batter:** Verify raw ingredient deduction, exactly
  five bottles per batch, configured sales yield, and no double deduction of
  raw ingredients. Confirm the deployed RPC contract matches the app.
- [ ] **ST-08 — Stock-in:** Verify quantity, database unit, date, batch,
  expiration, and optional supplier/reference details are persisted.
- [ ] **ST-09 — Waste/spillage:** Verify the selected reason and quantity are
  recorded and deducted correctly; unexplained count differences must remain
  discrepancies, not waste.
- [ ] **ST-10 — Alerts:** Verify the in-app low/out/near-expiry/expired views,
  counts, order, filters, empty/error/retry states, and refresh after inventory
  changes. Push notifications are not in scope.
- [ ] **ST-11 — Physical count:** Verify drafts, edits, submission, retry,
  revisions, and audit history. A count alone must not change expected stock;
  only the validated Owner correction flow may apply an adjustment.
- [ ] **ST-12–ST-18 — Inventory reports:** Check report navigation (**ST-12**),
  total ingredient quantities (**ST-13**), category totals (**ST-14**), stock
  status (**ST-15**), assigned-branch summary (**ST-16**), discrepancies and
  correction history (**ST-17**), and count history (**ST-18**). Reconcile
  report values with Development records and confirm branch isolation.
- [ ] **ST-19 — Transaction history:** Verify filters and movement details,
  including actor, before/after quantities, references, and branch isolation.
- [ ] **ST-20 — Profile/logout:** Verify displayed profile/access, optional
  password change, and that logout invalidates the usable Auth session. Resolve
  logout behavior; do not restore local low-stock/expiration visibility toggles.

### Owner Mobile

- [ ] **OM-01 — Login/account access:** Verify email login, role checks,
  field-specific errors, session restore, and logout through the required
  Development `staff-auth` `owner-email-login` action; direct Auth fallback is
  not allowed.
- [ ] **OM-02 — Dashboard:** Verify recorded-sales totals, inventory/status
  counts, activities, branch/period selection, loading/empty/error/retry, and
  authorized access to all three branches.
- [ ] **OM-03–OM-06 — Sales summaries:** Verify general, daily, weekly, and
  monthly results against persisted sales and the approved eligibility rule.
- [ ] **OM-07 — Branch sales:** Verify all-branch and selected-branch summaries
  against Development data and Owner RLS.
- [ ] **OM-08 — Products Sold:** Verify joins, branch/period filters, sorting,
  quantities, amounts, and the approved sale-eligibility rule from the decision
  above.
- [ ] **OM-09 — Multi-branch inventory:** Verify branch comparisons, quantities,
  stock states, batches, and expiration details.
- [ ] **OM-10 — Alerts:** Verify in-app categories, counts, branch filters,
  thresholds, and expiration windows against saved settings and live batches.
  Push delivery is not approved.
- [ ] **OM-11 — Discrepancy review:** Exercise pending, approved, rejected, and
  validated states. Confirm only authorized Owner actions can adjust stock and
  that before/actual/adjusted quantities, reason, approver, time, and
  discrepancy reference are retained.
- [ ] **OM-12–OM-18 — Records:** Verify sales/inventory activity (**OM-12**),
  transactions (**OM-13**), consumption (**OM-14**), stock-in (**OM-15**),
  waste/spillage (**OM-16**), physical counts (**OM-17**), and authorized
  adjustments (**OM-18**) against Development data. Confirm filters, branch
  access, read-only behavior, and audit links.
- [ ] **OM-19 — Profile/logout:** Verify profile update, password/session
  behavior, and logout against Development Auth.

## 4. Android verification

- [ ] Start and verify the available Android emulator (or connect a device);
  `adb devices` previously showed no connected device, and emulator startup has
  not been verified.
- [ ] Point the app at Development and smoke-test Staff/Owner login, navigation,
  POS checkout/retry, inventory forms, alerts, discrepancy review, keyboard
  behavior, and touch/accessibility targets.
- [ ] Fix only issues reproduced on the device. An Expo JavaScript export is
  not a substitute for this check.

## 5. Explicitly out of scope

- Business-day/closing-time session expiry and an inactivity timeout until the
  owner resolves the related criteria.
- Push notifications or device notification registration; alerts are in-app.
- Refunds, sale cancellation with inventory reversal, and branch-to-branch
  transfers.
- Owner Web Portal requirements.
