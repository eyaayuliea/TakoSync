import React, { useEffect, useMemo, useState } from 'react';
import { reportSetupMessage } from './ownerReportSetup';
import { formatReportDate, formatReportDateTime, formatReportPeriod, reportMetaLines, type ReportDocument, type ReportSection } from './reportDocument';
import { buildWebDailyClosingReport, DAILY_CLOSING_HEADERS } from './ownerPortalDailyClosingReport';
import { buildWebReversalReport, REVERSAL_REPORT_HEADERS, type ReversingEntry } from './ownerPortalReversalReport';
import {
  ADDONS_SOLD_HEADERS,
  BRANCH_SALES_HEADERS,
  buildWebBranchSalesReport,
  buildWebProductsSoldReport,
  buildWebTransactionSummaryReport,
  buildSaleDetailRows,
  PRODUCTS_SOLD_HEADERS,
  SALE_DETAIL_HEADERS,
  TRANSACTION_SUMMARY_HEADERS,
} from './ownerPortalSalesReports';
import { staffLockStatus, staffPasswordResetPrompt } from '../services/staffAccountLock';
import { OwnerPasswordChangeError, validateOwnerPasswordChange, type OwnerPasswordErrors, type OwnerPasswordFields } from '../services/ownerPasswordChange';
import { isOwnerPortalConnectionError, OWNER_PORTAL_CONNECTION_MESSAGE, ownerPortalErrorText } from './ownerPortalErrors';
import { portalPageState, type PortalDataset } from './ownerPortalPageState';
import { DASHBOARD_ALERT_CATEGORIES, dashboardAlertCounts, dashboardAlerts, dashboardStockCounts, filterDashboardAlerts, type DashboardAlertType } from './ownerPortalDashboard';
import { branchNameError, CONFIG_SECTIONS, openingStockRows, parseOpeningQuantity, unitRows, type ConfigSectionKey, type OpeningStockRow } from './ownerPortalBusinessConfig';
import { expiryRuleRows, expiryRuleSummary, expiryRuleWarning, parseItemAlertDays, parseShelfLifeDays, type ExpiryRuleRow } from './ownerPortalExpiryRules';
import { BOTTLES_PER_BATCH, parseAlertDays, parseMinimumStock, parseYieldPerBottle, thresholdRows, yieldPerBottle, type ThresholdRow } from './ownerPortalBatterThresholds';
import {
  BASE_UNITS,
  baseUnitOf,
  INGREDIENT_HEADERS,
  ingredientFormErrors,
  ingredientTableRows,
  RECIPE_HEADERS,
  recipeTableRows,
  UNITS_BY_BASE,
  type BaseUnit,
  type IngredientForm,
} from './ownerPortalIngredients';
import { AUDIT_HEADERS, AUDIT_RECORD_TYPES, auditRow, buildAuditRecords, filterAuditRecords } from './ownerPortalAudit';
import {
  ADJUSTMENT_HISTORY_HEADERS,
  adjustmentHistoryRows,
  DISCREPANCY_HEADERS,
  discrepancyRow,
  filterDiscrepancies,
  RECONCILIATION_STATUSES,
  reconciliationStatus,
  REVISION_HEADERS,
  revisionHistoryRows,
  type ReconciliationStatus,
} from './ownerPortalReconciliation';
import {
  BRANCH_COMPARISON_TAB,
  BRANCH_INVENTORY_HEADERS,
  branchInventoryRows,
  filterInventoryRows,
  inventoryCategories,
  inventoryComparison,
  inventoryTabLabel,
} from './ownerPortalInventoryViews';
import {
  buildWebSalesConsumptionReport,
  buildWebVoidReversalReport,
  buildWebWasteReport,
  SALES_CONSUMPTION_HEADERS,
  VOID_REVERSAL_REPORT_HEADERS,
  WASTE_SPILLAGE_HEADERS,
} from './ownerPortalMovementReports';
import { buildSalesConsumptionRecords, type SalesConsumptionRecord } from './salesConsumptionRepository';
import { ADJUSTMENT_REPORT_HEADERS, buildWebAdjustmentReport, buildWebCountReport, COUNT_REPORT_HEADERS } from './ownerPortalCountReports';
import { loadPhysicalCountRecords, type PhysicalCountRecord } from './physicalCountRepository';
import { buildTotalInventoryViews, TOTAL_INVENTORY_VIEWS, type TotalInventoryView } from './ownerPortalTotalInventoryReport';
import { downloadReportPdf, openReportPrintView } from './reportOutputWeb';
import { OwnerLoginError, isOwnerConnectionFailure } from '../services/ownerAuthentication';
import OwnerRequestsScreen from './OwnerRequestsScreen';
import { ThemeProvider } from '../theme/ThemeProvider';
import { useFonts } from 'expo-font';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { buildWebVoidReport, WEB_VOID_REPORT_HEADERS } from './ownerPortalVoidReport';
import { buildWebStockInReport } from './ownerPortalStockInReport';
import { formatStockInDate, formatStockInDateTime, formatStockInExpirationDate, formatStockInQuantity, loadStockInRecords, stockInEnteredQuantity, type StockInRecord } from './stockInRepository';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import {
  createIngredient,
  createIngredientCategory,
  createProduct,
  decideOwnerInventoryCountCorrection,
  isOwnerDiscrepancyRecountable,
  rejectOwnerSubmittedInventoryCount,
  getCurrentUser,
  loadBranches,
  isOwnerDiscrepancyActionable,
  isOwnerDiscrepancyValidatable,
  isOwnerDiscrepancyValidationBlocked,
  VALIDATION_BLOCKED_MESSAGE,
  loadIngredientRecipeConfiguration,
  loadOwnerActivityData,
  loadOwnerDiscrepancyReviews,
  loadOwnerSalesConsumptionBundle,
  loadReversedEntryIds,
  loadOwnerEntryReversalReviews,
  loadEntryReversalMovementsByRequest,
  type OwnerEntryReversalReview,
  loadOwnerInventory,
  loadOwnerSalesData,
  loadOwnerSaleVoidReviews,
  loadOwnerDailyClosings,
  type OwnerSaleVoidReview,
  loadProductManagement,
  loadSharedRecipes,
  loadStaffAccounts,
  resetStaffPasswordToEmployeeId,
  loadStockExpirationSettings,
  saveProductRecipe,
  saveSharedRecipe,
  saveStaffAccount,
  signInOwnerWithEmail,
  signOut,
  updateIngredient,
  saveIngredientExpiryRules,
  updateMinimumStock,
  updateNearExpirationDays,
  updateOwnerProfile,
  changeOwnerPassword,
  updateProduct,
  saveIngredientPurchaseUnit,
  saveAddonRecipe,
  loadMenuAddonConfiguration,
  saveMenuAddon,
  saveProductAddons,
  updateBulkOrderThreshold,
  type MenuAddonConfiguration,
  type StockExpirationSettingsData,
  type BusinessConfiguration,
  loadBusinessConfiguration,
  saveBranchName,
  recordOpeningStock,
  setBusinessGoLive,
  validateOwnerInventoryCountCorrection,
  validateOwnerSubmittedInventoryCount,
  type AppUser,
  type OwnerDiscrepancyReview,
  type ProductManagementItem,
  type SharedRecipeRecord,
} from '../services/takosync';
import { PRODUCT_PORTION_TYPES, standardProductVariants, type ProductPortionType } from '../services/productCatalog';
import { getManilaReportingRange, manilaDateKey, type ReportingPeriod } from '../services/businessDaySettings';
import {
  filterOwnerPortalInventory,
  summarizeOwnerPortalBranches,
  type OwnerPortalBranch,
} from './ownerPortalBranches';
import { buildOwnerPortalInventoryRows, type OwnerPortalInventoryRow } from './ownerPortalInventory';
import { buildOwnerPortalVariantPrices, PRODUCT_TABLE_HEADERS, productFormErrors, productTableRows } from './ownerPortalProducts';
import {
  filterOwnerPortalConfirmedSales,
  summarizeOwnerPortalSalesByBranch,
  totalOwnerPortalSales,
  type OwnerPortalMovementReport,
} from './ownerPortalReports';
import { reviewStyles } from './ownerPortalReviewStyles';

type Page = 'Dashboard' | 'Sales Monitoring' | 'Inventory Monitoring' | 'Sales Reports' | 'Inventory Reports' | 'Configuration' | 'Reconciliation'
  | 'Void & Reversal Review' | 'Staff Accounts' | 'Branches' | 'Inventory Movements' | 'Audit History' | 'Profile';
type Branch = string;
type InventoryRow = OwnerPortalInventoryRow;
// OW-02 c1: the sections in the order of the project charter (2 Dashboard, 3 Sales Monitoring, 4 Inventory
// Monitoring, 5–6 Reports, 7–10 Configuration, 11 Reconciliation, 12 Void and Reversal
// Review, 13 Staff Accounts, 14 Branches, 15 Audit History, 16 Profile).
const nav: Array<[Page, string]> = [
  ['Dashboard', '⌂'], ['Sales Monitoring', '₱'], ['Inventory Monitoring', '▦'], ['Sales Reports', '▤'], ['Inventory Reports', '▤'],
  ['Configuration', '⚙'], ['Reconciliation', '✓'], ['Void & Reversal Review', '↺'], ['Staff Accounts', '♙'],
  ['Branches', '⌘'], ['Inventory Movements', '↕'], ['Audit History', '◷'], ['Profile', '☺'],
];
// The data each page needs before it can show its content (OW-02 c9).
const PAGE_DATA: Record<Page, PortalDataset[]> = {
  Dashboard: ['inventory', 'sales', 'reviews'],
  'Sales Monitoring': ['inventory'],
  'Inventory Monitoring': ['inventory'],
  'Sales Reports': [],
  'Inventory Reports': ['inventory'],
  Configuration: ['configuration', 'inventory'],
  Reconciliation: ['reviews', 'inventory'],
  'Void & Reversal Review': [],
  'Staff Accounts': ['staff', 'inventory'],
  Branches: ['inventory', 'sales'],
  'Inventory Movements': ['activity', 'inventory'],
  'Audit History': ['inventory'],
  Profile: [],
};
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function OwnerPortalWeb() {
  const { width, height } = useWindowDimensions(); const compact = width < 1050; const narrow = width < 720;
  const [page, setPage] = useState<Page>('Dashboard'); const [branch, setBranch] = useState<Branch>('All Branches');
  const [dark, setDark] = useState(false); const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  // OW-01 c3, c9: a message per empty field, and a Retry when the connection failed.
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({}); const [connectionFailed, setConnectionFailed] = useState(false);
  const [showPassword, setShowPassword] = useState(false); const [user, setUser] = useState<AppUser | null>(null);
  const [authBusy, setAuthBusy] = useState(true); const [busy, setBusy] = useState(false); const [logoutBusy, setLogoutBusy] = useState(false); const [error, setError] = useState('');
  const [dataError, setDataError] = useState(''); const [toast, setToast] = useState('');
  // OW-02 c9 / OW-31 c2, c8: each section shows loading, then its data or an error with Retry.
  const [loadErrors, setLoadErrors] = useState<Partial<Record<PortalDataset, string>>>({});
  const [loadingSets, setLoadingSets] = useState<ReadonlySet<PortalDataset>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedSets, setLoadedSets] = useState<ReadonlySet<PortalDataset>>(new Set());
  const markLoaded = (names: PortalDataset[]) => setLoadedSets((current) => new Set([...current, ...names]));
  // OW-31 c1: a session restore that cannot reach the server offers Retry instead of the login page.
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [restoreKey, setRestoreKey] = useState(0);
  // OW-30 c8: Log Out asks for a confirmation.
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [inventoryData, setInventoryData] = useState<Awaited<ReturnType<typeof loadOwnerInventory>> | null>(null);
  const [salesData, setSalesData] = useState<Awaited<ReturnType<typeof loadOwnerSalesData>> | null>(null);
  const [activityData, setActivityData] = useState<Awaited<ReturnType<typeof loadOwnerActivityData>> | null>(null);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof loadOwnerDiscrepancyReviews>>>([]);
  const [staff, setStaff] = useState<Awaited<ReturnType<typeof loadStaffAccounts>>>([]);
  const [configuration, setConfiguration] = useState<any>(null); const [products, setProducts] = useState<ProductManagementItem[]>([]); const [stockSettings, setStockSettings] = useState<any>(null);
  const notify = (message: string, isError = false) => {
    if (isError) {
      // OW-31 c3, c10: a plain message; the form keeps what the owner entered.
      setDataError(ownerPortalErrorText(message, 'The change could not be saved. Please try again.'));
      return;
    }
    // A success replaces an earlier error message.
    setDataError('');
    setToast(message);
    setTimeout(() => setToast(''), 2400);
  };
  useEffect(() => {
    setAuthBusy(true);
    setRestoreFailed(false);
    getCurrentUser()
      .then(async (current) => {
        if (current?.role === 'Owner') setUser(current);
        else if (current) { setError('This account does not have Owner access.'); await signOut(); }
      })
      .catch((reason: unknown) => {
        if (isOwnerPortalConnectionError(reason)) setRestoreFailed(true);
        else setError(ownerPortalErrorText(reason, 'Your session could not be restored. Please log in again.'));
      })
      .finally(() => setAuthBusy(false));
  }, [restoreKey]);
  useEffect(() => {
    if (!user) {
      setInventoryData(null);
      setSalesData(null);
      setActivityData(null);
      setReviews([]);
      setStaff([]);
      setBusy(false);
      return;
    }

    let active = true;
    setBusy(true);
    setDataError('');
    setLoadErrors((current) => ({ ...current, inventory: undefined, sales: undefined, activity: undefined, reviews: undefined, staff: undefined }));
    setLoadingSets((current) => new Set([...current, 'inventory', 'sales', 'activity', 'reviews', 'staff']));
    const reportingRange = getManilaReportingRange('This Month');
    if (!reportingRange) {
      setDataError('Unable to determine the current Manila reporting month.');
      setBusy(false);
      return () => { active = false; };
    }
    Promise.allSettled([
      loadOwnerInventory(),
      loadOwnerSalesData({
        start: reportingRange.start,
        end: reportingRange.end,
        branchId: null,
      }),
      loadOwnerActivityData({
        start: reportingRange.start,
        end: reportingRange.end,
        branchId: null,
      }),
      loadOwnerDiscrepancyReviews(null),
      loadStaffAccounts(),
    ]).then((results) => {
      if (!active) return;
      const names: PortalDataset[] = ['inventory', 'sales', 'activity', 'reviews', 'staff'];
      setLoadErrors((current) => {
        const next = { ...current };
        results.forEach((result, index) => {
          next[names[index]] = result.status === 'rejected'
            ? ownerPortalErrorText(result.reason, 'This section could not be loaded. Please try again.')
            : undefined;
        });
        return next;
      });
      markLoaded(names.filter((_, index) => results[index].status === 'fulfilled'));
      const [inventory, sales, activity, discrepancy, accounts] = results;
      if (inventory.status === 'fulfilled') setInventoryData(inventory.value);
      if (sales.status === 'fulfilled') setSalesData(sales.value);
      if (activity.status === 'fulfilled') setActivityData(activity.value);
      if (discrepancy.status === 'fulfilled') setReviews(discrepancy.value);
      if (accounts.status === 'fulfilled') setStaff(accounts.value);
    }).finally(() => {
      if (!active) return;
      setBusy(false);
      setLoadingSets((current) => new Set([...current].filter((name) => !['inventory', 'sales', 'activity', 'reviews', 'staff'].includes(name))));
    });
    return () => { active = false; };
  }, [user, reloadKey]);
  useEffect(() => {
    if (!user) {
      setProducts([]);
      setConfiguration(null);
      setStockSettings(null);
      return;
    }
    let active = true;
    setLoadingSets((current) => new Set([...current, 'configuration']));
    setLoadErrors((current) => ({ ...current, configuration: undefined }));
    Promise.allSettled([
      loadProductManagement(),
      loadIngredientRecipeConfiguration(),
      loadStockExpirationSettings(),
    ]).then(([productResult, configurationResult, stockResult]) => {
      if (!active) return;
      const failure = [productResult, configurationResult, stockResult]
        .find((result): result is PromiseRejectedResult => result.status === 'rejected');
      setLoadErrors((current) => ({
        ...current,
        configuration: failure ? ownerPortalErrorText(failure.reason, 'The configuration could not be loaded. Please try again.') : undefined,
      }));
      if (!failure) markLoaded(['configuration']);
      if (productResult.status === 'fulfilled') setProducts(productResult.value);
      if (configurationResult.status === 'fulfilled') setConfiguration(configurationResult.value);
      if (stockResult.status === 'fulfilled') setStockSettings(stockResult.value);
    }).finally(() => {
      if (active) setLoadingSets((current) => new Set([...current].filter((name) => name !== 'configuration')));
    });
    return () => { active = false; };
  }, [user, reloadKey]);
  const rows = useMemo(() => buildOwnerPortalInventoryRows(inventoryData), [inventoryData]);
  // OW-01: the owner signs in with email and password, like the owner mobile app.
  const login = async () => {
    if (busy) return;
    const missing = {
      ...(!username.trim() ? { email: 'Please enter your email.' } : {}),
      ...(!password ? { password: 'Please enter your password.' } : {}),
    };
    setFieldErrors(missing);
    setError('');
    setConnectionFailed(false);
    if (missing.email || missing.password) return;
    setBusy(true);
    try {
      const signedIn = await signInOwnerWithEmail(username, password);
      setPassword('');
      setUser(signedIn);
      // OW-01 c10: Back must not return to the login form.
      if (typeof window !== 'undefined' && window.history?.replaceState) window.history.replaceState(null, '', window.location.pathname);
    } catch (reason: unknown) {
      if (reason instanceof OwnerLoginError && reason.code === 'email_not_found') setFieldErrors({ email: reason.message });
      else if (reason instanceof OwnerLoginError && reason.code === 'incorrect_password') { setFieldErrors({ password: reason.message }); setPassword(''); }
      else {
        const offline = isOwnerConnectionFailure(reason);
        setConnectionFailed(offline);
        setError(offline ? new OwnerLoginError('connection_failure').message : ownerPortalErrorText(reason, 'Unable to log in. Please try again.'));
      }
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    setConfirmingLogout(false);
    setLogoutBusy(true);
    setDataError('');
    try {
      await signOut();
      setUser(null);
    } catch (reason: unknown) {
      notify(ownerPortalErrorText(reason, 'Unable to log out. Please try again.'), true);
    } finally {
      setLogoutBusy(false);
    }
  };
  if (authBusy) return <View style={styles.center}><ActivityIndicator color={C.pink} /><Text style={styles.muted}>Restoring your session…</Text></View>;
  if (restoreFailed) {
    return (
      <View style={styles.center} accessibilityRole="alert">
        <Text style={styles.section}>Unable to connect</Text>
        <Text style={styles.muted}>{OWNER_PORTAL_CONNECTION_MESSAGE}</Text>
        <Pressable accessibilityRole="button" onPress={() => setRestoreKey((key) => key + 1)} style={styles.outline}><Text style={styles.outlineText}>Retry</Text></Pressable>
      </View>
    );
  }
  if (!user) return <Login username={username} password={password} error={error} fieldErrors={fieldErrors} connectionFailed={connectionFailed} busy={busy} showPassword={showPassword} setUsername={(value: string) => { setUsername(value); setFieldErrors((current) => ({ ...current, email: undefined })); }} setPassword={(value: string) => { setPassword(value); setFieldErrors((current) => ({ ...current, password: undefined })); }} setShowPassword={setShowPassword} login={login} narrow={narrow} />;
  const refreshInventory = async (message: string, isError = false) => {
    if (isError) {
      notify(message, true);
      return;
    }
    notify(message);
    try {
      const [inventory, managedProducts, nextConfiguration, nextStockSettings] = await Promise.all([
        loadOwnerInventory(),
        loadProductManagement(),
        loadIngredientRecipeConfiguration(),
        loadStockExpirationSettings(),
      ]);
      setInventoryData(inventory);
      setProducts(managedProducts);
      setConfiguration(nextConfiguration);
      setStockSettings(nextStockSettings);
      setDataError('');
    } catch (reason: unknown) {
      notify(reason instanceof Error ? reason.message : 'Owner inventory and product refresh failed.', true);
    }
  };
  const refreshStaff = async (message: string, isError = false) => {
    if (isError) {
      notify(message, true);
      return;
    }
    notify(message);
    try {
      setStaff(await loadStaffAccounts());
    } catch (reason: unknown) {
      notify(reason instanceof Error ? reason.message : 'Staff refresh failed.', true);
    }
  };
  const refreshReviews = async () => {
    setReviews(await loadOwnerDiscrepancyReviews(null));
  };
  const pageState = portalPageState(PAGE_DATA[page], loadErrors, loadingSets, loadedSets);
  return (
    <View style={[styles.app, dark && styles.dark, narrow && { flexDirection: 'column' }]}>
      <View style={[styles.sidebar, compact && styles.sidebarSmall, narrow && { width: '100%', height: 58, padding: 8, paddingTop: 8, flexDirection: 'row', alignItems: 'center' }]}>
        <View style={[styles.brand, narrow && { marginBottom: 0, marginRight: 6 }]}>
          <Text style={styles.logo}>T</Text>
          {!compact && <View><Text style={styles.brandName}>TakoSync</Text><Text style={styles.brandSub}>OWNER PORTAL</Text></View>}
        </View>
        {!narrow && <Text style={styles.menu}>WORKSPACE</Text>}
        <ScrollView horizontal={narrow} contentContainerStyle={narrow ? { alignItems: 'center' } : undefined} style={narrow ? { flex: 1 } : undefined}>
          {nav.map(([label, icon]) => (
            <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={() => setPage(label)} style={[styles.nav, page === label && styles.navActive, narrow && { marginBottom: 0, paddingHorizontal: 8 }]}>
              <Text style={styles.navIcon}>{icon}</Text>
              {!compact && <Text style={styles.navText}>{label}</Text>}
              {label === 'Reconciliation' && <Text style={styles.badge}>{reviews.filter((item) => item.status === 'Pending').length}</Text>}
            </Pressable>
          ))}
        </ScrollView>
        {!narrow && <View style={styles.profile}>
          <Text style={styles.avatar}>{user.displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</Text>
          {!compact && <View><Text style={styles.profileName}>{user.displayName}</Text><Text style={styles.profileRole}>Owner · {user.email}</Text></View>}
        </View>}
        <Pressable accessibilityRole="button" accessibilityLabel="Log out" disabled={logoutBusy} onPress={() => setConfirmingLogout(true)}>
          <Text style={styles.logout}>{logoutBusy ? 'Signing out…' : `↪ ${compact ? '' : 'Log out'}`}</Text>
        </Pressable>
      </View>
      <View style={styles.main}>
        <View style={[styles.header, narrow && { paddingHorizontal: 16, paddingTop: 16, minHeight: 76 }]}>
          <View><Text style={styles.eyebrow}>OWNER MANAGEMENT / {page.toUpperCase()}</Text><Text style={styles.title}>{page}</Text></View>
          <View style={styles.headerActions}>
            <Text style={styles.livePill}>LIVE SUPABASE</Text>
            <Pressable onPress={() => setDark(!dark)} style={styles.iconButton}><Text>{dark ? '☀' : '☾'}</Text></Pressable>
          </View>
        </View>
        <ScrollView contentContainerStyle={[styles.content, narrow && { padding: 16, paddingBottom: 40 }]}>
          {dataError && <View style={styles.errorBanner} accessibilityRole="alert"><Text style={styles.errorText}>{dataError}</Text></View>}
          {confirmingLogout ? (
            <Panel title="Log out?">
              <Text style={styles.body}>You will need to log in again to use the Owner Web Portal.</Text>
              <View style={styles.line}>
                <Pressable accessibilityRole="button" onPress={() => setConfirmingLogout(false)} style={styles.outline}><Text style={styles.outlineText}>Cancel</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Confirm log out" onPress={() => void logout()} style={styles.loginButton}><Text style={styles.loginButtonText}>Log Out</Text></Pressable>
              </View>
            </Panel>
          ) : null}
          {pageState.kind === 'error' ? (
            <SectionError message={pageState.message} onRetry={() => setReloadKey((key) => key + 1)} />
          ) : pageState.kind === 'loading' ? (
            <SectionLoading label={`Loading ${page.toLowerCase()}…`} />
          ) : <>
          {page === 'Dashboard' && (
            <Dashboard
              onOpenReconciliation={() => setPage('Reconciliation')}
              rows={rows}
              inventoryAvailable={inventoryData !== null}
              branches={inventoryData?.branches ?? []}
              branch={branch}
              setBranch={setBranch}
            />
          )}
          {page === 'Branches' && <Branches rows={rows} sales={salesData} branches={inventoryData?.branches ?? []} />}
          {page === 'Sales Monitoring' && <SalesMonitoring branches={inventoryData?.branches ?? []} />}
          {page === 'Inventory Monitoring' && <Inventory rows={rows} branches={inventoryData?.branches ?? []} />}
          {page === 'Inventory Movements' && <Movements activity={activityData?.transactions ?? []} branches={inventoryData?.branches ?? []} inventoryRows={rows} />}
          {page === 'Reconciliation' && <Checks reviews={reviews} branches={inventoryData?.branches ?? []} notify={notify} onRefresh={refreshReviews} />}
          {page === 'Void & Reversal Review' && <VoidReversalReview height={Math.max(560, height - 200)} onBack={() => setPage('Dashboard')} />}
          {page === 'Sales Reports' && <Reports sales={salesData} />}
          {page === 'Inventory Reports' && (
            <InventoryReports
              branch={branch}
              setBranch={setBranch}
              branches={inventoryData?.branches ?? []}
              inventoryRows={rows}
              inventoryAvailable={inventoryData !== null}
              batches={inventoryData?.batches ?? []}
            />
          )}
          {page === 'Staff Accounts' && <StaffManager accounts={staff} branches={inventoryData?.branches ?? []} onSaved={refreshStaff} />}
          {page === 'Configuration' && <SettingsEditor products={products} configuration={configuration} stockSettings={stockSettings} onSaved={refreshInventory} />}
          {page === 'Profile' && <ProfileEditor user={user} onSaved={notify} onNameChanged={(displayName) => setUser((current) => current && { ...current, displayName })} />}
          {page === 'Audit History' && <Audit branches={inventoryData?.branches ?? []} inventoryRows={rows} />}
          </>}
        </ScrollView>
        {toast && <View style={styles.toast}><Text style={styles.toastText}>✓ {toast}</Text></View>}
      </View>
    </View>
  );
}

function Login({ username, password, error, fieldErrors = {}, connectionFailed = false, busy, showPassword, setUsername, setPassword, setShowPassword, login, narrow }: any) {
  return (
    <View style={[styles.login, narrow && { flexDirection: 'column' }]}>
      <View style={[styles.loginPanel, narrow && { padding: 24, minHeight: 520 }]}>
        <View style={[styles.loginBrand, narrow && { position: 'relative', top: 0, left: 0, marginBottom: 48 }]}>
          <Text style={styles.logo}>T</Text><Text style={styles.brandName}>TakoSync</Text>
        </View>
        <Text style={styles.kicker}>OWNER WEB MANAGEMENT PORTAL</Text>
        <Text style={styles.loginTitle}>Welcome back, Gelo.</Text>
        <Text style={styles.loginSub}>Sign in with your Owner email and password.</Text>
        <View style={[styles.form, narrow && { width: '100%' }]}>
          <Text style={styles.label}>Email</Text>
          <TextInput value={username} onChangeText={setUsername} onSubmitEditing={login} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" accessibilityLabel="Email, required" style={[styles.input, fieldErrors.email && { borderColor: '#B9244C' }]} placeholder="Enter your email" />
          {fieldErrors.email ? <Text style={[styles.errorText, { marginTop: 6 }]} accessibilityRole="alert">{fieldErrors.email}</Text> : null}
          <Text style={styles.label}>Password</Text>
          <View style={[styles.password, fieldErrors.password && { borderColor: '#B9244C' }]}>
            <TextInput value={password} onChangeText={setPassword} onSubmitEditing={login} secureTextEntry={!showPassword} accessibilityLabel="Password, required" style={styles.passwordInput} placeholder="Enter your password" />
            <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword(!showPassword)} style={{ paddingHorizontal: 13, paddingVertical: 10 }}><Text style={styles.pinkText}>{showPassword ? 'Hide' : 'Show'}</Text></Pressable>
          </View>
          {fieldErrors.password ? <Text style={[styles.errorText, { marginTop: 6 }]} accessibilityRole="alert">{fieldErrors.password}</Text> : null}
          {error ? (
            <View style={[styles.errorBanner, { marginTop: 14, marginBottom: 0 }]} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
              {connectionFailed ? <Pressable accessibilityRole="button" onPress={login} style={{ marginTop: 8 }}><Text style={styles.pinkText}>Retry</Text></Pressable> : null}
            </View>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Log In" onPress={login} disabled={busy} style={styles.loginButton}>
            <Text style={styles.loginButtonText}>Log In</Text>
          </Pressable>
        </View>
        {busy ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,16,39,0.42)', alignItems: 'center', justifyContent: 'center' }} accessibilityRole="alert">
            <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center', gap: 12, minWidth: 220 }}>
              <ActivityIndicator color={C.pink} size="large" />
              <Text style={styles.strong}>Logging in…</Text>
            </View>
          </View>
        ) : null}
        <Text style={[styles.loginFooter, narrow && { left: 24, bottom: 12 }]}>Authentication and access are enforced by Supabase.</Text>
      </View>
      {!narrow && <View style={styles.loginArt}><Text style={styles.artEmoji}>🐙</Text><Text style={styles.artTitle}>Make every count count.</Text><Text style={styles.artCopy}>One secure view across all three Gelo's Takoyaki branches.</Text></View>}
    </View>
  );
}
/**
 * OW-26: the owner reviews voids and entry reversal requests on the web with the
 * same screens and server rules as the owner mobile app (OM-15): a void request is
 * approved (the sale is voided and its consumption reversed) or rejected with a
 * reason; entry reversals are approved (posting an Entry Reversal movement) or
 * rejected with a reason.
 */
function VoidReversalReview({ height, onBack }: { height: number; onBack: () => void }) {
  // The shared owner screens use Poppins, which the mobile app loads at startup.
  useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold });
  return (
    <>
      <Text style={styles.section}>Void & Reversal Review</Text>
      <Text style={styles.muted}>Sales voided by staff and entry reversal requests from the branches.</Text>
      <View style={{ height, maxWidth: 760, width: '100%', marginTop: 16, borderRadius: 13, borderWidth: 1, borderColor: C.border, overflow: 'hidden', backgroundColor: C.surface }}>
        {/* The portal has no app-wide ThemeProvider; the shared owner screens need one. */}
        <ThemeProvider>
          <OwnerRequestsScreen onBack={onBack} />
        </ThemeProvider>
      </View>
    </>
  );
}
function Toolbar({ branch, setBranch, branches }: { branch: string; setBranch: (value: string) => void; branches: OwnerPortalBranch[] }) {
  return (
    <View style={[styles.toolbar, { flexWrap: 'wrap', gap: 10 }]}>
      <Text style={styles.section}>Live overview</Text>
      <Select
        value={branch}
        options={['All Branches', ...branches.map((item) => item.name)]}
        onChange={setBranch}
      />
    </View>
  );
}

function Dashboard({ rows, inventoryAvailable, branches, branch, setBranch, onOpenReconciliation }: {
  rows: InventoryRow[];
  inventoryAvailable: boolean;
  branches: OwnerPortalBranch[];
  branch: string;
  setBranch: (value: string) => void;
  /** OW-02 c8: the discrepancies section links to Reconciliation. */
  onOpenReconciliation: () => void;
}) {
  const narrow = useWindowDimensions().width < 720;
  const [period, setPeriod] = useState<ReportingPeriod>('This Month');
  const [startDate, setStartDate] = useState(() => manilaDateKey());
  const [endDate, setEndDate] = useState(() => manilaDateKey());
  const [sales, setSales] = useState<Awaited<ReturnType<typeof loadOwnerSalesData>> | null>(null);
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof loadOwnerActivityData>> | null>(null);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof loadOwnerDiscrepancyReviews>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [alertCategory, setAlertCategory] = useState<DashboardAlertType | 'All'>('All');
  const range = useMemo(
    () => getManilaReportingRange(period, new Date(), startDate, endDate),
    [period, startDate, endDate],
  );
  const branchId = branches.find((item) => item.name === branch)?.id ?? null;

  useEffect(() => {
    let active = true;
    if (!range) {
      setSales(null);
      setActivity(null);
      setReviews(null);
      setError('Enter a valid inclusive date range in YYYY-MM-DD format.');
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    setError('');
    setSales(null);
    setActivity(null);
    setReviews(null);
    Promise.allSettled([
      loadOwnerSalesData({ start: range.start, end: range.end, branchId }),
      loadOwnerActivityData({ start: range.start, end: range.end, branchId }),
      loadOwnerDiscrepancyReviews(branchId),
    ]).then(([salesResult, activityResult, reviewsResult]) => {
      if (!active) return;
      const failures = [salesResult, activityResult, reviewsResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      setError(failures.length ? ownerPortalErrorText(failures[0].reason, 'Some dashboard figures could not be loaded. Please try again.') : '');
      if (salesResult.status === 'fulfilled') setSales(salesResult.value);
      if (activityResult.status === 'fulfilled') setActivity(activityResult.value);
      if (reviewsResult.status === 'fulfilled') setReviews(reviewsResult.value);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [range, branchId, retryKey]);

  const confirmedSales = sales ? filterOwnerPortalConfirmedSales(sales.sales) : null;
  const branchSales = confirmedSales ? summarizeOwnerPortalSalesByBranch(confirmedSales, branches) : [];
  const selectedRows = filterOwnerPortalInventory(rows, branch);
  const pendingReviews = reviews?.filter((review) => review.status === 'Pending') ?? null;
  const branchNameById = new Map(branches.map((item) => [item.id, item.name]));
  const dateFormatter = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const saleRows = (confirmedSales ?? []).slice(0, 5).map((sale) => [
    sale.transaction_reference,
    branchNameById.get(sale.branch_id) ?? 'Branch unavailable',
    dateFormatter.format(new Date(sale.created_at)),
    peso(Number(sale.total_amount)),
  ]);
  const recentMovements = (activity?.transactions ?? []).slice(0, 5);
  const movementRows = recentMovements.map((item) => [
    item.reference,
    item.type,
    branchNameById.get(item.branch_id) ?? item.branch_id,
    item.actor_name,
    dateFormatter.format(new Date(item.transaction_date)),
  ]);
  const visibleReviews = pendingReviews?.slice(0, 5) ?? [];
  // OW-02 c5, c6: status counts per branch and the alerts list, for the selected branch.
  const shownBranches = branchId ? branches.filter((item) => item.id === branchId) : branches;
  const stockCounts = dashboardStockCounts(rows, shownBranches);
  const alerts = dashboardAlerts(selectedRows);
  // Team feedback (owner 6): Low Stock, Out of Stock, Near Expiration and Expired are counted and listed separately.
  const alertCounts = dashboardAlertCounts(alerts);
  const categoryAlerts = filterDashboardAlerts(alerts, alertCategory);
  const shownAlerts = showAllAlerts ? categoryAlerts : categoryAlerts.slice(0, 10);
  const ALERT_NOTES: Record<DashboardAlertType, string> = {
    'Low Stock': 'At or below the minimum level',
    'Out of Stock': 'Expected quantity is zero',
    'Near Expiration': 'Lots expiring soon',
    Expired: 'Lots past their expiration date',
  };

  return (
    <>
      <View style={styles.toolbar}>
        <Text style={styles.section}>Live overview</Text>
        <Select value={branch} options={['All Branches', ...branches.map((item) => item.name)]} onChange={setBranch} />
        <Select value={period} options={['Today', 'This Week', 'This Month', 'Custom']} onChange={(value) => setPeriod(value as ReportingPeriod)} />
      </View>
      {period === 'Custom' ? (
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          <TextInput value={startDate} onChangeText={setStartDate} placeholder="Start date (YYYY-MM-DD)" style={[styles.search, narrow && { width: '100%' }]} />
          <TextInput value={endDate} onChangeText={setEndDate} placeholder="End date (YYYY-MM-DD)" style={[styles.search, narrow && { width: '100%' }]} />
        </View>
      ) : null}
      {error ? <ReportErrorBanner message={error} onRetry={() => setRetryKey((key) => key + 1)} /> : null}
      {loading ? <View style={styles.loadingRow}><ActivityIndicator color={C.pink} /><Text style={styles.muted}>Loading dashboard data…</Text></View> : null}
      <View style={styles.grid}>
        {[
          ['Recorded Sales', confirmedSales ? peso(totalOwnerPortalSales(confirmedSales)) : '—', 'Confirmed sales in selected period'],
          ['Inventory Items', inventoryAvailable ? String(selectedRows.length) : '—', 'Current branch inventory'],
        ].map(([label, value, note]) => (
          <View style={styles.metric} key={label}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={styles.metricValue}>{value}</Text>
            <Text style={styles.muted}>{note}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.grid, { marginTop: 0 }]}>
        {DASHBOARD_ALERT_CATEGORIES.map((category) => (
          <Pressable
            key={category}
            accessibilityRole="button"
            accessibilityLabel={`${category} alerts: ${inventoryAvailable ? alertCounts[category] : 'unavailable'}. Show them in the alerts list`}
            onPress={() => { setAlertCategory(category); setShowAllAlerts(false); }}
            style={[styles.metric, alertCategory === category && { borderColor: C.pink }]}
          >
            <Text style={styles.metricLabel}>{category}</Text>
            <Text style={styles.metricValue}>{inventoryAvailable ? String(alertCounts[category]) : '—'}</Text>
            <Text style={styles.muted}>{ALERT_NOTES[category]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.two}>
        <Panel title="Sales by branch">
          {branchSales.length ? <Table headers={['Branch', 'Transactions', 'Total Sales']} rows={branchSales.map((item) => [item.name, String(item.salesCount), peso(item.totalSales)])} /> : (
            <Text style={styles.empty}>{sales ? 'No confirmed sales exist for this period.' : 'Sales data is unavailable.'}</Text>
          )}
        </Panel>
        <Panel title="Discrepancies requiring review">
          {pendingReviews === null ? <Text style={styles.muted}>{loading ? 'Loading pending reviews…' : 'Review data is unavailable.'}</Text> : visibleReviews.length ? visibleReviews.map((review) => (
            <Pressable key={review.countLineId} accessibilityRole="link" accessibilityLabel={`Review ${review.ingredient} at ${review.branch} in Reconciliation`} onPress={onOpenReconciliation} style={styles.line}>
              <Text style={styles.body}>{review.reference} · {review.ingredient} · {review.branch}</Text>
              <Text style={styles.strong}>{review.difference} {review.unit} ›</Text>
            </Pressable>
          )) : <Text style={styles.empty}>No pending discrepancies require review.</Text>}
          {pendingReviews && pendingReviews.length ? (
            <Pressable accessibilityRole="link" onPress={onOpenReconciliation} style={[styles.outline, { alignSelf: 'flex-start' }]}>
              <Text style={styles.outlineText}>Open Reconciliation{pendingReviews.length > visibleReviews.length ? ` (${pendingReviews.length} pending)` : ''} →</Text>
            </Pressable>
          ) : null}
        </Panel>
      </View>
      <View style={styles.two}>
        <Panel title="Recent confirmed sales">
          {confirmedSales === null ? <Text style={styles.muted}>{loading ? 'Loading sales…' : 'Sales data is unavailable.'}</Text> : saleRows.length ? (
            <Table headers={['Reference', 'Branch', 'Timestamp (Manila)', 'Total']} rows={saleRows} />
          ) : <Text style={styles.empty}>No confirmed sales exist for this period.</Text>}
        </Panel>
        <Panel title="Recent inventory activity">
          {activity === null ? <Text style={styles.muted}>{loading ? 'Loading activity…' : 'Inventory activity is unavailable.'}</Text> : movementRows.length ? (
            <Table headers={['Reference', 'Movement', 'Branch', 'Employee', 'Timestamp (Manila)']} rows={movementRows} />
          ) : <Text style={styles.empty}>No inventory activity exists for this period.</Text>}
        </Panel>
      </View>
      <View style={styles.two}>
        <Panel title="Inventory status">
          {!inventoryAvailable ? <Text style={styles.muted}>Inventory data is unavailable.</Text> : stockCounts.length ? (
            <Table headers={['Branch', 'Normal', 'Low stock', 'Out of stock']} rows={stockCounts.map((item) => [item.branch, String(item.normal), String(item.low), String(item.out)])} />
          ) : <Text style={styles.empty}>No branch records returned.</Text>}
        </Panel>
        <Panel title="Stock and expiration alerts">
          {!inventoryAvailable ? <Text style={styles.muted}>Inventory data is unavailable.</Text> : (
            <>
              <View style={[styles.row, { flexWrap: 'wrap', gap: 8 }]}>
                {(['All', ...DASHBOARD_ALERT_CATEGORIES] as const).map((category) => {
                  const selected = alertCategory === category;
                  const count = category === 'All' ? alerts.length : alertCounts[category];
                  return (
                    <Pressable key={category} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={`${category} alerts, ${count}`} onPress={() => { setAlertCategory(category); setShowAllAlerts(false); }} style={[styles.outline, { marginTop: 0 }, selected && { backgroundColor: C.pink, borderColor: C.pink }]}>
                      <Text style={[styles.outlineText, selected && { color: '#FFFFFF' }]}>{category} · {count}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {categoryAlerts.length ? (
                <>
                  <Table headers={['Ingredient', 'Branch', 'Alert', 'Details']} rows={shownAlerts.map((alert) => [alert.ingredient, alert.branch, alert.type, alert.detail])} />
                  {categoryAlerts.length > 10 ? (
                    <Pressable accessibilityRole="button" onPress={() => setShowAllAlerts((value) => !value)} style={[styles.outline, { alignSelf: 'flex-start' }]}>
                      <Text style={styles.outlineText}>{showAllAlerts ? 'Show fewer' : `Show all ${categoryAlerts.length} alerts`}</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : <Text style={styles.empty}>{alertCategory === 'All' ? 'No stock or expiration alerts.' : `No ${alertCategory} alerts.`}</Text>}
            </>
          )}
        </Panel>
      </View>
    </>
  );
}

/**
 * OW-03 Multi-Branch Sales Monitoring: the sales of the applied period and
 * branch, read-only. Voided sales are listed but never counted.
 */
function SalesMonitoring({ branches }: { branches: OwnerPortalBranch[] }) {
  const narrow = useWindowDimensions().width < 720;
  // OW-03 c1: the filters apply on "Apply"; the default is the current reporting period.
  const DEFAULT_FILTER = { period: 'This Month' as ReportingPeriod, startDate: manilaDateKey(), endDate: manilaDateKey(), branch: 'All Branches' };
  const [draft, setDraft] = useState(DEFAULT_FILTER);
  const [applied, setApplied] = useState(DEFAULT_FILTER);
  const [retryKey, setRetryKey] = useState(0);
  const [sales, setSales] = useState<Awaited<ReturnType<typeof loadOwnerSalesData>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const range = useMemo(
    () => getManilaReportingRange(applied.period, new Date(), applied.startDate, applied.endDate),
    [applied],
  );
  const draftRange = getManilaReportingRange(draft.period, new Date(), draft.startDate, draft.endDate);
  const branchId = branches.find((item) => item.name === applied.branch)?.id ?? null;

  useEffect(() => {
    let active = true;
    if (!range) return () => { active = false; };
    setLoading(true);
    setError('');
    setSelectedSaleId(null);
    loadOwnerSalesData({ start: range.start, end: range.end, branchId, includeVoided: true })
      .then((result) => { if (active) setSales(result); })
      .catch((reason: unknown) => { if (active) { setSales(null); setError(ownerPortalErrorText(reason, 'The sales could not be loaded. Please try again.')); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range, branchId, retryKey]);

  const branchNames = new Map(branches.map((item) => [item.id, item.name]));
  const shownBranches = branchId ? branches.filter((item) => item.id === branchId) : branches;
  const dateFormatter = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  const branchReport = sales ? buildWebBranchSalesReport(sales.sales, shownBranches) : null;
  const productsReport = sales ? buildWebProductsSoldReport(sales.sales, sales.items, sales.addons ?? []) : null;
  const transactions = sales
    ? buildWebTransactionSummaryReport({
      sales: sales.sales,
      items: sales.items,
      branchName: (id) => branchNames.get(id) ?? 'Branch unavailable',
      formatDateTime: (iso) => dateFormatter.format(new Date(iso)),
    })
    : null;
  const selectedIndex = transactions && selectedSaleId ? transactions.saleIds.indexOf(selectedSaleId) : -1;
  const selectedSale = sales && selectedSaleId ? sales.sales.find((sale) => sale.id === selectedSaleId) ?? null : null;
  const detail = sales && selectedSaleId ? buildSaleDetailRows(selectedSaleId, sales.items, sales.addons ?? []) : null;

  return (
    <>
      <View style={[styles.toolbar, { flexWrap: 'wrap' }]}>
        <Text style={styles.section}>Sales across branches</Text>
        <Select value={draft.period} options={['Today', 'This Week', 'This Month', 'Custom']} onChange={(value) => setDraft((current) => ({ ...current, period: value as ReportingPeriod }))} />
        <Select value={draft.branch} options={['All Branches', ...branches.map((item) => item.name)]} onChange={(value) => setDraft((current) => ({ ...current, branch: value }))} />
        <Pressable accessibilityRole="button" disabled={!draftRange || loading} onPress={() => { setApplied(draft); setRetryKey((key) => key + 1); }} style={[styles.loginButton, { marginTop: 0, paddingHorizontal: 18 }, (!draftRange || loading) && { opacity: 0.5 }]}>
          <Text style={styles.loginButtonText}>Apply</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => { setDraft(DEFAULT_FILTER); setApplied(DEFAULT_FILTER); setRetryKey((key) => key + 1); }} style={[styles.outline, { marginTop: 0 }]}>
          <Text style={styles.outlineText}>Reset</Text>
        </Pressable>
      </View>
      {draft.period === 'Custom' ? (
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          <TextInput value={draft.startDate} onChangeText={(value) => setDraft((current) => ({ ...current, startDate: value }))} placeholder="Start date (YYYY-MM-DD)" style={[styles.search, narrow && { width: '100%' }]} />
          <TextInput value={draft.endDate} onChangeText={(value) => setDraft((current) => ({ ...current, endDate: value }))} placeholder="End date (YYYY-MM-DD)" style={[styles.search, narrow && { width: '100%' }]} />
        </View>
      ) : null}
      {!draftRange ? <Text style={styles.errorText}>Enter a valid date range (YYYY-MM-DD, start not after end).</Text> : null}
      <Text style={styles.muted}>
        Showing {range ? formatReportPeriod(applied.period, range) : '—'} · {applied.branch} · Read-only. Voided sales are listed but never counted.
      </Text>
      {error ? <ReportErrorBanner message={error} onRetry={() => setRetryKey((key) => key + 1)} /> : null}
      {loading ? <SectionLoading label="Loading sales…" /> : null}
      {!loading && sales && transactions ? (transactions.rows.length === 0 ? (
        // OW-03 c9: a period without sales.
        <Text style={styles.empty}>No sales were recorded for this period and branch. Choose another period, or select Reset.</Text>
      ) : (
        <>
          <View style={styles.grid}>
            {[
              ['Combined Sales', peso(branchReport?.total ?? 0), `${transactions.completed} completed transactions`],
              ['Voided Transactions', String(transactions.voided), 'Listed, not counted'],
              ['Items Sold', String(productsReport?.quantity ?? 0), 'Voided sales excluded'],
            ].map(([label, value, note]) => (
              <View style={styles.metric} key={label}>
                <Text style={styles.metricLabel}>{label}</Text>
                <Text style={styles.metricValue}>{value}</Text>
                <Text style={styles.muted}>{note}</Text>
              </View>
            ))}
          </View>
          <View style={styles.two}>
            <Panel title="Sales per branch">
              <Table headers={BRANCH_SALES_HEADERS} rows={branchReport?.rows ?? []} />
            </Panel>
            <Panel title="Product sales summary">
              {productsReport?.productRows.length ? <Table headers={PRODUCTS_SOLD_HEADERS} rows={productsReport.productRows} /> : <Text style={styles.empty}>No products were sold.</Text>}
              {productsReport?.addonRows.length ? <Table headers={ADDONS_SOLD_HEADERS} rows={productsReport.addonRows} /> : null}
            </Panel>
          </View>
          <Panel title="Transactions">
            <Text style={styles.muted}>Select a transaction to see its items.</Text>
            <Table
              headers={TRANSACTION_SUMMARY_HEADERS}
              rows={transactions.rows}
              onRowPress={(index) => setSelectedSaleId(transactions.saleIds[index])}
              rowLabel={(index) => `Open transaction ${transactions.rows[index][0]}`}
            />
          </Panel>
          {selectedSale && detail && selectedIndex >= 0 ? (
            <Panel title={`Transaction ${selectedSale.transaction_reference}`}>
              <Text style={styles.body}>
                {transactions.rows[selectedIndex][1]} · {transactions.rows[selectedIndex][2]} · {transactions.rows[selectedIndex][3]} · {transactions.rows[selectedIndex][6]}
                {transactions.rows[selectedIndex][5] !== '—' ? ` · ${transactions.rows[selectedIndex][5]}` : ''}
              </Text>
              <Table headers={SALE_DETAIL_HEADERS} rows={[...detail.rows, ['Total', '', '', peso(detail.total)]]} />
              <Text style={styles.muted}>{transactions.rows[selectedIndex][4].replace('\n', ' · ')}</Text>
              <Pressable accessibilityRole="button" onPress={() => setSelectedSaleId(null)} style={[styles.outline, { alignSelf: 'flex-start' }]}><Text style={styles.outlineText}>Close details</Text></Pressable>
            </Panel>
          ) : null}
        </>
      )) : null}
    </>
  );
}

function Branches({ rows, sales, branches }: { rows: InventoryRow[]; sales: any; branches: OwnerPortalBranch[] }) {
  const confirmedSales = sales ? filterOwnerPortalConfirmedSales(sales.sales) : [];
  const branchSummaries = summarizeOwnerPortalBranches(branches, rows, confirmedSales);

  return (
    <>
      <Text style={styles.section}>Branch management</Text>
      <Text style={styles.muted}>Actual branches and inventory returned by Supabase.</Text>
      <View style={styles.grid}>
        {branchSummaries.map((branchItem) => (
          <Panel title={branchItem.name} key={branchItem.id}>
            <Text style={styles.metricValue}>{branchItem.inventoryCount}</Text>
            <Text style={styles.muted}>inventory records</Text>
            <Text style={styles.body}>{branchItem.lowStockCount} low-stock items</Text>
            <Text style={styles.body}>{branchItem.outOfStockCount} out-of-stock items</Text>
            <Text style={styles.body}>{sales ? peso(branchItem.salesTotal) : '—'} recorded sales</Text>
          </Panel>
        ))}
      </View>
      {branchSummaries.length === 0 && <Text style={styles.empty}>No branch records returned.</Text>}
    </>
  );
}

/**
 * OW-04 Multi-Branch Inventory Monitoring: a tab per branch (Branch 1 first)
 * and a Branch Comparison tab; read-only.
 */
function Inventory({ rows, branches }: { rows: InventoryRow[]; branches: OwnerPortalBranch[] }) {
  const orderedBranches = useMemo(
    () => [...branches].sort((left, right) => inventoryTabLabel(left.name).localeCompare(inventoryTabLabel(right.name), 'en', { numeric: true })),
    [branches],
  );
  const tabs = [...orderedBranches.map((branch) => branch.id), BRANCH_COMPARISON_TAB];
  const [tab, setTab] = useState<string>(orderedBranches[0]?.id ?? BRANCH_COMPARISON_TAB);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const filtered = filterInventoryRows(rows, { query, category });
  const comparing = tab === BRANCH_COMPARISON_TAB;
  const branch = orderedBranches.find((item) => item.id === tab) ?? null;
  const branchRows = branch ? branchInventoryRows(filtered, branch.id) : [];
  const comparison = comparing ? inventoryComparison(filtered, orderedBranches) : null;
  const shownCount = comparing ? comparison?.rows.length ?? 0 : branchRows.length;
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }} accessibilityRole="tablist">
        {tabs.map((id) => {
          const label = id === BRANCH_COMPARISON_TAB ? BRANCH_COMPARISON_TAB : inventoryTabLabel(orderedBranches.find((item) => item.id === id)?.name ?? '');
          const selected = tab === id;
          return (
            <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setTab(id)} style={[styles.outline, { marginTop: 0 }, selected && { backgroundColor: C.pink, borderColor: C.pink }]}>
              <Text style={[styles.outlineText, selected && { color: '#FFFFFF' }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search items…" accessibilityLabel="Search items" style={[styles.search, { marginBottom: 0 }]} />
        <Select value={category} options={inventoryCategories(rows)} onChange={setCategory} />
      </View>
      <Text style={styles.muted}>
        {branch ? `${branch.name} · ` : 'All branches side by side · '}Read-only. Expected quantities come from the inventory ledger; statuses are shown as text.
      </Text>
      {comparing && comparison ? (
        <Table headers={comparison.headers} rows={comparison.rows} />
      ) : (
        <Table headers={BRANCH_INVENTORY_HEADERS} rows={branchRows} />
      )}
      {/* OW-04 c10 / OW-31 c9 */}
      {shownCount === 0 ? <Text style={styles.empty}>{query.trim() || category !== 'All categories' ? 'No items match the search or category.' : 'No inventory items for this branch yet.'}</Text> : null}
    </>
  );
}
function Movements({ activity, branches, inventoryRows }: {
  activity: Awaited<ReturnType<typeof loadOwnerActivityData>>['transactions'];
  branches: OwnerPortalBranch[];
  inventoryRows: InventoryRow[];
}) {
  const branchNames = new Map(branches.map((item) => [item.id, item.name]));
  const itemNames = new Map(inventoryRows.map((item) => [
    `${item.branchId}:${item.ingredientId}`,
    item.name,
  ]));
  const dateFormatter = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <>
      <Text style={styles.section}>Stock movements</Text>
      <Text style={styles.muted}>Inventory transaction history from Supabase.</Text>
      <Table
        headers={['Reference', 'Movement', 'Ingredient', 'Quantity', 'Branch', 'Employee', 'Timestamp (Manila)']}
        rows={activity.map((item) => [
          item.reference,
          item.type,
          itemNames.get(`${item.branch_id}:${item.ingredient_id}`) ?? item.ingredient_id,
          `${item.quantity} ${item.unit}`,
          branchNames.get(item.branch_id) ?? item.branch_id,
          item.actor_name,
          dateFormatter.format(new Date(item.transaction_date)),
        ])}
      />
      {activity.length === 0 ? <Text style={styles.empty}>No inventory movements were returned for this period.</Text> : null}
    </>
  );
}
type ChecksProps = {
  reviews: OwnerDiscrepancyReview[];
  branches: OwnerPortalBranch[];
  notify: (message: string, isError?: boolean) => void;
  onRefresh: () => Promise<void>;
};

type ReconciliationAction = 'approved' | 'rejected' | 'validate' | 'recount';

/**
 * OW-25 Inventory Reconciliation: the Discrepancies tab (filters, table,
 * details with revision history and the owner's actions) and the Adjustment
 * History tab.
 */
function Checks({ reviews, branches, notify, onRefresh }: ChecksProps) {
  const [tab, setTab] = useState<'Discrepancies' | 'Adjustment History'>('Discrepancies');
  const [branch, setBranch] = useState('All Branches');
  const [status, setStatus] = useState<ReconciliationStatus>('All statuses');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState<ReconciliationAction | null>(null);
  const [saving, setSaving] = useState(false);
  const branchId = branches.find((item) => item.name === branch)?.id ?? null;
  const dateFormatter = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  const formatDateTime = (iso: string) => dateFormatter.format(new Date(iso));
  const shown = filterDiscrepancies(reviews, { branchId, status });
  const selected = selectedId ? reviews.find((review) => review.countLineId === selectedId) ?? null : null;

  const run = async (review: OwnerDiscrepancyReview, action: ReconciliationAction) => {
    const text = reason.trim();
    if (!text) {
      notify('Enter a reason before submitting this review.', true);
      setConfirming(null);
      return;
    }
    setSaving(true);
    let success = '';
    try {
      if (action === 'approved' || action === 'rejected') {
        await decideOwnerInventoryCountCorrection({ requestId: review.correctionRequestId, decision: action, reason: text });
        success = `Correction request ${action}.`;
      } else if (action === 'recount') {
        await rejectOwnerSubmittedInventoryCount({ countLineId: review.countLineId, reason: text });
        success = 'Count rejected. Staff will be asked for a recount; the expected quantity is unchanged.';
      } else {
        if (review.validationTarget === 'correction_request') {
          await validateOwnerInventoryCountCorrection({ requestId: review.correctionRequestId, reason: text });
        } else {
          await validateOwnerSubmittedInventoryCount({ countLineId: review.countLineId, reason: text });
        }
        success = 'Count validated. The adjustment is listed in Adjustment History.';
      }
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : 'Unable to save the review.', true);
      setSaving(false);
      setConfirming(null);
      return;
    }
    setReason('');
    setConfirming(null);
    try {
      await onRefresh();
      notify(success);
    } catch {
      notify('The review was saved, but the latest records could not be loaded. Select Reconciliation again to refresh.', true);
    } finally {
      setSaving(false);
    }
  };

  const tabs = (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }} accessibilityRole="tablist">
      {(['Discrepancies', 'Adjustment History'] as const).map((name) => (
        <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => { setTab(name); setSelectedId(null); }} style={[styles.outline, { marginTop: 0 }, tab === name && { backgroundColor: C.pink, borderColor: C.pink }]}>
          <Text style={[styles.outlineText, tab === name && { color: '#FFFFFF' }]}>{name}</Text>
        </Pressable>
      ))}
    </View>
  );

  if (tab === 'Adjustment History') {
    const rows = adjustmentHistoryRows(reviews, formatDateTime, branchId);
    return (
      <>
        {tabs}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
          <Select value={branch} options={['All Branches', ...branches.map((item) => item.name)]} onChange={setBranch} />
        </View>
        <Text style={styles.muted}>Adjustments authorized by validating a count. Read-only.</Text>
        {rows.length ? <Table headers={ADJUSTMENT_HISTORY_HEADERS} rows={rows} /> : <Text style={styles.empty}>No adjustments have been authorized{branchId ? ' for this branch' : ''}.</Text>}
      </>
    );
  }

  const actionable = selected ? isOwnerDiscrepancyActionable(selected) : false;
  const validatable = selected ? isOwnerDiscrepancyValidatable(selected) : false;
  const recountable = selected ? isOwnerDiscrepancyRecountable(selected) : false;
  const blocked = selected ? isOwnerDiscrepancyValidationBlocked(selected) : false;
  const revisions = selected ? revisionHistoryRows(selected, formatDateTime) : [];
  const confirmText: Record<ReconciliationAction, string> = {
    approved: 'Approve this correction? The revised value replaces the counted quantity.',
    rejected: 'Reject this correction? The original count stays.',
    validate: selected ? `Validate this count for ${selected.ingredient}? The difference (${selected.difference} ${selected.unit}) is added to the current balance and the count is locked.` : '',
    recount: 'Reject this count and ask staff for a recount? The expected quantity is not changed.',
  };
  const confirmLabel: Record<ReconciliationAction, string> = {
    approved: 'Approve correction', rejected: 'Reject correction', validate: 'Validate Count', recount: 'Reject Count',
  };

  return (
    <>
      {tabs}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
        <Select value={branch} options={['All Branches', ...branches.map((item) => item.name)]} onChange={(value) => { setBranch(value); setSelectedId(null); }} />
        <Select value={status} options={RECONCILIATION_STATUSES} onChange={(value) => { setStatus(value as ReconciliationStatus); setSelectedId(null); }} />
      </View>
      <Text style={styles.muted}>Select a discrepancy to see its details and review it. Validating a count authorizes the adjustment.</Text>
      {shown.length ? (
        <Table
          headers={DISCREPANCY_HEADERS}
          rows={shown.map((review) => discrepancyRow(review, formatDateTime))}
          onRowPress={(index) => { setSelectedId(shown[index].countLineId); setReason(''); setConfirming(null); }}
          rowLabel={(index) => `Open discrepancy ${shown[index].reference} ${shown[index].ingredient}`}
        />
      ) : <Text style={styles.empty}>No discrepancies match this branch and status.</Text>}
      {selected ? (
        <Panel title={`${selected.ingredient} · ${selected.reference}`}>
          <Text style={styles.body}>
            {selected.branch} · submitted by {selected.staff} · {formatDateTime(selected.submittedAt)} · {reconciliationStatus(selected)}
          </Text>
          <Text style={styles.body}>
            Expected (saved with the count) {selected.expected} {selected.unit} · Actual {selected.correctionStatus === 'approved' ? `${selected.correctedActual} ${selected.unit} (corrected from ${selected.actual})` : `${selected.actual} ${selected.unit}`} · Difference {selected.difference} {selected.unit}
          </Text>
          <Text style={styles.strong}>Staff remarks</Text>
          <Text style={styles.body}>{selected.remarks.trim() || 'No remarks.'}</Text>
          <Text style={styles.strong}>Count revision history</Text>
          {revisions.length ? <Table headers={REVISION_HEADERS} rows={revisions} /> : <Text style={styles.muted}>No revisions. The count is as submitted.</Text>}
          {selected.rejection ? <Text style={styles.body}>Rejected for recount by {selected.rejection.rejectedBy} · {formatDateTime(selected.rejection.rejectedAt)} · “{selected.rejection.reason}”</Text> : null}
          {selected.adjustment ? <Text style={styles.body}>Adjusted {selected.adjustment.beforeQuantity} → {selected.adjustment.afterQuantity} {selected.unit} by {selected.adjustment.approvingOwner || selected.adjustment.approvedBy} · {formatDateTime(selected.adjustment.approvedAt)} · Locked</Text> : null}
          {actionable || validatable || recountable || blocked ? (
            <>
              <TextInput
                accessibilityLabel={`Review reason for ${selected.ingredient}`}
                value={reason}
                onChangeText={setReason}
                placeholder="Reason required for this action"
                maxLength={1000}
                style={styles.search}
              />
              {confirming ? (
                <View style={[reviewStyles.card, { marginTop: 8 }]} accessibilityRole="alert">
                  <Text style={styles.body}>{confirmText[confirming]}</Text>
                  <View style={reviewStyles.actions}>
                    <Pressable accessibilityRole="button" disabled={saving} onPress={() => setConfirming(null)} style={reviewStyles.cancel}><Text style={reviewStyles.cancelText}>Cancel</Text></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Confirm ${confirmLabel[confirming]}`} disabled={saving} onPress={() => void run(selected, confirming)} style={reviewStyles.approve}>
                      <Text style={reviewStyles.approveText}>{saving ? 'Saving…' : confirmLabel[confirming]}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={reviewStyles.actions}>
                  {actionable ? (
                    <>
                      <Pressable accessibilityRole="button" disabled={saving} onPress={() => setConfirming('approved')} style={reviewStyles.approve}><Text style={reviewStyles.approveText}>Approve correction</Text></Pressable>
                      <Pressable accessibilityRole="button" disabled={saving} onPress={() => setConfirming('rejected')} style={reviewStyles.reject}><Text style={reviewStyles.rejectText}>Reject correction</Text></Pressable>
                    </>
                  ) : null}
                  {validatable ? (
                    <Pressable accessibilityRole="button" disabled={saving} onPress={() => setConfirming('validate')} style={reviewStyles.approve}><Text style={reviewStyles.approveText}>Validate Count</Text></Pressable>
                  ) : blocked ? (
                    // OW-25 c8: shown but disabled while the correction request is pending.
                    <Pressable accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityHint={VALIDATION_BLOCKED_MESSAGE} disabled style={[reviewStyles.approve, { opacity: 0.45 }]}><Text style={reviewStyles.approveText}>Validate Count</Text></Pressable>
                  ) : null}
                  {recountable ? (
                    <Pressable accessibilityRole="button" disabled={saving} onPress={() => setConfirming('recount')} style={reviewStyles.reject}><Text style={reviewStyles.rejectText}>Reject Count</Text></Pressable>
                  ) : null}
                </View>
              )}
              {blocked ? <Text style={[styles.muted, { marginTop: 6 }]}>{VALIDATION_BLOCKED_MESSAGE}</Text> : null}
            </>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => setSelectedId(null)} style={[styles.outline, { alignSelf: 'flex-start' }]}><Text style={styles.outlineText}>Close details</Text></Pressable>
        </Panel>
      ) : null}
    </>
  );
}
function Reports({ sales: initialSales }: { sales?: Awaited<ReturnType<typeof loadOwnerSalesData>> | null }) {
  const narrow = useWindowDimensions().width < 720;
  const reportOptions = [
    'Total Sales Report',
    'Branch Sales Report',
    'Products Sold Report',
    'Transaction Summary Report',
    'Void Report',
    'Daily Closing Report',
  ];
  // OW-05 c3: no report type is chosen until the owner picks one.
  const [report, setReport] = useState<string | null>(null);
  const [period, setPeriod] = useState<ReportingPeriod>('This Month');
  const [startDate, setStartDate] = useState(() => manilaDateKey());
  const [endDate, setEndDate] = useState(() => manilaDateKey());
  const [branch, setBranch] = useState('All Branches');
  const [branches, setBranches] = useState<OwnerPortalBranch[]>([]);
  const [sales, setSales] = useState<Awaited<ReturnType<typeof loadOwnerSalesData>> | null>(initialSales ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const range = useMemo(
    () => getManilaReportingRange(period, new Date(), startDate, endDate),
    [period, startDate, endDate],
  );
  const branchId = branches.find((item) => item.name === branch)?.id ?? null;
  // OW-06–OW-10 c1: the selections apply when the owner selects Generate Report.
  const [generated, setGenerated] = useState<{ report: string; range: { start: Date; end: Date }; branchId: string | null; branchName: string; periodLabel: string; key: number } | null>(null);
  const [voids, setVoids] = useState<OwnerSaleVoidReview[] | null>(null);
  const [closings, setClosings] = useState<Awaited<ReturnType<typeof loadOwnerDailyClosings>> | null>(null);
  const setupMessage = reportSetupMessage({ report, period, startDate, endDate });
  const canGenerate = !setupMessage && Boolean(range) && !loading;
  const generate = () => {
    if (!canGenerate || !report || !range) return;
    setError('');
    setGenerated({ report, range, branchId, branchName: branch, periodLabel: period, key: Date.now() });
  };
  // OW-05 c9: Retry runs the same report again; the setup stays as selected.
  const retry = () => setGenerated((current) => current && { ...current, key: Date.now() });

  useEffect(() => {
    let active = true;
    loadBranches().then((records) => {
      if (active) setBranches(records);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Unable to load branches.');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!generated) return () => { active = false; };
    setLoading(true);
    setError('');
    setSales(null);
    setVoids(null);
    setClosings(null);
    const request = generated.report === 'Void Report'
      ? loadOwnerSaleVoidReviews().then((result) => { if (active) setVoids(result.requests); })
      : generated.report === 'Daily Closing Report'
        // OW-11: closings of the period's business days (Manila dates).
        ? loadOwnerDailyClosings({
          startDate: manilaDateKey(generated.range.start),
          endDate: manilaDateKey(new Date(generated.range.end.getTime() - 1)),
        }).then((result) => { if (active) setClosings(result); })
        : loadOwnerSalesData({ start: generated.range.start, end: generated.range.end, branchId: generated.branchId, includeVoided: true })
        .then((result) => { if (active) setSales(result); });
    request
      .catch((reason: unknown) => {
        if (active) setError(reportLoadError(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [generated]);

  // Voided sales are loaded for the transaction list (OW-09 c6); every total counts completed sales only.
  const records = sales ? filterOwnerPortalConfirmedSales(sales.sales) : [];
  const total = totalOwnerPortalSales(records);
  const visibleBranches = generated?.branchId ? branches.filter((item) => item.id === generated.branchId) : branches;
  const branchNames = new Map(branches.map((item) => [item.id, item.name]));
  const dateFormatter = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const branchReport = sales ? buildWebBranchSalesReport(sales.sales, visibleBranches) : null;
  const productsReport = sales ? buildWebProductsSoldReport(sales.sales, sales.items, sales.addons ?? []) : null;
  const transactionReport = sales
    ? buildWebTransactionSummaryReport({
      sales: sales.sales,
      items: sales.items,
      branchName: (id) => branchNames.get(id) ?? 'Branch unavailable',
      formatDateTime: (iso) => dateFormatter.format(new Date(iso)),
    })
    : null;
  // OW-10: the sales voided in the period.
  const voidReport = voids && generated ? buildWebVoidReport(voids, { ...generated.range, branchId: generated.branchId }) : null;
  const voidRows = (voidReport?.rows ?? []).map((row) => [
    row.transactionReference,
    row.branchName,
    row.saleCreatedAt ? dateFormatter.format(new Date(row.saleCreatedAt)) : '—',
    peso(row.saleTotal),
    row.reason,
    `${row.requestedBy}\n${dateFormatter.format(new Date(row.requestedAt))}`,
    row.approvedAt ? `${row.approvedBy}\n${dateFormatter.format(new Date(row.approvedAt))}` : row.approvedBy,
  ]);
  const shownReport = generated?.report ?? null;
  // OW-05 c6–c8: one description of the report for the preview, Print and Export PDF.
  const salesSections = (): ReportSection[] => {
    const none = { notes: ['No confirmed sales exist for this period.'] };
    switch (shownReport) {
      case 'Total Sales Report':
        return [{ summary: [['Total sales', peso(total)], ['Completed sales', String(records.length)]] }, ...(records.length ? [] : [none])];
      case 'Branch Sales Report':
        // OW-07 c3, c5: every branch, even without sales, and the grand total.
        return branchReport ? [
          { summary: [['Grand total', peso(branchReport.total)], ['Transactions', String(branchReport.transactions)]] },
          { table: { headers: BRANCH_SALES_HEADERS, rows: branchReport.rows } },
          { notes: ['Voided sales are excluded from every branch total.'] },
        ] : [none];
      case 'Products Sold Report':
        if (!productsReport || !productsReport.productRows.length) return [none];
        return [
          { summary: [['Items sold', String(productsReport.quantity)], ['Sales amount', peso(productsReport.total)]] },
          { heading: 'Products by flavor and portion (highest quantity first)', table: { headers: PRODUCTS_SOLD_HEADERS, rows: productsReport.productRows } },
          productsReport.addonRows.length
            ? { heading: 'Add-ons', table: { headers: ADDONS_SOLD_HEADERS, rows: productsReport.addonRows } }
            : { heading: 'Add-ons', notes: ['No add-ons were sold in this period.'] },
          { notes: ['Quantities of voided sales are excluded.'] },
        ];
      case 'Transaction Summary Report':
        if (!transactionReport || !transactionReport.rows.length) return [none];
        return [
          { summary: [
            ['Completed transactions', String(transactionReport.completed)],
            ['Voided transactions', String(transactionReport.voided)],
            ['Total of completed sales', peso(transactionReport.total)],
          ] },
          { table: { headers: TRANSACTION_SUMMARY_HEADERS, rows: transactionReport.rows } },
          { notes: ['Voided sales are listed with the Voided status and are not added to the total.'] },
        ];
      default:
        return [];
    }
  };
  const closingReport = closings && generated && shownReport === 'Daily Closing Report'
    ? buildWebDailyClosingReport({
      closings: closings.closings,
      branches: closings.branches,
      range: generated.range,
      branchId: generated.branchId,
      formatDate: (businessDate) => formatReportDate(new Date(`${businessDate}T12:00:00+08:00`)),
      formatDateTime: (iso) => formatReportDateTime(new Date(iso)),
    })
    : null;
  const reportDoc: ReportDocument | null = !generated || loading
    ? null
    : shownReport === 'Daily Closing Report'
      ? closings && closingReport && {
        title: 'Daily Closing Report',
        period: formatReportPeriod(generated.periodLabel, generated.range),
        branch: generated.branchName,
        generatedAt: new Date(generated.key),
        sections: !closings.supported
          ? [{ notes: ['Daily closing records are not available on this server yet.'] }]
          : [
            { summary: closingReport.summary },
            closingReport.rows.length
              ? { table: { headers: DAILY_CLOSING_HEADERS, rows: closingReport.rows } }
              : { notes: ['There are no business days in this period yet.'] },
          ],
      }
    : shownReport === 'Void Report'
      ? voidReport && {
        title: 'Void Report',
        period: formatReportPeriod(generated.periodLabel, generated.range),
        branch: generated.branchName,
        generatedAt: new Date(generated.key),
        sections: [
          { summary: [['Voided sales', String(voidReport.count)], ['Total amount voided', peso(voidReport.total)]] },
          voidReport.count
            ? { table: { headers: WEB_VOID_REPORT_HEADERS, rows: voidRows } }
            : { notes: ['No sales were voided in this period.'] },
        ],
      }
      : sales && {
        title: shownReport ?? 'Sales Report',
        period: formatReportPeriod(generated.periodLabel, generated.range),
        branch: generated.branchName,
        generatedAt: new Date(generated.key),
        sections: salesSections(),
      };

  return (
    <>
      <View style={styles.row}>
        <View>
          <Text style={styles.section}>Reports</Text>
          <Text style={styles.muted}>Supabase sales in the selected Manila reporting period.</Text>
        </View>
        <ReportActions doc={reportDoc} />
      </View>
      <View style={[styles.toolbar, { flexWrap: 'wrap', gap: 10 }]}>
        <Select
          value={period}
          options={['Today', 'This Week', 'This Month', 'Custom']}
          onChange={(value) => setPeriod(value as ReportingPeriod)}
        />
        <Select
          value={branch}
          options={['All Branches', ...branches.map((item) => item.name)]}
          onChange={setBranch}
        />
        <Select value={report ?? 'Select report type'} options={reportOptions} onChange={setReport} />
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canGenerate }} onPress={generate} disabled={!canGenerate} style={[styles.loginButton, { marginTop: 0, paddingHorizontal: 22, paddingVertical: 11 }, !canGenerate && { opacity: 0.45 }]}>
          <Text style={styles.loginButtonText}>Generate Report</Text>
        </Pressable>
      </View>
      {period === 'Custom' ? (
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          <TextInput
            value={startDate}
            onChangeText={setStartDate}
            placeholder="Start date (YYYY-MM-DD)"
            style={[styles.search, narrow && { width: '100%' }]}
          />
          <TextInput
            value={endDate}
            onChangeText={setEndDate}
            placeholder="End date (YYYY-MM-DD)"
            style={[styles.search, narrow && { width: '100%' }]}
          />
        </View>
      ) : null}
      {report && setupMessage ? <Text style={[styles.errorText, { marginBottom: 12 }]} accessibilityRole="alert">{setupMessage}</Text> : null}
      {error ? <ReportErrorBanner message={error} onRetry={generated ? retry : undefined} /> : null}
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={C.pink} />
          <Text style={styles.muted}>Loading sales report…</Text>
        </View>
      ) : null}
      {!generated && !loading ? (
        <Text style={styles.muted}>Choose the report type, reporting period and branch, then select Generate Report.</Text>
      ) : null}
      {reportDoc ? <ReportPreview doc={reportDoc} /> : null}
    </>
  );
}

type InventoryReportPage = 'Expected Stock Quantity Report' | 'Total Ingredient Inventory Report' | OwnerPortalMovementReport |
  'Physical Inventory Count and Discrepancy Report' | 'Authorized Adjustment Report' | 'Void Reversal Report' | 'Entry Reversal Report';

function InventoryReports({ branch, setBranch, branches, inventoryRows, inventoryAvailable, batches }: {
  branch: string;
  setBranch: (value: string) => void;
  branches: OwnerPortalBranch[];
  inventoryRows: InventoryRow[];
  inventoryAvailable: boolean;
  batches: Array<{ batch_reference: string; expiration_date: string | null }>;
}) {
  const narrow = useWindowDimensions().width < 720;
  const reportOptions: InventoryReportPage[] = [
    'Expected Stock Quantity Report',
    'Total Ingredient Inventory Report',
    'Stock-In Report',
    'Sales Consumption Report',
    'Waste and Spillage Report',
    'Physical Inventory Count and Discrepancy Report',
    'Authorized Adjustment Report',
    // OW-12 c5: each reversal type has its own report.
    'Void Reversal Report',
    'Entry Reversal Report',
  ];
  // OW-12 c3: no report type is chosen until the owner picks one.
  const [report, setReport] = useState<InventoryReportPage | null>(null);
  const [period, setPeriod] = useState<ReportingPeriod>('This Month');
  const [startDate, setStartDate] = useState(() => manilaDateKey());
  const [endDate, setEndDate] = useState(() => manilaDateKey());
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof loadOwnerActivityData>> | null>(null);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof loadOwnerDiscrepancyReviews>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const range = useMemo(
    () => getManilaReportingRange(period, new Date(), startDate, endDate),
    [period, startDate, endDate],
  );
  const draftBranchId = branches.find((item) => item.name === branch)?.id ?? null;
  // OW-13–OW-19 c1: the selections apply when the owner selects Generate Report.
  const [generated, setGenerated] = useState<{ report: InventoryReportPage; range: { start: Date; end: Date } | null; branchId: string | null; branchName: string; periodLabel: string; key: number } | null>(null);
  // OW-12 c4: when the expected-stock snapshot shown was read.
  const inventoryAsOf = useMemo(() => new Date(), [inventoryRows]);
  const [stockIns, setStockIns] = useState<StockInRecord[] | null>(null);
  const [consumption, setConsumption] = useState<SalesConsumptionRecord[] | null>(null);
  const [countRecords, setCountRecords] = useState<PhysicalCountRecord[] | null>(null);
  const [reversedEntryIds, setReversedEntryIds] = useState<Set<string> | null>(null);
  const [reversals, setReversals] = useState<{ supported: boolean; requests: OwnerEntryReversalReview[]; entries: Map<string, ReversingEntry[]> } | null>(null);
  const usesPeriod = !isSnapshotReport(report);
  const setupMessage = reportSetupMessage({ report, period, startDate, endDate, usesPeriod });
  const canGenerate = !setupMessage && (Boolean(range) || !usesPeriod) && !loading;
  // OW-14 c9: the Total Ingredient Inventory views share one frozen snapshot.
  const [snapshot, setSnapshot] = useState<{ rows: InventoryRow[]; asOf: Date } | null>(null);
  const [inventoryView, setInventoryView] = useState<TotalInventoryView>('Detailed');
  const generate = () => {
    if (!canGenerate || !report) return;
    setError('');
    setSnapshot({ rows: filterOwnerPortalInventory(inventoryRows, branch), asOf: inventoryAsOf });
    setInventoryView('Detailed');
    setGenerated({ report, range, branchId: draftBranchId, branchName: branch, periodLabel: period, key: Date.now() });
  };
  // OW-12 c8: Retry runs the same report again; the setup stays as selected.
  const retry = () => setGenerated((current) => current && { ...current, key: Date.now() });
  const shownReport = generated?.report ?? null;
  const branchId = generated?.branchId ?? null;

  useEffect(() => {
    let active = true;
    setActivity(null);
    setReviews(null);
    setStockIns(null);
    setReversals(null);
    setConsumption(null);
    setCountRecords(null);
    setReversedEntryIds(null);
    setError('');
    if (!generated || isSnapshotReport(generated.report) || !generated.range) {
      setLoading(false);
      return () => { active = false; };
    }
    const range = generated.range;
    const branchId = generated.branchId;
    setLoading(true);
    if (generated.report === 'Physical Inventory Count and Discrepancy Report') {
      // OW-18: the same count records as the owner mobile report, with the reviews.
      Promise.all([
        loadPhysicalCountRecords(branchId ? branches.filter((item) => item.id === branchId) : branches),
        loadOwnerDiscrepancyReviews(branchId),
      ])
        .then(([records, loadedReviews]) => {
          if (!active) return;
          setCountRecords(records);
          setReviews(loadedReviews);
        })
        .catch((reason: unknown) => { if (active) setError(reportLoadError(reason)); })
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }
    if (generated.report === 'Sales Consumption Report') {
      // OW-16: consumption rows with their sale and any Void Reversal, 200 per request.
      (async () => {
        const records: SalesConsumptionRecord[] = [];
        for (let offset = 0; ; offset += 200) {
          const bundle = await loadOwnerSalesConsumptionBundle({ offset, limit: 200, start: range.start, end: range.end, branchId });
          records.push(...buildSalesConsumptionRecords(bundle));
          if (!bundle.hasMore) break;
        }
        return records;
      })()
        .then((records) => { if (active) setConsumption(records); })
        .catch((reason: unknown) => { if (active) setError(reportLoadError(reason)); })
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }
    if (generated.report === 'Entry Reversal Report') {
      // OW-20: approved reversals with the Entry Reversal entries that were posted.
      loadOwnerEntryReversalReviews()
        .then(async (result) => {
          const approved = result.requests.filter((request) => request.status === 'approved').map((request) => request.reference);
          const entries = await loadEntryReversalMovementsByRequest(approved);
          if (active) setReversals({ ...result, entries });
        })
        .catch((reason: unknown) => { if (active) setError(reportLoadError(reason)); })
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }
    if (generated.report === 'Stock-In Report') {
      // OW-15: the same Stock-In records as the owner mobile report (receipts, reversals).
      loadStockInRecords(branchId ? branches.filter((item) => item.id === branchId) : branches, batches)
        .then((records) => { if (active) setStockIns(records); })
        .catch((reason: unknown) => { if (active) setError(reportLoadError(reason)); })
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }
    Promise.allSettled([
      loadOwnerActivityData({ start: range.start, end: range.end, branchId }),
      loadOwnerDiscrepancyReviews(branchId),
      // OW-17 c5: approved reversals mark their Waste / Spillage entries.
      generated.report === 'Waste and Spillage Report' ? loadReversedEntryIds() : Promise.resolve(null),
    ]).then(([activityResult, reviewResult, reversedResult]) => {
      if (!active) return;
      if (reversedResult.status === 'fulfilled') setReversedEntryIds(reversedResult.value);
      const failures = [activityResult, reviewResult, reversedResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      setError(failures.length ? reportLoadError(failures[0].reason) : '');
      if (activityResult.status === 'fulfilled') setActivity(activityResult.value);
      if (reviewResult.status === 'fulfilled') setReviews(reviewResult.value);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
    // branches and batches are read when the owner generates the report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generated]);
  const reportRange = generated?.range ?? null;

  const branchNameById = new Map(branches.map((item) => [item.id, item.name]));
  const itemNameById = new Map(inventoryRows.map((item) => [
    `${item.branchId}:${item.ingredientId}`,
    item.name,
  ]));
  const dateFormatter = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const filteredInventory = filterOwnerPortalInventory(inventoryRows, generated?.branchName ?? branch);
  // OW-15: Stock-In rows with receipt dates, expiry, supplier, recorder and reversals.
  const stockInReport = stockIns && reportRange ? buildWebStockInReport(stockIns, reportRange) : null;
  const stockInRows = (stockInReport?.rows ?? []).map((record) => [
    record.ingredientName,
    `${formatStockInQuantity(record).replace(/^\+/, '')}${stockInEnteredQuantity(record) ? `\n(${stockInEnteredQuantity(record)})` : ''}`,
    record.branchName,
    record.datePurchased ? formatStockInDate(record.datePurchased) : '—',
    record.dateReceived ? formatStockInDate(record.dateReceived) : '—',
    record.expirationDate ? formatStockInExpirationDate(record.expirationDate) : '—',
    [record.supplierReference, record.receiptReference].filter(Boolean).join('\n') || '—',
    `${record.recordedBy}\n${formatStockInDateTime(record.recordedAt ?? record.createdAt)}`,
    record.isReversed ? 'Reversed' : 'Recorded',
  ]);
  const totalInventoryViews = useMemo(
    () => snapshot && generated?.report === 'Total Ingredient Inventory Report'
      ? buildTotalInventoryViews(snapshot.rows, { branch: generated.branchName, asOf: formatReportDateTime(snapshot.asOf) })
      : null,
    [snapshot, generated],
  );
  // OW-12 c4, c6, c7: one description of the report for the preview, Print and Export PDF.
  const table = (headers: string[], rows: string[][], empty = 'No records exist for the selected branch and reporting period.'): ReportSection =>
    rows.length ? { table: { headers, rows } } : { notes: [empty] };
  const inventorySections = (): ReportSection[] => {
    switch (shownReport) {
      case 'Total Ingredient Inventory Report':
        if (!snapshot) return [{ notes: ['Inventory data is unavailable.'] }];
        return totalInventoryViews?.[inventoryView] ?? [];
      case 'Expected Stock Quantity Report':
        return [inventoryAvailable
          ? table(['Ingredient / Supply', 'Category', 'Branch', 'Expected Quantity', 'Status', 'Expiration', 'Active Batches'],
            filteredInventory.map((item) => [item.name, item.category, item.branch, `${item.quantityLabel} ${item.unit}`, item.status, item.expiry, item.batches]))
          : { notes: ['Expected stock data is unavailable.'] }];
      case 'Stock-In Report':
        if (!stockInReport || !stockInRows.length) return [{ notes: ['No records exist for the selected branch and reporting period.'] }];
        return [
          {
            heading: `Total received per ingredient${stockInReport.rows.some((row) => row.isReversed) ? ' (reversed entries not counted)' : ''}`,
            compact: true,
            summary: stockInReport.totals.map((total): [string, string] => [
              total.ingredientName,
              `${formatStockInQuantity(total).replace(/^\+/, '')} · ${total.entries} ${total.entries === 1 ? 'entry' : 'entries'}`,
            ]),
            notes: stockInReport.totals.length ? [] : ['Every Stock-In in this period was reversed, so nothing counts as received.'],
          },
          table(['Ingredient', 'Quantity received', 'Branch', 'Date purchased', 'Date received', 'Expiration', 'Supplier / reference', 'Recorded by · date & time', 'Status'], stockInRows),
        ];
      case 'Physical Inventory Count and Discrepancy Report': {
        if (!countRecords || !reportRange) return [{ notes: ['Physical count data is unavailable.'] }];
        const report = buildWebCountReport({
          records: countRecords,
          reviews: reviews ?? [],
          range: reportRange,
          branchId,
          formatDateTime: (iso) => formatReportDateTime(new Date(iso)),
        });
        return [
          { summary: report.summary },
          table(COUNT_REPORT_HEADERS, report.rows, 'No physical counts were submitted for the selected branch and reporting period.'),
        ];
      }
      case 'Authorized Adjustment Report': {
        if (reviews === null || !reportRange) return [{ notes: ['Authorized adjustment data is unavailable.'] }];
        const report = buildWebAdjustmentReport({
          reviews,
          range: reportRange,
          branchId,
          formatDateTime: (iso) => formatReportDateTime(new Date(iso)),
        });
        return [
          { summary: report.summary },
          table(ADJUSTMENT_REPORT_HEADERS, report.rows, 'No adjustments were authorized for the selected branch and reporting period.'),
          { notes: ['Adjustment = the counted quantity minus the expected quantity saved with the count. Only adjustments the owner authorized are listed.'] },
        ];
      }
      case 'Void Reversal Report': {
        if (!activity) return [{ notes: ['Void reversal data is unavailable.'] }];
        const report = buildWebVoidReversalReport({
          movements: activity.transactions.filter((item) => !branchId || item.branch_id === branchId),
          itemName: (item) => itemNameById.get(`${item.branch_id}:${item.ingredient_id}`) ?? item.ingredient_id,
          branchName: (item) => branchNameById.get(item.branch_id) ?? 'Branch',
          formatDateTime: (iso) => formatReportDateTime(new Date(iso)),
        });
        if (!report.rows.length) return [{ notes: ['No sales were voided for the selected branch and reporting period, so there are no Void Reversal entries.'] }];
        return [
          { summary: report.summary },
          { heading: 'Total returned per ingredient', compact: true, summary: report.byIngredient },
          { table: { headers: VOID_REVERSAL_REPORT_HEADERS, rows: report.rows } },
          { notes: ['A Void Reversal entry returns the ingredients a sale had consumed. It is posted when the owner approves the void request; the sale\'s Sales Consumption entries stay in the history.'] },
        ];
      }
      case 'Entry Reversal Report': {
        if (!reversals || !reportRange) return [];
        if (!reversals.supported) return [{ notes: ['Entry reversals are not available on this server yet.'] }];
        const reversalReport = buildWebReversalReport({
          requests: reversals.requests,
          reversingEntries: reversals.entries,
          range: reportRange,
          branchId,
          formatDateTime: (iso) => formatReportDateTime(new Date(iso)),
        });
        return [
          { summary: reversalReport.summary },
          table(REVERSAL_REPORT_HEADERS, reversalReport.rows, 'No entries were reversed in this period.'),
          ...(reversalReport.rows.length ? [{ notes: ['Each original entry stays in the Inventory Audit History; the reversing Entry Reversal entry offsets it. Rejected requests are not listed.'] }] : []),
        ];
      }
      case 'Sales Consumption Report': {
        if (!consumption) return [];
        const report = buildWebSalesConsumptionReport(consumption, (iso) => formatReportDateTime(new Date(iso)));
        if (!report.rows.length) return [{ notes: ['No sales consumption was recorded for the selected branch and reporting period.'] }];
        return [
          {
            heading: `Total consumed per ingredient${report.voidedCount ? ' (voided sales not counted)' : ''}`,
            compact: true,
            summary: report.totals,
            notes: report.totals.length ? [] : ['Every sale in this period was voided, so nothing counts as consumed.'],
          },
          { table: { headers: SALES_CONSUMPTION_HEADERS, rows: report.rows } },
          { notes: ['Each row is the recipe quantity times the quantity sold. Takoyaki uses prepared batter, shown in bottles (pieces sold ÷ the configured pieces per bottle), not raw batter ingredients.'] },
        ];
      }
      case 'Waste and Spillage Report': {
        if (!activity) return [{ notes: ['Waste and spillage data is unavailable.'] }];
        const report = buildWebWasteReport({
          movements: activity.transactions.filter((item) => !branchId || item.branch_id === branchId),
          reversedIds: reversedEntryIds ?? new Set(),
          itemName: (item) => itemNameById.get(`${item.branch_id}:${item.ingredient_id}`) ?? item.ingredient_id,
          branchName: (item) => branchNameById.get(item.branch_id) ?? 'Branch',
          formatDateTime: (iso) => formatReportDateTime(new Date(iso)),
        });
        if (!report.rows.length) return [{ notes: ['No waste, spillage or spoilage was recorded for the selected branch and reporting period.'] }];
        const reversedNote = report.rows.some((row) => row[7] === 'Reversed') ? ' (reversed entries not counted)' : '';
        return [
          { heading: `Total lost per category${reversedNote}`, compact: true, summary: report.byCategory },
          { heading: `Total lost per ingredient${reversedNote}`, compact: true, summary: report.byIngredient },
          { table: { headers: WASTE_SPILLAGE_HEADERS, rows: report.rows } },
        ];
      }
      default:
        return [];
    }
  };
  const reportDoc: ReportDocument | null = !generated || loading || (error && !isSnapshotReport(generated.report))
    ? null
    : {
      // OW-14 c10: Print and Export PDF output the selected view.
      title: generated.report === 'Total Ingredient Inventory Report' ? `${generated.report} · ${inventoryView} view` : generated.report,
      period: generated.range && !isSnapshotReport(generated.report)
        ? formatReportPeriod(generated.periodLabel, generated.range)
        : 'Current snapshot (not date-filtered)',
      branch: generated.branchName,
      generatedAt: new Date(generated.key),
      figuresAsOf: isSnapshotReport(generated.report) ? snapshot?.asOf ?? inventoryAsOf : new Date(generated.key),
      sections: inventorySections(),
    };

  return (
    <>
      <View style={styles.row}>
        <View>
          <Text style={styles.section}>Inventory reports</Text>
          <Text style={styles.muted}>Live Owner inventory data; movement categories remain separate.</Text>
        </View>
        <ReportActions doc={reportDoc} />
      </View>
      <View style={[styles.toolbar, { flexWrap: 'wrap', gap: 10 }]}>
        <Select value={branch} options={['All Branches', ...branches.map((item) => item.name)]} onChange={setBranch} />
        <Select value={report ?? 'Select report type'} options={reportOptions} onChange={(value) => setReport(value as InventoryReportPage)} />
        <Select value={period} options={['Today', 'This Week', 'This Month', 'Custom']} onChange={(value) => setPeriod(value as ReportingPeriod)} />
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canGenerate }} onPress={generate} disabled={!canGenerate} style={[styles.loginButton, { marginTop: 0, paddingHorizontal: 22, paddingVertical: 11 }, !canGenerate && { opacity: 0.45 }]}>
          <Text style={styles.loginButtonText}>Generate Report</Text>
        </Pressable>
      </View>
      {!generated && !loading ? (
        <Text style={styles.muted}>Choose the report type, reporting period and branch, then select Generate Report.</Text>
      ) : null}
      {period === 'Custom' && usesPeriod ? (
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          <TextInput value={startDate} onChangeText={setStartDate} placeholder="Start date (YYYY-MM-DD)" style={[styles.search, narrow && { width: '100%' }]} />
          <TextInput value={endDate} onChangeText={setEndDate} placeholder="End date (YYYY-MM-DD)" style={[styles.search, narrow && { width: '100%' }]} />
        </View>
      ) : null}
      {report && setupMessage ? <Text style={[styles.errorText, { marginBottom: 12 }]} accessibilityRole="alert">{setupMessage}</Text> : null}
      {error ? <ReportErrorBanner message={error} onRetry={generated ? retry : undefined} /> : null}
      {loading ? <View style={styles.loadingRow}><ActivityIndicator color={C.pink} /><Text style={styles.muted}>Loading inventory report…</Text></View> : null}
      {reportDoc && shownReport === 'Total Ingredient Inventory Report' ? (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }} accessibilityRole="tablist">
          {TOTAL_INVENTORY_VIEWS.map((view) => (
            <Pressable
              key={view}
              accessibilityRole="tab"
              accessibilityState={{ selected: inventoryView === view }}
              onPress={() => setInventoryView(view)}
              style={[styles.outline, { marginTop: 0 }, inventoryView === view && { backgroundColor: C.pink, borderColor: C.pink }]}
            >
              <Text style={[styles.outlineText, inventoryView === view && { color: '#fff' }]}>{view}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {reportDoc ? <ReportPreview doc={reportDoc} /> : null}
    </>
  );
}

function StaffPage({ accounts }: any) { const [saving, setSaving] = useState<string | null>(null); const toggle = async (account: any) => { setSaving(account.id); try { await saveStaffAccount({ id: account.id, username: account.username, branchId: account.branch_id, active: !account.active }); } catch { /* the caller reloads accounts on the next session refresh */ } finally { setSaving(null); } }; return <><Text style={styles.section}>Staff accounts</Text><Text style={styles.muted}>Employee IDs are generated by Supabase and are also the initial passwords for new or explicitly reset Staff accounts.</Text><Table headers={['Employee ID', 'Name', 'Branch', 'Status', 'Created', 'Action']} rows={accounts.map((account: any) => [account.employee_id, account.full_name, account.branch_name ?? account.branch_id, account.active ? 'Active' : 'Inactive', new Date(account.created_at).toLocaleDateString(), saving === account.id ? 'Saving…' : 'Toggle status'])} /><View>{accounts.map((account: any) => <Pressable key={account.id} onPress={() => void toggle(account)} style={styles.outline}><Text style={styles.outlineText}>{account.active ? `Deactivate ${account.full_name}` : `Activate ${account.full_name}`}</Text></Pressable>)}</View></>; }
function Settings({ products, configuration, stockSettings, onSaved }: any) { const [selected, setSelected] = useState<any>(null); const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [price, setPrice] = useState('0'); const [ingredientName, setIngredientName] = useState(''); const [unit, setUnit] = useState('kg'); const [days, setDays] = useState(String(stockSettings?.nearExpirationDays ?? 7)); const [saving, setSaving] = useState(false); const saveProduct = async () => { setSaving(true); try { const variants = selected?.variants?.map((variant: any) => ({ id: variant.id, price: Number(price) })) ?? [{ variant_code: '4pcs', size_label: '4 PCS', piece_count: 4, price: Number(price) }, { variant_code: '8pcs', size_label: '8 PCS', piece_count: 8, price: Number(price) }, { variant_code: '10plus1pcs', size_label: '10+1 PCS', piece_count: 11, price: Number(price) }]; if (selected) await updateProduct(selected.id, { product_name: name, description, is_available: true, variants }); else await createProduct({ product_name: name, description, is_available: true, variants }); onSaved('Product saved through the existing catalog service.'); } catch (reason: unknown) { onSaved(reason instanceof Error ? reason.message : 'Product save failed.'); } finally { setSaving(false); } }; const saveIngredient = async () => { setSaving(true); try { if (selected?.ingredient) await updateIngredient(selected.ingredient.id, { name: ingredientName, category_id: selected.ingredient.category_id, unit }); else await createIngredient({ name: ingredientName, category_id: configuration?.categories?.[0]?.id ?? '', unit }); onSaved('Ingredient saved through Supabase.'); } catch (reason: unknown) { onSaved(reason instanceof Error ? reason.message : 'Ingredient save failed.'); } finally { setSaving(false); } }; const saveDays = async () => { setSaving(true); try { await updateNearExpirationDays(Number(days)); onSaved('Expiration alert period updated.'); } catch (reason: unknown) { onSaved(reason instanceof Error ? reason.message : 'Settings save failed.'); } finally { setSaving(false); } }; return <><Text style={styles.section}>Settings & configuration</Text><Text style={styles.muted}>Live catalog, recipe, ingredient, and threshold configuration.</Text><View style={styles.grid}><Panel title="Products & Menu"><Text style={styles.muted}>Create or edit products without changing historical sales.</Text>{products.map((product: any) => <Pressable key={product.id} onPress={() => { setSelected(product); setName(product.product_name); setDescription(product.description); setPrice(String(product.price)); }}><Text style={styles.pinkText}>{product.product_name} · {product.is_available ? 'Available' : 'Unavailable'}</Text></Pressable>)}<TextInput value={name} onChangeText={setName} placeholder="Product name" style={styles.input} /><TextInput value={description} onChangeText={setDescription} placeholder="Description" style={styles.input} /><TextInput value={price} onChangeText={setPrice} placeholder="4 PCS selling price" keyboardType="decimal-pad" style={styles.input} /><Pressable disabled={saving} onPress={() => void saveProduct()} style={styles.loginButton}><Text style={styles.loginButtonText}>{saving ? 'Saving…' : selected ? 'Save product' : 'Add product'}</Text></Pressable></Panel><Panel title="Ingredients & Recipes"><Text style={styles.muted}>{configuration?.ingredients.length ?? 0} ingredients · {configuration?.recipeIngredients.length ?? 0} recipe lines</Text><TextInput value={ingredientName} onChangeText={setIngredientName} placeholder="Ingredient or supply name" style={styles.input} /><TextInput value={unit} onChangeText={setUnit} placeholder="Unit of measurement" style={styles.input} /><Pressable disabled={saving} onPress={() => void saveIngredient()} style={styles.outline}><Text style={styles.outlineText}>{saving ? 'Saving…' : 'Add ingredient'}</Text></Pressable><Text style={styles.muted}>Recipe edits use saveProductRecipe and affect future calculations only.</Text></Panel><Panel title="Prepared Batter"><Text style={styles.body}>5 bottles per batch · 25 pieces per bottle.</Text><Text style={styles.muted}>Raw ingredients are consumed during preparation; sales consume prepared batter only.</Text></Panel><Panel title="Stock thresholds & expiration"><Text style={styles.body}>{stockSettings?.nearExpirationDays ?? '—'} day near-expiration alert period</Text><TextInput value={days} onChangeText={setDays} keyboardType="number-pad" style={styles.input} /><Pressable disabled={saving} onPress={() => void saveDays()} style={styles.outline}><Text style={styles.outlineText}>Save alert period</Text></Pressable><Text style={styles.muted}>{stockSettings?.inventory.length ?? 0} inventory thresholds loaded. Per-item minimum stock editing remains available through updateMinimumStock.</Text></Panel></View></>; }
/**
 * OW-29 Inventory Audit History: every record of the applied period as one
 * read-only list with type, branch, date range and reference filters; a record
 * opens its details and related records.
 */
function Audit({ branches, inventoryRows }: { branches: OwnerPortalBranch[]; inventoryRows: InventoryRow[] }) {
  const narrow = useWindowDimensions().width < 720;
  const DEFAULT_FILTER = { type: 'All types', branch: 'All Branches', period: 'This Month' as ReportingPeriod, startDate: manilaDateKey(), endDate: manilaDateKey(), reference: '' };
  const [draft, setDraft] = useState(DEFAULT_FILTER);
  const [applied, setApplied] = useState(DEFAULT_FILTER);
  const [retryKey, setRetryKey] = useState(0);
  const [data, setData] = useState<{
    sales: Awaited<ReturnType<typeof loadOwnerSalesData>>;
    activity: Awaited<ReturnType<typeof loadOwnerActivityData>>;
    reviews: Awaited<ReturnType<typeof loadOwnerDiscrepancyReviews>>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const range = useMemo(() => getManilaReportingRange(applied.period, new Date(), applied.startDate, applied.endDate), [applied]);
  const draftRange = getManilaReportingRange(draft.period, new Date(), draft.startDate, draft.endDate);

  useEffect(() => {
    let active = true;
    if (!range) return () => { active = false; };
    setLoading(true);
    setError('');
    setSelectedId(null);
    Promise.all([
      loadOwnerSalesData({ start: range.start, end: range.end, branchId: null, includeVoided: true }),
      loadOwnerActivityData({ start: range.start, end: range.end, branchId: null }),
      loadOwnerDiscrepancyReviews(null),
    ])
      .then(([sales, activity, reviews]) => { if (active) setData({ sales, activity, reviews }); })
      .catch((reason: unknown) => { if (active) { setData(null); setError(ownerPortalErrorText(reason, 'The audit history could not be loaded. Please try again.')); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range, retryKey]);

  const branchNames = new Map(branches.map((item) => [item.id, item.name]));
  const itemNames = new Map(inventoryRows.map((item) => [`${item.branchId}:${item.ingredientId}`, item.name]));
  const dateFormatter = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  const formatDateTime = (iso: string) => dateFormatter.format(new Date(iso));
  const records = useMemo(() => (data ? buildAuditRecords({
    sales: data.sales.sales,
    items: data.sales.items,
    movements: data.activity.transactions,
    checks: data.activity.dailyChecks,
    countLines: data.activity.countLines,
    reviews: data.reviews,
    branchName: (id) => branchNames.get(id) ?? 'Branch unavailable',
    itemName: (branchId, ingredientId) => itemNames.get(`${branchId}:${ingredientId}`) ?? ingredientId,
    formatDateTime,
  }) : []), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const branchId = branches.find((item) => item.name === applied.branch)?.id ?? null;
  const shown = filterAuditRecords(records, { type: applied.type, branchId, reference: applied.reference, range });
  const byId = new Map(records.map((record) => [record.id, record]));
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  return (
    <>
      <Text style={styles.section}>Audit history</Text>
      <Text style={styles.muted}>Every sale, inventory movement, count, revision, discrepancy and adjustment. Read-only: records cannot be edited or deleted.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <Select value={draft.type} options={[...AUDIT_RECORD_TYPES]} onChange={(value) => setDraft((current) => ({ ...current, type: value }))} />
        <Select value={draft.branch} options={['All Branches', ...branches.map((item) => item.name)]} onChange={(value) => setDraft((current) => ({ ...current, branch: value }))} />
        <Select value={draft.period} options={['Today', 'This Week', 'This Month', 'Custom']} onChange={(value) => setDraft((current) => ({ ...current, period: value as ReportingPeriod }))} />
        <TextInput value={draft.reference} onChangeText={(value) => setDraft((current) => ({ ...current, reference: value }))} onSubmitEditing={() => draftRange && setApplied(draft)} placeholder="Search reference (full or partial)" accessibilityLabel="Search reference" style={styles.search} />
        <Pressable accessibilityRole="button" disabled={!draftRange || loading} onPress={() => { setApplied(draft); setSelectedId(null); }} style={[styles.loginButton, { marginTop: 0, paddingHorizontal: 18 }, (!draftRange || loading) && { opacity: 0.5 }]}>
          <Text style={styles.loginButtonText}>Apply</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => { setDraft(DEFAULT_FILTER); setApplied(DEFAULT_FILTER); setSelectedId(null); }} style={[styles.outline, { marginTop: 0 }]}>
          <Text style={styles.outlineText}>Reset</Text>
        </Pressable>
      </View>
      {draft.period === 'Custom' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <TextInput value={draft.startDate} onChangeText={(value) => setDraft((current) => ({ ...current, startDate: value }))} placeholder="Start date (YYYY-MM-DD)" style={[styles.search, narrow && { width: '100%' }]} />
          <TextInput value={draft.endDate} onChangeText={(value) => setDraft((current) => ({ ...current, endDate: value }))} placeholder="End date (YYYY-MM-DD)" style={[styles.search, narrow && { width: '100%' }]} />
        </View>
      ) : null}
      {!draftRange ? <Text style={styles.errorText}>Enter a valid date range (YYYY-MM-DD, start not after end).</Text> : null}
      <Text style={styles.muted}>
        Showing {range ? formatReportPeriod(applied.period, range) : '—'} · {applied.branch} · {applied.type}{applied.reference.trim() ? ` · reference contains “${applied.reference.trim()}”` : ''} · {shown.length} record{shown.length === 1 ? '' : 's'}
      </Text>
      {error ? <ReportErrorBanner message={error} onRetry={() => setRetryKey((key) => key + 1)} /> : null}
      {loading ? <SectionLoading label="Loading audit history…" /> : null}
      {!loading && data ? (shown.length ? (
        <Table
          headers={AUDIT_HEADERS}
          rows={shown.map((record) => auditRow(record, formatDateTime))}
          onRowPress={(index) => setSelectedId(shown[index].id)}
          rowLabel={(index) => `Open ${shown[index].type} ${shown[index].reference}`}
        />
      ) : <Text style={styles.empty}>No records match these filters. Check the reference, or select Reset.</Text>) : null}
      {selected ? (
        <Panel title={`${selected.type} · ${selected.reference}`}>
          <Text style={styles.body}>{selected.branch} · {selected.item} · {selected.quantity} · {selected.employee} · {formatDateTime(selected.at)}</Text>
          <Table headers={['Detail', 'Value']} rows={selected.details} />
          <Text style={styles.strong}>Related records</Text>
          {selected.related.length ? selected.related.map((id) => {
            const record = byId.get(id);
            return record ? (
              <Pressable key={id} accessibilityRole="link" onPress={() => setSelectedId(id)} style={styles.line}>
                <Text style={styles.body}>{record.type} · {record.reference} · {record.item} · {record.quantity}</Text>
                <Text style={styles.pinkText}>Open ›</Text>
              </Pressable>
            ) : null;
          }) : <Text style={styles.muted}>No related records.</Text>}
          <Pressable accessibilityRole="button" onPress={() => setSelectedId(null)} style={[styles.outline, { alignSelf: 'flex-start' }]}><Text style={styles.outlineText}>Close details</Text></Pressable>
        </Panel>
      ) : null}
    </>
  );
}
/** OW-05 c9 / OW-12 c8: a clear message for a report that could not be generated. */
function isSnapshotReport(report: string | null | undefined): boolean {
  return report === 'Expected Stock Quantity Report' || report === 'Total Ingredient Inventory Report';
}
// OW-12 c8 / OW-31 c4, c10: a plain message; technical details are never shown.
function reportLoadError(reason: unknown): string {
  if (isOwnerConnectionFailure(reason)) return 'The report could not be generated. Check your internet connection, then select Retry.';
  const plain = ownerPortalErrorText(reason, '');
  return plain ? `The report could not be generated: ${plain} Select Retry to try again.` : 'The report could not be generated. Select Retry to try again.';
}
/** OW-02 c9 / OW-31 c2: a section that could not load, with Retry. */
function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={[styles.panel, { alignItems: 'flex-start', gap: 10 }]} accessibilityRole="alert">
      <Text style={styles.section}>This section could not be loaded</Text>
      <Text style={styles.body}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.outline, { marginTop: 0 }]}><Text style={styles.outlineText}>Retry</Text></Pressable>
    </View>
  );
}
/** OW-31 c8: a section whose data is loading. */
function SectionLoading({ label }: { label: string }) {
  return <View style={styles.loadingRow} accessibilityRole="progressbar"><ActivityIndicator color={C.pink} /><Text style={styles.muted}>{label}</Text></View>;
}
function ReportErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[styles.errorBanner, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }]} accessibilityRole="alert">
      <Text style={[styles.errorText, { flex: 1 }]}>{message}</Text>
      {onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.outline, { marginTop: 0 }]}><Text style={styles.outlineText}>Retry</Text></Pressable> : null}
    </View>
  );
}
/** OW-05 c5–c6 / OW-12 c4: the preview of a generated report, drawn from the same description as Print and Export PDF. */
function ReportPreview({ doc }: { doc: ReportDocument }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.kicker}>REPORT PREVIEW</Text>
      <Text style={[styles.section, { marginTop: 4 }]}>{doc.title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, paddingBottom: 12, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {reportMetaLines(doc).map(([label, value]) => (
          <View key={label}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={[styles.body, { marginTop: 3 }]}>{value}</Text>
          </View>
        ))}
      </View>
      {doc.sections.map((section, index) => (
        <View key={`${section.heading ?? 'section'}-${index}`} style={{ marginBottom: 14 }}>
          {section.heading ? <Text style={styles.panelTitle}>{section.heading}</Text> : null}
          {section.summary?.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: section.compact ? 24 : 32, marginBottom: 14 }}>
              {section.summary.map(([label, value]) => (
                <View key={label}>
                  <Text style={section.compact ? styles.strong : styles.metricLabel}>{label}</Text>
                  <Text style={section.compact ? styles.body : styles.metricValue}>{value}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {(section.notes ?? []).map((note) => <Text key={note} style={styles.empty}>{note}</Text>)}
          {section.table ? <Table headers={section.table.headers} rows={section.table.rows} /> : null}
        </View>
      ))}
    </View>
  );
}
/** OW-05 c7–c8 / OW-12 c6–c7: Print opens a print-friendly view; Export PDF downloads the report. */
function ReportActions({ doc }: { doc: ReportDocument | null }) {
  const [message, setMessage] = useState('');
  const onError = (text: string) => setMessage(text);
  const disabled = !doc;
  return (
    <View style={{ alignItems: 'flex-end', gap: 6 }}>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => { setMessage(''); if (doc && !openReportPrintView(doc)) onError('The print view was blocked. Allow pop-ups for this site, then select Print again.'); }}
        style={[styles.outline, { marginTop: 0 }, disabled && { opacity: 0.45 }]}
      >
        <Text style={styles.outlineText}>Print</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          if (!doc) return;
          setMessage('');
          try {
            downloadReportPdf(doc);
          } catch (reason: unknown) {
            onError(reason instanceof Error ? `The PDF could not be created: ${reason.message}` : 'The PDF could not be created.');
          }
        }}
        style={[styles.outline, { marginTop: 0 }, disabled && { opacity: 0.45 }]}
      >
        <Text style={styles.outlineText}>Export PDF</Text>
      </Pressable>
    </View>
    {message ? <Text style={[styles.errorText, { maxWidth: 320, textAlign: 'right' }]}>{message}</Text> : null}
    </View>
  );
}
function Panel({ title, action, children }: any) { return <View style={styles.panel}><View style={styles.row}><Text style={styles.panelTitle}>{title}</Text>{action && <Pressable onPress={action}><Text style={styles.pinkText}>Refresh</Text></Pressable>}</View>{children}</View>; }
function Table({ headers, rows, onRowPress, rowLabel }: {
  headers: string[];
  rows: string[][];
  /** Makes each row a button (e.g. OW-03 c8: open a transaction's details). */
  onRowPress?: (index: number) => void;
  rowLabel?: (index: number) => string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%' }}>
      <View style={styles.table}>
        <View style={styles.tableHead}>
          {headers.map((header) => <Text style={styles.headCell} key={header}>{header}</Text>)}
        </View>
        {rows.length ? rows.map((row, index) => {
          const cells = row.map((cell, cellIndex) => (
            <Text style={[styles.cell, cellIndex === 0 && styles.strong]} key={`${cell}-${cellIndex}`}>
              {cell}
            </Text>
          ));
          return onRowPress ? (
            <Pressable accessibilityRole="button" accessibilityLabel={rowLabel?.(index)} onPress={() => onRowPress(index)} style={({ pressed }) => [styles.tableRow, pressed && { opacity: 0.7 }]} key={`${row[0]}-${index}`}>
              {cells}
            </Pressable>
          ) : <View style={styles.tableRow} key={`${row[0]}-${index}`}>{cells}</View>;
        }) : <Text style={styles.empty}>No live records returned.</Text>}
      </View>
    </ScrollView>
  );
}
function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  const disabled = options.length === 0;
  const nextIndex = (options.indexOf(value) + 1) % options.length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onChange(options[nextIndex])}
      style={[styles.select, disabled && { opacity: 0.6 }]}
    >
      <Text style={styles.body}>{value}⌄</Text>
    </Pressable>
  );
}

type OwnerPortalNotify = (message: string, isError?: boolean) => void | Promise<void>;

function StaffManager({ accounts, branches, onSaved }: {
  accounts: Awaited<ReturnType<typeof loadStaffAccounts>>;
  branches: OwnerPortalBranch[];
  onSaved: OwnerPortalNotify;
}) {
  const [username, setUsername] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [editing, setEditing] = useState<(typeof accounts)[number] | null>(null);
  const [createdAccount, setCreatedAccount] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [savingAccountId, setSavingAccountId] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  // OW-27 c10: the account whose password reset waits for the owner's confirmation.
  const [resetTarget, setResetTarget] = useState<(typeof accounts)[number] | null>(null);
  const [resetting, setResetting] = useState(false);
  const confirmReset = async () => {
    if (!resetTarget || resetting) return;
    setResetting(true);
    try {
      await resetStaffPasswordToEmployeeId(resetTarget.id);
      setResetTarget(null);
      await onSaved(`${resetTarget.full_name || resetTarget.username}'s password was reset to their Employee ID. They must change it at their next login.`);
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'Unable to reset the Staff password.', true);
    } finally {
      setResetting(false);
    }
  };
  const save = async () => {
    if (!username.trim() || !branchId) {
      await onSaved('Enter a username and choose an assigned branch.', true);
      return;
    }
    setSaving(true);
    try {
      const account = await saveStaffAccount({ id: editing?.id, username: username.trim(), branchId, active: editing?.active ?? true });
      await onSaved(editing ? 'Staff account updated securely.' : 'Staff account created securely.');
      if (!editing) setCreatedAccount(account);
      setUsername('');
      setEditing(null);
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'Staff account save failed.', true);
    } finally { setSaving(false); }
  };
  const copyEmployeeId = async () => {
    if (!createdAccount?.employee_id || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(createdAccount.employee_id);
      setCopyMessage('Copied. Share it securely with the employee.');
    } catch (reason: unknown) {
      setCopyMessage(reason instanceof Error ? reason.message : 'Unable to copy the Employee ID.');
    }
  };
  const toggleAccount = async (account: (typeof accounts)[number]) => {
    setSavingAccountId(account.id);
    try {
      await saveStaffAccount({
        id: account.id,
        username: account.username,
        branchId: account.branch_id,
        active: !account.active,
      });
      await onSaved('Staff account status updated securely.');
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'Status update failed.', true);
    } finally {
      setSavingAccountId(null);
    }
  };
  return <>
    <Text style={styles.section}>Staff accounts</Text>
    <Text style={styles.muted}>Employee IDs are generated by Supabase and are the initial passwords. Stored passwords are never displayed.</Text>
    <TextInput value={username} onChangeText={setUsername} placeholder="Employee name / username" style={styles.input} />
    <Select value={branches.find((item: any) => item.id === branchId)?.name ?? 'Choose branch'} options={branches.map((item: any) => item.name)} onChange={(value) => setBranchId(branches.find((item: any) => item.name === value)?.id ?? '')} />
    <Pressable disabled={saving} onPress={() => void save()} style={[styles.loginButton, { marginBottom: 18 }]}><Text style={styles.loginButtonText}>{saving ? 'Saving…' : editing ? 'Save staff account' : 'Create staff account'}</Text></Pressable>
    {createdAccount?.employee_id ? <Panel title="New Staff credentials"><Text style={styles.muted}>Employee ID / initial password</Text><Text style={styles.metricValue} selectable>{createdAccount.employee_id}</Text><Pressable onPress={() => void copyEmployeeId()} style={styles.outline}><Text style={styles.outlineText}>Copy Employee ID</Text></Pressable>{copyMessage ? <Text style={styles.muted}>{copyMessage}</Text> : null}</Panel> : null}
    {/* OW-27 c1, c9: status (Active / Inactive) and lock status (Locked until … / Not locked). */}
    {accounts.length === 0 ? <Text style={styles.empty}>No staff accounts yet. Create the first one above.</Text> : null}
    <Table headers={['Employee ID', 'Username', 'Name', 'Branch', 'Status', 'Lock status']} rows={accounts.map((account) => [account.employee_id, account.username, account.full_name, account.branch_name ?? account.branch_id, account.active ? 'Active' : 'Inactive', staffLockStatus(account).label])} />
    {resetTarget ? (
      <Panel title="Reset password?">
        <Text style={styles.body}>{staffPasswordResetPrompt(resetTarget)}</Text>
        <View style={styles.line}>
          <Pressable disabled={resetting} onPress={() => setResetTarget(null)} style={styles.outline}><Text style={styles.outlineText}>Cancel</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Confirm password reset" disabled={resetting} onPress={() => void confirmReset()} style={styles.loginButton}><Text style={styles.loginButtonText}>{resetting ? 'Resetting…' : 'Reset password'}</Text></Pressable>
        </View>
      </Panel>
    ) : null}
    {accounts.map((account) => <View key={account.id} style={[styles.line, { gap: 22 }]}><Text style={[styles.body, { flex: 1 }]}>{account.full_name} · {account.employee_id}</Text><Pressable disabled={savingAccountId !== null || saving} onPress={() => { setEditing(account); setUsername(account.username); setBranchId(account.branch_id); }}><Text style={styles.pinkText}>Edit account</Text></Pressable><Pressable disabled={savingAccountId !== null || saving} onPress={() => void toggleAccount(account)}><Text style={account.active ? styles.dangerText : styles.pinkText}>{savingAccountId === account.id ? 'Saving…' : account.active ? 'Deactivate' : 'Activate'}</Text></Pressable>{account.active ? <Pressable accessibilityRole="button" accessibilityLabel={`Reset password for ${account.full_name || account.username}`} disabled={savingAccountId !== null || saving || resetting} onPress={() => setResetTarget(account)}><Text style={styles.pinkText}>Reset password</Text></Pressable> : null}</View>)}
  </>;
}
function LegacySettingsEditor({ products, configuration, stockSettings, onSaved }: any) {
  const [productId, setProductId] = useState(products[0]?.id ?? ''); const [ingredientId, setIngredientId] = useState(configuration?.ingredients?.[0]?.id ?? '');
  const [recipeQty, setRecipeQty] = useState('1'); const [recipeUnit, setRecipeUnit] = useState('kg'); const [thresholdId, setThresholdId] = useState(stockSettings?.inventory?.[0]?.ingredient_id ?? ''); const [thresholdBranch, setThresholdBranch] = useState(stockSettings?.inventory?.[0]?.branch_id ?? ''); const [threshold, setThreshold] = useState('0'); const [days, setDays] = useState(String(stockSettings?.nearExpirationDays ?? 7)); const [saving, setSaving] = useState(false);
  const saveRecipe = async () => { if (!productId || !ingredientId) { onSaved('Choose a product and ingredient first.'); return; } setSaving(true); try { const existing = configuration.recipeIngredients.filter((line: any) => line.product_id === productId && line.ingredient_id !== ingredientId).map((line: any) => ({ ingredient_id: line.ingredient_id, quantity_required: Number(line.quantity_required), unit_of_measure: line.unit_of_measure })); await saveProductRecipe(productId, [...existing, { ingredient_id: ingredientId, quantity_required: Number(recipeQty), unit_of_measure: recipeUnit }]); onSaved('Recipe line saved for future sales calculations.'); } catch (reason: unknown) { onSaved(reason instanceof Error ? reason.message : 'Recipe save failed.'); } finally { setSaving(false); } };
  const saveThreshold = async () => { if (!thresholdBranch || !thresholdId) { onSaved('Choose a branch inventory record first.'); return; } setSaving(true); try { await updateMinimumStock(thresholdBranch, thresholdId, Number(threshold)); onSaved('Minimum stock threshold updated. Refreshing live inventory is required to recalculate status.'); } catch (reason: unknown) { onSaved(reason instanceof Error ? reason.message : 'Threshold save failed.'); } finally { setSaving(false); } };
  const saveDays = async () => { const parsed = Number(days); if (!Number.isInteger(parsed) || parsed < 0) { onSaved('Expiration alert period must be a non-negative whole number of days.'); return; } setSaving(true); try { await updateNearExpirationDays(parsed); onSaved('Expiration alert period updated.'); } catch (reason: unknown) { onSaved(reason instanceof Error ? reason.message : 'Expiration settings save failed.'); } finally { setSaving(false); } };
  return <><Text style={styles.section}>Settings & configuration</Text><Text style={styles.muted}>Existing authorized operations only. No purchase orders are created.</Text><View style={styles.grid}><Panel title="Product recipes"><Text style={styles.muted}>Configure one ingredient line at a time; saved lines affect future calculations only.</Text><Select value={products.find((item: any) => item.id === productId)?.product_name ?? 'Choose product'} options={products.map((item: any) => item.product_name)} onChange={(value) => setProductId(products.find((item: any) => item.product_name === value)?.id ?? '')} /><Select value={configuration?.ingredients.find((item: any) => item.id === ingredientId)?.name ?? 'Choose ingredient'} options={(configuration?.ingredients ?? []).map((item: any) => item.name)} onChange={(value) => setIngredientId(configuration.ingredients.find((item: any) => item.name === value)?.id ?? '')} /><TextInput value={recipeQty} onChangeText={setRecipeQty} keyboardType="decimal-pad" placeholder="Required quantity" style={styles.input} /><TextInput value={recipeUnit} onChangeText={setRecipeUnit} placeholder="Unit of measurement" style={styles.input} /><Pressable disabled={saving} onPress={() => void saveRecipe()} style={styles.loginButton}><Text style={styles.loginButtonText}>{saving ? 'Saving…' : 'Save recipe line'}</Text></Pressable><Text style={styles.muted}>Prepared batter remains a separate inventory item. Existing backend rules enforce 5 bottles × 25 pieces.</Text></Panel><Panel title="Minimum stock thresholds"><Text style={styles.muted}>Update the threshold for a specific branch and ingredient.</Text><Select value={thresholdBranch ? 'Selected branch inventory' : 'Choose inventory record'} options={['Choose inventory record', ...(stockSettings?.inventory ?? []).map((item: any) => `${item.branch_id} · ${item.ingredient_id}`)]} onChange={(value) => { const match = (stockSettings?.inventory ?? []).find((item: any) => `${item.branch_id} · ${item.ingredient_id}` === value); if (match) { setThresholdBranch(match.branch_id); setThresholdId(match.ingredient_id); setThreshold(String(match.minimum_stock)); } }} /><TextInput value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" placeholder="Minimum stock" style={styles.input} /><Pressable disabled={saving} onPress={() => void saveThreshold()} style={styles.outline}><Text style={styles.outlineText}>{saving ? 'Saving…' : 'Save threshold'}</Text></Pressable></Panel><Panel title="Prepared batter rules"><Text style={styles.body}>1 batch = 5 bottles = 125 pieces.</Text><Text style={styles.muted}>Raw ingredients are deducted during preparation; completed sales consume prepared batter and do not deduct raw batter ingredients again.</Text></Panel><Panel title="Expiration alerts"><Text style={styles.body}>{stockSettings?.nearExpirationDays ?? '—'} day alert period</Text><TextInput value={days} onChangeText={setDays} keyboardType="number-pad" placeholder="Alert days" style={styles.input} /><Pressable disabled={saving} onPress={() => void saveDays()} style={styles.outline}><Text style={styles.outlineText}>{saving ? 'Saving…' : 'Save alert period'}</Text></Pressable><Text style={styles.muted}>Uses the existing owner-authorized inventory settings operation. Purchase orders are never created automatically.</Text></Panel></View></>;
}

/**
 * OW-21 Products and Menu: the product table with search and Add Product, the
 * product form (flavor, portion type, prices, pieces per portion, maximum per
 * order, add-ons), the add-on prices, and the Bulk Order threshold.
 */
function OwnerProductEditor({ products, onSaved }: {
  products: ProductManagementItem[];
  onSaved: OwnerPortalNotify;
}) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null); // product id, 'new', or null
  const [name, setName] = useState('');
  const [flavor, setFlavor] = useState('');
  const [portionType, setPortionType] = useState<ProductPortionType | ''>('');
  const [description, setDescription] = useState('');
  const [available, setAvailable] = useState(true);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [pieceDrafts, setPieceDrafts] = useState<Record<string, string>>({});
  const [maxQuantityDrafts, setMaxQuantityDrafts] = useState<Record<string, string>>({});
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState<MenuAddonConfiguration | null>(null);
  const [menuError, setMenuError] = useState('');
  const [addonPriceDrafts, setAddonPriceDrafts] = useState<Record<string, string>>({});
  const [thresholdDraft, setThresholdDraft] = useState('');
  const selectedProduct = editing && editing !== 'new' ? products.find((product) => product.id === editing) ?? null : null;
  const table = productTableRows(products, query);

  const reloadMenu = () => {
    loadMenuAddonConfiguration()
      .then((result) => {
        setMenu(result);
        setMenuError('');
        setAddonPriceDrafts(Object.fromEntries(result.addons.map((addon) => [addon.id, String(addon.price)])));
        setThresholdDraft(String(result.bulkOrderThreshold));
      })
      .catch((reason: unknown) => setMenuError(ownerPortalErrorText(reason, 'The add-ons and Bulk Order threshold could not be loaded.')));
  };
  useEffect(reloadMenu, []);

  const openProduct = (id: string) => {
    const product = id === 'new' ? null : products.find((item) => item.id === id) ?? null;
    setEditing(id);
    setFormErrors([]);
    setName(product?.product_name ?? '');
    setFlavor(product?.flavor ?? '');
    setPortionType((product?.portion_type as ProductPortionType | null) ?? '');
    setDescription(product?.description ?? '');
    setAvailable(product?.is_available ?? true);
    const byCode = (pick: (variant: ProductManagementItem['variants'][number]) => string) => Object.fromEntries(standardProductVariants.map((variant) => {
      const current = product?.variants.find((item) => item.variant_code === variant.variant_code);
      return [variant.variant_code, current ? pick(current) : ''];
    }));
    setPriceDrafts(byCode((variant) => String(variant.price)));
    setPieceDrafts(product ? byCode((variant) => String(variant.piece_count)) : Object.fromEntries(standardProductVariants.map((variant) => [variant.variant_code, String(variant.piece_count)])));
    setMaxQuantityDrafts(byCode((variant) => (variant.max_order_quantity ? String(variant.max_order_quantity) : '')));
    setAddonIds(product && menu ? menu.addons.filter((addon) => addon.productIds.includes(product.id)).map((addon) => addon.id) : []);
  };

  const save = async () => {
    const errors = productFormErrors({ name, flavor, portionType, description });
    let variantPrices: ReturnType<typeof buildOwnerPortalVariantPrices> = [];
    try {
      variantPrices = buildOwnerPortalVariantPrices(priceDrafts, standardProductVariants, maxQuantityDrafts, pieceDrafts);
    } catch (reason: unknown) {
      errors.push(reason instanceof Error ? reason.message : 'Check the prices.');
    }
    setFormErrors(errors);
    if (errors.length || !portionType) return;
    setSaving(true);
    try {
      const productInput = { product_name: name, description, is_available: available, flavor, portion_type: portionType };
      let productId = selectedProduct?.id ?? '';
      if (selectedProduct) {
        const missing = standardProductVariants.find((variant) => !selectedProduct.variants.some((current) => current.variant_code === variant.variant_code));
        if (missing) throw new Error(`Cannot edit this product because its ${missing.size_label} variant is missing.`);
        const builtByCode = new Map(variantPrices.map((variant) => [variant.variant_code, variant]));
        await updateProduct(selectedProduct.id, {
          ...productInput,
          variants: selectedProduct.variants.map((variant) => {
            const built = builtByCode.get(variant.variant_code);
            return built
              ? { id: variant.id, price: built.price, piece_count: built.piece_count, max_order_quantity: built.max_order_quantity ?? null }
              : { id: variant.id, price: variant.price };
          }),
        });
      } else {
        productId = (await createProduct({ ...productInput, variants: variantPrices })).id;
      }
      if (menu) await saveProductAddons(productId, addonIds);
      setEditing(null);
      reloadMenu();
      // OW-21 c7: a confirmation; the staff menu shows the product by its availability.
      await onSaved(selectedProduct ? `${name.trim()} saved.` : `${name.trim()} added to the menu.`);
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'The product could not be saved.', true);
    } finally {
      setSaving(false);
    }
  };

  const saveAddonPrice = async (addon: MenuAddonConfiguration['addons'][number], active: boolean) => {
    try {
      await saveMenuAddon({ id: addon.id, name: addon.name, price: Number(addonPriceDrafts[addon.id] ?? addon.price), active });
      reloadMenu();
      await onSaved(`${addon.name} saved.`);
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'The add-on could not be saved.', true);
    }
  };

  const saveThreshold = async () => {
    const value = Number(thresholdDraft.trim());
    try {
      if (!/^\d+$/.test(thresholdDraft.trim())) throw new Error('The Bulk Order threshold must be a whole number from 1 to 999.');
      await updateBulkOrderThreshold(value);
      reloadMenu();
      await onSaved(`Orders of ${value} or more products are now Bulk Orders.`);
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'The Bulk Order threshold could not be saved.', true);
    }
  };

  return (
    <>
      <Panel title="Products & menu">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search products or flavors…" accessibilityLabel="Search products" style={styles.search} />
          <Pressable accessibilityRole="button" onPress={() => openProduct('new')} style={[styles.loginButton, { marginTop: 0, paddingHorizontal: 18, marginBottom: 16 }]}>
            <Text style={styles.loginButtonText}>Add Product</Text>
          </Pressable>
        </View>
        {table.rows.length ? (
          <Table headers={PRODUCT_TABLE_HEADERS} rows={table.rows} onRowPress={(index) => openProduct(table.products[index].id)} rowLabel={(index) => `Edit ${table.products[index].product_name}`} />
        ) : <Text style={styles.empty}>{query.trim() ? 'No products match the search.' : 'No products yet. Select Add Product.'}</Text>}
      </Panel>
      {editing ? (
        <Panel title={selectedProduct ? `Edit ${selectedProduct.product_name}` : 'Add Product'}>
          <Text style={styles.label}>Name</Text>
          <TextInput value={name} onChangeText={setName} placeholder="e.g. Octobits / Cheese" accessibilityLabel="Product name" style={styles.input} />
          <Text style={styles.label}>Flavor</Text>
          <TextInput value={flavor} onChangeText={setFlavor} placeholder="e.g. Octobits" accessibilityLabel="Flavor" style={styles.input} />
          <Text style={styles.label}>Portion type</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {PRODUCT_PORTION_TYPES.map((type) => (
              <Pressable key={type} accessibilityRole="radio" accessibilityState={{ checked: portionType === type }} onPress={() => setPortionType(type)} style={[styles.outline, { marginTop: 0 }, portionType === type && { backgroundColor: C.pink, borderColor: C.pink }]}>
                <Text style={[styles.outlineText, portionType === type && { color: '#FFFFFF' }]}>{type}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Description</Text>
          <TextInput value={description} onChangeText={setDescription} placeholder="Description" accessibilityLabel="Description" style={styles.input} />
          <Text style={styles.label}>Sizes: selling price, pieces per portion (batter use), maximum per order</Text>
          {standardProductVariants.map((variant) => (
            <View key={variant.variant_code} style={[styles.variantFieldRow, { alignItems: 'center', marginBottom: 6 }]}>
              <Text style={[styles.strong, { width: 70 }]}>{variant.size_label}</Text>
              <TextInput value={priceDrafts[variant.variant_code] ?? ''} onChangeText={(value) => setPriceDrafts((current) => ({ ...current, [variant.variant_code]: value }))} keyboardType="decimal-pad" placeholder="Price (₱)" accessibilityLabel={`${variant.size_label} selling price`} style={[styles.input, styles.variantFieldWide]} />
              <TextInput value={pieceDrafts[variant.variant_code] ?? ''} onChangeText={(value) => setPieceDrafts((current) => ({ ...current, [variant.variant_code]: value }))} keyboardType="number-pad" placeholder="Pieces" accessibilityLabel={`${variant.size_label} pieces per portion`} style={[styles.input, styles.variantFieldNarrow]} />
              <TextInput value={maxQuantityDrafts[variant.variant_code] ?? ''} onChangeText={(value) => setMaxQuantityDrafts((current) => ({ ...current, [variant.variant_code]: value }))} keyboardType="number-pad" placeholder="Max per order" accessibilityLabel={`${variant.size_label} maximum quantity per order, leave blank for no maximum`} style={[styles.input, styles.variantFieldNarrow]} />
            </View>
          ))}
          <Text style={styles.muted}>Pieces per portion set how much prepared batter a sale uses. Leave the maximum blank for no limit.</Text>
          <Text style={styles.label}>Optional add-ons</Text>
          {menu ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {menu.addons.filter((addon) => addon.active).map((addon) => {
                const selected = addonIds.includes(addon.id);
                return (
                  <Pressable key={addon.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => setAddonIds((current) => (selected ? current.filter((id) => id !== addon.id) : [...current, addon.id]))} style={[styles.outline, { marginTop: 0 }, selected && { backgroundColor: C.pink, borderColor: C.pink }]}>
                    <Text style={[styles.outlineText, selected && { color: '#FFFFFF' }]}>{selected ? '✓ ' : ''}{addon.name} · ₱{addon.price.toFixed(2)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : <Text style={styles.muted}>{menuError || 'Loading add-ons…'}</Text>}
          <Text style={styles.muted}>A product with no add-ons selected offers every add-on, as before.</Text>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: available }} onPress={() => setAvailable((current) => !current)} style={styles.outline}>
            <Text style={styles.outlineText}>{available ? 'Available on the staff menu' : 'Unavailable (greyed out on the staff menu)'} · select to change</Text>
          </Pressable>
          {formErrors.length ? (
            <View style={[styles.errorBanner, { marginTop: 12 }]} accessibilityRole="alert">
              {formErrors.map((message) => <Text key={message} style={styles.errorText}>{message}</Text>)}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => setEditing(null)} style={styles.outline}><Text style={styles.outlineText}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.loginButton, { paddingHorizontal: 22 }]}>
              <Text style={styles.loginButtonText}>{saving ? 'Saving…' : selectedProduct ? 'Save product' : 'Add product'}</Text>
            </Pressable>
          </View>
        </Panel>
      ) : null}
      <View style={styles.two}>
        <Panel title="Add-ons">
          {menu ? menu.addons.map((addon) => (
            <View key={addon.id} style={[styles.line, { alignItems: 'center', gap: 8 }]}>
              <Text style={[styles.body, { flex: 1 }]}>{addon.name}{addon.active ? '' : ' (off)'}</Text>
              <TextInput value={addonPriceDrafts[addon.id] ?? ''} onChangeText={(value) => setAddonPriceDrafts((current) => ({ ...current, [addon.id]: value }))} keyboardType="decimal-pad" accessibilityLabel={`${addon.name} price`} style={[styles.input, { width: 90, padding: 8 }]} />
              <Pressable accessibilityRole="button" onPress={() => void saveAddonPrice(addon, addon.active)} style={[styles.outline, { marginTop: 0 }]}><Text style={styles.outlineText}>Save</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => void saveAddonPrice(addon, !addon.active)} style={[styles.outline, { marginTop: 0 }]}><Text style={styles.outlineText}>{addon.active ? 'Turn off' : 'Turn on'}</Text></Pressable>
            </View>
          )) : <Text style={styles.muted}>{menuError || 'Loading add-ons…'}</Text>}
        </Panel>
        <Panel title="Bulk Order threshold">
          <Text style={styles.body}>An order with at least this many products is labelled Bulk Order (default 5). It never changes the price.</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <TextInput value={thresholdDraft} onChangeText={setThresholdDraft} keyboardType="number-pad" accessibilityLabel="Bulk Order threshold" style={[styles.input, { width: 90 }]} />
            <Text style={styles.body}>products or more · current {menu?.bulkOrderThreshold ?? '—'}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => void saveThreshold()} style={styles.outline}><Text style={styles.outlineText}>Save Bulk Order threshold</Text></Pressable>
        </Panel>
      </View>
    </>
  );
}

type IngredientRecipeConfiguration = Awaited<ReturnType<typeof loadIngredientRecipeConfiguration>>;

/** A failed save keeps the form and offers Retry (OW-22 c10). */
function SaveErrorWithRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={[styles.errorBanner, { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }]} accessibilityRole="alert">
      <Text style={[styles.errorText, { flex: 1 }]}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.outline, { marginTop: 0 }]}><Text style={styles.outlineText}>Retry</Text></Pressable>
    </View>
  );
}

/**
 * OW-22 c1–c3: the ingredient list (search, category filter, Add Ingredient) and
 * the form with base unit, unit of measurement and purchase unit.
 */
function IngredientConfigurationEditor({ configuration, onSaved }: {
  configuration: IngredientRecipeConfiguration | null;
  onSaved: OwnerPortalNotify;
}) {
  const ingredients = configuration?.ingredients ?? [];
  const categories = configuration?.categories ?? [];
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [form, setForm] = useState<IngredientForm | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const filterId = categories.find((category) => category.name === categoryFilter)?.id ?? null;
  const table = ingredientTableRows(ingredients, categories, configuration?.purchaseUnits ?? [], { query, categoryId: filterId });
  const open = (id: string | null) => {
    const item = id ? ingredients.find((ingredient) => ingredient.id === id) : null;
    const pack = id ? configuration?.purchaseUnits.find((unit) => unit.ingredient_id === id) : null;
    setErrors([]);
    setSaveError('');
    setForm({
      id: item?.id ?? null,
      name: item?.name ?? '',
      categoryId: item?.category_id ?? '',
      baseUnit: item ? baseUnitOf(item.unit) ?? '' : '',
      unit: item?.unit ?? '',
      purchaseLabel: pack?.package_label ?? '',
      purchaseQuantity: pack ? String(pack.package_quantity) : '',
    });
  };
  const save = async () => {
    if (!form) return;
    const found = ingredientFormErrors(form, ingredients);
    setErrors(found);
    setSaveError('');
    if (found.length) return;
    setSaving(true);
    try {
      const values = { name: form.name, category_id: form.categoryId, unit: form.unit };
      const saved = form.id ? await updateIngredient(form.id, values) : await createIngredient(values);
      await saveIngredientPurchaseUnit(saved, form.purchaseLabel.trim()
        ? { label: form.purchaseLabel, quantity: Number(form.purchaseQuantity) }
        : null);
      setForm(null);
      await onSaved(form.id ? `${saved.name} saved.` : `${saved.name} added.`);
    } catch (reason: unknown) {
      setSaveError(ownerPortalErrorText(reason, 'The ingredient could not be saved.'));
    } finally {
      setSaving(false);
    }
  };
  const saveCategory = async () => {
    if (!categoryName.trim()) { await onSaved('Enter a category name.', true); return; }
    try {
      await createIngredientCategory(categoryName);
      setCategoryName('');
      await onSaved('Ingredient category saved.');
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'The category could not be saved.', true);
    }
  };
  const set = (patch: Partial<IngredientForm>) => setForm((current) => (current ? { ...current, ...patch } : current));
  return (
    <Panel title="Ingredients & supplies">
      {configuration === null ? <Text style={styles.muted}>Ingredient configuration is unavailable.</Text> : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <TextInput value={query} onChangeText={setQuery} placeholder="Search ingredients…" accessibilityLabel="Search ingredients" style={styles.search} />
            <View style={{ marginBottom: 16 }}><Select value={categoryFilter} options={['All categories', ...categories.map((category) => category.name)]} onChange={setCategoryFilter} /></View>
            <Pressable accessibilityRole="button" onPress={() => open(null)} style={[styles.loginButton, { marginTop: 0, marginBottom: 16, paddingHorizontal: 18 }]}>
              <Text style={styles.loginButtonText}>Add Ingredient</Text>
            </Pressable>
          </View>
          {table.rows.length ? (
            <Table headers={INGREDIENT_HEADERS} rows={table.rows} onRowPress={(index) => open(table.ingredients[index].id)} rowLabel={(index) => `Edit ${table.ingredients[index].name}`} />
          ) : <Text style={styles.empty}>No ingredients match the search or category.</Text>}
          {form ? (
            <View style={{ marginTop: 16, maxWidth: 520 }}>
              <Text style={styles.panelTitle}>{form.id ? `Edit ${form.name || 'ingredient'}` : 'Add Ingredient'}</Text>
              <Text style={styles.label}>Name</Text>
              <TextInput value={form.name} onChangeText={(value) => set({ name: value })} accessibilityLabel="Ingredient name" placeholder="e.g. Nori" style={styles.input} />
              <Text style={styles.label}>Category</Text>
              <Select value={categories.find((category) => category.id === form.categoryId)?.name ?? 'Choose category'} options={categories.map((category) => category.name)} onChange={(value) => set({ categoryId: categories.find((category) => category.name === value)?.id ?? '' })} />
              <Text style={styles.label}>Base unit</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {BASE_UNITS.map((base) => (
                  <Pressable key={base} accessibilityRole="radio" accessibilityState={{ checked: form.baseUnit === base }} onPress={() => set({ baseUnit: base, unit: UNITS_BY_BASE[base].includes(form.unit) ? form.unit : base })} style={[styles.outline, { marginTop: 0 }, form.baseUnit === base && { backgroundColor: C.pink, borderColor: C.pink }]}>
                    <Text style={[styles.outlineText, form.baseUnit === base && { color: '#FFFFFF' }]}>{base}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Unit of measurement (stock is kept in this unit)</Text>
              <Select value={form.unit || 'Choose unit'} options={form.baseUnit ? UNITS_BY_BASE[form.baseUnit as BaseUnit] : []} onChange={(value) => set({ unit: value })} />
              <Text style={styles.label}>Purchase unit and conversion factor (optional)</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput value={form.purchaseLabel} onChangeText={(value) => set({ purchaseLabel: value })} accessibilityLabel="Purchase unit name" placeholder="e.g. One bottle" style={[styles.input, { flex: 1 }]} />
                <Text style={styles.body}>=</Text>
                <TextInput value={form.purchaseQuantity} onChangeText={(value) => set({ purchaseQuantity: value })} keyboardType="decimal-pad" accessibilityLabel="Conversion factor" placeholder="e.g. 360" style={[styles.input, { width: 100 }]} />
                <Text style={styles.body}>{form.unit || 'unit'}</Text>
              </View>
              <Text style={styles.muted}>Stock-In converts a purchase unit into the unit of measurement with this factor.</Text>
              {errors.length ? (
                <View style={[styles.errorBanner, { marginTop: 10 }]} accessibilityRole="alert">
                  {errors.map((message) => <Text key={message} style={styles.errorText}>{message}</Text>)}
                </View>
              ) : null}
              {saveError ? <SaveErrorWithRetry message={saveError} onRetry={() => void save()} /> : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable accessibilityRole="button" disabled={saving} onPress={() => setForm(null)} style={styles.outline}><Text style={styles.outlineText}>Cancel</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.loginButton, { paddingHorizontal: 22 }]}>
                  <Text style={styles.loginButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          <View style={[styles.line, { marginTop: 12 }]}>
            <TextInput value={categoryName} onChangeText={setCategoryName} placeholder="New category name" accessibilityLabel="New category name" style={[styles.input, { flex: 1 }]} />
            <Pressable accessibilityRole="button" onPress={() => void saveCategory()} style={styles.outline}><Text style={styles.outlineText}>Add category</Text></Pressable>
          </View>
        </>
      )}
    </Panel>
  );
}

type RecipeDraftLine = { key: string; ingredientId: string; quantity: string };

/**
 * OW-22 c4–c10: every product's recipe ("Recipe required" when it has none), and
 * a recipe form for a product or an add-on with add, edit and remove.
 */
function RecipesEditor({ products, configuration, onSaved }: {
  products: ProductManagementItem[];
  configuration: IngredientRecipeConfiguration | null;
  onSaved: OwnerPortalNotify;
}) {
  const [shared, setShared] = useState<SharedRecipeRecord[]>([]);
  const [addons, setAddons] = useState<MenuAddonConfiguration['addons']>([]);
  const [target, setTarget] = useState<{ kind: 'product' | 'addon'; id: string } | null>(null);
  const [lines, setLines] = useState<RecipeDraftLine[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    loadSharedRecipes().then(setShared).catch(() => setShared([]));
    loadMenuAddonConfiguration().then((result) => setAddons(result.addons)).catch(() => setAddons([]));
  }, []);
  const ingredients = (configuration?.ingredients ?? []).filter((item) => item.active);
  const ingredientById = new Map(ingredients.map((item) => [item.id, item]));
  const table = recipeTableRows(products, configuration?.recipeIngredients ?? [], shared, (id) => ingredientById.get(id)?.name ?? id);
  const targetName = target ? (target.kind === 'product' ? products.find((item) => item.id === target.id)?.product_name : addons.find((item) => item.id === target.id)?.name) ?? '' : '';
  const open = (kind: 'product' | 'addon', id: string) => {
    const current = kind === 'product'
      ? (configuration?.recipeIngredients ?? []).filter((line) => line.product_id === id && line.ingredient_id !== 'prepared-batter')
      : (configuration?.addonRecipes ?? []).filter((line) => line.addon_id === id);
    setTarget({ kind, id });
    setErrors([]);
    setSaveError('');
    setLines(current.map((line, index) => ({ key: `${line.ingredient_id}-${index}`, ingredientId: line.ingredient_id, quantity: String(line.quantity_required) })));
  };
  const save = async () => {
    if (!target) return;
    const found: string[] = [];
    const seen = new Set<string>();
    const payload = lines.map((line) => {
      const ingredient = ingredientById.get(line.ingredientId);
      const quantity = Number(line.quantity);
      if (!ingredient) found.push('Choose an ingredient for every line.');
      else if (seen.has(line.ingredientId)) found.push(`${ingredient.name} appears twice.`);
      else if (!line.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0) found.push(`Enter a required quantity greater than zero for ${ingredient.name}.`);
      seen.add(line.ingredientId);
      return { ingredient_id: line.ingredientId, quantity_required: quantity, unit_of_measure: ingredient?.unit ?? '' };
    });
    setErrors([...new Set(found)]);
    setSaveError('');
    if (found.length) return;
    setSaving(true);
    try {
      if (target.kind === 'product') {
        // The shared batter recipe supplies prepared batter; keep any prepared-batter line as it is.
        const batter = (configuration?.recipeIngredients ?? []).filter((line) => line.product_id === target.id && line.ingredient_id === 'prepared-batter')
          .map((line) => ({ ingredient_id: line.ingredient_id, quantity_required: Number(line.quantity_required), unit_of_measure: line.unit_of_measure }));
        await saveProductRecipe(target.id, [...batter, ...payload]);
      } else {
        await saveAddonRecipe(target.id, payload);
      }
      setTarget(null);
      await onSaved(`Recipe for ${targetName} saved. It applies to future sales only.`);
    } catch (reason: unknown) {
      setSaveError(ownerPortalErrorText(reason, 'The recipe could not be saved.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Panel title="Recipes">
      <Text style={styles.muted}>Takoyaki use prepared batter (the shared batter recipe), not the raw batter ingredients. A product marked “Recipe required” cannot be sold. Changes apply to future sales only.</Text>
      {configuration === null ? <Text style={styles.muted}>Recipe configuration is unavailable.</Text> : (
        <>
          <Table headers={RECIPE_HEADERS} rows={table.rows} onRowPress={(index) => open('product', products[index].id)} rowLabel={(index) => `Edit recipe for ${products[index].product_name}`} />
          <Text style={[styles.panelTitle, { marginTop: 14 }]}>Add-on recipes</Text>
          {addons.map((addon) => {
            const addonLines = (configuration.addonRecipes ?? []).filter((line) => line.addon_id === addon.id);
            return (
              <Pressable key={addon.id} accessibilityRole="button" accessibilityLabel={`Edit recipe for ${addon.name}`} onPress={() => open('addon', addon.id)} style={styles.line}>
                <Text style={styles.body}>{addon.name}</Text>
                <Text style={styles.body}>{addonLines.length ? addonLines.map((line) => `${ingredientById.get(line.ingredient_id)?.name ?? line.ingredient_id}: ${line.quantity_required} ${line.unit_of_measure}`).join(' · ') : 'No recipe (consumes nothing)'} ›</Text>
              </Pressable>
            );
          })}
          {target ? (
            <View style={{ marginTop: 16, maxWidth: 560 }}>
              <Text style={styles.panelTitle}>Recipe for {targetName}</Text>
              {lines.length === 0 ? <Text style={styles.muted}>No ingredients yet. Select Add ingredient.</Text> : null}
              {lines.map((line) => {
                const ingredient = ingredientById.get(line.ingredientId);
                return (
                  <View key={line.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Select value={ingredient?.name ?? 'Choose ingredient'} options={ingredients.map((item) => item.name)} onChange={(value) => {
                        const next = ingredients.find((item) => item.name === value);
                        if (next) setLines((current) => current.map((item) => (item.key === line.key ? { ...item, ingredientId: next.id } : item)));
                      }} />
                    </View>
                    <TextInput value={line.quantity} onChangeText={(quantity) => setLines((current) => current.map((item) => (item.key === line.key ? { ...item, quantity } : item)))} keyboardType="decimal-pad" accessibilityLabel={`Required quantity of ${ingredient?.name ?? 'ingredient'}`} placeholder="Quantity" style={[styles.input, { width: 100 }]} />
                    <Text style={[styles.body, { width: 50 }]}>{ingredient?.unit ?? ''}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${ingredient?.name ?? 'line'}`} onPress={() => setLines((current) => current.filter((item) => item.key !== line.key))} style={[styles.outline, styles.dangerOutline, { marginTop: 0 }]}>
                      <Text style={styles.dangerText}>Remove</Text>
                    </Pressable>
                  </View>
                );
              })}
              <Pressable accessibilityRole="button" onPress={() => {
                const next = ingredients.find((item) => !lines.some((line) => line.ingredientId === item.id));
                if (next) setLines((current) => [...current, { key: `${next.id}-${Date.now()}`, ingredientId: next.id, quantity: '' }]);
              }} style={styles.outline}><Text style={styles.outlineText}>Add ingredient</Text></Pressable>
              <Text style={styles.muted}>Quantities are per unit sold, in the ingredient’s unit of measurement.</Text>
              {errors.length ? (
                <View style={[styles.errorBanner, { marginTop: 10 }]} accessibilityRole="alert">
                  {errors.map((message) => <Text key={message} style={styles.errorText}>{message}</Text>)}
                </View>
              ) : null}
              {saveError ? <SaveErrorWithRetry message={saveError} onRetry={() => void save()} /> : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable accessibilityRole="button" disabled={saving} onPress={() => setTarget(null)} style={styles.outline}><Text style={styles.outlineText}>Cancel</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.loginButton, { paddingHorizontal: 22 }]}>
                  <Text style={styles.loginButtonText}>{saving ? 'Saving…' : 'Save recipe'}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      )}
    </Panel>
  );
}

type PreparedBatterDraftLine = {
  key: string;
  ingredientId: string;
  quantity: string;
};

function PreparedBatterEditor({ ingredients, products, onSaved }: {
  ingredients: Array<{ id: string; name: string; unit: string }>;
  products: ProductManagementItem[];
  onSaved: OwnerPortalNotify;
}) {
  const [recipes, setRecipes] = useState<SharedRecipeRecord[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [recipeCode, setRecipeCode] = useState('shared-batter');
  const [recipeName, setRecipeName] = useState('Shared Takoyaki Batter');
  const [active, setActive] = useState(false);
  const [automaticConsumption, setAutomaticConsumption] = useState(false);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [lines, setLines] = useState<PreparedBatterDraftLine[]>([]);
  // OW-23 c3: pieces one bottle yields (20–25).
  const [yieldDraft, setYieldDraft] = useState('25');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedRecipe = recipes.find((recipe) => recipe.id === selectedRecipeId);

  useEffect(() => {
    let activeRequest = true;
    loadSharedRecipes().then((records) => {
      if (!activeRequest) return;
      setRecipes(records);
      setSelectedRecipeId(records[0]?.id ?? '');
    }).catch((reason: unknown) => {
      if (activeRequest) setError(reason instanceof Error ? reason.message : 'Unable to load prepared-batter recipes.');
    }).finally(() => {
      if (activeRequest) setLoading(false);
    });
    return () => { activeRequest = false; };
  }, []);

  useEffect(() => {
    if (selectedRecipe) {
      setRecipeCode(selectedRecipe.recipe_code);
      setRecipeName(selectedRecipe.name);
      setActive(selectedRecipe.active);
      setAutomaticConsumption(selectedRecipe.automatic_consumption_enabled);
      setProductIds(selectedRecipe.productIds);
      setYieldDraft(String(yieldPerBottle(selectedRecipe)));
      // OW-23 c1: raw ingredient quantities per batch (as saved). The prepared-batter
      // output line is not a raw ingredient and is kept as it is.
      setLines(selectedRecipe.ingredientLines
        .filter((line) => line.ingredient_id !== 'prepared-batter')
        .map((line, index) => ({
          key: `${selectedRecipe.id}-${index}`,
          ingredientId: line.ingredient_id,
          quantity: String(line.quantity_required),
        })));
      setError('');
    } else {
      setRecipeCode('shared-batter');
      setRecipeName('Shared Takoyaki Batter');
      setActive(false);
      setAutomaticConsumption(false);
      setProductIds([]);
      setLines([]);
      setYieldDraft('25');
    }
  }, [selectedRecipe]);

  const save = async () => {
    if (saving || loading) return;
    setError('');
    if (!recipeCode.trim() || !recipeName.trim() || lines.length === 0) {
      setError('Enter a recipe code and name and add at least one raw ingredient.');
      return;
    }
    const parsedYield = parseYieldPerBottle(yieldDraft);
    if ('error' in parsedYield) {
      setError(parsedYield.error);
      return;
    }
    const usedIngredients = new Set<string>();
    const ingredientLines = [];
    for (const line of lines) {
      const ingredient = ingredients.find((item) => item.id === line.ingredientId);
      const quantity = Number(line.quantity);
      if (!ingredient || usedIngredients.has(line.ingredientId)) {
        setError('Choose a different configured ingredient for every recipe line.');
        return;
      }
      if (!line.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0) {
        setError(`Enter a quantity per batch greater than zero for ${ingredient.name}.`);
        return;
      }
      usedIngredients.add(line.ingredientId);
      ingredientLines.push({
        ingredient_id: ingredient.id,
        quantity_required: quantity,
        unit_of_measure: ingredient.unit,
        automatic_consumption_enabled: automaticConsumption,
      });
    }
    // Keep the prepared-batter output line of the saved recipe.
    ingredientLines.push(...(selectedRecipe?.ingredientLines ?? []).filter((line) => line.ingredient_id === 'prepared-batter'));

    setSaving(true);
    try {
      await saveSharedRecipe({
        id: selectedRecipe?.id,
        recipe_code: recipeCode,
        name: recipeName,
        estimated_yield_pieces: parsedYield.value * BOTTLES_PER_BATCH,
        prepared_quantity: BOTTLES_PER_BATCH,
        prepared_unit: 'bottle',
        active,
        automatic_consumption_enabled: automaticConsumption,
        ingredientLines,
        productIds,
      });
      await onSaved(`Prepared batter saved: ${parsedYield.value} pieces per bottle. The new settings apply to future batches and sales only.`);
      const updatedRecipes = await loadSharedRecipes();
      setRecipes(updatedRecipes);
      const saved = updatedRecipes.find((recipe) => recipe.id === selectedRecipe?.id)
        ?? updatedRecipes.find((recipe) => recipe.recipe_code === recipeCode.trim());
      setSelectedRecipeId(saved?.id ?? '');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Prepared-batter recipe save failed.');
    } finally {
      setSaving(false);
    }
  };

  const addIngredientLine = () => {
    const nextIngredient = ingredients.find((ingredient) =>
      !lines.some((line) => line.ingredientId === ingredient.id),
    );
    if (!nextIngredient) {
      setError('Add another configured ingredient before adding a recipe line.');
      return;
    }
    setError('');
    setLines((current) => [...current, {
      key: `${Date.now()}-${nextIngredient.id}`,
      ingredientId: nextIngredient.id,
      quantity: '',
    }]);
  };

  return (
    <Panel title="Prepared batter">
      {/* OW-23 c2, c5–c8 */}
      <Text style={styles.body}>Bottles per batch: <Text style={styles.strong}>{BOTTLES_PER_BATCH}</Text></Text>
      <Text style={styles.muted}>The batter recipe is configured here, separately from the Prepared Takoyaki Batter inventory item.</Text>
      <Text style={styles.muted}>Raw ingredients are deducted when staff record a batch; completed sales consume prepared batter and never deduct the raw ingredients again.</Text>
      <Text style={styles.muted}>The system does not measure the exact batter dispensed from a bottle; sales use the yield per bottle set here.</Text>
      <Text style={styles.muted}>Saved settings apply only to future batches and sales.</Text>
      {loading ? <View style={styles.loadingRow}><ActivityIndicator color={C.pink} /><Text style={styles.muted}>Loading shared recipe…</Text></View> : null}
      {!loading && recipes.length ? (
        <Select
          value={selectedRecipe?.name ?? 'Choose recipe'}
          options={recipes.map((recipe) => recipe.name)}
          onChange={(value) => setSelectedRecipeId(recipes.find((recipe) => recipe.name === value)?.id ?? '')}
        />
      ) : null}
      {!loading && !recipes.length ? <Text style={styles.muted}>No shared recipe was returned; a new one can be configured from the existing recipe service.</Text> : null}
      <TextInput value={recipeCode} onChangeText={setRecipeCode} placeholder="Recipe code" style={styles.input} />
      <TextInput value={recipeName} onChangeText={setRecipeName} placeholder="Recipe name" style={styles.input} />
      <Text style={styles.label}>Yield per bottle (20–25 pieces)</Text>
      <TextInput value={yieldDraft} onChangeText={setYieldDraft} keyboardType="number-pad" accessibilityLabel="Yield per bottle" style={[styles.input, { width: 120 }]} />
      <Text style={styles.panelTitle}>Raw ingredients per batch</Text>
      {lines.map((line) => {
        const ingredient = ingredients.find((item) => item.id === line.ingredientId);
        return (
          <View key={line.key} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Select
                value={ingredient?.name ?? 'Choose ingredient'}
                options={ingredients.map((item) => item.name)}
                onChange={(value) => {
                  const nextIngredient = ingredients.find((item) => item.name === value);
                  if (nextIngredient) setLines((current) => current.map((item) =>
                    item.key === line.key ? { ...item, ingredientId: nextIngredient.id } : item,
                  ));
                }}
              />
              <TextInput
                value={line.quantity}
                onChangeText={(quantity) => setLines((current) => current.map((item) =>
                  item.key === line.key ? { ...item, quantity } : item,
                ))}
                keyboardType="decimal-pad"
                placeholder={`Quantity per batch (${ingredient?.unit ?? 'unit'})`}
                accessibilityLabel={`Quantity per batch of ${ingredient?.name ?? 'ingredient'}`}
                style={styles.input}
              />
            </View>
            <Pressable onPress={() => setLines((current) => current.filter((item) => item.key !== line.key))} style={[styles.outline, styles.dangerOutline]}>
              <Text style={styles.dangerText}>Remove</Text>
            </Pressable>
          </View>
        );
      })}
      <Pressable disabled={loading || ingredients.length === 0} onPress={addIngredientLine} style={styles.outline}>
        <Text style={styles.outlineText}>Add raw ingredient</Text>
      </Pressable>
      <View style={styles.line}>
        <Pressable onPress={() => setActive((current) => !current)} style={styles.outline}>
          <Text style={styles.outlineText}>{active ? 'Active' : 'Inactive'} · tap to toggle</Text>
        </Pressable>
        <Pressable onPress={() => setAutomaticConsumption((current) => !current)} style={styles.outline}>
          <Text style={styles.outlineText}>{automaticConsumption ? 'Automatic consumption on' : 'Automatic consumption off'}</Text>
        </Pressable>
      </View>
      <Text style={styles.panelTitle}>Applicable products</Text>
      <View style={styles.line}>
        {products.filter((product) => product.is_available).map((product) => {
          const selected = productIds.includes(product.id);
          return (
            <Pressable key={product.id} onPress={() => setProductIds((current) => selected
              ? current.filter((id) => id !== product.id)
              : [...current, product.id])} style={styles.outline}>
              <Text style={styles.outlineText}>{selected ? '✓ ' : ''}{product.product_name}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View> : null}
      <Pressable disabled={saving || loading} onPress={() => void save()} style={styles.loginButton}>
        <Text style={styles.loginButtonText}>{saving ? 'Saving…' : 'Save batter recipe'}</Text>
      </Pressable>
    </Panel>
  );
}

/**
 * OW-24 Stock Threshold and Expiration Settings: the minimum stock level of each
 * ingredient (used for all three branches), with search and category filter,
 * and the expiration alert period.
 */
function StockThresholdsEditor({ stockSettings, onSaved, part = 'all' }: { stockSettings: StockExpirationSettingsData | null; onSaved: OwnerPortalNotify; part?: 'all' | 'thresholds' | 'expiration' }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [days, setDays] = useState(String(stockSettings?.nearExpirationDays ?? ''));
  const [daysError, setDaysError] = useState('');
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  useEffect(() => { setDays(String(stockSettings?.nearExpirationDays ?? '')); }, [stockSettings?.nearExpirationDays]);
  if (!stockSettings) return <Panel title="Stock thresholds"><Text style={styles.muted}>Stock settings are unavailable.</Text></Panel>;
  const categories = stockSettings.categories;
  const categoryId = categories.find((item) => item.name === category)?.id ?? null;
  const rows = thresholdRows({ ingredients: stockSettings.ingredients, categories, inventory: stockSettings.inventory, query, categoryId });
  const saveRow = async (row: ThresholdRow) => {
    const parsed = parseMinimumStock(drafts[row.ingredientId] ?? (row.minimum === null ? '' : String(row.minimum)), row.name);
    if ('error' in parsed) { setRowError({ id: row.ingredientId, message: parsed.error }); return; }
    setRowError(null);
    setSavingId(row.ingredientId);
    try {
      // OW-24 c4: the same level for all three branches.
      for (const branch of stockSettings.branches) await updateMinimumStock(branch.id, row.ingredientId, parsed.value);
      setDrafts((current) => { const next = { ...current }; delete next[row.ingredientId]; return next; });
      await onSaved(`Minimum stock for ${row.name} set to ${parsed.value} ${row.unit} for all branches.`);
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'The minimum stock level could not be saved.', true);
    } finally {
      setSavingId(null);
    }
  };
  const saveDays = async () => {
    const parsed = parseAlertDays(days);
    if ('error' in parsed) { setDaysError(parsed.error); return; }
    setDaysError('');
    try {
      await updateNearExpirationDays(parsed.value);
      await onSaved(`Expiration alert period set to ${parsed.value} days for all branches.`);
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'The expiration alert period could not be saved.', true);
    }
  };
  return (
    <Panel title={part === 'expiration' ? 'Expiration alert settings' : part === 'thresholds' ? 'Stock thresholds' : 'Stock thresholds & expiration alerts'}>
      <Text style={styles.muted}>An item at or below its minimum stock is Low Stock; at zero it is Out of Stock. These alerts never create or place purchase orders. Changes do not alter past records.</Text>
      {part !== 'expiration' ? <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search ingredients…" accessibilityLabel="Search thresholds" style={styles.search} />
        <View style={{ marginBottom: 16 }}><Select value={category} options={['All categories', ...categories.map((item) => item.name)]} onChange={setCategory} /></View>
      </View>
      <View style={styles.tableHead}>
        {['Ingredient', 'Category', 'Unit', 'Minimum stock (all branches)', ''].map((header) => <Text key={header} style={styles.headCell}>{header}</Text>)}
      </View>
      {rows.map((row) => (
        <View key={row.ingredientId}>
          <View style={[styles.tableRow, { alignItems: 'center' }]}>
            <Text style={[styles.cell, styles.strong]}>{row.name}</Text>
            <Text style={styles.cell}>{row.category}</Text>
            <Text style={styles.cell}>{row.unit}</Text>
            <View style={{ flex: 1 }}>
              <TextInput value={drafts[row.ingredientId] ?? (row.minimum === null ? '' : String(row.minimum))} onChangeText={(value) => setDrafts((current) => ({ ...current, [row.ingredientId]: value }))} keyboardType="decimal-pad" accessibilityLabel={`Minimum stock for ${row.name}`} style={[styles.input, { padding: 8, width: 110 }]} />
              {row.varies ? <Text style={styles.muted}>Differs by branch; saving sets it for all.</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Save minimum stock for ${row.name}`} disabled={savingId !== null} onPress={() => void saveRow(row)} style={[styles.outline, { marginTop: 0 }]}>
                <Text style={styles.outlineText}>{savingId === row.ingredientId ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
          {rowError?.id === row.ingredientId ? <Text style={[styles.errorText, { paddingHorizontal: 14 }]} accessibilityRole="alert">{rowError.message}</Text> : null}
        </View>
      ))}
      {rows.length === 0 ? <Text style={styles.empty}>No ingredients match the search or category.</Text> : null}
      </> : null}
      {part !== 'thresholds' ? <>
      <Text style={[styles.label, { marginTop: 18 }]}>General alert period (days before expiration shown as Near Expiration, for items without their own window)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TextInput value={days} onChangeText={(value) => { setDays(value); setDaysError(''); }} keyboardType="number-pad" accessibilityLabel="Expiration alert period" style={[styles.input, { width: 110 }]} />
        <Pressable accessibilityRole="button" onPress={() => void saveDays()} style={[styles.outline, { marginTop: 0 }]}><Text style={styles.outlineText}>Save alert period</Text></Pressable>
      </View>
      {daysError ? <Text style={styles.errorText} accessibilityRole="alert">{daysError}</Text> : null}
      <ExpiryRulesEditor stockSettings={stockSettings} onSaved={onSaved} />
      </> : null}
    </Panel>
  );
}

/**
 * Per-item expiry rules (owner decision of 2026-11-25): each item's shelf life and
 * near-expiration window. Stock received without a printed date expires on date
 * received + shelf life.
 */
function ExpiryRulesEditor({ stockSettings, onSaved }: { stockSettings: StockExpirationSettingsData; onSaved: OwnerPortalNotify }) {
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { shelf?: string; window?: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const rows = expiryRuleRows({ ingredients: stockSettings.ingredients, categories: stockSettings.categories, query });
  const shelfDraft = (row: ExpiryRuleRow) => drafts[row.ingredientId]?.shelf ?? (row.shelfLifeDays === null ? '' : String(row.shelfLifeDays));
  const windowDraft = (row: ExpiryRuleRow) => drafts[row.ingredientId]?.window ?? (row.nearExpirationDays === null ? '' : String(row.nearExpirationDays));
  const saveRow = async (row: ExpiryRuleRow) => {
    const shelf = parseShelfLifeDays(shelfDraft(row), row.name);
    if ('error' in shelf) { setRowError({ id: row.ingredientId, message: shelf.error }); return; }
    const alertWindow = parseItemAlertDays(windowDraft(row), row.name);
    if ('error' in alertWindow) { setRowError({ id: row.ingredientId, message: alertWindow.error }); return; }
    setRowError(null);
    setSavingId(row.ingredientId);
    try {
      // An item that never expires has no alert window.
      const nearExpirationDays = shelf.value === null ? null : alertWindow.value;
      await saveIngredientExpiryRules({ ingredientId: row.ingredientId, shelfLifeDays: shelf.value, nearExpirationDays });
      setDrafts((current) => { const next = { ...current }; delete next[row.ingredientId]; return next; });
      await onSaved(`${row.name}: ${expiryRuleSummary({ shelfLifeDays: shelf.value, nearExpirationDays }, stockSettings.nearExpirationDays).toLowerCase()}.`);
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'The expiry rule could not be saved.', true);
    } finally {
      setSavingId(null);
    }
  };
  return (
    <>
      <Text style={[styles.label, { marginTop: 22 }]}>Shelf life and alert window per item</Text>
      <Text style={styles.muted}>Stock received without a printed date expires on date received + shelf life. Leave the shelf life blank for items that never expire; leave the window blank to use the general period. Changes apply to stock received from now on.</Text>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search items…" accessibilityLabel="Search expiry rules" style={[styles.search, { marginTop: 10 }]} />
      <View style={styles.tableHead}>
        {['Item', 'Category', 'Shelf life (days)', 'Alert window (days)', 'Rule', ''].map((header) => <Text key={header} style={styles.headCell}>{header}</Text>)}
      </View>
      {rows.map((row) => {
        const shelfValue = parseShelfLifeDays(shelfDraft(row), row.name);
        const windowValue = parseItemAlertDays(windowDraft(row), row.name);
        const preview = 'error' in shelfValue || 'error' in windowValue
          ? null
          : { shelfLifeDays: shelfValue.value, nearExpirationDays: shelfValue.value === null ? null : windowValue.value };
        const warning = preview ? expiryRuleWarning(preview.shelfLifeDays, preview.nearExpirationDays) : null;
        return (
          <View key={row.ingredientId}>
            <View style={[styles.tableRow, { alignItems: 'center' }]}>
              <Text style={[styles.cell, styles.strong]}>{row.name}</Text>
              <Text style={styles.cell}>{row.category}</Text>
              <View style={{ flex: 1 }}>
                <TextInput value={shelfDraft(row)} onChangeText={(value) => setDrafts((current) => ({ ...current, [row.ingredientId]: { ...current[row.ingredientId], shelf: value } }))} keyboardType="number-pad" placeholder="Never expires" accessibilityLabel={`Shelf life in days for ${row.name}`} style={[styles.input, { padding: 8, width: 120, marginBottom: 0 }]} />
              </View>
              <View style={{ flex: 1 }}>
                <TextInput value={windowDraft(row)} onChangeText={(value) => setDrafts((current) => ({ ...current, [row.ingredientId]: { ...current[row.ingredientId], window: value } }))} keyboardType="number-pad" placeholder={shelfDraft(row).trim() === '' ? 'Not used' : `General (${stockSettings.nearExpirationDays})`} accessibilityLabel={`Alert window in days for ${row.name}`} style={[styles.input, { padding: 8, width: 120, marginBottom: 0 }]} />
              </View>
              <Text style={styles.cell}>{preview ? expiryRuleSummary(preview, stockSettings.nearExpirationDays) : '—'}</Text>
              <View style={{ flex: 1 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Save expiry rule for ${row.name}`} disabled={savingId !== null} onPress={() => void saveRow(row)} style={[styles.outline, { marginTop: 0 }]}>
                  <Text style={styles.outlineText}>{savingId === row.ingredientId ? 'Saving…' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
            {rowError?.id === row.ingredientId ? <Text style={[styles.errorText, { paddingHorizontal: 14 }]} accessibilityRole="alert">{rowError.message}</Text> : null}
            {warning && rowError?.id !== row.ingredientId ? <Text style={[styles.muted, { paddingHorizontal: 14 }]}>{warning}</Text> : null}
          </View>
        );
      })}
      {rows.length === 0 ? <Text style={styles.empty}>No items match the search.</Text> : null}
    </>
  );
}

/** OW-28 c3: the three branches and their names. */
function BranchInfoEditor({ business, onSaved }: { business: BusinessConfiguration; onSaved: (message: string, isError?: boolean) => Promise<void> }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = async (branch: BusinessConfiguration['branches'][number]) => {
    const value = drafts[branch.id] ?? branch.city;
    const error = branchNameError(value, branch.id, business.branches);
    setErrors((current) => ({ ...current, [branch.id]: error ?? '' }));
    if (error) return;
    try {
      await saveBranchName(branch.id, value);
      await onSaved(`Branch ${Number(branch.code.replace(/\D/g, '')) || branch.code} is now “${value.trim()} · Branch ${Number(branch.code.replace(/\D/g, '')) || branch.code}”.`);
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'The branch name could not be saved.', true);
    }
  };
  return (
    <Panel title="Branch information">
      <Text style={styles.muted}>Each branch is shown everywhere as “name · Branch N”.</Text>
      {business.branches.map((branch) => (
        <View key={branch.id}>
          <View style={[styles.line, { alignItems: 'center', gap: 10 }]}>
            <Text style={[styles.strong, { width: 90 }]}>{`Branch ${Number(branch.code.replace(/\D/g, '')) || branch.code}`}</Text>
            <TextInput value={drafts[branch.id] ?? branch.city} onChangeText={(value) => setDrafts((current) => ({ ...current, [branch.id]: value }))} accessibilityLabel={`Name of Branch ${Number(branch.code.replace(/\D/g, '')) || branch.code}`} placeholder="e.g. Manila" style={[styles.input, { flex: 1 }]} />
            <Text style={[styles.body, { width: 200 }]}>{branch.name}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Save name of ${branch.name}`} onPress={() => void save(branch)} style={[styles.outline, { marginTop: 0 }]}><Text style={styles.outlineText}>Save</Text></Pressable>
          </View>
          {errors[branch.id] ? <Text style={styles.errorText} accessibilityRole="alert">{errors[branch.id]}</Text> : null}
        </View>
      ))}
    </Panel>
  );
}

/** OW-28 c4: units, base units and conversion factors, and the purchase units. */
function UnitsPanel({ business }: { business: BusinessConfiguration }) {
  return (
    <Panel title="Units of Measurement">
      <Table headers={['Base Unit', 'Units', 'Conversion Factors']} rows={unitRows(business.units, business.conversions)} />
      <Text style={[styles.panelTitle, { marginTop: 14 }]}>Purchase units</Text>
      {business.purchaseUnits.length ? (
        <Table headers={['Ingredient', 'Purchase Unit', 'Conversion Factor']} rows={business.purchaseUnits.map((unit) => [unit.ingredient, unit.label, `1 ${unit.label.replace(/^one\s+/i, '')} = ${unit.quantity} ${unit.unit}`])} />
      ) : <Text style={styles.empty}>No purchase units yet. Set them in Ingredient information.</Text>}
    </Panel>
  );
}

/**
 * OW-28 c5–c8: the opening stock of each item per branch (once), and the
 * go-live lock after which stock changes only through recorded transactions.
 */
function OpeningStockEditor({ business, onSaved }: { business: BusinessConfiguration; onSaved: (message: string, isError?: boolean) => Promise<void> }) {
  const [branchId, setBranchId] = useState(business.branches[0]?.id ?? '');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [confirming, setConfirming] = useState<{ row: OpeningStockRow; value: number } | null>(null);
  const [goLiveDate, setGoLiveDate] = useState(manilaDateKey());
  const [confirmingGoLive, setConfirmingGoLive] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!business.openingStockSupported) return <Panel title="Opening Stock"><Text style={styles.muted}>Opening stock needs the latest database update.</Text></Panel>;
  const rows = openingStockRows({ branchId, ingredients: business.ingredients, inventory: business.inventory, entries: business.openingEntries });
  const branch = business.branches.find((item) => item.id === branchId);
  const missing = business.branches.reduce((count, item) => count + openingStockRows({ branchId: item.id, ingredients: business.ingredients, inventory: business.inventory, entries: business.openingEntries }).filter((row) => !row.entry).length, 0);
  const locked = business.goLive;
  const ask = (row: OpeningStockRow) => {
    const parsed = parseOpeningQuantity(drafts[row.ingredientId] ?? (row.current === null ? '' : String(row.current)), row.name);
    if ('error' in parsed) { setRowError({ id: row.ingredientId, message: parsed.error }); return; }
    setRowError(null);
    setConfirming({ row, value: parsed.value });
  };
  const record = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      await recordOpeningStock(branchId, confirming.row.ingredientId, confirming.value);
      setConfirming(null);
      await onSaved(`Opening stock of ${confirming.row.name} at ${branch?.name ?? 'the branch'}: ${confirming.value} ${confirming.row.unit}.`);
    } catch (reason: unknown) {
      setConfirming(null);
      await onSaved(reason instanceof Error ? reason.message : 'The opening stock could not be saved.', true);
    } finally {
      setBusy(false);
    }
  };
  const lock = async () => {
    setBusy(true);
    try {
      await setBusinessGoLive(goLiveDate.trim());
      setConfirmingGoLive(false);
      await onSaved(`Go-live set to ${goLiveDate.trim()}. The opening stock is locked.`);
    } catch (reason: unknown) {
      setConfirmingGoLive(false);
      await onSaved(reason instanceof Error ? reason.message : 'The go-live date could not be set.', true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Opening Stock">
      {locked ? (
        <View style={[styles.errorBanner, { backgroundColor: '#EEF4FB' }]}>
          <Text style={styles.strong}>Locked since go-live on {formatReportDate(new Date(`${locked.go_live_date}T12:00:00+08:00`))}.</Text>
          <Text style={styles.body}>The opening stock can no longer be edited. Stock now changes only through recorded transactions (Stock-In, sales, batter batches, waste and authorized count adjustments), so every balance can be traced in the ledger.</Text>
        </View>
      ) : (
        <Text style={styles.muted}>Enter the starting quantity of each item per branch. Each item can be entered once per branch; the field starts at the current balance. Items without an entry keep their current balance.</Text>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 10 }} accessibilityRole="tablist">
        {business.branches.map((item) => (
          <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: item.id === branchId }} onPress={() => { setBranchId(item.id); setConfirming(null); setRowError(null); }} style={[styles.outline, { marginTop: 0 }, item.id === branchId && { backgroundColor: C.pink, borderColor: C.pink }]}>
            <Text style={[styles.outlineText, item.id === branchId && { color: '#FFFFFF' }]}>{item.name}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.tableHead}>
        {['Item', 'Current balance', 'Opening stock', ''].map((header) => <Text key={header} style={styles.headCell}>{header}</Text>)}
      </View>
      {rows.map((row) => (
        <View key={row.ingredientId}>
          <View style={[styles.tableRow, { alignItems: 'center' }]}>
            <Text style={[styles.cell, styles.strong]}>{row.name}</Text>
            <Text style={styles.cell}>{row.current === null ? '—' : `${row.current} ${row.unit}`}</Text>
            <View style={{ flex: 1 }}>
              {row.entry ? (
                <Text style={styles.body}>{row.entry.quantity} {row.unit} · entered {formatReportDateTime(new Date(row.entry.recordedAt))}</Text>
              ) : locked ? <Text style={styles.muted}>No entry (kept {row.current ?? 0} {row.unit})</Text> : (
                <TextInput value={drafts[row.ingredientId] ?? (row.current === null ? '' : String(row.current))} onChangeText={(value) => setDrafts((current) => ({ ...current, [row.ingredientId]: value }))} keyboardType="decimal-pad" accessibilityLabel={`Opening stock of ${row.name}`} style={[styles.input, { padding: 8, width: 120 }]} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              {row.entry ? <Text style={styles.muted}>Entered (once only)</Text> : locked ? null : (
                <Pressable accessibilityRole="button" accessibilityLabel={`Enter opening stock of ${row.name}`} disabled={busy} onPress={() => ask(row)} style={[styles.outline, { marginTop: 0 }]}><Text style={styles.outlineText}>Enter</Text></Pressable>
              )}
            </View>
          </View>
          {rowError?.id === row.ingredientId ? <Text style={[styles.errorText, { paddingHorizontal: 14 }]} accessibilityRole="alert">{rowError.message}</Text> : null}
          {confirming?.row.ingredientId === row.ingredientId ? (
            <View style={[reviewStyles.card, { margin: 8 }]} accessibilityRole="alert">
              <Text style={styles.body}>Record the opening stock of {row.name} at {branch?.name} as {confirming.value} {row.unit}? It can be entered only once.</Text>
              <View style={reviewStyles.actions}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirming(null)} style={reviewStyles.cancel}><Text style={reviewStyles.cancelText}>Cancel</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Confirm opening stock" disabled={busy} onPress={() => void record()} style={reviewStyles.approve}><Text style={reviewStyles.approveText}>{busy ? 'Saving…' : 'Record opening stock'}</Text></Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ))}
      {rows.length === 0 ? <Text style={styles.empty}>No items are set up for this branch.</Text> : null}
      {!locked ? (
        <View style={{ marginTop: 18 }}>
          <Text style={styles.panelTitle}>Go-live</Text>
          <Text style={styles.body}>Setting the go-live date locks the opening stock. Afterwards stock changes only through recorded transactions.</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <TextInput value={goLiveDate} onChangeText={setGoLiveDate} accessibilityLabel="Go-live date" placeholder="YYYY-MM-DD" style={[styles.input, { width: 150 }]} />
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirmingGoLive(true)} style={[styles.loginButton, { marginTop: 0, paddingHorizontal: 18 }]}><Text style={styles.loginButtonText}>Set go-live date</Text></Pressable>
          </View>
          {confirmingGoLive ? (
            <View style={[reviewStyles.card, { marginTop: 10 }]} accessibilityRole="alert">
              <Text style={styles.body}>Lock the opening stock with go-live on {goLiveDate.trim() || '—'}? It cannot be undone.{missing ? ` ${missing} item${missing === 1 ? '' : 's'} across the branches have no opening entry and keep their current balance.` : ''}</Text>
              <View style={reviewStyles.actions}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirmingGoLive(false)} style={reviewStyles.cancel}><Text style={reviewStyles.cancelText}>Cancel</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Confirm go-live" disabled={busy} onPress={() => void lock()} style={reviewStyles.approve}><Text style={reviewStyles.approveText}>{busy ? 'Locking…' : 'Lock opening stock'}</Text></Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </Panel>
  );
}

/**
 * OW-28 Business and Inventory Configuration: the sections as cards (c1); each
 * opens its configuration and returns here (c2).
 */
function SettingsEditor({ products, configuration, stockSettings, onSaved }: {
  products: ProductManagementItem[];
  configuration: any;
  stockSettings: any;
  onSaved: OwnerPortalNotify;
}) {
  const ingredients = configuration?.ingredients ?? [];
  const [section, setSection] = useState<ConfigSectionKey | null>(null);
  const [business, setBusiness] = useState<BusinessConfiguration | null>(null);
  const [businessError, setBusinessError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let active = true;
    loadBusinessConfiguration()
      .then((result) => { if (active) { setBusiness(result); setBusinessError(''); } })
      .catch((reason: unknown) => { if (active) setBusinessError(ownerPortalErrorText(reason, 'The business configuration could not be loaded.')); });
    return () => { active = false; };
  }, [reloadKey]);
  const savedAndReload = async (message: string, isError = false) => {
    await onSaved(message, isError);
    if (!isError) setReloadKey((key) => key + 1);
  };
  const summary: Record<ConfigSectionKey, string> = {
    branches: business ? business.branches.map((branch) => branch.name).join(' · ') : '…',
    products: `${products.length} products`,
    ingredients: `${ingredients.length} ingredients`,
    units: business ? `${business.units.length} units · ${business.purchaseUnits.length} purchase units` : '…',
    recipes: `${(configuration?.recipeIngredients ?? []).length} recipe lines`,
    batter: '5 bottles per batch',
    thresholds: 'Per ingredient, all branches',
    expiration: stockSettings ? `${stockSettings.nearExpirationDays} days` : '…',
    opening: business ? (business.goLive ? `Locked since ${business.goLive.go_live_date}` : `${business.openingEntries.length} entries · not locked`) : '…',
  };
  if (!section) {
    return (
      <>
        <Text style={styles.section}>Business configuration</Text>
        <Text style={styles.muted}>Choose a section. Each opens its settings, with a link back here.</Text>
        {businessError ? <ReportErrorBanner message={businessError} onRetry={() => setReloadKey((key) => key + 1)} /> : null}
        <View style={styles.grid}>
          {CONFIG_SECTIONS.map((item) => (
            <Pressable key={item.key} accessibilityRole="link" accessibilityLabel={`Open ${item.title}`} onPress={() => setSection(item.key)} style={({ pressed }) => [styles.metric, { minWidth: 240 }, pressed && { opacity: 0.8 }]}>
              <Text style={styles.metricLabel}>{item.title}</Text>
              <Text style={[styles.body, { marginVertical: 6 }]}>{item.description}</Text>
              <Text style={styles.muted}>{summary[item.key]}</Text>
              <Text style={[styles.pinkText, { marginTop: 8 }]}>Open ›</Text>
            </Pressable>
          ))}
        </View>
      </>
    );
  }
  const title = CONFIG_SECTIONS.find((item) => item.key === section)?.title ?? '';
  const needsBusiness = section === 'branches' || section === 'units' || section === 'opening';
  return (
    <>
      <Pressable accessibilityRole="link" accessibilityLabel="Back to Business Configuration" onPress={() => setSection(null)} style={{ marginBottom: 12 }}>
        <Text style={styles.pinkText}>‹ Business Configuration</Text>
      </Pressable>
      <Text style={styles.section}>{title}</Text>
      {needsBusiness && !business ? (businessError ? <ReportErrorBanner message={businessError} onRetry={() => setReloadKey((key) => key + 1)} /> : <SectionLoading label="Loading…" />) : null}
      <View style={styles.grid}>
        {section === 'branches' && business ? <BranchInfoEditor business={business} onSaved={savedAndReload} /> : null}
        {section === 'products' ? <OwnerProductEditor products={products} onSaved={onSaved} /> : null}
        {section === 'ingredients' ? <IngredientConfigurationEditor configuration={configuration} onSaved={onSaved} /> : null}
        {section === 'units' && business ? <UnitsPanel business={business} /> : null}
        {section === 'recipes' ? <RecipesEditor products={products} configuration={configuration} onSaved={onSaved} /> : null}
        {section === 'batter' ? <PreparedBatterEditor ingredients={ingredients} products={products} onSaved={onSaved} /> : null}
        {section === 'thresholds' ? <StockThresholdsEditor stockSettings={stockSettings} onSaved={onSaved} part="thresholds" /> : null}
        {section === 'expiration' ? <StockThresholdsEditor stockSettings={stockSettings} onSaved={onSaved} part="expiration" /> : null}
        {section === 'opening' && business ? <OpeningStockEditor business={business} onSaved={savedAndReload} /> : null}
      </View>
    </>
  );
}

/**
 * OW-30 Owner Profile: the profile information, Account Settings (name) and
 * Security Settings (password change with the current password).
 */
function ProfileEditor({ user, onSaved, onNameChanged }: {
  user: AppUser;
  onSaved: OwnerPortalNotify;
  onNameChanged: (name: string) => void;
}) {
  const [name, setName] = useState(user.displayName);
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [fields, setFields] = useState<OwnerPasswordFields>({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [fieldErrors, setFieldErrors] = useState<OwnerPasswordErrors>({});
  const [savingPassword, setSavingPassword] = useState(false);
  const setField = (key: keyof OwnerPasswordFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };
  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setNameError('Enter your name.'); return; }
    if (trimmed === user.displayName) { setNameError('The name is unchanged.'); return; }
    setSavingName(true);
    try {
      await updateOwnerProfile({ fullName: trimmed });
      onNameChanged(trimmed);
      await onSaved('Account settings saved.');
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'The account settings could not be saved.', true);
    } finally {
      setSavingName(false);
    }
  };
  const changePassword = async () => {
    const errors = validateOwnerPasswordChange(fields);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSavingPassword(true);
    try {
      await changeOwnerPassword(fields);
      setFields({ currentPassword: '', newPassword: '', confirmPassword: '' });
      await onSaved('Password changed. Use the new password at your next login.');
    } catch (reason: unknown) {
      if (reason instanceof OwnerPasswordChangeError) setFieldErrors(reason.fieldErrors);
      else await onSaved(reason instanceof Error ? reason.message : 'The password could not be changed.', true);
    } finally {
      setSavingPassword(false);
    }
  };
  const passwordInput = (key: keyof OwnerPasswordFields, label: string) => (
    <>
      <Text style={styles.label}>{label}</Text>
      {/* OW-30 c6: passwords are never displayed. */}
      <TextInput value={fields[key]} onChangeText={(value) => setField(key, value)} secureTextEntry autoComplete="off" accessibilityLabel={label} placeholder={label} style={styles.input} />
      {fieldErrors[key] ? <Text style={styles.errorText} accessibilityRole="alert">{fieldErrors[key]}</Text> : null}
    </>
  );
  return (
    <>
      <View style={styles.two}>
        <Panel title="Profile">
          {[
            ['Name', user.displayName],
            ['Email', user.email ?? '—'],
            ['Role', 'Owner'],
            ['Account ID', user.id],
          ].map(([label, value]) => (
            <View key={label} style={styles.line}>
              <Text style={styles.body}>{label}</Text>
              <Text style={styles.strong} selectable>{value}</Text>
            </View>
          ))}
        </Panel>
        <Panel title="Account settings">
          <Text style={styles.label}>Name</Text>
          <TextInput value={name} onChangeText={(value) => { setName(value); setNameError(''); }} accessibilityLabel="Name" placeholder="Your name" style={styles.input} />
          {nameError ? <Text style={styles.errorText} accessibilityRole="alert">{nameError}</Text> : null}
          <Text style={styles.muted}>The email address and role are managed by the system and cannot be changed here.</Text>
          <Pressable accessibilityRole="button" disabled={savingName} onPress={() => void saveName()} style={styles.outline}>
            <Text style={styles.outlineText}>{savingName ? 'Saving…' : 'Save account settings'}</Text>
          </Pressable>
        </Panel>
      </View>
      <Panel title="Security settings">
        <View style={{ maxWidth: 420 }}>
          {passwordInput('currentPassword', 'Current password')}
          {passwordInput('newPassword', 'New password (at least 8 characters)')}
          {passwordInput('confirmPassword', 'Confirm new password')}
          <Pressable accessibilityRole="button" disabled={savingPassword} onPress={() => void changePassword()} style={styles.loginButton}>
            <Text style={styles.loginButtonText}>{savingPassword ? 'Changing…' : 'Change password'}</Text>
          </Pressable>
        </View>
      </Panel>
    </>
  );
}

const C = { pink: '#EC1358', navy: '#0F1025', bg: '#F5F5F4', surface: '#FDFDFC', border: '#E3E3E6', muted: '#858591', danger: '#C92F3C' };
const styles = StyleSheet.create({ app: { flex: 1, flexDirection: 'row', backgroundColor: C.bg }, dark: { backgroundColor: '#171722' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, sidebar: { width: 250, backgroundColor: C.navy, padding: 24, paddingTop: 28 }, sidebarSmall: { width: 80, paddingHorizontal: 14 }, brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 42 }, logo: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.pink, color: '#fff', textAlign: 'center', paddingTop: 7, fontSize: 20, fontWeight: '800' }, brandName: { color: '#fff', fontSize: 19, fontWeight: '800' }, brandSub: { color: '#B2B3C4', fontSize: 8, letterSpacing: 1.3 }, menu: { color: '#777891', fontSize: 9, letterSpacing: 1.2, marginBottom: 12 }, nav: { minHeight: 42, borderRadius: 9, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 5 }, navActive: { backgroundColor: C.pink }, navIcon: { color: '#D1D1DB', width: 18, fontSize: 17, textAlign: 'center' }, navText: { color: '#D1D1DB', fontSize: 12, flex: 1 }, badge: { backgroundColor: '#FCA639', color: C.navy, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 2, fontSize: 9 }, profile: { borderTopWidth: 1, borderTopColor: '#292A43', paddingTop: 15, marginTop: 'auto' as any, flexDirection: 'row', gap: 9, alignItems: 'center' }, avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FCA639', color: C.navy, textAlign: 'center', paddingTop: 9, fontSize: 9, fontWeight: '800' }, profileName: { color: '#fff', fontSize: 11, fontWeight: '700' }, profileRole: { color: '#9999A5', fontSize: 8, maxWidth: 170 }, logout: { color: '#B2B3C4', paddingVertical: 12, fontSize: 11 }, main: { flex: 1, minWidth: 0 }, header: { minHeight: 100, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 38, paddingTop: 24, flexDirection: 'row', justifyContent: 'space-between' }, eyebrow: { color: '#9A9AA7', fontSize: 9, letterSpacing: 1.1 }, title: { color: C.navy, fontSize: 25, fontWeight: '800', marginTop: 5 }, headerActions: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, livePill: { alignSelf: 'flex-start', color: '#589144', backgroundColor: '#E8F6EC', borderRadius: 15, paddingHorizontal: 10, paddingVertical: 8, fontSize: 9, fontWeight: '800' }, iconButton: { backgroundColor: '#F5F5F4', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, content: { padding: 38, paddingBottom: 70 }, loadingRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 16 }, errorBanner: { backgroundColor: '#F9E4E8', padding: 13, borderRadius: 9, marginBottom: 16 }, errorText: { color: '#B9244C', fontSize: 11 }, toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, section: { color: C.navy, fontSize: 19, fontWeight: '800', marginBottom: 5 }, muted: { color: C.muted, fontSize: 10, lineHeight: 18 }, select: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 13, paddingVertical: 10, minWidth: 150 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginVertical: 18 }, metric: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 13, padding: 18, minWidth: 180, flex: 1 }, metricLabel: { color: '#777783', fontSize: 10, fontWeight: '700' }, metricValue: { color: C.navy, fontSize: 25, fontWeight: '800', marginVertical: 5 }, two: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, panel: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 13, padding: 20, flex: 1, minWidth: 290, marginBottom: 16 }, panelTitle: { color: C.navy, fontSize: 13, fontWeight: '800', marginBottom: 14 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#EEEEF0' }, body: { color: '#525260', fontSize: 11 }, strong: { color: C.navy, fontWeight: '700', fontSize: 11 }, pinkText: { color: C.pink, fontSize: 10, fontWeight: '700' }, search: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 12, width: 280, marginBottom: 16, fontSize: 11 }, table: { flexGrow: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 13, overflow: 'hidden', minWidth: 750 }, tableHead: { flexDirection: 'row', backgroundColor: '#F7F7F6', padding: 13 }, headCell: { flex: 1, paddingRight: 12, color: '#858591', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' }, tableRow: { flexDirection: 'row', padding: 14, borderTopWidth: 1, borderTopColor: '#EEEEF0', minHeight: 48 }, cell: { flex: 1, paddingRight: 12, color: '#525260', fontSize: 10 }, empty: { color: C.muted, textAlign: 'center', padding: 32 }, outline: { borderWidth: 1.5, borderColor: C.navy, backgroundColor: '#FFFFFF', borderRadius: 8, padding: 11, alignSelf: 'flex-start', marginTop: 16 }, outlineText: { color: C.navy, fontSize: 10, fontWeight: '700' }, dangerOutline: { borderColor: C.danger, backgroundColor: 'transparent' }, dangerText: { color: C.danger, fontSize: 10, fontWeight: '700' }, toast: { position: 'absolute', right: 24, bottom: 24, backgroundColor: C.navy, borderRadius: 9, padding: 13 }, toastText: { color: '#fff', fontSize: 11 }, login: { flex: 1, flexDirection: 'row', backgroundColor: C.navy }, loginPanel: { flex: 1, backgroundColor: C.bg, padding: 55, justifyContent: 'center' }, loginBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, position: 'absolute', top: 38, left: 55 }, kicker: { color: C.pink, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }, loginTitle: { color: C.navy, fontSize: 36, fontWeight: '800', marginTop: 17 }, loginSub: { color: C.muted, fontSize: 13, marginTop: 5 }, form: { maxWidth: 430, marginTop: 32 }, label: { color: '#525260', fontSize: 10, fontWeight: '700', marginTop: 14, marginBottom: 6 }, input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 13, fontSize: 12 }, variantFieldRow: { flexDirection: 'row', gap: 8 }, variantFieldWide: { flex: 2, minWidth: 0 }, variantFieldNarrow: { flex: 1, minWidth: 0 }, password: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingLeft: 13, flexDirection: 'row', alignItems: 'center' }, passwordInput: { flex: 1, paddingVertical: 13, fontSize: 12 }, loginButton: { backgroundColor: C.pink, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 }, loginButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' }, loginFooter: { color: C.muted, fontSize: 9, position: 'absolute', bottom: 35, left: 55 }, loginArt: { width: '38%', minWidth: 350, backgroundColor: C.pink, padding: 60, justifyContent: 'center' }, artEmoji: { fontSize: 76, marginBottom: 30 }, artTitle: { color: '#fff', fontSize: 31, fontWeight: '800', maxWidth: 300 }, artCopy: { color: '#FFD5E1', fontSize: 13, lineHeight: 21, maxWidth: 300 } });
