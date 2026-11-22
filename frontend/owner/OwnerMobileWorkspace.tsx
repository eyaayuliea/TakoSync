import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  PanResponder,
  Pressable,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import OwnerSalesWorkspace from './OwnerSalesWorkspace';
import OwnerIngredientsRecipes from './OwnerIngredientsRecipes';
import { resolveNearExpirationDays } from '../services/inventoryStatusRules.ts';
import { lowStockThreshold } from '../services/reorderPoint.ts';
import OwnerStockExpirationSettings from './OwnerStockExpirationSettings';
import OwnerBusinessDaySettings from './OwnerBusinessDaySettings';
import OwnerStaffAccounts from './OwnerStaffAccounts';
import SalesTransactionRecords from './SalesTransactionRecords';
import SalesConsumptionRecords from './SalesConsumptionRecords';
import StockInRecordsScreen from './StockInRecordsScreen';
import WasteSpillageRecordsScreen from './WasteSpillageRecordsScreen';
import PhysicalCountRecordsScreen from './PhysicalCountRecordsScreen';
import AuthorizedAdjustmentRecordsScreen from './AuthorizedAdjustmentRecordsScreen';
import OwnerRequestsScreen from './OwnerRequestsScreen';
import DailyClosingReportScreen from './DailyClosingReportScreen';
import VoidReportScreen from './VoidReportScreen';
import ReversalReportScreen from './ReversalReportScreen';
import OwnerProfileScreen from './OwnerProfileScreen';
import { OWNER_NAVIGATION_HEIGHT, OwnerBottomNav, type OwnerTab } from '../navigation/BottomNavigation';
import {
  MoreMenuScreen,
  OwnerMenuIcon,
  OwnerMenuTitleScreen,
  RecordsMenuScreen,
} from './OwnerMenuScreens';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import { ownerColors } from './shared/ownerTokens';
import {
  decideOwnerInventoryCountCorrection,
  createProduct,
  loadOwnerActivityData,
  loadOwnerDiscrepancyReviews,
  loadOwnerInventory,
  loadProductManagement,
  validateOwnerSubmittedInventoryCount,
  validateOwnerInventoryCountCorrection,
  rejectOwnerSubmittedInventoryCount,
  isOwnerDiscrepancyRecountable,
  ownerDiscrepancyStatusLabel,
  isOwnerDiscrepancyActionable,
  isOwnerDiscrepancyValidatable,
  getOwnerSaleInventoryStatusLabel,
  updateProduct,
  type AppUser,
  type OwnerDiscrepancyReview,
  type ProductManagementItem,
  type OwnerSalesData,
} from '../services/takosync';
import { standardProductVariants } from '../services/productCatalog';
import { inventoryTransactionLabel } from '../services/transactionLabels';
import { manilaDateKey } from '../services/businessDaySettings';
import {
  OWNER_ALERT_EMPTY_MESSAGE,
  OWNER_ALERT_LOAD_ERROR,
  OWNER_ALERT_TABS,
  OWNER_ALERTS_DECISION_NOTE,
  buildOwnerAlertSnapshot,
  countOwnerAlertsWhenReady,
  filterOwnerRecordsByBranch,
  splitOwnerAlertsByTab,
  type OwnerAlertTab,
  type OwnerExpirationAlert,
  type OwnerLowStockAlert,
} from './ownerAlerts';
import {
  summarizeOwnerDashboardSales,
  summarizeOwnerInventoryStatus,
  summarizeOwnerInventoryStatusByBranch,
} from './ownerDashboardSummary';
import { sortOwnerActivities } from './ownerActivities';
import {
  buildOwnerInventoryComparisonRows,
  formatInventoryQuantity,
  getInventoryStockStatus,
  type InventoryStockStatus,
} from './ownerInventoryStatus';

type OwnerPeriod = 'Today' | 'This Week' | 'This Month' | 'Custom';
type OwnerPage = 'Dashboard' | 'Sales' | 'Reports' | 'Inventory' | 'CompareInventory' | 'Alerts' | 'More' | 'Products' | 'Ingredients' | 'StockSettings' | 'BusinessHours' | 'Discrepancies' | 'Records' | 'SalesTransactions' | 'RecordCategories' | 'SalesConsumptionRecords' | 'StockInRecords' | 'WasteSpillageRecords' | 'PhysicalCountRecords' | 'AuthorizedAdjustmentRecords' | 'ActivityDetail' | 'Profile' | 'StaffAccounts' | 'VoidRequests' | 'DailyClosingReport' | 'VoidReport' | 'ReversalReport';
type OwnerData = Awaited<ReturnType<typeof loadOwnerInventory>>;
type ActivityData = Awaited<ReturnType<typeof loadOwnerActivityData>>;
type Branch = OwnerData['branches'][number];
const EMPTY_BRANCHES: OwnerData['branches'] = [];
type ProductRecord = ProductManagementItem;
type OwnerActivity = {
  id: string;
  category: 'Sales' | 'Inventory' | 'Counts' | 'Audit';
  type: string;
  detail: string;
  branchId: string;
  reference: string | null;
  date: string;
  amount: number | null;
};

const colors = {
  pink: ownerColors.primary,
  navy: ownerColors.navy,
  orange: ownerColors.orange,
  ink: '#171724',
  muted: '#858591',
  secondaryText: '#858591',
  pale: '#F5F5F7',
  line: '#EEEEF1',
  white: '#FFFFFF',
  green: '#2F8C57',
  paleGreen: '#E8F6EC',
  red: '#C92F3C',
  paleRed: '#FCE9EB',
  yellow: '#FFF2C4',
  paleOrange: '#FFF1D8',
  alertCrimson: ownerColors.primary,
  alertNavy: ownerColors.navy,
  alertGrayFill: '#F5F5F7',
  alertDivider: '#EEEEF1',
  alertLowStock: '#FDE672',
  alertOutStock: '#C92F3C',
  alertNearExpiration: ownerColors.orange,
  alertSuccess: '#589144',
  alertLavender: '#EEEAFE',
  alertDarkText: '#343440',
  discrepancyPending: '#FDE672',
  discrepancyPendingText: '#343440',
  discrepancyAdjusted: '#589144',
  discrepancyCorrection: '#FCE3EB',
  discrepancyLavender: '#EEEAFE',
  differencePositive: '#589144',
  discrepancyRed: '#C92F3C',
} as const;

const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

function currency(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(value);
}

function compactDate(value: string) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function manilaDateLabel(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00+08:00`);
  return date.toLocaleDateString('en-PH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  });
}

function StatusBadge({ label, tone }: { label: string; tone: 'low' | 'good' | 'warning' }) {
  const styles = useStyles();
  return (
    <View style={[styles.statusBadge, tone === 'low' ? styles.lowBadge : tone === 'warning' ? styles.warningBadge : styles.goodBadge]}>
      <Text style={[styles.statusBadgeText, tone === 'low' ? styles.lowBadgeText : tone === 'warning' ? styles.warningBadgeText : styles.goodBadgeText]}>
        {label}
      </Text>
    </View>
  );

}

function InventoryStatusBadge({ status }: { status: InventoryStockStatus }) {
  const styles = useStyles();
  const style =
    status === 'Normal' ? styles.omInventoryBadgeNormal
      : status === 'Out of Stock' || status === 'Expired' ? styles.omInventoryBadgeOut
        : status === 'Near Expiration' ? styles.omInventoryBadgeNear
          : status === 'Not tracked' ? styles.omInventoryBadgeNotTracked
            : styles.omInventoryBadgeLow;
  return (
    <View style={[styles.omInventoryBadge, style]}>
      <Text style={[
        styles.omInventoryBadgeText,
        (status === 'Normal' || status === 'Out of Stock' || status === 'Expired') && styles.omInventoryBadgeTextWhite,
        status === 'Not tracked' && styles.omInventoryBadgeTextMuted,
      ]}>
        {status === 'Normal' ? '✓ ' : status === 'Out of Stock' || status === 'Expired' ? '! ' : status === 'Near Expiration' ? '▣ ' : ''}
        {status}
      </Text>
    </View>
  );
}

function SectionHeading({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction && (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.sectionActionButton}>
          <Text style={styles.sectionActionText}>{action} ›</Text>
        </Pressable>
      )}
    </View>
  );
}

/** OM-02 criterion 9: placeholder shapes (not a spinner) while dashboard data loads. */
function SkeletonCard({ label, lines = 2 }: { label: string; lines?: number }) {
  const styles = useStyles();
  return (
    <View
      style={styles.skeletonCard}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <View style={[styles.skeletonBar, styles.skeletonBarWide]} />
      {Array.from({ length: Math.max(0, lines - 1) }, (_, index) => (
        <View key={index} style={[styles.skeletonBar, styles.skeletonBarNarrow]} />
      ))}
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  const styles = useStyles();
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>{text}</Text>
    </View>
  );
}

export default function OwnerMobileWorkspace({
  user,
  availableWidth,
  onLogout,
  data,
  inventoryLoading,
  inventoryError,
  salesData,
  salesLoading,
  salesError,
  activityData,
  activityLoading,
  activityError,
  branchId,
  onBranchChange,
  period,
  onPeriodChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  onApplyCustomRange,
  onRefresh,
  refreshing,
  loggingOut,
  onBusinessSessionDeadlineChange,
}: {
  user: AppUser;
  availableWidth: number;
  onLogout: () => Promise<void>;
  data: OwnerData | null;
  inventoryLoading: boolean;
  inventoryError: string;
  salesData: OwnerSalesData | null;
  salesLoading: boolean;
  salesError: string;
  activityData: ActivityData | null;
  activityLoading: boolean;
  activityError: string;
  branchId: string | null;
  onBranchChange: (branchId: string | null) => void;
  period: OwnerPeriod;
  onPeriodChange: (period: OwnerPeriod) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  onApplyCustomRange: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  loggingOut: boolean;
  onBusinessSessionDeadlineChange: (millisecondsUntilExpiration: number) => void;
}) {
  const styles = useStyles();
  const { colors: themeColors, ownerMenu } = useTheme();
  const contentWidth = availableWidth;
  const [page, setPage] = useState<OwnerPage>('Dashboard');
  const [initialSalesTransactionId, setInitialSalesTransactionId] = useState<string | null>(null);
  const menuHistory = useRef<OwnerPage[]>([]);
  const goBackFromMenu = useCallback(() => {
    const previousPage = menuHistory.current.pop();
    if (!previousPage) return false;
    setPage(previousPage);
    return true;
  }, []);
  const pushMenuPage = useCallback((from: OwnerPage, to: OwnerPage) => {
    menuHistory.current.push(from);
    setPage(to);
  }, []);
  useEffect(() => {
    if (menuHistory.current.length === 0) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBackFromMenu);
    return () => subscription.remove();
  }, [goBackFromMenu, page]);
  const menuBackGesture = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Platform.OS === 'ios' &&
      menuHistory.current.length > 0 &&
      gesture.x0 <= ownerMenu.layout.backGestureEdgeWidth &&
      gesture.dx >= ownerMenu.layout.backGestureActivationDistance &&
      Math.abs(gesture.dy) <= ownerMenu.layout.backGestureVerticalTolerance,
    onPanResponderRelease: (_event, gesture) => {
      if (
        gesture.dx >= ownerMenu.layout.backGestureActivationDistance &&
        Math.abs(gesture.dy) <= ownerMenu.layout.backGestureVerticalTolerance
      ) {
        goBackFromMenu();
      }
    },
  }), [goBackFromMenu, ownerMenu]);
  const [selectedActivity, setSelectedActivity] = useState<OwnerActivity | null>(null);
  const [activityReturnPage, setActivityReturnPage] = useState<'Dashboard' | 'Records'>('Dashboard');
  const [inventorySearch, setInventorySearch] = useState('');
  // OM-12 c1, c5: the Inventory page has its own branch (first branch by default) and a category filter.
  const [inventoryBranchId, setInventoryBranchId] = useState<string | null>(null);
  const [inventoryCategory, setInventoryCategory] = useState('All categories');
  const [alertCategory, setAlertCategory] = useState<OwnerAlertTab>('Low Stock');
  const [recordType, setRecordType] = useState<'All' | 'Sales' | 'Inventory' | 'Counts' | 'Audit'>('All');
  const [productRecords, setProductRecords] = useState<ProductRecord[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productEditorMode, setProductEditorMode] = useState<'add' | 'edit' | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [productForm, setProductForm] = useState<{
    product_name: string;
    description: string;
    variantPrices: Record<string, string>;
    is_available: boolean;
  }>({
    product_name: '',
    description: '',
    variantPrices: {},
    is_available: true,
  });
  const [productFormErrors, setProductFormErrors] = useState<Partial<Record<'product_name' | 'description' | 'variantPrices', string>>>({});
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [productSaving, setProductSaving] = useState(false);
  const [productFeedback, setProductFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [discrepancyReviews, setDiscrepancyReviews] = useState<OwnerDiscrepancyReview[]>([]);
  const [discrepancyReviewsLoaded, setDiscrepancyReviewsLoaded] = useState(false);
  const [discrepancyLoading, setDiscrepancyLoading] = useState(false);
  const [discrepancyError, setDiscrepancyError] = useState('');
  const [discrepancyFeedback, setDiscrepancyFeedback] = useState('');
  const [selectedDiscrepancyId, setSelectedDiscrepancyId] = useState<string | null>(null);
  const [discrepancyAction, setDiscrepancyAction] = useState<'approve' | 'reject' | 'validate' | 'recount' | null>(null);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [adjustmentError, setAdjustmentError] = useState('');
  const [adjustmentSubmitting, setAdjustmentSubmitting] = useState(false);
  const [discrepancyView, setDiscrepancyView] = useState<'list' | 'details'>('list');
  const [discrepancyBranchFilter, setDiscrepancyBranchFilter] = useState<string | null>(null);
  const [discrepancyStatusFilter, setDiscrepancyStatusFilter] = useState<'All status' | OwnerDiscrepancyReview['status']>('All status');
  const [discrepancyDraftBranch, setDiscrepancyDraftBranch] = useState<string | null>(null);
  const [discrepancyDraftStatus, setDiscrepancyDraftStatus] = useState<'All status' | OwnerDiscrepancyReview['status']>('All status');
  const [discrepancyFilterVisible, setDiscrepancyFilterVisible] = useState(false);
  const [periodSheetVisible, setPeriodSheetVisible] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [activityDetailModalVisible, setActivityDetailModalVisible] = useState(false);
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string>(customStart);
  const [compareIngredient, setCompareIngredient] = useState<OwnerData['ingredients'][number] | null>(null);
  const [ingredientSheetVisible, setIngredientSheetVisible] = useState(false);
  const [ingredientSearch, setIngredientSearch] = useState('');

  useEffect(() => {
    if (page !== 'Sales' && page !== 'Inventory' && page !== 'Alerts') return;
    // Refresh the shared Owner snapshot when entering monitoring pages so
    // Staff-confirmed sales and their inventory movements are read together.
    // The parent refresh is guarded against overlapping requests and loads
    // sales, inventory, and activity through the existing RLS-backed services.
    void onRefresh();
  }, [page]);

  const branches = data?.branches ?? EMPTY_BRANCHES;
  const branchNames = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);
  const ingredients = useMemo(() => new Map((data?.ingredients ?? []).map((ingredient) => [ingredient.id, ingredient])), [data?.ingredients]);
  const categories = useMemo(() => new Map((data?.categories ?? []).map((category) => [category.id, category.name])), [data?.categories]);
  const alertSnapshot = useMemo(() => {
    return buildOwnerAlertSnapshot({
      inventory: data?.inventory ?? [],
      batches: data?.batches ?? [],
      ingredients: (data?.ingredients ?? []).map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        expiration_tracking: ingredient.expiration_tracking,
      })),
      branches,
      nearExpirationDays: resolveNearExpirationDays(data?.nearExpirationDays),
      branchId,
    });
  }, [branchId, branches, data]);
  const allInventoryRows = (data?.inventory ?? []).flatMap((record) => {
    const ingredient = ingredients.get(record.ingredient_id);
    if (!ingredient) return [];
    const quantity = record.quantity === null ? null : Number(record.quantity);
    const minimumStock = Number(record.minimum_stock);
    // A2: the item is low at or below its reorder point (never below the owner minimum).
    const reorderPoint = lowStockThreshold(record);
    const activeBatches = (data?.batches ?? [])
      .filter((item) => item.branch_id === record.branch_id
        && item.ingredient_id === record.ingredient_id
        && Number(item.quantity_remaining) > 0)
      .sort((left, right) => {
        const leftExpiry = left.expiration_date ?? '9999-12-31';
        const rightExpiry = right.expiration_date ?? '9999-12-31';
        return leftExpiry.localeCompare(rightExpiry) || left.id.localeCompare(right.id);
      });
    const batchRows = activeBatches.map((batch) => ({
      id: batch.id,
      reference: batch.batch_reference,
      expirationDate: batch.expiration_date,
      quantityRemaining: Number(batch.quantity_remaining),
      status: ingredient.expiration_tracking && batch.expiration_date
        ? getInventoryStockStatus(
          Number(batch.quantity_remaining),
          0,
          batch.expiration_date,
          manilaDateKey(new Date()),
          resolveNearExpirationDays(data?.nearExpirationDays),
        )
        : null,
    }));
    return [{
      id: `${record.branch_id}:${record.ingredient_id}`,
      ingredientId: record.ingredient_id,
      branchId: record.branch_id,
      branch: branchNames.get(record.branch_id) ?? 'Branch unavailable',
      name: ingredient.name,
      category: categories.get(ingredient.category_id) ?? 'Other',
      quantity,
      minimumStock,
      reorderPoint,
      unit: ingredient.unit,
      expirationTracking: ingredient.expiration_tracking,
      status: getInventoryStockStatus(quantity, reorderPoint),
      batches: batchRows,
    }];
  });
  const inventoryRows = branchId ? allInventoryRows.filter((row) => row.branchId === branchId) : allInventoryRows;
  const effectiveInventoryBranchId = inventoryBranchId ?? branches[0]?.id ?? null;
  const inventoryPageRows = allInventoryRows.filter((row) => row.branchId === effectiveInventoryBranchId);
  const inventoryCategoryOptions = ['All categories', ...[...new Set(inventoryPageRows.map((row) => row.category))].sort()];
  const dashboardLowStock = inventoryRows.filter((item) => item.status === 'Low Stock' || item.status === 'Out of Stock');
  const inventoryStatusCounts = summarizeOwnerInventoryStatus(inventoryRows.map((item) => ({
    quantity: item.quantity,
    minimum_stock: item.minimumStock,
    low_stock_threshold: item.reorderPoint,
  })));
  const lowStock = alertSnapshot.lowStock;
  const sortedExpirationItems = alertSnapshot.expiration;
  const selectedSales = salesData?.sales ?? [];
  const salesSummary = summarizeOwnerDashboardSales(selectedSales, branches, branchId);
  const totalSelectedSales = salesSummary.total;
  const averageTransaction = salesSummary.transactions ? totalSelectedSales / salesSummary.transactions : 0;
  const branchMetrics = salesSummary.branchMetrics;
  const bestBranch = branchMetrics.filter((branch) => branch.transactions > 0)
    .sort((a, b) => b.total - a.total)[0];
  const pendingChecks = (activityData?.dailyChecks ?? []).filter((check) => check.status === 'pending_owner_review');
  const activityDiscrepancies = (activityData?.countLines ?? []).flatMap((line) => {
    if (Number(line.difference) === 0) return [];
    const check = pendingChecks.find((item) => item.id === line.daily_stock_check_id);
    if (!check) return [];
    return [{
      id: `${check.id}:${line.ingredient_id}`,
      ingredient: ingredients.get(line.ingredient_id)?.name ?? line.ingredient_id,
      branch: branchNames.get(check.branch_id) ?? 'Branch unavailable',
      expected: Number(line.recorded_quantity),
      actual: Number(line.physical_quantity),
      difference: Number(line.difference),
      unit: line.unit,
      reference: check.reference,
      submittedAt: check.created_at,
      remarks: check.remarks,
      status: check.status,
    }];
  });
  const visibleDiscrepancies = discrepancyReviews.filter((review) =>
    (discrepancyStatusFilter === 'All status' || review.status === discrepancyStatusFilter)
    && (!discrepancyBranchFilter || review.branchId === discrepancyBranchFilter),
  );
  const pendingDiscrepancyCount = discrepancyReviews.filter((review) => review.status === 'Pending').length;
  const selectedDiscrepancy = discrepancyReviews.find((review) => review.correctionRequestId === selectedDiscrepancyId) ?? null;
  const dashboardDiscrepancies = discrepancyReviewsLoaded
    ? discrepancyReviews.filter((review) => review.status === 'Pending')
      .map((review) => ({ ...review, id: review.countLineId }))
    : [];
  const activities: OwnerActivity[] = [
    ...(activityData?.transactions ?? []).map((item) => ({
      id: item.id,
      category: 'Inventory' as const,
      type: inventoryTransactionLabel(item.type),
      detail: `${ingredients.get(item.ingredient_id)?.name ?? item.ingredient_id} · ${Number(item.quantity)} ${item.unit}`,
      branchId: item.branch_id,
      reference: item.reference,
      date: item.transaction_date,
      amount: null as number | null,
    })),
    ...selectedSales.map((item) => ({
      id: item.id,
      category: 'Sales' as const,
      type: 'Completed Sale',
      detail: `${currency(Number(item.total_amount))} · Inventory: ${getOwnerSaleInventoryStatusLabel(item)}`,
      branchId: item.branch_id,
      reference: item.transaction_reference,
      date: item.created_at,
      amount: Number(item.total_amount),
    })),
    ...(activityData?.dailyChecks ?? []).map((item) => ({
      id: item.id,
      category: 'Counts' as const,
      type: 'Physical Inventory Count',
      detail: item.remarks || `Submitted for review · ${item.check_date}`,
      branchId: item.branch_id,
      reference: item.reference,
      date: item.created_at,
      amount: null as number | null,
    })),
    ...(activityData?.auditLogs ?? []).map((item) => ({
      id: item.id,
      category: 'Audit' as const,
      type: item.action,
      detail: item.description || 'No description recorded.',
      branchId: item.branch_id ?? '',
      reference: null as string | null,
      date: item.created_at,
      amount: null as number | null,
    })),
    ...activityDiscrepancies.map((item) => ({
      id: item.id,
      category: 'Counts' as const,
      type: 'Inventory Discrepancy',
      detail: `${item.ingredient} · Expected ${item.expected} ${item.unit}, counted ${item.actual} ${item.unit}`,
      branchId: pendingChecks.find((check) => check.reference === item.reference)?.branch_id ?? '',
      reference: item.reference,
      date: item.submittedAt,
      amount: null as number | null,
    })),
  ];
  const sortedActivities = sortOwnerActivities(activities);
  const visibleActivities = sortedActivities.filter((item) => recordType === 'All' || item.category === recordType);
  const filteredInventory = inventoryPageRows.filter((item) =>
    (inventoryCategory === 'All categories' || item.category === inventoryCategory)
    && `${item.name} ${item.category} ${item.branch}`.toLowerCase().includes(inventorySearch.trim().toLowerCase()),
  );
  const alertCounts = countOwnerAlertsWhenReady(alertSnapshot.counts, inventoryLoading, inventoryError);
  const visibleProducts = productRecords.filter((product) =>
    `${product.product_name} ${product.description}`.toLowerCase().includes(productSearch.trim().toLowerCase()),
  );
  const availableProductCount = productRecords.filter((product) => product.is_available).length;
  const unavailableProductCount = productRecords.length - availableProductCount;

  const refreshProducts = async () => {
    setProductsLoading(true);
    setProductsError('');
    try {
      const nextProducts = await loadProductManagement();
      setProductRecords(nextProducts);
    } catch (error) {
      setProductsError(error instanceof Error ? error.message : 'Unable to load products and menu items.');
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    if (page !== 'Products') return;
    void refreshProducts();
  }, [page]);

  const refreshDiscrepancyReviews = async (requestedBranchId = branchId) => {
    setDiscrepancyLoading(true);
    setDiscrepancyError('');
    try {
      const reviews = await loadOwnerDiscrepancyReviews(requestedBranchId);
      setDiscrepancyReviews(reviews);
      setDiscrepancyReviewsLoaded(true);
    } catch (error) {
      setDiscrepancyError(error instanceof Error ? error.message : 'Unable to load discrepancy reviews.');
    } finally {
      setDiscrepancyLoading(false);
    }
  };

  const refreshOwnerData = async () => {
    await Promise.all([onRefresh(), refreshDiscrepancyReviews()]);
  };

  useEffect(() => {
    if (page !== 'Dashboard' && page !== 'Discrepancies' && page !== 'More') return;
    setDiscrepancyReviews([]);
    setDiscrepancyReviewsLoaded(false);
    void refreshDiscrepancyReviews(page === 'Discrepancies' ? null : branchId);
  }, [page, branchId]);

  const submitDiscrepancyAction = async () => {
    if (!selectedDiscrepancy) return;
    const reason = adjustmentReason.trim();
    if (!reason) {
      setAdjustmentError('A decision or validation reason is required.');
      return;
    }
    if (reason.length > 1000) {
      setAdjustmentError('The reason must be 1000 characters or fewer.');
      return;
    }

    setAdjustmentSubmitting(true);
    setAdjustmentError('');
    setDiscrepancyFeedback('');
    try {
      if (discrepancyAction === 'approve' || discrepancyAction === 'reject') {
        await decideOwnerInventoryCountCorrection({
          requestId: selectedDiscrepancy.correctionRequestId,
          decision: discrepancyAction === 'approve' ? 'approved' : 'rejected',
          reason,
        });
        setDiscrepancyFeedback(discrepancyAction === 'approve'
          ? 'Correction request approved. Use Validate Count separately to authorize inventory changes.'
          : 'Correction request rejected. The original count and decision were retained.');
      } else if (discrepancyAction === 'validate') {
        const validation = selectedDiscrepancy.validationTarget === 'count'
          ? await validateOwnerSubmittedInventoryCount({
            countLineId: selectedDiscrepancy.countLineId,
            reason,
          })
          : await validateOwnerInventoryCountCorrection({
            requestId: selectedDiscrepancy.correctionRequestId,
            reason,
          });
        setDiscrepancyFeedback(validation.outcome === 'no_change'
          ? 'Count validated and discrepancy resolved without changing inventory.'
          : 'Count validated. The counted difference was added to the current balance, so later sales are kept.');
      } else if (discrepancyAction === 'recount') {
        // OM-14 c9: Reject Count asks staff for a new count; stock is not changed.
        await rejectOwnerSubmittedInventoryCount({ countLineId: selectedDiscrepancy.countLineId, reason });
        setDiscrepancyFeedback('Count rejected. Staff are asked to submit a new count; the expected quantity was not changed.');
      } else {
        throw new Error('Choose an Owner decision or Validate Count action.');
      }
      setSelectedDiscrepancyId(null);
      setDiscrepancyAction(null);
      setAdjustmentReason('');
      setDiscrepancyView('list');
      await refreshDiscrepancyReviews();
      await onRefresh();
    } catch (error) {
      setAdjustmentError(error instanceof Error ? error.message : 'Unable to save the count decision.');
    } finally {
      setAdjustmentSubmitting(false);
    }
  };

  const resetProductForm = (mode: 'add' | 'edit', product?: ProductRecord) => {
    setProductEditorMode(mode);
    setProductFeedback(null);
    setProductFormErrors({});
    setSelectedProduct(product ?? null);
    setProductForm({
      product_name: product?.product_name ?? '',
      description: product?.description ?? '',
      variantPrices: product
        ? Object.fromEntries(product.variants.map((variant) => [variant.id, String(variant.price)]))
        : Object.fromEntries(standardProductVariants.map((variant) => [variant.variant_code, ''])),
      is_available: product?.is_available ?? true,
    });
  };

  const submitProductForm = async () => {
    if (productSaving) return;
    const errors: Partial<Record<'product_name' | 'description' | 'variantPrices', string>> = {};
    const name = productForm.product_name.trim();
    const description = productForm.description.trim();
    if (!name) errors.product_name = 'Product name is required.';
    if (!description) errors.description = 'Product description is required.';
    const variants = productEditorMode === 'edit' && selectedProduct
      ? selectedProduct.variants.map((variant) => ({
        key: variant.id,
        variant_code: variant.variant_code,
        size_label: variant.size_label,
        piece_count: variant.piece_count,
        price: Number(productForm.variantPrices[variant.id]),
      }))
      : standardProductVariants.map((variant) => ({
        ...variant,
        key: variant.variant_code,
        price: Number(productForm.variantPrices[variant.variant_code]),
      }));
    if (variants.length === 0 || variants.some((variant) =>
      !productForm.variantPrices[variant.key]?.trim() ||
      !Number.isFinite(variant.price) ||
      variant.price < 0,
    )) {
      errors.variantPrices = 'Enter a valid selling price for every POS variant.';
    }
    if (Object.keys(errors).length) {
      setProductFormErrors(errors);
      return;
    }

    setProductSaving(true);
    setProductFormErrors({});
    try {
      const payload = {
        product_name: name,
        description,
        is_available: productForm.is_available,
      };
      if (productEditorMode === 'edit' && selectedProduct) {
        await updateProduct(selectedProduct.id, {
          ...payload,
          variants: variants.map((variant) => ({ id: variant.key, price: variant.price })),
        });
      } else {
        await createProduct({
          ...payload,
          variants: variants.map(({ variant_code, size_label, piece_count, price }) => ({
            variant_code,
            size_label,
            piece_count,
            price,
          })),
        });
      }

      setProductFeedback({
        type: 'success',
        text: productEditorMode === 'edit' ? 'Product updated successfully.' : 'Product added successfully.',
      });
      setProductEditorMode(null);
      setSelectedProduct(null);
      await refreshProducts();
    } catch (error) {
      setProductFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Unable to save this product right now.',
      });
    } finally {
      setProductSaving(false);
    }
  };

  const activePrimaryPage = page === 'Reports' ? 'Sales'
    : page === 'CompareInventory' ? 'Inventory'
      : page === 'Records' || page === 'SalesTransactions' || page === 'RecordCategories'
        || page === 'SalesConsumptionRecords' || page === 'StockInRecords' || page === 'WasteSpillageRecords'
        || page === 'PhysicalCountRecords' || page === 'AuthorizedAdjustmentRecords' || page === 'Profile'
        || page === 'VoidRequests' || page === 'DailyClosingReport' || page === 'VoidReport' || page === 'ReversalReport'
        || page === 'Products' || page === 'Ingredients' || page === 'StockSettings' || page === 'BusinessHours'
        ? 'More' : page;
  const isOwnerMenuPage = page === 'More'
    || page === 'RecordCategories'
    || page === 'SalesConsumptionRecords'
    || page === 'StockInRecords'
    || page === 'WasteSpillageRecords'
    || page === 'PhysicalCountRecords'
    || page === 'AuthorizedAdjustmentRecords'
    || page === 'VoidRequests'
    || page === 'DailyClosingReport'
    || page === 'VoidReport'
    || page === 'ReversalReport';
  const isMenuFlowPage = isOwnerMenuPage || page === 'SalesTransactions';

  const calendarYear = calendarCursor.getFullYear();
  const calendarMonth = calendarCursor.getMonth();
  const calendarMonthLabel = calendarCursor.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const calendarFirstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const calendarDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarCells = [
    ...Array.from({ length: calendarFirstDay }, () => null),
    ...Array.from({ length: calendarDaysInMonth }, (_, index) => index + 1),
  ];
  const dateInputValue = (year: number, month: number, day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const showError = (message: string, onRetry: () => void = onRefresh) => (
    <View style={styles.errorCard} accessibilityRole="alert">
      <Text style={styles.errorText}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryAction}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );

  const renderInventoryRow = (item: (typeof inventoryRows)[number]) => {
    const statusTone = item.status === 'Low Stock' || item.status === 'Out of Stock' || item.status === 'Expired'
      ? 'low'
      : item.status === 'Near Expiration' || item.status === 'Not tracked'
        ? 'warning'
        : 'good';
    return (
      <View key={item.id} style={styles.lowStockCard}>
        <View style={styles.lowStockIcon}>
          <Text style={styles.lowStockIconText}>!</Text>
        </View>
        <View style={styles.listCopy}>
          <Text style={styles.lowStockName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.lowStockMeta} numberOfLines={2}>
            {item.branch} | Expected: {item.quantity} {item.unit} / {item.reorderPoint > item.minimumStock
              ? `Reorder at: ${item.reorderPoint}`
              : `Min: ${item.minimumStock}`} {item.unit}
          </Text>
        </View>
        <StatusBadge label={item.status} tone={statusTone} />
      </View>
    );
  };

  const openActivityDetail = (item: OwnerActivity, returnPage: 'Dashboard' | 'Records') => {
    setSelectedActivity(item);
    setActivityReturnPage(returnPage);
    setActivityDetailModalVisible(true);
  };

  const renderActivity = (item: OwnerActivity, returnPage: 'Dashboard' | 'Records') => (
    <Pressable
      key={`${item.category}:${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.type} details`}
      onPress={() => openActivityDetail(item, returnPage)}
      style={({ pressed }) => [styles.activityCard, pressed && styles.activityCardPressed]}
    >
      <View style={[styles.activityIcon, item.category === 'Sales' ? styles.activitySalesIcon : styles.activityInventoryIcon]}>
        <Text style={styles.activityIconText}>{item.category === 'Sales' ? '₱' : item.category === 'Counts' ? '✓' : item.category === 'Audit' ? '•' : '↗'}</Text>
      </View>
      <View style={styles.listCopy}>
        <Text style={styles.listTitle}>{item.type}</Text>
        <Text style={styles.listMeta}>{item.detail}</Text>
        <Text style={styles.listMeta}>
          {item.branchId ? branchNames.get(item.branchId) ?? 'Branch unavailable' : 'All branches'} · {compactDate(item.date)}
          {item.reference ? ` · Ref ${item.reference}` : ''}
        </Text>
      </View>
      <Text style={styles.activityChevron}>›</Text>
    </Pressable>
  );

  const renderActivityDetail = () => {
    if (!selectedActivity) return <EmptyState text="No activity record is selected." />;
    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to activity list"
          onPress={() => {
            setSelectedActivity(null);
            setPage(activityReturnPage);
          }}
          style={styles.detailBackButton}
        >
          <Text style={styles.detailBackText}>‹ Back</Text>
        </Pressable>
        <View style={styles.activityDetailCard}>
          <Text style={styles.eyebrow}>{selectedActivity.category.toUpperCase()}</Text>
          <Text style={styles.detailTitle}>{selectedActivity.type}</Text>
          <Text style={styles.detailBody}>{selectedActivity.detail}</Text>
          <View style={styles.detailDivider} />
          <Text style={styles.listMeta}>Branch: {selectedActivity.branchId ? branchNames.get(selectedActivity.branchId) ?? 'Branch unavailable' : 'All branches'}</Text>
          {selectedActivity.reference ? <Text style={styles.listMeta}>Reference: {selectedActivity.reference}</Text> : null}
          {selectedActivity.amount !== null ? <Text style={styles.listMeta}>Amount: {currency(selectedActivity.amount)}</Text> : null}
          <Text style={styles.listMeta}>Recorded: {compactDate(selectedActivity.date)}</Text>
        </View>
      </>
    );
  };

  const renderProducts = () => (
    <>
      <View style={styles.productOverviewGrid}>
        <View style={styles.bentoSummaryCard}>
          <Text style={styles.bentoLabel}>Total products</Text>
          <Text style={styles.bentoValue}>{productRecords.length}</Text>
        </View>
        <View style={styles.bentoSummaryCard}>
          <Text style={styles.bentoLabel}>Available</Text>
          <Text style={[styles.bentoValue, styles.bentoValueSuccess]}>{availableProductCount}</Text>
        </View>
        <View style={styles.bentoSummaryCard}>
          <Text style={styles.bentoLabel}>Unavailable</Text>
          <Text style={[styles.bentoValue, styles.bentoValueMuted]}>{unavailableProductCount}</Text>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchGlyph}>⌕</Text>
        <TextInput
          value={productSearch}
          onChangeText={setProductSearch}
          placeholder="Search products"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          accessibilityLabel="Search products by name"
          returnKeyType="search"
        />
        {productSearch ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear product search" onPress={() => setProductSearch('')}>
            <Text style={styles.clearSearch}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" onPress={() => resetProductForm('add')} style={styles.primaryActionButton}>
        <Text style={styles.primaryActionText}>+ Add Product</Text>
      </Pressable>

      {productsError ? showError(productsError) : productsLoading && productRecords.length === 0 ? (
        <View style={styles.loadingCard}><ActivityIndicator color={colors.pink} /><Text style={styles.loadingText}>Loading products…</Text></View>
      ) : visibleProducts.length ? (
        visibleProducts.map((product) => (
          <Pressable key={product.id} accessibilityRole="button" onPress={() => setSelectedProduct(product)} style={styles.productCard}>
            <View style={styles.productMetaRow}>
              <View style={styles.productCopy}>
                <Text style={styles.productName}>{product.product_name}</Text>
                <Text style={styles.productDescription} numberOfLines={2}>{product.description || 'No description provided.'}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${product.product_name}`}
                onPress={(event) => {
                  event.stopPropagation();
                  resetProductForm('edit', product);
                }}
                style={styles.editActionButton}
              >
                <Text style={styles.editActionText}>Edit</Text>
              </Pressable>
            </View>
            <View style={styles.productFooterRow}>
              <View>
                <Text style={styles.productPriceLabel}>4 PCS price</Text>
                <Text style={styles.productPriceValue}>{currency(product.price)}</Text>
              </View>
              <View style={[styles.availabilityPill, product.is_available ? styles.availabilityAvailable : styles.availabilityUnavailable]}>
                <Text style={[styles.availabilityText, !product.is_available && styles.availabilityTextMuted]}>{product.is_available ? 'Available' : 'Unavailable'}</Text>
              </View>
            </View>
          </Pressable>
        ))
      ) : (
        <EmptyState text={productRecords.length ? 'No products match your current search.' : 'No menu products are available yet. Add the first product to start managing your menu.'} />
      )}

      {selectedProduct && !productEditorMode && (
        <View style={styles.productDetailSheet}>
          <View style={styles.productDetailHeader}>
            <Text style={styles.productName}>{selectedProduct.product_name}</Text>
            <Pressable accessibilityRole="button" onPress={() => setSelectedProduct(null)} style={styles.closeActionButton}>
              <Text style={styles.closeActionText}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.productDetailLabel}>Description</Text>
          <Text style={styles.productDetailText}>{selectedProduct.description || 'No description provided.'}</Text>
          <View style={styles.productDetailGrid}>
            <View style={styles.detailStatBox}>
              <Text style={styles.productDetailLabel}>4 PCS price</Text>
              <Text style={styles.productDetailValue}>{currency(selectedProduct.price)}</Text>
            </View>
            <View style={styles.detailStatBox}>
              <Text style={styles.productDetailLabel}>Availability</Text>
              <Text style={styles.productDetailValue}>{selectedProduct.is_available ? 'Available' : 'Unavailable'}</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={() => resetProductForm('edit', selectedProduct)} style={styles.secondaryActionButton}>
            <Text style={styles.secondaryActionText}>Edit Product</Text>
          </Pressable>
        </View>
      )}

      {productEditorMode && (
        <View style={styles.productModalBackdrop}>
          <View style={styles.productModalCard}>
            <View style={styles.productModalHeader}>
              <Text style={styles.productModalTitle}>{productEditorMode === 'edit' ? 'Edit Product' : 'Add Product'}</Text>
              <Pressable accessibilityRole="button" onPress={() => { setProductEditorMode(null); setProductFeedback(null); }} style={styles.closeActionButton}>
                <Text style={styles.closeActionText}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Product name</Text>
            <TextInput
              value={productForm.product_name}
              onChangeText={(value) => setProductForm((current) => ({ ...current, product_name: value }))}
              placeholder="e.g. Takoyaki Special"
              placeholderTextColor={colors.muted}
              style={[styles.textInput, productFormErrors.product_name && styles.textInputError]}
              accessibilityLabel="Product name"
            />
            {productFormErrors.product_name ? <Text style={styles.fieldError}>{productFormErrors.product_name}</Text> : null}

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              value={productForm.description}
              onChangeText={(value) => setProductForm((current) => ({ ...current, description: value }))}
              placeholder="Describe the product"
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.textInput, styles.textArea, productFormErrors.description && styles.textInputError]}
              accessibilityLabel="Product description"
            />
            {productFormErrors.description ? <Text style={styles.fieldError}>{productFormErrors.description}</Text> : null}

            <Text style={styles.fieldLabel}>POS variant prices</Text>
            <Text style={styles.productDetailText}>
              Set the price for each configured size. Staff POS uses these variant prices.
            </Text>
            <Text style={styles.productDetailText}>
              New variants inherit the database default of visibility at all active branches. Editing preserves existing branch visibility.
            </Text>
            {(productEditorMode === 'edit' && selectedProduct
              ? selectedProduct.variants.map((variant) => ({
                key: variant.id,
                label: `${variant.size_label} · ${variant.piece_count} pieces`,
              }))
              : standardProductVariants.map((variant) => ({
                key: variant.variant_code,
                label: `${variant.size_label} · ${variant.piece_count} pieces`,
              }))).map((variant) => (
                <View key={variant.key}>
                  <Text style={styles.fieldLabel}>{variant.label}</Text>
                  <TextInput
                    value={productForm.variantPrices[variant.key] ?? ''}
                    onChangeText={(value) => setProductForm((current) => ({
                      ...current,
                      variantPrices: { ...current.variantPrices, [variant.key]: value },
                    }))}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.muted}
                    style={[styles.textInput, productFormErrors.variantPrices && styles.textInputError]}
                    accessibilityLabel={`${variant.label} price`}
                  />
                </View>
              ))}
            {productEditorMode === 'edit' && selectedProduct?.variants.length === 0 ? (
              <Text style={styles.fieldError}>No POS variants are configured for this product.</Text>
            ) : null}
            {productFormErrors.variantPrices ? <Text style={styles.fieldError}>{productFormErrors.variantPrices}</Text> : null}

            <Text style={styles.fieldLabel}>Availability</Text>
            <View style={styles.segmentedRow}>
              {(['Available', 'Unavailable'] as const).map((status) => {
                const selected = productForm.is_available === (status === 'Available');
                return (
                  <Pressable
                    key={status}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setProductForm((current) => ({ ...current, is_available: status === 'Available' }))}
                    style={[styles.segmentButton, selected && styles.segmentButtonSelected]}
                  >
                    <Text style={[styles.segmentButtonText, selected && styles.segmentButtonTextSelected]}>{status}</Text>
                  </Pressable>
                );
              })}
            </View>

            {productFeedback ? (
              <Text style={[styles.feedbackText, productFeedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess]}>{productFeedback.text}</Text>
            ) : null}

            <Pressable accessibilityRole="button" disabled={productSaving} onPress={submitProductForm} style={styles.primaryActionButton}>
              <Text style={styles.primaryActionText}>{productSaving ? 'Saving…' : productEditorMode === 'edit' ? 'Save Changes' : 'Add Product'}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </>
  );

  const renderDashboard = () => (
    <>
      <View style={styles.totalSalesCard}>
        <View style={styles.totalSalesTop}>
          <Text style={styles.totalSalesLabel}>Total Recorded Sales</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Choose sales period, currently ${period}`}
            onPress={() => setPeriodSheetVisible(true)}
            style={styles.totalSalesPeriod}
          >
            <Text style={styles.totalSalesPeriodText}>{period === 'This Week' ? 'This week' : period === 'This Month' ? 'This month' : period}</Text>
            <Text style={styles.totalSalesPeriodChevron}>⌄</Text>
          </Pressable>
        </View>
        {salesError ? (
          showError(OWNER_ALERT_LOAD_ERROR)
        ) : salesLoading && !salesData ? (
          <SkeletonCard label="Loading total recorded sales" lines={2} />
        ) : (
          <>
            <Text style={styles.totalSalesAmount} numberOfLines={1} adjustsFontSizeToFit>{selectedSales.length ? currency(totalSelectedSales) : '₱0'}</Text>
            <Text style={styles.totalSalesUpdated}>Updated {new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</Text>
          </>
        )}
      </View>

      {salesError ? showError(OWNER_ALERT_LOAD_ERROR) : salesLoading && !salesData ? (
        <SkeletonCard label="Loading sales" />
      ) : null}

      <SectionHeading title="Branch Sales" />
      {salesLoading && !salesData ? (
        <SkeletonCard label="Loading branch sales" />
      ) : salesError ? showError(OWNER_ALERT_LOAD_ERROR) : branchMetrics.length ? (
        <View style={styles.branchSalesList}>
          {branchMetrics.map((branch) => {
            return (
              <Pressable
                key={branch.id}
                accessibilityRole="button"
                accessibilityLabel={`View ${branch.name} sales summary`}
                onPress={() => {
                  onBranchChange(branch.id);
                  setPage('Sales');
                }}
                style={({ pressed }) => [styles.branchSalesCard, pressed && styles.branchSalesCardPressed]}
              >
                <View style={styles.branchLocationIcon}><Text style={styles.branchLocationIconText}>⌖</Text></View>
                <View style={styles.branchSalesCopy}>
                  <Text style={styles.branchSalesName} numberOfLines={1}>{branch.name}</Text>
                  <Text style={styles.branchSalesSupporting}>View sales summary</Text>
                </View>
                <Text style={styles.branchSalesAmount}>{currency(branch.total)}</Text>
                <Text style={styles.branchSalesChevron}>›</Text>
              </Pressable>
            );
          })}
        </View>
      ) : <EmptyState text="No sales recorded yet." />}

      <SectionHeading title="Inventory Status" action="Inventory" onAction={() => setPage('Inventory')} />
      {inventoryError ? showError(OWNER_ALERT_LOAD_ERROR) : inventoryLoading ? (
        <SkeletonCard label="Loading inventory" />
      ) : inventoryRows.length === 0 ? (
        <EmptyState text="No inventory records yet." />
      ) : (
        <View style={styles.inventoryStatusGrid}>
          {[
            { label: 'Normal', value: inventoryStatusCounts.normal },
            { label: 'Low Stock', value: inventoryStatusCounts.lowStock, tone: 'low' },
            { label: 'Out of Stock', value: inventoryStatusCounts.outOfStock, tone: 'low' },
          ].map((item) => (
            <View
              key={item.label}
              style={[
                styles.inventoryStatusCard,
                item.label === 'Normal' ? styles.inventoryStatusNormal :
                item.label === 'Low Stock' ? styles.inventoryStatusLow : styles.inventoryStatusOut,
              ]}
            >
              <Text style={styles.inventoryStatusValue}>{item.value}</Text>
              <Text style={styles.inventoryStatusLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      )}
      {/* OM-02 c4: the counts of each branch. */}
      {!inventoryError && !inventoryLoading && inventoryRows.length > 0 ? (
        <View style={styles.inventoryBranchStatusList}>
          {summarizeOwnerInventoryStatusByBranch(
            (data?.inventory ?? []).map((record) => ({ branch_id: record.branch_id, quantity: record.quantity, minimum_stock: record.minimum_stock, low_stock_threshold: record.low_stock_threshold })),
            branches,
          ).map((row) => (
            <View key={row.id} style={styles.inventoryBranchStatusRow} accessibilityLabel={`${row.name}: ${row.normal} normal, ${row.lowStock} low stock, ${row.outOfStock} out of stock`}>
              <Text style={styles.inventoryBranchStatusName}>{row.name}</Text>
              <Text style={styles.inventoryBranchStatusCounts}>
                {row.normal} Normal · {row.lowStock} Low · {row.outOfStock} Out
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <SectionHeading title="Low-Stock Items" action="See all" onAction={() => { setAlertCategory('Low Stock'); setPage('Alerts'); }} />
      {inventoryError ? showError(OWNER_ALERT_LOAD_ERROR) : inventoryLoading ? (
        <SkeletonCard label="Loading inventory" />
      ) : dashboardLowStock.length ? dashboardLowStock.slice(0, 4).map((item) => renderInventoryRow(item)) : (
        <EmptyState text="No low-stock items." />
      )}

      <SectionHeading title="Expiration Alerts" action="See all" onAction={() => { setAlertCategory('Near Expiration'); setPage('Alerts'); }} />
      {inventoryError ? showError(OWNER_ALERT_LOAD_ERROR) : inventoryLoading ? (
        <SkeletonCard label="Loading expiration alerts" />
      ) : sortedExpirationItems.length ? sortedExpirationItems.slice(0, 4).map((item) => (
        <View key={item.id} style={styles.listCard}>
          <View style={[styles.itemMark, item.days < 0 ? styles.itemMarkLow : styles.itemMarkWarning]}>
            <Text style={styles.itemMarkText}>!</Text>
          </View>
          <View style={styles.listCopy}>
            <Text style={styles.listTitle}>{item.name}</Text>
            <Text style={styles.listMeta}>{item.branch} · Expires {manilaDateLabel(item.expirationDate)}</Text>
          </View>
          <StatusBadge label={item.days < 0 ? 'Expired' : 'Near Expiration'} tone={item.days < 0 ? 'low' : 'warning'} />
        </View>
      )) : <EmptyState text="No expiration alerts." />}

      <SectionHeading title="Recent Activities" action="See all" onAction={() => setPage('Records')} />
      {activityError ? showError(OWNER_ALERT_LOAD_ERROR) : activityLoading && !activityData ? (
        <SkeletonCard label="Loading activities" />
      ) : sortedActivities.length ? sortedActivities.slice(0, 5).map((item) => renderActivity(item, 'Dashboard')) : (
        <EmptyState text="No recent activities." />
      )}
      {dashboardDiscrepancies.length > 0 && (
        <>
          <SectionHeading title="Discrepancies awaiting review" action="Review" onAction={() => setPage('Discrepancies')} />
          {dashboardDiscrepancies.slice(0, 3).map((item) => (
            <View key={item.id} style={styles.listCard}>
              <View style={[styles.itemMark, styles.itemMarkWarning]}><Text style={styles.itemMarkText}>!</Text></View>
              <View style={styles.listCopy}>
                <Text style={styles.listTitle}>{item.ingredient} · {item.branch}</Text>
                <Text style={styles.listMeta}>Expected {item.expected} {item.unit} · Counted {item.actual} {item.unit}</Text>
                <Text style={styles.listMeta}>Difference {item.difference > 0 ? '+' : ''}{item.difference} {item.unit} · {item.reference}</Text>
              </View>
              <StatusBadge label="Pending" tone="warning" />
            </View>
          ))}
        </>
      )}
    </>
  );

  const renderSales = () => (
    <OwnerSalesWorkspace
      mode="monitoring"
      branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
      initialData={salesData}
      initialLoading={salesLoading}
      initialPeriod={period === 'Today' ? 'Today' : period === 'This Week' ? 'Weekly' : period === 'Custom' ? 'Custom' : 'Monthly'}
      initialBranchId={branchId}
      initialStartDate={customStart}
      initialEndDate={customEnd}
      onOpenReports={() => setPage('Reports')}
      onRefresh={onRefresh}
      availableWidth={contentWidth - 36}
    />
  );

  const renderReports = () => (
    <OwnerSalesWorkspace
      mode="reports"
      branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
      initialPeriod={period === 'Today' ? 'Today' : period === 'This Week' ? 'Weekly' : period === 'Custom' ? 'Custom' : 'Monthly'}
      initialBranchId={branchId}
      initialStartDate={customStart}
      initialEndDate={customEnd}
      onBack={() => setPage('Sales')}
      availableWidth={contentWidth - 36}
    />
  );

  const renderInventory = () => (
    <>
      <View style={styles.omInventorySearch}>
        <Text style={styles.omInventorySearchIcon}>⌕</Text>
        <TextInput
          value={inventorySearch}
          onChangeText={setInventorySearch}
          placeholder="Searching for something?"
          placeholderTextColor={colors.muted}
          style={styles.omInventorySearchInput}
          accessibilityLabel="Search inventory ingredients"
          returnKeyType="search"
        />
        {inventorySearch ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear inventory search" onPress={() => setInventorySearch('')}>
            <Text style={styles.omInventoryClear}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.omInventoryBranchRow}>
        {branches.map((branch) => {
          const selected = branch.id === effectiveInventoryBranchId;
          return (
            <Pressable
              key={branch.id}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: inventoryLoading }}
              disabled={inventoryLoading}
              onPress={() => {
                setInventoryBranchId(branch.id);
                setInventoryCategory('All categories');
              }}
              style={[styles.omInventoryBranchChip, selected && styles.omInventoryBranchChipSelected]}
            >
              <Text style={[styles.omInventoryBranchChipText, selected && styles.omInventoryBranchChipTextSelected]}>{branch.name}</Text>
            </Pressable>
          );
        })}
      </View>
      {inventoryCategoryOptions.length > 2 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.omInventoryBranchRow}>
          {inventoryCategoryOptions.map((category) => {
            const selected = category === inventoryCategory;
            return (
              <Pressable
                key={category}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setInventoryCategory(category)}
                style={[styles.omInventoryBranchChip, selected && styles.omInventoryBranchChipSelected]}
              >
                <Text style={[styles.omInventoryBranchChipText, selected && styles.omInventoryBranchChipTextSelected]}>{category}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => setPage('CompareInventory')}
        style={styles.omCompareButton}
      >
        <Text style={styles.omCompareButtonIcon}>▥</Text>
        <Text style={styles.omCompareButtonText}>Compare Branches</Text>
      </Pressable>

      {inventoryLoading ? (
        <View style={styles.omInventoryLoadingCenter}>
          <ActivityIndicator size="large" color={colors.pink} />
          <Text style={styles.omInventoryLoadingText}>
            Loading {effectiveInventoryBranchId ? branchNames.get(effectiveInventoryBranchId) ?? 'selected branch' : 'branch'} inventory…
          </Text>
        </View>
      ) : inventoryError ? (
        <View style={styles.omInventoryErrorCenter}>
          <Text style={styles.omWifiOffIcon}>≋</Text>
          <Text style={styles.omInventoryErrorText}>{inventoryError}</Text>
          <Pressable accessibilityRole="button" onPress={() => void onRefresh()} style={styles.omInventoryRetry}>
            <Text style={styles.omInventoryRetryIcon}>↻</Text>
            <Text style={styles.omInventoryRetryText}>Retry</Text>
          </Pressable>
        </View>
      ) : filteredInventory.length ? (
        <>
          {filteredInventory.map((record) => {
            return (
              <View key={record.id} style={styles.omInventoryCard}>
                <View style={styles.omInventoryCardTop}>
                  <View style={styles.omInventoryCardCopy}>
                    <Text style={styles.omInventoryIngredientName}>{record.name}</Text>
                    <Text style={styles.omInventoryMetaLabel}>{record.branch}</Text>
                    <Text style={styles.omInventoryExpected}>
                      <Text style={styles.omInventoryMetaLabel}>Expected </Text>
                      <Text style={styles.omInventoryExpectedValue}>{formatInventoryQuantity(record.quantity)} {record.unit}</Text>
                    </Text>
                    <Text style={styles.omInventoryMinimum}>Min {record.minimumStock} {record.unit}</Text>
                  </View>
                  <InventoryStatusBadge status={record.status} />
                </View>
                {record.batches.length > 0 && (
                  <View style={styles.omInventoryBatchList}>
                    <Text style={styles.omInventoryBatchHeading}>
                      Active batches ({record.batches.length})
                    </Text>
                    {record.batches.map((batch) => (
                      <View key={batch.id} style={styles.omInventoryBatchRow}>
                        <View style={styles.omInventoryBatchCopy}>
                          <Text style={styles.omInventoryBatchReference} numberOfLines={1}>
                            {batch.reference ? `Batch ${batch.reference}` : 'Batch reference unavailable'}
                          </Text>
                          <Text style={styles.omInventoryExpiryLabel}>
                            {formatInventoryQuantity(batch.quantityRemaining)} {record.unit}
                            {record.expirationTracking
                              ? batch.expirationDate
                                ? ` · Expires ${manilaDateLabel(batch.expirationDate)}`
                                : ' · Expiration not recorded'
                              : ' · Expiration tracking disabled'}
                          </Text>
                        </View>
                        {batch.status && <InventoryStatusBadge status={batch.status} />}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
          <View style={styles.omInventoryFooterNote}>
            <Text style={styles.omInventoryFooterIcon}>i</Text>
            <Text style={styles.omInventoryFooterText}>Read-only. Configuration is managed by the Owner.</Text>
          </View>
        </>
      ) : (
        <EmptyState text="No inventory records match the selected branch, category, and search." />
      )}
    </>
  );

  const renderCompareInventory = () => {
    const comparisonRows = compareIngredient
      ? buildOwnerInventoryComparisonRows({
        branches,
        inventory: data?.inventory ?? [],
        batches: data?.batches ?? [],
        ingredientId: compareIngredient.id,
        unit: compareIngredient.unit,
      })
      : [];

    const filteredIngredients = (data?.ingredients ?? []).filter((ingredient) =>
      ingredient.name.toLowerCase().includes(ingredientSearch.trim().toLowerCase()),
    );

    return (
      <View style={styles.omCompareScreen}>
        <View style={styles.omCompareHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Inventory"
            onPress={() => setPage('Inventory')}
            style={styles.omCompareBack}
          >
            <Text style={styles.omCompareBackText}>‹</Text>
          </Pressable>
          <Text style={styles.omCompareHeaderTitle}>Compare Branches</Text>
          <View style={styles.omCompareHeaderSpacer} />
        </View>

        <View style={styles.omCompareFieldLabelRow}>
          <Text style={styles.omCompareFieldLabel}>Ingredient</Text>
          <Text style={styles.omCompareAsterisk}>*</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select ingredient"
          disabled={inventoryLoading}
          onPress={() => {
            setIngredientSearch('');
            setIngredientSheetVisible(true);
          }}
          style={styles.omCompareDropdown}
        >
          <Text style={[
            styles.omCompareDropdownText,
            !compareIngredient && styles.omCompareDropdownPlaceholder,
          ]}>
            {compareIngredient?.name ?? 'Select an ingredient.'}
          </Text>
          <Text style={styles.omCompareDropdownChevron}>⌄</Text>
        </Pressable>

        {inventoryLoading ? (
          <View style={styles.omComparisonLoadingCenter}>
            <ActivityIndicator size="large" color={colors.pink} />
            <Text style={styles.omInventoryLoadingText}>Loading branch inventory…</Text>
          </View>
        ) : inventoryError ? (
          <View style={styles.omInventoryErrorCenter}>
            <Text style={styles.omWifiOffIcon}>≋</Text>
            <Text style={styles.omInventoryErrorText}>{inventoryError}</Text>
            <Pressable accessibilityRole="button" onPress={() => void onRefresh()} style={styles.omInventoryRetry}>
              <Text style={styles.omInventoryRetryIcon}>↻</Text>
              <Text style={styles.omInventoryRetryText}>Retry</Text>
            </Pressable>
          </View>
        ) : compareIngredient ? (
          <>
            <View style={styles.omCompareCards}>
              {comparisonRows.map((row) => (
                <View key={row.branchId} style={styles.omCompareCard}>
                  <Text style={styles.omCompareCardHeader}>{row.branchName}</Text>
                  <View style={styles.omCompareCardDivider} />
                  <Text style={styles.omCompareQuantity}>
                    {formatInventoryQuantity(row.quantity)}
                  </Text>
                  <Text style={styles.omCompareUnit}>
                    {row.hasRecord ? row.unit : 'No record'}
                  </Text>
                  {row.batchCode ? (
                    <Text style={styles.omCompareBatchCode} numberOfLines={1} ellipsizeMode="tail">
                      <Text style={styles.omCompareBatchIcon}>▣ </Text>{row.batchCode} · {row.batchCount} active
                    </Text>
                  ) : row.batchCount > 0 ? (
                    <Text style={styles.omCompareBatchCode}>{row.batchCount} active batches</Text>
                  ) : null}
                  {row.status && <InventoryStatusBadge status={row.status} />}
                </View>
              ))}
            </View>
            <View style={styles.omCompareInfoBanner}>
              <Text style={styles.omCompareInfoIcon}>▣</Text>
              <View style={styles.omCompareInfoCopy}>
                <Text style={styles.omCompareInfoTitle}>Read-only expected quantities.</Text>
                <Text style={styles.omCompareInfoText}>Configuration is managed by the Owner.</Text>
              </View>
            </View>
          </>
        ) : (
          <EmptyState text="Select an ingredient to compare stock across branches." />
        )}

        <Modal
          visible={ingredientSheetVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setIngredientSheetVisible(false)}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close ingredient selector"
            onPress={() => setIngredientSheetVisible(false)}
            style={styles.omModalBackdrop}
          >
            <Pressable onPress={() => undefined} style={[styles.omBottomSheet, styles.omIngredientSheet, { width: Math.min(contentWidth, 390) }]}>
              <View style={styles.omSheetHandle} />
              <View style={styles.omIngredientSheetHeader}>
                <Text style={styles.omIngredientSheetTitle}>Select ingredient</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={() => setIngredientSheetVisible(false)}
                  style={styles.omIngredientClose}
                >
                  <Text style={styles.omIngredientCloseText}>×</Text>
                </Pressable>
              </View>
              <View style={styles.omIngredientSearch}>
                <Text style={styles.omIngredientSearchIcon}>⌕</Text>
                <TextInput
                  value={ingredientSearch}
                  onChangeText={setIngredientSearch}
                  placeholder="Search ingredients"
                  placeholderTextColor={colors.muted}
                  style={styles.omIngredientSearchInput}
                  accessibilityLabel="Search ingredients"
                />
              </View>
              {filteredIngredients.length ? filteredIngredients.map((ingredient) => {
                const selected = compareIngredient?.id === ingredient.id;
                return (
                  <Pressable
                    key={ingredient.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setCompareIngredient(ingredient);
                      setIngredientSheetVisible(false);
                    }}
                    style={[
                      styles.omIngredientRow,
                      selected && (ingredientSearch.trim() ? styles.omIngredientRowSearchSelected : styles.omIngredientRowSelected),
                    ]}
                  >
                    <Text style={[
                      styles.omIngredientRowText,
                      selected && styles.omIngredientRowTextSelected,
                      selected && !ingredientSearch.trim() && styles.omIngredientRowTextSolidSelected,
                    ]}>{ingredient.name}</Text>
                    {selected && (
                      <Text style={[
                        styles.omIngredientCheck,
                        ingredientSearch.trim() && styles.omIngredientCheckSearch,
                      ]}>✓</Text>
                    )}
                  </Pressable>
                );
              }) : (
                <Text style={styles.omIngredientResultCaption}>No results</Text>
              )}
              {filteredIngredients.length > 0 && (
                <Text style={styles.omIngredientResultCaption}>
                  {filteredIngredients.length} {filteredIngredients.length === 1 ? 'result' : 'results'}
                </Text>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  };

  const renderAlerts = () => {
    const loading = inventoryLoading;
    const offlineError = Boolean(inventoryError);
    // OM-13 c1: four tabs, each with its own count.
    const alertsByTab = splitOwnerAlertsByTab(alertSnapshot);
    const isEmpty = !loading && !offlineError && alertsByTab[alertCategory].length === 0;
    const isStockTab = alertCategory === 'Low Stock' || alertCategory === 'Out of Stock';
    // OM-13 c4: expiration alerts also show the item's expected quantity and minimum stock.
    const inventoryByKey = new Map((data?.inventory ?? []).map((record) => [`${record.branch_id}:${record.ingredient_id}`, record]));

    const formatExpirationDate = (value: string) => {
      const date = new Date(`${value.slice(0, 10)}T12:00:00`);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    };

    const countLabel = (category: OwnerAlertTab) => {
      if (loading || offlineError) return '';
      return ` (${alertsByTab[category].length})`;
    };

    return (
      <View style={styles.alertsScreen}>
        <View style={styles.alertTabs}>
          {OWNER_ALERT_TABS.map((value) => {
            const selected = alertCategory === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: loading || offlineError }}
                disabled={loading || offlineError}
                onPress={() => setAlertCategory(value)}
                style={[styles.alertTab, selected && styles.alertTabSelected]}
              >
                <Text style={[styles.alertTabText, selected && styles.alertTabTextSelected]}>
                  {value}{countLabel(value)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.alertBranchChips}>
          {[{ id: null, name: 'All' }, ...branches].map((branch) => {
            const selected = branchId === branch.id;
            return (
              <Pressable
                key={branch.id ?? 'all'}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: loading || offlineError }}
                disabled={loading || offlineError}
                onPress={() => onBranchChange(branch.id)}
                style={[styles.alertBranchChip, selected && styles.alertBranchChipSelected]}
              >
                <Text style={[styles.alertBranchChipText, selected && styles.alertBranchChipTextSelected]}>
                  {branch.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.alertLoadingCenter}>
            <ActivityIndicator size="large" color={colors.pink} />
            <Text style={styles.alertLoadingText}>Loading alerts…</Text>
          </View>
        ) : offlineError ? (
          <View style={styles.alertErrorCenter}>
            <Text style={styles.alertWifiIcon}>≋</Text>
            <Text style={styles.alertErrorText}>{OWNER_ALERT_LOAD_ERROR}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void onRefresh()}
              style={styles.alertRetryButton}
            >
              <Text style={styles.alertRetryIcon}>↻</Text>
              <Text style={styles.alertRetryText}>Retry</Text>
            </Pressable>
          </View>
        ) : isEmpty ? (
          <View style={styles.alertEmptyState}>
            <View style={styles.alertEmptyBellCircle}>
              <Text style={styles.alertEmptyBell}>♧</Text>
            </View>
            <Text style={styles.alertEmptyTitle}>{OWNER_ALERT_EMPTY_MESSAGE}</Text>
            <Text style={styles.alertEmptySubtext}>
              {alertCategory === 'Low Stock'
                ? 'Items at or below their minimum stock appear here.'
                : alertCategory === 'Out of Stock'
                  ? 'Items with no stock left appear here.'
                  : alertCategory === 'Near Expiration'
                    ? 'Lots close to their expiration date appear here.'
                    : 'Expired lots appear here.'}
            </Text>
          </View>
        ) : isStockTab ? (
          <View style={styles.alertCardList}>
            {(alertsByTab[alertCategory] as OwnerLowStockAlert[]).map((item) => (
              <View key={item.id} style={styles.alertCard}>
                <View style={styles.alertCardTop}>
                  <View style={styles.alertCardIdentity}>
                    <Text style={styles.alertCardName} numberOfLines={1}>{item.name}</Text>
                    <View style={styles.alertBranchLine}>
                      <Text style={styles.alertPinIcon}>⌖</Text>
                      <Text style={styles.alertBranchName}>{item.branch}</Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.alertStatusBadge,
                      item.status === 'Out of Stock' ? styles.alertStatusOut : styles.alertStatusLow,
                    ]}
                  >
                    <Text
                      style={[
                        styles.alertStatusText,
                        item.status === 'Out of Stock' && styles.alertStatusTextLight,
                      ]}
                    >
                      {item.status === 'Out of Stock' ? '! ' : '● '}{item.status}
                    </Text>
                  </View>
                </View>
                <View style={styles.alertCardDivider} />
                <View style={styles.alertCardBottom}>
                  <View>
                    <Text style={styles.alertMetricLabel}>Expected quantity</Text>
                    <Text style={styles.alertMetricValue}>{item.quantity} {item.unit}</Text>
                  </View>
                  <View style={styles.alertMetricRight}>
                    {/* A2: the reorder point is shown when it is above the owner minimum. */}
                    <Text style={styles.alertMetricLabel}>
                      {item.reorderPoint > item.minimumStock ? 'Reorder point' : 'Minimum stock level'}
                    </Text>
                    <Text style={styles.alertMetricValue}>
                      {item.reorderPoint > item.minimumStock ? item.reorderPoint : item.minimumStock} {item.unit}
                    </Text>
                    {item.reorderPoint > item.minimumStock ? (
                      <Text style={styles.alertMetricLabel}>Minimum {item.minimumStock} {item.unit}</Text>
                    ) : null}
                    {item.critical && item.status !== 'Out of Stock' ? (
                      <Text style={styles.alertMetricLabel}>Critical: at or below safety stock</Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.alertCardList}>
            {(alertsByTab[alertCategory] as OwnerExpirationAlert[]).map((item) => {
              const stock = inventoryByKey.get(`${item.branchId}:${item.ingredientId}`);
              return (
              <View key={item.id} style={styles.alertCard}>
                <View style={styles.alertCardTop}>
                  <View style={styles.alertCardIdentity}>
                    <Text style={styles.alertCardName} numberOfLines={1}>{item.name}</Text>
                    <View style={styles.alertBranchLine}>
                      <Text style={styles.alertPinIcon}>⌖</Text>
                      <Text style={styles.alertBranchName}>{item.branch}</Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.alertStatusBadge,
                      item.status === 'Expired' ? styles.alertStatusExpired : styles.alertStatusNear,
                    ]}
                  >
                    <Text
                      style={[
                        styles.alertStatusText,
                        item.status === 'Expired' && styles.alertStatusTextLight,
                      ]}
                    >
                      {item.status === 'Expired' ? '! ' : '◷ '}{item.status}
                    </Text>
                  </View>
                </View>
                <View style={styles.alertCardDivider} />
                <View style={styles.alertCardBottom}>
                  <View>
                    <Text style={styles.alertMetricLabel}>Batch</Text>
                    <Text style={styles.alertMetricValue}>{item.reference}</Text>
                  </View>
                  <View style={styles.alertMetricRight}>
                    <Text style={styles.alertMetricLabel}>Recorded expiration date</Text>
                    <Text style={styles.alertMetricValue}>{formatExpirationDate(item.expirationDate)}</Text>
                  </View>
                </View>
                {stock ? (
                  <View style={styles.alertCardBottom}>
                    <View>
                      <Text style={styles.alertMetricLabel}>Expected quantity</Text>
                      <Text style={styles.alertMetricValue}>{Number(stock.quantity ?? 0)} {item.unit}</Text>
                    </View>
                    <View style={styles.alertMetricRight}>
                      <Text style={styles.alertMetricLabel}>Minimum stock level</Text>
                      <Text style={styles.alertMetricValue}>{Number(stock.minimum_stock)} {item.unit}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
              );
            })}
          </View>
        )}
        {/* OM-13 c8 */}
        <Text style={styles.alertDecisionNote}>{OWNER_ALERTS_DECISION_NOTE}</Text>

      </View>
    );
  };

  const renderDiscrepancies = () => {
    const formatQuantity = (value: number, unit: string) =>
      `${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(value)} ${unit}`;
    const formatDifference = (value: number, unit: string) => {
      const magnitude = Math.abs(value);
      const amount = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(magnitude);
      return `${value < 0 ? '−' : value > 0 ? '+' : ''}${amount} ${unit}`;
    };
    const statusStyle = (status: OwnerDiscrepancyReview['status']) =>
      status === 'Validated' ? styles.omStatusAdjusted
        : status === 'Pending' ? styles.omStatusPending
          : styles.omStatusCorrection;
    const statusTextStyle = (status: OwnerDiscrepancyReview['status']) =>
      status === 'Validated' ? styles.omStatusAdjustedText
        : status === 'Pending' ? styles.omStatusPendingText
          : styles.omStatusCorrectionText;
    const openAction = (action: 'approve' | 'reject' | 'validate' | 'recount') => {
      if (!selectedDiscrepancy) return;
      setAdjustmentReason('');
      setAdjustmentError('');
      setDiscrepancyAction(action);
    };

    if (discrepancyView === 'details') {
      if (!selectedDiscrepancy) {
        return (
          <View style={styles.omInventoryErrorCenter}>
            {discrepancyLoading ? (
              <ActivityIndicator size="large" color={colors.pink} />
            ) : discrepancyError ? (
              <>
                <Text style={styles.omInventoryErrorText}>{discrepancyError}</Text>
                <Pressable accessibilityRole="button" onPress={() => void refreshDiscrepancyReviews(null)} style={styles.omInventoryRetry}>
                  <Text style={styles.omInventoryRetryText}>Retry</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.omInventoryErrorText}>This discrepancy is no longer available.</Text>
            )}
            <Pressable accessibilityRole="button" onPress={() => {
              setSelectedDiscrepancyId(null);
              setDiscrepancyView('list');
            }} style={styles.omInventoryRetry}>
              <Text style={styles.omInventoryRetryText}>Back to discrepancies</Text>
            </Pressable>
          </View>
        );
      }

      const selected = selectedDiscrepancy;
      return (
        <View>
          <View style={styles.omDiscrepancySubHeader}>
            <Pressable accessibilityRole="button" onPress={() => {
              setSelectedDiscrepancyId(null);
              setDiscrepancyView('list');
            }} style={styles.omBackButton}>
              <Text style={styles.omBackText}>‹</Text>
            </Pressable>
            <Text style={styles.omHeaderTitle}>Discrepancy Details</Text>
            <View style={styles.omHeaderSpacer} />
          </View>
          <View style={styles.omDiscrepancyCard}>
            <View style={styles.omDiscrepancyCardHeader}>
              <Text style={styles.omDiscrepancyName}>{selected.ingredient}</Text>
              <View style={[styles.omStatusBadge, statusStyle(selected.status)]}>
                <Text style={[styles.omStatusBadgeText, statusTextStyle(selected.status)]}>
                  {ownerDiscrepancyStatusLabel(selected.status)}
                </Text>
              </View>
            </View>
            {[
              ['Branch', selected.branch],
              ['Count reference', selected.reference],
              ['Expected quantity', formatQuantity(selected.expected, selected.unit)],
              ['Actual quantity', formatQuantity(selected.actual, selected.unit)],
              ['Corrected actual quantity', formatQuantity(selected.correctedActual, selected.unit)],
              ['Difference', formatDifference(selected.difference, selected.unit)],
              ['Date & time', compactDate(selected.submittedAt)],
              ['Submitted by', selected.staff],
              ['Correction request reason', selected.correctionReason],
              ['Staff remarks', selected.remarks],
            ].map(([label, value]) => (
              <View key={label} style={styles.omDiscrepancyDetailRow}>
                <Text style={styles.omDiscrepancyDetailLabel}>{label}</Text>
                <Text style={[styles.omDiscrepancyDetailValue, label === 'Difference' && styles.omDiscrepancyNegative]}>
                  {value}
                </Text>
              </View>
            ))}
            {selected.decisionReason ? (
              <View style={styles.omDiscrepancyDetailRow}>
                <Text style={styles.omDiscrepancyDetailLabel}>Owner decision</Text>
                <Text style={styles.omDiscrepancyDetailValue}>{selected.decisionReason}</Text>
              </View>
            ) : null}
            {selected.validationReason ? (
              <View style={styles.omDiscrepancyDetailRow}>
                <Text style={styles.omDiscrepancyDetailLabel}>Validation reason</Text>
                <Text style={styles.omDiscrepancyDetailValue}>{selected.validationReason}</Text>
              </View>
            ) : null}
          </View>
          {selected.adjustment ? (
            <View style={styles.adjustmentAudit}>
              <Text style={styles.omDiscrepancyDetailLabel}>Authorized inventory movement</Text>
              <Text style={styles.auditDetail}>Reference: {selected.adjustment.movementReference}</Text>
              <Text style={styles.auditDetail}>
                {formatQuantity(selected.adjustment.beforeQuantity, selected.unit)} → {formatQuantity(selected.adjustment.afterQuantity, selected.unit)}
              </Text>
              <Text style={styles.auditDetail}>Authorized by {selected.adjustment.approvingOwner}</Text>
            </View>
          ) : null}
          {isOwnerDiscrepancyActionable(selected) ? (
            <View style={styles.discrepancyActions}>
              <Pressable accessibilityRole="button" onPress={() => openAction('approve')} style={[styles.omPrimaryButton, styles.discrepancyActionButton]}>
                <Text style={styles.omPrimaryButtonText}>Approve request</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => openAction('reject')} style={[styles.omCorrectionRejectButton, styles.discrepancyActionButton]}>
                <Text style={styles.omCorrectionRejectText}>Reject request</Text>
              </Pressable>
            </View>
          ) : null}
          {isOwnerDiscrepancyValidatable(selected) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => openAction('validate')}
              style={styles.omPrimaryButton}
            >
              <Text style={styles.omPrimaryButtonText}>Validate Count</Text>
            </Pressable>
          ) : null}
          {isOwnerDiscrepancyRecountable(selected) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => openAction('recount')}
              style={[styles.omCorrectionRejectButton, styles.discrepancyActionButton]}
            >
              <Text style={styles.omCorrectionRejectText}>Reject Count (request recount)</Text>
            </Pressable>
          ) : null}
          {selected.rejection ? (
            <View style={styles.adjustmentAudit}>
              <Text style={styles.omDiscrepancyDetailLabel}>Rejected for recount</Text>
              <Text style={styles.auditDetail}>Reason: {selected.rejection.reason}</Text>
              <Text style={styles.auditDetail}>By {selected.rejection.rejectedBy} · {new Date(selected.rejection.rejectedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</Text>
              <Text style={styles.auditDetail}>The expected quantity was not changed. Staff submit a new count.</Text>
            </View>
          ) : null}
        </View>
      );
    }

    if (discrepancyLoading && !discrepancyReviewsLoaded) {
      return (
        <View style={styles.omLoadingCenter}>
          <ActivityIndicator size="large" color={colors.pink} />
          <Text style={styles.loadingText}>Loading discrepancies…</Text>
        </View>
      );
    }
    if (discrepancyError) {
      return (
        <View style={styles.alertErrorCenter}>
          <Text style={styles.alertWifiIcon}>≋</Text>
          <Text style={styles.alertErrorText}>{discrepancyError}</Text>
          <Pressable accessibilityRole="button" onPress={() => void refreshDiscrepancyReviews()} style={styles.alertRetryButton}>
            <Text style={styles.alertRetryIcon}>↻</Text><Text style={styles.alertRetryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View>
        <Text style={styles.omPageTitle}>Discrepancies</Text>
        <View style={styles.omFilterDropdownRow}>
          <Pressable accessibilityRole="button" onPress={() => { setDiscrepancyDraftBranch(discrepancyBranchFilter); setDiscrepancyDraftStatus(discrepancyStatusFilter); setDiscrepancyFilterVisible(true); }} style={styles.omFilterDropdown}>
            <Text style={styles.omFilterDropdownIcon}>⌖</Text>
            <Text style={styles.omFilterDropdownText}>{discrepancyBranchFilter ? branchNames.get(discrepancyBranchFilter) ?? 'Selected branch' : 'All branches'}</Text>
            <Text style={styles.omFilterDropdownChevron}>⌄</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setDiscrepancyDraftBranch(discrepancyBranchFilter); setDiscrepancyDraftStatus(discrepancyStatusFilter); setDiscrepancyFilterVisible(true); }} style={styles.omFilterDropdown}>
            <Text style={styles.omFilterDropdownIcon}>≡</Text>
            <Text style={styles.omFilterDropdownText}>{discrepancyStatusFilter}</Text>
            <Text style={styles.omFilterDropdownChevron}>⌄</Text>
          </Pressable>
        </View>
        {discrepancyFeedback ? <Text style={styles.noticeText}>{discrepancyFeedback}</Text> : null}
        {discrepancyLoading ? (
          <View style={styles.salesLoadingCompact}>
            <ActivityIndicator size="small" color={colors.pink} />
            <Text style={styles.loadingText}>Refreshing discrepancies…</Text>
          </View>
        ) : null}
        {visibleDiscrepancies.length ? visibleDiscrepancies.map((item) => (
          <Pressable
            key={item.correctionRequestId}
            accessibilityRole="button"
            onPress={() => {
              setSelectedDiscrepancyId(item.correctionRequestId);
              setDiscrepancyView('details');
            }}
            style={styles.omDiscrepancyListCard}
          >
            <View style={styles.omDiscrepancyListCopy}>
              <View style={styles.omDiscrepancyCardHeader}>
                <Text style={styles.omDiscrepancyName}>{item.ingredient}</Text>
                <Text style={styles.omDiscrepancyNegative}>{formatDifference(item.difference, item.unit)}</Text>
              </View>
              <Text style={styles.omDiscrepancyMeta}>{item.branch} · {compactDate(item.submittedAt)}</Text>
              <View style={styles.omBadgeRow}>
                <View style={[styles.omStatusBadge, statusStyle(item.status)]}>
                  <Text style={[styles.omStatusBadgeText, statusTextStyle(item.status)]}>
                    {ownerDiscrepancyStatusLabel(item.status)}
                    {item.status === 'Approved' ? ' · correction approved' : item.status === 'Rejected' ? ' · correction rejected' : ''}
                  </Text>
                </View>
                {item.validationTarget === 'correction_request' && (
                  <View style={styles.omStatusCorrection}>
                    <Text style={styles.omStatusCorrectionText}>! Correction Request</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={styles.omDiscrepancyChevron}>›</Text>
          </Pressable>
        )) : (
          <View style={styles.alertEmptyState}>
            <View style={styles.alertEmptyBellCircle}><Text style={styles.alertEmptyBell}>▤</Text></View>
            <Text style={styles.alertEmptyTitle}>No discrepancy records match the selected filters.</Text>
          </View>
        )}

        <Modal visible={discrepancyFilterVisible} transparent animationType="fade" onRequestClose={() => setDiscrepancyFilterVisible(false)}>
          <View style={styles.omModalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setDiscrepancyFilterVisible(false)} />
            <View style={styles.omFilterSheet}>
              <View style={styles.omSheetHandle} />
              <Text style={styles.omFilterSheetTitle}>Filter</Text>
              <Text style={styles.omFilterSectionLabel}>Branch</Text>
              <View style={styles.omFilterChipWrap}>
                {[{ id: null, name: 'All branches' }, ...branches].map((branch) => {
                  const selected = discrepancyDraftBranch === branch.id;
                  return (
                    <Pressable key={branch.id ?? 'all'} accessibilityRole="button" onPress={() => setDiscrepancyDraftBranch(branch.id)} style={[styles.omFilterChip, selected && styles.omFilterChipSelected]}>
                      <Text style={[styles.omFilterChipText, selected && styles.omFilterChipTextSelected]}>{branch.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.omFilterSectionLabel}>Status</Text>
              <View style={styles.omFilterChipWrap}>
                {(['All status', 'Pending', 'Approved', 'Rejected', 'Validated', 'Rejected for Recount'] as const).map((status) => (
                  <Pressable key={status} accessibilityRole="button" onPress={() => setDiscrepancyDraftStatus(status)} style={[styles.omFilterChip, discrepancyDraftStatus === status && styles.omFilterChipSelected]}>
                    <Text style={[styles.omFilterChipText, discrepancyDraftStatus === status && styles.omFilterChipTextSelected]}>{status}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.omFilterActions}>
                <Pressable accessibilityRole="button" onPress={() => { setDiscrepancyDraftBranch(null); setDiscrepancyDraftStatus('All status'); }} style={styles.omFilterReset}>
                  <Text style={styles.omFilterResetText}>Reset</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => { setDiscrepancyBranchFilter(discrepancyDraftBranch); setDiscrepancyStatusFilter(discrepancyDraftStatus); setDiscrepancyFilterVisible(false); }} style={styles.omFilterApply}>
                  <Text style={styles.omFilterApplyText}>Apply</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  const renderRecords = () => (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recordFilterRow}>
        {(['All', 'Sales', 'Inventory', 'Counts', 'Audit'] as const).map((value) => {
          const selected = recordType === value;
          return (
            <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setRecordType(value)} style={[styles.alertTab, styles.recordFilterTab, selected && styles.alertTabSelected]}>
              <Text style={[styles.alertTabText, selected && styles.alertTabTextSelected]}>{value}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {salesError ? showError(OWNER_ALERT_LOAD_ERROR) : null}
      {activityError ? showError(OWNER_ALERT_LOAD_ERROR) : null}
      {salesLoading || activityLoading ? (
        <View style={styles.loadingCard}><ActivityIndicator color={colors.pink} /><Text style={styles.loadingText}>Loading records…</Text></View>
      ) : visibleActivities.length ? visibleActivities.map((item) => renderActivity(item, 'Records')) : (
        <EmptyState text="No sales or inventory records match the selected branch and period." />
      )}
    </>
  );

  const renderMore = () => (
    <MoreMenuScreen
      onOpenRecords={() => pushMenuPage('More', 'RecordCategories')}
      onOpenProfile={() => pushMenuPage('More', 'Profile')}
      onOpenVoidRequests={() => pushMenuPage('More', 'VoidRequests')}
    />
  );

  const pageTitle: Record<OwnerPage, string> = {
    Dashboard: 'Dashboard',
    Sales: 'Sales Summaries',
    Reports: 'Sales Summaries',
    Inventory: 'Inventory',
    CompareInventory: 'Compare Branches',
    Alerts: 'Alerts',
    More: 'More',
    Products: 'Products & Menu',
    Ingredients: 'Ingredients & Recipes',
    StockSettings: 'Stock Threshold & Expiration Settings',
    BusinessHours: 'Business Closing Time',
    Discrepancies: 'Discrepancy review',
    Records: 'Business records',
    SalesTransactions: 'Sales Transaction Records',
    RecordCategories: 'Records',
    SalesConsumptionRecords: 'Sales Consumption Records',
    StockInRecords: 'Stock-In Records',
    WasteSpillageRecords: 'Waste and Spillage Records',
    PhysicalCountRecords: 'Physical Inventory Count Records',
    AuthorizedAdjustmentRecords: 'Authorized Adjustment Records',
    VoidRequests: 'Requests',
    DailyClosingReport: 'Daily Closing Report',
    VoidReport: 'Void Report',
    ReversalReport: 'Reversal Report',
    ActivityDetail: 'Activity details',
    Profile: 'Owner profile',
    StaffAccounts: 'Staff accounts',
  };
  const activeIndex =
    page === 'Dashboard' ? 0
      : page === 'Sales' || page === 'Reports' ? 1
        : page === 'Inventory' || page === 'CompareInventory' ? 2
          : page === 'Discrepancies' ? 3
            : page === 'Alerts' ? 4
              : 5;

  return (
    <View {...menuBackGesture.panHandlers} style={[styles.screen, { maxWidth: contentWidth }, isMenuFlowPage && { backgroundColor: ownerMenu.colors.background }]}>
      {!isMenuFlowPage && page !== 'Profile' && page !== 'Sales' && page !== 'Reports' && page !== 'CompareInventory' && (
        <View style={[styles.topBar, page === 'Dashboard' && styles.dashboardTopBar]}>
          <View style={styles.topBarCopy}>
            {page === 'Dashboard' ? (
              <>
                <Text style={styles.ownerGreeting}>Hello,</Text>
                <Text style={styles.ownerGreetingName}>{user.displayName || 'Isabel San Esteban'}!</Text>
              </>
            ) : (
              <>
                <Text style={styles.appLabel}>TAKOSYNC · OWNER</Text>
                <Text style={styles.pageTitle}>{pageTitle[page]}</Text>
              </>
            )}
          </View>
          <View style={styles.topActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Refresh owner information" disabled={refreshing || discrepancyLoading} onPress={() => void refreshOwnerData()} style={styles.headerButton}>
              {refreshing ? <ActivityIndicator size="small" color={colors.navy} /> : <Text style={styles.headerButtonText}>↻</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Open alerts" onPress={() => setPage('Alerts')} style={styles.headerButton}>
              <Text style={styles.headerButtonText}>!</Text>
              {lowStock.length + sortedExpirationItems.length > 0 && <View style={styles.notificationDot} />}
            </Pressable>
            {page !== 'Dashboard' && (
              <Pressable accessibilityRole="button" accessibilityLabel="Open owner profile" onPress={() => setPage('Profile')} style={styles.avatarButton}>
                <Text style={styles.avatarText}>{user.displayName.trim().slice(0, 1).toUpperCase() || 'O'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {!isMenuFlowPage && page !== 'Dashboard' && page !== 'Sales' && page !== 'Reports' && page !== 'Inventory' && page !== 'CompareInventory' && page !== 'Alerts' && page !== 'Profile' && page !== 'Ingredients' && page !== 'BusinessHours' && page !== 'StaffAccounts' && page !== 'ActivityDetail' && (
        <View style={styles.branchFilterBlock}>
          <Text style={styles.filterLabel}>BRANCH</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: branchId === null }} onPress={() => onBranchChange(null)} style={[styles.branchChip, branchId === null && styles.branchChipSelected]}>
              <Text style={[styles.branchChipText, branchId === null && styles.branchChipTextSelected]}>All</Text>
            </Pressable>
            {branches.map((branch: Branch) => {
              const selected = branchId === branch.id;
              return (
                <Pressable key={branch.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onBranchChange(branch.id)} style={[styles.branchChip, selected && styles.branchChipSelected]}>
                  <Text style={[styles.branchChipText, selected && styles.branchChipTextSelected]} numberOfLines={1}>{branch.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView
        // OM-02 c8 / OM-13 c6: pull to refresh the dashboard, inventory, and alerts.
        refreshControl={page === 'Dashboard' || page === 'Inventory' || page === 'Alerts' ? (
          <RefreshControl refreshing={refreshing} onRefresh={() => void refreshOwnerData()} tintColor={colors.pink} colors={[colors.pink]} />
        ) : undefined}
        style={[styles.contentScroll, isMenuFlowPage && { backgroundColor: ownerMenu.colors.background }]}
        contentContainerStyle={page === 'Profile' ? styles.profileContent : isOwnerMenuPage ? styles.ownerMenuContent : styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {page === 'Dashboard' && renderDashboard()}
        {page === 'Sales' && renderSales()}
        {page === 'Reports' && renderReports()}
        {page === 'Inventory' && renderInventory()}
        {page === 'CompareInventory' && renderCompareInventory()}
        {page === 'Alerts' && renderAlerts()}
        {page === 'More' && renderMore()}
        {page === 'RecordCategories' && (
          <RecordsMenuScreen onSelectRecord={(route) => pushMenuPage('RecordCategories', route)} />
        )}
        {page === 'Products' && renderProducts()}
        {page === 'Ingredients' && <OwnerIngredientsRecipes onManageProducts={() => setPage('Products')} />}
        {page === 'StockSettings' && (
          <OwnerStockExpirationSettings
            branchId={branchId}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        )}
        {page === 'BusinessHours' && (
          <OwnerBusinessDaySettings
            user={user}
            onDeadlineChange={onBusinessSessionDeadlineChange}
          />
        )}
        {page === 'Discrepancies' && renderDiscrepancies()}
        {page === 'Records' && renderRecords()}
        {page === 'SalesTransactions' && (
          <SalesTransactionRecords
            onBack={() => {
              setInitialSalesTransactionId(null);
              goBackFromMenu();
            }}
            initialTransactionId={initialSalesTransactionId}
          />
        )}
        {page === 'SalesConsumptionRecords' && (
          <SalesConsumptionRecords
            onBack={goBackFromMenu}
            onOpenLinkedSale={(saleId) => {
              setInitialSalesTransactionId(saleId);
              setPage('SalesTransactions');
            }}
          />
        )}
        {page === 'StockInRecords' && (
          <StockInRecordsScreen
            onBack={goBackFromMenu}
            inventoryData={data}
            inventoryLoading={inventoryLoading}
            inventoryError={inventoryError}
            onRefresh={onRefresh}
          />
        )}
        {page === 'WasteSpillageRecords' && (
          <WasteSpillageRecordsScreen
            onBack={goBackFromMenu}
            branches={branches}
            inventoryLoading={inventoryLoading}
            inventoryError={inventoryError}
            onRefresh={onRefresh}
          />
        )}
        {page === 'PhysicalCountRecords' && (
          <PhysicalCountRecordsScreen
            onBack={goBackFromMenu}
            branches={branches}
            inventoryLoading={inventoryLoading}
            inventoryError={inventoryError}
            onRefresh={onRefresh}
            onOpenDiscrepancy={(record) => {
              setSelectedDiscrepancyId(record.discrepancyReviewId);
              setDiscrepancyView(record.discrepancyReviewId ? 'details' : 'list');
              setPage('Discrepancies');
            }}
          />
        )}
        {page === 'AuthorizedAdjustmentRecords' && <AuthorizedAdjustmentRecordsScreen onBack={goBackFromMenu} />}
        {page === 'VoidRequests' && <OwnerRequestsScreen onBack={goBackFromMenu} />}
        {page === 'DailyClosingReport' && <DailyClosingReportScreen onBack={goBackFromMenu} />}
        {page === 'VoidReport' && <VoidReportScreen onBack={goBackFromMenu} />}
        {page === 'ReversalReport' && <ReversalReportScreen onBack={goBackFromMenu} />}
        {page === 'ActivityDetail' && renderActivityDetail()}
        {page === 'Profile' && (
          <OwnerProfileScreen
            user={user}
            loggingOut={loggingOut}
            onBack={goBackFromMenu}
            onLogout={onLogout}
          />
        )}
        {page === 'StaffAccounts' && <OwnerStaffAccounts onBack={() => setPage('More')} />}
      </ScrollView>

      <OwnerBottomNav
        activeIndex={activeIndex}
        onSelect={(tab: OwnerTab) => {
          menuHistory.current = [];
          if (tab === 'dashboard') setPage('Dashboard');
          else if (tab === 'sales') setPage('Sales');
          else if (tab === 'inventory') setPage('Inventory');
          else if (tab === 'discrepancies') setPage('Discrepancies');
          else if (tab === 'alerts') setPage('Alerts');
          else setPage('More');
        }}
      />

      <Modal
        visible={activityDetailModalVisible && selectedActivity !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActivityDetailModalVisible(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close activity details"
          onPress={() => setActivityDetailModalVisible(false)}
          style={styles.activityDetailBackdrop}
        >
          {selectedActivity && (
            <Pressable onPress={() => undefined} style={styles.activityDetailModalCard}>
              <View style={styles.activityDetailModalHeader}>
                <Text style={styles.activityDetailModalTitle}>
                  {selectedActivity.category === 'Sales'
                    ? 'Sale Details'
                    : selectedActivity.type || 'Record Details'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={() => setActivityDetailModalVisible(false)}
                  style={styles.closeActionButton}
                >
                  <Text style={styles.closeActionText}>×</Text>
                </Pressable>
              </View>
              {selectedActivity.category === 'Sales' ? (
                <>
                  <View style={styles.activityDetailRow}>
                    <Text style={styles.activityDetailLabel}>Reference</Text>
                    <Text style={styles.activityDetailValue}>{selectedActivity.reference ?? '—'}</Text>
                  </View>
                  <View style={styles.activityDetailRow}><Text style={styles.activityDetailLabel}>Status</Text><Text style={styles.activityDetailStatus}>Recorded</Text></View>
                  <View style={styles.activityDetailRow}><Text style={styles.activityDetailLabel}>Type</Text><Text style={styles.activityDetailValue}>Sale</Text></View>
                  <View style={styles.activityDetailRow}><Text style={styles.activityDetailLabel}>Branch</Text><Text style={styles.activityDetailValue}>{branchNames.get(selectedActivity.branchId) ?? 'Branch unavailable'}</Text></View>
                  <View style={styles.activityDetailRow}><Text style={styles.activityDetailLabel}>Amount</Text><Text style={styles.activityDetailValue}>{selectedActivity.amount !== null ? currency(selectedActivity.amount) : '—'}</Text></View>
                  <View style={styles.activityDetailRow}><Text style={styles.activityDetailLabel}>Date & time</Text><Text style={styles.activityDetailValue}>{compactDate(selectedActivity.date)}</Text></View>
                </>
              ) : (
                <>
                  <View style={styles.activityDetailRow}><Text style={styles.activityDetailLabel}>Type</Text><Text style={styles.activityDetailValue}>{selectedActivity.type}</Text></View>
                  <View style={styles.activityDetailRow}><Text style={styles.activityDetailLabel}>Item</Text><Text style={styles.activityDetailValue}>{selectedActivity.detail.split(' · ')[0]}</Text></View>
                  <View style={styles.activityDetailRow}><Text style={styles.activityDetailLabel}>Quantity</Text><Text style={styles.activityDetailValue}>{selectedActivity.detail.split(' · ')[1] ?? '—'}</Text></View>
                  <View style={styles.activityDetailRow}><Text style={styles.activityDetailLabel}>Branch</Text><Text style={styles.activityDetailValue}>{branchNames.get(selectedActivity.branchId) ?? 'Branch unavailable'}</Text></View>
                  <View style={styles.activityDetailRow}><Text style={styles.activityDetailLabel}>Date & time</Text><Text style={styles.activityDetailValue}>{compactDate(selectedActivity.date)}</Text></View>
                </>
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setActivityDetailModalVisible(false);
                  setPage('Records');
                }}
                style={styles.activityDetailAction}
              >
                <Text style={styles.activityDetailActionText}>
                  {selectedActivity.category === 'Sales' ? 'View Full Transaction Details' : 'View Record Details'}
                </Text>
              </Pressable>
            </Pressable>
          )}
        </Pressable>
      </Modal>

      <Modal
        visible={periodSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPeriodSheetVisible(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close period selector"
          onPress={() => setPeriodSheetVisible(false)}
          style={styles.periodSheetBackdrop}
        >
          <Pressable onPress={() => undefined} style={styles.periodSheet}>
            <View style={styles.periodSheetHandle} />
            <Text style={styles.periodSheetTitle}>Choose a period.</Text>
            {(['Today', 'This Week', 'This Month', 'Custom'] as const).map((value) => {
              const selected = period === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    if (value === 'Custom') {
                      setPeriodSheetVisible(false);
                      setCalendarVisible(true);
                      setCalendarSelectedDate(customStart);
                      return;
                    }
                    onPeriodChange(value);
                    setPeriodSheetVisible(false);
                  }}
                  style={[styles.periodSheetOption, selected && styles.periodSheetOptionSelected]}
                >
                  <Text style={[styles.periodSheetOptionText, selected && styles.periodSheetOptionTextSelected]}>
                    {value === 'This Week' ? 'This week' : value === 'This Month' ? 'This month' : value === 'Custom' ? 'Custom date' : value}
                  </Text>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={calendarVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close calendar"
          onPress={() => setCalendarVisible(false)}
          style={styles.periodSheetBackdrop}
        >
          <Pressable onPress={() => undefined} style={[styles.periodSheet, styles.calendarSheet]}>
            <View style={styles.periodSheetHandle} />
            <View style={styles.calendarHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                onPress={() => setCalendarCursor(new Date(calendarYear, calendarMonth - 1, 1))}
                style={styles.calendarMonthButton}
              >
                <Text style={styles.calendarMonthButtonText}>‹</Text>
              </Pressable>
              <Text style={styles.calendarMonthLabel}>{calendarMonthLabel}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                onPress={() => setCalendarCursor(new Date(calendarYear, calendarMonth + 1, 1))}
                style={styles.calendarMonthButton}
              >
                <Text style={styles.calendarMonthButtonText}>›</Text>
              </Pressable>
            </View>
            <View style={styles.calendarWeekRow}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <Text key={day} style={styles.calendarWeekText}>{day}</Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {calendarCells.map((day, index) => {
                if (!day) return <View key={`blank-${index}`} style={styles.calendarDay} />;
                const dateValue = dateInputValue(calendarYear, calendarMonth, day);
                const selected = calendarSelectedDate === dateValue;
                return (
                  <Pressable
                    key={dateValue}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setCalendarSelectedDate(dateValue)}
                    style={[styles.calendarDay, selected && styles.calendarDaySelected]}
                  >
                    <Text style={[styles.calendarDayText, selected && styles.calendarDayTextSelected]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onCustomStartChange(calendarSelectedDate);
                onCustomEndChange(calendarSelectedDate);
                onPeriodChange('Custom');
                onApplyCustomRange();
                setCalendarVisible(false);
              }}
              style={styles.calendarApplyButton}
            >
              <Text style={styles.calendarApplyText}>Apply</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={selectedDiscrepancy !== null && discrepancyAction !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!adjustmentSubmitting) {
            setDiscrepancyAction(null);
          }
        }}
      >
        <View style={styles.productModalBackdrop}>
          <View style={styles.productModalCard}>
            <View style={styles.productModalHeader}>
              <Text style={styles.productModalTitle}>
                {discrepancyAction === 'approve'
                  ? 'Approve correction request'
                  : discrepancyAction === 'reject'
                    ? 'Reject correction request'
                    : 'Validate Count'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close count correction confirmation"
                disabled={adjustmentSubmitting}
                onPress={() => setDiscrepancyAction(null)}
                style={styles.closeActionButton}
              >
                <Text style={styles.closeActionText}>×</Text>
              </Pressable>
            </View>
            {selectedDiscrepancy ? (
              <>
                <Text style={styles.modalSummary}>
                  {selectedDiscrepancy.ingredient} · {selectedDiscrepancy.branch} · {selectedDiscrepancy.reference}
                </Text>
                <Text style={styles.modalSummary}>
                  Expected {selectedDiscrepancy.expected} {selectedDiscrepancy.unit}; original actual {selectedDiscrepancy.actual} {selectedDiscrepancy.unit}.
                  {'\n'}Adjusted quantity {selectedDiscrepancy.correctedActual} {selectedDiscrepancy.unit}.
                  {discrepancyAction === 'validate'
                    ? `\nAdjustment: ${selectedDiscrepancy.correctedActual - selectedDiscrepancy.expected > 0 ? '+' : ''}${Math.round((selectedDiscrepancy.correctedActual - selectedDiscrepancy.expected) * 1000) / 1000} ${selectedDiscrepancy.unit} added to the current balance.`
                    : ''}
                </Text>
                <Text style={styles.modalWarning}>
                  {discrepancyAction === 'approve'
                    ? 'Approval only accepts the Staff correction request. It does not change inventory. The Owner must separately use Validate Count.'
                    : discrepancyAction === 'reject'
                      ? 'Rejection is retained in the audit history. Staff may submit another correction request.'
                      : discrepancyAction === 'recount'
                        ? 'Reject Count asks staff to count this item again. The expected quantity is not changed, and this count can no longer be validated.'
                        : 'Validate Count adds the difference between the counted quantity and the expected quantity saved with the count to the current balance, so sales recorded since the count are kept. If corrected actual equals expected, it records a no-change resolution.'}
                </Text>
                <Text style={styles.fieldLabel}>
                  {discrepancyAction === 'validate' ? 'Validation reason *' : discrepancyAction === 'recount' ? 'Reason for the recount *' : 'Decision reason *'}
                </Text>
                <TextInput
                  value={adjustmentReason}
                  onChangeText={(value) => {
                    setAdjustmentReason(value);
                    setAdjustmentError('');
                  }}
                  placeholder="Explain why this adjustment is authorized"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Reason for count correction decision"
                  maxLength={1000}
                  multiline
                  style={[styles.textInput, styles.textArea, adjustmentError && styles.textInputError]}
                />
                {adjustmentError ? <Text style={styles.fieldError}>{adjustmentError}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={adjustmentSubmitting || !adjustmentReason.trim()}
                  onPress={() => void submitDiscrepancyAction()}
                  style={({ pressed }) => [
                    styles.primaryActionButton,
                    styles.modalPrimaryAction,
                    (adjustmentSubmitting || !adjustmentReason.trim()) && styles.disabledAction,
                    pressed && { opacity: 0.82 },
                  ]}
                >
                  {adjustmentSubmitting
                    ? <ActivityIndicator size="small" color={colors.white} />
                    : <Text style={styles.primaryActionText}>
                      {discrepancyAction === 'approve'
                        ? 'Confirm approval'
                        : discrepancyAction === 'reject'
                          ? 'Confirm rejection'
                          : discrepancyAction === 'recount'
                            ? 'Confirm Reject Count'
                            : 'Confirm Validate Count'}
                    </Text>}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={adjustmentSubmitting}
                  onPress={() => setDiscrepancyAction(null)}
                  style={styles.modalCancelAction}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(createThemedStyles({
    screen: { flex: 1, width: '100%', alignSelf: 'center', backgroundColor: colors.pale },
    topBar: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 7, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line },
    dashboardTopBar: { minHeight: 78, alignItems: 'center', paddingTop: 9, paddingBottom: 8, backgroundColor: colors.navy, borderBottomWidth: 0 },
    topBarCopy: { flex: 1, minWidth: 0 },
    ownerGreeting: { color: '#FFFFFF', fontFamily: font.regular, fontSize: 10 },
    ownerGreetingName: { color: '#FFFFFF', fontFamily: font.bold, fontSize: 16, marginTop: 1 },
    appLabel: { color: colors.pink, fontFamily: font.bold, fontSize: 7, letterSpacing: 1 },
    pageTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 15, marginTop: 1 },
    topActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
    headerButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.pink },
    headerButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 16, lineHeight: 20 },
    notificationDot: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.pink, borderWidth: 1, borderColor: colors.white },
    avatarButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#FCE3EB' },
    avatarText: { color: colors.pink, fontFamily: font.bold, fontSize: 13 },
    branchFilterBlock: { paddingTop: 9, paddingBottom: 10, paddingHorizontal: 18, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line },
    filterLabel: { color: colors.muted, fontFamily: font.semibold, fontSize: 7, letterSpacing: 0.8, marginBottom: 6 },
    chipRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingRight: 8 },
    branchChip: { maxWidth: 185, minHeight: 29, justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.pale },
    branchChipSelected: { backgroundColor: colors.pink, borderColor: colors.pink },
    branchChipText: { color: colors.ink, fontFamily: font.medium, fontSize: 8 },
    branchChipTextSelected: { color: colors.white, fontFamily: font.semibold },
    contentScroll: { flex: 1 },
    content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18 },
    profileContent: { flexGrow: 1, paddingBottom: 0 },
    ownerMenuContent: { flexGrow: 1, paddingBottom: OWNER_NAVIGATION_HEIGHT },
    totalSalesCard: { minHeight: 126, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 14, marginBottom: 10, borderRadius: 18, backgroundColor: colors.pink },
    totalSalesTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    totalSalesLabel: { color: colors.white, fontFamily: font.semibold, fontSize: 12 },
    totalSalesPeriod: { minHeight: 32, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)' },
    totalSalesPeriodText: { color: colors.white, fontFamily: font.semibold, fontSize: 8 },
    totalSalesPeriodChevron: { color: colors.white, fontFamily: font.bold, fontSize: 10, marginLeft: 5 },
    totalSalesAmount: { color: colors.white, fontFamily: font.bold, fontSize: 28, lineHeight: 34, marginTop: 7 },
    totalSalesUpdated: { color: '#FFE4EC', fontFamily: font.regular, fontSize: 8, marginTop: 2 },
    salesLoadingCompact: { minHeight: 53, flexDirection: 'row', alignItems: 'center', gap: 8 },
    salesLoadingText: { color: colors.white, fontFamily: font.regular, fontSize: 8 },
    branchSalesList: { marginBottom: 4 },
    branchSalesCard: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 8, borderRadius: 14, backgroundColor: colors.pale, borderWidth: 1, borderColor: colors.line },
    branchSalesCardPressed: { opacity: 0.78 },
    branchLocationIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, marginRight: 9, backgroundColor: '#FFF1D8' },
    branchLocationIconText: { color: '#A96A13', fontFamily: font.bold, fontSize: 17 },
    branchSalesCopy: { flex: 1, minWidth: 0 },
    branchSalesName: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
    branchSalesSupporting: { color: colors.muted, fontFamily: font.regular, fontSize: 7, marginTop: 2 },
    branchSalesAmount: { color: colors.navy, fontFamily: font.bold, fontSize: 9, marginLeft: 6 },
    branchSalesChevron: { color: colors.muted, fontFamily: font.semibold, fontSize: 18, marginLeft: 7 },
    inventoryStatusGrid: { flexDirection: 'row', gap: 7, marginBottom: 4 },
    inventoryBranchStatusList: { marginTop: 8, gap: 6 },
    inventoryBranchStatusRow: {
      minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.alertGrayFill,
    },
    inventoryBranchStatusName: { color: colors.alertDarkText, fontFamily: font.semibold, fontSize: 10 },
    inventoryBranchStatusCounts: { color: colors.alertDarkText, fontFamily: font.regular, fontSize: 10 },
    inventoryStatusCard: { flex: 1, minHeight: 74, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 14 },
    inventoryStatusNormal: { backgroundColor: '#E8F6EC' },
    inventoryStatusLow: { backgroundColor: '#FDE672' },
    inventoryStatusOut: { backgroundColor: '#FCE3EB' },
    inventoryStatusValue: { color: colors.navy, fontFamily: font.bold, fontSize: 20 },
    inventoryStatusLabel: { color: colors.navy, fontFamily: font.semibold, fontSize: 8, marginTop: 3, textAlign: 'left' },
    lowStockCard: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 8, marginBottom: 7, borderRadius: 13, backgroundColor: colors.pale, borderWidth: 1, borderColor: colors.line },
    lowStockIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, marginRight: 9, backgroundColor: colors.paleRed },
    lowStockIconText: { color: colors.red, fontFamily: font.bold, fontSize: 12 },
    lowStockName: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
    lowStockMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 3 },
    welcomePanel: { minHeight: 98, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, marginBottom: 12, borderRadius: 19, backgroundColor: colors.navy, overflow: 'hidden' },
    welcomeCopy: { flex: 1, paddingRight: 8 },
    eyebrow: { color: colors.orange, fontFamily: font.semibold, fontSize: 7, letterSpacing: 1 },
    welcomeTitle: { color: colors.white, fontFamily: font.bold, fontSize: 16, marginTop: 5 },
    welcomeSubtext: { color: '#D5D5E0', fontFamily: font.regular, fontSize: 8, marginTop: 3 },
    welcomeMark: { width: 49, height: 49, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.pink },
    welcomeMarkText: { color: colors.white, fontFamily: font.bold, fontSize: 23 },
    periodRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
    periodChip: { flex: 1, minHeight: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.white },
    periodChipSelected: { borderColor: colors.pink, backgroundColor: '#FCE3EB' },
    periodText: { color: colors.muted, fontFamily: font.medium, fontSize: 8 },
    periodTextSelected: { color: colors.pink, fontFamily: font.semibold },
    customRange: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4, marginBottom: 14 },
    dateInput: { flex: 1, height: 35, minWidth: 80, paddingHorizontal: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.white, color: colors.ink, fontFamily: font.regular, fontSize: 8 },
    dateSeparator: { color: colors.muted, fontFamily: font.regular, fontSize: 8 },
    applyButton: { minHeight: 35, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.pink },
    applyButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 8 },
    sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, marginBottom: 8 },
    sectionTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 11 },
    sectionActionButton: { minHeight: 28, justifyContent: 'center', paddingLeft: 8 },
    sectionActionText: { color: colors.pink, fontFamily: font.semibold, fontSize: 8 },
    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginBottom: 5 },
    metricCard: { width: '48%', minHeight: 82, padding: 11, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white },
    metricCardFeatured: { width: '100%', minHeight: 79, backgroundColor: colors.pink, borderColor: colors.pink },
    metricLabel: { color: colors.muted, fontFamily: font.medium, fontSize: 8 },
    metricValue: { color: colors.navy, fontFamily: font.bold, fontSize: 17, marginTop: 5 },
    metricValueFeatured: { color: colors.white, fontSize: 22, marginTop: 1 },
    metricCaption: { color: colors.muted, fontFamily: font.regular, fontSize: 7, marginTop: 3 },
    metricCaptionFeatured: { color: '#FFE6EE' },
    bestBranchValue: { color: colors.navy, fontFamily: font.semibold, fontSize: 11, marginTop: 8 },
    panel: { paddingHorizontal: 12, paddingVertical: 5, marginBottom: 4, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.white },
    branchMetric: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
    branchMetricHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    branchName: { flex: 1, color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
    branchTotal: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
    branchMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 7, marginTop: 3 },
    barTrack: { height: 5, marginTop: 6, overflow: 'hidden', borderRadius: 4, backgroundColor: colors.pale },
    barFill: { height: '100%', borderRadius: 4, backgroundColor: colors.orange },
    inventorySummary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 7, padding: 10, marginBottom: 4, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
    inventorySummaryItem: { width: '48%', minHeight: 42, justifyContent: 'center', paddingHorizontal: 5 },
    inventorySummaryValue: { color: colors.navy, fontFamily: font.bold, fontSize: 15 },
    inventorySummaryLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 7 },
    listCard: { minHeight: 59, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 8, marginBottom: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.white },
    itemMark: { width: 30, height: 30, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginRight: 9 },
    itemMarkGood: { backgroundColor: colors.paleGreen },
    itemMarkLow: { backgroundColor: colors.paleRed },
    itemMarkWarning: { backgroundColor: colors.yellow },
    itemMarkText: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
    listCopy: { flex: 1, minWidth: 0 },
    listTitle: { color: colors.ink, fontFamily: font.semibold, fontSize: 8 },
    listMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 2 },
    listTrailing: { alignItems: 'flex-end', marginLeft: 6 },
    quantityText: { color: colors.navy, fontFamily: font.semibold, fontSize: 8, marginBottom: 3 },
    statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
    statusBadgeText: { fontFamily: font.semibold, fontSize: 6 },
    lowBadge: { backgroundColor: colors.paleRed },
    lowBadgeText: { color: colors.red },
    goodBadge: { backgroundColor: colors.paleGreen },
    goodBadgeText: { color: colors.green },
    warningBadge: { backgroundColor: colors.yellow },
    warningBadgeText: { color: '#8D6414' },
    activityCard: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 8, marginBottom: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.white },
    activityCardPressed: { opacity: 0.78 },
    activityChevron: { color: colors.muted, fontFamily: font.semibold, fontSize: 16, marginLeft: 6 },
    detailBackButton: { minHeight: 34, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 3, marginBottom: 8 },
    detailBackText: { color: colors.pink, fontFamily: font.semibold, fontSize: 9 },
    activityDetailCard: { padding: 15, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.white },
    detailTitle: { color: colors.navy, fontFamily: font.bold, fontSize: 16, marginTop: 5 },
    detailBody: { color: colors.ink, fontFamily: font.regular, fontSize: 9, lineHeight: 15, marginTop: 8 },
    detailDivider: { height: 1, backgroundColor: colors.line, marginVertical: 11 },
    activityIcon: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginRight: 9 },
    activitySalesIcon: { backgroundColor: '#FCE3EB' },
    activityInventoryIcon: { backgroundColor: colors.pale },
    activityIconText: { color: colors.pink, fontFamily: font.semibold, fontSize: 10 },
    searchBox: { minHeight: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 7, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
    searchGlyph: { color: colors.muted, fontSize: 20, marginRight: 7 },
    searchInput: { flex: 1, height: 40, color: colors.ink, fontFamily: font.regular, fontSize: 8, paddingVertical: 0 },
    clearSearch: { color: colors.muted, fontSize: 20, paddingLeft: 8 },
    productOverviewGrid: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    bentoSummaryCard: { flex: 1, minHeight: 80, padding: 12, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
    bentoLabel: { color: colors.muted, fontFamily: font.medium, fontSize: 7 },
    bentoValue: { color: colors.navy, fontFamily: font.bold, fontSize: 18, marginTop: 8 },
    bentoValueSuccess: { color: colors.green },
    bentoValueMuted: { color: colors.red },
    primaryActionButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginBottom: 10, borderRadius: 12, backgroundColor: colors.pink },
    primaryActionText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
    secondaryActionButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginTop: 10, borderRadius: 12, backgroundColor: '#FCE3EB' },
    secondaryActionText: { color: colors.pink, fontFamily: font.semibold, fontSize: 9 },
    productCard: { padding: 12, marginBottom: 8, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
    productMetaRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    productCopy: { flex: 1, minWidth: 0 },
    productName: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
    productDescription: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 3 },
    productFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    productPriceLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 7 },
    productPriceValue: { color: colors.navy, fontFamily: font.bold, fontSize: 12, marginTop: 2 },
    availabilityPill: { minHeight: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 999, borderWidth: 1 },
    availabilityAvailable: { backgroundColor: colors.paleGreen, borderColor: '#CFE9D7' },
    availabilityUnavailable: { backgroundColor: colors.paleRed, borderColor: '#F4D5DA' },
    availabilityText: { color: colors.green, fontFamily: font.semibold, fontSize: 7 },
    availabilityTextMuted: { color: colors.red },
    editActionButton: { minHeight: 27, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 9, backgroundColor: '#FCE3EB' },
    editActionText: { color: colors.pink, fontFamily: font.semibold, fontSize: 7 },
    productDetailSheet: { padding: 12, marginTop: 10, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
    productDetailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    productDetailLabel: { color: colors.muted, fontFamily: font.medium, fontSize: 7, marginBottom: 4 },
    productDetailText: { color: colors.navy, fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginBottom: 10 },
    productDetailGrid: { flexDirection: 'row', gap: 8 },
    detailStatBox: { flex: 1, minHeight: 60, padding: 10, borderRadius: 12, backgroundColor: colors.pale, borderWidth: 1, borderColor: colors.line },
    productDetailValue: { color: colors.navy, fontFamily: font.semibold, fontSize: 11 },
    closeActionButton: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.pale },
    closeActionText: { color: colors.navy, fontFamily: font.bold, fontSize: 16 },
    productModalBackdrop: { position: 'absolute', inset: 0, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(16, 16, 39, 0.35)' },
    productModalCard: { maxWidth: 420, width: '100%', alignSelf: 'center', padding: 16, borderRadius: 18, backgroundColor: colors.white },
    productModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    productModalTitle: { color: colors.navy, fontFamily: font.bold, fontSize: 14 },
    modalSummary: { color: colors.ink, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginBottom: 8 },
    modalWarning: { color: '#735518', fontFamily: font.medium, fontSize: 8, lineHeight: 13, padding: 9, marginBottom: 4, borderRadius: 9, backgroundColor: '#FFF7E5' },
    modalPrimaryAction: { marginTop: 12, marginBottom: 0 },
    disabledAction: { opacity: 0.55 },
    modalCancelAction: { minHeight: 36, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    modalCancelText: { color: colors.muted, fontFamily: font.semibold, fontSize: 8 },
    fieldLabel: { color: colors.navy, fontFamily: font.semibold, fontSize: 8, marginTop: 8, marginBottom: 6 },
    textInput: { minHeight: 38, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, color: colors.ink, fontFamily: font.regular, fontSize: 8 },
    textArea: { minHeight: 74, textAlignVertical: 'top', paddingTop: 9 },
    textInputError: { borderColor: colors.red },
    fieldError: { color: colors.red, fontFamily: font.regular, fontSize: 7, marginTop: 4 },
    segmentedRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
    segmentButton: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
    segmentButtonSelected: { borderColor: colors.pink, backgroundColor: '#FCE3EB' },
    segmentButtonText: { color: colors.muted, fontFamily: font.medium, fontSize: 7 },
    segmentButtonTextSelected: { color: colors.pink, fontFamily: font.semibold },
    feedbackText: { marginTop: 8, fontFamily: font.medium, fontSize: 7 },
    feedbackSuccess: { color: colors.green },
    feedbackError: { color: colors.red },
    dataDisclaimer: { color: colors.muted, fontFamily: font.regular, fontSize: 7, marginBottom: 10 },
    alertsScreen: { flex: 1, minHeight: 520 },
    alertTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    alertTab: { flexBasis: '47%', flexGrow: 1, minHeight: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.alertGrayFill },
    alertTabSelected: { backgroundColor: colors.alertNavy },
    alertDecisionNote: { color: colors.alertDarkText, fontFamily: font.regular, fontSize: 9, lineHeight: 13, textAlign: 'center', marginTop: 12, opacity: 0.75 },
    alertTabText: { color: colors.alertDarkText, fontFamily: font.semibold, fontSize: 10 },
    alertTabTextSelected: { color: colors.white, fontFamily: font.bold },
    alertBranchChips: { flexDirection: 'row', justifyContent: 'flex-start', gap: 8, marginBottom: 12 },
    alertBranchChip: { minHeight: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 11, backgroundColor: colors.alertGrayFill },
    alertBranchChipSelected: { backgroundColor: colors.alertCrimson },
    alertBranchChipText: { color: colors.alertDarkText, fontFamily: font.semibold, fontSize: 9 },
    alertBranchChipTextSelected: { color: colors.white },
    alertCardList: { gap: 8 },
    alertCard: { minHeight: 112, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.alertGrayFill },
    alertCardTop: { minHeight: 42, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    alertCardIdentity: { flex: 1, minWidth: 0, paddingRight: 8 },
    alertCardName: { color: colors.alertNavy, fontFamily: font.bold, fontSize: 12, lineHeight: 16 },
    alertBranchLine: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
    alertPinIcon: { color: colors.muted, fontFamily: font.semibold, fontSize: 8, marginRight: 4 },
    alertBranchName: { color: colors.muted, fontFamily: font.regular, fontSize: 8 },
    alertStatusBadge: { minHeight: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderRadius: 8 },
    alertStatusLow: { backgroundColor: colors.alertLowStock },
    alertStatusOut: { backgroundColor: colors.alertOutStock },
    alertStatusNear: { backgroundColor: colors.alertNearExpiration },
    alertStatusExpired: { backgroundColor: colors.alertOutStock },
    alertStatusText: { color: colors.alertDarkText, fontFamily: font.semibold, fontSize: 8, lineHeight: 10 },
    alertStatusTextLight: { color: colors.white },
    alertCardDivider: { height: 1, marginVertical: 6, backgroundColor: colors.alertDivider },
    alertCardBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    alertMetricLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginBottom: 3 },
    alertMetricRight: { alignItems: 'flex-end' },
    alertMetricValue: { color: colors.alertNavy, fontFamily: font.bold, fontSize: 12 },
    alertLoadingCenter: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
    alertLoadingText: { color: colors.muted, fontFamily: font.regular, fontSize: 10, marginTop: 10 },
    alertErrorCenter: { minHeight: 300, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    alertWifiIcon: { color: colors.alertCrimson, fontFamily: font.bold, fontSize: 32, lineHeight: 36, marginBottom: 10 },
    alertErrorText: { maxWidth: 220, color: colors.alertDarkText, fontFamily: font.regular, fontSize: 11, lineHeight: 16, textAlign: 'center' },
    alertRetryButton: { minWidth: 120, minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.alertCrimson, backgroundColor: colors.white },
    alertRetryIcon: { color: colors.alertCrimson, fontFamily: font.semibold, fontSize: 11, marginRight: 6 },
    alertRetryText: { color: colors.alertCrimson, fontFamily: font.semibold, fontSize: 10 },
    alertEmptyState: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
    alertEmptyBellCircle: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, marginBottom: 10, backgroundColor: colors.alertLavender },
    alertEmptyBell: { color: colors.alertNavy, fontFamily: font.semibold, fontSize: 20 },
    alertEmptyTitle: { color: colors.alertNavy, fontFamily: font.bold, fontSize: 11, textAlign: 'center' },
    alertEmptySubtext: { color: colors.muted, fontFamily: font.regular, fontSize: 9, textAlign: 'center', marginTop: 4 },
    omPageTitle: { color: colors.alertNavy, fontFamily: font.bold, fontSize: 20, marginBottom: 12 },
    omFilterDropdownRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    omFilterDropdown: { flex: 1, height: 32, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, borderRadius: 12, backgroundColor: colors.alertGrayFill },
    omFilterDropdownIcon: { color: colors.alertDarkText, fontFamily: font.semibold, fontSize: 10, marginRight: 5 },
    omFilterDropdownText: { flex: 1, color: colors.alertDarkText, fontFamily: font.medium, fontSize: 10 },
    omFilterDropdownChevron: { color: colors.muted, fontFamily: font.semibold, fontSize: 10 },
    omEditButton: { height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginBottom: 10, backgroundColor: colors.alertCrimson },
    omEditButtonText: { color: colors.white, fontFamily: font.bold, fontSize: 11 },
    omDiscrepancyListCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, borderRadius: 12, backgroundColor: colors.alertGrayFill },
    omDiscrepancyListCopy: { flex: 1, minWidth: 0 },
    omDiscrepancyCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    omDiscrepancyName: { flex: 1, color: colors.alertNavy, fontFamily: font.bold, fontSize: 12, marginRight: 8 },
    omDiscrepancyNegative: { color: colors.discrepancyRed, fontFamily: font.bold, fontSize: 12 },
    omDiscrepancyRevised: { color: colors.alertCrimson },
    omDiscrepancyMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 4 },
    omBadgeRow: { flexDirection: 'row', gap: 5, marginTop: 6 },
    omStatusBadge: { minHeight: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderRadius: 8 },
    omStatusPending: { backgroundColor: colors.discrepancyPending },
    omStatusAdjusted: { backgroundColor: colors.discrepancyAdjusted },
    omStatusBadgeText: { fontFamily: font.semibold, fontSize: 8, lineHeight: 10 },
    omStatusPendingText: { color: colors.discrepancyPendingText },
    omStatusAdjustedText: { color: colors.white },
    omStatusCorrection: { minHeight: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.alertCrimson, backgroundColor: colors.discrepancyCorrection },
    omStatusCorrectionText: { color: colors.alertCrimson, fontFamily: font.semibold, fontSize: 8, lineHeight: 10 },
    omDiscrepancyChevron: { color: colors.muted, fontFamily: font.semibold, fontSize: 18, marginLeft: 8 },
    omDiscrepancySubHeader: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    omBackButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    omBackText: { color: colors.alertNavy, fontFamily: font.bold, fontSize: 24 },
    omHeaderTitle: { color: colors.alertNavy, fontFamily: font.bold, fontSize: 16 },
    omHeaderSpacer: { width: 32 },
    omDiscrepancyCard: { padding: 14, marginBottom: 10, borderRadius: 12, backgroundColor: colors.alertGrayFill },
    omDiscrepancyDetailRow: { minHeight: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 },
    omDiscrepancyDetailLabel: { flex: 1, color: colors.muted, fontFamily: font.regular, fontSize: 9, marginRight: 8 },
    omDiscrepancyDetailValue: { maxWidth: '58%', color: colors.alertNavy, fontFamily: font.bold, fontSize: 9, textAlign: 'right' },
    omPrimaryButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginBottom: 8, backgroundColor: colors.alertCrimson },
    omPrimaryButtonText: { color: colors.white, fontFamily: font.bold, fontSize: 11 },
    omSecondaryButton: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.alertGrayFill },
    omSecondaryButtonText: { color: colors.alertDarkText, fontFamily: font.semibold, fontSize: 11 },
    omValidateScreen: { flex: 1, minHeight: 520 },
    omLoadingCenter: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
    omValidateScroll: { paddingBottom: 12 },
    omValidateSubtitle: { color: colors.alertNavy, fontFamily: font.bold, fontSize: 10, marginBottom: 8 },
    omValidateField: { marginBottom: 8 },
    omValidateLabel: { color: colors.alertDarkText, fontFamily: font.semibold, fontSize: 9, marginBottom: 5 },
    omRequiredStar: { color: colors.alertCrimson, fontFamily: font.bold },
    omValidateReadOnly: { height: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.alertGrayFill },
    omValidateReadOnlyText: { color: colors.alertDarkText, fontFamily: font.regular, fontSize: 11 },
    omValidateHelper: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 4 },
    omValidateInput: { minHeight: 34, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.alertDivider, backgroundColor: colors.white, color: colors.alertNavy, fontFamily: font.regular, fontSize: 10, textAlignVertical: 'top' },
    omValidateInputFocused: { borderColor: colors.alertCrimson },
    omValidateError: { color: colors.discrepancyRed, fontFamily: font.regular, fontSize: 8, marginTop: 4 },
    omInfoBanner: { borderRadius: 10, padding: 10, backgroundColor: colors.discrepancyLavender },
    omInfoBannerText: { color: colors.alertNavy, fontFamily: font.regular, fontSize: 8, lineHeight: 12 },
    omValidateActions: { flexDirection: 'row', gap: 8, paddingTop: 8, paddingBottom: 8 },
    omValidateActionButton: { flex: 1, marginBottom: 0 },
    omSavingButtonRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    omDisabled: { opacity: 0.55 },
    omSaveErrorBanner: { flexDirection: 'row', alignItems: 'flex-start', padding: 10, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.discrepancyRed, backgroundColor: colors.paleRed },
    omSaveErrorIcon: { color: colors.discrepancyRed, fontFamily: font.bold, fontSize: 12, marginRight: 7 },
    omSaveErrorCopy: { flex: 1, alignItems: 'flex-end' },
    omSaveErrorText: { alignSelf: 'stretch', color: colors.discrepancyRed, fontFamily: font.regular, fontSize: 8, lineHeight: 12 },
    omRetryPill: { height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginTop: 6, borderRadius: 11, backgroundColor: colors.alertCrimson },
    omRetryPillText: { color: colors.white, fontFamily: font.bold, fontSize: 8 },
    omCorrectionRejectButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.alertCrimson, marginBottom: 8, backgroundColor: colors.white },
    omCorrectionRejectText: { color: colors.alertCrimson, fontFamily: font.bold, fontSize: 11 },
    omCorrectionValidateButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.alertNavy },
    omModalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', backgroundColor: 'rgba(15,16,37,0.50)' },
    omBottomSheet: { width: '100%', maxWidth: 390, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 8, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.white },
    omFilterSheet: { width: '100%', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 22, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.white },
    omSheetHandle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, marginBottom: 12, backgroundColor: '#D8D8DE' },
    omFilterSheetTitle: { color: colors.alertNavy, fontFamily: font.bold, fontSize: 13, marginBottom: 12 },
    omFilterSectionLabel: { color: colors.alertNavy, fontFamily: font.semibold, fontSize: 9, marginBottom: 6 },
    omFilterChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    omFilterChip: { minHeight: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.alertGrayFill },
    omFilterChipSelected: { backgroundColor: colors.alertNavy },
    omFilterChipText: { color: colors.alertDarkText, fontFamily: font.medium, fontSize: 9 },
    omFilterChipTextSelected: { color: colors.white, fontFamily: font.semibold },
    omFilterActions: { flexDirection: 'row', gap: 8 },
    omFilterReset: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.alertGrayFill },
    omFilterResetText: { color: colors.alertDarkText, fontFamily: font.semibold, fontSize: 11 },
    omFilterApply: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.alertCrimson },
    omFilterApplyText: { color: colors.white, fontFamily: font.bold, fontSize: 11 },
    omDialogScrim: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(15,16,37,0.50)' },
    omResultDialog: { width: 240, alignItems: 'center', padding: 16, borderRadius: 16, backgroundColor: colors.white },
    omResultDialogTitle: { color: colors.alertNavy, fontFamily: font.bold, fontSize: 11, textAlign: 'center', marginBottom: 8 },
    omResultDialogBody: { color: colors.alertDarkText, fontFamily: font.regular, fontSize: 8, lineHeight: 12, textAlign: 'center', marginBottom: 8 },
    omResultDialogActions: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 4 },
    omDialogCancelButton: { flex: 1, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.alertCrimson, backgroundColor: colors.white },
    omDialogCancelText: { color: colors.alertCrimson, fontFamily: font.semibold, fontSize: 10 },
    omDialogConfirmButton: { flex: 1, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.alertCrimson },
    omSavingDialog: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.white },
    omSavingText: { color: colors.alertNavy, fontFamily: font.bold, fontSize: 10, marginTop: 8 },
    omSuccessCircle: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, marginBottom: 8, backgroundColor: colors.discrepancyAdjusted },
    omRejectCircle: { backgroundColor: colors.discrepancyRed },
    omSuccessCheck: { color: colors.white, fontFamily: font.bold, fontSize: 16 },
    omResultDoneButton: { width: 100, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8, marginTop: 4, backgroundColor: colors.alertCrimson },
    recordFilterRow: { flexDirection: 'row', gap: 5, paddingVertical: 2, marginBottom: 10 },
    recordFilterTab: { minWidth: 68, flex: 0, paddingHorizontal: 10 },
    noticeCard: { padding: 13, marginBottom: 10, borderRadius: 13, backgroundColor: '#FFF7E5', borderWidth: 1, borderColor: '#F7E5BC' },
    noticeTitle: { color: '#735518', fontFamily: font.semibold, fontSize: 9 },
    noticeText: { color: '#735518', fontFamily: font.regular, fontSize: 7, lineHeight: 12, marginTop: 4 },
    discrepancyCard: { padding: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
    discrepancyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    quantityCompare: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.line, borderBottomWidth: 1, borderBottomColor: colors.line },
    compareLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 7 },
    compareValue: { color: colors.navy, fontFamily: font.semibold, fontSize: 8, marginTop: 4 },
    remarksText: { color: colors.ink, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginVertical: 8 },
    adjustmentAudit: { padding: 9, marginTop: 4, borderRadius: 10, backgroundColor: colors.paleGreen },
    discrepancyActions: { flexDirection: 'row', gap: 8 },
    discrepancyActionButton: { flex: 1 },
    auditDetail: { color: colors.ink, fontFamily: font.regular, fontSize: 7, lineHeight: 12, marginVertical: 2 },
    workflowUnavailable: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, paddingHorizontal: 2, marginVertical: 10 },
    moreCard: { minHeight: 65, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, marginBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white },
    moreIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 11, marginRight: 10, backgroundColor: '#FCE3EB' },
    themeIcon: { backgroundColor: colors.pale },
    moreIconText: { color: colors.pink, fontFamily: font.semibold, fontSize: 13 },
    moreChevron: { color: colors.muted, fontSize: 20, marginLeft: 8 },
    themeSwitch: { minHeight: 29, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 15, backgroundColor: colors.pale },
    themeSwitchText: { color: colors.navy, fontFamily: font.medium, fontSize: 7 },
    logoutCard: { minHeight: 43, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderRadius: 13, backgroundColor: colors.paleRed },
    logoutText: { color: colors.red, fontFamily: font.semibold, fontSize: 9 },
    profileCard: { alignItems: 'center', paddingVertical: 22, marginBottom: 10, borderRadius: 18, backgroundColor: colors.white },
    profileAvatar: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 31, backgroundColor: '#FCE3EB' },
    profileInitials: { color: colors.pink, fontFamily: font.bold, fontSize: 24 },
    profileName: { color: colors.navy, fontFamily: font.semibold, fontSize: 12, marginTop: 9 },
    profileRole: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
    profileRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line },
    profileRowLast: { borderBottomWidth: 0 },
    profileValue: { maxWidth: '67%', color: colors.navy, fontFamily: font.medium, fontSize: 8, textAlign: 'right' },
    errorCard: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 11, paddingVertical: 8, marginBottom: 8, borderRadius: 12, backgroundColor: colors.paleRed },
    errorText: { flex: 1, color: colors.red, fontFamily: font.medium, fontSize: 8, lineHeight: 12 },
    successCard: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 8, marginBottom: 8, borderRadius: 12, backgroundColor: colors.paleGreen },
    successText: { color: colors.green, fontFamily: font.medium, fontSize: 8, lineHeight: 12 },
    retryAction: { paddingHorizontal: 9, paddingVertical: 6, marginLeft: 7, borderRadius: 9, backgroundColor: colors.white },
    retryText: { color: colors.pink, fontFamily: font.semibold, fontSize: 8 },
    skeletonCard: { minHeight: 62, justifyContent: 'center', gap: 8, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.white },
    skeletonBar: { height: 10, borderRadius: 5, backgroundColor: colors.line },
    skeletonBarWide: { width: '70%' },
    skeletonBarNarrow: { width: '40%' },
    loadingCard: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.white },
    loadingText: { color: colors.muted, fontFamily: font.regular, fontSize: 8 },
    emptyState: { minHeight: 55, justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 12, marginBottom: 8, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
    emptyStateText: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 12 },
    lowText: { color: colors.red },
    warningText: { color: '#8D6414' },
    periodSheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,16,37,0.45)' },
    periodSheet: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.white },
    periodSheetHandle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, marginBottom: 12, backgroundColor: '#D8D8DE' },
    periodSheetTitle: { color: colors.navy, fontFamily: font.bold, fontSize: 16, textAlign: 'center', marginBottom: 14 },
    periodSheetOption: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, marginBottom: 8, borderRadius: 12, backgroundColor: colors.pale },
    periodSheetOptionSelected: { backgroundColor: colors.pink },
    periodSheetOptionText: { color: colors.navy, fontFamily: font.semibold, fontSize: 11 },
    periodSheetOptionTextSelected: { color: colors.white },
    calendarSheet: { paddingBottom: 18 },
    calendarHeader: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    calendarMonthButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
    calendarMonthButtonText: { color: colors.navy, fontFamily: font.bold, fontSize: 22 },
    calendarMonthLabel: { color: colors.navy, fontFamily: font.bold, fontSize: 13 },
    calendarWeekRow: { flexDirection: 'row', marginBottom: 4 },
    calendarWeekText: { flex: 1, color: colors.muted, fontFamily: font.medium, fontSize: 7, textAlign: 'center' },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    calendarDay: { width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
    calendarDaySelected: { backgroundColor: colors.pink },
    calendarDayText: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
    calendarDayTextSelected: { color: colors.white, fontFamily: font.bold },
    calendarApplyButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 10, borderRadius: 24, backgroundColor: colors.pink },
    calendarApplyText: { color: colors.white, fontFamily: font.bold, fontSize: 11 },
    activityDetailBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,16,37,0.45)' },
    activityDetailModalCard: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 22, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.white },
    activityDetailModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    activityDetailModalTitle: { color: colors.navy, fontFamily: font.bold, fontSize: 16 },
    activityDetailRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line },
    activityDetailLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 9 },
    activityDetailValue: { flexShrink: 1, color: colors.navy, fontFamily: font.semibold, fontSize: 9, textAlign: 'right' },
    activityDetailStatus: { color: colors.green, fontFamily: font.semibold, fontSize: 9 },
    activityDetailAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderRadius: 24, backgroundColor: colors.pink },
    activityDetailActionText: { color: colors.white, fontFamily: font.bold, fontSize: 10 },
    omInventorySearch: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 10, borderRadius: 12, backgroundColor: '#F5F5F7' },
    omInventorySearchIcon: { color: '#626270', fontFamily: font.semibold, fontSize: 16, marginRight: 7 },
    omInventorySearchInput: { flex: 1, height: '100%', color: colors.ink, fontFamily: font.regular, fontSize: 10, paddingVertical: 0 },
    omInventoryClear: { color: colors.muted, fontFamily: font.semibold, fontSize: 18 },
    omInventoryBranchRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 10 },
    omInventoryBranchChip: { minHeight: 28, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.pale, borderWidth: 1, borderColor: colors.line },
    omInventoryBranchChipSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
    omInventoryBranchChipText: { color: colors.ink, fontFamily: font.medium, fontSize: 9 },
    omInventoryBranchChipTextSelected: { color: colors.white, fontFamily: font.semibold },
    omCompareButton: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginBottom: 10, backgroundColor: colors.pink },
    omCompareButtonIcon: { color: colors.white, fontFamily: font.bold, fontSize: 10, marginRight: 6 },
    omCompareButtonText: { color: colors.white, fontFamily: font.bold, fontSize: 11 },
    omInventoryLoadingCenter: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
    omSpinner: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 3, borderColor: '#F0F0F3', borderTopColor: colors.pink },
    omSpinnerText: { color: 'transparent', fontSize: 1 },
    omInventoryLoadingText: { color: colors.muted, fontFamily: font.regular, fontSize: 10, marginTop: 10 },
    omInventoryErrorCenter: { minHeight: 300, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    omWifiOffIcon: { color: colors.pink, fontFamily: font.bold, fontSize: 32, marginBottom: 10 },
    omInventoryErrorText: { maxWidth: 220, color: colors.ink, fontFamily: font.regular, fontSize: 11, lineHeight: 16, textAlign: 'center' },
    omInventoryRetry: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.pink, backgroundColor: colors.white },
    omInventoryRetryIcon: { color: colors.pink, fontFamily: font.semibold, fontSize: 11, marginRight: 6 },
    omInventoryRetryText: { color: colors.pink, fontFamily: font.semibold, fontSize: 10 },
    omInventoryCard: { padding: 11, marginBottom: 8, borderRadius: 12, backgroundColor: colors.pale, borderWidth: 1, borderColor: colors.line },
    omInventoryCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    omInventoryCardCopy: { flex: 1, minWidth: 0 },
    omInventoryIngredientName: { color: colors.navy, fontFamily: font.bold, fontSize: 12, marginBottom: 4 },
    omInventoryExpected: { flexDirection: 'row', alignItems: 'center' },
    omInventoryMetaLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 8 },
    omInventoryExpectedValue: { color: colors.navy, fontFamily: font.bold, fontSize: 12 },
    omInventoryMinimum: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
    omInventoryBadge: { minHeight: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderRadius: 9, marginLeft: 6 },
    omInventoryBadgeText: { color: colors.navy, fontFamily: font.semibold, fontSize: 7 },
    omInventoryBadgeTextWhite: { color: colors.white },
    omInventoryBadgeTextMuted: { color: colors.muted },
    omInventoryBadgeLow: { backgroundColor: '#FFF2C4' },
    omInventoryBadgeNormal: { backgroundColor: '#589144' },
    omInventoryBadgeOut: { backgroundColor: '#F52F2E' },
    omInventoryBadgeNear: { backgroundColor: '#FCA639' },
    omInventoryBadgeNotTracked: { backgroundColor: '#F5F5F7' },
    omInventoryBatchList: { marginTop: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 7 },
    omInventoryBatchHeading: { color: colors.navy, fontFamily: font.semibold, fontSize: 8, marginBottom: 3 },
    omInventoryBatchRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.line },
    omInventoryBatchCopy: { flex: 1, minWidth: 0, paddingRight: 6 },
    omInventoryBatchReference: { color: colors.navy, fontFamily: font.semibold, fontSize: 8 },
    omInventoryExpiryLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 8 },
    omInventoryFooterNote: { minHeight: 32, flexDirection: 'row', alignItems: 'center', marginTop: 4, paddingHorizontal: 4 },
    omInventoryFooterIcon: { width: 17, height: 17, alignItems: 'center', justifyContent: 'center', borderRadius: 9, marginRight: 6, backgroundColor: '#595EC0', color: colors.white, fontFamily: font.bold, fontSize: 8 },
    omInventoryFooterText: { color: colors.muted, fontFamily: font.regular, fontSize: 8 },
    omCompareScreen: { width: '100%' },
    omCompareHeader: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    omCompareBack: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    omCompareBackText: { color: colors.pink, fontFamily: font.bold, fontSize: 28 },
    omCompareHeaderTitle: { color: colors.navy, fontFamily: font.bold, fontSize: 16 },
    omCompareHeaderSpacer: { width: 38 },
    omCompareFieldLabelRow: { flexDirection: 'row', marginBottom: 6 },
    omCompareFieldLabel: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
    omCompareAsterisk: { color: colors.pink, fontFamily: font.bold, fontSize: 10, marginLeft: 3 },
    omCompareDropdown: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: 10, borderRadius: 12, backgroundColor: colors.pale },
    omCompareDropdownText: { color: colors.ink, fontFamily: font.regular, fontSize: 11 },
    omCompareDropdownPlaceholder: { color: colors.muted },
    omCompareDropdownChevron: { color: colors.muted, fontFamily: font.semibold, fontSize: 11 },
    omCompareCards: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    omCompareCard: { flex: 1, minHeight: 110, alignItems: 'center', paddingTop: 9, paddingHorizontal: 5, paddingBottom: 8, borderRadius: 12, backgroundColor: colors.pale },
    omCompareCardHeader: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
    omCompareCardDivider: { height: 1, alignSelf: 'stretch', marginTop: 6, marginBottom: 7, backgroundColor: colors.line },
    omCompareQuantity: { color: colors.navy, fontFamily: font.bold, fontSize: 24, lineHeight: 30 },
    omCompareUnit: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 1 },
    omCompareBatchCode: { maxWidth: '100%', color: colors.muted, fontFamily: font.regular, fontSize: 7, marginTop: 3 },
    omCompareBatchIcon: { fontSize: 7 },
    omCompareInfoBanner: { minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#ECEAF8' },
    omCompareInfoIcon: { color: '#595EC0', fontFamily: font.bold, fontSize: 12, marginRight: 8 },
    omCompareInfoCopy: { flex: 1 },
    omCompareInfoTitle: { color: colors.navy, fontFamily: font.bold, fontSize: 8 },
    omCompareInfoText: { color: colors.navy, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
    omComparisonLoadingCenter: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
    omIngredientSheet: { paddingBottom: 18 },
    omIngredientSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    omIngredientSheetTitle: { color: colors.navy, fontFamily: font.bold, fontSize: 12 },
    omIngredientClose: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    omIngredientCloseText: { color: colors.navy, fontFamily: font.semibold, fontSize: 18 },
    omIngredientSearch: { height: 32, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, marginBottom: 8, borderRadius: 10, backgroundColor: colors.pale },
    omIngredientSearchIcon: { color: colors.muted, fontFamily: font.semibold, fontSize: 12, marginRight: 6 },
    omIngredientSearchInput: { flex: 1, height: '100%', color: colors.ink, fontFamily: font.regular, fontSize: 9, paddingVertical: 0 },
    omIngredientRow: { height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 9, marginBottom: 6, borderRadius: 8, backgroundColor: '#F5F5F7' },
    omIngredientRowSelected: { backgroundColor: colors.pink, borderWidth: 0 },
    omIngredientRowSearchSelected: { backgroundColor: '#FCE3EB', borderWidth: 1, borderColor: colors.pink },
    omIngredientRowText: { color: colors.navy, fontFamily: font.regular, fontSize: 10 },
    omIngredientRowTextSelected: { color: colors.navy, fontFamily: font.bold },
    omIngredientRowTextSolidSelected: { color: colors.white },
    omIngredientCheck: { color: colors.white, fontFamily: font.bold, fontSize: 11 },
    omIngredientCheckSearch: { color: colors.pink },
    omIngredientResultCaption: { color: colors.muted, fontFamily: font.regular, fontSize: 9, textAlign: 'center', marginTop: 4 },
    bottomBar: { minHeight: 56, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 3, marginHorizontal: 14, marginTop: 8, marginBottom: 11, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 28, backgroundColor: colors.navy },
    navItem: { flex: 1, minWidth: 0, height: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'column' },
    navItemSelected: { flex: 1.65, flexDirection: 'row', gap: 5, paddingHorizontal: 8, borderRadius: 24, backgroundColor: colors.pink },
    navIconWrap: { width: 20, height: 20, minWidth: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 0 },
    navIconWrapSelected: { backgroundColor: 'transparent' },
    navIcon: { color: colors.white, fontFamily: font.semibold, fontSize: 14, lineHeight: 18 },
    navIconSelected: { color: colors.white },
    navLabel: { display: 'none' },
    navLabelSelected: { color: colors.white, fontFamily: font.semibold, fontSize: 8, lineHeight: 10 },
  }, theme)), [theme]);
}
