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
import { isOwnerPortalConnectionError, OWNER_PORTAL_CONNECTION_MESSAGE, ownerPortalErrorText } from './ownerPortalErrors';
import { portalPageState, type PortalDataset } from './ownerPortalPageState';
import { dashboardAlerts, dashboardStockCounts } from './ownerPortalDashboard';
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
  updateMinimumStock,
  updateNearExpirationDays,
  updateOwnerProfile,
  updateProduct,
  validateOwnerInventoryCountCorrection,
  validateOwnerSubmittedInventoryCount,
  type AppUser,
  type OwnerDiscrepancyReview,
  type ProductManagementItem,
  type SharedRecipeRecord,
} from '../services/takosync';
import { getConfiguredRecipeQuantity, getPerBottleRecipeQuantity } from '../services/batterRecipeQuantities';
import { standardProductVariants } from '../services/productCatalog';
import { getManilaReportingRange, manilaDateKey, type ReportingPeriod } from '../services/businessDaySettings';
import {
  filterOwnerPortalInventory,
  summarizeOwnerPortalBranches,
  type OwnerPortalBranch,
} from './ownerPortalBranches';
import { buildOwnerPortalInventoryRows, type OwnerPortalInventoryRow } from './ownerPortalInventory';
import { buildOwnerPortalVariantPrices } from './ownerPortalProducts';
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
  Reconciliation: ['reviews'],
  'Void & Reversal Review': [],
  'Staff Accounts': ['staff', 'inventory'],
  Branches: ['inventory', 'sales'],
  'Inventory Movements': ['activity', 'inventory'],
  'Audit History': ['activity', 'reviews', 'sales', 'inventory'],
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
  const [dataError, setDataError] = useState(''); const [query, setQuery] = useState(''); const [toast, setToast] = useState('');
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
  const visibleRows = filterOwnerPortalInventory(rows, branch).filter((row) =>
    row.name.toLowerCase().includes(query.toLowerCase()),
  );
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
        <Pressable accessibilityRole="button" onPress={() => setRestoreKey((key) => key + 1)} style={styles.outline}><Text style={styles.pinkText}>Retry</Text></Pressable>
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
                <Pressable accessibilityRole="button" onPress={() => setConfirmingLogout(false)} style={styles.outline}><Text style={styles.pinkText}>Cancel</Text></Pressable>
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
          {page === 'Inventory Monitoring' && <Inventory rows={visibleRows} branch={branch} setBranch={setBranch} branches={inventoryData?.branches ?? []} query={query} setQuery={setQuery} />}
          {page === 'Inventory Movements' && <Movements activity={activityData?.transactions ?? []} branches={inventoryData?.branches ?? []} inventoryRows={rows} />}
          {page === 'Reconciliation' && <Checks reviews={reviews} notify={notify} onRefresh={refreshReviews} />}
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
          {page === 'Profile' && <ProfileEditor user={user} onSaved={notify} />}
          {page === 'Audit History' && <Audit activity={activityData} reviews={reviews} sales={salesData} branches={inventoryData?.branches ?? []} inventoryRows={rows} />}
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
  const shownAlerts = showAllAlerts ? alerts : alerts.slice(0, 10);

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
          ['Low-Stock Alerts', inventoryAvailable ? String(alerts.filter((alert) => alert.type === 'Low stock' || alert.type === 'Out of stock').length) : '—', 'Low or out of stock'],
          ['Expiration Alerts', inventoryAvailable ? String(alerts.filter((alert) => alert.type === 'Near expiry' || alert.type === 'Expired').length) : '—', 'Near expiry or expired'],
        ].map(([label, value, note]) => (
          <View style={styles.metric} key={label}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={styles.metricValue}>{value}</Text>
            <Text style={styles.muted}>{note}</Text>
          </View>
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
              <Text style={styles.pinkText}>Open Reconciliation{pendingReviews.length > visibleReviews.length ? ` (${pendingReviews.length} pending)` : ''} →</Text>
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
        <Panel title="Low-stock and expiration alerts">
          {!inventoryAvailable ? <Text style={styles.muted}>Inventory data is unavailable.</Text> : alerts.length ? (
            <>
              <Table headers={['Ingredient', 'Branch', 'Alert', 'Details']} rows={shownAlerts.map((alert) => [alert.ingredient, alert.branch, alert.type, alert.detail])} />
              {alerts.length > 10 ? (
                <Pressable accessibilityRole="button" onPress={() => setShowAllAlerts((value) => !value)} style={[styles.outline, { alignSelf: 'flex-start' }]}>
                  <Text style={styles.pinkText}>{showAllAlerts ? 'Show fewer' : `Show all ${alerts.length} alerts`}</Text>
                </Pressable>
              ) : null}
            </>
          ) : <Text style={styles.empty}>No low-stock or expiration alerts.</Text>}
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
          <Text style={styles.pinkText}>Reset</Text>
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
              <Pressable accessibilityRole="button" onPress={() => setSelectedSaleId(null)} style={[styles.outline, { alignSelf: 'flex-start' }]}><Text style={styles.pinkText}>Close details</Text></Pressable>
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

function Inventory({ rows, branch, setBranch, branches, query, setQuery }: { rows: InventoryRow[]; branch: string; setBranch: (value: string) => void; branches: OwnerPortalBranch[]; query: string; setQuery: (value: string) => void }) {
  return (
    <>
      <Toolbar branch={branch} setBranch={setBranch} branches={branches} />
      <TextInput value={query} onChangeText={setQuery} placeholder="Search live ingredients..." style={styles.search} />
      <Table
        headers={['Ingredient', 'Category', 'Branch', 'Quantity', 'Status', 'Expiration', 'Active batches']}
        rows={rows.map((row) => [row.name, row.category, row.branch, `${row.quantityLabel} ${row.unit}`, row.status, row.expiry, row.batches])}
      />
      {/* OW-04 c10 / OW-31 c9 */}
      {rows.length === 0 ? <Text style={styles.empty}>{query.trim() ? `No ingredients match “${query.trim()}”.` : 'No inventory items for this branch yet.'}</Text> : null}
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
  notify: (message: string, isError?: boolean) => void;
  onRefresh: () => Promise<void>;
};

function Checks({ reviews, notify, onRefresh }: ChecksProps) {
  const [saving, setSaving] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const runAction = async (
    review: OwnerDiscrepancyReview,
    action: 'approved' | 'rejected' | 'validate',
  ) => {
    const reason = reasons[review.countLineId]?.trim() ?? '';
    if (!reason) {
      notify('Enter a reason before submitting this review.', true);
      return;
    }

    if (action === 'validate' && typeof window !== 'undefined') {
      const message = `Authorize this count for ${review.ingredient}? Expected: ${review.expected} ${review.unit}; actual: ${review.actual} ${review.unit}. Inventory may change.`;
      if (!window.confirm(message)) return;
    }

    setSaving(review.countLineId);
    let successMessage: string;
    try {
      if (action === 'approved' || action === 'rejected') {
        await decideOwnerInventoryCountCorrection({
          requestId: review.correctionRequestId,
          decision: action,
          reason,
        });
        successMessage = `Correction request ${action}.`;
      } else {
        if (review.validationTarget === 'correction_request') {
          await validateOwnerInventoryCountCorrection({
            requestId: review.correctionRequestId,
            reason,
          });
        } else {
          await validateOwnerSubmittedInventoryCount({
            countLineId: review.countLineId,
            reason,
          });
        }
        successMessage = 'Count validated through the authorized inventory workflow.';
      }
    } catch (reasonError: unknown) {
      notify(reasonError instanceof Error ? reasonError.message : 'Unable to save the Owner review.', true);
      setSaving(null);
      return;
    }

    try {
      await onRefresh();
      setReasons((current) => ({ ...current, [review.countLineId]: '' }));
      notify(successMessage);
    } catch (refreshError: unknown) {
      notify(
        `The review was saved, but the latest records could not be loaded: ${
          refreshError instanceof Error ? refreshError.message : 'refresh failed.'
        }`,
        true,
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <Text style={styles.section}>Daily checks & reconciliation</Text>
      <Text style={styles.muted}>Review submitted counts; validating a count is a separate, authorized inventory action.</Text>
      {reviews.map((review) => {
        const actionable = isOwnerDiscrepancyActionable(review);
        const validatable = isOwnerDiscrepancyValidatable(review);
        const isSaving = saving === review.countLineId;
        const disabled = saving !== null;

        return (
          <View style={reviewStyles.card} key={review.correctionRequestId}>
            <View style={styles.row}>
              <Text style={styles.strong}>{review.reference} · {review.ingredient}</Text>
              <Text style={styles.body}>{review.branch}</Text>
            </View>
            <Text style={styles.muted}>
              Expected {review.expected} {review.unit} · Actual {review.actual} {review.unit} · Difference {review.difference} {review.unit}
            </Text>
            <Text style={styles.muted}>Status: {review.status}</Text>
            {actionable || validatable ? (
              <>
                <TextInput
                  accessibilityLabel={`Owner review reason for ${review.ingredient}`}
                  value={reasons[review.countLineId] ?? ''}
                  onChangeText={(value) => setReasons((current) => ({
                    ...current,
                    [review.countLineId]: value,
                  }))}
                  placeholder="Reason required for this action"
                  maxLength={1000}
                  style={styles.search}
                />
                <View style={reviewStyles.actions}>
                  {actionable ? (
                    <>
                      <Pressable
                        disabled={disabled}
                        onPress={() => void runAction(review, 'approved')}
                        style={[reviewStyles.approve, disabled && { opacity: 0.6 }]}
                      >
                        <Text style={reviewStyles.approveText}>{isSaving ? 'Saving…' : 'Approve'}</Text>
                      </Pressable>
                      <Pressable
                        disabled={disabled}
                        onPress={() => void runAction(review, 'rejected')}
                        style={[reviewStyles.reject, disabled && { opacity: 0.6 }]}
                      >
                        <Text style={reviewStyles.rejectText}>Reject</Text>
                      </Pressable>
                    </>
                  ) : null}
                  {validatable ? (
                    <Pressable
                      disabled={disabled}
                      onPress={() => void runAction(review, 'validate')}
                      style={[reviewStyles.approve, disabled && { opacity: 0.6 }]}
                    >
                      <Text style={reviewStyles.approveText}>
                        {isSaving ? 'Saving…' : 'Validate Count'}
                      </Text>
                    </Pressable>
                  ) : isOwnerDiscrepancyValidationBlocked(review) ? (
                    // OW-25 / OM-14 c8: shown but disabled while the correction request is pending.
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: true }}
                      accessibilityHint={VALIDATION_BLOCKED_MESSAGE}
                      disabled
                      style={[reviewStyles.approve, { opacity: 0.45 }]}
                    >
                      <Text style={reviewStyles.approveText}>Validate Count</Text>
                    </Pressable>
                  ) : null}
                </View>
                {!validatable && isOwnerDiscrepancyValidationBlocked(review) ? <Text style={[styles.muted, { marginTop: 6 }]}>{VALIDATION_BLOCKED_MESSAGE}</Text> : null}
              </>
            ) : null}
          </View>
        );
      })}
      {reviews.length === 0 && <Text style={styles.empty}>No discrepancy records returned.</Text>}
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
  // OW-10: the sales whose void request was approved in the period.
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
              style={[styles.outline, { marginTop: 0 }, inventoryView === view && { backgroundColor: C.pink }]}
            >
              <Text style={[styles.pinkText, inventoryView === view && { color: '#fff' }]}>{view}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {reportDoc ? <ReportPreview doc={reportDoc} /> : null}
    </>
  );
}

function StaffPage({ accounts }: any) { const [saving, setSaving] = useState<string | null>(null); const toggle = async (account: any) => { setSaving(account.id); try { await saveStaffAccount({ id: account.id, username: account.username, branchId: account.branch_id, active: !account.active }); } catch { /* the caller reloads accounts on the next session refresh */ } finally { setSaving(null); } }; return <><Text style={styles.section}>Staff accounts</Text><Text style={styles.muted}>Employee IDs are generated by Supabase and are also the initial passwords for new or explicitly reset Staff accounts.</Text><Table headers={['Employee ID', 'Name', 'Branch', 'Status', 'Created', 'Action']} rows={accounts.map((account: any) => [account.employee_id, account.full_name, account.branch_name ?? account.branch_id, account.active ? 'Active' : 'Inactive', new Date(account.created_at).toLocaleDateString(), saving === account.id ? 'Saving…' : 'Toggle status'])} /><View>{accounts.map((account: any) => <Pressable key={account.id} onPress={() => void toggle(account)} style={styles.outline}><Text style={styles.pinkText}>{account.active ? `Deactivate ${account.full_name}` : `Activate ${account.full_name}`}</Text></Pressable>)}</View></>; }
function Settings({ products, configuration, stockSettings, onSaved }: any) { const [selected, setSelected] = useState<any>(null); const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [price, setPrice] = useState('0'); const [ingredientName, setIngredientName] = useState(''); const [unit, setUnit] = useState('kg'); const [days, setDays] = useState(String(stockSettings?.nearExpirationDays ?? 7)); const [saving, setSaving] = useState(false); const saveProduct = async () => { setSaving(true); try { const variants = selected?.variants?.map((variant: any) => ({ id: variant.id, price: Number(price) })) ?? [{ variant_code: '4pcs', size_label: '4 PCS', piece_count: 4, price: Number(price) }, { variant_code: '8pcs', size_label: '8 PCS', piece_count: 8, price: Number(price) }, { variant_code: '10plus1pcs', size_label: '10+1 PCS', piece_count: 11, price: Number(price) }]; if (selected) await updateProduct(selected.id, { product_name: name, description, is_available: true, variants }); else await createProduct({ product_name: name, description, is_available: true, variants }); onSaved('Product saved through the existing catalog service.'); } catch (reason: unknown) { onSaved(reason instanceof Error ? reason.message : 'Product save failed.'); } finally { setSaving(false); } }; const saveIngredient = async () => { setSaving(true); try { if (selected?.ingredient) await updateIngredient(selected.ingredient.id, { name: ingredientName, category_id: selected.ingredient.category_id, unit }); else await createIngredient({ name: ingredientName, category_id: configuration?.categories?.[0]?.id ?? '', unit }); onSaved('Ingredient saved through Supabase.'); } catch (reason: unknown) { onSaved(reason instanceof Error ? reason.message : 'Ingredient save failed.'); } finally { setSaving(false); } }; const saveDays = async () => { setSaving(true); try { await updateNearExpirationDays(Number(days)); onSaved('Expiration alert period updated.'); } catch (reason: unknown) { onSaved(reason instanceof Error ? reason.message : 'Settings save failed.'); } finally { setSaving(false); } }; return <><Text style={styles.section}>Settings & configuration</Text><Text style={styles.muted}>Live catalog, recipe, ingredient, and threshold configuration.</Text><View style={styles.grid}><Panel title="Products & Menu"><Text style={styles.muted}>Create or edit products without changing historical sales.</Text>{products.map((product: any) => <Pressable key={product.id} onPress={() => { setSelected(product); setName(product.product_name); setDescription(product.description); setPrice(String(product.price)); }}><Text style={styles.pinkText}>{product.product_name} · {product.is_available ? 'Available' : 'Unavailable'}</Text></Pressable>)}<TextInput value={name} onChangeText={setName} placeholder="Product name" style={styles.input} /><TextInput value={description} onChangeText={setDescription} placeholder="Description" style={styles.input} /><TextInput value={price} onChangeText={setPrice} placeholder="4 PCS selling price" keyboardType="decimal-pad" style={styles.input} /><Pressable disabled={saving} onPress={() => void saveProduct()} style={styles.loginButton}><Text style={styles.loginButtonText}>{saving ? 'Saving…' : selected ? 'Save product' : 'Add product'}</Text></Pressable></Panel><Panel title="Ingredients & Recipes"><Text style={styles.muted}>{configuration?.ingredients.length ?? 0} ingredients · {configuration?.recipeIngredients.length ?? 0} recipe lines</Text><TextInput value={ingredientName} onChangeText={setIngredientName} placeholder="Ingredient or supply name" style={styles.input} /><TextInput value={unit} onChangeText={setUnit} placeholder="Unit of measurement" style={styles.input} /><Pressable disabled={saving} onPress={() => void saveIngredient()} style={styles.outline}><Text style={styles.pinkText}>{saving ? 'Saving…' : 'Add ingredient'}</Text></Pressable><Text style={styles.muted}>Recipe edits use saveProductRecipe and affect future calculations only.</Text></Panel><Panel title="Prepared Batter"><Text style={styles.body}>5 bottles per batch · 25 pieces per bottle.</Text><Text style={styles.muted}>Raw ingredients are consumed during preparation; sales consume prepared batter only.</Text></Panel><Panel title="Stock thresholds & expiration"><Text style={styles.body}>{stockSettings?.nearExpirationDays ?? '—'} day near-expiration alert period</Text><TextInput value={days} onChangeText={setDays} keyboardType="number-pad" style={styles.input} /><Pressable disabled={saving} onPress={() => void saveDays()} style={styles.outline}><Text style={styles.pinkText}>Save alert period</Text></Pressable><Text style={styles.muted}>{stockSettings?.inventory.length ?? 0} inventory thresholds loaded. Per-item minimum stock editing remains available through updateMinimumStock.</Text></Panel></View></>; }
function Audit({ activity, reviews, sales, branches, inventoryRows }: {
  activity: Awaited<ReturnType<typeof loadOwnerActivityData>> | null;
  reviews: Awaited<ReturnType<typeof loadOwnerDiscrepancyReviews>>;
  sales: Awaited<ReturnType<typeof loadOwnerSalesData>> | null;
  branches: OwnerPortalBranch[];
  inventoryRows: InventoryRow[];
}) {
  const [filter, setFilter] = useState('All activity');
  const transactions = (activity?.transactions ?? []).filter((item) =>
    filter === 'All activity' || item.type === filter,
  );
  const logs = activity?.auditLogs ?? [];
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
  const confirmedSales = sales ? filterOwnerPortalConfirmedSales(sales.sales) : null;
  const saleRows = (confirmedSales ?? []).map((sale) => [
    sale.transaction_reference,
    branchNames.get(sale.branch_id) ?? sale.branch_id,
    sale.recorded_by_name ?? 'Employee unavailable',
    sale.payment_method,
    dateFormatter.format(new Date(sale.created_at)),
    peso(Number(sale.total_amount)),
  ]);
  const countRows = (activity?.dailyChecks ?? []).flatMap((check) =>
    (activity?.countLines ?? [])
      .filter((line) => line.daily_stock_check_id === check.id)
      .map((line) => [
        check.reference,
        branchNames.get(check.branch_id) ?? check.branch_id,
        itemNames.get(`${check.branch_id}:${line.ingredient_id}`) ?? line.ingredient_id,
        `${line.recorded_quantity} ${line.unit}`,
        `${line.physical_quantity} ${line.unit}`,
        `${line.difference} ${line.unit}`,
        check.status,
        line.inventory_revision == null ? '—' : String(line.inventory_revision),
        check.submitted_by_name,
        dateFormatter.format(new Date(check.created_at)),
      ]),
  );
  const discrepancyRows = reviews.map((review) => [
    review.reference,
    review.branch,
    review.ingredient,
    `${review.expected} ${review.unit}`,
    `${review.actual} → ${review.correctedActual} ${review.unit}`,
    review.status,
    review.staff,
    review.decisionOwner ?? '—',
    review.decisionReason ?? review.correctionReason,
    dateFormatter.format(new Date(review.decisionAt ?? review.submittedAt)),
  ]);
  const adjustmentRows = reviews.flatMap((review) => review.adjustment ? [[
    review.adjustment.movementReference,
    review.reference,
    review.branch,
    review.ingredient,
    `${review.adjustment.beforeQuantity} → ${review.adjustment.afterQuantity} ${review.unit}`,
    review.adjustment.reason,
    review.adjustment.approvingOwner,
    dateFormatter.format(new Date(review.adjustment.approvedAt)),
  ]] : []);

  return (
    <>
      <View style={styles.row}>
        <View>
          <Text style={styles.section}>Audit history</Text>
          <Text style={styles.muted}>Completed sales, inventory movements, submitted counts, reviews, and authorized adjustments from Supabase.</Text>
        </View>
        <Select value={filter} options={['All activity', 'stock_in', 'sales_consumption', 'waste', 'spoilage', 'adjustment']} onChange={setFilter} />
      </View>
      {filter === 'All activity' ? (
        <>
          <Text style={styles.panelTitle}>Confirmed sales</Text>
          {sales === null ? <Text style={styles.muted}>Sales history is unavailable.</Text> : saleRows.length ? (
            <Table headers={['Transaction Reference', 'Branch', 'Employee', 'Payment', 'Timestamp (Manila)', 'Total']} rows={saleRows} />
          ) : <Text style={styles.empty}>No confirmed sales were returned for this period.</Text>}
        </>
      ) : null}
      <Text style={styles.panelTitle}>Inventory transactions</Text>
      {activity === null ? <Text style={styles.muted}>Inventory transaction history is unavailable.</Text> : transactions.length ? (
        <Table
          headers={['Reference', 'Type', 'Branch', 'Ingredient', 'Quantity', 'Employee', 'Timestamp (Manila)']}
          rows={transactions.map((item) => [
            item.reference,
            item.type,
            branchNames.get(item.branch_id) ?? item.branch_id,
            itemNames.get(`${item.branch_id}:${item.ingredient_id}`) ?? item.ingredient_id,
            `${item.quantity} ${item.unit}`,
            item.actor_name,
            dateFormatter.format(new Date(item.transaction_date)),
          ])}
        />
      ) : <Text style={styles.empty}>No inventory transactions were returned for this period.</Text>}
      {filter === 'All activity' ? (
        <>
          <Text style={styles.panelTitle}>Physical count history and revisions</Text>
          {activity === null ? <Text style={styles.muted}>Physical count history is unavailable.</Text> : countRows.length ? (
            <Table headers={['Count Reference', 'Branch', 'Ingredient', 'Expected', 'Physical', 'Difference', 'Status', 'Inventory Revision', 'Submitted By', 'Timestamp (Manila)']} rows={countRows} />
          ) : <Text style={styles.empty}>No physical counts were returned for this period.</Text>}
          <Text style={styles.panelTitle}>Discrepancy review history</Text>
          {reviews.length ? (
            <Table headers={['Count Reference', 'Branch', 'Ingredient', 'Expected', 'Actual → Corrected', 'Status', 'Submitted By', 'Reviewed By', 'Review Detail', 'Timestamp (Manila)']} rows={discrepancyRows} />
          ) : <Text style={styles.empty}>No discrepancy review history was returned.</Text>}
          <Text style={styles.panelTitle}>Authorized adjustments</Text>
          {adjustmentRows.length ? (
            <Table headers={['Movement Reference', 'Count Reference', 'Branch', 'Ingredient', 'Before → After', 'Reason', 'Approving Owner', 'Authorized At (Manila)']} rows={adjustmentRows} />
          ) : <Text style={styles.empty}>No authorized adjustments were returned.</Text>}
          {logs.length ? (
            <>
              <Text style={styles.panelTitle}>Audit log events</Text>
              <Table headers={['Action', 'Branch', 'Description', 'Actor', 'Timestamp (Manila)']} rows={logs.map((log) => [
                log.action,
                log.branch_id ? branchNames.get(log.branch_id) ?? log.branch_id : '—',
                log.description,
                log.actor_name,
                dateFormatter.format(new Date(log.created_at)),
              ])} />
            </>
          ) : null}
        </>
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
      <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.outline, { marginTop: 0 }]}><Text style={styles.pinkText}>Retry</Text></Pressable>
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
      {onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.outline, { marginTop: 0 }]}><Text style={styles.pinkText}>Retry</Text></Pressable> : null}
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
        <Text style={styles.pinkText}>Print</Text>
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
        <Text style={styles.pinkText}>Export PDF</Text>
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
    <Pressable disabled={saving} onPress={() => void save()} style={styles.loginButton}><Text style={styles.loginButtonText}>{saving ? 'Saving…' : editing ? 'Save staff account' : 'Create staff account'}</Text></Pressable>
    {createdAccount?.employee_id ? <Panel title="New Staff credentials"><Text style={styles.muted}>Employee ID / initial password</Text><Text style={styles.metricValue} selectable>{createdAccount.employee_id}</Text><Pressable onPress={() => void copyEmployeeId()} style={styles.outline}><Text style={styles.pinkText}>Copy Employee ID</Text></Pressable>{copyMessage ? <Text style={styles.muted}>{copyMessage}</Text> : null}</Panel> : null}
    {/* OW-27 c1, c9: status (Active / Inactive) and lock status (Locked until … / Not locked). */}
    {accounts.length === 0 ? <Text style={styles.empty}>No staff accounts yet. Create the first one above.</Text> : null}
    <Table headers={['Employee ID', 'Username', 'Name', 'Branch', 'Status', 'Lock status']} rows={accounts.map((account) => [account.employee_id, account.username, account.full_name, account.branch_name ?? account.branch_id, account.active ? 'Active' : 'Inactive', staffLockStatus(account).label])} />
    {resetTarget ? (
      <Panel title="Reset password?">
        <Text style={styles.body}>{staffPasswordResetPrompt(resetTarget)}</Text>
        <View style={styles.line}>
          <Pressable disabled={resetting} onPress={() => setResetTarget(null)} style={styles.outline}><Text style={styles.pinkText}>Cancel</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Confirm password reset" disabled={resetting} onPress={() => void confirmReset()} style={styles.loginButton}><Text style={styles.loginButtonText}>{resetting ? 'Resetting…' : 'Reset password'}</Text></Pressable>
        </View>
      </Panel>
    ) : null}
    {accounts.map((account) => <View key={account.id} style={styles.line}><Text style={styles.body}>{account.full_name} · {account.employee_id}</Text><Pressable disabled={savingAccountId !== null || saving} onPress={() => { setEditing(account); setUsername(account.username); setBranchId(account.branch_id); }}><Text style={styles.pinkText}>Edit account</Text></Pressable><Pressable disabled={savingAccountId !== null || saving} onPress={() => void toggleAccount(account)}><Text style={styles.pinkText}>{savingAccountId === account.id ? 'Saving…' : account.active ? 'Deactivate' : 'Activate'}</Text></Pressable>{account.active ? <Pressable accessibilityRole="button" accessibilityLabel={`Reset password for ${account.full_name || account.username}`} disabled={savingAccountId !== null || saving || resetting} onPress={() => setResetTarget(account)}><Text style={styles.pinkText}>Reset password</Text></Pressable> : null}</View>)}
  </>;
}
function LegacySettingsEditor({ products, configuration, stockSettings, onSaved }: any) {
  const [productId, setProductId] = useState(products[0]?.id ?? ''); const [ingredientId, setIngredientId] = useState(configuration?.ingredients?.[0]?.id ?? '');
  const [recipeQty, setRecipeQty] = useState('1'); const [recipeUnit, setRecipeUnit] = useState('kg'); const [thresholdId, setThresholdId] = useState(stockSettings?.inventory?.[0]?.ingredient_id ?? ''); const [thresholdBranch, setThresholdBranch] = useState(stockSettings?.inventory?.[0]?.branch_id ?? ''); const [threshold, setThreshold] = useState('0'); const [days, setDays] = useState(String(stockSettings?.nearExpirationDays ?? 7)); const [saving, setSaving] = useState(false);
  const saveRecipe = async () => { if (!productId || !ingredientId) { onSaved('Choose a product and ingredient first.'); return; } setSaving(true); try { const existing = configuration.recipeIngredients.filter((line: any) => line.product_id === productId && line.ingredient_id !== ingredientId).map((line: any) => ({ ingredient_id: line.ingredient_id, quantity_required: Number(line.quantity_required), unit_of_measure: line.unit_of_measure })); await saveProductRecipe(productId, [...existing, { ingredient_id: ingredientId, quantity_required: Number(recipeQty), unit_of_measure: recipeUnit }]); onSaved('Recipe line saved for future sales calculations.'); } catch (reason: unknown) { onSaved(reason instanceof Error ? reason.message : 'Recipe save failed.'); } finally { setSaving(false); } };
  const saveThreshold = async () => { if (!thresholdBranch || !thresholdId) { onSaved('Choose a branch inventory record first.'); return; } setSaving(true); try { await updateMinimumStock(thresholdBranch, thresholdId, Number(threshold)); onSaved('Minimum stock threshold updated. Refreshing live inventory is required to recalculate status.'); } catch (reason: unknown) { onSaved(reason instanceof Error ? reason.message : 'Threshold save failed.'); } finally { setSaving(false); } };
  const saveDays = async () => { const parsed = Number(days); if (!Number.isInteger(parsed) || parsed < 0) { onSaved('Expiration alert period must be a non-negative whole number of days.'); return; } setSaving(true); try { await updateNearExpirationDays(parsed); onSaved('Expiration alert period updated.'); } catch (reason: unknown) { onSaved(reason instanceof Error ? reason.message : 'Expiration settings save failed.'); } finally { setSaving(false); } };
  return <><Text style={styles.section}>Settings & configuration</Text><Text style={styles.muted}>Existing authorized operations only. No purchase orders are created.</Text><View style={styles.grid}><Panel title="Product recipes"><Text style={styles.muted}>Configure one ingredient line at a time; saved lines affect future calculations only.</Text><Select value={products.find((item: any) => item.id === productId)?.product_name ?? 'Choose product'} options={products.map((item: any) => item.product_name)} onChange={(value) => setProductId(products.find((item: any) => item.product_name === value)?.id ?? '')} /><Select value={configuration?.ingredients.find((item: any) => item.id === ingredientId)?.name ?? 'Choose ingredient'} options={(configuration?.ingredients ?? []).map((item: any) => item.name)} onChange={(value) => setIngredientId(configuration.ingredients.find((item: any) => item.name === value)?.id ?? '')} /><TextInput value={recipeQty} onChangeText={setRecipeQty} keyboardType="decimal-pad" placeholder="Required quantity" style={styles.input} /><TextInput value={recipeUnit} onChangeText={setRecipeUnit} placeholder="Unit of measurement" style={styles.input} /><Pressable disabled={saving} onPress={() => void saveRecipe()} style={styles.loginButton}><Text style={styles.loginButtonText}>{saving ? 'Saving…' : 'Save recipe line'}</Text></Pressable><Text style={styles.muted}>Prepared batter remains a separate inventory item. Existing backend rules enforce 5 bottles × 25 pieces.</Text></Panel><Panel title="Minimum stock thresholds"><Text style={styles.muted}>Update the threshold for a specific branch and ingredient.</Text><Select value={thresholdBranch ? 'Selected branch inventory' : 'Choose inventory record'} options={['Choose inventory record', ...(stockSettings?.inventory ?? []).map((item: any) => `${item.branch_id} · ${item.ingredient_id}`)]} onChange={(value) => { const match = (stockSettings?.inventory ?? []).find((item: any) => `${item.branch_id} · ${item.ingredient_id}` === value); if (match) { setThresholdBranch(match.branch_id); setThresholdId(match.ingredient_id); setThreshold(String(match.minimum_stock)); } }} /><TextInput value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" placeholder="Minimum stock" style={styles.input} /><Pressable disabled={saving} onPress={() => void saveThreshold()} style={styles.outline}><Text style={styles.pinkText}>{saving ? 'Saving…' : 'Save threshold'}</Text></Pressable></Panel><Panel title="Prepared batter rules"><Text style={styles.body}>1 batch = 5 bottles = 125 pieces.</Text><Text style={styles.muted}>Raw ingredients are deducted during preparation; completed sales consume prepared batter and do not deduct raw batter ingredients again.</Text></Panel><Panel title="Expiration alerts"><Text style={styles.body}>{stockSettings?.nearExpirationDays ?? '—'} day alert period</Text><TextInput value={days} onChangeText={setDays} keyboardType="number-pad" placeholder="Alert days" style={styles.input} /><Pressable disabled={saving} onPress={() => void saveDays()} style={styles.outline}><Text style={styles.pinkText}>{saving ? 'Saving…' : 'Save alert period'}</Text></Pressable><Text style={styles.muted}>Uses the existing owner-authorized inventory settings operation. Purchase orders are never created automatically.</Text></Panel></View></>;
}

function OwnerProductEditor({ products, onSaved }: {
  products: ProductManagementItem[];
  onSaved: OwnerPortalNotify;
}) {
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [available, setAvailable] = useState(true);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({
    '4pcs': '',
    '8pcs': '',
    '10plus1pcs': '',
  });
  // OW-21 c4: maximum quantity per order for each size; blank = no maximum.
  const [maxQuantityDrafts, setMaxQuantityDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const selectedProduct = products.find((product) => product.id === productId);

  useEffect(() => {
    if (!selectedProduct) {
      setName('');
      setDescription('');
      setAvailable(true);
      setPriceDrafts({ '4pcs': '', '8pcs': '', '10plus1pcs': '' });
      setMaxQuantityDrafts({});
      return;
    }

    setName(selectedProduct.product_name);
    setDescription(selectedProduct.description);
    setAvailable(selectedProduct.is_available);
    setPriceDrafts(Object.fromEntries(standardProductVariants.map((variant) => {
      const current = selectedProduct.variants.find((item) => item.variant_code === variant.variant_code);
      return [variant.variant_code, current ? String(current.price) : ''];
    })));
    setMaxQuantityDrafts(Object.fromEntries(standardProductVariants.map((variant) => {
      const current = selectedProduct.variants.find((item) => item.variant_code === variant.variant_code);
      return [variant.variant_code, current?.max_order_quantity ? String(current.max_order_quantity) : ''];
    })));
  }, [selectedProduct]);

  const save = async () => {
    setSaving(true);
    try {
      const variantPrices = buildOwnerPortalVariantPrices(priceDrafts, standardProductVariants, maxQuantityDrafts);
      const productInput = {
        product_name: name,
        description,
        is_available: available,
      };

      if (selectedProduct) {
        const missingVariant = standardProductVariants.find((variant) =>
          !selectedProduct.variants.some((current) => current.variant_code === variant.variant_code),
        );
        if (missingVariant) {
          throw new Error(`Cannot edit this product because its ${missingVariant.size_label} variant is missing.`);
        }
        const builtByCode = new Map(variantPrices.map((variant) => [variant.variant_code, variant]));
        await updateProduct(selectedProduct.id, {
          ...productInput,
          variants: selectedProduct.variants.map((variant) => {
            const built = builtByCode.get(variant.variant_code);
            return {
              id: variant.id,
              price: built?.price ?? variant.price,
              ...(built ? { max_order_quantity: built.max_order_quantity ?? null } : {}),
            };
          }),
        });
      } else {
        await createProduct({ ...productInput, variants: variantPrices });
      }

      await onSaved(selectedProduct ? 'Product updated through Supabase.' : 'Product created through Supabase.');
      if (!selectedProduct) setProductId('');
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'Product save failed.', true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Products & menu">
      <Text style={styles.muted}>Create products or edit each variant price and product availability independently.</Text>
      {products.map((product) => (
        <Pressable
          key={product.id}
          accessibilityRole="button"
          onPress={() => setProductId(product.id)}
          style={styles.line}
        >
          <Text style={styles.body}>{product.product_name} · {product.is_available ? 'Available' : 'Unavailable'}</Text>
          <Text style={styles.pinkText}>{productId === product.id ? 'Selected' : 'Edit'}</Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" onPress={() => setProductId('')} style={styles.outline}>
        <Text style={styles.pinkText}>Add product</Text>
      </Pressable>
      <TextInput value={name} onChangeText={setName} placeholder="Product name" style={styles.input} />
      <TextInput value={description} onChangeText={setDescription} placeholder="Description" style={styles.input} />
      {standardProductVariants.map((variant) => (
        <View key={variant.variant_code} style={styles.variantFieldRow}>
          <TextInput
            value={priceDrafts[variant.variant_code]}
            onChangeText={(value) => setPriceDrafts((current) => ({
              ...current,
              [variant.variant_code]: value,
            }))}
            keyboardType="decimal-pad"
            placeholder={`${variant.size_label} selling price`}
            accessibilityLabel={`${variant.size_label} selling price`}
            style={[styles.input, styles.variantFieldWide]}
          />
          <TextInput
            value={maxQuantityDrafts[variant.variant_code] ?? ''}
            onChangeText={(value) => setMaxQuantityDrafts((current) => ({
              ...current,
              [variant.variant_code]: value,
            }))}
            keyboardType="number-pad"
            placeholder="Max per order"
            accessibilityLabel={`${variant.size_label} maximum quantity per order, leave blank for no maximum`}
            style={[styles.input, styles.variantFieldNarrow]}
          />
        </View>
      ))}
      <Text style={styles.muted}>Max per order limits how many of a size one order can hold. Leave it blank for no limit.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ checked: available }}
        onPress={() => setAvailable((current) => !current)}
        style={styles.outline}
      >
        <Text style={styles.pinkText}>{available ? 'Available to Staff' : 'Unavailable to Staff'} · tap to toggle</Text>
      </Pressable>
      <Pressable disabled={saving} onPress={() => void save()} style={styles.loginButton}>
        <Text style={styles.loginButtonText}>{saving ? 'Saving…' : selectedProduct ? 'Save product' : 'Create product'}</Text>
      </Pressable>
    </Panel>
  );
}

function IngredientConfigurationEditor({ configuration, onSaved }: {
  configuration: Awaited<ReturnType<typeof loadIngredientRecipeConfiguration>> | null;
  onSaved: OwnerPortalNotify;
}) {
  const [ingredientId, setIngredientId] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unit, setUnit] = useState('kg');
  const [categoryName, setCategoryName] = useState('');
  const [savingIngredient, setSavingIngredient] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const ingredients = configuration?.ingredients ?? [];
  const categories = configuration?.categories ?? [];
  const selectedIngredient = ingredients.find((item) => item.id === ingredientId);
  const unitOptions = [...new Set(['g', 'kg', 'ml', 'L', 'pcs', 'bottle', 'pack', 'tsp', 'tbsp', unit])];

  const selectIngredient = (value: string) => {
    const selected = ingredients.find((item) => item.name === value);
    setIngredientId(selected?.id ?? '');
    setName(selected?.name ?? '');
    setCategoryId(selected?.category_id ?? categories[0]?.id ?? '');
    setUnit(selected?.unit ?? 'kg');
  };

  const saveIngredient = async () => {
    if (!configuration) {
      await onSaved('Ingredient configuration is unavailable.', true);
      return;
    }
    if (!name.trim() || !categoryId || !unit.trim()) {
      await onSaved('Enter an ingredient name, category, and unit.', true);
      return;
    }
    setSavingIngredient(true);
    try {
      if (ingredientId) {
        await updateIngredient(ingredientId, { name, category_id: categoryId, unit });
      } else {
        await createIngredient({ name, category_id: categoryId, unit });
      }
      await onSaved(ingredientId ? 'Ingredient updated.' : 'Ingredient created.');
      setIngredientId('');
      setName('');
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'Ingredient save failed.', true);
    } finally {
      setSavingIngredient(false);
    }
  };

  const saveCategory = async () => {
    if (!categoryName.trim()) {
      await onSaved('Enter a category name.', true);
      return;
    }
    setSavingCategory(true);
    try {
      const category = await createIngredientCategory(categoryName);
      setCategoryId(category.id);
      setCategoryName('');
      await onSaved('Ingredient category saved.');
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'Category save failed.', true);
    } finally {
      setSavingCategory(false);
    }
  };

  return (
    <Panel title="Ingredients, categories & units">
      {configuration === null ? <Text style={styles.muted}>Ingredient configuration is unavailable.</Text> : (
        <>
          <Text style={styles.muted}>{ingredients.length} ingredients · {categories.length} categories</Text>
          <Select
            value={selectedIngredient?.name ?? 'Create ingredient'}
            options={['Create ingredient', ...ingredients.map((item) => item.name)]}
            onChange={selectIngredient}
          />
          <TextInput value={name} onChangeText={setName} placeholder="Ingredient or supply name" style={styles.input} />
          <Select
            value={categories.find((category) => category.id === categoryId)?.name ?? 'Choose category'}
            options={categories.map((category) => category.name)}
            onChange={(value) => setCategoryId(categories.find((category) => category.name === value)?.id ?? '')}
          />
          <Select value={unit} options={unitOptions} onChange={setUnit} />
          <Pressable disabled={savingIngredient} onPress={() => void saveIngredient()} style={styles.loginButton}>
            <Text style={styles.loginButtonText}>{savingIngredient ? 'Saving…' : ingredientId ? 'Save ingredient' : 'Add ingredient'}</Text>
          </Pressable>
          <View style={styles.line}>
            <TextInput value={categoryName} onChangeText={setCategoryName} placeholder="New category name" style={[styles.input, { flex: 1 }]} />
            <Pressable disabled={savingCategory} onPress={() => void saveCategory()} style={styles.outline}>
              <Text style={styles.pinkText}>{savingCategory ? 'Saving…' : 'Add category'}</Text>
            </Pressable>
          </View>
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
      try {
        setLines(selectedRecipe.ingredientLines.map((line, index) => ({
          key: `${selectedRecipe.id}-${index}`,
          ingredientId: line.ingredient_id,
          quantity: String(getPerBottleRecipeQuantity(line.quantity_required, selectedRecipe.prepared_quantity)),
        })));
        setError('');
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : 'The saved batter recipe has invalid quantities.');
      }
    } else {
      setRecipeCode('shared-batter');
      setRecipeName('Shared Takoyaki Batter');
      setActive(false);
      setAutomaticConsumption(false);
      setProductIds([]);
      setLines([]);
    }
  }, [selectedRecipe]);

  const save = async () => {
    if (saving || loading) return;
    setError('');
    if (!recipeCode.trim() || !recipeName.trim() || lines.length === 0) {
      setError('Enter a recipe code and name and add at least one raw ingredient.');
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
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setError(`Enter a positive per-bottle quantity for ${ingredient.name}.`);
        return;
      }
      usedIngredients.add(line.ingredientId);
      ingredientLines.push({
        ingredient_id: ingredient.id,
        quantity_required: getConfiguredRecipeQuantity(quantity, 5),
        unit_of_measure: ingredient.unit,
        automatic_consumption_enabled: automaticConsumption,
      });
    }

    setSaving(true);
    try {
      await saveSharedRecipe({
        id: selectedRecipe?.id,
        recipe_code: recipeCode,
        name: recipeName,
        estimated_yield_pieces: 125,
        prepared_quantity: 5,
        prepared_unit: 'bottle',
        active,
        automatic_consumption_enabled: automaticConsumption,
        ingredientLines,
        productIds,
      });
      await onSaved('Prepared-batter recipe saved as a new version; historical sales are unchanged.');
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
    <Panel title="Prepared-batter recipe">
      <Text style={styles.muted}>A batch is fixed at 5 bottles; yield is fixed at 25 takoyaki pieces per bottle (125 per batch).</Text>
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
                placeholder={`Quantity per bottle (${ingredient?.unit ?? 'unit'})`}
                style={styles.input}
              />
            </View>
            <Pressable onPress={() => setLines((current) => current.filter((item) => item.key !== line.key))} style={styles.outline}>
              <Text style={styles.pinkText}>Remove</Text>
            </Pressable>
          </View>
        );
      })}
      <Pressable disabled={loading || ingredients.length === 0} onPress={addIngredientLine} style={styles.outline}>
        <Text style={styles.pinkText}>Add raw ingredient</Text>
      </Pressable>
      <View style={styles.line}>
        <Pressable onPress={() => setActive((current) => !current)} style={styles.outline}>
          <Text style={styles.pinkText}>{active ? 'Active' : 'Inactive'} · tap to toggle</Text>
        </Pressable>
        <Pressable onPress={() => setAutomaticConsumption((current) => !current)} style={styles.outline}>
          <Text style={styles.pinkText}>{automaticConsumption ? 'Automatic consumption on' : 'Automatic consumption off'}</Text>
        </Pressable>
      </View>
      <Text style={styles.muted}>Raw ingredients are deducted during preparation. Completed sales consume prepared batter only, preventing a second raw-ingredient deduction.</Text>
      <Text style={styles.panelTitle}>Applicable products</Text>
      <View style={styles.line}>
        {products.filter((product) => product.is_available).map((product) => {
          const selected = productIds.includes(product.id);
          return (
            <Pressable key={product.id} onPress={() => setProductIds((current) => selected
              ? current.filter((id) => id !== product.id)
              : [...current, product.id])} style={styles.outline}>
              <Text style={styles.pinkText}>{selected ? '✓ ' : ''}{product.product_name}</Text>
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

function SettingsEditor({ products, configuration, stockSettings, onSaved }: {
  products: ProductManagementItem[];
  configuration: any;
  stockSettings: any;
  onSaved: OwnerPortalNotify;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [ingredientId, setIngredientId] = useState(configuration?.ingredients?.[0]?.id ?? '');
  const [recipeQty, setRecipeQty] = useState('1');
  const [recipeUnit, setRecipeUnit] = useState('kg');
  const [thresholdId, setThresholdId] = useState(stockSettings?.inventory?.[0]?.ingredient_id ?? '');
  const [thresholdBranch, setThresholdBranch] = useState(stockSettings?.inventory?.[0]?.branch_id ?? '');
  const [threshold, setThreshold] = useState('0');
  const [days, setDays] = useState(String(stockSettings?.nearExpirationDays ?? 7));
  const [saving, setSaving] = useState(false);
  const recipeLines = configuration?.recipeIngredients ?? [];
  const ingredients = configuration?.ingredients ?? [];
  const inventorySettings = stockSettings?.inventory ?? [];
  const selectedThreshold = inventorySettings.find((item: any) =>
    item.branch_id === thresholdBranch && item.ingredient_id === thresholdId,
  );
  const thresholdOptions = [
    'Choose inventory record',
    ...inventorySettings.map((item: any) => `${item.branch_id} · ${item.ingredient_id}`),
  ];

  const saveRecipe = async () => {
    const quantity = Number(recipeQty);
    if (!productId || !ingredientId || !configuration) {
      await onSaved('Choose a product and ingredient after configuration data has loaded.', true);
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || !recipeUnit.trim()) {
      await onSaved('Enter a positive recipe quantity and its unit of measure.', true);
      return;
    }
    setSaving(true);
    try {
      const existing = recipeLines
        .filter((line: any) => line.product_id === productId && line.ingredient_id !== ingredientId)
        .map((line: any) => ({
          ingredient_id: line.ingredient_id,
          quantity_required: Number(line.quantity_required),
          unit_of_measure: line.unit_of_measure,
        }));
      await saveProductRecipe(productId, [
        ...existing,
        { ingredient_id: ingredientId, quantity_required: quantity, unit_of_measure: recipeUnit.trim() },
      ]);
      await onSaved('Recipe line saved for future sales calculations.');
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'Recipe save failed.', true);
    } finally {
      setSaving(false);
    }
  };

  const saveThreshold = async () => {
    const minimumStock = Number(threshold);
    if (!thresholdBranch || !thresholdId) {
      await onSaved('Choose a branch inventory record first.', true);
      return;
    }
    if (!Number.isFinite(minimumStock) || minimumStock < 0) {
      await onSaved('Minimum stock must be a non-negative number.', true);
      return;
    }
    setSaving(true);
    try {
      await updateMinimumStock(thresholdBranch, thresholdId, minimumStock);
      await onSaved('Minimum stock threshold updated.');
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'Threshold save failed.', true);
    } finally {
      setSaving(false);
    }
  };

  const saveDays = async () => {
    const parsed = Number(days);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
      await onSaved('Expiration alert period must be a whole number from 1 to 365 days.', true);
      return;
    }
    setSaving(true);
    try {
      await updateNearExpirationDays(parsed);
      await onSaved('Expiration alert period updated.');
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'Expiration settings save failed.', true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Text style={styles.section}>Settings & configuration</Text>
      <Text style={styles.muted}>Existing authorized operations only. No purchase orders are created.</Text>
      <View style={styles.grid}>
        <OwnerProductEditor products={products} onSaved={onSaved} />
        <IngredientConfigurationEditor configuration={configuration} onSaved={onSaved} />
        <Panel title="Product recipes">
          <Text style={styles.muted}>Configure one ingredient line at a time; saved lines affect future calculations only.</Text>
          <Select
            value={products.find((item) => item.id === productId)?.product_name ?? 'Choose product'}
            options={products.map((item) => item.product_name)}
            onChange={(value) => setProductId(products.find((item) => item.product_name === value)?.id ?? '')}
          />
          <Select
            value={ingredients.find((item: any) => item.id === ingredientId)?.name ?? 'Choose ingredient'}
            options={ingredients.map((item: any) => item.name)}
            onChange={(value) => setIngredientId(ingredients.find((item: any) => item.name === value)?.id ?? '')}
          />
          <TextInput value={recipeQty} onChangeText={setRecipeQty} keyboardType="decimal-pad" placeholder="Required quantity" style={styles.input} />
          <TextInput value={recipeUnit} onChangeText={setRecipeUnit} placeholder="Unit of measurement" style={styles.input} />
          <Pressable disabled={saving} onPress={() => void saveRecipe()} style={styles.loginButton}>
            <Text style={styles.loginButtonText}>{saving ? 'Saving…' : 'Save recipe line'}</Text>
          </Pressable>
          <Text style={styles.muted}>Prepared batter remains a separate inventory item. Existing backend rules enforce 5 bottles × 25 pieces.</Text>
        </Panel>
        <Panel title="Minimum stock thresholds">
          <Text style={styles.muted}>Update the threshold for a specific branch and ingredient.</Text>
          <Select
            value={selectedThreshold
              ? `${selectedThreshold.branch_id} · ${selectedThreshold.ingredient_id}`
              : 'Choose inventory record'}
            options={thresholdOptions}
            onChange={(value) => {
              const match = inventorySettings.find((item: any) =>
                `${item.branch_id} · ${item.ingredient_id}` === value,
              );
              if (match) {
                setThresholdBranch(match.branch_id);
                setThresholdId(match.ingredient_id);
                setThreshold(String(match.minimum_stock));
              }
            }}
          />
          <TextInput value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" placeholder="Minimum stock" style={styles.input} />
          <Pressable disabled={saving} onPress={() => void saveThreshold()} style={styles.outline}>
            <Text style={styles.pinkText}>{saving ? 'Saving…' : 'Save threshold'}</Text>
          </Pressable>
        </Panel>
        <PreparedBatterEditor ingredients={ingredients} products={products} onSaved={onSaved} />
        <Panel title="Expiration alerts">
          <Text style={styles.body}>{stockSettings?.nearExpirationDays ?? '—'} day alert period</Text>
          <TextInput value={days} onChangeText={setDays} keyboardType="number-pad" placeholder="Alert days (1–365)" style={styles.input} />
          <Pressable disabled={saving} onPress={() => void saveDays()} style={styles.outline}>
            <Text style={styles.pinkText}>{saving ? 'Saving…' : 'Save alert period'}</Text>
          </Pressable>
          <Text style={styles.muted}>Uses the existing owner-authorized inventory settings operation. Purchase orders are never created automatically.</Text>
        </Panel>
      </View>
    </>
  );
}

function ProfileEditor({ user, onSaved }: {
  user: AppUser;
  onSaved: OwnerPortalNotify;
}) {
  const [name, setName] = useState(user.displayName);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim()) {
      await onSaved('Owner name is required.', true);
      return;
    }
    setSaving(true);
    try {
      await updateOwnerProfile({ fullName: name.trim(), newPassword: password || undefined });
      setPassword('');
      await onSaved('Owner profile updated securely through Supabase.');
    } catch (reason: unknown) {
      await onSaved(reason instanceof Error ? reason.message : 'Profile update failed.', true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Panel title="Owner profile & security">
      <Text style={styles.body}>{user.email}</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Owner full name" style={styles.input} />
      <TextInput value={password} onChangeText={setPassword} placeholder="New password (8+ characters)" secureTextEntry style={styles.input} />
      <Pressable disabled={saving} onPress={() => void save()} style={styles.outline}>
        <Text style={styles.pinkText}>{saving ? 'Saving…' : 'Save profile / password'}</Text>
      </Pressable>
    </Panel>
  );
}

const C = { pink: '#EC1358', navy: '#0F1025', bg: '#F5F5F4', surface: '#FDFDFC', border: '#E3E3E6', muted: '#858591' };
const styles = StyleSheet.create({ app: { flex: 1, flexDirection: 'row', backgroundColor: C.bg }, dark: { backgroundColor: '#171722' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, sidebar: { width: 250, backgroundColor: C.navy, padding: 24, paddingTop: 28 }, sidebarSmall: { width: 80, paddingHorizontal: 14 }, brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 42 }, logo: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.pink, color: '#fff', textAlign: 'center', paddingTop: 7, fontSize: 20, fontWeight: '800' }, brandName: { color: '#fff', fontSize: 19, fontWeight: '800' }, brandSub: { color: '#B2B3C4', fontSize: 8, letterSpacing: 1.3 }, menu: { color: '#777891', fontSize: 9, letterSpacing: 1.2, marginBottom: 12 }, nav: { minHeight: 42, borderRadius: 9, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 5 }, navActive: { backgroundColor: C.pink }, navIcon: { color: '#D1D1DB', width: 18, fontSize: 17, textAlign: 'center' }, navText: { color: '#D1D1DB', fontSize: 12, flex: 1 }, badge: { backgroundColor: '#FCA639', color: C.navy, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 2, fontSize: 9 }, profile: { borderTopWidth: 1, borderTopColor: '#292A43', paddingTop: 15, marginTop: 'auto' as any, flexDirection: 'row', gap: 9, alignItems: 'center' }, avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FCA639', color: C.navy, textAlign: 'center', paddingTop: 9, fontSize: 9, fontWeight: '800' }, profileName: { color: '#fff', fontSize: 11, fontWeight: '700' }, profileRole: { color: '#9999A5', fontSize: 8, maxWidth: 170 }, logout: { color: '#B2B3C4', paddingVertical: 12, fontSize: 11 }, main: { flex: 1, minWidth: 0 }, header: { minHeight: 100, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 38, paddingTop: 24, flexDirection: 'row', justifyContent: 'space-between' }, eyebrow: { color: '#9A9AA7', fontSize: 9, letterSpacing: 1.1 }, title: { color: C.navy, fontSize: 25, fontWeight: '800', marginTop: 5 }, headerActions: { flexDirection: 'row', gap: 10 }, livePill: { color: '#589144', backgroundColor: '#E8F6EC', borderRadius: 15, paddingHorizontal: 10, paddingVertical: 8, fontSize: 9, fontWeight: '800' }, iconButton: { backgroundColor: '#F5F5F4', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, content: { padding: 38, paddingBottom: 70 }, loadingRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 16 }, errorBanner: { backgroundColor: '#F9E4E8', padding: 13, borderRadius: 9, marginBottom: 16 }, errorText: { color: '#B9244C', fontSize: 11 }, toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, section: { color: C.navy, fontSize: 19, fontWeight: '800', marginBottom: 5 }, muted: { color: C.muted, fontSize: 10, lineHeight: 18 }, select: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 13, paddingVertical: 10, minWidth: 150 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginVertical: 18 }, metric: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 13, padding: 18, minWidth: 180, flex: 1 }, metricLabel: { color: '#777783', fontSize: 10, fontWeight: '700' }, metricValue: { color: C.navy, fontSize: 25, fontWeight: '800', marginVertical: 5 }, two: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, panel: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 13, padding: 20, flex: 1, minWidth: 290, marginBottom: 16 }, panelTitle: { color: C.navy, fontSize: 13, fontWeight: '800', marginBottom: 14 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#EEEEF0' }, body: { color: '#525260', fontSize: 11 }, strong: { color: C.navy, fontWeight: '700', fontSize: 11 }, pinkText: { color: C.pink, fontSize: 10, fontWeight: '700' }, search: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 12, width: 280, marginBottom: 16, fontSize: 11 }, table: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 13, overflow: 'hidden', minWidth: 750 }, tableHead: { flexDirection: 'row', backgroundColor: '#F7F7F6', padding: 13 }, headCell: { flex: 1, color: '#858591', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' }, tableRow: { flexDirection: 'row', padding: 14, borderTopWidth: 1, borderTopColor: '#EEEEF0', minHeight: 48 }, cell: { flex: 1, color: '#525260', fontSize: 10 }, empty: { color: C.muted, textAlign: 'center', padding: 32 }, outline: { borderWidth: 1, borderColor: C.pink, borderRadius: 8, padding: 11, alignSelf: 'flex-start', marginTop: 16 }, toast: { position: 'absolute', right: 24, bottom: 24, backgroundColor: C.navy, borderRadius: 9, padding: 13 }, toastText: { color: '#fff', fontSize: 11 }, login: { flex: 1, flexDirection: 'row', backgroundColor: C.navy }, loginPanel: { flex: 1, backgroundColor: C.bg, padding: 55, justifyContent: 'center' }, loginBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, position: 'absolute', top: 38, left: 55 }, kicker: { color: C.pink, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }, loginTitle: { color: C.navy, fontSize: 36, fontWeight: '800', marginTop: 17 }, loginSub: { color: C.muted, fontSize: 13, marginTop: 5 }, form: { maxWidth: 430, marginTop: 32 }, label: { color: '#525260', fontSize: 10, fontWeight: '700', marginTop: 14, marginBottom: 6 }, input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 13, fontSize: 12 }, variantFieldRow: { flexDirection: 'row', gap: 8 }, variantFieldWide: { flex: 2, minWidth: 0 }, variantFieldNarrow: { flex: 1, minWidth: 0 }, password: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingLeft: 13, flexDirection: 'row', alignItems: 'center' }, passwordInput: { flex: 1, paddingVertical: 13, fontSize: 12 }, loginButton: { backgroundColor: C.pink, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 }, loginButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' }, loginFooter: { color: C.muted, fontSize: 9, position: 'absolute', bottom: 35, left: 55 }, loginArt: { width: '38%', minWidth: 350, backgroundColor: C.pink, padding: 60, justifyContent: 'center' }, artEmoji: { fontSize: 76, marginBottom: 30 }, artTitle: { color: '#fff', fontSize: 31, fontWeight: '800', maxWidth: 300 }, artCopy: { color: '#FFD5E1', fontSize: 13, lineHeight: 21, maxWidth: 300 } });
