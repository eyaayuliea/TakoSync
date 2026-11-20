# Mitch frontend integration inventory

- Baseline SHA b0e83a759cd266723e5e00329e8653cc029a7c16
- Source SHA 8167f0d5195e24f4ae3370ac81927be6487384c4
- Common ancestor 4836094cb1923aeaa73eb684b30b70548f2a2550
- Divergence of 32 commits on semi-draft and two on mitch.
- Migration 202611190002 is session_independent_role_helpers on semi-draft and takoyaki_units_and_product_deductions on mitch.
- Baseline npm test passed TypeScript. 307 tests, 307 pass, 0 fail (frontend), 35 tests, 35 pass, 0 fail (Edge).

| Source file | Source change | Destination dependency | Risk | Action |
| --- | --- | --- | --- | --- |
| `assets/All-purpose flour · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Bacon bits · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Baking powder · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Bonito flakes · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Cabbage (chopped) · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Cheese · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Crab sticks · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Dashi stock · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Eggs · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Inventory Reporting/Branch Inventory.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Inventory Reporting/Category Sum.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Inventory Reporting/Ingredient Quantity.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Inventory Reporting/Inventory Disrepancy.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Inventory Reporting/Physical Count.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Inventory Reporting/Stock Status.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Japanese mayonnaise · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/More Section/Daily Sales.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/More Section/Physical Check.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/More Section/Profile and Settings.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/More Section/Transaction History.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Octopus · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Packaging · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Salt · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Soy sauce · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Stocks Icon/Batter batch.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Stocks Icon/Stock-in.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Stocks Icon/Waste.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Takoyaki batter · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `assets/Takoyaki sauce · Ingredient icon.png` | Supplied PNG art | Static Expo references | Low | Port referenced art |
| `backend/supabase/migrations/202610280002_default_ingredients.sql` | SQL, seed or catalog changes | Baseline migration history and deployed contracts | High | Exclude |
| `backend/supabase/migrations/202611020001_menu_catalog_foundation.sql` | SQL, seed or catalog changes | Baseline migration history and deployed contracts | High | Exclude |
| `backend/supabase/migrations/202611020002_atomic_prepared_batter_sales.sql` | SQL, seed or catalog changes | Baseline migration history and deployed contracts | High | Exclude |
| `backend/supabase/migrations/202611020004_sale_inventory_integrity.sql` | SQL, seed or catalog changes | Baseline migration history and deployed contracts | High | Exclude |
| `backend/supabase/migrations/202611190002_takoyaki_units_and_product_deductions.sql` | SQL, seed or catalog changes | Baseline migration history and deployed contracts | High | Exclude |
| `backend/supabase/seed.sql` | SQL, seed or catalog changes | Baseline migration history and deployed contracts | High | Exclude |
| `docs/02 Typography.pdf` | Design export | Corresponding frontend screen | Low | Use as reference |
| `docs/Current Order Summary.svg` | Design export | Corresponding frontend screen | Low | Use as reference |
| `docs/Empty Order.svg` | Design export | Corresponding frontend screen | Low | Use as reference |
| `docs/INACTIVITY LOCK.svg` | Design export | Corresponding frontend screen | Low | Use as reference |
| `docs/INVENTORY — Browse & Reports (1).svg` | Design export | Corresponding frontend screen | Low | Use as reference |
| `docs/MORE SECTION.svg` | Design export | Corresponding frontend screen | Low | Use as reference |
| `docs/PAYMENT SECTION.svg` | Design export | Corresponding frontend screen | Low | Use as reference |
| `docs/POS · Current Order.svg` | Design export | Corresponding frontend screen | Low | Use as reference |
| `docs/PRODUCT DETAILS OF EACH PRODUCT.svg` | Design export | Corresponding frontend screen | Low | Use as reference |
| `docs/RECEIPT AND MORE.svg` | Design export | Corresponding frontend screen | Low | Use as reference |
| `docs/Stocks – Inventory Operations.svg` | Design export | Corresponding frontend screen | Low | Use as reference |
| `frontend/App.tsx` | Mobile welcome, dashboard labels and inactivity timer | Mobile auth events and live owner dashboard | High | Port presentation and rebuild the lock |
| `frontend/SessionLockScreen.tsx` | Lock form and background | Inactivity and reauthentication handling | High | Port form and retain login feedback |
| `frontend/navigation/BottomNavigation.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/navigation/staffNavigation.test.mjs` | Tab label expectations | Route-origin and touch-target coverage | Medium | Adjust labels and retain route tests |
| `frontend/navigation/staffNavigation.ts` | Sentence-case tab labels | Nested routes and route origins | High | Port labels |
| `frontend/owner/AuthorizedAdjustmentRecordsScreen.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/OwnerBusinessDaySettings.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/OwnerIngredientsRecipes.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/OwnerLoginScreen.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/OwnerMenuScreens.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/OwnerMobileWorkspace.tsx` | Dashboard and workflow labels | Live repositories, filters and review state | High | Port presentation and retain existing state and profile |
| `frontend/owner/OwnerPortalWeb.tsx` | Portal labels and heading styles | Live reports and stable route and filter values | High | Port display changes |
| `frontend/owner/OwnerProfileScreen.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/OwnerSalesWorkspace.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/OwnerStaffAccounts.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/OwnerStockExpirationSettings.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/OwnerWorkspace.tsx` | Legacy capitalization | Deleted legacy mock workspace | High | Exclude |
| `frontend/owner/PhysicalCountRecordsScreen.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/SalesConsumptionRecords.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/SalesTransactionRecords.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/StockInRecordsScreen.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/WasteSpillageRecordsScreen.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/ownerAlerts.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/owner/ownerAlerts.ts` | Source labels or data-model changes | Existing service, repository or domain rules | Medium | Keep baseline contracts |
| `frontend/owner/ownerDiscrepancies.ts` | Source labels or data-model changes | Existing service, repository or domain rules | Medium | Keep baseline contracts |
| `frontend/owner/ownerInventoryStatus.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/owner/ownerInventoryStatus.ts` | Source labels or data-model changes | Existing service, repository or domain rules | Medium | Keep baseline contracts |
| `frontend/owner/ownerPortalBranches.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/owner/ownerPortalBranches.ts` | Source labels or data-model changes | Existing service, repository or domain rules | Medium | Keep baseline contracts |
| `frontend/owner/ownerPortalInventory.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/owner/ownerPortalReports.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/owner/ownerPortalReports.ts` | Source labels or data-model changes | Existing service, repository or domain rules | Medium | Keep baseline contracts |
| `frontend/owner/ownerSalesPeriod.ts` | Source labels or data-model changes | Existing service, repository or domain rules | Medium | Keep baseline contracts |
| `frontend/owner/physicalCountRepository.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/owner/physicalCountRepository.ts` | Source labels or data-model changes | Existing service, repository or domain rules | Medium | Keep baseline contracts |
| `frontend/owner/shared/ownerFormatters.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/owner/shared/ownerFormatters.ts` | Source labels or data-model changes | Existing service, repository or domain rules | Medium | Keep baseline contracts |
| `frontend/owner/shared/ownerTokens.ts` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/owner/stockInRepository.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/owner/stockInRepository.ts` | Source labels or data-model changes | Existing service, repository or domain rules | Medium | Keep baseline contracts |
| `frontend/owner/wasteSpillageRepository.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/services/businessDayReporting.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/services/businessDaySettings.ts` | Source labels or data-model changes | Existing service, repository or domain rules | Medium | Keep baseline contracts |
| `frontend/services/inventoryTransactionRecovery.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/services/takosync.staff.integration.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/services/takosync.ts` | Catalog aliasing, batch grouping and status changes | Real ingredient IDs and write recovery payloads | High | Exclude |
| `frontend/services/transactionLabels.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/services/transactionLabels.ts` | Source labels or data-model changes | Existing service, repository or domain rules | Medium | Keep baseline contracts |
| `frontend/staff/MenuWorkspace.tsx` | Product dialog, current order, progress and payment layouts | Add-on resolution, cart, checkout and retry | High | Port presentation and retain order handling |
| `frontend/staff/StaffChangePasswordScreen.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/staff/StaffWorkspace.tsx` | Inventory, stock, reports, More and form illustrations | Live catalog, unit validation, saved drafts, navigation and write recovery | High | Port presentation and retain handlers and route origins |
| `frontend/staff/inventoryAlerts.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/staff/inventoryAlerts.ts` | Source labels or data-model changes | Existing service, repository or domain rules | Medium | Keep baseline contracts |
| `frontend/staff/inventoryReports.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/staff/inventoryReports.ts` | Alternate stock rules and labels | Shared stock and expiration rules | High | Exclude |
| `frontend/staff/staffInventoryCatalog.ts` | Alternate ingredient aliases and units | Approved database catalog | High | Exclude |
| `frontend/staff/staffInventoryWorkflow.test.mjs` | Source expectations for labels, catalog or rules | Baseline regression suite | Medium | Retain baseline coverage |
| `frontend/theme/ThemeProvider.tsx` | Display text, badges or typography | Existing component and data model | Low | Port reviewed presentation |
| `frontend/theme/typography.ts` | Poppins scale | Expo fonts and theme palettes | Low | Port type scale with themed text colors |

## Integration review

The POS now has Mitch's progress indicators, current-order cards, cart summary, payment selector and product dialog. Staff inventory, stock operations, reports and More use the supplied illustrations and updated layout. Owner mobile and Owner portal use sentence-case display labels and the shared Poppins scale. Route identifiers, report periods, repository pagination and Staff route origins are preserved.

The inactivity lock covers the mobile app and the Staff web entry. An opaque lock and hidden workspace suspend interaction with protected screens and dialogs while preserving the current cart and route. The activity timestamp is scoped to the user's ID, role and branch. A saved session with a missing or expired activity timestamp requires reauthentication on launch. Unlock checks credentials in a temporary Auth client and confirms the identity and branch in the refreshed workspace session. Checkout persists the original request before submission, blocks replacement with a different payment or item list, and uses the original transaction reference for recovery.

## RPC and schema verification

Applied the complete semi-draft migration sequence and seed to disposable PostgreSQL 18.6 with minimal Supabase Auth and role fixtures. The catalog exposed all 9 requested RPC names (12 signatures including batter overloads). Each inspected signature granted authenticated execute and denied anonymous execute. The respective frontend parameter names matched the local catalog.

| Operation | Catalog arguments |
| --- | --- |
| Record inventory transactions | p_branch_id, p_request_id, p_transactions |
| Submit sale | p_transaction_reference, p_branch_id, p_payment_method, p_total_amount, p_items, p_addons |
| Process sale inventory | p_sale_id |
| Prepare batter batch | p_branch_id, p_batch_reference, plus overloads for p_prepared_quantity and p_preparation_date |
| Submit physical count | p_branch_id, p_request_id, p_check_date, p_remarks, p_lines |
| Request count correction | p_count_line_id, p_request_id, p_corrected_actual_quantity, p_reason |
| Decide count correction | p_request_id, p_decision, p_reason |
| Validate count correction | p_request_id, p_reason |
| Business session status | No parameters |

The catalog confirmed nullable product variant piece counts, the sales payload hash, and the inventory movement and physical count request IDs and payload hashes. The handwritten definitions now match those columns. A missing variant piece count is displayed as unavailable for POS checkout, consistent with the sale RPC.

The production Supabase connector denied the read-only catalog request. Hosted signatures, grants and Edge Function deployment are still unverified. Obtain read-only TakoSync catalog access for that check and use a separate development project for end-to-end writes. The branch contains no migration or Edge Function changes and no deployment was run.

## Test results

| Check | Result |
| --- | --- |
| Baseline npm test | TypeScript passed, 307/307 frontend and 35/35 Edge |
| Integration npm test | TypeScript passed, 319/319 frontend and 35/35 Edge |
| Expo exports | Staff web, Owner web and Android Hermes export built with their intended local configurations |
| Staff browser with a loopback mock | Disabled account and incorrect credentials, active session restoration, product details, cart back navigation, Cash validation, QR, hidden workspace during lock, same-reference retry, More return navigation, and different-user rejection and logout after restart |
| Owner browser with a loopback mock | Sign-in, data loading, dashboard, inventory, discrepancy review, sales and inventory reports, Staff accounts, settings, audit history, theme and narrow-screen navigation |
| Android runtime | Expo Go did not return a confirmable TakoSync screen from the development manifest. The Android export verifies compilation and assets. Device rendering and workflows still need testing. |

The local SQL test pass used pgTAP loaded into the disposable database and omitted the extension installation statement in temporary test copies. Three of eleven unchanged assertion suites finished green (14 Owner discrepancy permission checks, 25 batter checks, 4 Edge service-role permission checks). The other eight failed or stopped on legacy fixtures and expectations. The five shell concurrency/integration scripts also failed before completing their assertions. Observed causes included Owner fixtures retaining Staff employee IDs, branch-access checks rejecting older auth fixtures, outdated legacy RPC permission expectations, and invalid or missing Auth rows in fixtures. These results are separate from the npm test suite.

Fixture-only follow-ups completed the 17 sale payload and 7 expiry assertions after clearing Staff-only profile fields on synthetic Owner rows. The correction workflow passed 38 assertions and two failed before a fixture parameter error halted it. Inventory idempotency and persistent-session SQL suites remain blocked in this harness. Bring the SQL fixtures in line with the current profile, RPC and branch rules and rerun them on a disposable Supabase stack before merge.
