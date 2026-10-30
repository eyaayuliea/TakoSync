import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFonts } from 'expo-font';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import appConfig from '../app.json';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import StaffWorkspace from './staff/StaffWorkspace';
import OwnerLoginScreen from './owner/OwnerLoginScreen';
import OwnerSalesWorkspace from './owner/OwnerSalesWorkspace';
import OwnerMobileWorkspace from './owner/OwnerMobileWorkspace';
import { createThemedStyles, ThemeProvider, useTheme } from './theme/ThemeProvider';
import { isSupabaseConfigured, supabaseConfigurationError } from './services/supabase';
import {
  getCurrentUser,
  loadOwnerActivityData,
  loadOwnerInventory,
  loadOwnerSalesData,
  signIn,
  signOut,
  type AppUser,
  type OwnerSalesData,
} from './services/takosync';

const PINK = '#F20D55';
const NAVY = '#101026';
const DASHBOARD_COLORS = {
  pink: '#EC1358',
  navy: '#0F1025',
  orange: '#FCA639',
  white: '#FFFFFF',
  black: '#000000',
  secondaryText: '#B2B3C4',
  success: '#589144',
  warning: '#FDE672',
  error: '#F52F2E',
  discrepancy: '#B9244C',
  information: '#595EC0',
  neutral: '#B7B7BE',
  butterCream: '#FFF4D6',
} as const;
const hasStaffDashboard = (role: AppUser['role'] | null): boolean => role === 'Staff';
type PreviewInventoryItem = {
  id: string;
  branchId: string;
  name: string;
  category: string;
  quantity: string;
  unit: string;
  minimumStock: number;
  lowStock: boolean;
  branch?: string;
};
type Screen = 'loading' | 'welcome' | 'login' | 'ownerLogin' | 'dashboard' | 'staffWorkspace';
type AuthenticatedUser = AppUser;
type DashboardTab = 'Dashboard' | 'Sales' | 'Reports' | 'History' | 'Alerts';
type ReportingPeriod = 'Today' | 'This Week' | 'This Month' | 'Custom';

function dateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

function periodStart(period: ReportingPeriod, now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === 'Custom') return start;
  if (period === 'This Month') {
    start.setDate(1);
  } else if (period === 'This Week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  }
  return start;
}

function periodRange(
  period: ReportingPeriod,
  now = new Date(),
  customStart?: string,
  customEnd?: string,
): { start: Date; end: Date } | null {
  if (period === 'Custom') {
    const start = customStart ? parseLocalDate(customStart) : null;
    const end = customEnd ? parseLocalDate(customEnd) : null;
    if (!start || !end || start > end) return null;
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  const start = periodStart(period, now);
  const end = new Date(start);
  if (period === 'Today') end.setDate(end.getDate() + 1);
  else if (period === 'This Week') end.setDate(end.getDate() + 7);
  else end.setMonth(end.getMonth() + 1);
  return { start, end };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(value);
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const { colors, isDark, setMode } = useTheme();
  const styles = useAppStyles();
  const [screen, setScreen] = useState<Screen>('loading');
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthenticatedUser | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const authLock = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutLock = useRef(false);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('Dashboard');
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardMessage, setDashboardMessage] = useState('');
  const [ownerLoadError, setOwnerLoadError] = useState('');
  const [salesLoadError, setSalesLoadError] = useState('');
  const [activityLoadError, setActivityLoadError] = useState('');
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const [reportingPeriod, setReportingPeriod] = useState<ReportingPeriod>('This Month');
  const [requestedCustomStart, setRequestedCustomStart] = useState(() => {
    const date = new Date();
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return dateInputValue(date);
  });
  const [requestedCustomEnd, setRequestedCustomEnd] = useState(() => dateInputValue(new Date()));
  const [customStart, setCustomStart] = useState(requestedCustomStart);
  const [customEnd, setCustomEnd] = useState(requestedCustomEnd);
  const [ownerData, setOwnerData] = useState<Awaited<ReturnType<typeof loadOwnerInventory>> | null>(null);
  const [ownerSalesData, setOwnerSalesData] = useState<OwnerSalesData | null>(null);
  const [ownerActivityData, setOwnerActivityData] = useState<Awaited<ReturnType<typeof loadOwnerActivityData>> | null>(null);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [salesLoading, setSalesLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const { width, height } = useWindowDimensions();
  const isWideScreen = width > 600 && height > 500;
  const isOwnerDashboard = screen === 'dashboard' && authenticatedUser?.role === 'Owner';
  const isSalesPage = dashboardTab === 'Sales' || dashboardTab === 'Reports';
  const frameWidth = isWideScreen
    ? isOwnerDashboard && Platform.OS === 'web'
      ? Math.min(width - 32, 1320)
      : Math.min(430, height * 0.5)
    : width;
  const frameHeight = isWideScreen
    ? isOwnerDashboard && Platform.OS === 'web'
      ? Math.min(height - 32, 900)
      : Math.min(height, frameWidth * 2)
    : height;
  const visibleScreen =
    (screen === 'dashboard' || screen === 'staffWorkspace') && authenticatedUser === null
      ? 'login'
      : screen;

  useEffect(() => {
    if (screen !== 'loading' || !fontsLoaded) return;
    const timer = setTimeout(() => setScreen('welcome'), 1500);
    return () => clearTimeout(timer);
  }, [screen, fontsLoaded]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    getCurrentUser()
      .then((user) => {
        if (!active || !user) return;
        setAuthenticatedUser(user);
        setScreen(user.role === 'Staff' ? 'staffWorkspace' : 'dashboard');
      })
      .catch((error: unknown) => {
        if (active) {
          setLoginError(error instanceof Error ? error.message : 'Unable to restore the saved session.');
          setScreen('login');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authenticatedUser?.role !== 'Owner') {
      setOwnerData(null);
      setOwnerActivityData(null);
      setOwnerLoading(false);
      setOwnerLoadError('');
      setActivityLoadError('');
      return;
    }
    let active = true;
    setOwnerLoading(true);
    loadOwnerInventory()
      .then((data) => {
        if (active) {
          setOwnerData(data);
          setOwnerLoadError('');
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setOwnerLoadError(error instanceof Error ? error.message : 'Unable to load owner dashboard data.');
        }
      })
      .finally(() => {
        if (active) setOwnerLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authenticatedUser]);

  useEffect(() => {
    if (authenticatedUser?.role !== 'Owner') {
      setOwnerSalesData(null);
      setSalesLoading(false);
      setSalesLoadError('');
      return;
    }
    let active = true;
    setSalesLoading(true);
    setOwnerSalesData(null);
    setSalesLoadError('');
    const range = periodRange(reportingPeriod, new Date(), requestedCustomStart, requestedCustomEnd);
    if (!range) {
      setSalesLoading(false);
      setSalesLoadError('Enter valid start and end dates in YYYY-MM-DD format; the end date must not be before the start date.');
      return () => {
        active = false;
      };
    }
    loadOwnerSalesData({ ...range, branchId: branchFilter, includePrevious: true })
      .then((data) => {
        if (active) {
          setOwnerSalesData(data);
          setSalesLoadError('');
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSalesLoadError(error instanceof Error ? error.message : 'Unable to load sales data.');
        }
      })
      .finally(() => {
        if (active) setSalesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authenticatedUser, branchFilter, reportingPeriod, requestedCustomStart, requestedCustomEnd]);

  useEffect(() => {
    if (authenticatedUser?.role !== 'Owner') {
      setOwnerActivityData(null);
      setActivityLoading(false);
      setActivityLoadError('');
      return;
    }
    let active = true;
    const range = periodRange(reportingPeriod, new Date(), requestedCustomStart, requestedCustomEnd);
    if (!range) {
      setOwnerActivityData(null);
      setActivityLoading(false);
      setActivityLoadError('Enter valid start and end dates in YYYY-MM-DD format; the end date must not be before the start date.');
      return () => {
        active = false;
      };
    }
    setActivityLoading(true);
    setOwnerActivityData(null);
    setActivityLoadError('');
    loadOwnerActivityData({ ...range, branchId: branchFilter })
      .then((data) => {
        if (active) {
          setOwnerActivityData(data);
          setActivityLoadError('');
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setActivityLoadError(error instanceof Error ? error.message : 'Unable to load business activity.');
        }
      })
      .finally(() => {
        if (active) setActivityLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authenticatedUser, branchFilter, reportingPeriod, requestedCustomStart, requestedCustomEnd]);

  const logoWidth = Math.min(frameWidth * 0.48, 230);
  const foodSize = Math.min(frameWidth * 0.57, 250, frameHeight * 0.3);
  const branchNames = new Map((ownerData?.branches ?? []).map((branch) => [branch.id, branch.name]));
  const ownerIngredients = new Map((ownerData?.ingredients ?? []).map((ingredient) => [ingredient.id, ingredient]));
  const ownerCategories = new Map((ownerData?.categories ?? []).map((category) => [category.id, category.name]));
  const branchInventory: PreviewInventoryItem[] = (ownerData?.inventory ?? []).flatMap((record) => {
    const ingredient = ownerIngredients.get(record.ingredient_id);
    if (!ingredient) return [];
    const quantity = Number(record.quantity);
    const minimumStock = Number(record.minimum_stock);
    return [{
      id: record.ingredient_id,
      branchId: record.branch_id,
      name: ingredient.name,
      category: ownerCategories.get(ingredient.category_id) ?? 'Other',
      quantity: `${quantity} ${ingredient.unit}`,
      unit: ingredient.unit,
      minimumStock,
      lowStock: quantity <= 0 || (minimumStock > 0 && quantity <= minimumStock),
      branch: branchNames.get(record.branch_id) ?? 'Branch',
    }];
  });
  const now = new Date();
  const selectedDateRange = periodRange(reportingPeriod, now, requestedCustomStart, requestedCustomEnd);
  const selectedBranchInventory = branchFilter
    ? branchInventory.filter((item) => item.branchId === branchFilter)
    : branchInventory;
  const lowStockItems = selectedBranchInventory.filter((item) => item.lowStock);
  const expirationItems = (ownerData?.batches ?? []).flatMap((batch) => {
    if (!batch.expiration_date || Number(batch.quantity_remaining) <= 0) return [];
    const ingredient = ownerIngredients.get(batch.ingredient_id);
    const branch = branchNames.get(batch.branch_id);
    if (!ingredient?.expiration_tracking || !branch || (branchFilter && branchFilter !== batch.branch_id)) return [];
    const expiration = new Date(`${batch.expiration_date}T00:00:00`);
    const daysRemaining = Math.ceil((expiration.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
    return daysRemaining <= 7
      ? [{
          id: batch.id,
          name: ingredient.name,
          branch,
          branchId: batch.branch_id,
          quantity: Number(batch.quantity_remaining),
          unit: ingredient.unit,
          batchReference: batch.batch_reference,
          expirationDate: batch.expiration_date,
          daysRemaining,
        }]
      : [];
  });
  const selectedSales = ownerSalesData?.sales ?? [];
  const salesToday = ownerSalesData?.todaySales ?? [];
  const pendingDailyChecks = (ownerActivityData?.dailyChecks ?? []).filter((check) =>
    check.status === 'pending_owner_review' && (!branchFilter || check.branch_id === branchFilter),
  );
  const selectedActivities = [
    ...(ownerActivityData?.transactions ?? []).map((activity) => ({
      id: activity.id,
      type: activity.type,
      title: ({
        stock_in: 'Stock-In',
        stock_out: 'Stock-Out',
        usage: 'Usage',
        waste: 'Waste',
        spoilage: 'Spoilage',
        sales_consumption: 'Sales Consumption',
        transfer_in: 'Branch Transfer In',
        transfer_out: 'Branch Transfer Out',
        adjustment: 'Authorized Inventory Adjustment',
      } as Record<string, string>)[activity.type] ?? activity.type,
      detail: `${ownerIngredients.get(activity.ingredient_id)?.name ?? activity.ingredient_id} · ${Number(activity.quantity)} ${activity.unit}`,
      reference: activity.reference,
      branchId: activity.branch_id,
      createdAt: activity.transaction_date,
      amount: null as number | null,
    })),
    ...(ownerSalesData?.sales ?? []).map((sale) => ({
      id: sale.id,
      type: 'sale',
      title: 'Completed Sale',
      detail: formatCurrency(Number(sale.total_amount)),
      reference: sale.transaction_reference,
      branchId: sale.branch_id,
      createdAt: sale.created_at,
      amount: Number(sale.total_amount),
    })),
    ...(ownerActivityData?.dailyChecks ?? []).map((check) => ({
      id: check.id,
      type: 'physical_count',
      title: 'Physical Inventory Count',
      detail: `Submitted for review · ${check.check_date}`,
      reference: check.reference,
      branchId: check.branch_id,
      createdAt: check.created_at,
      amount: null as number | null,
    })),
    ...(ownerActivityData?.countLines ?? []).flatMap((line) => {
      if (Number(line.difference) === 0) return [];
      const check = (ownerActivityData?.dailyChecks ?? []).find((item) => item.id === line.daily_stock_check_id);
      if (!check) return [];
      return [{
        id: `${check.id}:${line.ingredient_id}`,
        type: 'discrepancy',
        title: 'Inventory Discrepancy',
        detail: `${ownerIngredients.get(line.ingredient_id)?.name ?? line.ingredient_id} · Expected ${Number(line.recorded_quantity)} ${line.unit} · Counted ${Number(line.physical_quantity)} ${line.unit}`,
        reference: check.reference,
        branchId: check.branch_id,
        createdAt: check.created_at,
        amount: null as number | null,
      }];
    }),
  ].filter((activity) =>
    (!branchFilter || activity.branchId === branchFilter) &&
    selectedDateRange !== null &&
    new Date(activity.createdAt).getTime() >= selectedDateRange.start.getTime() &&
    new Date(activity.createdAt).getTime() < selectedDateRange.end.getTime(),
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const discrepancies = (ownerActivityData?.countLines ?? []).flatMap((line) => {
    if (Number(line.difference) === 0) return [];
    const check = pendingDailyChecks.find((item) => item.id === line.daily_stock_check_id);
    if (!check) return [];
    return [{
      id: `${check.id}:${line.ingredient_id}`,
      ingredient: ownerIngredients.get(line.ingredient_id)?.name ?? line.ingredient_id,
      branch: branchNames.get(check.branch_id) ?? 'Branch',
      expected: Number(line.recorded_quantity),
      actual: Number(line.physical_quantity),
      difference: Number(line.difference),
      unit: line.unit,
      submittedAt: check.created_at,
      reference: check.reference,
    }];
  });
  const trackedItemCount = selectedBranchInventory.length;
  const expiringItems = expirationItems;
  const totalSales = selectedSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const averageSale = selectedSales.length > 0 ? totalSales / selectedSales.length : 0;
  const branchSales = (ownerData?.branches ?? [])
    .filter((branch) => !branchFilter || branch.id === branchFilter)
    .map((branch) => {
      const sales = selectedSales.filter((sale) => sale.branch_id === branch.id);
      return {
        id: branch.id,
        name: branch.name,
        total: sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0),
        transactions: sales.length,
      };
    });
  const highestBranchSales = Math.max(...branchSales.map((branch) => branch.total), 0);
  const chartStart = selectedDateRange?.start ?? periodStart(reportingPeriod, now);
  const chartDayCount = selectedDateRange
    ? Math.max(0, Math.ceil((selectedDateRange.end.getTime() - selectedDateRange.start.getTime()) / 86_400_000))
    : 0;
  const chartIntervalDays = reportingPeriod === 'Custom' ? Math.max(1, Math.ceil(chartDayCount / 60)) : 1;
  const chartBucketCount = reportingPeriod === 'This Week'
    ? 7
    : reportingPeriod === 'This Month'
      ? now.getDate()
      : reportingPeriod === 'Custom'
        ? Math.ceil(chartDayCount / chartIntervalDays)
        : 0;
  const chartBuckets = reportingPeriod === 'Today'
    ? Array.from({ length: 8 }, (_, index) => {
        const hour = index * 3;
        return { label: `${String(hour).padStart(2, '0')}:00`, start: hour, end: hour + 3 };
      }).map((bucket) => ({
        label: bucket.label,
        total: selectedSales.reduce((sum, sale) => {
          const date = new Date(sale.created_at);
          return date.getHours() >= bucket.start && date.getHours() < bucket.end
            ? sum + Number(sale.total_amount)
            : sum;
        }, 0),
      }))
    : Array.from({ length: chartBucketCount }, (_, index) => {
          const date = new Date(chartStart);
          date.setDate(date.getDate() + index * chartIntervalDays);
          const dayStart = date.getTime();
          const endDate = new Date(date);
          endDate.setDate(endDate.getDate() + chartIntervalDays);
          const dayEnd = endDate.getTime();
          return {
            label: reportingPeriod === 'This Week'
              ? date.toLocaleDateString('en', { weekday: 'short' })
              : reportingPeriod === 'Custom'
                ? date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                : String(date.getDate()),
            total: selectedSales.reduce((sum, sale) => {
              const time = new Date(sale.created_at).getTime();
              return time >= dayStart && time < dayEnd ? sum + Number(sale.total_amount) : sum;
            }, 0),
          };
        });
  const highestChartSales = Math.max(...chartBuckets.map((point) => point.total), 0);
  const loadErrorMessage = ownerLoadError || salesLoadError || activityLoadError;
  const bannerMessage = loadErrorMessage || dashboardMessage;
  const searchTerm = dashboardSearch.trim().toLowerCase();
  const filterItems = (items: PreviewInventoryItem[]) =>
    items.filter((item) =>
      `${item.name} ${item.category}`.toLowerCase().includes(searchTerm),
    );
  const visibleLowStockItems = filterItems(lowStockItems);
  const visibleExpiringItems = expirationItems.filter((item) =>
    `${item.name} ${item.branch}`.toLowerCase().includes(searchTerm),
  );
  const handleLogin = async () => {
    if (authLock.current) return;
    if (!loginEmail.trim() || !password) {
      setLoginError('Enter your registered email address and password to continue.');
      return;
    }
    authLock.current = true;
    setAuthenticating(true);
    setLoginError('');
    try {
      const user = await signIn(loginEmail, password, 'Staff');
      setAuthenticatedUser(user);
      setScreen('staffWorkspace');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      authLock.current = false;
      setAuthenticating(false);
    }
  };

  const handleOwnerLogin = async (email: string, ownerPassword: string) => {
    const user = await signIn(email, ownerPassword, 'Owner');
    setAuthenticatedUser(user);
    setScreen('dashboard');
  };

  const clearSignedInState = () => {
    setAuthenticatedUser(null);
    setOwnerData(null);
    setOwnerSalesData(null);
    setOwnerActivityData(null);
    setOwnerLoading(false);
    setSalesLoading(false);
    setActivityLoading(false);
    setLoginEmail('');
    setPassword('');
    setDashboardTab('Dashboard');
    setBranchFilter(null);
    setReportingPeriod('This Month');
    setOwnerLoadError('');
    setSalesLoadError('');
    setActivityLoadError('');
    setDashboardMessage('');
  };

  const handleLogout = async () => {
    if (logoutLock.current) return;
    logoutLock.current = true;
    setLoggingOut(true);
    try {
      await signOut();
      clearSignedInState();
      setLoginError('');
      setScreen(authenticatedUser?.role === 'Owner' ? 'ownerLogin' : 'welcome');
    } catch (error) {
      setDashboardMessage(error instanceof Error ? error.message : 'Unable to end the session. Please try again.');
    } finally {
      logoutLock.current = false;
      setLoggingOut(false);
    }
  };

  const refreshOwnerDashboard = async () => {
    if (ownerLoading || salesLoading || activityLoading) return;
    setOwnerLoading(true);
    setSalesLoading(true);
    setActivityLoading(true);
    setDashboardMessage('');
    setOwnerLoadError('');
    setSalesLoadError('');
    setActivityLoadError('');
    const salesRange = periodRange(reportingPeriod, new Date(), requestedCustomStart, requestedCustomEnd);
    const activityRange = periodRange(reportingPeriod, new Date(), requestedCustomStart, requestedCustomEnd);
    const [inventoryResult, salesResult, activityResult] = await Promise.allSettled([
      loadOwnerInventory(),
      salesRange
        ? loadOwnerSalesData({ ...salesRange, branchId: branchFilter, includePrevious: true })
        : Promise.reject(new Error('Enter valid start and end dates in YYYY-MM-DD format; the end date must not be before the start date.')),
      activityRange
        ? loadOwnerActivityData({ ...activityRange, branchId: branchFilter })
        : Promise.reject(new Error('Enter valid start and end dates in YYYY-MM-DD format; the end date must not be before the start date.')),
    ]);
    if (inventoryResult.status === 'fulfilled') setOwnerData(inventoryResult.value);
    else setOwnerLoadError(inventoryResult.reason instanceof Error ? inventoryResult.reason.message : 'Unable to refresh inventory data.');
    if (salesResult.status === 'fulfilled') setOwnerSalesData(salesResult.value);
    else setSalesLoadError(salesResult.reason instanceof Error ? salesResult.reason.message : 'Unable to refresh sales data.');
    if (activityResult.status === 'fulfilled') setOwnerActivityData(activityResult.value);
    else setActivityLoadError(activityResult.reason instanceof Error ? activityResult.reason.message : 'Unable to refresh business activity.');
    setOwnerLoading(false);
    setSalesLoading(false);
    setActivityLoading(false);
  };

  const handleStaffLogout = async () => {
    await signOut();
    clearSignedInState();
    setLoginError('');
    setScreen('welcome');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle={screen === 'ownerLogin' ? 'dark-content' : isDark ? 'light-content' : 'dark-content'}
        backgroundColor={screen === 'ownerLogin' ? '#E8B77E' : colors.background}
      />
      <View style={styles.canvas}>
        <View style={[styles.frameShadow, { width: frameWidth, height: frameHeight }, isWideScreen && styles.desktopShadow]}>
          <View style={[styles.appFrame, isWideScreen && styles.desktopFrame]}>
            {visibleScreen === 'loading' && (
              <View style={styles.loadingScreen}>
                <Image
                  source={require('../assets/takosync-logo.png')}
                  style={[styles.loadingLogo, { width: Math.min(frameWidth * 0.68, 280), height: Math.min(frameWidth * 0.48, 190) }]}
                  resizeMode="contain"
                  accessibilityLabel="TakoSync logo"
                />
              </View>
            )}

            {visibleScreen === 'welcome' && (
              <View style={styles.welcomeScreen}>
                <View style={styles.whiteHeader}>
                  <Image
                    source={require('../assets/takosync-logo.png')}
                    style={[styles.headerLogo, { width: logoWidth, height: logoWidth * 0.64 }]}
                    resizeMode="contain"
                    accessibilityLabel="TakoSync logo"
                  />
                </View>

                <View style={[styles.pinkPanel, { height: frameHeight * (frameHeight < 700 ? 0.65 : 0.53) }]}>
                  <View style={[styles.panelContent, { paddingTop: foodSize * 0.37 }]}>
                    <Text style={styles.heading}>Welcome!</Text>
                    <Text style={styles.description}>
                      Keep your ingredients in sync and your takoyaki shop ready for every rush.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Staff Login"
                      onPress={() => {
                        setLoginError('');
                        setScreen('login');
                      }}
                      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                    >
                      <Text style={styles.buttonText}>Staff Login</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Owner Login"
                      onPress={() => setScreen('ownerLogin')}
                      style={({ pressed }) => [styles.ownerWelcomeButton, pressed && styles.buttonPressed]}
                    >
                      <Text style={styles.buttonText}>Owner Login</Text>
                    </Pressable>
                  </View>
                </View>

                <Image
                  source={require('../assets/takoyaki-plate.png')}
                  style={[styles.foodImage, { width: foodSize, height: foodSize, top: frameHeight * 0.255 }]}
                  resizeMode="contain"
                  accessibilityLabel="A plate of takoyaki"
                />
              </View>
            )}

            {visibleScreen === 'ownerLogin' && (
              <OwnerLoginScreen
                onBack={() => setScreen('welcome')}
                onLogin={handleOwnerLogin}
              />
            )}

            {visibleScreen === 'login' && (
              <View style={styles.loginScreen}>
                <ImageBackground
                  source={require('../assets/takoyaki-plate.png')}
                  resizeMode="cover"
                  style={styles.loginBackground}
                  imageStyle={styles.loginBackgroundImage}
                >
                  <View style={styles.loginOverlay}>
                    <View style={[styles.loginHeader, { height: Math.max(frameHeight * 0.22, 125) }]}>
                      <Image
                        source={require('../assets/takosync-logo.png')}
                        style={[styles.headerLogo, { width: logoWidth, height: logoWidth * 0.64 }]}
                        resizeMode="contain"
                        accessibilityLabel="TakoSync logo"
                      />
                    </View>
                    <ScrollView
                      style={styles.loginScroll}
                      contentContainerStyle={styles.loginScrollContent}
                      keyboardShouldPersistTaps="handled"
                    >
                      <View style={styles.loginCard}>
                        <Text style={styles.loginHeading}>Log In</Text>
                        {loginError !== '' && (
                          <View style={styles.errorBanner} accessibilityRole="alert">
                            <View style={styles.errorIcon}>
                              <Text style={styles.errorIconText}>!</Text>
                            </View>
                            <Text style={styles.errorText}>{loginError}</Text>
                          </View>
                        )}
                        <Text style={styles.loginLabel}>Email *</Text>
                        <TextInput
                          value={loginEmail}
                          onChangeText={(value) => {
                            setLoginEmail(value);
                            setLoginError('');
                          }}
                          style={styles.loginInput}
                          placeholder="Enter your registered email address"
                          placeholderTextColor={isDark ? colors.secondaryText : '#777783'}
                          autoCapitalize="none"
                          autoCorrect={false}
                          accessibilityLabel="Username or email, required"
                          editable={!authenticating}
                          returnKeyType="next"
                        />
                        <Text style={[styles.loginLabel, styles.passwordLabel]}>Password *</Text>
                        <TextInput
                          value={password}
                          onChangeText={(value) => {
                            setPassword(value);
                            setLoginError('');
                          }}
                          style={styles.loginInput}
                          placeholder="Enter your password"
                          placeholderTextColor={isDark ? colors.secondaryText : '#777783'}
                          secureTextEntry
                          accessibilityLabel="Password, required"
                          editable={!authenticating}
                          returnKeyType="done"
                          onSubmitEditing={handleLogin}
                        />
                        <Text style={styles.loginHelper}>
                          Use your registered Supabase email address. Owners should use the Owner Login screen.
                        </Text>
                        {!isSupabaseConfigured && (
                          <Text style={styles.errorText}>
                            {supabaseConfigurationError}
                          </Text>
                        )}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Log In"
                          onPress={handleLogin}
                          disabled={authenticating || !isSupabaseConfigured}
                          style={({ pressed }) => [styles.loginButton, pressed && styles.buttonPressed, (authenticating || !isSupabaseConfigured) && { opacity: 0.6 }]}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            {authenticating && <ActivityIndicator size="small" color="#FFFFFF" />}
                            <Text style={styles.loginButtonText}>{authenticating ? 'Signing in…' : 'Log In'}</Text>
                          </View>
                        </Pressable>
                      </View>
                    </ScrollView>
                  </View>
                </ImageBackground>
              </View>
            )}

            {visibleScreen === 'dashboard' && authenticatedUser?.role === 'Owner' && (
              <OwnerMobileWorkspace
                user={authenticatedUser}
                availableWidth={frameWidth}
                onLogout={handleLogout}
                data={ownerData}
                inventoryLoading={ownerLoading}
                inventoryError={ownerLoadError}
                salesData={ownerSalesData}
                salesLoading={salesLoading}
                salesError={salesLoadError}
                activityData={ownerActivityData}
                activityLoading={activityLoading}
                activityError={activityLoadError}
                branchId={branchFilter}
                onBranchChange={setBranchFilter}
                period={reportingPeriod}
                onPeriodChange={setReportingPeriod}
                customStart={customStart}
                customEnd={customEnd}
                onCustomStartChange={setCustomStart}
                onCustomEndChange={setCustomEnd}
                onApplyCustomRange={() => {
                  setRequestedCustomStart(customStart);
                  setRequestedCustomEnd(customEnd);
                }}
                onRefresh={refreshOwnerDashboard}
                refreshing={ownerLoading || salesLoading || activityLoading}
                loggingOut={loggingOut}
              />
            )}

            {visibleScreen === 'dashboard' && authenticatedUser !== null && hasStaffDashboard(authenticatedUser.role) && (
              <View style={styles.dashboardScreen}>
                <ScrollView
                  style={styles.dashboardScroll}
                  contentContainerStyle={styles.dashboardContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.dashboardHeader}>
                    <View style={styles.dashboardIdentity}>
                      <View style={styles.profileAvatar}>
                        <View style={styles.profileHead} />
                        <View style={styles.profileBody} />
                      </View>
                      <View style={styles.greetingGroup}>
                        <Text style={styles.dashboardGreeting}>Hello, {authenticatedUser.displayName}!</Text>
                        <Text style={styles.dashboardSubheading}>
                          Owner dashboard · {now.toLocaleDateString('en-PH', { dateStyle: 'full' })}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.headerActions}>
                      {authenticatedUser.role === 'Owner' && !isSalesPage && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Refresh dashboard data"
                          disabled={ownerLoading || salesLoading || activityLoading}
                          onPress={refreshOwnerDashboard}
                          style={({ pressed }) => [styles.refreshButton, pressed && styles.buttonPressed, (ownerLoading || salesLoading || activityLoading) && { opacity: 0.6 }]}
                        >
                          {ownerLoading || salesLoading || activityLoading
                            ? <ActivityIndicator size="small" color={DASHBOARD_COLORS.navy} />
                            : <Text style={styles.refreshButtonText}>↻</Text>}
                        </Pressable>
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Alerts"
                        onPress={() => {
                          setDashboardMessage('');
                          setDashboardTab('Alerts');
                        }}
                        style={({ pressed }) => [styles.alertButton, pressed && styles.buttonPressed]}
                      >
                        <Text style={styles.alertIcon}>🔔</Text>
                        <View style={styles.alertDot} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Switch to ${isDark ? 'light' : 'dark'} mode`}
                        accessibilityState={{ selected: isDark }}
                        onPress={() => setMode(isDark ? 'light' : 'dark')}
                        style={({ pressed }) => [styles.themeToggleButton, pressed && styles.buttonPressed]}
                      >
                        <Text style={styles.themeToggleText}>{isDark ? '☼' : '☾'}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Log out"
                        disabled={loggingOut}
                        onPress={handleLogout}
                        style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]}
                      >
                        <Text style={styles.logoutButtonText}>{loggingOut ? 'Logging out…' : 'Log out'}</Text>
                      </Pressable>
                    </View>
                  </View>

                  {authenticatedUser.role === 'Owner' && !isSalesPage && (
                    <View style={styles.filtersCard}>
                      <Text style={styles.filterLabel}>Branch</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterOptions}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected: branchFilter === null }}
                          onPress={() => setBranchFilter(null)}
                          style={[styles.filterChip, branchFilter === null && styles.filterChipActive]}
                        >
                          <Text style={[styles.filterChipText, branchFilter === null && styles.filterChipTextActive]}>All Branches</Text>
                        </Pressable>
                        {(ownerData?.branches ?? []).map((branch) => {
                          const active = branchFilter === branch.id;
                          return (
                            <Pressable
                              key={branch.id}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                              onPress={() => setBranchFilter(branch.id)}
                              style={[styles.filterChip, active && styles.filterChipActive]}
                            >
                              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{branch.name}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                      <Text style={[styles.filterLabel, styles.periodFilterLabel]}>Reporting period</Text>
                      <View style={styles.filterOptions}>
                        {(['Today', 'This Week', 'This Month', 'Custom'] as const).map((period) => {
                          const active = reportingPeriod === period;
                          return (
                            <Pressable
                              key={period}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                              onPress={() => setReportingPeriod(period)}
                              style={[styles.filterChip, active && styles.filterChipActive]}
                            >
                              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{period}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      {reportingPeriod === 'Custom' && (
                        <View style={styles.customRangeRow}>
                          <View style={styles.customDateField}>
                            <Text style={styles.filterLabel}>From</Text>
                            <TextInput
                              accessibilityLabel="Custom period start date"
                              value={customStart}
                              onChangeText={setCustomStart}
                              placeholder="YYYY-MM-DD"
                              style={styles.customDateInput}
                              autoCapitalize="none"
                            />
                          </View>
                          <View style={styles.customDateField}>
                            <Text style={styles.filterLabel}>Through</Text>
                            <TextInput
                              accessibilityLabel="Custom period end date"
                              value={customEnd}
                              onChangeText={setCustomEnd}
                              placeholder="YYYY-MM-DD"
                              style={styles.customDateInput}
                              autoCapitalize="none"
                            />
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              setRequestedCustomStart(customStart);
                              setRequestedCustomEnd(customEnd);
                            }}
                            style={styles.applyRangeButton}
                          >
                            <Text style={styles.applyRangeText}>Apply</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  )}

                  {!isSalesPage && <View style={styles.searchBar}>
                    <View style={styles.searchIcon}>
                      <View style={styles.searchIconHandle} />
                    </View>
                    <TextInput
                      value={dashboardSearch}
                      onChangeText={setDashboardSearch}
                      placeholder="Search inventory"
                      placeholderTextColor={isDark ? colors.secondaryText : DASHBOARD_COLORS.secondaryText}
                      style={styles.searchInput}
                      accessibilityLabel="Search branch inventory"
                      returnKeyType="search"
                    />
                    {dashboardSearch !== '' && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Clear search"
                        onPress={() => setDashboardSearch('')}
                        style={styles.clearSearchButton}
                      >
                        <Text style={styles.clearSearchText}>×</Text>
                      </Pressable>
                    )}
                  </View>}

                  {!isSalesPage && bannerMessage !== '' && (
                    <View style={styles.dashboardMessage} accessibilityRole={loadErrorMessage ? 'alert' : undefined}>
                      <Text style={styles.dashboardMessageText}>{bannerMessage}</Text>
                      {loadErrorMessage !== '' && (
                        <Pressable
                          accessibilityRole="button"
                          disabled={ownerLoading || salesLoading || activityLoading}
                          onPress={refreshOwnerDashboard}
                          style={styles.retryButton}
                        >
                          <Text style={styles.retryButtonText}>{ownerLoading || salesLoading || activityLoading ? 'Retrying…' : 'Retry'}</Text>
                        </Pressable>
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss message"
                        onPress={() => {
                          setDashboardMessage('');
                          setOwnerLoadError('');
                          setSalesLoadError('');
                        }}
                      >
                        <Text style={styles.dismissMessage}>×</Text>
                      </Pressable>
                    </View>
                  )}

                  {authenticatedUser.role === 'Owner' && isSalesPage && (
                    <OwnerSalesWorkspace
                      mode={dashboardTab === 'Sales' ? 'monitoring' : 'reports'}
                      branches={ownerData?.branches ?? []}
                      initialData={salesLoadError || reportingPeriod === 'Custom' ? null : ownerSalesData}
                      initialLoading={salesLoading}
                      initialPeriod={reportingPeriod === 'Today'
                        ? 'Daily'
                        : reportingPeriod === 'This Week' ? 'Weekly' : 'Monthly'}
                      initialBranchId={branchFilter}
                      availableWidth={Math.min(frameWidth, 1180) - 44}
                    />
                  )}

                  {dashboardTab === 'Dashboard' && (
                    <>
                      {!ownerData ? (
                        <View style={styles.loadingPanel}>
                          {ownerLoading
                            ? <ActivityIndicator size="small" color={DASHBOARD_COLORS.pink} />
                            : <Text style={styles.emptySearchText}>Dashboard data is unavailable. Use Retry to load it again.</Text>}
                          <Text style={styles.loadingPanelText}>{ownerLoading ? 'Loading owner dashboard…' : 'No unverified figures are shown.'}</Text>
                        </View>
                      ) : (
                        <>
                          <View style={styles.dashboardIntro}>
                            <Text style={styles.dashboardTitle}>Business overview</Text>
                            <Text style={styles.dashboardIntroText}>
                              {branchFilter ? branchNames.get(branchFilter) : 'All active branches'} · {reportingPeriod === 'Custom'
                                ? `${requestedCustomStart} – ${requestedCustomEnd}`
                                : reportingPeriod}
                            </Text>
                          </View>

                          <View style={styles.sectionHeadingRow}>
                            <Text style={styles.sectionHeading}>Sales Overview</Text>
                            <Text style={styles.sectionCaption}>Completed sales only</Text>
                          </View>
                          <View style={styles.metricGrid}>
                            {[
                              { label: `Total Sales · ${reportingPeriod}`, value: salesLoading || salesLoadError ? '—' : formatCurrency(totalSales), hint: 'Recorded completed sales' },
                              { label: 'Sales Today', value: salesLoading || salesLoadError ? '—' : formatCurrency(salesToday.reduce((sum, sale) => sum + Number(sale.total_amount), 0)), hint: 'Current business day' },
                              { label: 'Transactions', value: salesLoading || salesLoadError ? '—' : String(selectedSales.length), hint: 'Completed transactions' },
                              { label: 'Average Transaction', value: salesLoading || salesLoadError || !selectedSales.length ? '—' : formatCurrency(averageSale), hint: 'Selected reporting period' },
                            ].map((metric) => (
                              <View key={metric.label} style={[styles.metricCard, isWideScreen && styles.metricCardWide]}>
                                <Text style={styles.metricLabel}>{metric.label}</Text>
                                <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{metric.value}</Text>
                                <Text style={styles.metricHint}>{metric.hint}</Text>
                              </View>
                            ))}
                          </View>

                          <View style={[styles.analyticsGrid, isWideScreen && styles.analyticsGridWide]}>
                            <View style={[styles.dataPanel, isWideScreen && styles.analyticsPanelWide]}>
                              <Text style={styles.panelTitle}>Sales Performance</Text>
                              <Text style={styles.panelCaption}>Daily recorded sales · {reportingPeriod.toLowerCase()}</Text>
                              {salesLoading ? (
                                <Text style={styles.panelEmpty}>Loading recorded sales…</Text>
                              ) : salesLoadError ? (
                                <Text style={styles.panelEmpty}>Sales data is unavailable. Use Retry to load it again.</Text>
                              ) : selectedSales.length === 0 ? (
                                <Text style={styles.panelEmpty}>No completed sales in this period.</Text>
                              ) : (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                  <View style={styles.chartContent}>
                                    {chartBuckets.map((point) => (
                                      <Pressable
                                        key={point.label}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${point.label}: ${formatCurrency(point.total)}`}
                                        onPress={() => {
                                          setDashboardMessage(`${point.label}: ${formatCurrency(point.total)}`);
                                        }}
                                        style={styles.chartPoint}
                                      >
                                        <Text style={styles.chartValue} numberOfLines={1}>
                                          {point.total > 0 ? formatCurrency(point.total) : ''}
                                        </Text>
                                        <View style={styles.chartBarTrack}>
                                          <View
                                            style={[
                                              styles.chartBarFill,
                                              { height: `${highestChartSales > 0 ? Math.max(4, point.total / highestChartSales * 100) : 0}%` },
                                            ]}
                                          />
                                        </View>
                                        <Text style={styles.chartLabel}>{point.label}</Text>
                                      </Pressable>
                                    ))}
                                  </View>
                                </ScrollView>
                              )}
                            </View>
                            <View style={[styles.dataPanel, isWideScreen && styles.analyticsPanelWide]}>
                              <Text style={styles.panelTitle}>Branch Sales Comparison</Text>
                              <Text style={styles.panelCaption}>Same reporting period · actual branch records</Text>
                              {salesLoading ? (
                                <Text style={styles.panelEmpty}>Loading branch sales…</Text>
                              ) : salesLoadError ? (
                                <Text style={styles.panelEmpty}>Branch sales comparison is unavailable.</Text>
                              ) : branchSales.length === 0 ? (
                                <Text style={styles.panelEmpty}>No branches are available.</Text>
                              ) : branchSales.map((branch) => (
                                <View key={branch.id} style={styles.branchSalesRow}>
                                  <View style={styles.branchSalesCopy}>
                                    <Text style={styles.branchSalesName} numberOfLines={1}>{branch.name}</Text>
                                    <Text style={styles.branchSalesMeta}>
                                      {branch.transactions} transactions · {formatCurrency(branch.total)}
                                    </Text>
                                    <View style={styles.branchBarTrack}>
                                      <View style={[styles.branchBarFill, { width: `${highestBranchSales ? branch.total / highestBranchSales * 100 : 0}%` }]} />
                                    </View>
                                  </View>
                                </View>
                              ))}
                            </View>
                          </View>

                          <View style={styles.sectionHeadingRow}>
                            <Text style={styles.sectionHeading}>Expected Inventory Overview</Text>
                            <Text style={styles.sectionCaption}>Recorded quantities, not physical counts</Text>
                          </View>
                          <View style={styles.inventorySummaryPanel}>
                            {[
                              { label: 'Tracked ingredient records', value: trackedItemCount },
                              { label: 'Sufficient expected stock', value: trackedItemCount - lowStockItems.length },
                              { label: 'Low stock', value: lowStockItems.length },
                              { label: 'Expiration attention', value: expirationItems.length },
                            ].map((item) => (
                              <View key={item.label} style={[styles.inventorySummaryItem, isWideScreen && styles.inventorySummaryItemWide]}>
                                <Text style={styles.inventorySummaryValue}>{ownerLoading ? '—' : item.value}</Text>
                                <Text style={styles.inventorySummaryLabel}>{item.label}</Text>
                              </View>
                            ))}
                          </View>

                          <View style={styles.sectionHeadingRow}>
                            <Text style={styles.sectionHeading}>Low-Stock Ingredients</Text>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => setDashboardTab('Alerts')}
                              style={styles.sectionLink}
                            >
                              <Text style={styles.viewAllText}>{lowStockItems.length ? 'View all' : 'Alerts'} ›</Text>
                            </Pressable>
                          </View>
                          {visibleLowStockItems.length ? visibleLowStockItems.slice(0, 4).map((item) => (
                            <View key={`${item.branchId}:${item.id}`} style={styles.dataListRow}>
                              <View style={[styles.listStatusMark, styles.lowStatusMark]}><Text style={styles.listStatusGlyph}>!</Text></View>
                              <View style={styles.dataListCopy}>
                                <Text style={styles.dataListTitle}>{item.name}</Text>
                                <Text style={styles.dataListMeta}>{item.branch} · Expected {item.quantity} · Minimum {item.minimumStock} {item.unit}</Text>
                              </View>
                              <Text style={[styles.dataListStatus, styles.lowStatusText]}>Low stock</Text>
                            </View>
                          )) : (
                            <Text style={styles.panelEmpty}>
                              {ownerLoading ? 'Loading expected inventory…' : 'No low-stock ingredients match this branch and search.'}
                            </Text>
                          )}

                          <View style={[styles.sectionHeadingRow, styles.expirationHeading]}>
                            <Text style={styles.sectionHeading}>Expiration Monitoring</Text>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => setDashboardTab('Alerts')}
                              style={styles.sectionLink}
                            >
                              <Text style={styles.viewAllText}>{expirationItems.length ? 'View all' : 'Alerts'} ›</Text>
                            </Pressable>
                          </View>
                          {visibleExpiringItems.length ? visibleExpiringItems.slice(0, 4).map((item) => (
                            <View key={item.id} style={styles.dataListRow}>
                              <View style={[styles.listStatusMark, item.daysRemaining < 0 ? styles.expiredStatusMark : styles.expiringStatusMark]}>
                                <Text style={styles.listStatusGlyph}>!</Text>
                              </View>
                              <View style={styles.dataListCopy}>
                                <Text style={styles.dataListTitle}>{item.name}</Text>
                                <Text style={styles.dataListMeta}>
                                  {item.branch} · Batch {item.batchReference} · {item.quantity} {item.unit} remaining · Expires {new Date(`${item.expirationDate}T00:00:00`).toLocaleDateString('en-PH')}
                                </Text>
                              </View>
                              <Text style={[styles.dataListStatus, item.daysRemaining < 0 ? styles.expiredStatusText : styles.expiringStatusText]}>
                                {item.daysRemaining < 0 ? 'Expired' : item.daysRemaining === 0 ? 'Expires today' : `${item.daysRemaining}d left`}
                              </Text>
                            </View>
                          )) : (
                            <Text style={styles.panelEmpty}>
                              {ownerLoading ? 'Loading batch expiration records…' : 'No expiring or expired tracked batches match this branch and search.'}
                            </Text>
                          )}

                          {dashboardTab === 'Dashboard' && (
                            <>
                              <View style={styles.sectionHeadingRow}>
                                <Text style={styles.sectionHeading}>Recent Business Activities</Text>
                                <Pressable accessibilityRole="button" onPress={() => setDashboardTab('History')} style={styles.sectionLink}>
                                  <Text style={styles.viewAllText}>View all ›</Text>
                                </Pressable>
                              </View>
                              {selectedActivities.slice(0, 5).map((activity) => (
                                <View key={`${activity.type}:${activity.id}`} style={styles.activityCard}>
                                  <View style={styles.activityIcon}><Text style={styles.activityIconText}>•</Text></View>
                                  <View style={styles.activityCopy}>
                                    <Text style={styles.activityTitle}>{activity.title}</Text>
                                    <Text style={styles.activityDetail}>
                                      {activity.detail} · {branchNames.get(activity.branchId) ?? 'Branch'}
                                    </Text>
                                    <Text style={styles.activityDetail}>
                                      {new Date(activity.createdAt).toLocaleString('en-PH')} · Ref {activity.reference}
                                    </Text>
                                  </View>
                                </View>
                              ))}
                              {selectedActivities.length === 0 && (
                                <Text style={styles.panelEmpty}>
                                  {activityLoading ? 'Loading business activity…' : activityLoadError ? 'Business activity is unavailable.' : 'No recorded business activity in this period.'}
                                </Text>
                              )}

                              <View style={styles.sectionHeadingRow}>
                                <Text style={styles.sectionHeading}>Inventory Discrepancies</Text>
                                <Pressable accessibilityRole="button" onPress={() => setDashboardTab('Alerts')} style={styles.sectionLink}>
                                  <Text style={styles.viewAllText}>View all ›</Text>
                                </Pressable>
                              </View>
                              {discrepancies.slice(0, 4).map((item) => (
                                <View key={item.id} style={styles.discrepancyRow}>
                                  <View style={styles.dataListCopy}>
                                    <Text style={styles.dataListTitle}>{item.ingredient} · {item.branch}</Text>
                                    <Text style={styles.dataListMeta}>
                                      Expected {item.expected} {item.unit} · Counted {item.actual} {item.unit} · Difference {item.difference > 0 ? '+' : ''}{item.difference} {item.unit}
                                    </Text>
                                    <Text style={styles.dataListMeta}>Submitted {new Date(item.submittedAt).toLocaleString('en-PH')} · Ref {item.reference}</Text>
                                  </View>
                                  <Text style={[styles.dataListStatus, styles.pendingStatusText]}>Pending</Text>
                                </View>
                              ))}
                              {discrepancies.length === 0 && (
                                <Text style={styles.panelEmpty}>
                                  {activityLoading ? 'Loading count review records…' : activityLoadError ? 'Discrepancy summary is unavailable.' : 'No pending count discrepancies require attention.'}
                                </Text>
                              )}
                              {discrepancies.length > 0 && (
                                <Text style={styles.discrepancyNote}>
                                  Counts do not update expected inventory. Approval and rejection are not available in this dashboard.
                                </Text>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}

                  {dashboardTab === 'History' && (
                    <View style={styles.historyView}>
                      <Text style={styles.sectionHeading}>Recent Business Activities</Text>
                      <Text style={styles.historyCaption}>Recorded sales, inventory movements, and physical counts</Text>
                      {selectedActivities.map((activity) => (
                        <View key={`${activity.type}:${activity.id}`} style={styles.activityCard}>
                          <View style={styles.activityIcon}><Text style={styles.activityIconText}>•</Text></View>
                          <View style={styles.activityCopy}>
                            <Text style={styles.activityTitle}>{activity.title}</Text>
                            <Text style={styles.activityDetail}>
                              {activity.detail} · {branchNames.get(activity.branchId) ?? 'Branch'}
                            </Text>
                            <Text style={styles.activityDetail}>
                              {new Date(activity.createdAt).toLocaleString('en-PH')} · Ref {activity.reference}
                            </Text>
                          </View>
                        </View>
                      ))}
                      {selectedActivities.length === 0 && (
                        <Text style={styles.emptySearchText}>{ownerLoading ? 'Loading business activity…' : 'No recorded business activity matches these filters.'}</Text>
                      )}
                    </View>
                  )}
                  {dashboardTab === 'Alerts' && (
                    <>
                      <View style={styles.sectionHeadingRow}>
                        <Text style={styles.sectionHeading}>Low-Stock Items</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="View all low-stock alerts"
                          onPress={() => setDashboardTab('Alerts')}
                        >
                          <Text style={styles.viewAllText}>{lowStockItems.length} items ›</Text>
                        </Pressable>
                      </View>
                      {visibleLowStockItems.length > 0 ? (
                        visibleLowStockItems.map((item) => (
                          <View key={`${item.branchId}:${item.id}`} style={styles.dataListRow}>
                            <View style={[styles.listStatusMark, styles.lowStatusMark]}><Text style={styles.listStatusGlyph}>!</Text></View>
                            <View style={styles.dataListCopy}>
                              <Text style={styles.dataListTitle}>{item.name}</Text>
                              <Text style={styles.dataListMeta}>{item.branch} · Expected {item.quantity} · Minimum {item.minimumStock} {item.unit}</Text>
                            </View>
                            <Text style={[styles.dataListStatus, styles.lowStatusText]}>Low stock</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.emptySearchText}>
                          {ownerLoading ? 'Loading expected inventory…' : 'No low-stock items match your search.'}
                        </Text>
                      )}

                      <View style={[styles.sectionHeadingRow, styles.expirationHeading]}>
                        <Text style={styles.sectionHeading}>Expiration Monitoring</Text>
                        <Text style={styles.expirationCount}>{expiringItems.length} items</Text>
                      </View>
                      {visibleExpiringItems.length > 0 ? (
                        visibleExpiringItems.map((item) => (
                          <View key={item.id} style={styles.dataListRow}>
                            <View style={[styles.listStatusMark, item.daysRemaining < 0 ? styles.expiredStatusMark : styles.expiringStatusMark]}>
                              <Text style={styles.listStatusGlyph}>!</Text>
                            </View>
                            <View style={styles.dataListCopy}>
                              <Text style={styles.dataListTitle}>{item.name}</Text>
                              <Text style={styles.dataListMeta}>
                                {item.branch} · Batch {item.batchReference} · {item.quantity} {item.unit} · Exp. {new Date(`${item.expirationDate}T00:00:00`).toLocaleDateString('en-PH')}
                              </Text>
                            </View>
                            <Text style={[styles.dataListStatus, item.daysRemaining < 0 ? styles.expiredStatusText : styles.expiringStatusText]}>
                              {item.daysRemaining < 0 ? 'Expired' : item.daysRemaining === 0 ? 'Today' : `${item.daysRemaining}d`}
                            </Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.emptySearchText}>No expiring or expired tracked batches match your search.</Text>
                      )}
                    </>
                  )}

                  {dashboardTab === 'Alerts' && (
                    <>
                      <View style={styles.sectionHeadingRow}>
                        <Text style={styles.sectionHeading}>Inventory Discrepancies</Text>
                      </View>
                      {discrepancies.map((item) => (
                        <View key={item.id} style={styles.discrepancyRow}>
                          <View style={styles.dataListCopy}>
                            <Text style={styles.dataListTitle}>{item.ingredient} · {item.branch}</Text>
                            <Text style={styles.dataListMeta}>
                              Expected {item.expected} {item.unit} · Counted {item.actual} {item.unit} · Difference {item.difference > 0 ? '+' : ''}{item.difference} {item.unit}
                            </Text>
                            <Text style={styles.dataListMeta}>Submitted {new Date(item.submittedAt).toLocaleString('en-PH')} · Ref {item.reference}</Text>
                          </View>
                          <Text style={[styles.dataListStatus, styles.pendingStatusText]}>Pending</Text>
                        </View>
                      ))}
                      {discrepancies.length === 0 && (
                        <Text style={styles.panelEmpty}>
                          {activityLoading ? 'Loading count review records…' : activityLoadError ? 'Discrepancy summary is unavailable.' : 'No pending count discrepancies require attention.'}
                        </Text>
                      )}
                      {discrepancies.length > 0 && (
                        <Text style={styles.discrepancyNote}>
                          Review decisions are not available here. These physical counts do not modify expected inventory.
                        </Text>
                      )}
                    </>
                  )}
                </ScrollView>

                <View style={styles.bottomNavigation}>
                  {(authenticatedUser.role === 'Owner'
                    ? [
                        { label: 'Dashboard', icon: '⌂' },
                        { label: 'Sales', icon: '$' },
                        { label: 'Reports', icon: '▤' },
                        { label: 'History', icon: '↻' },
                        { label: 'Alerts', icon: '!' },
                      ] as const
                    : [
                        { label: 'Dashboard', icon: '⌂' },
                        { label: 'History', icon: '↻' },
                        { label: 'Alerts', icon: '!' },
                      ] as const
                  ).map((tab) => {
                    const active = dashboardTab === tab.label;
                    return (
                      <Pressable
                        key={tab.label}
                        accessibilityRole="button"
                        accessibilityLabel={`${tab.label}${active ? ', selected' : ''}`}
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                          setDashboardTab(tab.label);
                          setDashboardMessage('');
                        }}
                        style={({ pressed }) => [styles.navigationItem, pressed && styles.navigationItemPressed]}
                      >
                        <View style={[styles.navigationIconCircle, active && styles.navigationIconActive]}>
                          <Text style={[styles.navigationIcon, active && styles.navigationIconSelected]}>{tab.icon}</Text>
                        </View>
                        <Text style={[styles.navigationLabel, active && styles.navigationLabelActive]}>{tab.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
            {visibleScreen === 'staffWorkspace' && authenticatedUser?.role === 'Staff' && (
              <StaffWorkspace
                onLogout={handleStaffLogout}
                user={authenticatedUser}
                appVersion={appConfig.expo.version}
              />
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function useAppStyles() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(createThemedStyles({
  safeArea: { flex: 1, backgroundColor: '#F1F1F4' },
  canvas: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frameShadow: { backgroundColor: '#FFFFFF' },
  desktopShadow: {
    borderRadius: 28,
    elevation: 12,
    shadowColor: '#11111D',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  appFrame: { flex: 1, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  desktopFrame: { borderRadius: 28 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  loadingLogo: { alignSelf: 'center', marginTop: '14%' },
  welcomeScreen: { flex: 1, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  whiteHeader: { height: '48%', alignItems: 'center', paddingTop: '5%', backgroundColor: '#FFFFFF' },
  headerLogo: { marginTop: 0 },
  pinkPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: PINK, borderTopLeftRadius: 36, borderTopRightRadius: 36,
    paddingHorizontal: 25,
  },
  foodImage: { position: 'absolute', alignSelf: 'center', zIndex: 2 },
  panelContent: { alignItems: 'center', width: '100%' },
  heading: { color: '#FFFFFF', fontSize: 25, fontWeight: '800', textAlign: 'center', marginBottom: 15 },
  description: { color: '#FFFFFF', fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 340 },
  button: {
    marginTop: 30, minWidth: 150, minHeight: 44, paddingHorizontal: 24,
    borderRadius: 25, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center',
    elevation: 3, shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  ownerWelcomeButton: {
    marginTop: 12,
    minWidth: 150,
    minHeight: 44,
    paddingHorizontal: 24,
    borderRadius: 25,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  loginScreen: { flex: 1, backgroundColor: '#FFFFFF' },
  loginBackground: { flex: 1 },
  loginBackgroundImage: { width: '100%', height: '100%', opacity: 0.38 },
  loginOverlay: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.62)' },
  loginHeader: { alignItems: 'center', justifyContent: 'center', paddingTop: 12, backgroundColor: '#FFFFFF' },
  loginScroll: { flex: 1 },
  loginScrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  loginCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    backgroundColor: NAVY,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 24,
    elevation: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  loginHeading: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 22 },
  loginLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginBottom: 7 },
  passwordLabel: { marginTop: 16 },
  loginInput: {
    width: '100%',
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    color: NAVY,
    fontSize: 15,
  },
  loginHelper: { color: '#C8C8D0', fontSize: 11, lineHeight: 16, marginTop: 16 },
  loginButton: {
    minHeight: 50,
    marginTop: 22,
    borderRadius: 28,
    backgroundColor: PINK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8DDE5', borderRadius: 10, padding: 11, marginBottom: 18 },
  errorIcon: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: PINK, marginRight: 9 },
  errorIconText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', lineHeight: 18 },
  errorText: { flex: 1, color: '#711433', fontSize: 12, lineHeight: 17 },
  dashboardScreen: { flex: 1, backgroundColor: DASHBOARD_COLORS.white },
  dashboardScroll: { flex: 1 },
  dashboardContent: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 28 },
  dashboardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  dashboardIdentity: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginRight: 8 },
  profileAvatar: {
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FCE3EB', marginRight: 11,
  },
  profileHead: { width: 10, height: 10, borderRadius: 5, backgroundColor: DASHBOARD_COLORS.pink, marginBottom: 2 },
  profileBody: { width: 20, height: 11, borderTopLeftRadius: 11, borderTopRightRadius: 11, backgroundColor: DASHBOARD_COLORS.pink },
  greetingGroup: { flexShrink: 1 },
  dashboardGreeting: { color: DASHBOARD_COLORS.black, fontFamily: 'Poppins_600SemiBold', fontSize: 15, lineHeight: 21 },
  dashboardSubheading: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refreshButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F7' },
  refreshButtonText: { color: NAVY, fontFamily: 'Poppins_600SemiBold', fontSize: 22, lineHeight: 26 },
  filtersCard: { padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#ECECF0', backgroundColor: '#FFFFFF', marginBottom: 14 },
  filterLabel: { color: '#555563', fontFamily: 'Poppins_600SemiBold', fontSize: 10, marginBottom: 7 },
  periodFilterLabel: { marginTop: 12 },
  filterOptions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  filterChip: { minHeight: 31, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 16, backgroundColor: '#F4F4F6', borderWidth: 1, borderColor: '#E8E8EC' },
  filterChipActive: { backgroundColor: '#FCE3EB', borderColor: '#F4B6C8' },
  filterChipText: { color: '#626270', fontFamily: 'Poppins_500Medium', fontSize: 9 },
  filterChipTextActive: { color: DASHBOARD_COLORS.pink, fontFamily: 'Poppins_600SemiBold' },
  customRangeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 9, marginTop: 12 },
  customDateField: { flex: 1, minWidth: 130 },
  customDateInput: { height: 36, paddingHorizontal: 10, borderWidth: 1, borderColor: '#E8E8EC', borderRadius: 9, color: NAVY, fontFamily: 'Poppins_400Regular', fontSize: 10 },
  applyRangeButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 9, backgroundColor: DASHBOARD_COLORS.pink },
  applyRangeText: { color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  retryButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#FFFFFF', marginLeft: 8 },
  retryButtonText: { color: DASHBOARD_COLORS.information, fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  alertButton: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F5F5F7',
  },
  themeToggleButton: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
    borderRadius: 17, backgroundColor: '#F5F5F7',
  },
  themeToggleText: { color: NAVY, fontSize: 17, lineHeight: 21 },
  alertIcon: { fontSize: 18, lineHeight: 24 },
  alertDot: {
    position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4,
    backgroundColor: DASHBOARD_COLORS.pink, borderWidth: 1, borderColor: DASHBOARD_COLORS.white,
  },
  logoutButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16, backgroundColor: '#FCE3EB' },
  logoutButtonText: { color: DASHBOARD_COLORS.pink, fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  searchBar: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13,
    borderRadius: 14, backgroundColor: '#F3F3F5', marginBottom: 16,
  },
  searchIcon: { width: 16, height: 16, borderWidth: 2, borderColor: DASHBOARD_COLORS.secondaryText, borderRadius: 8, marginRight: 11, marginLeft: 1 },
  searchIconHandle: { position: 'absolute', width: 7, height: 2, borderRadius: 1, backgroundColor: DASHBOARD_COLORS.secondaryText, right: -5, bottom: -2, transform: [{ rotate: '45deg' }] },
  searchInput: { flex: 1, height: 44, color: DASHBOARD_COLORS.black, fontFamily: 'Poppins_400Regular', fontSize: 12, paddingVertical: 0 },
  clearSearchButton: { width: 26, height: 32, alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { color: DASHBOARD_COLORS.neutral, fontFamily: 'Poppins_500Medium', fontSize: 22 },
  dashboardMessage: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, backgroundColor: '#EFEEFA', marginBottom: 14,
  },
  dashboardIntro: { marginTop: 1, marginBottom: 17 },
  dashboardTitle: { color: NAVY, fontFamily: 'Poppins_700Bold', fontSize: 23, lineHeight: 30 },
  dashboardIntroText: { color: '#777783', fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 2 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: 22 },
  metricCard: { width: '48%', minHeight: 100, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: '#ECECF0', backgroundColor: '#FFFFFF' },
  metricCardWide: { width: '23%' },
  metricLabel: { color: '#777783', fontFamily: 'Poppins_500Medium', fontSize: 9, lineHeight: 14 },
  metricValue: { color: NAVY, fontFamily: 'Poppins_700Bold', fontSize: 21, lineHeight: 27, marginTop: 5 },
  metricHint: { color: '#9797A2', fontFamily: 'Poppins_400Regular', fontSize: 8, marginTop: 4 },
  analyticsGrid: { width: '100%' },
  analyticsGridWide: { flexDirection: 'row', alignItems: 'stretch', gap: 14 },
  dataPanel: { width: '100%', minHeight: 175, borderRadius: 16, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: '#ECECF0', backgroundColor: '#FFFFFF' },
  analyticsPanelWide: { width: '49%', flex: 1 },
  panelTitle: { color: NAVY, fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  panelCaption: { color: '#8D8D98', fontFamily: 'Poppins_400Regular', fontSize: 9, marginTop: 2 },
  panelEmpty: { color: '#777783', fontFamily: 'Poppins_400Regular', fontSize: 10, paddingVertical: 14 },
  chartContent: { height: 133, flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 8, paddingHorizontal: 2 },
  chartPoint: { width: 42, height: 125, alignItems: 'center', justifyContent: 'flex-end' },
  chartValue: { width: 48, height: 15, textAlign: 'center', color: '#8A8A96', fontFamily: 'Poppins_400Regular', fontSize: 7 },
  chartBarTrack: { width: 21, height: 86, borderRadius: 7, justifyContent: 'flex-end', overflow: 'hidden', backgroundColor: '#F4F4F6', marginTop: 4 },
  chartBarFill: { width: '100%', minHeight: 0, borderTopLeftRadius: 7, borderTopRightRadius: 7, backgroundColor: DASHBOARD_COLORS.pink },
  chartLabel: { color: '#777783', fontFamily: 'Poppins_400Regular', fontSize: 8, marginTop: 5 },
  branchSalesRow: { flexDirection: 'row', alignItems: 'center', marginTop: 13 },
  branchSalesCopy: { flex: 1 },
  branchSalesName: { color: '#343440', fontFamily: 'Poppins_500Medium', fontSize: 9 },
  branchSalesMeta: { color: '#858591', fontFamily: 'Poppins_400Regular', fontSize: 8, marginTop: 2 },
  branchBarTrack: { height: 6, overflow: 'hidden', borderRadius: 4, backgroundColor: '#F0F0F3', marginTop: 6 },
  branchBarFill: { height: '100%', borderRadius: 4, backgroundColor: DASHBOARD_COLORS.orange },
  inventorySummaryPanel: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, padding: 14, marginBottom: 21, borderRadius: 16, backgroundColor: '#F7F7F9' },
  inventorySummaryItem: { width: '48%', minHeight: 59, justifyContent: 'center', paddingHorizontal: 9 },
  inventorySummaryItemWide: { width: '24%' },
  inventorySummaryValue: { color: NAVY, fontFamily: 'Poppins_700Bold', fontSize: 18 },
  inventorySummaryLabel: { color: '#777783', fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 12 },
  dataListRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 9, marginBottom: 8, borderRadius: 13, borderWidth: 1, borderColor: '#EFEFF2', backgroundColor: '#FFFFFF' },
  sectionLink: { paddingVertical: 4, paddingLeft: 8 },
  listStatusMark: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginRight: 10 },
  listStatusGlyph: { fontFamily: 'Poppins_700Bold', fontSize: 13 },
  lowStatusMark: { backgroundColor: '#FCE9EB' },
  expiringStatusMark: { backgroundColor: '#FFF2C4' },
  expiredStatusMark: { backgroundColor: '#FCE9EB' },
  dataListCopy: { flex: 1, minWidth: 0 },
  dataListTitle: { color: '#30303B', fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  dataListMeta: { color: '#81818D', fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 13, marginTop: 2 },
  dataListStatus: { maxWidth: 86, textAlign: 'right', fontFamily: 'Poppins_600SemiBold', fontSize: 8, marginLeft: 8 },
  lowStatusText: { color: '#C92F3C' },
  expiringStatusText: { color: '#8D6414' },
  expiredStatusText: { color: '#C92F3C' },
  pendingStatusText: { color: '#B9244C' },
  discrepancyRow: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8, borderRadius: 12, backgroundColor: '#FFF8F0', borderWidth: 1, borderColor: '#F6E5D2' },
  discrepancyNote: { color: '#777783', fontFamily: 'Poppins_400Regular', fontSize: 9, lineHeight: 14, marginBottom: 17 },
  loadingPanel: { minHeight: 150, alignItems: 'center', justifyContent: 'center', padding: 20, borderWidth: 1, borderColor: '#ECECF0', borderRadius: 16, backgroundColor: '#FFFFFF' },
  loadingPanelText: { color: '#777783', fontFamily: 'Poppins_400Regular', fontSize: 10, marginTop: 8 },
  dashboardMessageText: { flex: 1, color: DASHBOARD_COLORS.information, fontFamily: 'Poppins_500Medium', fontSize: 11, lineHeight: 16 },
  dismissMessage: { color: DASHBOARD_COLORS.information, fontSize: 18, marginLeft: 8 },
  summaryCard: {
    minHeight: 174, overflow: 'hidden', position: 'relative', justifyContent: 'center',
    paddingHorizontal: 17, paddingVertical: 15, borderRadius: 23, backgroundColor: DASHBOARD_COLORS.navy,
    marginBottom: 21, elevation: 5, shadowColor: DASHBOARD_COLORS.navy, shadowOpacity: 0.16,
    shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  summaryCopy: { width: '75%', zIndex: 2 },
  summaryEyebrow: { color: DASHBOARD_COLORS.white, fontFamily: 'Poppins_600SemiBold', fontSize: 10, letterSpacing: 1.1 },
  summaryCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 5 },
  summaryCount: { color: DASHBOARD_COLORS.orange, fontFamily: 'Poppins_700Bold', fontSize: 38, lineHeight: 46 },
  summaryCountLabel: { color: DASHBOARD_COLORS.white, fontFamily: 'Poppins_500Medium', fontSize: 11 },
  alertCountRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  alertCountDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: DASHBOARD_COLORS.warning, marginRight: 7 },
  alertCountText: { color: DASHBOARD_COLORS.white, fontFamily: 'Poppins_400Regular', fontSize: 10 },
  checkNowButton: {
    alignSelf: 'flex-start', minHeight: 33, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 13, marginTop: 12, borderRadius: 18, backgroundColor: DASHBOARD_COLORS.pink,
  },
  checkNowText: { color: DASHBOARD_COLORS.white, fontFamily: 'Poppins_600SemiBold', fontSize: 11 },
  checkNowArrow: { color: DASHBOARD_COLORS.white, fontSize: 18, lineHeight: 20, marginLeft: 5 },
  summaryFoodCircle: {
    position: 'absolute', right: -8, top: 25, width: 132, height: 132, borderRadius: 66,
    backgroundColor: DASHBOARD_COLORS.butterCream, overflow: 'hidden', borderWidth: 4, borderColor: '#35364A',
  },
  summaryFoodImage: { width: '100%', height: '100%', borderRadius: 66 },
  summaryDemoLabel: {
    position: 'absolute', right: 15, bottom: 12, color: DASHBOARD_COLORS.secondaryText,
    fontFamily: 'Poppins_600SemiBold', fontSize: 8, letterSpacing: 1,
  },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  sectionHeading: { color: DASHBOARD_COLORS.black, fontFamily: 'Poppins_600SemiBold', fontSize: 16 },
  sectionCaption: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 10 },
  quickActions: { flexDirection: 'row', gap: 8, marginBottom: 22 },
  quickAction: {
    flex: 1, minWidth: 0, minHeight: 82, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, paddingVertical: 9, borderRadius: 17, backgroundColor: DASHBOARD_COLORS.white,
    borderWidth: 1, borderColor: '#F0F0F2', elevation: 2, shadowColor: '#0F1025',
    shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
  },
  quickActionPressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  quickActionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  quickActionGlyph: { fontFamily: 'Poppins_600SemiBold', fontSize: 20, lineHeight: 24 },
  quickActionLabel: { color: DASHBOARD_COLORS.navy, fontFamily: 'Poppins_500Medium', fontSize: 9, textAlign: 'center' },
  viewAllText: { color: DASHBOARD_COLORS.pink, fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  itemCarousel: { gap: 12, paddingBottom: 5 },
  itemCard: {
    height: 108, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, flexShrink: 0,
    borderRadius: 24, backgroundColor: '#EEEEEE', borderWidth: 1, borderColor: '#E8E8EA',
    elevation: 2, shadowColor: DASHBOARD_COLORS.navy, shadowOpacity: 0.07, shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  itemImageContainer: {
    width: 86, height: 86, flexShrink: 0, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: DASHBOARD_COLORS.white, overflow: 'hidden',
  },
  itemImage: { width: '100%', height: '100%', borderRadius: 20 },
  itemDetails: { flex: 1, flexShrink: 1, minWidth: 0, justifyContent: 'center', marginLeft: 12, marginRight: 6 },
  itemName: { color: DASHBOARD_COLORS.black, fontFamily: 'Poppins_600SemiBold', fontSize: 18, lineHeight: 24 },
  itemCategory: { color: '#555560', fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 19, marginTop: 2 },
  itemStatusColumn: { width: 100, flexShrink: 0, alignItems: 'flex-end', justifyContent: 'center' },
  itemQuantity: { color: DASHBOARD_COLORS.black, fontFamily: 'Poppins_600SemiBold', fontSize: 18, lineHeight: 24, marginBottom: 3 },
  warningBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end',
    paddingHorizontal: 7, paddingVertical: 4, borderRadius: 9, backgroundColor: DASHBOARD_COLORS.warning,
  },
  warningBadgeIcon: { color: DASHBOARD_COLORS.navy, fontSize: 11, lineHeight: 13, marginRight: 3 },
  warningBadgeText: { color: DASHBOARD_COLORS.navy, fontFamily: 'Poppins_500Medium', fontSize: 10 },
  expirationHeading: { marginTop: 20 },
  expirationCount: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 10 },
  expirationBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end',
    paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: DASHBOARD_COLORS.error,
  },
  expirationBadgeIcon: { color: DASHBOARD_COLORS.white, fontSize: 11, lineHeight: 13, marginRight: 3 },
  expirationBadgeText: { color: DASHBOARD_COLORS.white, fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  emptySearchText: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 11, marginBottom: 8 },
  demoNotice: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 21 },
  historyView: { paddingTop: 8 },
  historyCaption: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 10, marginTop: 3, marginBottom: 13 },
  activityCard: {
    minHeight: 68, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16,
    backgroundColor: DASHBOARD_COLORS.white, marginBottom: 9, borderWidth: 1, borderColor: '#F0F0F2',
  },
  activityIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFEEFA', marginRight: 11 },
  activityIconText: { color: DASHBOARD_COLORS.information, fontFamily: 'Poppins_600SemiBold', fontSize: 17 },
  activityCopy: { flex: 1 },
  activityTitle: { color: DASHBOARD_COLORS.navy, fontFamily: 'Poppins_600SemiBold', fontSize: 11 },
  activityDetail: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 9, marginTop: 3 },
  alertsNote: { padding: 14, borderRadius: 15, backgroundColor: '#EFEEFA', marginTop: 17 },
  alertsNoteTitle: { color: DASHBOARD_COLORS.information, fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
  alertsNoteText: { color: DASHBOARD_COLORS.navy, fontFamily: 'Poppins_400Regular', fontSize: 10, lineHeight: 15, marginTop: 4 },
  bottomNavigation: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', minHeight: 66,
    marginHorizontal: 15, marginBottom: 10, paddingHorizontal: 8, borderRadius: 24,
    backgroundColor: DASHBOARD_COLORS.navy, elevation: 8, shadowColor: DASHBOARD_COLORS.navy,
    shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 5 },
  },
  navigationItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 58 },
  navigationItemPressed: { opacity: 0.75 },
  navigationIconCircle: { width: 31, height: 29, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  navigationIconActive: { backgroundColor: DASHBOARD_COLORS.pink },
  navigationIcon: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_600SemiBold', fontSize: 19, lineHeight: 23 },
  navigationIconSelected: { color: DASHBOARD_COLORS.white },
  navigationLabel: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_500Medium', fontSize: 9, marginTop: 1 },
  navigationLabelActive: { color: DASHBOARD_COLORS.white },
  }, theme)), [theme]);
}
