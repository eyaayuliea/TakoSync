import React, { useEffect, useMemo, useRef, useState } from 'react';
import { orderStockShortage, stockShortageMessage, withLineQuantity, type SaleStockSnapshot,
  lowStockWarningMessage,
  orderLowStockWarnings,
} from '../services/saleStock';
import { classifyStockLevel, resolveNearExpirationDays } from '../services/inventoryStatusRules.ts';
import {
  describeLotsForDisplay,
  lotExpiryTone,
  resolveLotExpiryWindow,
  type LotExpiryClass,
} from '../services/fefoAllocation.ts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import BottomNavigation, { type StaffNavigationOrigin, type StaffRoute, type StaffTab } from '../navigation/BottomNavigation';
import { isMoreFlowRoute, staffReturnTab } from '../navigation/staffNavigation';
import { createThemedStyles, type AppTheme, useTheme } from '../theme/ThemeProvider';
import { destructiveTextColor, secondaryOutline } from '../theme/buttonRoles';
import { ownerColors } from '../owner/shared/ownerTokens';
import MenuWorkspace from './MenuWorkspace';
import {
  changeMenuCartQuantity,
  isAtMenuQuantityLimit,
  menuQuantityLimitMessage,
  setMenuCartQuantity,
  type MenuCartLine,
} from './menuPreviewData';
import { draftOrderStorageKey, loadDraftOrder, saveDraftOrder } from './draftOrderStorage';
import {
  classifyExpirationAlert,
  classifyStockAlert,
  countInventoryAlertsForSnapshot,
  countInventoryAlertsWhenReady,
  deduplicateInventoryAlerts,
  filterBatchesWithRemainingStock,
  filterBranchInventoryAlertItems,
  getInventoryAlertScreenStatus,
  inventoryAlertEmptyCopy,
  inventoryAlertLabel,
  runInventoryAlertsRefreshOnce,
  sortInventoryAlerts,
  type InventoryAlertKind,
} from './inventoryAlerts';
import { type InventoryTransactionLabel } from '../services/transactionLabels';
import {
  PREPARED_BATTER_BATCH_BOTTLES,
  findBatterShortages,
  formatBatterShortages,
  formatInsufficientStockMessage,
} from '../services/batterPreparation';
import {
  isDefinitiveInventoryRejection,
  pendingRequestIsProvablyInvalid,
  PREPARED_BATTER_ID,
  toStoredTransactionUnit,
} from '../services/inventoryTransactionUnits';
import {
  validateStockInForm,
  validateStockOutForm,
  validateWasteForm as validateWasteFields,
} from './inventoryFormValidation';
import {
  dailyQuantityErrorText,
  getDailyCountBasis,
  isValidDailyQuantity,
  roundDailyQuantity,
} from '../services/dailyCountQuantities';
import {
  getStaffSaleFeedback,
  runInventoryRetryOnce,
  shouldOfferInventoryRetry,
  loadInventory,
  loadRecentStaffSales,
  loadSaleVoidRequests,
  loadBranchEntryReversalRequests,
  requestEntryReversal,
  loadStaffSalesForBusinessDay,
  loadStaffSaleReceipt,
  voidSale,
  loadStaffDailyClosing,
  loadUnresolvedSales,
  loadStaffMenuCatalog,
  loadSharedRecipes,
  loadTransactionHistory,
  prepareBatterBatch,
  reserveBatterBatchReference,
  processSaleInventory,
  submitSale,
  submitDailyStockCheck,
  loadStaffDailyStockCheckDraft,
  saveStaffDailyStockCheckDraft,
  deleteStaffDailyStockCheckDraft,
  requestInventoryCountCorrection,
  InventoryCountCorrectionSubmissionError,
  type AppUser,
  type OwnerSale,
  type SaleSubmission,
  type StaffMenuAddon,
  type StaffMenuCatalogItem,
  type SharedRecipeRecord,
  type UnresolvedSale,
  type StaffSaleReceipt,
  type StaffSaleRecord,
  type StaffDailySalesSummary,
  type StaffDailyStockCheckDraftLine,
  loadStaffDailySales,
  loadStaffInventoryReports,
  recordInventoryTransactionsIdempotently,
} from '../services/takosync';
import {
  createPendingInventoryCountCorrectionStore,
  type PendingInventoryCountCorrection,
} from '../services/inventoryCountCorrectionRecovery';
import {
  createPendingDailyStockCheckStore,
  type PendingDailyStockCheck,
} from '../services/dailyStockCheckRecovery';
import {
  canRetryPendingInventoryTransaction,
  createPendingInventoryTransactionStore,
  runInventoryTransactionRequestOnce,
  sameInventoryTransactionPayload,
  sameInventoryTransactionWorkflow,
  type PendingInventoryTransaction,
  type RetrySafeInventoryTransaction,
} from '../services/inventoryTransactionRecovery';
import {
  canRetryPendingSaleCheckout,
  createPendingSaleCheckoutStore,
  type PendingSaleCheckout,
} from '../services/saleCheckoutRecovery';
import { isRetryableSaleSubmissionError } from '../services/ownerSalesStatus';
import {
  getManilaBusinessDayRange,
  getStaffDailySalesLoadResult,
  isFutureBusinessDate,
  STAFF_DAILY_SALES_LOAD_ERROR,
} from '../services/staffDailySales';
import {
  displayInventoryCategory,
  filterStaffInventoryItems,
  inventoryExpirationStatus,
  inventoryStockStatus,
  runDiscrepancySubmissionOnce,
  runInventoryReportLoad,
  type InventoryCountRecord,
  type InventoryReportData,
} from './inventoryReports';
import { downloadSaleReceiptPdf, printSaleReceipt } from './receiptOutput';
import { blindCountProgress, compareCount, countComparisonLabel, countDifferenceLabel } from './blindCount';
import { inventoryDisplayItem } from './inventoryDisplay';
import {
  STAFF_HISTORY_TYPE_FILTERS,
  historyTypeFilterTabLabel,
  matchesHistoryTypeFilter,
  type StaffHistoryTypeFilter,
} from './historyTypeFilter';
import { formatReceiptDatePurchased, SALE_RECEIPT_FOOTER, saleReceiptFileName } from './saleReceipt';
import { SaleVoidRequestModal, SaleVoidStatusPanel } from './SaleVoidRequest';
import { EntryReversalRequestModal, EntryReversalStatusPanel } from './EntryReversalRequest';
import DailyClosingSection from './DailyClosingSection';
import StockInForm from './StockInForm';
import {
  entryReversalAvailability,
  entryReversalState,
  entryReversalStatusLabel,
  latestEntryReversalRequest,
  reversibleEntryOf,
  type EntryReversalRequest,
} from '../services/entryReversals';
import {
  latestSaleVoidRequest,
  saleVoidAvailability,
  saleVoidState,
  saleVoidStatusLabel,
  type SaleVoidRequest,
} from '../services/saleVoids';
import AppIcon, { type AppIconName } from '../theme/AppIcon';
import { countEntriesSnapshot, hasUnsavedCountEntries } from './countLeaveGuard';
import { staffInventoryCategoryFilters } from './staffInventoryCatalog';
import { countHistoryCorrectionAction, countHistoryStatusLabel, countLineIdOfHistoryRecord } from './countHistoryCorrection';
import { stockAlertIcon } from '../theme/appIcons';
import { INGREDIENT_ICON_IMAGES } from '../theme/appIconImages';

type InventoryReportKey =
  | 'totalIngredientQuantity'
  | 'ingredientCategorySummary'
  | 'ingredientStockStatus'
  | 'branchInventorySummary'
  | 'inventoryDiscrepancy'
  | 'physicalInventoryCount';

type StaffAlertTab = InventoryAlertKind;

const inventoryReportTitles: Record<InventoryReportKey, string> = {
  totalIngredientQuantity: 'Total Ingredient Quantity Report',
  ingredientCategorySummary: 'Ingredient Category Summary Report',
  ingredientStockStatus: 'Ingredient Stock Status Report',
  branchInventorySummary: 'Branch Inventory Summary Report',
  inventoryDiscrepancy: 'Inventory Discrepancy Report',
  physicalInventoryCount: 'Physical Inventory Count Report',
};

const colors = {
  pink: ownerColors.primary,
  navy: ownerColors.navy,
  orange: ownerColors.orange,
  ink: '#171724',
  muted: '#858591',
  pale: '#F5F5F7',
  line: '#EEEEF1',
  white: '#FFFFFF',
  green: '#2F8C57',
  paleGreen: '#E8F6EC',
  red: '#C92F3C',
  paleRed: '#FCE9EB',
  yellow: '#FFF2C4',
} as const;

const alertPink = ownerColors.primary;

const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

type IngredientBatch = {
  id?: string;
  reference: string;
  receivedDate: string;
  receivedDateIso?: string;
  usable?: boolean;
  expirationDate: string | null;
  expirationDateIso: string | null;
  quantityReceived: number;
  quantityRemaining: number;
};

type Ingredient = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  quantityPrecision: number;
  expirationTracking: boolean;
  shelfLifeDays: number | null;
  nearExpirationDays: number;
  threshold: number;
  lowStock: boolean;
  hasBranchInventory: boolean;
  expiration: string | null;
  nearExpiry: boolean;
  expirationStatus: 'Near Expiry' | 'Expired' | null;
  minimumStock: number;
  /** A2: low at or below this (reorder point, never below the minimum). */
  stockThreshold?: number;
  criticalStock?: boolean;
  type: string;
  unitName: string;
  receivedBatch: string;
  batchReference?: string;
  packageQuantity: number | null;
  packageUnit: string | null;
  packageLabel: string | null;
  batches: IngredientBatch[];
  lastUpdated: string;
  icon: AppIconName;
  tint: string;
};

const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pendingInventoryTransactionStore = createPendingInventoryTransactionStore(AsyncStorage);
const pendingInventoryCountCorrectionStore = createPendingInventoryCountCorrectionStore(AsyncStorage);
const pendingDailyStockCheckStore = createPendingDailyStockCheckStore(AsyncStorage);
const pendingSaleCheckoutStore = createPendingSaleCheckoutStore(AsyncStorage);

function formatDate(date: Date) {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function manilaBusinessDate(now = new Date()) {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: 'year' | 'month' | 'day') =>
    Number(dateParts.find((value) => value.type === type)?.value);
  return new Date(part('year'), part('month') - 1, part('day'));
}

function manilaMidnightTimestamp(date: Date) {
  return getManilaBusinessDayRange(date).start;
}

function formatReceiptDate(date: Date) {
  return `${formatDate(date)} · 08:00 AM`;
}

function formatUsageDate(date: Date) {
  return `${formatDate(date)} · 10:30 AM`;
}

function formatWasteDate(date: Date) {
  return `${formatDate(date)} · 08:30 AM`;
}

function formatManilaTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

type UsageDeduction = {
  ingredientId: string;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
};

type UsageReceipt = {
  reference: string;
  deductions: UsageDeduction[];
  transactionDate: Date;
  reason: string;
  notes: string;
  mode: 'manual' | 'cookingBatch';
  batchPreset: string | null;
  batchCount: number;
};

type DailyCheckLine = {
  ingredientId: string;
  name: string;
  recordedQuantity: number;
  inventoryRevision: number;
  physicalQuantity: string;
  unit: string;
  /** Allowed decimal places for the physical quantity. */
  precision: number;
};

type DailyCheckLineRecord = {
  ingredientId: string;
  name: string;
  recordedQuantity: number;
  inventoryRevision: number;
  physicalQuantity: number;
  difference: number;
  unit: string;
};

type DailyInventoryCheck = {
  reference: string;
  checkDate: Date;
  submittedAt: Date;
  branch: string;
  staff: string;
  lines: DailyCheckLineRecord[];
  remarks: string;
  status: 'pendingOwnerReview' | 'submitted';
};

type WasteReason = 'Waste' | 'Spillage' | 'Spoilage' | 'Other';

type WasteReceipt = {
  reference: string;
  ingredientId: string;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  transactionDate: Date;
  reason: WasteReason;
  notes: string;
};

type StockInReceipt = {
  reference: string;
  ingredientId: string;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  transactionDate: Date;
  expirationDate: Date | null;
  notes: string;
};

type HistoryTransactionType = InventoryTransactionLabel | 'Physical Inventory Count';
type HistoryTypeFilter = StaffHistoryTypeFilter;

type HistoryTransaction = {
  id: string;
  reference: string;
  type: HistoryTransactionType;
  ingredientId: string;
  ingredientName: string;
  category: string;
  quantity: number;
  unit: string;
  movement: number;
  branchId: string;
  branch: string;
  staffId: string;
  staff: string;
  transactionDate: Date;
  reason: string;
  notes: string;
  beforeQuantity: number | null;
  afterQuantity: number | null;
  batchReference: string | null;
  physicalCount?: {
    checkId: string;
    status: string;
    expectedQuantity: number;
    originalActualQuantity: number;
    difference: number;
    correctionHistory: Array<{
      status: string;
      correctedActualQuantity: number;
      reason: string;
      decisionReason: string | null;
      decidedAt: string | null;
    }>;
    revisedActualQuantity: number | null;
    validation: {
      correctedActualQuantity: number;
      outcome: string;
      reason: string;
      validatedBy: string;
      validatedAt: string;
    } | null;
  };
};

// ST-14 c2: exactly the types the story lists.
const historyTypeFilters: HistoryTypeFilter[] = [...STAFF_HISTORY_TYPE_FILTERS];

function formatHistoryDateTime(date: Date) {
  return `${formatDate(manilaBusinessDate(date))} · ${formatManilaTime(date)}`;
}

const wasteReasons: WasteReason[] = ['Waste', 'Spillage', 'Spoilage', 'Other'];
const formatSaleMoney = (amount: number) => `₱${amount.toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const stockOutBatchPresets = [
  {
    name: 'Standard takoyaki batch',
    deductions: [
      { ingredientId: 'octopus', quantity: 1 },
      { ingredientId: 'flour', quantity: 0.5 },
    ],
  },
] as const;

type InventoryAlert = {
  id: string;
  kind: InventoryAlertKind;
  ingredientId: string;
  batch: IngredientBatch | null;
  title: string;
  detail: string;
  quantity?: number;
  minimumStock?: number;
  unit?: string;
  daysRemaining?: number;
};

function parseInventoryDate(value: string | null) {
  if (!value) return null;
  const isoMatch = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return date.getFullYear() === Number(isoMatch[1]) &&
      date.getMonth() === Number(isoMatch[2]) - 1 &&
      date.getDate() === Number(isoMatch[3])
      ? date
      : null;
  }
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return null;
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    .indexOf(match[2].toLowerCase());
  if (month < 0) return null;
  const date = new Date(Number(match[3]), month, Number(match[1]));
  return date.getFullYear() === Number(match[3]) &&
    date.getMonth() === month &&
    date.getDate() === Number(match[1])
    ? date
    : null;
}

function daysBetweenDates(from: Date, to: Date) {
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((toDay - fromDay) / 86_400_000);
}

function getReceivedDate(item: Ingredient) {
  return item.receivedBatch.split('·').pop()?.trim() ?? 'Not recorded';
}

function formatQuantity(quantity: number) {
  return Number.isInteger(quantity) ? `${quantity}` : `${Number(quantity.toFixed(2))}`;
}

function formatUnitQuantity(quantity: number, unit: string) {
  const displayUnit = quantity === 1 && unit === 'pcs' ? 'pc' : unit;
  return `${formatQuantity(quantity)} ${displayUnit}`;
}

function formatInventoryQuantity(quantity: number, precision: number) {
  const maximumFractionDigits = Number.isInteger(precision)
    ? Math.max(0, Math.min(3, precision))
    : 2;
  return quantity.toLocaleString('en-PH', { maximumFractionDigits });
}

function formatInventoryUnitQuantity(quantity: number, unit: string, precision: number) {
  const displayUnit = quantity === 1 && unit === 'pcs' ? 'pc' : unit;
  return `${formatInventoryQuantity(quantity, precision)} ${displayUnit}`;
}

function formatDailyDifference(difference: number, unit: string) {
  const value = formatQuantity(difference);
  return `${difference > 0 ? '+' : ''}${value} ${unit}`;
}

function formatDailyUnitQuantity(quantity: number, unit: string) {
  return `${formatQuantity(quantity)} ${unit}`;
}

function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search ingredients',
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  const styles = useStaffStyles();
  const { colors: themeColors } = useTheme();
  return (
    <View style={styles.searchBar}>
      <AppIcon name="search" style={styles.searchGlyph} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor={themeColors.secondaryText}
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
      {value !== '' && (
        <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel="Clear search">
          <AppIcon name="close" style={styles.clearSearch} />
        </Pressable>
      )}
    </View>
  );
}

function IngredientThumbnail({ item, large = false, small = false }: { item: Ingredient; large?: boolean; small?: boolean }) {
  const styles = useStaffStyles();
  const { colors: themeColors, isDark } = useTheme();
  return (
    <View
      style={[
        styles.ingredientThumbnail,
        large && styles.largeThumbnail,
        small && styles.smallThumbnail,
        // The team's pictures have dark outlines, so they keep their light tile in dark mode too.
        { backgroundColor: isDark && INGREDIENT_ICON_IMAGES[item.id] === undefined ? themeColors.surfaceSecondary : item.tint },
      ]}
      accessibilityLabel={`${item.name} image placeholder`}
    >
      {INGREDIENT_ICON_IMAGES[item.id] !== undefined ? (
        // The team's picture of this ingredient; other ingredients show their category icon.
        <Image
          source={INGREDIENT_ICON_IMAGES[item.id]}
          resizeMode="contain"
          style={large ? styles.largeThumbnailImage : small ? styles.smallThumbnailImage : styles.thumbnailImage}
        />
      ) : (
        <AppIcon
          name={item.icon}
          style={[styles.thumbnailEmoji, large && styles.largeThumbnailEmoji, small && styles.smallThumbnailEmoji, { color: themeColors.text }]}
        />
      )}
    </View>
  );
}

function StatusBadge({
  label,
  tone,
  alignRight = false,
  textColor,
}: {
  label: string;
  tone: 'low' | 'good' | 'warning';
  alignRight?: boolean;
  textColor?: string;
}) {
  const styles = useStaffStyles();
  const toneStyle = tone === 'low' ? styles.lowBadge : tone === 'warning' ? styles.warningBadge : styles.goodBadge;
  const textStyle = tone === 'low' ? styles.lowBadgeText : tone === 'warning' ? styles.warningBadgeText : styles.goodBadgeText;
  return (
    <View style={[styles.statusBadge, toneStyle, alignRight && styles.statusBadgeRight]}>
      <Text style={[styles.statusBadgeText, textStyle, textColor ? { color: textColor } : undefined]}>{label}</Text>
    </View>
  );
}

/** A2: the quantity at or below which an item is low (reorder point, or the owner minimum). */
function stockThresholdOf(item: { minimumStock: number; stockThreshold?: number }): number {
  return Math.max(item.minimumStock, item.stockThreshold ?? item.minimumStock);
}

/** Alert/detail text for the low-stock threshold: the reorder point when it is above the minimum. */
function stockThresholdLines(item: { minimumStock: number; stockThreshold?: number; unit: string; criticalStock?: boolean }) {
  const threshold = stockThresholdOf(item);
  const lines = [`Minimum stock level: ${formatUnitQuantity(item.minimumStock, item.unit)}`];
  if (threshold > item.minimumStock) lines.push(`Reorder point: ${formatUnitQuantity(threshold, item.unit)}`);
  return lines.join('\n');
}

function LotExpiryBadges({
  lot,
}: {
  lot: { expiry: LotExpiryClass; expiryLabel: string; useFirst: boolean; held: boolean };
}) {
  const styles = useStaffStyles();
  const tone = lotExpiryTone(lot.expiry);
  const showExpiry = lot.held || lot.expiry !== 'NO_EXPIRY';
  if (!lot.useFirst && !showExpiry) return null;
  return (
    <View style={styles.lotBadgeRow}>
      {lot.useFirst ? <StatusBadge label="Use first" tone="good" /> : null}
      {showExpiry ? (
        <StatusBadge label={lot.expiryLabel} tone={lot.held ? 'warning' : tone === 'neutral' ? 'good' : tone} />
      ) : null}
    </View>
  );
}

function InventoryIngredientCard({
  item: storedItem,
  onPress,
  statusOverride,
  showExpiration = false,
  showInventoryStatuses = false,
  cardWidth,
}: {
  item: Ingredient;
  onPress: () => void;
  statusOverride?: { label: string; tone: 'low' | 'good' | 'warning' };
  showExpiration?: boolean;
  showInventoryStatuses?: boolean;
  cardWidth?: number;
}) {
  const styles = useStaffStyles();
  const { isDark } = useTheme();
  // ST-04 c6: prepared batter in bottles; ST-04 c4: Normal / Low Stock / Out of Stock.
  const item = inventoryDisplayItem(storedItem);
  const stockStatus = inventoryStockStatus(item.quantity, stockThresholdOf(item));
  const statusLabel = statusOverride?.label ?? (item.quantity <= 0 ? 'Out of Stock' : item.lowStock ? 'Low Stock' : item.nearExpiry ? 'Near Expiry' : 'Normal');
  const statusTone = statusOverride?.tone ?? (item.lowStock ? 'low' : item.nearExpiry ? 'warning' : 'good');
  const stockStatusTone = stockStatus === 'Normal' ? 'good' : 'low';
  const expirationStatusTone = item.expirationStatus === 'Expired' ? 'low' : 'warning';
  const categoryLabel = displayInventoryCategory(item.category);
  const packInfo = item.packageQuantity !== null && item.packageUnit
    ? `Pack: ${formatInventoryQuantity(item.packageQuantity, 3)} ${item.packageUnit}`
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${categoryLabel}, ${formatInventoryUnitQuantity(item.quantity, item.unit, item.quantityPrecision)}, ${showInventoryStatuses ? stockStatus : statusLabel}${item.expirationStatus ? `, ${item.expirationStatus}` : ''}${showExpiration ? `, expiration ${item.expiration ?? 'Not recorded'}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.inventoryCard,
        cardWidth !== undefined && { width: cardWidth },
        pressed && styles.pressed,
      ]}
    >
      <IngredientThumbnail item={item} small />
      <View style={styles.inventoryCardCopy}>
        <Text style={styles.inventoryIngredientName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.inventoryIngredientCategory} numberOfLines={1}>{categoryLabel} · {item.unit}</Text>
        {packInfo ? <Text style={styles.inventoryIngredientCategory} numberOfLines={1}>{packInfo}</Text> : null}
        {showInventoryStatuses ? (
          <Text style={styles.dashboardExpiration}>
            {item.expirationStatus ? `${item.expirationStatus}: ` : item.expiration ? 'Expires: ' : 'Expiration: '}
            {item.expiration ?? 'Not recorded'}
          </Text>
        ) : null}
      </View>
      <View style={styles.inventoryQuantityColumn}>
        <Text style={styles.inventoryQuantity}>{formatInventoryUnitQuantity(item.quantity, item.unit, item.quantityPrecision)}</Text>
        {showExpiration && !showInventoryStatuses && item.expiration ? (
          <Text style={styles.dashboardExpiration}>Exp. {item.expiration}</Text>
        ) : null}
        {showInventoryStatuses ? (
          <View style={styles.inventoryBadgeStack}>
            <StatusBadge
              label={stockStatus}
              tone={stockStatusTone}
              alignRight
              textColor={stockStatus === 'Out of Stock' && isDark ? '#0F1025' : undefined}
            />
            {item.expirationStatus ? (
              <StatusBadge label={item.expirationStatus} tone={expirationStatusTone} alignRight />
            ) : null}
          </View>
        ) : (
          <StatusBadge label={statusLabel} tone={statusTone} alignRight textColor={statusLabel === 'Out of Stock' && isDark ? '#0F1025' : undefined} />
        )}
      </View>
    </Pressable>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useStaffStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.categoryChip, styles.inventoryChip, selected && styles.inventoryChipSelected]}
    >
      <Text style={[styles.categoryChipText, styles.inventoryChipText, selected && styles.inventoryChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function CubeOutlineIcon() {
  const styles = useStaffStyles();
  return (
    <View style={styles.emptyCube}>
      <View style={styles.emptyCubeTopLeft} />
      <View style={styles.emptyCubeTopRight} />
      <View style={styles.emptyCubeBody} />
      <View style={styles.emptyCubeSeam} />
    </View>
  );
}

type CompletedSale = {
  id: string;
  reference: string;
  totalAmount: number;
  paymentMethod: string;
  cashReceived: number | null;
  change: number | null;
};

const optionalAmount = (value: number | string | null | undefined): number | null =>
  value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

/** ST-05 c1: what the Sale Completed screen shows, from the sale the server confirmed. */
function completedSaleFrom(sale: OwnerSale): CompletedSale {
  return {
    id: sale.id,
    reference: sale.transaction_reference,
    totalAmount: Number(sale.total_amount),
    paymentMethod: sale.payment_method,
    cashReceived: optionalAmount(sale.cash_received),
    change: optionalAmount(sale.change_amount),
  };
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const styles = useStaffStyles();
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function WasteTrashIcon({ color = colors.pink }: { color?: string }) {
  return <AppIcon name="waste" color={color} size={30} label="Waste confirmation" />;
}

function ActionCard({
  title,
  description,
  icon,
  onPress,
}: {
  title: string;
  description: string;
  icon: string | React.ReactNode;
  onPress: () => void;
}) {
  const styles = useStaffStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      onPress={onPress}
      style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}
    >
      <View style={styles.actionIconBox}>
        {typeof icon === 'string' ? <Text style={styles.actionIcon}>{icon}</Text> : icon}
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>
      <AppIcon name="forward" style={styles.actionChevron} />
    </Pressable>
  );
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline = false,
  error,
  suffix,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  multiline?: boolean;
  error?: string;
  suffix?: string;
}) {
  const styles = useStaffStyles();
  const { colors: themeColors, isDark } = useTheme();
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {suffix ? (
        <View style={[styles.suffixedInput, error ? styles.textInputError : undefined]}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={isDark ? themeColors.secondaryText : '#A0A0AA'}
            keyboardType={keyboardType}
            multiline={multiline}
            textAlignVertical={multiline ? 'top' : 'center'}
            style={[styles.textInput, styles.suffixedTextInput]}
          />
          <Text style={styles.inputSuffix}>{suffix}</Text>
        </View>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={themeColors.secondaryText}
          keyboardType={keyboardType}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[styles.textInput, multiline && styles.notesInput, error !== undefined && error !== '' && styles.textInputError]}
        />
      )}
      {error ? <InlineFieldError message={error} /> : null}
    </View>
  );
}

function InlineFieldError({ message }: { message: string }) {
  const styles = useStaffStyles();
  return (
    <View style={styles.inlineFieldError} accessibilityRole="alert">
      <Text style={styles.inlineFieldErrorIcon}>!</Text>
      <Text style={styles.fieldError}>{message}</Text>
    </View>
  );
}

function DatePickerField({
  label,
  value,
  onChange,
  error,
  allowClear = false,
  maxDate,
  useConfirmation = false,
  confirmLabel = 'Use Date',
  triggerLabel,
}: {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  error?: string;
  allowClear?: boolean;
  maxDate?: Date;
  useConfirmation?: boolean;
  confirmLabel?: string;
  triggerLabel?: string;
}) {
  const styles = useStaffStyles();
  const [visible, setVisible] = useState(false);
  const [month, setMonth] = useState(() => value ?? new Date());
  const [draftValue, setDraftValue] = useState<Date | null>(value);
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const nextMonthIsFuture = maxDate !== undefined &&
    isFutureBusinessDate(new Date(month.getFullYear(), month.getMonth() + 1, 1), maxDate);
  const calendarDays: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const changeMonth = (amount: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };
  const openDatePicker = () => {
    setMonth(value ?? new Date());
    setDraftValue(value);
    setVisible(true);
  };

  return (
    <>
      {triggerLabel ? (
        <View style={styles.fieldGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${triggerLabel}, ${value ? formatDate(value) : 'choose date'}`}
            onPress={openDatePicker}
            style={styles.dailySalesDateButton}
          >
            <Text style={styles.dailySalesDateButtonText}>{triggerLabel}</Text>
          </Pressable>
          {error ? <InlineFieldError message={error} /> : null}
        </View>
      ) : (
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={[styles.dateInput, error ? styles.textInputError : undefined]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${value ? formatDate(value) : 'choose date'}`}
            onPress={openDatePicker}
            style={styles.dateInputAction}
          >
            <Text style={[styles.dateInputText, !value && styles.placeholderText]}>
              {value ? formatDate(value) : 'Select a date'}
            </Text>
          </Pressable>
          {allowClear && value ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Clear ${label.toLowerCase()}`}
              onPress={() => onChange(null)}
              style={styles.clearDateButton}
            >
              <Text style={styles.clearDateText}>×</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Choose ${label.toLowerCase()}`}
            onPress={openDatePicker}
            style={styles.calendarButton}
          >
            <AppIcon name="calendar" style={styles.calendarGlyph} />
          </Pressable>
        </View>
        {error ? <InlineFieldError message={error} /> : null}
      </View>
      )}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.calendarModal}>
            <View style={styles.calendarHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} style={styles.monthArrow}>
                <AppIcon name="back" style={styles.monthArrowText} />
              </Pressable>
              <Text style={styles.monthTitle}>
                {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                accessibilityState={{ disabled: nextMonthIsFuture }}
                disabled={nextMonthIsFuture}
                onPress={() => changeMonth(1)}
                style={[styles.monthArrow, nextMonthIsFuture && styles.buttonDisabled]}
              >
                <AppIcon name="forward" style={styles.monthArrowText} />
              </Pressable>
            </View>
            <View style={styles.calendarGrid}>
              {weekdays.map((day, index) => (
                <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>
              ))}
              {calendarDays.map((day, index) => {
                const isFuture = day !== null && maxDate !== undefined &&
                  isFutureBusinessDate(new Date(month.getFullYear(), month.getMonth(), day), maxDate);
                const isSelected =
                  day !== null &&
                  (useConfirmation ? draftValue : value)?.getDate() === day &&
                  (useConfirmation ? draftValue : value)?.getMonth() === month.getMonth() &&
                  (useConfirmation ? draftValue : value)?.getFullYear() === month.getFullYear();
                return day === null ? (
                  <View key={`empty-${index}`} style={styles.calendarDayCell} />
                ) : (
                  <Pressable
                    key={`day-${day}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${month.toLocaleDateString('en-US', { month: 'long' })} ${day}`}
                    accessibilityState={{ disabled: isFuture, selected: isSelected }}
                    disabled={isFuture}
                    onPress={() => {
                      const selectedDate = new Date(month.getFullYear(), month.getMonth(), day);
                      if (useConfirmation) {
                        setDraftValue(selectedDate);
                      } else {
                        onChange(selectedDate);
                        setVisible(false);
                      }
                    }}
                    style={[styles.calendarDayCell, isSelected && styles.calendarDaySelected, isFuture && styles.calendarDayDisabled]}
                  >
                    <Text style={[
                      styles.calendarDayText,
                      isSelected && styles.calendarDayTextSelected,
                      isFuture && styles.calendarDayTextDisabled,
                    ]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
            {useConfirmation ? (
              <>
                <Text style={styles.calendarSelectedText}>
                  Selected: {draftValue ? formatDate(draftValue) : 'Select a date'}
                  {draftValue && formatLocalIsoDate(draftValue) === formatLocalIsoDate(manilaBusinessDate()) ? ' · Today' : ''}
                </Text>
                <View style={styles.calendarActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setVisible(false)}
                    style={styles.calendarCancelButton}
                  >
                    <Text style={styles.calendarCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!draftValue}
                    onPress={() => {
                      if (draftValue) onChange(draftValue);
                      setVisible(false);
                    }}
                    style={[styles.calendarUseButton, !draftValue && styles.buttonDisabled]}
                  >
                    <Text style={styles.calendarUseText}>{confirmLabel}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable onPress={() => setVisible(false)} style={styles.calendarCancel}>
                <Text style={styles.calendarCancelText}>Cancel</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function StaffWorkspace({
  onLogout,
  onChangePassword,
  user,
  appVersion,
}: {
  onLogout: () => void | Promise<void>;
  onChangePassword: () => void;
  user: AppUser;
  appVersion: string;
}) {
  const theme = useTheme();
  const styles = useStaffStyles();
  const { width: windowWidth } = useWindowDimensions();
  const lowStockCardWidth = Math.min(292, (windowWidth - 36) * 0.88);
  const wasteReviewGeneration = useRef(0);
  const [today, setToday] = useState(() => manilaBusinessDate());
  const colors = {
    ...theme.colors,
    pink: theme.colors.accent,
    navy: theme.isDark ? theme.colors.surface : ownerColors.navy,
    orange: theme.colors.action,
    ink: theme.isDark ? theme.colors.text : '#171724',
    muted: theme.colors.secondaryText,
    pale: theme.colors.surfaceSecondary,
    line: theme.colors.border,
    white: theme.isDark ? theme.colors.text : '#FFFFFF',
    green: theme.colors.success,
    paleGreen: theme.isDark ? theme.colors.surfaceSecondary : '#E8F6EC',
    red: theme.colors.error,
    paleRed: theme.isDark ? theme.colors.surfaceSecondary : '#FCE9EB',
    yellow: theme.isDark ? theme.colors.warning : '#FFF2C4',
  };
  const [route, setRoute] = useState<StaffRoute>('menu');
  // Set when a shared screen (Transaction History, Physical Inventory Check) is opened from the More list.
  const [navigationOrigin, setNavigationOrigin] = useState<StaffNavigationOrigin>(null);
  const routeRef = useRef(route);
  routeRef.current = route;
  const [returnRoute, setReturnRoute] = useState<StaffTab>('stocks');
  const [menuCart, setMenuCart] = useState<MenuCartLine[]>([]);
  const [menuTransactionReference, setMenuTransactionReference] = useState<string | null>(null);
  const [menuSelectedAddonIds, setMenuSelectedAddonIds] = useState<string[]>([]);
  // ST-01 c9: the unconfirmed order is saved on this device per staff account and
  // branch, so it survives the end of the daily session and an app restart.
  const draftOrderKey = user?.id && user.branchId ? draftOrderStorageKey(user.id, user.branchId) : null;
  const [draftOrderRestored, setDraftOrderRestored] = useState(false);
  const [menuCatalog, setMenuCatalog] = useState<StaffMenuCatalogItem[]>([]);
  const [menuAddons, setMenuAddons] = useState<StaffMenuAddon[]>([]);
  const menuSaleSubmissionLock = useRef(false);
  const [menuCatalogLoading, setMenuCatalogLoading] = useState(false);
  const [menuStock, setMenuStock] = useState<SaleStockSnapshot | null>(null);
  const [menuCatalogError, setMenuCatalogError] = useState('');
  const [menuCatalogLoaded, setMenuCatalogLoaded] = useState(false);
  const [menuCatalogBranchId, setMenuCatalogBranchId] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [nearExpirationDays, setNearExpirationDays] = useState<number | null>(null);
  const [lotExpiryWindow, setLotExpiryWindow] = useState(resolveLotExpiryWindow());
  const [backendHistory, setBackendHistory] = useState<HistoryTransaction[]>([]);
  const [recentSales, setRecentSales] = useState<StaffSaleRecord[]>([]);
  const [dailySalesDate, setDailySalesDate] = useState(() => manilaBusinessDate());
  const [dailySalesSummary, setDailySalesSummary] = useState<StaffDailySalesSummary | null>(null);
  // ST-07: the day's receipts, so a sale can be reopened to request a void.
  const [dailySalesReceipts, setDailySalesReceipts] = useState<StaffSaleRecord[]>([]);
  const [dailySalesReceiptsError, setDailySalesReceiptsError] = useState('');
  const [dailySalesLoading, setDailySalesLoading] = useState(false);
  const [dailySalesError, setDailySalesError] = useState('');
  const [dailySalesRefreshKey, setDailySalesRefreshKey] = useState(0);
  const previousToday = useRef(formatLocalIsoDate(manilaBusinessDate()));
  const [inventoryReportData, setInventoryReportData] = useState<InventoryReportData | null>(null);
  const [inventoryReportLoading, setInventoryReportLoading] = useState(false);
  const [inventoryReportError, setInventoryReportError] = useState('');
  const [inventoryReportRefreshKey, setInventoryReportRefreshKey] = useState(0);
  const [selectedInventoryReport, setSelectedInventoryReport] = useState<InventoryReportKey>('totalIngredientQuantity');
  // ST-12 c9: opens the correction request view of a submitted count from its read-only details.
  const [countCorrectionView, setCountCorrectionView] = useState(false);
  const [countCorrectionNotice, setCountCorrectionNotice] = useState<{ countLineId: string; text: string } | null>(null);
  const [selectedInventoryCountId, setSelectedInventoryCountId] = useState<string | null>(null);
  const [expandedInventoryCategories, setExpandedInventoryCategories] = useState<Set<string>>(() => new Set());
  // ST-06 c6 / #43: Daily Sales is the only staff report. Staff reach their own counts and
  // correction requests from the count section (ST-14 c6).
  // Where Back goes from the count's correction screen: the count's record in Transaction History.
  const [sentCountCorrectionLineIds, setSentCountCorrectionLineIds] = useState<ReadonlySet<string>>(new Set());
  const [countDetailsReturnRoute, setCountDetailsReturnRoute] = useState<'inventoryReport' | 'transactionDetails'>('inventoryReport');
  const [unresolvedSales, setUnresolvedSales] = useState<UnresolvedSale[]>([]);
  const [unresolvedSalesLoading, setUnresolvedSalesLoading] = useState(false);
  const [unresolvedSalesError, setUnresolvedSalesError] = useState('');
  const [saleHistoryError, setSaleHistoryError] = useState('');
  const [retryingSaleIds, setRetryingSaleIds] = useState<Set<string>>(() => new Set());
  const inventoryRetryLocks = useRef(new Set<string>());
  const [selectedSaleReceiptId, setSelectedSaleReceiptId] = useState<string | null>(null);
  const [saleReceiptReturnRoute, setSaleReceiptReturnRoute] = useState<'menu' | 'dailySales' | 'saleCompleted'>('menu');
  // ST-05 c1: the Sale Completed screen of the sale just confirmed, with Generate Receipt.
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [saleReceipt, setSaleReceipt] = useState<StaffSaleReceipt | null>(null);
  const [saleReceiptLoading, setSaleReceiptLoading] = useState(false);
  const [saleReceiptError, setSaleReceiptError] = useState('');
  const [saleReceiptShareError, setSaleReceiptShareError] = useState('');
  const [saleReceiptOutputBusy, setSaleReceiptOutputBusy] = useState<'print' | 'pdf' | null>(null);
  const [saleReceiptOutputNotice, setSaleReceiptOutputNotice] = useState('');
  // ST-07: void requests for the recent sales and the open receipt. Hidden
  // until the database has the void tables.
  const [saleVoidRequests, setSaleVoidRequests] = useState<SaleVoidRequest[]>([]);
  const [saleVoidSupported, setSaleVoidSupported] = useState(false);
  const [saleVoidModalVisible, setSaleVoidModalVisible] = useState(false);
  // ST-13: the branch's entry reversal requests. Hidden until the database has them.
  const [entryReversalRequests, setEntryReversalRequests] = useState<EntryReversalRequest[]>([]);
  const [entryReversalSupported, setEntryReversalSupported] = useState(false);
  const [entryReversalModalVisible, setEntryReversalModalVisible] = useState(false);
  const [backendLoading, setBackendLoading] = useState(true);
  const [backendError, setBackendError] = useState('');
  const [pendingInventoryTransactions, setPendingInventoryTransactions] = useState<PendingInventoryTransaction[]>([]);
  const [pendingInventoryTransactionsLoading, setPendingInventoryTransactionsLoading] = useState(true);
  const [pendingInventoryStorageError, setPendingInventoryStorageError] = useState('');
  const [pendingInventoryRetryingIds, setPendingInventoryRetryingIds] = useState<Set<string>>(() => new Set());
  const [pendingInventoryRequestErrors, setPendingInventoryRequestErrors] = useState<Record<string, string>>({});
  const [lastPendingInventoryRequestId, setLastPendingInventoryRequestId] = useState<string | null>(null);
  const [forceNewInventoryRequestFor, setForceNewInventoryRequestFor] = useState<string | null>(null);
  const pendingInventoryRequestLocks = useRef(new Set<string>());
  const [pendingSaleCheckouts, setPendingSaleCheckouts] = useState<PendingSaleCheckout[]>([]);
  const [pendingSaleCheckoutLoading, setPendingSaleCheckoutLoading] = useState(true);
  const [pendingSaleCheckoutStorageError, setPendingSaleCheckoutStorageError] = useState('');
  const [pendingSaleCheckoutErrors, setPendingSaleCheckoutErrors] = useState<Record<string, string>>({});
  const pendingSaleCheckoutLocks = useRef(new Set<string>());
  const [refreshing, setRefreshing] = useState(false);
  const alertRefreshLock = useRef(false);
  const [dailyCheckLines, setDailyCheckLines] = useState<DailyCheckLine[]>([]);
  const [dailyCheckSearch, setDailyCheckSearch] = useState('');
  const [dailyCheckRemarks, setDailyCheckRemarks] = useState('');
  const [dailyCheckVerified, setDailyCheckVerified] = useState(false);
  const [dailyCheckDraftId, setDailyCheckDraftId] = useState<string | null>(null);
  const [dailyCheckDraftSaving, setDailyCheckDraftSaving] = useState(false);
  const [dailyCheckDraftMessage, setDailyCheckDraftMessage] = useState('');
  const [dailyCheckStartedAt, setDailyCheckStartedAt] = useState<Date | null>(null);
  const [dailyCheckAttempted, setDailyCheckAttempted] = useState(false);
  const [dailyCheckModal, setDailyCheckModal] = useState<'review' | 'confirm' | null>(null);
  const [currentDailyCheck, setCurrentDailyCheck] = useState<DailyInventoryCheck | null>(null);
  const [dailyCheckSubmitting, setDailyCheckSubmitting] = useState(false);
  const [dailyCheckStarting, setDailyCheckStarting] = useState(false);
  const [dailyCheckSaveFailed, setDailyCheckSaveFailed] = useState(false);
  const [pendingDailyStockChecks, setPendingDailyStockChecks] = useState<PendingDailyStockCheck[]>([]);
  const [dailyCheckSubmissionRequest, setDailyCheckSubmissionRequest] = useState<PendingDailyStockCheck | null>(null);
  const [dailyCheckStorageError, setDailyCheckStorageError] = useState('');
  const [dailyCheckRetryErrors, setDailyCheckRetryErrors] = useState<Record<string, string>>({});
  const dailyCheckRetryLocks = useRef(new Set<string>());
  const [dailyCheckLeavePromptVisible, setDailyCheckLeavePromptVisible] = useState(false);
  // Where the staff member was going when the "Leave the count?" prompt opened, and
  // what was last saved or loaded (to know whether anything typed is unsaved).
  const [dailyCheckLeaveTarget, setDailyCheckLeaveTarget] = useState<StaffTab | null>(null);
  const [dailyCheckSavedSnapshot, setDailyCheckSavedSnapshot] = useState<string | null>(null);
  const dailyCheckSubmissionLock = useRef(false);
  const [pendingCountCorrections, setPendingCountCorrections] = useState<PendingInventoryCountCorrection[]>([]);
  const [countCorrectionStorageError, setCountCorrectionStorageError] = useState('');
  const [countCorrectionRetryErrors, setCountCorrectionRetryErrors] = useState<Record<string, string>>({});
  const [countCorrectionMessages, setCountCorrectionMessages] = useState<Record<string, string>>({});
  const countCorrectionRetryLocks = useRef(new Set<string>());
  const [selectedCorrectionCountLineId, setSelectedCorrectionCountLineId] = useState<string | null>(null);
  const [correctionActualQuantity, setCorrectionActualQuantity] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [correctionFormError, setCorrectionFormError] = useState('');
  const countCorrectionSubmissionLock = useRef(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedIngredientId, setSelectedIngredientId] = useState('');
  const [ingredientListOpen, setIngredientListOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [stockInFieldErrors, setStockInFieldErrors] = useState<Record<string, string>>({});
  const [stockInValidationAttempted, setStockInValidationAttempted] = useState(false);
  const [stockOutFieldErrors, setStockOutFieldErrors] = useState<Record<string, string>>({});
  const [stockOutValidationAttempted, setStockOutValidationAttempted] = useState(false);
  const [usageMode, setUsageMode] = useState<'manual' | 'cookingBatch'>('manual');
  const [batchPreset, setBatchPreset] = useState<string>(stockOutBatchPresets[0].name);
  const [batchPresetOpen, setBatchPresetOpen] = useState(false);
  const [batchCount, setBatchCount] = useState('1');
  const [transactionDate, setTransactionDate] = useState<Date | null>(() => manilaBusinessDate());
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [reason, setReason] = useState('Cooking usage');
  const [reasonListOpen, setReasonListOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [wasteFieldErrors, setWasteFieldErrors] = useState<Record<string, string>>({});
  const [wasteValidationAttempted, setWasteValidationAttempted] = useState(false);
  const [wasteIngredientSearch, setWasteIngredientSearch] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [stockAlertsUpdated, setStockAlertsUpdated] = useState(false);
  const [formError, setFormError] = useState('');
  const [quantityError, setQuantityError] = useState('');
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const movementSubmissionLock = useRef(false);
  const [stockOutAlert, setStockOutAlert] = useState<{
    ingredientId: string;
    remainingQuantity: number;
    minimumStock: number;
    outOfStock: boolean;
  } | null>(null);
  const wasteSubmissionLock = useRef(false);
  const [currentWasteReceipt, setCurrentWasteReceipt] = useState<WasteReceipt | null>(null);
  const [currentStockInReceipt, setCurrentStockInReceipt] = useState<StockInReceipt | null>(null);
  const [stockInIngredientSearch, setStockInIngredientSearch] = useState('');
  const [currentUsageReceipt, setCurrentUsageReceipt] = useState<UsageReceipt | null>(null);
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardMessage, setDashboardMessage] = useState('');
  const [menuInventoryRetrySale, setMenuInventoryRetrySale] = useState<{ id: string; reference: string } | null>(null);
  const [batterPreparationVisible, setBatterPreparationVisible] = useState(false);
  const [batterBatchReference, setBatterBatchReference] = useState('');
  const [batterPreparationDate, setBatterPreparationDate] = useState(() => manilaBusinessDate());
  const [sharedRecipes, setSharedRecipes] = useState<SharedRecipeRecord[]>([]);
  const [sharedRecipesLoading, setSharedRecipesLoading] = useState(false);
  const [batterPreparationError, setBatterPreparationError] = useState('');
  const [batterPreparationSubmitting, setBatterPreparationSubmitting] = useState(false);
  const [batterConfirmationVisible, setBatterConfirmationVisible] = useState(false);
  // Shown on the batch screen after a batch is recorded (the POS banner is not visible there).
  const [batterPreparationNotice, setBatterPreparationNotice] = useState('');
  const batterPreparationSubmissionLock = useRef(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<HistoryTypeFilter>('All types');
  const [historyFromDate, setHistoryFromDate] = useState<Date | null>(null);
  const [historyToDate, setHistoryToDate] = useState<Date | null>(null);
  const [historyStaffFilter, setHistoryStaffFilter] = useState('All staff');
  const [draftHistoryTypeFilter, setDraftHistoryTypeFilter] = useState<HistoryTypeFilter>('All types');
  const [draftHistoryFromDate, setDraftHistoryFromDate] = useState<Date | null>(null);
  const [draftHistoryToDate, setDraftHistoryToDate] = useState<Date | null>(null);
  const [draftHistoryStaffFilter, setDraftHistoryStaffFilter] = useState('All staff');
  const [historyStaffPickerOpen, setHistoryStaffPickerOpen] = useState(false);
  const [historyDateError, setHistoryDateError] = useState('');
  const [selectedHistoryTransactionId, setSelectedHistoryTransactionId] = useState('');
  const [selectedAlertIngredientId, setSelectedAlertIngredientId] = useState('');
  const [selectedAlertKind, setSelectedAlertKind] = useState<InventoryAlertKind>('lowStock');
  const [selectedAlertTab, setSelectedAlertTab] = useState<StaffAlertTab>('lowStock');
  const [ingredientDetailReturnRoute, setIngredientDetailReturnRoute] = useState<'inventory' | 'alerts'>('inventory');
  const [alertSnapshotBranchId, setAlertSnapshotBranchId] = useState<string | null>(null);
  const [alertDataError, setAlertDataError] = useState('');
  const [alertErrorBranchId, setAlertErrorBranchId] = useState<string | null>(null);
  const [alertRefreshing, setAlertRefreshing] = useState(false);
  const [logoutConfirmationVisible, setLogoutConfirmationVisible] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [logoutPending, setLogoutPending] = useState(false);
  const logoutSubmissionLock = useRef(false);

  const applyInventorySnapshot = (
    inventory: Awaited<ReturnType<typeof loadInventory>>,
    branchId: string,
  ) => {
    setIngredients(inventory.items);
    setNearExpirationDays(inventory.nearExpirationDays);
    setLotExpiryWindow(inventory.lotExpiryWindow ?? resolveLotExpiryWindow());
    setAlertSnapshotBranchId(branchId);
    setAlertDataError('');
    setAlertErrorBranchId(null);
  };

  const retryCountCorrectionRequest = async (request: PendingInventoryCountCorrection) => {
    if (request.actorId !== user.id || request.branchId !== user.branchId || !user.branchId) return;
    if (countCorrectionRetryLocks.current.has(request.requestId)) return;
    countCorrectionRetryLocks.current.add(request.requestId);
    setCountCorrectionRetryErrors((current) => {
      const next = { ...current };
      delete next[request.requestId];
      return next;
    });
    try {
      await requestInventoryCountCorrection({
        countLineId: request.countLineId,
        requestId: request.requestId,
        correctedActualQuantity: request.correctedActualQuantity,
        reason: request.reason,
      });
      setPendingCountCorrections(await pendingInventoryCountCorrectionStore.resolve(request.requestId));
      setInventoryReportRefreshKey((current) => current + 1);
      setDashboardMessage('Count correction request submitted to the Owner.');
      setSentCountCorrectionLineIds((current) => new Set(current).add(request.countLineId));
      void refreshBackendData();
      // The count details stay open: show the request there as Pending and confirm it was sent.
      setInventoryReportData((current) => current && {
        ...current,
        physicalCounts: current.physicalCounts.map((count) => count.id !== request.countLineId
          || count.correctionRequests.some((existing) => existing.requestId === request.requestId)
          ? count
          : {
            ...count,
            correctionRequests: [...count.correctionRequests, {
              requestId: request.requestId,
              correctedActualQuantity: request.correctedActualQuantity,
              reason: request.reason,
              status: 'pending' as const,
              decisionReason: null,
              decidedAt: null,
            }],
          }),
      });
      setCountCorrectionNotice({ countLineId: request.countLineId, text: 'Correction request sent to the owner. The original count is kept until the owner decides.' });
    } catch (error) {
      if (error instanceof InventoryCountCorrectionSubmissionError) {
        if (error.definitiveRejection) {
          try {
            setPendingCountCorrections(await pendingInventoryCountCorrectionStore.resolve(request.requestId));
          } catch (storageError) {
            setCountCorrectionStorageError(storageError instanceof Error
              ? storageError.message
              : 'The rejected correction request could not be removed from local recovery data.');
            return;
          }
          setCountCorrectionMessages((current) => ({
            ...current,
            [request.countLineId]: `The server rejected this request: ${error.message}`,
          }));
          setInventoryReportRefreshKey((current) => current + 1);
        } else {
          setCountCorrectionRetryErrors((current) => ({
            ...current,
            [request.requestId]: `${error.message} The request remains saved so it can be safely retried.`,
          }));
        }
      } else {
        setCountCorrectionRetryErrors((current) => ({
          ...current,
          [request.requestId]: error instanceof Error ? error.message : 'Unable to submit the saved count correction request.',
        }));
      }
    } finally {
      countCorrectionRetryLocks.current.delete(request.requestId);
    }
  };

  const retryDailyStockCheck = async (request: PendingDailyStockCheck) => {
    if (request.actorId !== user.id || request.branchId !== user.branchId || !user.branchId) {
      const error = 'This saved count belongs to a different Staff account or branch.';
      setDailyCheckRetryErrors((current) => ({ ...current, [request.requestId]: error }));
      throw new Error(error);
    }
    if (dailyCheckRetryLocks.current.has(request.requestId)) return;
    dailyCheckRetryLocks.current.add(request.requestId);
    setDailyCheckRetryErrors((current) => {
      const next = { ...current };
      delete next[request.requestId];
      return next;
    });
    try {
      const saved = await submitDailyStockCheck({
        branchId: request.branchId,
        requestId: request.requestId,
        checkDate: request.checkDate,
        remarks: request.remarks,
        lines: request.lines,
      });
      setPendingDailyStockChecks(await pendingDailyStockCheckStore.resolve(request.requestId));
      setDailyCheckSubmissionRequest((current) => (
        current?.requestId === request.requestId ? null : current
      ));
      const savedLines = saved.lines.map((line) => ({
        ...line,
        name: dailyCheckLines.find((entry) => entry.ingredientId === line.ingredientId)?.name ?? line.ingredientId,
      }));
      setCurrentDailyCheck({
        reference: saved.reference,
        checkDate: new Date(`${saved.checkDate}T00:00:00`),
        submittedAt: new Date(),
        branch: assignedBranch,
        staff: staffName,
        lines: savedLines,
        remarks: request.remarks,
        status: saved.status === 'pending_owner_review' ? 'pendingOwnerReview' : 'submitted',
      });
      setDailyCheckSaveFailed(false);
      setDailyCheckModal(null);
      setRoute('dailyCheckSuccess');
      void refreshBackendData();
    } catch (error) {
      setDailyCheckRetryErrors((current) => ({
        ...current,
        [request.requestId]: error instanceof Error
          ? `${error.message} The submission remains saved so it can be safely retried.`
          : 'Unable to submit the saved daily count. The submission remains saved so it can be safely retried.',
      }));
      throw error;
    } finally {
      dailyCheckRetryLocks.current.delete(request.requestId);
    }
  };

  useEffect(() => {
    let active = true;
    setPendingInventoryTransactionsLoading(true);
    setPendingInventoryStorageError('');
    pendingInventoryTransactionStore.load()
      .then((requests) => {
        if (active) setPendingInventoryTransactions(requests);
      })
      .catch((error: unknown) => {
        if (active) {
          setPendingInventoryStorageError(
            error instanceof Error ? error.message : 'Unable to load saved inventory recovery data.',
          );
        }
      })
      .finally(() => {
        if (active) setPendingInventoryTransactionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id, user.branchId]);

  useEffect(() => {
    let active = true;
    setPendingSaleCheckoutLoading(true);
    setPendingSaleCheckoutStorageError('');
    pendingSaleCheckoutStore.load()
      .then((requests) => {
        if (active) setPendingSaleCheckouts(requests);
      })
      .catch((error: unknown) => {
        if (active) {
          setPendingSaleCheckoutStorageError(error instanceof Error
            ? error.message
            : 'Unable to load saved checkout recovery data.');
        }
      })
      .finally(() => {
        if (active) setPendingSaleCheckoutLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id, user.branchId]);

  useEffect(() => {
    let active = true;
    setDailyCheckStorageError('');
    pendingDailyStockCheckStore.load()
      .then((requests) => {
        if (active) setPendingDailyStockChecks(requests);
      })
      .catch((error: unknown) => {
        if (active) {
          setDailyCheckStorageError(error instanceof Error
            ? error.message
            : 'Unable to load saved daily count submissions.');
        }
      });
    return () => {
      active = false;
    };
  }, [user.id, user.branchId]);

  useEffect(() => {
    let active = true;
    setCountCorrectionStorageError('');
    pendingInventoryCountCorrectionStore.load()
      .then((requests) => {
        if (!active) return;
        setPendingCountCorrections(requests);
        for (const request of requests) {
          if (request.actorId === user.id && request.branchId === user.branchId) {
            void retryCountCorrectionRequest(request);
          }
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setCountCorrectionStorageError(error instanceof Error
            ? error.message
            : 'Unable to load saved count correction requests.');
        }
      });
    return () => {
      active = false;
    };
  }, [user.id, user.branchId]);

  useEffect(() => {
    if (route !== 'batterBatch' || batterBatchReference !== '' || !user?.branchId) return;
    let active = true;
    reserveBatterBatchReference()
      .then((reference) => {
        if (active) setBatterBatchReference((current) => current || reference);
      })
      .catch(() => {
        // The server still generates a reference on confirmation if this fails.
      });
    return () => {
      active = false;
    };
  }, [route, batterBatchReference, user?.branchId]);

  useEffect(() => {
    if (route !== 'stocks' && route !== 'batterBatch') return;
    let active = true;
    setSharedRecipesLoading(true);
    loadSharedRecipes()
      .then((recipes) => {
        if (active) setSharedRecipes(recipes);
      })
      .catch(() => {
        if (active) setSharedRecipes([]);
      })
      .finally(() => {
        if (active) setSharedRecipesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [route, user?.branchId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refreshAtNextManilaDay = () => {
      setToday(manilaBusinessDate());
      const nextDay = manilaBusinessDate();
      nextDay.setDate(nextDay.getDate() + 1);
      const nextMidnight = new Date(manilaMidnightTimestamp(nextDay)).getTime();
      timer = setTimeout(refreshAtNextManilaDay, Math.max(1000, nextMidnight - Date.now() + 50));
    };
    const nextDay = manilaBusinessDate();
    nextDay.setDate(nextDay.getDate() + 1);
    const nextMidnight = new Date(manilaMidnightTimestamp(nextDay)).getTime();
    timer = setTimeout(refreshAtNextManilaDay, Math.max(1000, nextMidnight - Date.now() + 50));
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const currentToday = formatLocalIsoDate(today);
    if (previousToday.current === currentToday) return;
    const previousDate = previousToday.current;
    previousToday.current = currentToday;
    setDailySalesDate((selectedDate) =>
      formatLocalIsoDate(selectedDate) === previousDate ? today : selectedDate,
    );
  }, [today]);

  useEffect(() => {
    let active = true;
    const branchId = user?.branchId;
    if (!branchId) {
      setBackendLoading(false);
      setBackendError('Your account does not have an assigned branch. Contact the owner.');
      return () => {
        active = false;
      };
    }
    setBackendLoading(true);
    setBackendError('');
    setNearExpirationDays(null);
    Promise.allSettled([
      loadInventory(branchId, manilaBusinessDate()),
      loadTransactionHistory(branchId),
    ] as const)
      .then(([inventoryResult, historyResult]) => {
        if (!active) return;
        const errors: string[] = [];
        if (inventoryResult.status === 'fulfilled') {
          applyInventorySnapshot(inventoryResult.value, branchId);
        } else {
          const message = inventoryResult.reason instanceof Error
            ? inventoryResult.reason.message
            : 'Unable to load branch inventory.';
          setAlertDataError(message);
          setAlertErrorBranchId(branchId);
          errors.push(message);
        }
        if (historyResult.status === 'fulfilled') {
          setBackendHistory(historyResult.value);
        } else {
          errors.push(historyResult.reason instanceof Error
            ? historyResult.reason.message
            : 'Unable to load branch history.');
        }
        setBackendError(errors[0] ?? '');
      })
      .finally(() => {
        if (active) setBackendLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.branchId]);

  useEffect(() => {
    if (route !== 'menu') return;
    let active = true;
    if (!user?.branchId) {
      setUnresolvedSales([]);
      setUnresolvedSalesError('Your account does not have an assigned branch.');
      return () => {
        active = false;
      };
    }
    setUnresolvedSalesLoading(true);
    setUnresolvedSalesError('');
    Promise.all([loadUnresolvedSales(user.branchId), loadRecentStaffSales(user.branchId)])
      .then(([unresolved, recent]) => {
        if (active) {
          setUnresolvedSales(unresolved);
          setRecentSales(recent);
          setSaleHistoryError('');
        }
      })
      .catch((error: unknown) => {
        if (active) {
          const message = error instanceof Error ? error.message : 'Unable to load branch sales.';
          setUnresolvedSalesError(message);
          setSaleHistoryError(message);
        }
      })
      .finally(() => {
        if (active) setUnresolvedSalesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [route, user?.branchId]);

  useEffect(() => {
    if (route !== 'dailySales') return;
    let active = true;
    const branchId = user?.branchId;
    if (!branchId) {
      setDailySalesSummary(null);
      setDailySalesError(STAFF_DAILY_SALES_LOAD_ERROR);
      setDailySalesLoading(false);
      return () => {
        active = false;
      };
    }
    setDailySalesLoading(true);
    setDailySalesError('');
    setDailySalesSummary(null);
    setDailySalesReceiptsError('');
    loadStaffSalesForBusinessDay(branchId, dailySalesDate)
      .then((sales) => {
        if (active) setDailySalesReceipts(sales);
      })
      .catch(() => {
        if (active) {
          setDailySalesReceipts([]);
          setDailySalesReceiptsError('Unable to load the receipts for this day. Tap Refresh to try again.');
        }
      });
    getStaffDailySalesLoadResult(() => loadStaffDailySales(branchId, dailySalesDate))
      .then(({ summary, error }) => {
        if (active) {
          setDailySalesSummary(summary);
          setDailySalesError(error);
        }
      })
      .finally(() => {
        if (active) setDailySalesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [route, user?.branchId, dailySalesDate, dailySalesRefreshKey]);

  useEffect(() => {
    if (route !== 'inventoryReport' && route !== 'inventoryCountDetails') return;
    // Coming from the report list, the data is already loaded.
    if (route === 'inventoryCountDetails' && countDetailsReturnRoute !== 'transactionDetails') return;
    let active = true;
    const branchId = user?.branchId;
    if (!branchId) {
      setInventoryReportData(null);
      setInventoryReportError('Unable to load data. Please check your internet connection and try again.');
      setInventoryReportLoading(false);
      return () => {
        active = false;
      };
    }
    setInventoryReportLoading(true);
    setInventoryReportError('');
    runInventoryReportLoad(() => loadStaffInventoryReports(branchId, user?.branch ?? ''))
      .then(({ data, error }) => {
        if (active) {
          setInventoryReportData(data);
          setInventoryReportError(error);
        }
      })
      .finally(() => {
        if (active) setInventoryReportLoading(false);
      });
    return () => {
      active = false;
    };
  }, [route, countDetailsReturnRoute, user?.branchId, user?.branch, inventoryReportRefreshKey]);

  useEffect(() => {
    if (
      selectedInventoryReport === 'ingredientCategorySummary' &&
      inventoryReportData &&
      inventoryReportData.categories.length
    ) {
      setExpandedInventoryCategories(
        new Set(inventoryReportData.categories.map((group) => group.category)),
      );
    }
  }, [selectedInventoryReport, inventoryReportData]);

  useEffect(() => {
    if (route !== 'menu' && route !== 'cart' && route !== 'checkout') return;
    if (route !== 'menu' && menuCatalogLoaded && menuCatalogBranchId === user?.branchId) return;
    let active = true;
    setMenuCatalogLoading(true);
    setMenuCatalogError('');
    if (!user?.branchId) {
      setMenuCatalogError('Your account does not have an assigned branch. Contact the owner.');
      setMenuCatalogLoading(false);
      return;
    }
    setMenuCatalog([]);
    setMenuAddons([]);
    setMenuCatalogLoaded(false);
    loadStaffMenuCatalog(user.branchId)
      .then(({ products, addons, stock }) => {
        if (active) {
          setMenuCatalog(products);
          setMenuAddons(addons);
          setMenuStock(stock);
          setMenuCatalogError('');
          setMenuCatalogLoaded(true);
          setMenuCatalogBranchId(user.branchId);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMenuCatalog([]);
          setMenuCatalogError(error instanceof Error ? error.message : 'Unable to load the current product catalog.');
        }
      })
      .finally(() => {
        if (active) setMenuCatalogLoading(false);
      });
    return () => {
      active = false;
    };
  }, [route, user?.branchId]);

  const retryMenuCatalog = () => {
    if (menuCatalogLoading || (route !== 'menu' && route !== 'cart' && route !== 'checkout')) return;
    setMenuCatalogLoading(true);
    setMenuCatalogError('');
    setMenuCatalogLoaded(false);
    if (!user?.branchId) {
      setMenuCatalogError('Your account does not have an assigned branch. Contact the owner.');
      setMenuCatalogLoading(false);
      return;
    }
    loadStaffMenuCatalog(user.branchId)
      .then(({ products, addons, stock }) => {
        setMenuCatalog(products);
        setMenuAddons(addons);
        setMenuStock(stock);
        setMenuCatalogError('');
        setMenuCatalogLoaded(true);
        setMenuCatalogBranchId(user.branchId);
      })
      .catch((error: unknown) => {
        setMenuCatalog([]);
        setMenuCatalogError(error instanceof Error ? error.message : 'Unable to load the current product catalog.');
      })
      .finally(() => setMenuCatalogLoading(false));
  };

  const refreshBackendData = async () => {
    const branchId = user?.branchId;
    if (!branchId) {
      setBackendError('Your account does not have an assigned branch. Contact the owner.');
      setBackendLoading(false);
      return;
    }
    setBackendLoading(true);
    setBackendError('');
    setUnresolvedSalesLoading(true);
    const salesRefresh = Promise.all([
      loadUnresolvedSales(branchId),
      loadRecentStaffSales(branchId),
    ])
      .then(([unresolved, recent]) => {
        setUnresolvedSales(unresolved);
        setRecentSales(recent);
        setUnresolvedSalesError('');
        setSaleHistoryError('');
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to refresh branch sales.';
        setUnresolvedSalesError(message);
        setSaleHistoryError(message);
      })
      .finally(() => setUnresolvedSalesLoading(false));
    const [inventoryResult, historyResult] = await Promise.allSettled([
      loadInventory(branchId, manilaBusinessDate()),
      loadTransactionHistory(branchId),
      salesRefresh,
    ] as const);
    const errors: string[] = [];
    if (inventoryResult.status === 'fulfilled') {
      applyInventorySnapshot(inventoryResult.value, branchId);
    } else {
      const message = inventoryResult.reason instanceof Error
        ? inventoryResult.reason.message
        : 'Unable to refresh branch inventory.';
      setAlertDataError(message);
      setAlertErrorBranchId(branchId);
      errors.push(message);
    }
    if (historyResult.status === 'fulfilled') {
      setBackendHistory(historyResult.value);
    } else {
      errors.push(historyResult.reason instanceof Error
        ? historyResult.reason.message
        : 'Unable to refresh branch history.');
    }
    setBackendError(errors[0] ?? '');
    setBackendLoading(false);
  };

  const submitPendingInventoryRequest = async (request: PendingInventoryTransaction) => {
    if (!canRetryPendingInventoryTransaction(request, user.id, user.branchId ?? '')) {
      throw new Error('This saved transaction belongs to a different Staff account or branch. Sign in to the original account and branch to retry it.');
    }
    return runInventoryTransactionRequestOnce(request.requestId, pendingInventoryRequestLocks.current, async () => {
      setPendingInventoryRetryingIds((current) => new Set(current).add(request.requestId));
      setPendingInventoryRequestErrors((current) => {
        const next = { ...current };
        delete next[request.requestId];
        return next;
      });
      setLastPendingInventoryRequestId(request.requestId);
      try {
        const processing = await pendingInventoryTransactionStore.markProcessing(request.requestId);
        setPendingInventoryTransactions(processing);
        const saved = await recordInventoryTransactionsIdempotently(
          request.branchId,
          request.requestId,
          request.transactions,
        );
        const reference = saved[0]?.reference;
        if (!reference) throw new Error('The saved inventory transaction did not return a reference.');
        const requestWithReference = { ...request, status: 'processing' as const, reference };
        await pendingInventoryTransactionStore.save(requestWithReference);
        try {
          const resolved = await pendingInventoryTransactionStore.resolve(request.requestId);
          setPendingInventoryTransactions(resolved);
          setPendingInventoryStorageError('');
          setLastPendingInventoryRequestId(null);
          setForceNewInventoryRequestFor(null);
        } catch (error) {
          setPendingInventoryStorageError(
            error instanceof Error
              ? `The transaction was confirmed, but its local recovery copy could not be cleared: ${error.message}`
              : 'The transaction was confirmed, but its local recovery copy could not be cleared.',
          );
          setPendingInventoryTransactions((current) => current.map((entry) =>
            entry.requestId === request.requestId ? { ...entry, status: 'pending' } : entry,
          ));
        }
        setPendingInventoryRequestErrors((current) => {
          const next = { ...current };
          delete next[request.requestId];
          return next;
        });
        return saved;
      } catch (error) {
        if (isDefinitiveInventoryRejection(error)) {
          // The server validated and rejected this request before writing anything, so it
          // is not an unresolved transaction: clear it instead of blocking new entries.
          try {
            const resolved = await pendingInventoryTransactionStore.resolve(request.requestId);
            setPendingInventoryTransactions(resolved);
            setLastPendingInventoryRequestId(null);
            setForceNewInventoryRequestFor(null);
            setPendingInventoryRequestErrors((current) => {
              const next = { ...current };
              delete next[request.requestId];
              return next;
            });
          } catch (storageError) {
            setPendingInventoryStorageError(
              storageError instanceof Error
                ? `The request was rejected but its local recovery copy could not be cleared: ${storageError.message}`
                : 'The request was rejected but its local recovery copy could not be cleared.',
            );
          }
          setDashboardMessage(`The inventory transaction was rejected and nothing was saved: ${error instanceof Error ? error.message : 'validation failed'}`);
          throw error;
        }
        try {
          const pending = await pendingInventoryTransactionStore.save({ ...request, status: 'pending' });
          setPendingInventoryTransactions(pending);
        } catch (storageError) {
          setPendingInventoryStorageError(
            storageError instanceof Error
              ? `The request remains unresolved and local recovery state could not be updated: ${storageError.message}`
              : 'The request remains unresolved and local recovery state could not be updated.',
          );
        }
        const message = error instanceof Error ? error.message : 'Unable to confirm the inventory transaction.';
        setPendingInventoryRequestErrors((current) => ({ ...current, [request.requestId]: message }));
        throw error;
      } finally {
        setPendingInventoryRetryingIds((current) => {
          const next = new Set(current);
          next.delete(request.requestId);
          return next;
        });
      }
    });
  };

  const storedUnitCatalog = () => new Map(ingredients.map((item) => [
    item.id,
    item.id === 'prepared-batter' && item.unit === 'ml' ? 'bottle' : item.unit,
  ]));

  // A saved request naming an ingredient/unit that does not match the database can never
  // be accepted (the server requires an exact match), so it is not a real unresolved
  // transaction. Clear only those; everything else stays retryable.
  const pruneProvablyInvalidPendingRequests = async () => {
    if (ingredients.length === 0) return pendingInventoryTransactions;
    const catalog = storedUnitCatalog();
    let current = pendingInventoryTransactions;
    for (const request of pendingInventoryTransactions) {
      if (request.actorId !== user.id || request.branchId !== user.branchId) continue;
      if (!pendingRequestIsProvablyInvalid(request.transactions, catalog)) continue;
      current = await pendingInventoryTransactionStore.resolve(request.requestId);
    }
    if (current !== pendingInventoryTransactions) setPendingInventoryTransactions(current);
    return current;
  };

  const submitNewInventoryRequest = async (
    type: RetrySafeInventoryTransaction['type'],
    transactions: RetrySafeInventoryTransaction[],
  ) => {
    if (!user.branchId) {
      throw new Error('Your account does not have an assigned branch. Contact the owner.');
    }
    if (pendingInventoryTransactionsLoading) {
      throw new Error('Saved inventory recovery requests are still loading. Please wait and try again.');
    }
    if (pendingInventoryStorageError !== '') {
      throw new Error('Saved inventory recovery data is unavailable. Do not create another transaction until it can be recovered.');
    }
    const unresolved = (await pruneProvablyInvalidPendingRequests()).filter((request) =>
      request.actorId === user.id &&
      request.branchId === user.branchId &&
      sameInventoryTransactionWorkflow(request.transactionType, type),
    );
    const forcedNew = forceNewInventoryRequestFor !== null &&
      unresolved.some((request) => request.requestId === forceNewInventoryRequestFor);
    if (!forcedNew) {
      const exactRetry = unresolved.find((request) =>
        sameInventoryTransactionPayload(request.transactions, transactions),
      );
      if (exactRetry) {
        setLastPendingInventoryRequestId(exactRetry.requestId);
        const saved = await submitPendingInventoryRequest(exactRetry);
        if (!saved) throw new Error('This transaction is already being retried.');
        return saved;
      }
      const unresolvedDifferentPayload = unresolved.find((request) =>
        request.requestId !== forceNewInventoryRequestFor,
      );
      if (unresolvedDifferentPayload) {
        setLastPendingInventoryRequestId(unresolvedDifferentPayload.requestId);
        throw new Error('A previous transaction of this type is unresolved. Retry it, or explicitly create this as a separate transaction.');
      }
    }

    const request: PendingInventoryTransaction = {
      requestId: crypto.randomUUID(),
      actorId: user.id,
      actorLabel: user.displayName || user.email,
      branchId: user.branchId,
      branchLabel: user.branch,
      transactionType: type,
      transactions: transactions.map((transaction) => ({ ...transaction })),
      createdAt: new Date().toISOString(),
      status: 'pending',
      reference: null,
    };
    const pending = await pendingInventoryTransactionStore.save(request);
    setPendingInventoryTransactions(pending);
    setLastPendingInventoryRequestId(request.requestId);
    setForceNewInventoryRequestFor(null);
    const saved = await submitPendingInventoryRequest(request);
    if (!saved) throw new Error('This transaction is already being saved.');
    return saved;
  };

  const retryPendingInventoryRequest = async (request: PendingInventoryTransaction) => {
    if (!canRetryPendingInventoryTransaction(request, user.id, user.branchId ?? '')) {
      setPendingInventoryRequestErrors((current) => ({
        ...current,
        [request.requestId]: 'Sign in to the Staff account assigned to this branch to safely retry this transaction.',
      }));
      return;
    }
    try {
      const saved = await submitPendingInventoryRequest(request);
      if (!saved) return;
      await refreshBackendData();
      setDashboardMessage(`Inventory transaction ${saved[0]?.reference ?? ''} was confirmed.`);
    } catch {
      return;
    }
  };

  const refreshDashboardData = async () => {
    setRefreshing(true);
    try {
      await refreshBackendData();
    } finally {
      setRefreshing(false);
    }
  };

  const refreshAlertsData = () => runInventoryAlertsRefreshOnce(alertRefreshLock, async () => {
    setAlertRefreshing(true);
    const hasCurrentSnapshot = alertSnapshotBranchId === user.branchId;
    if (!hasCurrentSnapshot) {
      setAlertDataError('');
      setAlertErrorBranchId(null);
    }
    try {
      if (!user.branchId) throw new Error('Your account does not have an assigned branch. Contact the owner.');
      const inventory = await loadInventory(user.branchId, manilaBusinessDate());
      applyInventorySnapshot(inventory, user.branchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to refresh branch alerts.';
      setAlertDataError(message);
      setAlertErrorBranchId(user.branchId ?? null);
    } finally {
      setAlertRefreshing(false);
    }
  });

  useEffect(() => {
    if (route === 'alerts' && !backendLoading) {
      void refreshAlertsData();
    }
  }, [route]);

  const selectedIngredient = ingredients.find((item) => item.id === selectedIngredientId);
  const getStockInValidation = ({
    ingredientId = selectedIngredientId,
    quantityValue = quantity,
    transactionDateValue = transactionDate,
    expirationDateValue = expirationDate,
  }: {
    ingredientId?: string;
    quantityValue?: string;
    transactionDateValue?: Date | null;
    expirationDateValue?: Date | null;
  } = {}) => validateStockInForm({
    ingredient: ingredients.find((item) => item.id === ingredientId) ?? null,
    quantityValue,
    transactionDate: transactionDateValue,
    expirationDate: expirationDateValue,
  });
  const updateStockInValidation = (values: Parameters<typeof getStockInValidation>[0]) => {
    const { errors, summary } = getStockInValidation(values);
    setStockInFieldErrors(errors as Record<string, string>);
    setFormError(summary);
  };
  const getStockOutValidation = ({
    ingredientId = selectedIngredientId,
    quantityValue = quantity,
    transactionDateValue = transactionDate,
    reasonValue = reason,
    validateIngredientAndQuantity = true,
  }: {
    ingredientId?: string;
    quantityValue?: string;
    transactionDateValue?: Date | null;
    reasonValue?: string;
    validateIngredientAndQuantity?: boolean;
  } = {}) => validateStockOutForm({
    ingredient: ingredients.find((item) => item.id === ingredientId) ?? null,
    quantityValue,
    transactionDate: transactionDateValue,
    reason: reasonValue,
    validateIngredientAndQuantity,
  });
  const validateStockOutValues = (values: Parameters<typeof getStockOutValidation>[0] = {}) =>
    getStockOutValidation(values).errors as Record<string, string>;
  const updateStockOutValidation = (values: Parameters<typeof validateStockOutValues>[0]) => {
    const { errors, summary } = getStockOutValidation(values);
    setStockOutFieldErrors(errors as Record<string, string>);
    setQuantityError(errors.quantity ?? '');
    setFormError(summary);
  };
  const staffName = user.displayName;
  const staffRole = user.role;
  const assignedBranch = user.branch;
  const historyTransactions = backendHistory;
  const selectedHistoryTransaction = historyTransactions.find(
    (transaction) => transaction.id === selectedHistoryTransactionId,
  );
  const historyStaffOptions = ['All staff', ...new Set(historyTransactions.map((transaction) => transaction.staff))];
  const normalizedHistorySearch = historySearch.trim().toLowerCase();
  const filteredHistoryTransactions = historyTransactions.filter((transaction) => {
    const matchesSearch = [
      transaction.ingredientName,
      transaction.reference,
      transaction.type,
      transaction.reason,
      transaction.notes,
      transaction.batchReference ?? '',
    ].join(' ').toLowerCase().includes(normalizedHistorySearch);
    const matchesType = matchesHistoryTypeFilter(transaction, historyTypeFilter);
    const dateValue = manilaBusinessDate(transaction.transactionDate).getTime();
    const from = historyFromDate
      ? new Date(historyFromDate.getFullYear(), historyFromDate.getMonth(), historyFromDate.getDate()).getTime()
      : Number.NEGATIVE_INFINITY;
    const to = historyToDate
      ? new Date(historyToDate.getFullYear(), historyToDate.getMonth(), historyToDate.getDate()).getTime()
      : Number.POSITIVE_INFINITY;
    return matchesSearch &&
      matchesType &&
      dateValue >= from &&
      dateValue <= to &&
      (historyStaffFilter === 'All staff' || transaction.staff === historyStaffFilter);
  });
  const historyLedgerExplanation = (ingredientId: string) => {
    const records = historyTransactions
      .filter((transaction) => transaction.ingredientId === ingredientId)
      .sort((first, second) => first.transactionDate.getTime() - second.transactionDate.getTime());
    if (records.length === 0 || records.some((transaction) =>
      transaction.beforeQuantity === null || transaction.afterQuantity === null,
    )) return null;
    let expected = records[0].beforeQuantity;
    if (expected === null) return null;
    const opening = expected;
    const movements: string[] = [];
    for (const transaction of records) {
      if (transaction.beforeQuantity !== expected) return null;
      if (transaction.afterQuantity === null) return null;
      movements.push(`${transaction.movement > 0 ? '+' : ''}${formatQuantity(transaction.movement)}`);
      expected = transaction.afterQuantity;
    }
    return `${records[0].ingredientName} recorded ledger: ${formatQuantity(opening)} ${movements.join(' ')} = ${formatQuantity(expected)} ${records[0].unit}.`;
  };
  const beginHistoryFilters = () => {
    setDraftHistoryTypeFilter(historyTypeFilter);
    setDraftHistoryFromDate(historyFromDate);
    setDraftHistoryToDate(historyToDate);
    setDraftHistoryStaffFilter(historyStaffFilter);
    setHistoryDateError('');
    setHistoryStaffPickerOpen(false);
    setRoute('historyFilters');
  };
  const applyHistoryFilters = () => {
    if (draftHistoryFromDate && draftHistoryToDate &&
      new Date(draftHistoryFromDate.getFullYear(), draftHistoryFromDate.getMonth(), draftHistoryFromDate.getDate()).getTime() >
      new Date(draftHistoryToDate.getFullYear(), draftHistoryToDate.getMonth(), draftHistoryToDate.getDate()).getTime()) {
      setHistoryDateError('From date must be on or before the To date.');
      return;
    }
    setHistoryTypeFilter(draftHistoryTypeFilter);
    setHistoryFromDate(draftHistoryFromDate);
    setHistoryToDate(draftHistoryToDate);
    setHistoryStaffFilter(draftHistoryStaffFilter);
    setHistoryDateError('');
    setRoute('stockHistory');
  };
  const resetHistoryFilters = () => {
    setHistorySearch('');
    setHistoryTypeFilter('All types');
    setHistoryFromDate(null);
    setHistoryToDate(null);
    setHistoryStaffFilter('All staff');
    setDraftHistoryTypeFilter('All types');
    setDraftHistoryFromDate(null);
    setDraftHistoryToDate(null);
    setDraftHistoryStaffFilter('All staff');
    setHistoryDateError('');
    setHistoryStaffPickerOpen(false);
    setRoute('stockHistory');
  };
  const resetTransactionFilters = () => {
    setHistoryTypeFilter('All types');
    setHistoryFromDate(null);
    setHistoryToDate(null);
    setHistoryStaffFilter('All staff');
    setDraftHistoryTypeFilter('All types');
    setDraftHistoryFromDate(null);
    setDraftHistoryToDate(null);
    setDraftHistoryStaffFilter('All staff');
    setHistoryDateError('');
    setRoute('stockHistory');
  };
  const dailyCheckResults = dailyCheckLines.map((line) => {
    const parsedQuantity = Number(line.physicalQuantity);
    const valid = isValidDailyQuantity(line.physicalQuantity, line.unit, line.precision);
    const difference = valid
      ? roundDailyQuantity(parsedQuantity - line.recordedQuantity, line.unit, line.precision)
      : null;
    return { ...line, parsedQuantity, valid, difference };
  });
  const dailyDiscrepancies = dailyCheckResults.filter(
    (line) => line.valid && line.difference !== 0,
  );
  const dailyCheckValid =
    dailyCheckResults.length > 0 &&
    dailyCheckResults.every((line) => line.valid);
  const dailyCheckHasUnsavedEntries = hasUnsavedCountEntries(
    countEntriesSnapshot(dailyCheckLines, dailyCheckRemarks, dailyCheckVerified),
    dailyCheckSavedSnapshot,
  );
  useEffect(() => {
    if (route !== 'dailyInventoryCheck' || !dailyCheckHasUnsavedEntries || dailyCheckSubmitting || Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setDailyCheckLeaveTarget(staffReturnTab(navigationOrigin, 'inventory'));
      setDailyCheckLeavePromptVisible(true);
      return true;
    });
    return () => subscription.remove();
  }, [route, dailyCheckHasUnsavedEntries, dailyCheckSubmitting, navigationOrigin]);
  const selectedBatch = stockOutBatchPresets.find((preset) => preset.name === batchPreset) ?? stockOutBatchPresets[0];
  const parsedBatchCount = Number(batchCount);
  const usageDeductions: UsageDeduction[] = usageMode === 'manual'
    ? selectedIngredient
      ? [{
          ingredientId: selectedIngredient.id,
          quantity: Number(quantity),
          previousQuantity: selectedIngredient.quantity,
          newQuantity: selectedIngredient.quantity - Number(quantity),
        }]
      : []
    : selectedBatch.deductions.map((deduction) => {
        const ingredient = ingredients.find((item) => item.id === deduction.ingredientId);
        const deductionQuantity = deduction.quantity * parsedBatchCount;
        return {
          ingredientId: deduction.ingredientId,
          quantity: deductionQuantity,
          previousQuantity: ingredient?.quantity ?? 0,
          newQuantity: (ingredient?.quantity ?? 0) - deductionQuantity,
        };
      });
  const visibleIngredients = useMemo(
    () => filterStaffInventoryItems(ingredients, category, search),
    [category, ingredients, search],
  );
  const alertDate = manilaBusinessDate();
  const branchInventoryItems = filterBranchInventoryAlertItems(ingredients);
  const lowStockItems = branchInventoryItems.filter(
    (item) => classifyStockAlert(item.quantity, stockThresholdOf(item)) === 'lowStock',
  );
  const outOfStockItems = branchInventoryItems.filter(
    (item) => classifyStockAlert(item.quantity, stockThresholdOf(item)) === 'outOfStock',
  );
  const nearExpirationBatches = branchInventoryItems.flatMap((item) => {
    if (!item.expirationTracking) return [];
    return filterBatchesWithRemainingStock(item.batches).flatMap((batch) => {
      const expirationDateValue = parseInventoryDate(batch.expirationDateIso ?? batch.expirationDate);
      if (!expirationDateValue) return [];
      const daysRemaining = daysBetweenDates(alertDate, expirationDateValue);
      return classifyExpirationAlert(daysRemaining, item.nearExpirationDays) === 'nearExpiration'
        ? [{ item, batch, daysRemaining }]
        : [];
    });
  });
  const expiredBatches = branchInventoryItems.flatMap((item) => {
    if (!item.expirationTracking) return [];
    return filterBatchesWithRemainingStock(item.batches).flatMap((batch) => {
      const expirationDateValue = parseInventoryDate(batch.expirationDateIso ?? batch.expirationDate);
      if (!expirationDateValue) return [];
      const daysRemaining = daysBetweenDates(alertDate, expirationDateValue);
      return classifyExpirationAlert(daysRemaining, item.nearExpirationDays) === 'expired'
        ? [{ item, batch, daysRemaining }]
        : [];
    });
  });
  const expiringItems = [...new Map(nearExpirationBatches.map(({ item }) => [item.id, item])).values()];
  const inventoryAlerts: InventoryAlert[] = sortInventoryAlerts(deduplicateInventoryAlerts([
    ...lowStockItems.map((item) => ({
      id: `low-${item.id}`,
      kind: 'lowStock' as const,
      ingredientId: item.id,
      batch: item.batches[0] ?? null,
      quantity: item.quantity,
      minimumStock: item.minimumStock,
      unit: item.unit,
      title: item.name,
      detail: `Expected: ${formatUnitQuantity(item.quantity, item.unit)}\n${stockThresholdLines(item)}${item.criticalStock && item.quantity > 0 ? '\nCritical: at or below safety stock' : ''}`,
    })),
    ...outOfStockItems.map((item) => ({
      id: `out-${item.id}`,
      kind: 'outOfStock' as const,
      ingredientId: item.id,
      batch: item.batches[0] ?? null,
      quantity: item.quantity,
      minimumStock: item.minimumStock,
      unit: item.unit,
      title: item.name,
      detail: `Expected: ${formatUnitQuantity(item.quantity, item.unit)}\n${stockThresholdLines(item)}${item.criticalStock && item.quantity > 0 ? '\nCritical: at or below safety stock' : ''}`,
    })),
    ...nearExpirationBatches.map(({ item, batch, daysRemaining }) => {
      const expiryText = daysRemaining === 0
        ? 'Expires today'
        : `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining`;
      return {
        id: `expiry-${item.id}-${batch.reference}-${batch.receivedDate}`,
        kind: 'nearExpiration' as const,
        ingredientId: item.id,
        batch,
        quantity: batch.quantityRemaining,
        unit: item.unit,
        daysRemaining,
        title: item.name,
        detail: `Batch ${batch.reference} · ${formatUnitQuantity(batch.quantityRemaining, item.unit)}\nExpires ${batch.expirationDate ?? 'Not recorded'}\n${expiryText}`,
      };
    }),
    ...expiredBatches.map(({ item, batch, daysRemaining }) => ({
      id: `expired-${item.id}-${batch.reference}-${batch.receivedDate}`,
      kind: 'expired' as const,
      ingredientId: item.id,
      batch,
      quantity: batch.quantityRemaining,
      unit: item.unit,
      daysRemaining,
      title: item.name,
      detail: `Batch ${batch.reference} · ${formatUnitQuantity(batch.quantityRemaining, item.unit)}\nExpired ${batch.expirationDate ?? 'Not recorded'}\n${Math.abs(daysRemaining)} ${Math.abs(daysRemaining) === 1 ? 'day' : 'days'} past expiration`,
    })),
  ]));
  const alertBadgeCounts = countInventoryAlertsWhenReady(inventoryAlerts, backendLoading, backendError);
  const alertBadgeCount = Object.values(alertBadgeCounts).reduce((total, count) => total + count, 0);
  const hasCurrentAlertSnapshot = Boolean(user.branchId) && alertSnapshotBranchId === user.branchId;
  const alertRefreshError = user.branchId
    ? alertErrorBranchId === user.branchId ? alertDataError : ''
    : backendError;
  const alertScreenStatus = getInventoryAlertScreenStatus(
    hasCurrentAlertSnapshot,
    backendLoading || alertRefreshing,
    alertRefreshError,
  );
  const alertCounts = countInventoryAlertsForSnapshot(inventoryAlerts, hasCurrentAlertSnapshot);
  const activeAlertCount = alertCounts
    ? Object.values(alertCounts).reduce((total, count) => total + count, 0)
    : null;
  const dashboardTerm = dashboardSearch.trim().toLowerCase();
  const dashboardMatches = (item: Ingredient) =>
    `${item.name} ${item.category}`.toLowerCase().includes(dashboardTerm);
  const visibleLowStockItems = lowStockItems.filter(dashboardMatches);
  const visibleExpiringItems = expiringItems.filter(dashboardMatches);

  useEffect(() => {
    // Opening a root tab (other than More) ends a flow that was started from More.
    if (route !== 'more' && !isMoreFlowRoute(route)) setNavigationOrigin(null);
  }, [route]);

  const navigate = (nextRoute: StaffTab) => {
    // Leaving the count with unsaved entries asks first; staff can always leave.
    if (route === 'dailyInventoryCheck' && dailyCheckHasUnsavedEntries && !dailyCheckSubmitting) {
      setDailyCheckLeaveTarget(nextRoute);
      setDailyCheckLeavePromptVisible(true);
      return;
    }
    setDailyCheckModal(null);
    setLogoutConfirmationVisible(false);
    setRoute(nextRoute);
    setDashboardMessage('');
  };

  const openDailySales = () => {
    setDailySalesDate(manilaBusinessDate());
    setDailySalesSummary(null);
    setDailySalesError('');
    setRoute('dailySales');
  };

  /** ST-14 c6: staff see their counts in Transaction History, under the Physical Inventory Count type. */
  const openCountHistory = () => {
    setHistorySearch('');
    setHistoryTypeFilter('Physical Inventory Count');
    setDraftHistoryTypeFilter('Physical Inventory Count');
    setHistoryFromDate(null);
    setHistoryToDate(null);
    setHistoryStaffFilter('All staff');
    setHistoryDateError('');
    setRoute('stockHistory');
  };

  /** ST-12 c9: a count is changed only through a correction request, started from its record in Transaction History. */
  const openCountCorrectionFromHistory = (countLineId: string, startRequest: boolean, originalActualQuantity: number) => {
    setSelectedInventoryReport('physicalInventoryCount');
    setSelectedInventoryCountId(countLineId);
    setInventoryReportError('');
    setCountCorrectionView(true);
    setCountDetailsReturnRoute('transactionDetails');
    if (startRequest) {
      setSelectedCorrectionCountLineId(countLineId);
      setCorrectionActualQuantity(String(originalActualQuantity));
      setCorrectionReason('');
      setCorrectionFormError('');
    } else {
      setSelectedCorrectionCountLineId(null);
    }
    setRoute('inventoryCountDetails');
  };

  const openInventoryReport = (report: InventoryReportKey) => {
    setSelectedInventoryReport(report);
    setSelectedInventoryCountId(null);
    setExpandedInventoryCategories(new Set());
    setInventoryReportData(null);
    setInventoryReportError('');
    setRoute('inventoryReport');
  };

  const openInventoryCountDetails = (count: InventoryCountRecord) => {
    setCountDetailsReturnRoute('inventoryReport');
    setCountCorrectionView(false);
    setSelectedInventoryCountId(count.id);
    setRoute('inventoryCountDetails');
  };

  const addMenuProduct = (productId: string) => {
    const product = menuCatalog.find((item) => item.id === productId);
    if (!product && menuCatalogLoading) {
      setDashboardMessage('The menu is still loading. Please try adding the product again.');
      return;
    }
    if (!product) {
      setDashboardMessage('This product is no longer available in the current catalog.');
      return;
    }
    if (!product.isAvailable) {
      setDashboardMessage(`${product.name} is currently unavailable and was not added.`);
      return;
    }
    if (product.outOfStock) {
      setDashboardMessage(`${product.name} · ${product.sizeLabel} is out of stock and was not added.`);
      return;
    }
    const existingQuantity = menuCart.find((line) => line.productId === productId)?.quantity ?? 0;
    if (product.maxQuantity !== null && isAtMenuQuantityLimit(existingQuantity, product.maxQuantity)) {
      setDashboardMessage(`${product.name} · ${product.sizeLabel}: ${menuQuantityLimitMessage(product.maxQuantity)}`);
      return;
    }
    if (blockedByStock(productId, existingQuantity + 1)) return;
    setMenuCart((current) => {
      const existing = current.find((line) => line.productId === productId);
      if (!menuTransactionReference) {
        setMenuTransactionReference(`SALE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
      }
      return existing
        ? current.map((line) => line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { productId, quantity: 1 }];
    });
  };

  const menuMaxQuantity = (productId: string) =>
    menuCatalog.find((item) => item.id === productId)?.maxQuantity ?? null;

  // Low-stock alert while adding orders: ingredients this order would leave at or below
  // their minimum level. Minimums come from the staff inventory, in the units the stock
  // check uses (the prepared batter in bottles).
  const menuStockWarnings = useMemo(() => {
    if (menuCart.length === 0 || !menuStock) return [];
    const minimums: Record<string, number> = {};
    for (const item of ingredients) minimums[item.id] = inventoryDisplayItem(item).minimumStock;
    return orderLowStockWarnings(menuCart, menuStock, minimums).map(lowStockWarningMessage);
  }, [menuCart, menuStock, ingredients]);

  /** ST-02 c6 (decision #11): refuse a quantity the branch stock cannot make, with the reason. */
  const blockedByStock = (productId: string, quantity: number) => {
    const shortage = orderStockShortage(withLineQuantity(menuCart, productId, quantity), menuStock);
    if (!shortage) return false;
    const product = menuCatalog.find((item) => item.id === productId);
    setDashboardMessage(stockShortageMessage(product ? `${product.name} · ${product.sizeLabel}` : 'This order', shortage));
    return true;
  };

  const changeMenuProductQuantity = (productId: string, change: 1 | -1) => {
    const maxQuantity = menuMaxQuantity(productId);
    if (change > 0) {
      const current = menuCart.find((line) => line.productId === productId)?.quantity ?? 0;
      if (blockedByStock(productId, current + 1)) return;
    }
    setMenuCart((current) => changeMenuCartQuantity(current, productId, change, maxQuantity));
  };

  const setMenuProductQuantity = (productId: string, quantity: number) => {
    const current = menuCart.find((line) => line.productId === productId)?.quantity ?? 0;
    if (quantity > current && blockedByStock(productId, quantity)) return;
    const maxQuantity = menuMaxQuantity(productId);
    if (maxQuantity !== null && quantity > maxQuantity) {
      setDashboardMessage(`Quantity set to the limit. ${menuQuantityLimitMessage(maxQuantity)}`);
    }
    setMenuCart((current) => setMenuCartQuantity(current, productId, quantity, maxQuantity));
  };

  const removeMenuProduct = (productId: string) => {
    setMenuCart((current) => {
      const next = current.filter((line) => line.productId !== productId);
      if (next.length === 0) setMenuTransactionReference(null);
      return next;
    });
  };

  useEffect(() => {
    setDraftOrderRestored(false);
    if (!draftOrderKey) return;
    let active = true;
    loadDraftOrder(AsyncStorage, draftOrderKey)
      .then((draft) => {
        if (!active || !draft) return;
        // Only restore into an empty order; never overwrite one already in progress.
        setMenuCart((current) => current.length > 0 ? current : draft.cart);
        setMenuSelectedAddonIds((current) => current.length > 0 ? current : draft.addonIds);
        setMenuTransactionReference((current) => current ?? draft.transactionReference);
        setDashboardMessage('Your unfinished order was restored. It has not been recorded as a sale.');
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setDraftOrderRestored(true);
      });
    return () => {
      active = false;
    };
  }, [draftOrderKey]);

  useEffect(() => {
    if (!draftOrderKey || !draftOrderRestored) return;
    saveDraftOrder(AsyncStorage, draftOrderKey, {
      cart: menuCart,
      addonIds: menuSelectedAddonIds,
      transactionReference: menuTransactionReference,
    }).catch(() => undefined);
  }, [draftOrderKey, draftOrderRestored, menuCart, menuSelectedAddonIds, menuTransactionReference]);

  const cancelMenuOrder = () => {
    setMenuCart([]);
    setMenuTransactionReference(null);
  };

  const submitMenuSale = async (
    input: Omit<SaleSubmission, 'branchId' | 'transactionReference'>,
  ) => {
    if (menuSaleSubmissionLock.current) return;
    if (!user?.branchId) {
      throw new Error('Your account does not have an assigned branch.');
    }
    menuSaleSubmissionLock.current = true;
    try {
      const transactionReference = menuTransactionReference
        ?? `SALE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      let sale: Awaited<ReturnType<typeof submitSale>>;
      try {
        sale = await submitSale({
          ...input,
          branchId: user.branchId,
          transactionReference,
        });
      } catch (error) {
        if (!isRetryableSaleSubmissionError(error)) throw error;
        try {
          const saved = await pendingSaleCheckoutStore.save({
            ...input,
            branchId: user.branchId,
            transactionReference,
            requestId: transactionReference,
            actorId: user.id,
            actorLabel: staffName,
            branchLabel: assignedBranch,
            createdAt: new Date().toISOString(),
          });
          setPendingSaleCheckouts(saved);
        } catch (storageError) {
          setDashboardMessage(storageError instanceof Error
            ? `${storageError.message} The checkout could not be saved for recovery.`
            : 'The checkout could not be saved for recovery.');
        }
        throw error;
      }
      setPendingSaleCheckouts(await pendingSaleCheckoutStore.resolve(transactionReference));
      setMenuCart([]);
      setMenuTransactionReference(null);
      await refreshBackendData();
      setMenuInventoryRetrySale(shouldOfferInventoryRetry(sale.inventory_processing_status)
        ? { id: sale.id, reference: sale.transaction_reference }
        : null);
      setDashboardMessage(getStaffSaleFeedback(sale.transaction_reference, sale.inventory_processing_status));
      showSaleCompleted(sale);
    } finally {
      menuSaleSubmissionLock.current = false;
    }
  };

  const retryPendingSaleCheckout = async (request: PendingSaleCheckout) => {
    if (!user.branchId || !canRetryPendingSaleCheckout(request, user.id, user.branchId)) return;
    if (pendingSaleCheckoutLocks.current.has(request.requestId)) return;
    pendingSaleCheckoutLocks.current.add(request.requestId);
    setPendingSaleCheckoutErrors((current) => {
      const next = { ...current };
      delete next[request.requestId];
      return next;
    });
    try {
      const sale = await submitSale({
        transactionReference: request.transactionReference,
        branchId: request.branchId,
        paymentMethod: request.paymentMethod,
        totalAmount: request.totalAmount,
        cashReceived: request.cashReceived ?? null,
        items: request.items,
        addons: request.addons,
      });
      setPendingSaleCheckouts(await pendingSaleCheckoutStore.resolve(request.requestId));
      setDashboardMessage(getStaffSaleFeedback(sale.transaction_reference, sale.inventory_processing_status));
      setMenuInventoryRetrySale(shouldOfferInventoryRetry(sale.inventory_processing_status)
        ? { id: sale.id, reference: sale.transaction_reference }
        : null);
      await refreshBackendData();
      showSaleCompleted(sale);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The checkout was rejected.';
      if (!isRetryableSaleSubmissionError(error)) {
        try {
          setPendingSaleCheckouts(await pendingSaleCheckoutStore.resolve(request.requestId));
          setPendingSaleCheckoutErrors((current) => ({
            ...current,
            [request.requestId]: message,
          }));
        } catch (storageError) {
          setPendingSaleCheckoutErrors((current) => ({
            ...current,
            [request.requestId]: `${message} The rejected checkout could not be removed from local recovery: ${
              storageError instanceof Error ? storageError.message : 'storage error'
            }`,
          }));
        }
        return;
      }
      setPendingSaleCheckoutErrors((current) => ({
        ...current,
        [request.requestId]: error instanceof Error
          ? `${error.message} The original checkout remains saved for retry.`
          : 'The original checkout remains saved for retry.',
      }));
    } finally {
      pendingSaleCheckoutLocks.current.delete(request.requestId);
    }
  };

  const retrySaleInventory = async (sale: Pick<UnresolvedSale, 'id' | 'transaction_reference'>) => {
    await runInventoryRetryOnce(sale.id, inventoryRetryLocks.current, async () => {
      setRetryingSaleIds((current) => new Set(current).add(sale.id));
      try {
        const result = await processSaleInventory(sale.id);
        await refreshBackendData();
        if (result.status === 'completed') {
          setDashboardMessage(`Sale ${sale.transaction_reference} inventory processing completed.`);
          setMenuInventoryRetrySale((current) => current?.id === sale.id ? null : current);
        } else {
          setDashboardMessage(`Sale ${sale.transaction_reference} was recorded but inventory processing failed again.`);
        }
      } catch (error) {
        setDashboardMessage(error instanceof Error ? error.message : 'Inventory processing could not be retried.');
        await refreshBackendData();
      } finally {
        setRetryingSaleIds((current) => {
          const next = new Set(current);
          next.delete(sale.id);
          return next;
        });
      }
    });
  };

  const retryMenuSaleInventory = async () => {
    if (!menuInventoryRetrySale) return;
    await retrySaleInventory({
      id: menuInventoryRetrySale.id,
      transaction_reference: menuInventoryRetrySale.reference,
    });
  };

  const showSaleCompleted = (sale: OwnerSale) => {
    setCompletedSale(completedSaleFrom(sale));
    setRoute('saleCompleted');
  };

  const openSaleReceipt = (saleId: string, returnRoute: 'menu' | 'dailySales' | 'saleCompleted' = 'menu') => {
    setSaleReceiptReturnRoute(returnRoute);
    setSelectedSaleReceiptId(saleId);
    setSaleReceipt(null);
    setSaleReceiptError('');
    setSaleReceiptShareError('');
    setSaleReceiptOutputNotice('');
    setRoute('saleReceipt');
  };

  useEffect(() => {
    if (route !== 'saleReceipt' || !selectedSaleReceiptId) return;
    let active = true;
    if (!user?.branchId) {
      setSaleReceiptError('Your account does not have an assigned branch.');
      return () => {
        active = false;
      };
    }
    setSaleReceiptLoading(true);
    setSaleReceiptError('');
    loadStaffSaleReceipt(selectedSaleReceiptId, user.branchId)
      .then((receipt) => {
        if (active) setSaleReceipt(receipt);
      })
      .catch((error: unknown) => {
        if (active) setSaleReceiptError(error instanceof Error ? error.message : 'Unable to load the recorded sale receipt.');
      })
      .finally(() => {
        if (active) setSaleReceiptLoading(false);
      });
    return () => {
      active = false;
    };
  }, [route, selectedSaleReceiptId, user?.branchId]);

  const saleVoidLookupKey = [
    ...recentSales.map((sale) => sale.id),
    ...dailySalesReceipts.map((sale) => sale.id),
    saleReceipt?.id ?? '',
  ].join(',');
  useEffect(() => {
    // Reload whenever the receipt or Daily Sales opens, so an owner decision shows up.
    if (route !== 'saleReceipt' && route !== 'dailySales') return;
    const saleIds = saleVoidLookupKey.split(',').filter(Boolean);
    if (!saleIds.length) return;
    let active = true;
    loadSaleVoidRequests(saleIds)
      .then(({ supported, requests }) => {
        if (!active) return;
        setSaleVoidSupported(supported);
        setSaleVoidRequests(requests);
      })
      .catch(() => {
        // The receipt and sale list still work without void information.
        if (active) setSaleVoidRequests([]);
      });
    return () => {
      active = false;
    };
  }, [saleVoidLookupKey, route, dailySalesRefreshKey]);

  useEffect(() => {
    // Reload whenever the history or a transaction opens, so an owner decision shows up.
    if (route !== 'stockHistory' && route !== 'transactionDetails') return;
    const branchId = user?.branchId;
    if (!branchId) return;
    let active = true;
    loadBranchEntryReversalRequests(branchId)
      .then(({ supported, requests }) => {
        if (!active) return;
        setEntryReversalSupported(supported);
        setEntryReversalRequests(requests);
      })
      .catch(() => {
        // The history still works without reversal information.
        if (active) setEntryReversalRequests([]);
      });
    return () => {
      active = false;
    };
  }, [route, user?.branchId]);

  const submitSaleVoid = async (reason: string, clientRequestId: string) => {
    if (!saleReceipt) return;
    const saved = await voidSale({ saleId: saleReceipt.id, reason, clientRequestId });
    setSaleVoidRequests((current) => [saved, ...current.filter((request) => request.id !== saved.id)]);
    // The void is immediate: the open receipt shows VOID without a reload.
    setSaleReceipt((current) => (current && current.id === saved.saleId ? { ...current, saleStatus: 'voided', isVoided: true } : current));
    setSaleVoidModalVisible(false);
  };

  // ST-05 c7: print or download the receipt as a PDF, rendered from the saved sale.
  const outputSaleReceipt = async (kind: 'print' | 'pdf') => {
    if (!saleReceipt || saleReceiptOutputBusy) return;
    setSaleReceiptShareError('');
    setSaleReceiptOutputNotice('');
    setSaleReceiptOutputBusy(kind);
    try {
      if (kind === 'print') {
        await printSaleReceipt(saleReceipt);
      } else if (await downloadSaleReceiptPdf(saleReceipt) === 'downloaded') {
        setSaleReceiptOutputNotice(`Downloaded ${saleReceiptFileName(saleReceipt)}.`);
      }
    } catch (error) {
      setSaleReceiptShareError(error instanceof Error ? error.message : 'Unable to create this receipt. Please try again.');
    } finally {
      setSaleReceiptOutputBusy(null);
    }
  };

  const submitBatterPreparation = async () => {
    if (batterPreparationSubmissionLock.current || batterPreparationSubmitting) return;
    const batchReference = batterBatchReference.trim();
    if (!user?.branchId) {
      setBatterPreparationError('Your account does not have an assigned branch.');
      return;
    }
    batterPreparationSubmissionLock.current = true;
    setBatterPreparationSubmitting(true);
    setBatterPreparationError('');
    try {
      const batch = await prepareBatterBatch(
        user.branchId,
        batchReference,
        batterPreparationDate,
      );
      setBatterPreparationVisible(false);
      setBatterConfirmationVisible(false);
      setBatterBatchReference('');
      const recordedMessage = `Batter batch ${batch.batch_reference} is recorded: ${PREPARED_BATTER_BATCH_BOTTLES} prepared batter bottles added.`;
      setDashboardMessage(recordedMessage);
      setBatterPreparationNotice(recordedMessage);
      await refreshDashboardData();
    } catch (error) {
      setBatterPreparationError(error instanceof Error ? error.message : 'Unable to prepare the batter batch.');
    } finally {
      batterPreparationSubmissionLock.current = false;
      setBatterPreparationSubmitting(false);
    }
  };

  const requestBatterPreparation = () => {
    if (!user?.branchId) {
      setBatterPreparationError('Your account does not have an assigned branch.');
      return;
    }
    setBatterPreparationError('');
    setBatterPreparationNotice('');
    const recipe = sharedRecipes.find((entry) =>
      entry.recipe_code === 'shared-batter' || entry.name.toLowerCase().includes('batter'),
    );
    if (recipe) {
      const shortages = findBatterShortages(
        recipe,
        new Map(ingredients.map((item) => [item.id, { name: item.name, unit: item.unit, quantity: item.quantity }])),
      );
      if (shortages.length > 0) {
        setBatterPreparationError(formatBatterShortages(shortages));
        return;
      }
    }
    setBatterConfirmationVisible(true);
  };

  const openIngredientDetails = (item: Ingredient) => {
    setSelectedIngredientId(item.id);
    setIngredientDetailReturnRoute('inventory');
    setRoute('ingredientDetails');
  };

  const startDailyInventoryCheck = async () => {
    if (dailyCheckStarting) return;
    if (!user?.branchId) {
      setBackendError('Your account does not have an assigned branch.');
      return;
    }
    setFormError('');
    setDailyCheckSaveFailed(false);
    setDailyCheckStarting(true);
    setBackendError('');
    try {
      const currentInventory = await loadInventory(user.branchId, manilaBusinessDate());
      applyInventorySnapshot(currentInventory, user.branchId);
      const lines = currentInventory.items
        .filter((item) => item.hasBranchInventory)
        .map((item) => {
          // Batter is displayed in ml but stored and validated in whole bottles.
          const basis = getDailyCountBasis(item);
          return {
            ingredientId: item.id,
            name: item.name,
            recordedQuantity: basis.recordedQuantity,
            inventoryRevision: item.inventoryRevision,
            physicalQuantity: '',
            unit: basis.unit,
            precision: basis.precision,
          };
        });
      const draft = await loadStaffDailyStockCheckDraft(user.branchId);
      const draftLines = draft?.lines ?? [];
      const startingLines = lines.map((line) => {
        const savedLine = draftLines.find((entry) => entry.ingredientId === line.ingredientId);
        return savedLine && savedLine.recordedQuantity === line.recordedQuantity && savedLine.inventoryRevision === line.inventoryRevision
          ? { ...line, physicalQuantity: savedLine.physicalQuantity }
          : line;
      });
      setDailyCheckLines(startingLines);
      setDailyCheckSavedSnapshot(countEntriesSnapshot(startingLines, draft?.remarks ?? '', draft?.verified ?? false));
      setDailyCheckLeaveTarget(null);
      setDailyCheckLeavePromptVisible(false);
      setDailyCheckSearch('');
      setDailyCheckRemarks(draft?.remarks ?? '');
      setDailyCheckVerified(draft?.verified ?? false);
      setDailyCheckDraftId(draft?.draftId ?? null);
      setDailyCheckDraftMessage(draft ? 'Draft loaded. Continue editing until submitted.' : '');
      setDailyCheckStartedAt(new Date());
      setDailyCheckAttempted(false);
      setDailyCheckModal(null);
      setCurrentDailyCheck(null);
      setDailyCheckSubmissionRequest(null);
      dailyCheckSubmissionLock.current = false;
      setRoute('dailyInventoryOverview');
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : 'Unable to refresh stock before the count begins.');
    } finally {
      setDailyCheckStarting(false);
    }
  };

  const validateDailyInventoryCheck = () => {
    setDailyCheckAttempted(true);
    if (!dailyCheckValid) {
      setFormError('Correct the highlighted quantities before continuing.');
      return false;
    }
    if (!dailyCheckVerified) {
      setFormError('Verify the physical count before continuing.');
      return false;
    }
    return true;
  };

  /** Saves the count as a draft. Returns true when it was saved. */
  const saveDailyInventoryDraft = async (): Promise<boolean> => {
    if (dailyCheckDraftSaving || !user.branchId || dailyCheckLines.length === 0) return false;
    setDailyCheckDraftSaving(true);
    setFormError('');
    try {
      const draftId = dailyCheckDraftId ?? crypto.randomUUID();
      const lines: StaffDailyStockCheckDraftLine[] = dailyCheckLines.map((line) => ({
        ingredientId: line.ingredientId,
        recordedQuantity: line.recordedQuantity,
        inventoryRevision: line.inventoryRevision,
        physicalQuantity: line.physicalQuantity,
        unit: line.unit,
      }));
      const saved = await saveStaffDailyStockCheckDraft({
        draftId,
        branchId: user.branchId,
        checkDate: formatLocalIsoDate(manilaBusinessDate()),
        remarks: dailyCheckRemarks.trim(),
        verified: dailyCheckVerified,
        lines,
      });
      setDailyCheckDraftId(saved.draftId);
      setDailyCheckSavedSnapshot(countEntriesSnapshot(dailyCheckLines, dailyCheckRemarks, dailyCheckVerified));
      // Blind count (ST-12 c2): nothing about the expected quantity is said before submission.
      setDailyCheckDraftMessage('Draft saved. You can keep editing it until you submit.');
      return true;
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save the count draft.');
      return false;
    } finally {
      setDailyCheckDraftSaving(false);
    }
  };

  const leaveDailyInventoryCheck = () => {
    const target = dailyCheckLeaveTarget ?? staffReturnTab(navigationOrigin, 'inventory');
    setDailyCheckLeavePromptVisible(false);
    setDailyCheckLeaveTarget(null);
    setDailyCheckModal(null);
    setLogoutConfirmationVisible(false);
    setRoute(target);
    setDashboardMessage('');
  };

  const saveDraftAndLeaveDailyInventoryCheck = async () => {
    if (await saveDailyInventoryDraft()) leaveDailyInventoryCheck();
    else setDailyCheckLeavePromptVisible(false);
  };

  const openDailyCheckReview = () => {
    if (!validateDailyInventoryCheck()) return;
    setDailyCheckModal('review');
  };

  const submitDailyInventoryCheck = async () => {
    if (!validateDailyInventoryCheck()) return;
    const branchId = user?.branchId;
    if (!branchId) {
      setFormError('Your account does not have an assigned branch. Contact the owner.');
      return;
    }
    await runDiscrepancySubmissionOnce(dailyCheckSubmissionLock, async () => {
      setDailyCheckSubmitting(true);
      setFormError('');
      setDailyCheckSaveFailed(false);
      setDailyCheckLeavePromptVisible(false);
      const checkDate = manilaBusinessDate();
      const lines = dailyCheckLines.map((line) => {
        const physicalQuantity = Number(line.physicalQuantity);
        return {
          ingredientId: line.ingredientId,
          name: line.name,
          recordedQuantity: line.recordedQuantity,
          inventoryRevision: line.inventoryRevision,
          physicalQuantity,
          difference: roundDailyQuantity(physicalQuantity - line.recordedQuantity, line.unit, line.precision),
          unit: line.unit,
        };
      });
      const request: PendingDailyStockCheck = {
        requestId: crypto.randomUUID(),
        actorId: user.id,
        branchId,
        checkDate: formatLocalIsoDate(checkDate),
        remarks: dailyCheckRemarks.trim(),
        lines: lines.map((line) => ({
          ingredientId: line.ingredientId,
          recordedQuantity: line.recordedQuantity,
          inventoryRevision: line.inventoryRevision,
          physicalQuantity: line.physicalQuantity,
          unit: line.unit,
        })),
        createdAt: new Date().toISOString(),
      };
      setDailyCheckSubmissionRequest(request);
      try {
        setPendingDailyStockChecks(await pendingDailyStockCheckStore.save(request));
        await retryDailyStockCheck(request);
        if (dailyCheckDraftId && user.branchId) {
          try {
            await deleteStaffDailyStockCheckDraft(dailyCheckDraftId, user.branchId);
            setDailyCheckDraftId(null);
          } catch {
            setDailyCheckDraftMessage('Count submitted. The saved draft will be replaced the next time a draft is saved.');
          }
        }
      } catch (error) {
        setDailyCheckModal(null);
        setFormError(error instanceof Error
          ? error.message
          : 'Unable to save. Please check your internet connection and try again.');
        setDailyCheckSaveFailed(true);
      } finally {
        setDailyCheckSubmitting(false);
      }
    });
  };

  const saveOrRetryDailyInventoryCheck = async () => {
    const savedRequest = dailyCheckSubmissionRequest;
    if (!dailyCheckSaveFailed || !savedRequest) {
      await submitDailyInventoryCheck();
      return;
    }
    if (!user.branchId || savedRequest.actorId !== user.id || savedRequest.branchId !== user.branchId) {
      setFormError('This saved count belongs to a different Staff account or branch.');
      return;
    }
    await runDiscrepancySubmissionOnce(dailyCheckSubmissionLock, async () => {
      setDailyCheckSubmitting(true);
      setFormError('');
      setDailyCheckSaveFailed(false);
      setDailyCheckLeavePromptVisible(false);
      try {
        setPendingDailyStockChecks(await pendingDailyStockCheckStore.save(savedRequest));
        await retryDailyStockCheck(savedRequest);
      } catch {
        setFormError('Unable to save. Please check your internet connection and try again.');
        setDailyCheckSaveFailed(true);
      } finally {
        setDailyCheckSubmitting(false);
      }
    });
  };

  const submitCountCorrectionRequest = async () => {
    if (countCorrectionSubmissionLock.current || correctionSubmitting) return;
    const record = inventoryReportData?.physicalCounts.find(
      (count) => count.id === selectedCorrectionCountLineId,
    );
    if (!record || record.submittedBy !== user.id || !user.branchId) {
      setCorrectionFormError('This count cannot be corrected from the current Staff account or branch.');
      return;
    }
    const correctedActualQuantity = Number(correctionActualQuantity);
    if (!correctionActualQuantity.trim() || !Number.isFinite(correctedActualQuantity) || correctedActualQuantity < 0) {
      setCorrectionFormError('Enter a corrected quantity of zero or greater.');
      return;
    }
    const decimalPlaces = correctionActualQuantity.trim().split('.')[1]?.length ?? 0;
    if (decimalPlaces > record.quantityPrecision) {
      setCorrectionFormError(`This ingredient allows at most ${record.quantityPrecision} decimal places.`);
      return;
    }
    const reason = correctionReason.trim();
    if (!reason || reason.length > 1000) {
      setCorrectionFormError('Enter a correction reason of 1 to 1000 characters.');
      return;
    }
    if (record.validation || record.correctionRequests.some((request) => request.status === 'pending')) {
      setCorrectionFormError('A correction is already pending or this count has been validated.');
      return;
    }

    countCorrectionSubmissionLock.current = true;
    setCorrectionSubmitting(true);
    setCorrectionFormError('');
    setCountCorrectionMessages((current) => {
      const next = { ...current };
      delete next[record.id];
      return next;
    });
    const request: PendingInventoryCountCorrection = {
      requestId: crypto.randomUUID(),
      actorId: user.id,
      branchId: user.branchId,
      countLineId: record.id,
      correctedActualQuantity,
      reason,
      createdAt: new Date().toISOString(),
    };
    try {
      setPendingCountCorrections(await pendingInventoryCountCorrectionStore.save(request));
      setSelectedCorrectionCountLineId(null);
      setCorrectionActualQuantity('');
      setCorrectionReason('');
      await retryCountCorrectionRequest(request);
    } catch (error) {
      setCorrectionFormError(error instanceof Error
        ? error.message
        : 'Unable to save the count correction request for retry.');
    } finally {
      countCorrectionSubmissionLock.current = false;
      setCorrectionSubmitting(false);
    }
  };

  const openForm = (
    formRoute: 'stockIn' | 'stockOut' | 'waste',
    source: StaffTab,
  ) => {
    wasteReviewGeneration.current += 1;
    setReturnRoute(source);
    setSelectedIngredientId('');
    setStockInIngredientSearch('');
    setIngredientListOpen(false);
    setQuantity('');
    setStockInFieldErrors({});
    setStockInValidationAttempted(false);
    setStockOutFieldErrors({});
    setStockOutValidationAttempted(false);
    setUsageMode('manual');
    setBatchPresetOpen(false);
    setBatchCount('1');
    setTransactionDate(manilaBusinessDate());
    setExpirationDate(null);
    setReason(formRoute === 'waste' || formRoute === 'stockOut' ? '' : 'Cooking usage');
    setReasonListOpen(false);
    setNotes('');
    setWasteFieldErrors({});
    setWasteValidationAttempted(false);
    setWasteIngredientSearch('');
    setSuccessMessage('');
    setFormError('');
    setQuantityError('');
    setCurrentWasteReceipt(null);
    setCurrentStockInReceipt(null);
    setCurrentUsageReceipt(null);
    setConfirmationVisible(false);
    setStockOutAlert(null);
    setRoute(formRoute);
  };

  const returnFromForm = () => {
    wasteReviewGeneration.current += 1;
    setIngredientListOpen(false);
    setConfirmationVisible(false);
    setRoute(returnRoute);
    setSuccessMessage('');
    setFormError('');
  };

  const changeQuantity = (value: string) => {
    setQuantity(value);
    setSuccessMessage('');
    setFormError('');
    if (route === 'stockIn' && stockInValidationAttempted) {
      updateStockInValidation({ quantityValue: value });
      return;
    }
    if (route === 'stockOut') {
      const validationErrors = validateStockOutValues({ quantityValue: value });
      setQuantityError(validationErrors.quantity ?? '');
      if (stockOutValidationAttempted) updateStockOutValidation({ quantityValue: value });
      return;
    }
    const parsedValue = Number(value);
    if (
      quantityError &&
      value.trim() !== '' &&
      Number.isFinite(parsedValue) &&
      parsedValue > 0 &&
      (!selectedIngredient || parsedValue <= selectedIngredient.quantity)
    ) {
      setQuantityError('');
    }
  };

  const getWasteValidation = ({
    inventory = ingredients,
    ingredientId = selectedIngredientId,
    quantityValue = quantity,
    dateValue = transactionDate,
    reasonValue = reason,
    checkAvailableStock = true,
  }: {
    inventory?: Ingredient[];
    ingredientId?: string;
    quantityValue?: string;
    dateValue?: Date | null;
    reasonValue?: string;
    checkAvailableStock?: boolean;
  } = {}) => validateWasteFields({
    ingredient: inventory.find((item) => item.id === ingredientId) ?? null,
    quantityValue,
    date: dateValue,
    reason: reasonValue,
    allowedReasons: wasteReasons,
    checkAvailableStock,
  });

  const validateWasteForm = (inventory = ingredients) => {
    const { errors, summary } = getWasteValidation({ inventory });
    setWasteValidationAttempted(true);
    setWasteFieldErrors(errors);
    setFormError(summary);
    return Object.keys(errors).length === 0;
  };

  const updateWasteValidation = (values: Parameters<typeof getWasteValidation>[0]) => {
    if (!wasteValidationAttempted) return;
    const { errors, summary } = getWasteValidation(values);
    setWasteFieldErrors(errors);
    setFormError(summary);
  };

  const changeWasteQuantity = (value: string) => {
    const precision = selectedIngredient?.quantityPrecision ?? 3;
    if (value && !/^\d*\.?\d*$/.test(value)) return;
    if (precision === 0 && value.includes('.')) return;
    const fraction = value.split('.')[1];
    if (fraction && fraction.length > precision) return;
    wasteReviewGeneration.current += 1;
    setQuantity(value);
    setSuccessMessage('');
    if (wasteValidationAttempted) updateWasteValidation({ quantityValue: value });
  };

  const validateTransaction = () => {
    setSuccessMessage('');
    setFormError('');
    if (route === 'stockIn') {
      const { errors, summary } = getStockInValidation();
      setStockInValidationAttempted(true);
      setStockInFieldErrors(errors as Record<string, string>);
      if (Object.keys(errors).length > 0) {
        setFormError(summary);
        return false;
      }
      return true;
    }
    if (route === 'stockOut') {
      setStockOutValidationAttempted(true);
      if (usageMode === 'manual') {
        const { errors, summary } = getStockOutValidation();
        setStockOutFieldErrors(errors as Record<string, string>);
        setQuantityError(errors.quantity ?? '');
        if (Object.keys(errors).length > 0) {
          setFormError(summary);
          return false;
        }
        return true;
      }

      const batchValidation = getStockOutValidation({ validateIngredientAndQuantity: false });
      setStockOutFieldErrors(batchValidation.errors as Record<string, string>);
      if (Object.keys(batchValidation.errors).length > 0) {
        setFormError(batchValidation.summary);
        return false;
      }
      if (!Number.isFinite(parsedBatchCount) || parsedBatchCount <= 0) {
        setFormError('Enter a batch count greater than 0.');
        return false;
      }
      const unavailableDeduction = usageDeductions.find((deduction) => deduction.quantity > deduction.previousQuantity);
      if (unavailableDeduction) {
        const ingredient = ingredients.find((item) => item.id === unavailableDeduction.ingredientId);
        setFormError(formatInsufficientStockMessage({
          ingredientId: unavailableDeduction.ingredientId,
          name: ingredient?.name ?? 'Ingredient',
          unit: ingredient?.unit ?? '',
          required: unavailableDeduction.quantity,
          available: unavailableDeduction.previousQuantity,
          shortage: unavailableDeduction.quantity - unavailableDeduction.previousQuantity,
        }));
        return false;
      }
      return true;
    }
    const parsedQuantity = Number(quantity);
    if (!selectedIngredient) {
      setFormError('Choose an ingredient to continue.');
      return false;
    }
    if (!quantity.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setQuantityError('Enter a quantity greater than 0.');
      return false;
    }
    setQuantityError('');
    if (!transactionDate) {
      setFormError('Choose a transaction date.');
      return false;
    }
    if (route === 'waste' && parsedQuantity > selectedIngredient.quantity) {
      setFormError(formatInsufficientStockMessage({
        ingredientId: selectedIngredient.id,
        name: selectedIngredient.name,
        unit: selectedIngredient.unit,
        required: parsedQuantity,
        available: selectedIngredient.quantity,
        shortage: parsedQuantity - selectedIngredient.quantity,
      }));
      return false;
    }
    return true;
  };

  const reviewTransaction = async () => {
    setSuccessMessage('');
    if (route === 'waste') {
      if (!user?.branchId) {
        setFormError('Your account does not have an assigned branch. Contact the owner.');
        return;
      }
      const requiredFields = getWasteValidation({ checkAvailableStock: false });
      setWasteValidationAttempted(true);
      setWasteFieldErrors(requiredFields.errors);
      if (Object.keys(requiredFields.errors).length > 0) {
        setFormError(requiredFields.summary);
        return;
      }
      setFormError('');
      const requestGeneration = ++wasteReviewGeneration.current;
      try {
        const latestInventory = await loadInventory(user.branchId, manilaBusinessDate());
        if (requestGeneration !== wasteReviewGeneration.current || routeRef.current !== 'waste') return;
        applyInventorySnapshot(latestInventory, user.branchId);
        if (!validateWasteForm(latestInventory.items)) return;
      } catch (error) {
        if (requestGeneration !== wasteReviewGeneration.current || routeRef.current !== 'waste') return;
        setFormError(error instanceof Error ? error.message : 'Unable to refresh available stock.');
        return;
      }
      setConfirmationVisible(true);
      return;
    }
    if (!validateTransaction()) return;
    if (route === 'stockOut') {
      setConfirmationVisible(true);
      return;
    }
    setConfirmationVisible(true);
  };

  const confirmTransaction = async () => {
    if (confirming || movementSubmissionLock.current || !transactionDate) return;
    if (route === 'waste') {
      if (wasteSubmissionLock.current) return;
      if (!validateWasteForm() || !selectedIngredient || !transactionDate) return;
      const wasteReason = wasteReasons.find((option) => option === reason);
      if (!wasteReason) {
        setWasteFieldErrors((current) => ({ ...current, reason: 'Reason is required.' }));
        return;
      }

      wasteSubmissionLock.current = true;
      setConfirming(true);
      try {
        const wasteQuantity = Number(quantity);
        const receiptDate = transactionDate;
        if (!user?.branchId) throw new Error('Your account does not have an assigned branch.');
        const storedWaste = toStoredTransactionUnit(selectedIngredient, wasteQuantity);
        const saved = await submitNewInventoryRequest(wasteReason === 'Spoilage' ? 'spoilage' : 'waste', [{
          ingredientId: selectedIngredient.id,
          type: wasteReason === 'Spoilage' ? 'spoilage' : 'waste',
          quantity: storedWaste.quantity,
          unit: storedWaste.unit,
          transactionDate: manilaMidnightTimestamp(receiptDate),
          reason: wasteReason,
          notes: notes.trim(),
          batchReference: null,
          expirationDate: null,
        }]);
        const reference = saved[0]?.reference;
        if (!reference) throw new Error('The saved waste record did not return a transaction reference.');
        const previousQuantity = Number(saved[0].before_quantity);
        const newQuantity = Number(saved[0].after_quantity);
        const receipt: WasteReceipt = {
          reference,
          ingredientId: selectedIngredient.id,
          quantity: wasteQuantity,
          previousQuantity,
          newQuantity,
          transactionDate: receiptDate,
          reason: wasteReason,
          notes: notes.trim(),
        };
        await refreshBackendData();
        setCurrentWasteReceipt(receipt);
        setConfirmationVisible(false);
        setQuantity('');
        setTransactionDate(manilaBusinessDate());
        setReason('');
        setNotes('');
        setWasteFieldErrors({});
        setWasteValidationAttempted(false);
        setFormError('');
        setSuccessMessage('Waste record saved successfully.');
        setRoute('wasteSuccess');
      } catch (error) {
        setConfirmationVisible(false);
        const message = error instanceof Error ? error.message : 'Unable to save the waste record.';
        if (/exceeds available stock|insufficient stock/i.test(message)) {
          const exceedsMessage = /insufficient stock/i.test(message)
            ? message
            : 'This quantity is more than the stock now available (it changed while you were reviewing). Check the updated stock and enter a smaller quantity.';
          setWasteFieldErrors((current) => ({ ...current, quantity: exceedsMessage }));
          setWasteValidationAttempted(true);
          setFormError(exceedsMessage);
          await refreshBackendData();
        } else {
          setFormError(message);
        }
      } finally {
        setConfirming(false);
        wasteSubmissionLock.current = false;
      }
      return;
    }

    if (route === 'usagePreview' || route === 'stockOut') {
      if (
        usageDeductions.length === 0 ||
        usageDeductions.some((deduction) =>
          !Number.isFinite(deduction.quantity) ||
          deduction.quantity <= 0 ||
          deduction.quantity > deduction.previousQuantity,
        )
      ) {
        setConfirmationVisible(false);
        setRoute('stockOut');
        setQuantityError('Quantity used exceeds the available stock.');
        return;
      }

      setConfirming(true);
      movementSubmissionLock.current = true;
      try {
        const receiptDate = transactionDate;
        const draftDeductions = usageDeductions.map((deduction) => ({ ...deduction }));
        if (!user?.branchId) throw new Error('Your account does not have an assigned branch.');
        const inventoryType = usageMode === 'cookingBatch' ? 'usage' : 'stock_out';
        const saved = await submitNewInventoryRequest(inventoryType, draftDeductions.map((deduction) => {
          const ingredient = ingredients.find((item) => item.id === deduction.ingredientId);
          if (!ingredient) throw new Error('An inventory item in this transaction is no longer available.');
          const stored = toStoredTransactionUnit(ingredient, deduction.quantity);
          return {
            ingredientId: deduction.ingredientId,
            type: inventoryType,
            quantity: stored.quantity,
            unit: stored.unit,
            transactionDate: manilaMidnightTimestamp(receiptDate),
            reason,
            notes,
            batchReference: null,
            expirationDate: null,
          };
        }));
        const reference = saved[0]?.reference;
        if (!reference) throw new Error('The saved stock-out did not return a transaction reference.');
        const deductions = draftDeductions.map((deduction, index) => {
          const transaction = saved[index];
          if (!transaction) throw new Error('The saved stock-out returned incomplete ingredient details.');
          return {
            ...deduction,
            previousQuantity: Number(transaction.before_quantity),
            newQuantity: Number(transaction.after_quantity),
          };
        });
        const receipt: UsageReceipt = {
          reference,
          deductions,
          transactionDate: receiptDate,
          reason,
          notes,
          mode: usageMode,
          batchPreset: usageMode === 'cookingBatch' ? batchPreset : null,
          batchCount: usageMode === 'cookingBatch' ? parsedBatchCount : 1,
        };
        const alertDeduction = deductions.find((deduction) => {
          const ingredient = ingredients.find((item) => item.id === deduction.ingredientId);
          return ingredient !== undefined && (
            classifyStockLevel(deduction.newQuantity, stockThresholdOf(ingredient)) !== 'In Stock'
          );
        });
        const alertIngredient = alertDeduction
          ? ingredients.find((item) => item.id === alertDeduction.ingredientId)
          : undefined;
        setStockOutAlert(alertDeduction && alertIngredient ? {
          ingredientId: alertIngredient.id,
          remainingQuantity: alertDeduction.newQuantity,
          minimumStock: alertIngredient.minimumStock,
          outOfStock: alertDeduction.newQuantity <= 0,
        } : null);
        await refreshBackendData();
        setCurrentUsageReceipt(receipt);
        setConfirmationVisible(false);
        setRoute('stockOutSuccess');
      } catch (error) {
        setConfirmationVisible(false);
        setFormError(error instanceof Error ? error.message : 'Unable to save the stock-out.');
      } finally {
        movementSubmissionLock.current = false;
        setConfirming(false);
      }
      return;
    }

    if (!selectedIngredient) return;
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setQuantityError('Enter a quantity greater than 0.');
      setConfirmationVisible(false);
      return;
    }

    setConfirming(true);
    movementSubmissionLock.current = true;
    try {
      if (route !== 'stockIn') throw new Error('This transaction type is not supported on this screen.');
      if (!user?.branchId) throw new Error('Your account does not have an assigned branch.');
      const storedStockIn = toStoredTransactionUnit(selectedIngredient, parsedQuantity);
      const saved = await submitNewInventoryRequest('stock_in', [{
        ingredientId: selectedIngredient.id,
        type: 'stock_in',
        quantity: storedStockIn.quantity,
        unit: storedStockIn.unit,
        transactionDate: formatLocalIsoDate(transactionDate),
        reason: 'Stock-In',
        notes: notes.trim(),
        batchReference: null,
        expirationDate: expirationDate ? formatLocalIsoDate(expirationDate) : null,
      }]);
      const savedTransaction = saved[0];
      if (!savedTransaction) throw new Error('The saved stock-in returned incomplete details.');
      if (!savedTransaction.reference) throw new Error('The saved stock-in did not return a transaction reference.');
      const stockInReceipt: StockInReceipt = {
        reference: savedTransaction.reference,
        ingredientId: selectedIngredient.id,
        quantity: parsedQuantity,
        previousQuantity: Number(savedTransaction.before_quantity),
        newQuantity: Number(savedTransaction.after_quantity),
        transactionDate,
        expirationDate,
        notes: notes.trim(),
      };
      await refreshBackendData();
      setConfirmationVisible(false);
      setQuantityError('');
      setSelectedIngredientId('');
      setQuantity('');
      setExpirationDate(null);
      setNotes('');
      setTransactionDate(manilaBusinessDate());
      setStockInFieldErrors({});
      setStockInValidationAttempted(false);
      setCurrentStockInReceipt(stockInReceipt);
      setSuccessMessage('Expected stock and low-stock alerts updated.');
      setStockAlertsUpdated(true);
      setRoute('stockInSuccess');
    } catch (error) {
      setConfirmationVisible(false);
      setFormError(error instanceof Error ? error.message : 'Unable to save the stock-in.');
    } finally {
      movementSubmissionLock.current = false;
      setConfirming(false);
    }
  };

  const renderInventoryRecoveryControls = (type: RetrySafeInventoryTransaction['type']) => {
    const request = pendingInventoryTransactions.find((entry) =>
      entry.requestId === lastPendingInventoryRequestId &&
      sameInventoryTransactionWorkflow(entry.transactionType, type),
    );
    if (!request) return null;
    const retryable = canRetryPendingInventoryTransaction(request, user.id, user.branchId ?? '');
    const requestError = pendingInventoryRequestErrors[request.requestId] ?? '';
    const isConflict = requestError.toLowerCase().includes('different transaction payload');
    return (
      <View style={styles.inventoryRecoveryActions}>
        {requestError !== '' ? (
          <Text style={styles.inventoryRecoveryMessage} accessibilityRole="alert">{requestError}</Text>
        ) : null}
        {retryable && !isConflict ? (
          <Pressable
            accessibilityRole="button"
            disabled={pendingInventoryRetryingIds.has(request.requestId)}
            onPress={() => void retryPendingInventoryRequest(request)}
            style={({ pressed }) => [
              styles.inventoryRetryAction,
              pressed && styles.pressed,
              pendingInventoryRetryingIds.has(request.requestId) && styles.inventoryRetryDisabled,
            ]}
          >
            <Text style={styles.inventoryRetryActionText}>
              {pendingInventoryRetryingIds.has(request.requestId) ? 'Retrying…' : 'Retry saved transaction'}
            </Text>
          </Pressable>
        ) : null}
        {retryable && !isConflict ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setForceNewInventoryRequestFor(request.requestId);
              setFormError('The unresolved request is preserved. Confirm again to create a separate transaction with a new request ID.');
            }}
            style={({ pressed }) => [styles.inventorySeparateAction, pressed && styles.pressed]}
          >
            <Text style={styles.inventorySeparateActionText}>Create as a separate transaction</Text>
          </Pressable>
        ) : null}
        {!retryable ? (
          <Text style={styles.inventoryRecoveryMessage}>
            This request belongs to {request.actorLabel} at {request.branchLabel}. Sign in to that account and branch to retry it.
          </Text>
        ) : null}
        {isConflict ? (
          <Text style={styles.inventoryRecoveryMessage}>
            The saved request key conflicts with a different payload. The original request is preserved; do not retry an edited transaction with this key.
          </Text>
        ) : null}
      </View>
    );
  };

  const renderPendingInventoryRequests = () => {
    if (pendingInventoryTransactionsLoading) {
      return <Text style={styles.emptyState}>Loading saved inventory recovery requests…</Text>;
    }
    if (pendingInventoryStorageError !== '') {
      return (
        <View style={styles.stockInErrorBanner} accessibilityRole="alert">
          <Text style={styles.stockInErrorIcon}>!</Text>
          <Text style={styles.stockInErrorText}>{pendingInventoryStorageError}</Text>
        </View>
      );
    }
    if (pendingInventoryTransactions.length === 0) return null;
    return (
      <View style={styles.unresolvedSalesList}>
        {pendingInventoryTransactions.map((request) => {
          const canRetry = canRetryPendingInventoryTransaction(request, user.id, user.branchId ?? '');
          const retrying = pendingInventoryRetryingIds.has(request.requestId);
          const conflict = (pendingInventoryRequestErrors[request.requestId] ?? '')
            .toLowerCase()
            .includes('different transaction payload');
          const transactionLines = request.transactions.map((transaction) => {
            const item = ingredients.find((entry) => entry.id === transaction.ingredientId);
            return `${item?.name ?? transaction.ingredientId} · ${transaction.type === 'stock_in' ? '+' : '−'}${transaction.quantity} ${transaction.unit}`;
          });
          return (
            <View key={request.requestId} style={styles.unresolvedSaleRow}>
              <View style={styles.unresolvedSaleCopy}>
                <Text style={styles.unresolvedSaleReference}>
                  {request.transactionType.replace('_', ' ')} · {transactionLines.join(', ')}
                </Text>
                <Text style={styles.unresolvedSaleDate}>
                  Saved {new Date(request.createdAt).toLocaleString('en-PH')}
                  {request.reference ? ` · ${request.reference}` : ''}
                </Text>
                <Text style={styles.unresolvedSaleStatus}>
                  {canRetry ? 'Confirmation not received' : `Saved for ${request.actorLabel} · ${request.branchLabel}`}
                </Text>
                {pendingInventoryRequestErrors[request.requestId] ? (
                  <Text style={styles.inventoryRecoveryMessage}>
                    {pendingInventoryRequestErrors[request.requestId]}
                  </Text>
                ) : null}
              </View>
              {canRetry && !conflict ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Retry saved ${request.transactionType.replace('_', ' ')} transaction`}
                  accessibilityState={{ disabled: retrying }}
                  disabled={retrying}
                  onPress={() => void retryPendingInventoryRequest(request)}
                  style={[styles.inventoryRetryAction, retrying && styles.inventoryRetryDisabled]}
                >
                  <Text style={styles.inventoryRetryActionText}>{retrying ? 'Retrying…' : 'Retry'}</Text>
                </Pressable>
              ) : null}
              {!canRetry ? (
                <Text style={styles.inventoryRecoveryMessage}>
                  Sign in to the original Staff account and branch to safely retry this request.
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  };

  const renderPendingSaleCheckouts = () => {
    if (pendingSaleCheckoutLoading) {
      return <Text style={styles.emptyState}>Loading saved checkout recovery requests…</Text>;
    }
    if (pendingSaleCheckoutStorageError !== '') {
      return (
        <View style={styles.stockInErrorBanner} accessibilityRole="alert">
          <Text style={styles.stockInErrorIcon}>!</Text>
          <Text style={styles.stockInErrorText}>{pendingSaleCheckoutStorageError}</Text>
        </View>
      );
    }
    const visibleRequests = pendingSaleCheckouts.filter((request) =>
      request.actorId === user.id && request.branchId === user.branchId,
    );
    if (visibleRequests.length === 0) return null;
    return (
      <View style={styles.unresolvedSalesList}>
        {visibleRequests.map((request) => {
          const retrying = pendingSaleCheckoutLocks.current.has(request.requestId);
          return (
            <View key={request.requestId} style={styles.unresolvedSaleRow}>
              <View style={styles.unresolvedSaleCopy}>
                <Text style={styles.unresolvedSaleReference}>{request.transactionReference}</Text>
                <Text style={styles.unresolvedSaleDate}>
                  Saved {new Date(request.createdAt).toLocaleString('en-PH')} · {request.paymentMethod} · ₱{request.totalAmount.toLocaleString('en-PH')}
                </Text>
                <Text style={styles.unresolvedSaleStatus}>Confirmation not received; the original checkout is preserved.</Text>
                {pendingSaleCheckoutErrors[request.requestId] ? (
                  <Text style={styles.inventoryRecoveryMessage}>{pendingSaleCheckoutErrors[request.requestId]}</Text>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Retry saved checkout ${request.transactionReference}`}
                accessibilityState={{ disabled: retrying }}
                disabled={retrying}
                onPress={() => void retryPendingSaleCheckout(request)}
                style={[styles.inventoryRetryAction, retrying && styles.inventoryRetryDisabled]}
              >
                <Text style={styles.inventoryRetryActionText}>{retrying ? 'Retrying…' : 'Retry checkout'}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    );
  };

  const renderTopHeader = (title: string, subtitle?: string) => (
    <View style={styles.pageHeader}>
      <Text style={styles.pageTitle}>{title}</Text>
      {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
    </View>
  );

  const renderDashboard = () => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.dashboardContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refreshDashboardData()}
          tintColor={colors.pink}
          colors={[colors.pink]}
        />
      }
    >
      <Text style={styles.dashboardPageTitle}>Dashboard</Text>
      <View style={styles.dashboardHeader}>
        <View style={styles.profileAvatar}>
          <View style={styles.profileHead} />
          <View style={styles.profileBody} />
        </View>
        <View style={styles.greetingCopy}>
          <Text style={styles.greeting} numberOfLines={1}>Hello, {staffName}!</Text>
          <Text style={styles.branchName} numberOfLines={1}>{assignedBranch}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Alerts"
          onPress={() => navigate('more')}
          style={styles.alertButton}
        >
          <View style={styles.bellIcon}>
            <View style={styles.bellBody} />
            <View style={styles.bellBase} />
            <View style={styles.bellClapper} />
          </View>
          {alertBadgeCount > 0 ? (
            <View style={styles.alertCountBadge}>
              <Text style={styles.alertCountText}>{alertBadgeCount > 99 ? '99+' : alertBadgeCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <SearchBar value={dashboardSearch} onChangeText={setDashboardSearch} placeholder="Search inventory" />
      {(dashboardMessage !== '' || menuInventoryRetrySale !== null) && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            {dashboardMessage || `Sale ${menuInventoryRetrySale?.reference} is recorded; inventory processing needs attention.`}
          </Text>
          {menuInventoryRetrySale ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: retryingSaleIds.has(menuInventoryRetrySale.id) }}
              disabled={retryingSaleIds.has(menuInventoryRetrySale.id)}
              onPress={() => void retryMenuSaleInventory()}
              style={styles.inventoryRetryAction}
            >
              <Text style={styles.inventoryRetryActionText}>
                {retryingSaleIds.has(menuInventoryRetrySale.id) ? 'Retrying…' : 'Retry inventory'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss message"
            onPress={() => setDashboardMessage('')}
            style={styles.bannerDismissButton}
          >
            <Text style={styles.bannerDismiss}>×</Text>
          </Pressable>
        </View>
      )}
      {(pendingSaleCheckoutLoading || pendingSaleCheckoutStorageError !== '' || pendingSaleCheckouts.length > 0) ? (
        <>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionTitle}>Checkouts needing confirmation</Text>
            <Text style={styles.sectionHint}>{pendingSaleCheckouts.filter((request) => request.actorId === user.id && request.branchId === user.branchId).length} saved</Text>
          </View>
          {renderPendingSaleCheckouts()}
        </>
      ) : null}
      {(pendingInventoryTransactionsLoading ||
        pendingInventoryStorageError !== '' ||
        pendingInventoryTransactions.length > 0) ? (
        <>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionTitle}>Inventory transactions needing confirmation</Text>
            <Text style={styles.sectionHint}>{pendingInventoryTransactions.length} saved</Text>
          </View>
          {renderPendingInventoryRequests()}
        </>
      ) : null}
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>Sales needing inventory</Text>
        <Text style={styles.sectionHint}>{unresolvedSales.length} sales</Text>
      </View>
      {unresolvedSalesLoading ? (
        <Text style={styles.emptyState}>Loading inventory recovery records…</Text>
      ) : unresolvedSalesError ? (
        <Pressable accessibilityRole="button" onPress={() => void refreshBackendData()} style={styles.recoveryError}>
          <Text style={styles.recoveryErrorText}>{unresolvedSalesError} · Tap to retry</Text>
        </Pressable>
      ) : unresolvedSales.length ? (
        <View style={styles.unresolvedSalesList}>
          {unresolvedSales.map((sale) => {
            const retrying = retryingSaleIds.has(sale.id);
            return (
              <View key={sale.id} style={styles.unresolvedSaleRow}>
                <View style={styles.unresolvedSaleCopy}>
                  <Text style={styles.unresolvedSaleReference}>{sale.transaction_reference}</Text>
                  <Text style={styles.unresolvedSaleDate}>{new Date(sale.created_at).toLocaleString('en-PH')}</Text>
                  <Text style={styles.unresolvedSaleStatus}>
                    Inventory {sale.inventory_processing_status}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Retry inventory for ${sale.transaction_reference}`}
                  accessibilityState={{ disabled: retrying }}
                  disabled={retrying}
                  onPress={() => void retrySaleInventory(sale)}
                  style={[styles.inventoryRetryAction, retrying && styles.inventoryRetryDisabled]}
                >
                  <Text style={styles.inventoryRetryActionText}>{retrying ? 'Retrying…' : 'Retry'}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.emptyState}>No sales need inventory recovery.</Text>
      )}
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>Recent sales receipts</Text>
        <Text style={styles.sectionHint}>{recentSales.length} sales</Text>
      </View>
      {saleHistoryError ? (
        <Text style={styles.recoveryErrorText}>{saleHistoryError}</Text>
      ) : recentSales.length ? (
        <View style={styles.unresolvedSalesList}>
          {recentSales.slice(0, 5).map((sale) => (
            <View key={`recent-${sale.id}`} style={styles.unresolvedSaleRow}>
              <View style={styles.unresolvedSaleCopy}>
                <Text style={styles.unresolvedSaleReference}>{sale.transaction_reference}</Text>
                <Text style={styles.unresolvedSaleDate}>
                  {new Date(sale.created_at).toLocaleString('en-PH')} · {sale.payment_method} · {formatSaleMoney(sale.total_amount)}
                </Text>
                <Text style={styles.unresolvedSaleStatus}>
                  {saleVoidStatusLabel(saleVoidState(sale, latestSaleVoidRequest(saleVoidRequests, sale.id)))
                    ?? `Inventory ${sale.inventory_processing_status}`}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View receipt for ${sale.transaction_reference}`}
                onPress={() => openSaleReceipt(sale.id)}
                style={styles.inventoryRetryAction}
              >
                <Text style={styles.inventoryRetryActionText}>Receipt</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyState}>No recorded sales yet.</Text>
      )}
      <View style={styles.summaryCard}>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryEyebrow}>INVENTORY SUMMARY</Text>
          <View style={styles.summaryTotalRow}>
            <Text style={styles.summaryTotal}>
              {backendLoading
                ? '…'
                : backendError !== '' && ingredients.length === 0
                  ? '—'
                  : branchInventoryItems.length.toString().padStart(2, '0')}
            </Text>
            <Text style={styles.summaryItems}>items tracked</Text>
          </View>
          <Text style={styles.summaryAlerts}>
            {backendLoading
              ? 'Loading stock alerts…'
              : backendError !== '' && ingredients.length === 0
                ? 'Stock data unavailable'
                : `${alertBadgeCount} stock alerts need attention`}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigate('inventory')}
            style={({ pressed }) => [styles.checkNowButton, pressed && styles.pressed]}
          >
            <Text style={styles.checkNowText}>Check now</Text>
            <AppIcon name="forward" style={styles.checkNowArrow} />
          </Pressable>
        </View>
        <View style={styles.summaryPhoto}>
          <Image
            source={require('../../assets/takoyaki-plate.png')}
            style={styles.summaryImage}
            resizeMode="cover"
            accessibilityLabel="Takoyaki"
          />
        </View>
      </View>

      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <Text style={styles.sectionHint}>At a glance</Text>
      </View>
      <View style={styles.quickActions}>
        {[
          { title: 'Stock-In', icon: 'stockIn' as AppIconName, onPress: () => openForm('stockIn', 'menu') },
          { title: 'Stock-Out', icon: 'stockOut' as AppIconName, onPress: () => openForm('stockOut', 'menu') },
          { title: 'Waste', icon: 'waste' as AppIconName, onPress: () => openForm('waste', 'menu') },
          {
            title: 'Physical Inventory',
            icon: 'dailyCount' as AppIconName,
            onPress: startDailyInventoryCheck,
          },
          {
            title: 'Prepare Batter',
            icon: 'batter' as AppIconName,
            onPress: () => {
              const date = manilaBusinessDate();
              setBatterPreparationDate(date);
              setBatterBatchReference('');
              setBatterPreparationError('');
              setRoute('batterBatch');
            },
          },
        ].map((action) => (
          <Pressable
            key={action.title}
            accessibilityRole="button"
            onPress={action.onPress}
            style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
          >
            <View style={styles.quickActionIcon}>
              <AppIcon name={action.icon} style={styles.quickActionGlyph} />
            </View>
            <Text style={styles.quickActionTitle}>{action.title}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>Low-Stock Items</Text>
        <Text style={styles.sectionHint}>{lowStockItems.length} items</Text>
      </View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.dashboardLowStockScroll}
        contentContainerStyle={styles.dashboardLowStockList}
      >
        {visibleLowStockItems.map((item) => (
          <InventoryIngredientCard
            key={`low-${item.id}`}
            item={item}
            statusOverride={{ label: 'Low stock', tone: 'low' }}
            onPress={() => openIngredientDetails(item)}
            cardWidth={lowStockCardWidth}
          />
        ))}
        {visibleLowStockItems.length === 0 && (
          <Text style={styles.emptyState}>
            {dashboardTerm ? 'No low-stock items match your search.' : 'No low-stock ingredients right now.'}
          </Text>
        )}
      </ScrollView>

      <View style={[styles.sectionHeadingRow, styles.expirationHeading]}>
        <Text style={styles.sectionTitle}>Nearing Expiration</Text>
        <Text style={styles.sectionHint}>{expiringItems.length} items</Text>
      </View>
      <View style={styles.dashboardIngredientList}>
        {visibleExpiringItems.map((item) => (
          <InventoryIngredientCard
            key={`expiry-${item.id}`}
            item={item}
            statusOverride={{ label: 'Expiring soon', tone: 'warning' }}
            showExpiration
            onPress={() => openIngredientDetails(item)}
          />
        ))}
        {visibleExpiringItems.length === 0 && (
          <Text style={styles.emptyState}>
            {dashboardTerm ? 'No items nearing expiration match your search.' : 'No ingredients nearing expiration.'}
          </Text>
        )}
      </View>
    </ScrollView>
  );

  const renderInventoryLoadState = () => {
    if (backendLoading) {
      return (
        <View style={styles.inventoryState}>
          <ActivityIndicator color={colors.pink} />
          <Text style={styles.inventoryEmptyMessage}>
            {route === 'ingredientDetails' ? 'Loading ingredient details…' : 'Loading inventory…'}
          </Text>
          {route === 'ingredientDetails' ? (
            <Text style={styles.inventoryEmptyMessage}>Retrieving ingredient and batch information.</Text>
          ) : null}
        </View>
      );
    }
    if (backendError) {
      return (
        <View style={styles.inventoryState}>
          {route === 'ingredientDetails' ? (
            <Text style={styles.inventoryEmptyTitle}>Ingredient details unavailable</Text>
          ) : null}
          <Text style={styles.inventoryEmptyMessage}>
            Unable to load data. Please check your internet connection and try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void refreshBackendData()}
            style={({ pressed }) => [styles.clearFiltersButton, pressed && styles.pressed]}
          >
            <Text style={styles.clearFiltersText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    return null;
  };

  const renderInventory = () => {
    const loadingOrError = renderInventoryLoadState();
    if (loadingOrError) return loadingOrError;

    const assignedItems = filterBranchInventoryAlertItems(ingredients);
    const inventoryHeader = (
      <View style={styles.inventoryPageHeader}>
        <View style={styles.inventoryHeaderRow}>
          <View style={styles.inventoryHeaderCopy}>
            <Text style={styles.pageTitle}>Inventory</Text>
            <Text style={styles.pageSubtitle}>{assignedBranch} · Read only</Text>
          </View>
          <View style={styles.inventoryHeaderActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Units and pack sizes"
              onPress={() => setRoute('unitsPackSizes')}
              style={({ pressed }) => [styles.inventoryUnitsLink, pressed && styles.pressed]}
            >
              <Text style={styles.inventoryUnitsLinkText}>Units &amp; pack sizes</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
    if (assignedItems.length === 0) {
      return (
        <View style={styles.inventoryAssignedEmpty}>
          {inventoryHeader}
          <View style={styles.inventoryEmpty}>
            <CubeOutlineIcon />
            <Text style={styles.inventoryEmptyTitle}>
              No inventory assigned yet
            </Text>
            <Text style={styles.inventoryEmptyMessage}>
              Your branch has no ingredients or supplies assigned. Contact the owner to set up inventory.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <FlatList
        style={styles.scroll}
        contentContainerStyle={styles.inventoryListContent}
        data={visibleIngredients}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.inventoryCardSeparator} />}
        ListHeaderComponent={
          <>
            {inventoryHeader}
            <View style={styles.inventorySearch}>
              <SearchBar
                value={search}
                onChangeText={setSearch}
                placeholder="Search ingredients or supplies…"
              />
            </View>
            <ScrollView
              horizontal
              nestedScrollEnabled
              directionalLockEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.inventoryFilterScroll}
              contentContainerStyle={styles.inventoryFilters}
            >
              {staffInventoryCategoryFilters(ingredients.filter((item) => item.hasBranchInventory)).map((filter) => (
                <FilterChip
                  key={filter}
                  label={filter}
                  selected={filter === category}
                  onPress={() => setCategory(filter)}
                />
              ))}
            </ScrollView>
            <Text style={styles.inventoryCount}>
              {visibleIngredients.length} {visibleIngredients.length === 1 ? 'item' : 'items'} · Expected quantity
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <InventoryIngredientCard
            item={item}
            showExpiration
            showInventoryStatuses
            onPress={() => {
              setSelectedIngredientId(item.id);
              setIngredientDetailReturnRoute('inventory');
              setRoute('ingredientDetails');
            }}
          />
        )}
        ListEmptyComponent={
          <View style={styles.inventoryEmpty}>
            <Text style={styles.inventoryEmptyTitle}>No items found.</Text>
            <Text style={styles.inventoryEmptyMessage}>Try a different name or category.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSearch('');
                setCategory('All');
              }}
              style={({ pressed }) => [styles.clearFiltersButton, pressed && styles.pressed]}
            >
              <Text style={styles.clearFiltersText}>Clear search</Text>
            </Pressable>
          </View>
        }
      />
    );
  };

  const renderUnitsPackSizes = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.detailPage} showsVerticalScrollIndicator={false}>
      <View style={styles.detailHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to inventory"
          onPress={() => setRoute('inventory')}
          style={styles.detailBackButton}
        >
          <AppIcon name="back" style={styles.detailBackArrow} />
        </Pressable>
        <View style={styles.detailHeaderCopy}>
          <Text style={styles.detailPageTitle}>Units &amp; pack sizes</Text>
          <Text style={styles.pageSubtitle}>{assignedBranch} · Read only</Text>
        </View>
      </View>

      <View style={styles.inventoryDetailSection}>
        <Text style={styles.historyPlaceholderText}>Ingredient UOM</Text>
        {filterBranchInventoryAlertItems(ingredients).map((item) => (
          <DetailRow key={item.id} label={item.name} value={item.unit} />
        ))}
      </View>

      <View style={styles.inventoryDetailSection}>
        <Text style={styles.historyPlaceholderText}>Purchase packs</Text>
        {filterBranchInventoryAlertItems(ingredients)
          .filter((item) => item.packageQuantity !== null && item.packageUnit)
          .map((item) => (
            <DetailRow
              key={item.id}
              label={item.name}
              value={`${formatInventoryQuantity(item.packageQuantity ?? 0, 3)} ${item.packageUnit}`}
            />
          ))}
        <Text style={styles.inventoryEmptyMessage}>
          Batter: 1 bottle = 680 ml.{'\n'}
          Purchase-pack sizes are not current stock quantities.
        </Text>
      </View>
    </ScrollView>
  );

  const describeIngredientLots = (batches: IngredientBatch[]) => {
    const byId = new Map(batches.map((batch) => [batch.id ?? batch.reference, batch]));
    return describeLotsForDisplay(
      batches.map((batch) => ({
        id: batch.id ?? batch.reference,
        expirationDate: batch.expirationDateIso,
        receivedDate: batch.receivedDateIso ?? '',
        quantityRemaining: batch.quantityRemaining,
        usable: batch.usable,
      })),
      new Date(),
      lotExpiryWindow,
    ).map((lot) => ({
      ...(byId.get(lot.id) as IngredientBatch),
      expiry: lot.expiry,
      expiryLabel: lot.expiryLabel,
      useFirst: lot.useFirst,
      held: lot.held,
    }));
  };

  const renderExpirationInfo = () => {
    const item = selectedIngredient;
    // A1 FEFO: lots in the order sales use them, with the 48 h / 24 h colours.
    const sortedBatches = item ? describeIngredientLots(item.batches) : [];
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.detailPage} showsVerticalScrollIndicator={false}>
        <View style={styles.detailHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to ingredient details"
            onPress={() => setRoute('ingredientDetails')}
            style={styles.detailBackButton}
          >
            <AppIcon name="back" style={styles.detailBackArrow} />
          </Pressable>
          <View style={styles.detailHeaderCopy}>
            <Text style={styles.detailPageTitle}>Expiration information</Text>
            <Text style={styles.pageSubtitle}>{assignedBranch} · Read only</Text>
          </View>
        </View>
        {item ? (
          <View style={styles.inventoryDetailSection}>
            <Text style={styles.historyPlaceholderText}>{item.name} · Received batches</Text>
            {sortedBatches.length > 0 ? sortedBatches.map((batch) => (
              <View key={batch.reference} style={styles.inventoryBatchCard}>
                <Text style={styles.inventoryBatchTitle}>{batch.reference}</Text>
                <DetailRow
                  label="Received date"
                  value={batch.receivedDate || 'Not recorded'}
                />
                <DetailRow
                  label="Quantity"
                  value={formatInventoryUnitQuantity(
                    batch.quantityRemaining,
                    item.unit,
                    item.quantityPrecision,
                  )}
                />
                <DetailRow label="Expiration date" value={batch.expirationDate ?? 'Not recorded'} />
                <LotExpiryBadges lot={batch} />
              </View>
            )) : (
              <Text style={styles.inventoryEmptyMessage}>No received batches recorded.</Text>
            )}
          </View>
        ) : null}
        <View style={styles.inventoryDetailSection}>
          <Text style={styles.historyPlaceholderText}>How expiration is highlighted</Text>
          <Text style={styles.inventoryEmptyMessage}>
            Batches are listed in the order sales use them: the earliest expiration first (FEFO).{'\n'}
            Use first: the batch the next sale takes from.{'\n'}
            Red: expires within {lotExpiryWindow.criticalHours} hours — use it first.{'\n'}
            Yellow: expires within {lotExpiryWindow.warningHours} hours.{'\n'}
            Expired: past the end of its expiration date. It is not used for sales; record it as waste.{'\n'}
            No recorded date: show “Not recorded”.
          </Text>
        </View>
      </ScrollView>
    );
  };

  const renderIngredientDetails = () => {
    const loadingOrError = renderInventoryLoadState();
    if (loadingOrError) return loadingOrError;
    if (!selectedIngredient) {
      return (
        <View style={styles.inventoryFallback}>
          <Text style={styles.inventoryEmptyTitle}>Ingredient not found</Text>
          <Pressable onPress={() => setRoute(ingredientDetailReturnRoute)} style={styles.detailBackFallback}>
            <Text style={styles.detailBackLabel}>Back</Text>
          </Pressable>
        </View>
      );
    }

    // ST-04 c6: prepared batter is shown in bottles on this screen.
    const shownIngredient = inventoryDisplayItem(selectedIngredient);
    const gap = shownIngredient.minimumStock - shownIngredient.quantity;
    const stockGap = gap > 0
      ? `${formatInventoryQuantity(gap, shownIngredient.quantityPrecision)} ${shownIngredient.unit} below minimum`
      : gap < 0
        ? `${formatInventoryQuantity(Math.abs(gap), shownIngredient.quantityPrecision)} ${shownIngredient.unit} above minimum`
        : 'At minimum stock';
    const statusLabel = inventoryStockStatus(shownIngredient.quantity, stockThresholdOf(shownIngredient));
    const shownThreshold = stockThresholdOf(shownIngredient);
    const statusTone = statusLabel === 'Normal' ? 'good' : 'low';
    const recentMovements = historyTransactions
      .filter((transaction) => transaction.ingredientId === shownIngredient.id)
      .slice(0, 3);

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.detailPage}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ingredientDetailReturnRoute === 'alerts' ? 'Back to Alerts' : 'Back to inventory'}
            onPress={() => setRoute(ingredientDetailReturnRoute)}
            style={styles.detailBackButton}
          >
            <AppIcon name="back" style={styles.detailBackArrow} />
          </Pressable>
          <View style={styles.detailHeaderCopy}>
            <Text style={styles.detailPageTitle}>Ingredient details</Text>
            <Text style={styles.pageSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>

        <View style={styles.ingredientSummary}>
          <IngredientThumbnail item={shownIngredient} large />
          <View style={styles.ingredientSummaryCopy}>
            <Text style={styles.detailIngredientName}>{shownIngredient.name}</Text>
            <Text style={styles.detailIngredientCategory}>
              {displayInventoryCategory(shownIngredient.category)} · {shownIngredient.unit}
            </Text>
            <StatusBadge label={statusLabel} tone={statusTone} />
            {shownIngredient.expirationStatus ? (
              <StatusBadge
                label={shownIngredient.expirationStatus}
                tone={shownIngredient.expirationStatus === 'Expired' ? 'low' : 'warning'}
              />
            ) : null}
          </View>
        </View>

        <View style={styles.stockSummaryCard}>
          <Text style={styles.stockSummaryQuantity}>
            {formatInventoryUnitQuantity(
              shownIngredient.quantity,
              shownIngredient.unit,
              shownIngredient.quantityPrecision,
            )}
          </Text>
          <Text style={styles.stockSummaryCaption}>Expected quantity</Text>
          <View style={styles.stockSummaryDivider} />
          <View style={styles.stockSummaryLine}>
            <Text style={styles.stockSummaryLabel}>Minimum stock</Text>
            <Text style={styles.stockSummaryValue}>
              {formatInventoryUnitQuantity(
                shownIngredient.minimumStock,
                shownIngredient.unit,
                shownIngredient.quantityPrecision,
              )}
            </Text>
          </View>
          {shownThreshold > shownIngredient.minimumStock ? (
            <View style={styles.stockSummaryLine}>
              <Text style={styles.stockSummaryLabel}>Reorder point</Text>
              <Text style={styles.stockSummaryValue}>
                {formatInventoryUnitQuantity(shownThreshold, shownIngredient.unit, shownIngredient.quantityPrecision)}
              </Text>
            </View>
          ) : null}
          <View style={styles.stockSummaryLine}>
            <Text style={styles.stockSummaryLabel}>Stock gap</Text>
            <Text style={[styles.stockSummaryValue, gap > 0 && styles.stockGapWarning]}>{stockGap}</Text>
          </View>
        </View>

        <View style={styles.detailRows}>
          <DetailRow label="Branch" value={assignedBranch} />
          <DetailRow label="Category" value={displayInventoryCategory(shownIngredient.category)} />
          <DetailRow label="Unit of measurement" value={shownIngredient.unitName} />
          <DetailRow
            label="Pack size"
            value={shownIngredient.packageQuantity !== null && shownIngredient.packageUnit
              ? `${shownIngredient.packageLabel ? `${shownIngredient.packageLabel} · ` : ''}${formatInventoryQuantity(shownIngredient.packageQuantity, 3)} ${shownIngredient.packageUnit}`
              : 'Not recorded'}
          />
          <DetailRow label="Expiration" value={shownIngredient.expiration ?? 'Not recorded'} />
          {shownIngredient.expirationStatus ? (
            <DetailRow label="Expiration status" value={shownIngredient.expirationStatus} />
          ) : null}
          <DetailRow label="Last updated" value={shownIngredient.lastUpdated} />
        </View>

        <View style={styles.inventoryDetailSection}>
          <Text style={styles.historyPlaceholderText}>Received batches</Text>
          {shownIngredient.batches.length > 0 ? describeIngredientLots(shownIngredient.batches).map((batch) => {
            return (
              <View key={batch.reference} style={styles.inventoryBatchCard}>
                <Text style={styles.inventoryBatchTitle}>Batch {batch.reference}</Text>
                <DetailRow label="Received date" value={batch.receivedDate || 'Not recorded'} />
                <DetailRow
                  label="Received quantity"
                  value={formatInventoryUnitQuantity(
                    batch.quantityReceived,
                    shownIngredient.unit,
                    shownIngredient.quantityPrecision,
                  )}
                />
                <DetailRow label="Expiration date" value={batch.expirationDate ?? 'Not recorded'} />
                <DetailRow
                  label="Remaining quantity"
                  value={formatInventoryUnitQuantity(
                    batch.quantityRemaining,
                    shownIngredient.unit,
                    shownIngredient.quantityPrecision,
                  )}
                />
                {shownIngredient.expirationTracking || batch.held || batch.useFirst ? <LotExpiryBadges lot={batch} /> : null}
              </View>
            );
          }) : (
            <Text style={styles.inventoryEmptyMessage}>No received batches recorded.</Text>
          )}
        </View>

        {shownIngredient.expirationTracking ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setRoute('expirationInfo')}
            style={({ pressed }) => [styles.historySecondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.historySecondaryButtonText}>Expiration information</Text>
          </Pressable>
        ) : null}

        <View style={styles.inventoryDetailSection}>
          <Text style={styles.historyPlaceholderText}>Recent stock movements</Text>
          {recentMovements.length > 0 ? recentMovements.map((transaction) => (
            <View key={transaction.id} style={styles.historyActivityCard}>
              <View style={styles.historyActivityCopy}>
                <Text style={styles.historyActivityTitle}>{transaction.type} · {transaction.reference}</Text>
                <Text style={styles.historyActivityDetail}>
                  {formatHistoryDateTime(transaction.transactionDate)}
                  {transaction.batchReference ? ` · Batch ${transaction.batchReference}` : ''}
                </Text>
                {transaction.afterQuantity !== null ? (
                  <Text style={styles.historyActivityDetail}>
                    Balance after: {formatInventoryUnitQuantity(
                      transaction.afterQuantity,
                      transaction.unit,
                      shownIngredient.quantityPrecision,
                    )}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.historyActivityAmount}>
                {transaction.movement > 0 ? '+' : ''}
                {formatInventoryUnitQuantity(
                  transaction.movement,
                  transaction.unit,
                  shownIngredient.quantityPrecision,
                )}
              </Text>
            </View>
          )) : (
            <Text style={styles.inventoryEmptyMessage}>No recent stock movements.</Text>
          )}
        </View>

        <View style={styles.permissionNotice}>
          <Text style={styles.permissionIcon}>i</Text>
          <Text style={styles.permissionText}>
            Inventory is read-only for Staff. Use the Stock tab for authorized stock movements; the Owner manages ingredient details.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => setRoute('inventoryHistory')}
          style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}
        >
          <Text style={styles.historyButtonText}>View stock history</Text>
        </Pressable>
      </ScrollView>
    );
  };

  const renderInventoryHistory = () => {
    const loadingOrError = renderInventoryLoadState();
    if (loadingOrError) return loadingOrError;
    const ingredientTransactions = historyTransactions.filter(
      (transaction) => transaction.ingredientId === selectedIngredient?.id,
    );
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.detailPage} showsVerticalScrollIndicator={false}>
      <View style={styles.detailHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to ingredient details"
          onPress={() => setRoute('ingredientDetails')}
          style={styles.detailBackButton}
        >
          <AppIcon name="back" style={styles.detailBackArrow} />
        </Pressable>
        <View style={styles.detailHeaderCopy}>
          <Text style={styles.detailPageTitle}>Stock history</Text>
          <Text style={styles.pageSubtitle}>{selectedIngredient?.name ?? 'Ingredient'} · {assignedBranch}</Text>
        </View>
      </View>
      <Text style={styles.historyPlaceholderText}>Transaction history</Text>
      {ingredientTransactions.length > 0 ? ingredientTransactions.map((transaction) => (
        <View key={transaction.id} style={styles.historyActivityCard}>
          <View style={styles.historyActivityMarker}>
            <Text style={styles.historyActivityGlyph}>{transaction.movement > 0 ? '+' : '−'}</Text>
          </View>
          <View style={styles.historyActivityCopy}>
            <Text style={styles.historyActivityTitle}>{transaction.type} · {transaction.reference}</Text>
            <Text style={styles.historyActivityDetail}>
              {formatHistoryDateTime(transaction.transactionDate)} · {transaction.reason || 'No reason'}
            </Text>
            {transaction.batchReference ? (
              <Text style={styles.historyActivityDetail}>Batch {transaction.batchReference}</Text>
            ) : null}
            {transaction.afterQuantity !== null ? (
              <Text style={styles.historyActivityDetail}>
                Balance after: {formatInventoryUnitQuantity(
                  transaction.afterQuantity,
                  transaction.unit,
                  selectedIngredient?.quantityPrecision ?? 2,
                )}
              </Text>
            ) : null}
          </View>
          <Text style={styles.historyActivityAmount}>
            {transaction.movement > 0 ? '+' : ''}
            {formatInventoryUnitQuantity(
              transaction.movement,
              transaction.unit,
              selectedIngredient?.quantityPrecision ?? 2,
            )}
          </Text>
        </View>
      )) : (
        <Text style={styles.historyPlaceholderText}>No saved transactions for this ingredient.</Text>
      )}
      </ScrollView>
    );
  };

  const renderBatterBatch = () => {
    const sharedRecipe = sharedRecipes.find((recipe) =>
      recipe.recipe_code === 'shared-batter' || recipe.name.toLowerCase().includes('batter'),
    );
    return (
      <View style={styles.wasteFormSurface}>
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Stocks"
            onPress={() => setRoute('stocks')}
            style={styles.backButton}
          >
            <AppIcon name="back" style={styles.backGlyph} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Batter Batch</Text>
            <Text style={styles.formSubtitle}>1 batch · {assignedBranch}</Text>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.compactFormContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.batterSectionTitle}>Raw ingredients</Text>
          <View style={styles.batterRecipeCard}>
            <Text style={styles.batterRecipeTitle}>Owner recipe · Read-only</Text>
            <View style={styles.batterRecipeHeaderRow}>
              <Text style={styles.batterRecipeHeaderText}>Required for 1 batch</Text>
              <Text style={styles.batterRecipeHeaderText}>Current expected</Text>
            </View>
            {sharedRecipesLoading ? (
              <Text style={styles.batterRecipeMeta}>Loading recipe…</Text>
            ) : sharedRecipe ? (
              sharedRecipe.ingredientLines
                .filter((line) => line.automatic_consumption_enabled)
                .map((line) => {
                  const ingredient = ingredients.find((item) => item.id === line.ingredient_id);
                  const batchQuantity = line.quantity_required * PREPARED_BATTER_BATCH_BOTTLES /
                    Math.max(1, sharedRecipe.prepared_quantity);
                  const currentQuantity = ingredient?.quantity ?? 0;
                  return (
                    <View key={line.ingredient_id} style={styles.batterRecipeRow}>
                      <Text style={styles.batterRecipeIngredient}>
                        {ingredient?.name ?? line.ingredient_id}
                      </Text>
                      <View style={styles.batterRecipeQuantities}>
                        <Text style={styles.batterRecipeQuantity}>{formatInventoryQuantity(batchQuantity, 3)} {line.unit_of_measure}</Text>
                        <Text style={styles.batterRecipeQuantity}>{formatInventoryUnitQuantity(currentQuantity, ingredient?.unit ?? line.unit_of_measure, ingredient?.quantityPrecision ?? 2)}</Text>
                      </View>
                    </View>
                  );
                })
            ) : (
              <Text style={styles.batterRecipeMeta}>The active owner batter recipe is unavailable.</Text>
            )}
          </View>

          <View style={styles.batterMetaCard}>
            <Text style={styles.fieldLabel}>Batch Reference · Auto-generated</Text>
            <Text style={styles.batterReferenceText}>{batterBatchReference || 'Auto-generated on confirmation'}</Text>
          </View>

          <DatePickerField
            label="Preparation Date *"
            value={batterPreparationDate}
            useConfirmation
            maxDate={today}
            onChange={(date) => {
              if (date) setBatterPreparationDate(date);
            }}
          />

          <View style={styles.batterOutputCard}>
            <Text style={styles.batterOutputTitle}>
              Output: {PREPARED_BATTER_BATCH_BOTTLES} prepared batter bottles
            </Text>
            <Text style={styles.batterOutputMeta}>20–25 pieces per bottle · 100–125 per batch</Text>
            <Text style={styles.batterOutputMeta}>Records one batch at a time.</Text>
          </View>

          {batterPreparationError ? (
            <Text style={styles.fieldError} accessibilityRole="alert">{batterPreparationError}</Text>
          ) : null}
          {batterPreparationNotice && !batterPreparationError ? (
            <Text style={styles.batterOutputMeta} accessibilityRole="text" accessibilityLiveRegion="polite"><AppIcon name="success" style={styles.batterOutputMeta} /> {batterPreparationNotice}</Text>
          ) : null}

          <View style={styles.wasteFormActions}>
            <Pressable
              accessibilityRole="button"
              disabled={batterPreparationSubmitting}
              // ST-08 c4, c5: check the raw ingredients, then ask for confirmation before recording.
              onPress={requestBatterPreparation}
              style={[styles.saveButton, styles.wasteFormActionButton, batterPreparationSubmitting && styles.buttonDisabled]}
            >
              {batterPreparationSubmitting
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={styles.saveButtonText}>Record Batch</Text>}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={batterPreparationSubmitting}
              onPress={() => setRoute('stocks')}
              style={[styles.cancelButton, styles.wasteFormActionButton]}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.batterBranchNote}>
            {assignedBranch} · Recorded with your employee account
          </Text>
        </ScrollView>
      </View>
    );
  };

  const renderStocks = () => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
    >
      {renderTopHeader('Stocks', `${assignedBranch} · Inventory operations`)}
      <View style={styles.stockActionList}>
        <ActionCard
          title="Stock-In"
          description="Receive inventory"
          icon={<AppIcon name="download" style={styles.actionIcon} />}
          onPress={() => openForm('stockIn', 'stocks')}
        />
        <ActionCard
          title="Waste &amp; Spillage"
          description="Record waste or spillage"
          icon={<WasteTrashIcon color={colors.orange} />}
          onPress={() => openForm('waste', 'stocks')}
        />
        <ActionCard
          title="Batter Batch Recording"
          description="Record a prepared batter batch"
          icon={<AppIcon name="batter" style={styles.actionIcon} />}
          onPress={() => {
            const date = manilaBusinessDate();
            setBatterPreparationDate(date);
            setBatterBatchReference('');
            setBatterPreparationError('');
            setRoute('batterBatch');
          }}
        />
      </View>
      <View style={styles.stockTip}>
        <Text style={styles.stockTipIcon}>i</Text>
        <Text style={styles.stockTipText}>
          Record ingredient receipts and deductions for {assignedBranch}. Master ingredients are managed by the owner.
        </Text>
      </View>
    </ScrollView>
  );

  const renderAlertDetails = () => {
    const item = ingredients.find((ingredient) => ingredient.id === selectedAlertIngredientId);
    if (!item) {
      return (
        <View style={styles.inventoryFallback}>
          <Text style={styles.inventoryEmptyTitle}>Alert item not found</Text>
          <Pressable onPress={() => setRoute('alerts')} style={styles.detailBackFallback}>
            <Text style={styles.detailBackLabel}>Back to Alerts</Text>
          </Pressable>
        </View>
      );
    }

    const alertDate = manilaBusinessDate();
    const relatedAlerts = inventoryAlerts.filter((alert) => alert.ingredientId === item.id);
    const detailKinds = [...new Set([selectedAlertKind, ...relatedAlerts.map((alert) => alert.kind)])];
    const batches = [...item.batches].sort((left, right) => {
      const leftDate = parseInventoryDate(left.expirationDateIso ?? left.expirationDate);
      const rightDate = parseInventoryDate(right.expirationDateIso ?? right.expirationDate);
      if (!leftDate) return rightDate ? 1 : 0;
      if (!rightDate) return -1;
      return leftDate.getTime() - rightDate.getTime();
    });

    return (
      <ScrollView
        style={[styles.scroll, styles.alertsScreen]}
        contentContainerStyle={styles.alertDetailContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.alertLandingHeader}>
          <Text style={styles.alertPageTitle}>Alert Details</Text>
          <Text style={styles.alertBranchName}>
            {assignedBranch} · {activeAlertCount === null ? '— active alerts' : `${activeAlertCount} active alerts`}
          </Text>
          <Text style={styles.alertBusinessDate}>Business date: {formatDate(alertDate)}</Text>
        </View>
        <Text style={styles.alertDetailName}>{item.name}</Text>
        <View style={styles.alertDetailBadges}>
          {detailKinds.map((kind) => {
            const danger = kind === 'outOfStock' || kind === 'expired';
            return (
              <View
                key={kind}
                style={[styles.alertDetailBadge, danger && styles.alertDetailDangerBadge]}
              >
                <AppIcon name={stockAlertIcon(kind)} style={[styles.alertDetailBadgeIcon, danger && styles.alertDetailDangerText]} />
                <Text style={[styles.alertDetailBadgeText, danger && styles.alertDetailDangerText]}>
                  {inventoryAlertLabel(kind)}
                </Text>
              </View>
            );
          })}
        </View>
        <View style={styles.alertDetailMetrics}>
          <View style={styles.alertDetailMetric}>
            <Text style={styles.alertDetailMetricLabel}>Expected quantity</Text>
            <Text style={styles.alertDetailMetricValue}>{formatUnitQuantity(item.quantity, item.unit)}</Text>
          </View>
          <View style={styles.alertDetailMetric}>
            <Text style={styles.alertDetailMetricLabel}>Minimum stock level</Text>
            <Text style={styles.alertDetailMetricValue}>{formatUnitQuantity(item.minimumStock, item.unit)}</Text>
          </View>
        </View>
        <Text style={styles.alertDetailBatchHeading}>Recorded batches</Text>
        {batches.length > 0 ? batches.map((batch) => {
          const expiration = parseInventoryDate(batch.expirationDateIso ?? batch.expirationDate);
          const daysRemaining = expiration ? daysBetweenDates(alertDate, expiration) : null;
          const expiryCopy = daysRemaining === null
            ? null
            : daysRemaining < 0
              ? `${Math.abs(daysRemaining)} ${Math.abs(daysRemaining) === 1 ? 'day' : 'days'} past expiration`
              : daysRemaining === 0
                ? 'Expires today'
                : `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining`;
          return (
            <View
              key={`${batch.reference}-${batch.receivedDate}`}
              style={styles.alertDetailBatch}
            >
              <Text style={styles.alertDetailBatchName}>Batch {batch.reference}</Text>
              <Text style={styles.alertDetailBatchText}>
                Quantity: {formatUnitQuantity(batch.quantityRemaining, item.unit)}
                {batch.quantityRemaining <= 0 ? ' · Depleted' : ''}
              </Text>
              <Text style={styles.alertDetailBatchText}>
                Expiration: {batch.expirationDate ?? 'Not recorded'}
              </Text>
              {expiryCopy ? <Text style={styles.alertDetailBatchText}>{expiryCopy}</Text> : null}
            </View>
          );
        }) : (
          <Text style={styles.alertDetailBatchEmpty}>No batches have been recorded.</Text>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => setRoute('alerts')}
          style={({ pressed }) => [styles.alertDetailBack, pressed && styles.pressed]}
        >
          <Text style={styles.alertDetailBackText}>Back</Text>
        </Pressable>
      </ScrollView>
    );
  };

  const renderAlertCard = (alert: InventoryAlert) => {
    const alertLabel = inventoryAlertLabel(alert.kind);
    const danger = alert.kind === 'outOfStock' || alert.kind === 'expired';
    const latestStockIn = historyTransactions.find((transaction) =>
      transaction.ingredientId === alert.ingredientId &&
      transaction.type.toLowerCase().includes('stock-in'),
    );
    return (
      <Pressable
        key={alert.id}
        accessibilityRole="button"
        accessibilityLabel={`${alert.title}, ${alertLabel}. ${alert.detail}`}
        onPress={() => {
          setSelectedAlertIngredientId(alert.ingredientId);
          setSelectedAlertKind(alert.kind);
          setRoute('alertDetails');
        }}
        style={({ pressed }) => [styles.inventoryAlertCard, pressed && styles.pressed]}
      >
        <View style={styles.inventoryAlertTopline}>
          <Text style={styles.inventoryAlertName}>{alert.title}</Text>
          <View style={[styles.inventoryAlertBadge, danger && styles.inventoryDangerBadge]}>
            <AppIcon name={stockAlertIcon(alert.kind)} style={[styles.inventoryAlertBadgeIcon, danger && styles.inventoryDangerBadgeText]} />
            <Text style={[styles.inventoryAlertBadgeText, danger && styles.inventoryDangerBadgeText]}>
              {alertLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.inventoryAlertDetail}>{alert.detail}</Text>
        {latestStockIn ? (
          <Text style={styles.inventoryAlertMovement}>
            Stock-In · +{formatUnitQuantity(latestStockIn.quantity, latestStockIn.unit)} · {formatDate(latestStockIn.transactionDate)}
          </Text>
        ) : null}
        <Text style={styles.alertCardAction}>View alert details</Text>
      </Pressable>
    );
  };

  const renderAlerts = () => {
    const selectedAlerts = inventoryAlerts.filter((alert) => alert.kind === selectedAlertTab);
    const alertTabs: Array<{ kind: StaffAlertTab; label: string }> = [
      { kind: 'lowStock', label: 'Low Stock' },
      { kind: 'outOfStock', label: 'Out of Stock' },
      { kind: 'nearExpiration', label: 'Near Expiration' },
      { kind: 'expired', label: 'Expired' },
    ];
    const alertTabRows = [alertTabs.slice(0, 2), alertTabs.slice(2)];
    const emptyCopy = inventoryAlertEmptyCopy(selectedAlertTab);
    const sortCopy = selectedAlertTab === 'nearExpiration' || selectedAlertTab === 'expired'
      ? 'Sorted by earliest expiration date first'
      : 'Sorted by lowest expected quantity first';
    const categoryCopy = selectedAlertTab === 'lowStock'
      ? 'At or below minimum, but above zero'
      : selectedAlertTab === 'outOfStock'
        ? 'Expected quantity is zero'
        : selectedAlertTab === 'nearExpiration'
          ? `Each item's own alert window, set by the owner (${resolveNearExpirationDays(nearExpirationDays)} days when an item has none)`
          : `Recorded expiration date is before ${formatDate(alertDate)}`;
    const activeAlertsCopy = activeAlertCount === null
      ? '— active alerts'
      : alertScreenStatus.status === 'stale' || alertScreenStatus.status === 'refreshing'
        ? `${activeAlertCount} last known alerts`
        : `${activeAlertCount} active alerts`;
    const showLastKnownAlerts = alertScreenStatus.status === 'stale';

    return (
      <ScrollView
        style={[styles.scroll, styles.alertsScreen]}
        contentContainerStyle={styles.alertsPageContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={alertRefreshing}
            onRefresh={() => void refreshAlertsData()}
            tintColor={alertPink}
            colors={[alertPink]}
          />
        }
      >
        <View style={styles.alertLandingHeader}>
          <Text style={styles.alertPageTitle}>Updated stock alerts</Text>
          <Text style={styles.alertBranchName}>{assignedBranch} · {activeAlertsCopy}</Text>
          <Text style={styles.alertBusinessDate}>Business date: {formatDate(alertDate)}</Text>
        </View>
        {stockAlertsUpdated ? (
          <View style={styles.stockAlertsUpdatedBanner} accessibilityRole="alert">
            <View style={styles.stockAlertsUpdatedCopy}>
              <Text style={styles.stockAlertsUpdatedTitle}>Low-stock alerts updated</Text>
              <Text style={styles.stockAlertsUpdatedText}>Updated automatically after Stock-In was saved.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss stock alert update"
              onPress={() => setStockAlertsUpdated(false)}
              style={styles.stockAlertsUpdatedDismiss}
            >
              <Text style={styles.stockAlertsUpdatedDismissText}>×</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.alertTabsGrid} accessibilityLabel="Alert categories">
          {alertTabRows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.alertTabRow}>
              {row.map((tab) => {
                const count = alertCounts?.[tab.kind];
                const selected = selectedAlertTab === tab.kind;
                return (
                  <Pressable
                    key={tab.kind}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedAlertTab(tab.kind)}
                    style={[styles.alertTab, selected && styles.alertTabSelected]}
                  >
                    <Text style={[styles.alertTabText, selected && styles.alertTabTextSelected]}>
                      {tab.label} · {count === undefined ? '—' : count}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        {alertScreenStatus.status === 'loading' ? (
          <View style={styles.alertState}>
            <ActivityIndicator size="small" color={alertPink} />
            <Text style={styles.alertStateText}>Loading alerts...</Text>
          </View>
        ) : alertScreenStatus.status === 'error' ? (
          <View style={styles.alertState}>
            <Text style={styles.alertStateTitle}>Unable to load alerts</Text>
            <Text style={styles.alertStateText}>
              Unable to load data. Please check your internet connection and try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refreshAlertsData()}
              style={({ pressed }) => [styles.alertRetryButton, pressed && styles.pressed]}
            >
              <Text style={styles.alertRetryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {alertScreenStatus.status === 'stale' ? (
              <View style={styles.alertStaleBanner} accessibilityRole="alert">
                <Text style={styles.alertStaleText}>Showing last known alerts. {alertScreenStatus.message}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void refreshAlertsData()}
                  style={({ pressed }) => [styles.alertStaleRetry, pressed && styles.pressed]}
                >
                  <Text style={styles.alertStaleRetryText}>Retry</Text>
                </Pressable>
              </View>
            ) : alertScreenStatus.status === 'refreshing' && !showLastKnownAlerts ? (
              <View style={styles.alertRefreshingBanner}>
                <ActivityIndicator size="small" color={alertPink} />
                <Text style={styles.alertRefreshingText}>Loading alerts...</Text>
              </View>
            ) : null}
            {selectedAlerts.length > 0 ? (
              <>
                <View style={styles.alertCategoryCopy}>
                  <Text style={styles.alertSortText}>{sortCopy}</Text>
                  <Text style={styles.alertCategoryDescription}>{categoryCopy}</Text>
                </View>
                <View style={styles.alertCardList}>{selectedAlerts.map(renderAlertCard)}</View>
              </>
            ) : (
              <View style={styles.alertEmptyCard}>
                <AppIcon name="noAlerts" size={72} />
                <Text style={styles.alertEmptyTitle}>{emptyCopy.title}</Text>
                <Text style={styles.alertEmptyText}>{emptyCopy.message} for {assignedBranch}.</Text>
              </View>
            )}
            <View style={styles.alertInfoNote}>
              <Text style={styles.alertInfoText}>
                Updates after Stock-In, Waste &amp; Spillage, sales, batter batches and authorized adjustments.
              </Text>
              <Text style={styles.alertInfoText}>Assigned branch only · Read-only alerts.</Text>
            </View>
          </>
        )}
      </ScrollView>
    );
  };

  const renderDailyInventoryOverview = () => {
    const term = dailyCheckSearch.trim().toLowerCase();
    const visibleLines = dailyCheckLines.filter((line) => line.name.toLowerCase().includes(term));
    return (
      <>
        <View style={styles.formHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel={navigationOrigin === 'more' ? 'Back to More' : 'Back to Inventory'} onPress={() => navigate(staffReturnTab(navigationOrigin, 'inventory'))} style={styles.backButton}>
            <AppIcon name="back" style={styles.backGlyph} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Physical Inventory</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.dailyCheckContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TextInput
            accessibilityLabel="Search inventory ingredients"
            value={dailyCheckSearch}
            onChangeText={setDailyCheckSearch}
            placeholder="Searching for something?"
            placeholderTextColor={colors.muted}
            style={styles.dailyCheckSearch}
          />
          {visibleLines.length === 0 ? (
            <Text style={styles.dailyFormError}>No assigned ingredients match that search.</Text>
          ) : visibleLines.map((line) => (
            <Pressable
              key={line.ingredientId}
              accessibilityRole="button"
              onPress={() => setRoute('dailyInventoryCheck')}
              style={({ pressed }) => [styles.dailyIngredientOverviewCard, pressed && styles.pressed]}
            >
              <View style={styles.dailyIngredientOverviewCopy}>
                <Text style={styles.dailyIngredientOverviewName}>{line.name}</Text>
                <Text style={styles.dailyIngredientOverviewRecorded}>
                  {line.physicalQuantity.trim() !== '' ? `Counted ${line.physicalQuantity.trim()} ${line.unit}` : 'Not counted yet'}
                </Text>
              </View>
              <Text style={styles.dailyIngredientOverviewEdit}>Edit ›</Text>
            </Pressable>
          ))}
          {dailyCheckDraftMessage ? <Text style={styles.dailyDraftMessage}>{dailyCheckDraftMessage}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => setRoute('dailyInventoryCheck')}
            style={({ pressed }) => [styles.dailyPrimaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.dailyPrimaryButtonText}>Continue count</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={openCountHistory}
            style={({ pressed }) => [styles.dailySecondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.dailySecondaryButtonText}>View my counts in Transaction History</Text>
          </Pressable>
        </ScrollView>
      </>
    );
  };

  const renderDailyInventoryCheck = () => {
    const unresolvedDailyChecks = pendingDailyStockChecks.filter(
      (request) => request.actorId === user.id && request.branchId === user.branchId,
    );
    const countProgress = blindCountProgress(dailyCheckLines);

    return (
      <>
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={navigationOrigin === 'more' ? 'Back to More' : 'Back to Inventory'}
            onPress={() => navigate(staffReturnTab(navigationOrigin, 'inventory'))}
            style={styles.backButton}
          >
            <AppIcon name="back" style={styles.backGlyph} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Physical Inventory</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.dailyCheckContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.dailyCheckIntro}>
            Count each item and enter what you actually see. The expected quantity is shown after you submit, so count
            without looking it up.
          </Text>
          <TextInput
            accessibilityLabel="Search inventory ingredients"
            value={dailyCheckSearch}
            onChangeText={setDailyCheckSearch}
            placeholder="Searching for something?"
            placeholderTextColor={colors.muted}
            style={styles.dailyCheckSearch}
          />
          {dailyCheckStorageError ? (
            <Text style={styles.dailyFormError} accessibilityRole="alert">{dailyCheckStorageError}</Text>
          ) : null}
          {unresolvedDailyChecks.map((request) => (
            <View key={request.requestId} style={styles.inventoryReportCorrectionPending}>
              <Text style={styles.dailyFormError} accessibilityRole="alert">
                A daily count is saved on this device and is awaiting confirmation.
              </Text>
              {dailyCheckRetryErrors[request.requestId] ? (
                <Text style={styles.dailyFormError} accessibilityRole="alert">
                  {dailyCheckRetryErrors[request.requestId]}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={dailyCheckRetryLocks.current.has(request.requestId)}
                onPress={() => void retryDailyStockCheck(request).catch(() => undefined)}
                style={styles.inventoryReportAction}
              >
                <Text style={styles.inventoryReportActionText}>
                  {dailyCheckRetryLocks.current.has(request.requestId) ? 'Submitting…' : 'Retry saved count'}
                </Text>
              </Pressable>
            </View>
          ))}
          <View style={styles.dailyTableHeader}>
            <Text style={[styles.dailyColumnTitle, styles.dailyIngredientColumn]}>Ingredient</Text>
            <Text style={[styles.dailyColumnTitle, styles.dailyPhysicalColumn]}>Actual count</Text>
          </View>
          <View style={styles.dailyRows}>
            {dailyCheckResults.filter((line) => line.name.toLowerCase().includes(dailyCheckSearch.trim().toLowerCase())).map((line) => {
              // ST-12 c2: blind count. The expected quantity and the difference stay hidden until submission.
              const showError = !line.valid && (dailyCheckAttempted || line.physicalQuantity.trim() !== '');
              const errorText = dailyQuantityErrorText(line.physicalQuantity, line.unit, line.precision);
              const physicalError = showError ? errorText : '';

              return (
                <View key={line.ingredientId} style={styles.dailyIngredientRow}>
                  <Text style={[styles.dailyIngredientName, styles.dailyIngredientColumn]} numberOfLines={2}>
                    {line.name} <Text style={styles.dailyRecordedValue}>({line.unit})</Text>
                  </Text>
                  <View style={[styles.dailyPhysicalColumn, styles.dailyPhysicalCell]}>
                    <TextInput
                      accessibilityLabel={`${line.name} physical quantity in ${line.unit}`}
                      value={line.physicalQuantity}
                      onChangeText={(value) =>
                        setDailyCheckLines((current) =>
                          current.map((entry) =>
                            entry.ingredientId === line.ingredientId
                              ? { ...entry, physicalQuantity: value }
                              : entry,
                          ),
                        )
                      }
                      keyboardType={line.precision === 0 ? 'number-pad' : 'decimal-pad'}
                      style={[
                        styles.dailyPhysicalInput,
                        physicalError !== '' && styles.dailyPhysicalInputError,
                      ]}
                    />
                    {physicalError !== '' ? (
                      <Text style={styles.dailyFieldError}>{physicalError}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.dailyRemarksGroup}>
            <Text style={styles.dailyLabel}>Remarks</Text>
            <TextInput
              accessibilityLabel="Remarks"
              value={dailyCheckRemarks}
              onChangeText={setDailyCheckRemarks}
              placeholder="e.g. damaged packs, spillage, items found elsewhere"
              placeholderTextColor={colors.muted}
              style={styles.dailyRemarksInput}
              multiline
            />
          </View>

          {dailyCheckAttempted && !dailyCheckValid ? (
            <Text style={styles.dailyFormError} accessibilityRole="alert">
              Correct the highlighted quantities before continuing.
            </Text>
          ) : null}
          {formError !== '' ? (
            <Text style={styles.dailyFormError} accessibilityRole="alert">{formError}</Text>
          ) : null}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dailyCheckVerified }}
            onPress={() => setDailyCheckVerified((checked) => !checked)}
            style={styles.dailyVerificationRow}
          >
            <View style={[styles.dailyVerificationBox, dailyCheckVerified && styles.dailyVerificationBoxChecked]}>
              {dailyCheckVerified ? <AppIcon name="success" style={styles.dailyVerificationMark} /> : null}
            </View>
            <Text style={styles.dailyVerificationText}>I verified the physical count.</Text>
          </Pressable>
          {dailyCheckDraftMessage ? <Text style={styles.dailyDraftMessage}>{dailyCheckDraftMessage}</Text> : null}
          {dailyCheckSaveFailed ? (
            <Pressable
              accessibilityRole="button"
              disabled={dailyCheckSubmitting}
              onPress={() => {
                if (dailyCheckSaveFailed) {
                  void saveOrRetryDailyInventoryCheck();
                } else {
                  setDailyCheckModal('confirm');
                }
              }}
              style={[styles.dailyRetryButton, dailyCheckSubmitting && styles.buttonDisabled]}
            >
              <Text style={styles.dailyRetryButtonText}>
                {dailyCheckSubmitting ? 'Saving…' : 'Retry'}
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.dailyFormActions}>
            <Pressable
              accessibilityRole="button"
              onPress={openDailyCheckReview}
              style={({ pressed }) => [styles.dailyPrimaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.dailyPrimaryButtonText}>Review count</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigate(staffReturnTab(navigationOrigin, 'inventory'))}
              style={({ pressed }) => [styles.dailySecondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.dailySecondaryButtonText}>{navigationOrigin === 'more' ? 'Back to More' : 'Back to Inventory'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={dailyCheckDraftSaving}
              onPress={() => void saveDailyInventoryDraft()}
              style={({ pressed }) => [styles.dailySecondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.dailySecondaryButtonText}>{dailyCheckDraftSaving ? 'Saving…' : 'Save as Draft'}</Text>
            </Pressable>
          </View>
          <Text style={styles.dailyDemoNote}>
            {countProgress.counted} of {countProgress.total} items counted. Counts are sent for owner review and never
            change recorded stock by themselves.
          </Text>
        </ScrollView>
      </>
    );
  };

  const renderDailyCheckSuccess = () => {
    if (!currentDailyCheck) {
      return (
        <View style={styles.dailySuccessFallback}>
          <Text style={styles.dailyCheckIntro}>No submitted physical inventory count is available.</Text>
          <Pressable onPress={() => navigate(staffReturnTab(navigationOrigin, 'inventory'))} style={styles.dailyPrimaryButton}>
            <Text style={styles.dailyPrimaryButtonText}>{navigationOrigin === 'more' ? 'Back to More' : 'Back to Inventory'}</Text>
          </Pressable>
        </View>
      );
    }

    const check = currentDailyCheck;
    const discrepancyCount = check.lines.filter((line) => line.difference !== 0).length;
    const time = formatManilaTime(check.submittedAt);
    const hasDiscrepancies = discrepancyCount > 0;
    const auditText = 'Physical counts are audit observations and do not adjust recorded stock balances.';

    return (
      <>
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={navigationOrigin === 'more' ? 'Back to More' : 'Back to Inventory'}
            onPress={() => navigate(staffReturnTab(navigationOrigin, 'inventory'))}
            style={styles.backButton}
          >
            <AppIcon name="back" style={styles.backGlyph} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>{hasDiscrepancies ? 'Inventory Discrepancy' : 'Physical Inventory'}</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.dailyCheckContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.dailySuccessBanner} accessibilityRole="alert">
            <AppIcon name="success" style={styles.dailySuccessIcon} />
            <Text style={styles.dailySuccessText}>
              {hasDiscrepancies ? 'Submitted for Owner Review.' : 'Physical inventory count saved successfully.'}
            </Text>
          </View>
          <View style={styles.dailySummaryCard}>
            <Text style={styles.dailySummaryTitle}>{hasDiscrepancies ? 'Pending Review' : 'Check submitted'}</Text>
            <Text style={styles.dailySummaryCount}>{check.lines.length} counted</Text>
            <Text style={styles.dailySummarySubtitle}>
              {discrepancyCount} {discrepancyCount === 1 ? 'discrepancy' : 'discrepancies'} ·{' '}
              {hasDiscrepancies ? 'Pending Review' : 'Submitted'}
            </Text>
          </View>

          {/* ST-12 c6: the expected quantity is revealed only now, frozen at submission (c7). */}
          <View style={styles.inventoryReportRecord}>
            <Text style={styles.inventoryReportRecordTitle}>Count results</Text>
            {check.lines.map((line) => {
              const comparison = compareCount(line.recordedQuantity, line.physicalQuantity);
              return (
                <View key={line.ingredientId} style={styles.inventoryReportCorrection}>
                  <Text style={styles.inventoryReportRecordDetail}>{line.name}</Text>
                  <Text style={styles.inventoryReportRecordDetail}>
                    Expected {formatDailyUnitQuantity(line.recordedQuantity, line.unit)} · Counted{' '}
                    {formatDailyUnitQuantity(line.physicalQuantity, line.unit)}
                  </Text>
                  <Text style={[
                    styles.inventoryReportRecordDifference,
                    comparison.kind === 'lower'
                      ? styles.inventoryReportDifferenceNegative
                      : comparison.kind === 'higher'
                        ? styles.inventoryReportDifferencePositive
                        : styles.dailyDifferenceZero,
                  ]}>
                    {countComparisonLabel(comparison, (quantity) => formatDailyUnitQuantity(quantity, line.unit))}
                  </Text>
                </View>
              );
            })}
            {hasDiscrepancies ? (
              <Text style={styles.inventoryReportRecordDetail}>
                {discrepancyCount === 1 ? 'The difference was' : `The ${discrepancyCount} differences were`} sent to the owner for review.
              </Text>
            ) : null}
            <Text style={styles.inventoryReportRecordDetail}>
              Staff remarks (read-only): {check.remarks || '—'}
            </Text>
            <Text style={styles.inventoryReportRecordDetail}>
              Count changes require a correction request, made from this count in Transaction History.
            </Text>
          </View>

          <View style={styles.dailyReceiptDetails}>
            {[
              ['Check reference', check.reference],
              ['Date', `${formatDate(check.checkDate)} · ${time}`],
              ['Branch', check.branch],
              ['Submitted by', check.staff],
              ['Employee account', `${staffName} · Signed-in staff`],
              [
                'Discrepancies',
                hasDiscrepancies ? `${discrepancyCount} · Pending Review` : '0 · None',
              ],
            ].map(([label, value]) => (
              <View key={label} style={styles.dailyReceiptRow}>
                <Text style={styles.dailyReceiptLabel}>{label}</Text>
                <Text style={styles.dailyReceiptValue}>{value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.dailyAuditBanner}>
            <Text style={styles.dailyAuditIcon}>i</Text>
            <Text style={styles.dailyAuditText}>{auditText}</Text>
          </View>
          {hasDiscrepancies ? (
            <Pressable
              accessibilityRole="button"
              onPress={openCountHistory}
              style={({ pressed }) => [styles.dailyPrimaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.dailyPrimaryButtonText}>View my counts in Transaction History</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => navigate(staffReturnTab(navigationOrigin, 'inventory'))}
            style={({ pressed }) => [hasDiscrepancies ? styles.dailySecondaryButton : styles.dailyPrimaryButton, pressed && styles.pressed]}
          >
            <Text style={hasDiscrepancies ? styles.dailySecondaryButtonText : styles.dailyPrimaryButtonText}>{navigationOrigin === 'more' ? 'Back to More' : 'Back to Inventory'}</Text>
          </Pressable>
        </ScrollView>
      </>
    );
  };

  const renderInventoryDiscrepancySubmission = () => {
    const capturedAt = dailyCheckStartedAt ?? new Date();
    return (
      <View style={styles.inventoryReportPage}>
        {renderInventoryReportHeader('Inventory Discrepancy', 'Back to physical count', () => {
          setRoute('dailyInventoryCheck');
        })}
        <ScrollView contentContainerStyle={styles.inventoryReportContent} showsVerticalScrollIndicator={false}>
          <View style={styles.inventoryReportMetadata}>
            <Text style={styles.inventoryReportMetadataText}>Branch: {assignedBranch}</Text>
            <Text style={styles.inventoryReportMetadataText}>
              Date &amp; time: {formatHistoryDateTime(capturedAt)}
            </Text>
            <Text style={styles.inventoryReportMetadataText}>
              Employee account (read-only): {staffName} · Signed-in staff
            </Text>
          </View>
          {dailyDiscrepancies.map((line) => (
            <View
              key={line.ingredientId}
              style={[
                styles.inventoryReportRecord,
                line.difference !== null && line.difference < 0
                  ? styles.inventoryReportShortage
                  : styles.inventoryReportExcess,
              ]}
            >
              <View style={styles.inventoryReportRecordHeading}>
                <Text style={styles.inventoryReportRecordTitle}>
                  {line.name} · Submitted physical count
                </Text>
                <Text style={[
                  styles.inventoryReportStatus,
                  dailyCheckSubmitting ? styles.inventoryStatusLow : styles.inventoryStatusLow,
                ]}>{dailyCheckSubmitting ? 'Saving…' : dailyCheckSaveFailed ? 'Not submitted' : 'Not submitted'}</Text>
              </View>
              <Text style={styles.inventoryReportRecordDetail}>
                Expected: {formatDailyUnitQuantity(line.recordedQuantity, line.unit)}
              </Text>
              <Text style={styles.inventoryReportRecordDetail}>
                Actual: {formatDailyUnitQuantity(line.parsedQuantity, line.unit)}
              </Text>
              <Text style={[
                styles.inventoryReportRecordDifference,
                line.difference !== null && line.difference < 0
                  ? styles.inventoryReportDifferenceNegative
                  : styles.inventoryReportDifferencePositive,
              ]}>
                Difference: {formatDailyDifference(line.difference ?? 0, line.unit)}
              </Text>
              <Text style={styles.inventoryReportRecordDetail}>
                Branch: {assignedBranch} · {formatHistoryDateTime(capturedAt)}
              </Text>
            </View>
          ))}
          <Text style={styles.fieldLabel}>Staff remarks (optional)</Text>
          <TextInput
            accessibilityLabel="Staff remarks"
            value={dailyCheckRemarks}
            onChangeText={setDailyCheckRemarks}
            placeholder="Add remarks"
            placeholderTextColor={colors.muted}
            maxLength={1000}
            multiline
            editable={!dailyCheckSubmitting}
            style={[styles.dailyRemarksInput, styles.inventoryDiscrepancyRemarks]}
          />
          <Text style={styles.inventoryReportRecordDetail}>
            Remarks lock after submission. Count changes require a correction request, made from this count in Transaction History.
          </Text>
          {formError ? (
            <Text style={styles.inventoryReportErrorText} accessibilityRole="alert">{formError}</Text>
          ) : null}
          {dailyCheckSaveFailed ? (
            <View style={styles.discrepancySaveFailure}>
              <Text style={styles.discrepancySaveFailureTitle}>
                Unable to save. Please check your internet connection and try again.
              </Text>
              <Text style={styles.discrepancySaveFailureText}>
                Your entries are kept. Nothing was submitted; review and retry.
              </Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={dailyCheckSubmitting}
            onPress={() => {
              if (dailyCheckSaveFailed) {
                void saveOrRetryDailyInventoryCheck();
              } else {
                setDailyCheckModal('confirm');
              }
            }}
            style={[
              styles.dailyPrimaryButton,
              dailyCheckSubmitting && styles.buttonDisabled,
            ]}
          >
            {dailyCheckSubmitting ? (
              <View style={styles.inventoryDiscrepancySaving}>
                <ActivityIndicator size="small" color={colors.white} />
                <Text style={styles.dailyPrimaryButtonText}>Saving…</Text>
              </View>
            ) : (
              <Text style={styles.dailyPrimaryButtonText}>
                {dailyCheckSaveFailed ? 'Retry' : 'Submit for Owner Review'}
              </Text>
            )}
          </Pressable>
          {dailyCheckSubmitting ? (
            <Text style={styles.inventoryReportRecordDetail}>
              Please wait. Buttons are disabled to prevent a duplicate submission.
            </Text>
          ) : null}
        </ScrollView>
      </View>
    );
  };

  const renderStaffIdentityCard = () => (
    <View style={styles.staffIdentityCard}>
      <View style={styles.staffIdentityAvatar}>
        <View style={styles.staffIdentityHead} />
        <View style={styles.staffIdentityBody} />
      </View>
      <View style={styles.staffIdentityCopy}>
        <Text style={styles.staffIdentityName}>{staffName}</Text>
        <Text style={styles.staffIdentitySubtitle}>{assignedBranch}</Text>
      </View>
    </View>
  );

  const openLogoutConfirmation = () => {
    setLogoutError('');
    setLogoutConfirmationVisible(true);
  };

  const confirmLogout = async () => {
    if (logoutSubmissionLock.current) return;
    logoutSubmissionLock.current = true;
    setLogoutPending(true);
    setLogoutError('');
    try {
      await onLogout();
      setLogoutConfirmationVisible(false);
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Unable to log out. Please try again.');
    } finally {
      logoutSubmissionLock.current = false;
      setLogoutPending(false);
    }
  };

  const renderInventoryReportHeader = (
    title: string,
    backLabel: string,
    onBack: () => void,
  ) => (
    <View style={[
      styles.formHeader,
      (title === 'Ingredient Category Summary Report' ||
        title === 'Ingredient Stock Status Report' ||
        title === 'Branch Inventory Summary Report' ||
        title === 'Inventory Discrepancy Report' ||
        title === 'Physical Inventory Count Report') &&
        styles.categoryReportHeader,
    ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={onBack}
        style={styles.backButton}
      >
        <AppIcon name="back" style={styles.backGlyph} />
      </Pressable>
      <View style={styles.formHeaderCopy}>
        <Text style={[
          styles.formTitle,
          title === 'Ingredient Category Summary Report' && styles.categoryReportTitle,
          title === 'Ingredient Stock Status Report' && styles.stockStatusReportTitle,
          title === 'Branch Inventory Summary Report' && styles.branchSummaryReportTitle,
          title === 'Inventory Discrepancy Report' && styles.discrepancyReportTitle,
          title === 'Physical Inventory Count Report' && styles.physicalCountReportTitle,
        ]}>
          {title === 'Ingredient Stock Status Report'
            ? 'Ingredient Stock Status\nReport'
            : title === 'Branch Inventory Summary Report'
              ? 'Branch Inventory\nSummary Report'
            : title === 'Inventory Discrepancy Report'
              ? 'Inventory Discrepancy\nReport'
            : title === 'Physical Inventory Count Report'
              ? 'Physical Inventory Count\nReport'
            : title}
        </Text>
        {title === 'Total Ingredient Quantity Report' ||
          title === 'Ingredient Category Summary Report' ||
          title === 'Ingredient Stock Status Report' ||
          title === 'Branch Inventory Summary Report' ||
          title === 'Inventory Discrepancy Report' ||
          title === 'Physical Inventory Count Report' ? null : (
          <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
        )}
      </View>
    </View>
  );

  const renderInventoryReportMetadata = (data: InventoryReportData) => (
    selectedInventoryReport === 'ingredientStockStatus' ? (
      <Text style={styles.stockStatusMetadata}>
        {data.branchName} · {formatHistoryDateTime(new Date(data.generatedAt))}
      </Text>
    ) : selectedInventoryReport === 'branchInventorySummary' ? (
      <Text style={styles.branchSummaryMetadata}>
        {data.branchName} · {formatHistoryDateTime(new Date(data.generatedAt))}
      </Text>
    ) : selectedInventoryReport === 'inventoryDiscrepancy' ? (
      <Text style={styles.discrepancyMetadata}>
        {data.branchName} · {formatHistoryDateTime(new Date(data.generatedAt))}
      </Text>
    ) : selectedInventoryReport === 'physicalInventoryCount' ? (
      <Text style={styles.physicalCountMetadata}>
        {data.branchName} · {formatHistoryDateTime(new Date(data.generatedAt))}
      </Text>
    ) : (
    <View style={[
      styles.inventoryReportMetadata,
      selectedInventoryReport === 'ingredientCategorySummary' && styles.categoryReportMetadata,
    ]}>
      <Text style={[
        styles.inventoryReportMetadataText,
        selectedInventoryReport === 'ingredientCategorySummary' && styles.categoryReportMetadataText,
      ]}>
        {selectedInventoryReport === 'ingredientCategorySummary'
          ? `${data.branchName} · ${formatHistoryDateTime(new Date(data.generatedAt))}`
          : `Branch: ${data.branchName}`}
      </Text>
      {selectedInventoryReport === 'ingredientCategorySummary' ? null : (
        <Text style={styles.inventoryReportMetadataText}>
          Data as of {formatHistoryDateTime(new Date(data.generatedAt))}
        </Text>
      )}
    </View>
    )
  );

  const renderInventoryReportState = () => {
    const branchMetadata = (
      selectedInventoryReport === 'branchInventorySummary' ||
      selectedInventoryReport === 'inventoryDiscrepancy' ||
      selectedInventoryReport === 'physicalInventoryCount'
    ) ? (
      <Text style={styles.branchSummaryMetadata}>
        {(inventoryReportData?.branchName ?? assignedBranch)} ·{' '}
        {formatHistoryDateTime(new Date(inventoryReportData?.generatedAt ?? new Date()))}
      </Text>
    ) : null;

    if (inventoryReportLoading) return (
      <View style={styles.branchSummaryStateContainer}>
        {branchMetadata}
        <View style={styles.inventoryReportState}>
          <ActivityIndicator color={colors.pink} />
          <Text style={styles.emptyState}>Loading report…</Text>
        </View>
      </View>
    );
    if (inventoryReportError) return (
      <View style={styles.branchSummaryStateContainer}>
        {branchMetadata}
        <View style={styles.inventoryReportState}>
          <Text style={styles.inventoryReportErrorText}>
            Unable to load data. Please check your internet connection and try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setInventoryReportRefreshKey((key) => key + 1)}
            style={styles.dailySalesRetryButton}
          >
            <Text style={styles.dailySalesRetryText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
    return null;
  };

  const renderIngredientStockStatusCards = (items: InventoryReportData['ingredients']) => (
    <View style={styles.stockStatusCardList}>
      {items.map((item) => {
        const status = inventoryStockStatus(item.quantity, item.minimumStock);
        return (
          <View key={item.id} style={styles.stockStatusCard}>
            <Text style={styles.stockStatusIngredientName}>{item.name}</Text>
            <Text style={styles.stockStatusQuantity}>
              Expected {formatQuantity(item.quantity)} {item.unit} · Minimum {formatQuantity(item.minimumStock)} {item.unit}
            </Text>
            <Text style={[
              styles.stockStatusLabel,
              status === 'Normal' ? styles.stockStatusNormal :
                status === 'Low Stock' ? styles.stockStatusLow : styles.stockStatusOut,
              status === 'Out of Stock' && theme.isDark && { color: '#0F1025' },
            ]}>{status}</Text>
          </View>
        );
      })}
      {items.some((item) => inventoryStockStatus(item.quantity, item.minimumStock) === 'Out of Stock') ? (
        <Text style={styles.stockStatusExplanation}>
          {'Out of Stock applies when the expected quantity is 0.\nThis is a separate stock condition.'}
        </Text>
      ) : null}
    </View>
  );

  const renderBranchInventorySummary = (items: InventoryReportData['ingredients']) => (
    <View style={styles.branchSummaryContent}>
      <Text style={styles.branchSummaryCount}>
        {items.length} {items.length === 1 ? 'inventory item' : 'inventory items'}
      </Text>
      {items.length ? (
        <>
          <View style={styles.branchSummaryTable}>
            <View style={[styles.branchSummaryRow, styles.branchSummaryHeaderRow]}>
              <Text style={[styles.branchSummaryCell, styles.branchSummaryIngredientCell]}>Ingredient</Text>
              <Text style={[styles.branchSummaryCell, styles.branchSummaryExpectedCell]}>Expected</Text>
              <Text style={[styles.branchSummaryCell, styles.branchSummaryUnitCell]}>Unit</Text>
            </View>
            {items.map((item) => (
              <View key={item.id} style={styles.branchSummaryRow}>
                <Text style={[styles.branchSummaryCell, styles.branchSummaryIngredientCell]}>{item.name}</Text>
                <Text style={[styles.branchSummaryCell, styles.branchSummaryExpectedCell]}>
                  {formatQuantity(item.quantity)}
                </Text>
                <Text style={[styles.branchSummaryCell, styles.branchSummaryUnitCell]}>{item.unit}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.branchSummaryReadOnly}>Read-only · Assigned branch only</Text>
          <Text style={styles.branchSummaryZeroNote}>Items with zero expected quantity remain listed.</Text>
        </>
      ) : (
        <View style={styles.branchSummaryEmptyState}>
          <Text style={styles.inventoryReportEmpty}>No records to display.</Text>
        </View>
      )}
    </View>
  );

  const renderInventoryQuantityTable = (
    items: InventoryReportData['ingredients'],
    includeMinimum = false,
    includeStatus = false,
  ) => (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View style={styles.inventoryReportTable}>
        <View style={[styles.inventoryReportTableRow, styles.inventoryReportTableHeader]}>
          <Text style={[styles.inventoryReportCell, styles.inventoryReportNameCell]}>Inventory item</Text>
          <Text style={styles.inventoryReportCell}>Expected quantity</Text>
          <Text style={styles.inventoryReportCell}>Unit</Text>
          {includeMinimum ? <Text style={styles.inventoryReportCell}>Minimum stock</Text> : null}
          {includeStatus ? <Text style={styles.inventoryReportCell}>Stock status</Text> : null}
        </View>
        {items.map((item) => {
          const status = inventoryStockStatus(item.quantity, item.minimumStock);
          return (
            <View key={item.id} style={styles.inventoryReportTableRow}>
              <Text style={[styles.inventoryReportCell, styles.inventoryReportNameCell]}>{item.name}</Text>
              <Text style={styles.inventoryReportCell}>{formatQuantity(item.quantity)}</Text>
              <Text style={styles.inventoryReportCell}>{item.unit}</Text>
              {includeMinimum ? (
                <Text style={styles.inventoryReportCell}>{formatQuantity(item.minimumStock)} {item.unit}</Text>
              ) : null}
              {includeStatus ? (
                <View style={styles.inventoryReportStatusCell}>
                  <Text style={[
                    styles.inventoryReportStatus,
                    status === 'Normal' ? styles.inventoryStatusNormal :
                      status === 'Low Stock' ? styles.inventoryStatusLow : styles.inventoryStatusOut,
                    status === 'Out of Stock' && theme.isDark && { color: '#0F1025' },
                  ]}>{status}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderPhysicalInventoryCountCards = (records: InventoryCountRecord[]) => (
    <View style={styles.physicalCountContent}>
      {records.length ? (
        <View style={styles.physicalCountCardList}>
          {records.map((record) => {
            const validated = record.countStatus === 'Validated' || Boolean(record.validation) || Boolean(record.adjustment);
            const status = validated ? 'Validated' : 'Submitted';
            const actualQuantity = record.revisedActualQuantity ?? record.actualQuantity;
            const matches = record.difference === 0;
            return (
              <Pressable
                key={record.id}
                accessibilityRole="button"
                onPress={() => openInventoryCountDetails(record)}
                style={({ pressed }) => [styles.physicalCountCard, pressed && styles.pressed]}
              >
                <Text style={styles.physicalCountCardTitle}>
                  {record.ingredientName} · {status}
                </Text>
                <Text style={styles.physicalCountCardLine}>
                  Expected {formatDailyUnitQuantity(record.expectedQuantity, record.unit)} ·{' '}
                  Actual {formatDailyUnitQuantity(actualQuantity, record.unit)}
                </Text>
                <Text style={[
                  styles.physicalCountDifference,
                  matches ? styles.physicalCountDifferenceNeutral : styles.physicalCountDifferenceNegative,
                ]}>
                  Difference {formatDailyDifference(record.difference, record.unit)}
                  {' · '}{countDifferenceLabel(record.difference)}
                </Text>
                <Text style={styles.physicalCountMeta}>
                  {formatHistoryDateTime(new Date(record.submittedAt))}
                </Text>
                {validated ? (
                  <Text style={styles.physicalCountMeta}>Validated by owner · Locked</Text>
                ) : record.revisedActualQuantity !== null ? (
                  <Text style={styles.physicalCountAction}>Corrected count · View revision history ›</Text>
                ) : null}
                {!validated && record.revisedActualQuantity === null ? (
                  <Text style={styles.physicalCountAction}>View count details ›</Text>
                ) : null}
                {validated ? (
                  <Text style={styles.physicalCountAction}>View count details ›</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.physicalCountEmptyState}>
          <Text style={styles.inventoryReportEmpty}>No records to display.</Text>
        </View>
      )}
      {records.length ? (
        <Text style={styles.physicalCountFooter}>
          Read-only · Newest first · Drafts are not included.
        </Text>
      ) : null}
    </View>
  );

  const renderInventoryDiscrepancyRecords = (records: InventoryCountRecord[]) => (
    <View style={styles.discrepancyReportContent}>
      {records.length ? (
        <View style={styles.discrepancyRecordList}>
          {records.map((record) => {
            const adjusted = Boolean(record.adjustment) || record.countStatus === 'Validated';
            const status = adjusted ? 'Adjusted' : 'Pending Review';
            const lowerThanExpected = record.difference < 0;
            return (
              <Pressable
                key={record.id}
                accessibilityRole="button"
                onPress={() => openInventoryCountDetails(record)}
                style={({ pressed }) => [styles.discrepancyRecordCard, pressed && styles.pressed]}
              >
                <Text style={styles.discrepancyRecordTitle}>{record.ingredientName} · {status}</Text>
                <Text style={styles.discrepancyRecordLine}>
                  Expected {formatDailyUnitQuantity(record.expectedQuantity, record.unit)} ·{' '}
                  Actual {formatDailyUnitQuantity(record.actualQuantity, record.unit)}
                </Text>
                <Text style={styles.discrepancyDifference}>
                  Difference: {formatDailyDifference(record.difference, record.unit)}
                  {' · '}{lowerThanExpected ? 'Lower than expected' : 'Higher than expected'}
                </Text>
                <Text style={styles.discrepancyRecordMeta}>
                  {record.branchName} · {formatHistoryDateTime(new Date(record.submittedAt))}
                </Text>
                <Text style={styles.discrepancyRecordMeta}>
                  Submitted by: {record.submittedBy}
                </Text>
                <Text style={styles.discrepancyRecordMeta}>
                  Remarks: {record.remarks?.trim() ? record.remarks : 'None provided'}
                </Text>
                {adjusted ? (
                  <Text style={styles.discrepancyAdjustmentNote}>Adjustment authorized by owner.</Text>
                ) : null}
                <Text style={styles.discrepancyViewLink}>View discrepancy details ›</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.discrepancyEmptyState}>
          <Text style={styles.inventoryReportEmpty}>No records to display.</Text>
        </View>
      )}
      {records.length ? (
        <>
          <Text style={styles.discrepancyFooter}>
            Read-only records · Newest first.
          </Text>
          <Text style={styles.discrepancyFooter}>
            Unsubmitted discrepancies are reviewed separately.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRoute('dailyInventoryCheck')}
            style={styles.discrepancyNeutralButton}
          >
            <Text style={styles.discrepancyNeutralButtonText}>Review unsubmitted discrepancy</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );

  const renderInventoryCountRecords = (
    records: InventoryCountRecord[],
    discrepancy: boolean,
  ) => records.length === 0 ? (
    <Text style={styles.inventoryReportEmpty}>No records to display.</Text>
  ) : (
    <View style={styles.inventoryReportRecordList}>
      {records.map((record) => (
        <Pressable
          key={record.id}
          accessibilityRole="button"
          onPress={() => openInventoryCountDetails(record)}
          style={({ pressed }) => [
            styles.inventoryReportRecord,
            discrepancy && (record.difference < 0 ? styles.inventoryReportShortage : styles.inventoryReportExcess),
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.inventoryReportRecordHeading}>
            <Text style={styles.inventoryReportRecordTitle}>{record.ingredientName}</Text>
            {discrepancy ? (
              <Text style={[
                styles.inventoryReportStatus,
                record.adjustment || record.countStatus === 'Validated'
                  ? styles.inventoryStatusNormal
                  : record.difference < 0 ? styles.inventoryStatusOut : styles.inventoryStatusLow,
              ]}>{record.adjustment
                ? 'Adjusted'
                : record.countStatus === 'Validated'
                  ? 'Validated'
                  : 'Pending Review'}</Text>
            ) : (
              <Text style={[
                styles.inventoryReportStatus,
                record.countStatus === 'Validated' ? styles.inventoryStatusNormal : styles.inventoryStatusLow,
              ]}>{record.countStatus}</Text>
            )}
          </View>
          <Text style={styles.inventoryReportRecordDetail}>Expected {formatDailyUnitQuantity(record.expectedQuantity, record.unit)}</Text>
          <Text style={styles.inventoryReportRecordDetail}>
            Actual {formatDailyUnitQuantity(record.actualQuantity, record.unit)}
            {record.revisedActualQuantity !== null
              ? ` · Revised actual ${formatDailyUnitQuantity(record.revisedActualQuantity, record.unit)}`
              : ''}
          </Text>
          <Text style={[
            styles.inventoryReportRecordDifference,
            record.difference < 0 ? styles.inventoryReportDifferenceNegative : styles.inventoryReportDifferencePositive,
          ]}>{formatDailyDifference(record.difference, record.unit)}</Text>
          <Text style={styles.inventoryReportRecordDetail}>
            {record.branchName} · {formatHistoryDateTime(new Date(record.submittedAt))}
          </Text>
          {discrepancy ? (
            <>
              <Text style={styles.inventoryReportRecordDetail}>Submitting employee account: {record.submittedBy}</Text>
              <Text style={styles.inventoryReportRecordDetail}>Staff remarks: {record.remarks || '—'}</Text>
            </>
          ) : null}
          <Text style={styles.inventoryReportRecordLink}>View original count and revision history ›</Text>
        </Pressable>
      ))}
    </View>
  );

  const renderTotalIngredientQuantityReport = (data: InventoryReportData | null) => {
    const reportDate = data?.generatedAt
      ? formatDate(new Date(data.generatedAt))
      : formatDate(manilaBusinessDate());
    const ingredients = data?.ingredients ?? [];
    const missingQuantityCount = ingredients.filter((item) => item.quantity == null).length;

    return (
      <ScrollView
        style={styles.inventoryReportScroll}
        contentContainerStyle={styles.totalQuantityReportContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.totalQuantityMetadata}>
          <Text style={styles.totalQuantityMetadataText}>{assignedBranch} · {reportDate}</Text>
          <Text style={styles.totalQuantityMetadataText}>Snapshot time: Not recorded</Text>
          {data ? (
            <Text style={styles.totalQuantityMetadataText}>
              {ingredients.length} listed {ingredients.length === 1 ? 'item' : 'items'} · {missingQuantityCount}{' '}
              {missingQuantityCount === 1 ? 'quantity' : 'quantities'} not recorded
            </Text>
          ) : null}
        </View>

        <Text style={styles.totalQuantityInstruction}>Scroll to view all rows and columns.</Text>

        {inventoryReportLoading ? (
          <View style={styles.totalQuantityState}>
            <ActivityIndicator color={colors.pink} />
            <Text style={styles.totalQuantityStateText}>Loading report...</Text>
          </View>
        ) : inventoryReportError ? (
          <View style={styles.totalQuantityState}>
            <Text style={styles.inventoryReportErrorText}>
              Unable to load data. Please check your internet connection and try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setInventoryReportRefreshKey((key) => key + 1)}
              style={styles.dailySalesRetryButton}
            >
              <Text style={styles.dailySalesRetryText}>Retry</Text>
            </Pressable>
          </View>
        ) : data ? (
          ingredients.length > 0 ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={styles.totalQuantityTable}>
                  <View style={[styles.totalQuantityTableRow, styles.totalQuantityTableHeader]}>
                    <Text style={[styles.totalQuantityCell, styles.totalQuantityIngredientCell]}>Ingredient</Text>
                    <Text style={[styles.totalQuantityCell, styles.totalQuantityExpectedCell]}>Expected</Text>
                    <Text style={[styles.totalQuantityCell, styles.totalQuantityUnitCell]}>Unit</Text>
                  </View>
                  {ingredients.map((item) => (
                    <View key={item.id} style={styles.totalQuantityTableRow}>
                      <Text style={[styles.totalQuantityCell, styles.totalQuantityIngredientCell]}>{item.name}</Text>
                      <Text style={[styles.totalQuantityCell, styles.totalQuantityExpectedCell]}>
                        {item.quantity == null ? 'Not recorded' : formatInventoryQuantity(item.quantity, 3)}
                      </Text>
                      <Text style={[styles.totalQuantityCell, styles.totalQuantityUnitCell]}>{item.unit}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>

              {ingredients.filter((item) => item.quantity == null).map((item) => (
                <Text key={`${item.id}-missing`} style={styles.totalQuantityNote}>
                  {item.name}: expected quantity not recorded.
                </Text>
              ))}
              {ingredients.filter((item) =>
                item.id === 'prepared-batter' && item.unit === 'bottle' && item.quantity != null,
              ).map((item) => (
                <Text key={`${item.id}-conversion`} style={styles.totalQuantityNote}>
                  Takoyaki batter: {formatInventoryQuantity(item.quantity, 0)} bottles × 680 ml ={' '}
                  {formatInventoryQuantity(item.quantity * 680, 0)} ml.
                </Text>
              ))}
              <Text style={styles.totalQuantityReadOnly}>Read-only · Assigned branch only.</Text>
            </>
          ) : (
            <Text style={styles.inventoryReportEmpty}>No records to display.</Text>
          )
        ) : null}
      </ScrollView>
    );
  };

  const renderInventoryReportDetail = () => {
    const data = inventoryReportData;
    const title = inventoryReportTitles[selectedInventoryReport];
    return (
      <View style={styles.inventoryReportPage}>
        {renderInventoryReportHeader(title, 'Back', () => setRoute('inventory'))}
        {selectedInventoryReport === 'totalIngredientQuantity' ? (
          renderTotalIngredientQuantityReport(data)
        ) : (
          <>
            {renderInventoryReportState()}
            {!inventoryReportLoading && !inventoryReportError && data ? (
          <ScrollView
            contentContainerStyle={[
              styles.inventoryReportContent,
              selectedInventoryReport === 'ingredientStockStatus' && styles.stockStatusReportContent,
            ]}
            showsVerticalScrollIndicator={false}
          >
            {renderInventoryReportMetadata(data)}
            {selectedInventoryReport === 'ingredientCategorySummary' ? (
              data.categories.length ? (
                <>
                  <View style={styles.categoryReportCategoryList}>
                    {data.categories.map((group) => {
                      const expanded = expandedInventoryCategories.has(group.category);
                      return (
                        <View key={group.category} style={styles.categoryReportCategory}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ expanded }}
                            onPress={() => setExpandedInventoryCategories((current) => {
                              const next = new Set(current);
                              if (next.has(group.category)) next.delete(group.category);
                              else next.add(group.category);
                              return next;
                            })}
                            style={styles.categoryReportCategoryHeading}
                          >
                            <View style={styles.categoryReportCategoryCopy}>
                              <Text style={styles.categoryReportCategoryTitle}>{group.category}</Text>
                              <Text style={styles.categoryReportCategoryCount}>
                                {' · '}{group.ingredientCount} {group.ingredientCount === 1 ? 'ingredient' : 'ingredients'}
                              </Text>
                            </View>
                            <Text style={styles.categoryReportExpand}>{expanded ? '−' : '+'}</Text>
                          </Pressable>
                          {expanded ? (
                            <View style={styles.categoryReportItems}>
                              {group.ingredients.map((item) => (
                                <View key={item.id} style={styles.categoryReportItem}>
                                  <Text style={styles.categoryReportItemName}>
                                    {item.name}
                                    {' · '}
                                    {item.quantity == null
                                      ? 'Not recorded'
                                      : formatDailyUnitQuantity(item.quantity, item.unit)}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                  <Text style={styles.categoryReportInstruction}>Different units are never added together.</Text>
                </>
              ) : <Text style={styles.inventoryReportEmpty}>No records to display.</Text>
            ) : null}
            {selectedInventoryReport === 'ingredientStockStatus' ? (
              data.ingredients.length
                ? renderIngredientStockStatusCards(data.ingredients)
                : (
                    <View style={styles.stockStatusEmptyState}>
                      <Text style={styles.inventoryReportEmpty}>No records to display.</Text>
                    </View>
                  )
            ) : null}
            {selectedInventoryReport === 'branchInventorySummary' ? (
              renderBranchInventorySummary(data.ingredients)
            ) : null}
            {selectedInventoryReport === 'inventoryDiscrepancy'
              ? renderInventoryDiscrepancyRecords(data.discrepancies)
              : null}
            {selectedInventoryReport === 'physicalInventoryCount'
              ? renderPhysicalInventoryCountCards(data.physicalCounts)
              : null}
          </ScrollView>
            ) : null}
          </>
        )}
      </View>
    );
  };

  const renderInventoryCountDetails = () => {
    const record = inventoryReportData?.physicalCounts.find((count) => count.id === selectedInventoryCountId);
    const fromHistory = countDetailsReturnRoute === 'transactionDetails';
    const backLabel = fromHistory ? 'Back to transaction details' : 'Back to report';
    if (!record) {
      return (
        <View style={styles.inventoryReportPage}>
          {renderInventoryReportHeader('Count details', backLabel, () => setRoute(countDetailsReturnRoute))}
          <View style={styles.inventoryReportState}>
            {inventoryReportLoading ? (
              <>
                <ActivityIndicator color={colors.pink} />
                <Text style={styles.inventoryReportRecordDetail}>Loading the count…</Text>
              </>
            ) : (
              <>
                <Text style={styles.inventoryReportErrorText}>
                  {inventoryReportError || 'Count details are unavailable. Go back and try again.'}
                </Text>
                <Pressable onPress={() => setRoute(countDetailsReturnRoute)} style={styles.dailySalesRetryButton}>
                  <Text style={styles.dailySalesRetryText}>{backLabel}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      );
    }
    if (selectedInventoryReport === 'physicalInventoryCount' && !countCorrectionView) {
      const validated = record.countStatus === 'Validated' || Boolean(record.validation) || Boolean(record.adjustment);
      const matches = record.difference === 0;
      const actualQuantity = record.revisedActualQuantity ?? record.actualQuantity;
      return (
        <View style={styles.inventoryReportPage}>
          {renderInventoryReportHeader(
            'Physical Inventory Count Report',
            'Back to physical count report',
            () => setRoute('inventoryReport'),
          )}
          <ScrollView
            contentContainerStyle={[styles.inventoryReportContent, styles.physicalCountDetailContent]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.physicalCountDetailMeta}>
              {record.branchName} · {formatHistoryDateTime(new Date(record.submittedAt))}
            </Text>
            <View style={styles.physicalCountDetailCard}>
              <Text style={styles.physicalCountDetailTitle}>
                {record.ingredientName} · {validated ? 'Validated' : 'Submitted'}
              </Text>
              {validated ? (
                <>
                  <Text style={styles.physicalCountDetailLine}>
                    Expected {formatDailyUnitQuantity(record.expectedQuantity, record.unit)} ·{' '}
                    Actual {formatDailyUnitQuantity(record.originalActualQuantity, record.unit)}
                  </Text>
                  <Text style={[
                    styles.physicalCountDifference,
                    matches ? styles.physicalCountDifferenceNeutral : styles.physicalCountDifferenceNegative,
                  ]}>
                    Difference {formatDailyDifference(record.difference, record.unit)}
                    {' · '}{countDifferenceLabel(record.difference)}
                  </Text>
                  <Text style={styles.physicalCountDetailMeta}>
                    {formatHistoryDateTime(new Date(record.submittedAt))}
                  </Text>
                  <Text style={styles.physicalCountDetailMeta}>
                    Employee account: {record.submittedBy}
                  </Text>
                </>
              ) : record.revisedActualQuantity !== null ? (
                <>
                  <Text style={styles.physicalCountDetailLine}>
                    Expected {formatDailyUnitQuantity(record.expectedQuantity, record.unit)} ·{' '}
                    Revised actual {formatDailyUnitQuantity(actualQuantity, record.unit)}
                  </Text>
                  <Text style={[
                    styles.physicalCountDifference,
                    matches ? styles.physicalCountDifferenceNeutral : styles.physicalCountDifferenceNegative,
                  ]}>
                    Difference {formatDailyDifference(record.difference, record.unit)}
                    {' · '}{countDifferenceLabel(record.difference)}
                  </Text>
                  <Text style={styles.physicalCountDetailMeta}>
                    {formatHistoryDateTime(new Date(record.submittedAt))}
                  </Text>
                  <Text style={styles.physicalCountDetailMeta}>
                    Employee account: {record.submittedBy}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.physicalCountDetailLine}>
                    Expected {formatDailyUnitQuantity(record.expectedQuantity, record.unit)} ·{' '}
                    Actual {formatDailyUnitQuantity(record.actualQuantity, record.unit)}
                  </Text>
                  <Text style={[
                    styles.physicalCountDifference,
                    matches ? styles.physicalCountDifferenceNeutral : styles.physicalCountDifferenceNegative,
                  ]}>
                    Difference {formatDailyDifference(record.difference, record.unit)}
                    {' · '}{countDifferenceLabel(record.difference)}
                  </Text>
                  <Text style={styles.physicalCountDetailMeta}>
                    {formatHistoryDateTime(new Date(record.submittedAt))}
                  </Text>
                </>
              )}
            </View>

            {validated ? (
              <View style={styles.physicalCountDetailCard}>
                <Text style={styles.physicalCountSectionTitle}>Owner validation</Text>
                <Text style={styles.physicalCountDetailLine}>
                  Original submitted count: {formatDailyUnitQuantity(record.originalActualQuantity, record.unit)}
                </Text>
                <Text style={styles.physicalCountDetailLine}>Validated by owner · Locked.</Text>
                <Text style={styles.physicalCountDetailLine}>Validated counts cannot be edited directly.</Text>
              </View>
            ) : record.revisedActualQuantity !== null ? (
              <View style={styles.physicalCountDetailCard}>
                <Text style={styles.physicalCountSectionTitle}>Revision history</Text>
                <Text style={styles.physicalCountDetailLine}>
                  Original {formatDailyUnitQuantity(record.originalActualQuantity, record.unit)}
                  {' → '}Revised {formatDailyUnitQuantity(record.revisedActualQuantity, record.unit)}
                </Text>
                <Text style={styles.physicalCountDetailLine}>Editor: {record.submittedBy}</Text>
                {record.correctionRequests.length ? (
                  record.correctionRequests.map((request) => (
                    <Text key={request.requestId} style={styles.physicalCountDetailLine}>
                      Reason: {request.reason}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.physicalCountDetailLine}>Reason: Revision recorded by owner.</Text>
                )}
                <Text style={styles.physicalCountDetailLine}>
                  {formatHistoryDateTime(new Date(record.submittedAt))}
                </Text>
                <Text style={styles.physicalCountDetailLine}>Owner-approved correction</Text>
                <Text style={styles.physicalCountDetailLine}>
                  Original count remains available in this history.
                </Text>
              </View>
            ) : (
              <View style={styles.physicalCountDetailCard}>
                <Text style={styles.physicalCountSectionTitle}>Submitted count</Text>
                <Text style={styles.physicalCountDetailLine}>
                  Submitted count: {formatDailyUnitQuantity(record.actualQuantity, record.unit)}
                </Text>
                <Text style={styles.physicalCountDetailLine}>
                  {matches ? 'No difference from the expected quantity.' : 'A difference from the expected quantity remains for review.'}
                </Text>
                <Text style={styles.physicalCountDetailLine}>
                  Only Submitted and Validated counts are included; drafts are excluded.
                </Text>
              </View>
            )}
            <Text style={styles.physicalCountReadOnly}>
              {validated
                ? 'Read-only · Count changes require a correction request, made from this count in Transaction History.'
                : record.revisedActualQuantity !== null
                  ? 'No direct editing. Count changes require a correction request, made from this count in Transaction History.'
                  : 'Read-only · Count changes require a correction request, made from this count in Transaction History.'}
            </Text>
            {record.submittedBy === user.id && !validated &&
              // The server accepts corrections only for counts that differ from the expected quantity.
              record.originalActualQuantity !== record.expectedQuantity &&
              !record.correctionRequests.some((request) => request.status === 'pending') &&
              !pendingCountCorrections.some((request) => request.countLineId === record.id) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Request a correction for the ${record.ingredientName} count`}
                  onPress={() => {
                    setSelectedCorrectionCountLineId(record.id);
                    setCorrectionActualQuantity(String(record.originalActualQuantity));
                    setCorrectionReason('');
                    setCorrectionFormError('');
                    setCountCorrectionView(true);
                  }}
                  style={styles.discrepancyNeutralButton}
                >
                  <Text style={styles.discrepancyNeutralButtonText}>Request a correction</Text>
                </Pressable>
              ) : record.correctionRequests.length || pendingCountCorrections.some((request) => request.countLineId === record.id) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setCountCorrectionView(true)}
                  style={styles.discrepancyNeutralButton}
                >
                  <Text style={styles.discrepancyNeutralButtonText}>View correction requests</Text>
                </Pressable>
              ) : null}
            {validated || record.revisedActualQuantity !== null ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSelectedInventoryReport('inventoryDiscrepancy');
                  setRoute('inventoryReport');
                }}
                style={styles.discrepancyNeutralButton}
              >
                <Text style={styles.discrepancyNeutralButtonText}>View discrepancy</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      );
    }
    if (selectedInventoryReport === 'inventoryDiscrepancy' && !countCorrectionView) {
      const adjusted = Boolean(record.adjustment) || record.countStatus === 'Validated';
      const status = adjusted ? 'Adjusted' : 'Pending Review';
      const lowerThanExpected = record.difference < 0;
      return (
        <View style={styles.inventoryReportPage}>
          {renderInventoryReportHeader(
            'Inventory Discrepancy Report',
            'Back to discrepancy report',
            () => setRoute('inventoryReport'),
          )}
          <ScrollView
            contentContainerStyle={[
              styles.inventoryReportContent,
              styles.discrepancyDetailContent,
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.discrepancyDetailMetadata}>
              {record.branchName} · {formatHistoryDateTime(new Date(record.submittedAt))}
            </Text>
            <Text style={styles.discrepancyDetailTitle}>
              {record.ingredientName} · {status}
            </Text>
            <Text style={styles.discrepancyDetailSummary}>
              Expected {formatDailyUnitQuantity(record.expectedQuantity, record.unit)} ·{' '}
              Actual {formatDailyUnitQuantity(record.actualQuantity, record.unit)}
            </Text>
            <Text style={styles.discrepancyDetailDifference}>
              Difference: {formatDailyDifference(record.difference, record.unit)}
              {' · '}{lowerThanExpected ? 'Lower than expected' : 'Higher than expected'}
            </Text>
            <View style={styles.discrepancyDetailCard}>
              {[
                ['Item', record.ingredientName],
                ['Expected quantity', formatDailyUnitQuantity(record.expectedQuantity, record.unit)],
                ['Actual quantity', formatDailyUnitQuantity(record.actualQuantity, record.unit)],
                ['Difference', formatDailyDifference(record.difference, record.unit)],
                ['Branch', record.branchName],
                ['Date and time', new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'Asia/Manila',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }).format(new Date(record.submittedAt)).replace(',', '')],
                ['Employee account', record.submittedBy],
              ].map(([label, value]) => (
                <View key={label} style={styles.discrepancyDetailRow}>
                  <Text style={styles.discrepancyDetailLabel}>{label}</Text>
                  <Text style={[
                    styles.discrepancyDetailValue,
                    label === 'Difference' && styles.discrepancyDetailDifferenceValue,
                  ]}>{value}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.discrepancyDetailReadOnly}>
              {adjusted
                ? 'Read-only record · Adjustment authorized by owner.'
                : 'Read-only record · Difference remains for owner review.'}
            </Text>
            <Text style={styles.discrepancyReviewStatus}>Review status: {status}</Text>
            {adjusted ? (
              <>
                <Text style={styles.discrepancyReviewText}>
                  Staff remarks: {record.remarks?.trim() ? record.remarks : 'None provided'}
                </Text>
                <Text style={styles.discrepancyReviewText}>
                  Count changes require a correction request, made from this count in Transaction History.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.discrepancyReviewText}>
                  Staff remarks (locked): {record.remarks?.trim() ? record.remarks : 'None provided'}
                </Text>
                {record.revisedActualQuantity !== null ? (
                  <Text style={styles.discrepancyReviewText}>
                    Original {formatDailyUnitQuantity(record.originalActualQuantity, record.unit)}
                    {' → '}Revised {formatDailyUnitQuantity(record.revisedActualQuantity, record.unit)}
                    {' by owner-approved correction. Original value retained.'}
                  </Text>
                ) : null}
                <Text style={styles.discrepancyReviewText}>
                  Count corrections do not approve the discrepancy.
                </Text>
              </>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSelectedInventoryReport('physicalInventoryCount');
                setRoute('inventoryCountDetails');
              }}
              style={styles.discrepancyNeutralButton}
            >
              <Text style={styles.discrepancyNeutralButtonText}>
                {adjusted ? 'View physical count' : 'View count revision history'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      );
    }
    return (
      <View style={styles.inventoryReportPage}>
        {renderInventoryReportHeader('Physical count details', fromHistory ? backLabel : countCorrectionView ? 'Back to count details' : 'Back to report',
          () => (fromHistory ? setRoute('transactionDetails') : countCorrectionView ? setCountCorrectionView(false) : setRoute('inventoryReport')))}
        <ScrollView contentContainerStyle={styles.inventoryReportContent} showsVerticalScrollIndicator={false}>
          <View style={styles.inventoryReportMetadata}>
            <Text style={styles.inventoryReportMetadataText}>Branch: {record.branchName}</Text>
            <Text style={styles.inventoryReportMetadataText}>Submitted: {formatHistoryDateTime(new Date(record.submittedAt))}</Text>
            <Text style={styles.inventoryReportMetadataText}>Submitting employee account: {record.submittedBy === user.id ? user.displayName : 'Another staff member'}</Text>
            <Text style={styles.inventoryReportMetadataText}>Transaction reference: {record.reference}</Text>
          </View>
          <View style={styles.inventoryReportRecord}>
            <Text style={styles.inventoryReportRecordTitle}>{record.ingredientName}</Text>
            <Text style={styles.inventoryReportRecordDetail}>Expected: {formatDailyUnitQuantity(record.expectedQuantity, record.unit)}</Text>
            <Text style={styles.inventoryReportRecordDetail}>Original actual: {formatDailyUnitQuantity(record.originalActualQuantity, record.unit)}</Text>
            {record.revisedActualQuantity !== null ? (
              <Text style={styles.inventoryReportRecordDetail}>Revised actual after Owner adjustment: {formatDailyUnitQuantity(record.revisedActualQuantity, record.unit)}</Text>
            ) : null}
            <Text style={styles.inventoryReportRecordDetail}>Difference: {formatDailyDifference(record.difference, record.unit)}</Text>
            <Text style={styles.inventoryReportRecordDetail}>Result: {record.result}</Text>
            <Text style={styles.inventoryReportRecordDetail}>Count status: {record.countStatus}</Text>
            <Text style={styles.inventoryReportRecordDetail}>Staff remarks: {record.remarks || '—'}</Text>
            <Text style={styles.inventoryReportRecordDetail}>
              Inventory revision snapshot: {record.inventoryRevision ?? 'Not recorded'}
            </Text>
          </View>
          {record.adjustment ? (
            <View style={styles.inventoryReportRecord}>
              <Text style={styles.inventoryReportRecordTitle}>Owner adjustment history</Text>
              <Text style={styles.inventoryReportRecordDetail}>Status: Adjusted</Text>
              <Text style={styles.inventoryReportRecordDetail}>Adjustment reference: {record.adjustment.reference}</Text>
              <Text style={styles.inventoryReportRecordDetail}>Adjusted by account: {record.adjustment.actorId}</Text>
              <Text style={styles.inventoryReportRecordDetail}>Adjusted: {formatHistoryDateTime(new Date(record.adjustment.createdAt))}</Text>
              <Text style={styles.inventoryReportRecordDetail}>
                Inventory: {formatDailyUnitQuantity(record.adjustment.beforeQuantity, record.unit)}
                {' → '}{formatDailyUnitQuantity(record.adjustment.afterQuantity, record.unit)}
              </Text>
            </View>
          ) : null}
          {record.correctionRequests.length ? (
            <View style={styles.inventoryReportRecord}>
              <Text style={styles.inventoryReportRecordTitle}>Correction request history</Text>
              {record.correctionRequests.map((request) => (
                <View key={request.requestId} style={styles.inventoryReportCorrection}>
                  <Text style={styles.inventoryReportRecordDetail}>
                    {request.status.toUpperCase()} · corrected actual {formatDailyUnitQuantity(request.correctedActualQuantity, record.unit)}
                  </Text>
                  <Text style={styles.inventoryReportRecordDetail}>Staff reason: {request.reason}</Text>
                  {request.decisionReason ? (
                    <Text style={styles.inventoryReportRecordDetail}>Owner decision: {request.decisionReason}</Text>
                  ) : null}
                  {request.decidedAt ? (
                    <Text style={styles.inventoryReportRecordDetail}>
                      Decided: {formatHistoryDateTime(new Date(request.decidedAt))}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
          {record.validation ? (
            <View style={styles.inventoryReportRecord}>
              <Text style={styles.inventoryReportRecordTitle}>Owner Validate Count audit</Text>
              <Text style={styles.inventoryReportRecordDetail}>
                Result: {record.validation.outcome === 'no_change' ? 'Resolved without inventory change' : 'Inventory adjusted'}
              </Text>
              <Text style={styles.inventoryReportRecordDetail}>Owner reason: {record.validation.reason}</Text>
              <Text style={styles.inventoryReportRecordDetail}>
                Validated: {formatHistoryDateTime(new Date(record.validation.validatedAt))}
              </Text>
            </View>
          ) : null}
          {countCorrectionNotice?.countLineId === record.id ? (
            <Text style={styles.inventoryReportRecordDetail} accessibilityRole="alert"><AppIcon name="success" style={styles.inventoryReportRecordDetail} /> {countCorrectionNotice.text}</Text>
          ) : null}
          {countCorrectionStorageError ? (
            <Text style={styles.inventoryReportErrorText} accessibilityRole="alert">{countCorrectionStorageError}</Text>
          ) : null}
              {countCorrectionMessages[record.id] ? (
                <Text style={styles.inventoryReportErrorText} accessibilityRole="alert">
                  {countCorrectionMessages[record.id]}
                </Text>
              ) : null}
          {pendingCountCorrections.filter((request) => request.countLineId === record.id).map((request) => (
            <View key={request.requestId} style={styles.inventoryReportCorrectionPending}>
              <Text style={styles.inventoryReportRecordDetail}>
                Correction request saved on this device and awaiting confirmation.
              </Text>
              {countCorrectionRetryErrors[request.requestId] ? (
                <Text style={styles.inventoryReportErrorText} accessibilityRole="alert">
                  {countCorrectionRetryErrors[request.requestId]}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={countCorrectionRetryLocks.current.has(request.requestId)}
                onPress={() => void retryCountCorrectionRequest(request)}
                style={styles.inventoryReportAction}
              >
                <Text style={styles.inventoryReportActionText}>
                  {countCorrectionRetryLocks.current.has(request.requestId) ? 'Submitting…' : 'Retry submission'}
                </Text>
              </Pressable>
            </View>
          ))}
          {record.submittedBy === user.id &&
            !record.validation &&
            !record.adjustment &&
            !record.correctionRequests.some((request) => request.status === 'pending') &&
            !pendingCountCorrections.some((request) => request.countLineId === record.id) &&
            record.originalActualQuantity !== record.expectedQuantity ? (
              selectedCorrectionCountLineId === record.id ? (
                <View style={styles.inventoryReportRecord}>
                  <Text style={styles.inventoryReportRecordTitle}>Request count correction</Text>
                  <Text style={styles.inventoryReportRecordDetail}>
                    Original expected and actual quantities remain unchanged. The Owner must decide this request before using Validate Count.
                  </Text>
                  <Text style={styles.fieldLabel}>Corrected actual quantity ({record.unit})</Text>
                  <TextInput
                    value={correctionActualQuantity}
                    onChangeText={(value) => {
                      setCorrectionActualQuantity(value);
                      setCorrectionFormError('');
                    }}
                    keyboardType="decimal-pad"
                    accessibilityLabel="Corrected actual quantity"
                    editable={!correctionSubmitting}
                    style={[styles.textInput, correctionFormError && styles.textInputError]}
                  />
                  <Text style={styles.fieldLabel}>Reason for correction</Text>
                  <TextInput
                    value={correctionReason}
                    onChangeText={(value) => {
                      setCorrectionReason(value);
                      setCorrectionFormError('');
                    }}
                    accessibilityLabel="Reason for count correction"
                    maxLength={1000}
                    multiline
                    editable={!correctionSubmitting}
                    style={[
                      styles.textInput,
                      { minHeight: 74, textAlignVertical: 'top' },
                      correctionFormError && styles.textInputError,
                    ]}
                  />
                  {correctionFormError ? (
                    <Text style={styles.inventoryReportErrorText} accessibilityRole="alert">{correctionFormError}</Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    disabled={correctionSubmitting}
                    onPress={() => void submitCountCorrectionRequest()}
                    style={[styles.inventoryReportAction, correctionSubmitting && styles.confirmButtonDisabled]}
                  >
                    {correctionSubmitting
                      ? <ActivityIndicator size="small" color={colors.white} />
                      : <Text style={styles.inventoryReportActionText}>Submit correction request</Text>}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={correctionSubmitting}
                    onPress={() => setSelectedCorrectionCountLineId(null)}
                    style={styles.inventoryReportBackButton}
                  >
                    <Text style={styles.inventoryReportBackText}>Cancel</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setSelectedCorrectionCountLineId(record.id);
                    setCorrectionActualQuantity(String(record.originalActualQuantity));
                    setCorrectionReason('');
                    setCorrectionFormError('');
                  }}
                  style={styles.inventoryReportAction}
                >
                  <Text style={styles.inventoryReportActionText}>Request count correction</Text>
                </Pressable>
              )
            ) : null}
        </ScrollView>
      </View>
    );
  };

  const renderMore = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.morePageContent} showsVerticalScrollIndicator={false}>
      {renderTopHeader('More')}
      {renderStaffIdentityCard()}
      <View style={styles.moreNavigationList}>
        {([
          {
            icon: 'sales' as AppIconName,
            title: 'Daily Sales',
            description: 'Count, compare and submit for review',
            onPress: () => {
              setNavigationOrigin('more');
              openDailySales();
            },
          },
          {
            icon: 'dailyCount' as AppIconName,
            title: 'Physical Inventory',
            description: 'Count, compare and submit for review',
            onPress: () => {
              setNavigationOrigin('more');
              void startDailyInventoryCheck();
            },
          },
          {
            icon: 'history' as AppIconName,
            title: 'Transaction history',
            description: "Your branch's complete stock ledger",
            onPress: () => {
              setNavigationOrigin('more');
              setRoute('stockHistory');
            },
          },
          {
            icon: 'profile' as AppIconName,
            title: 'Profile & settings',
            description: 'Account, access and secure logout',
            onPress: () => {
              setNavigationOrigin('more');
              setRoute('profileSettings');
            },
          },
        ]).map((option) => (
          <Pressable
            key={option.title}
            accessibilityRole="button"
            disabled={option.title === 'Physical Inventory' && dailyCheckStarting}
            onPress={option.onPress}
            style={({ pressed }) => [styles.moreNavigationCard, pressed && styles.pressed]}
          >
            <View style={styles.moreNavigationIcon}>
              <AppIcon name={option.icon} style={styles.moreNavigationIconText} />
            </View>
            <View style={styles.moreNavigationCopy}>
              <Text style={styles.moreNavigationTitle}>{option.title}</Text>
              <Text style={styles.moreNavigationDescription}>{option.description}</Text>
            </View>
            <AppIcon name="forward" style={styles.moreNavigationChevron} />
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={openLogoutConfirmation}
        style={({ pressed }) => [styles.logoutButton, styles.moreLogoutButton, pressed && styles.pressed]}
      >
        <Text style={styles.logoutButtonText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );

  const renderDailySales = () => {
    const productQuantity = dailySalesSummary?.products.reduce((total, product) => total + product.quantity, 0) ?? 0;
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.dailySalesContent} showsVerticalScrollIndicator={false}>
        <View style={styles.formHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to More" onPress={() => setRoute('more')} style={styles.backButton}>
            <AppIcon name="back" style={styles.backGlyph} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Daily Sales</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} · {formatDate(dailySalesDate)}</Text>
          </View>
        </View>
        {dailySalesLoading ? (
          <View style={styles.dailySalesLoading}>
            <ActivityIndicator color={colors.pink} />
            <Text style={styles.dailySalesStateText}>Generating daily sales…</Text>
          </View>
        ) : dailySalesError ? (
          <View style={styles.dailySalesError}>
            <Text style={styles.dailySalesErrorText}>{dailySalesError}</Text>
            <Pressable accessibilityRole="button" onPress={() => setDailySalesRefreshKey((key) => key + 1)} style={[styles.dailySalesRetryButton, styles.dailySalesFullButton]}>
              <Text style={styles.dailySalesRetryText}>Retry</Text>
            </Pressable>
          </View>
        ) : dailySalesSummary ? (
          <>
            <View style={styles.dailySalesTotals}>
              <Text style={styles.dailySalesSummaryEyebrow}>Total sales · {formatSaleMoney(dailySalesSummary.totalSales)}</Text>
              <View style={styles.dailySalesSummaryLine}>
                <Text style={styles.dailySalesSummaryMeta}>{dailySalesSummary.transactionCount} confirmed {dailySalesSummary.transactionCount === 1 ? 'transaction' : 'transactions'}</Text>
                <Text style={styles.dailySalesSummaryMeta}>{formatQuantity(productQuantity)} products sold</Text>
              </View>
            </View>
            {dailySalesSummary.transactionCount === 0 ? (
              <View style={styles.dailySalesEmptyCard}>
                <Text style={styles.dailySalesEmptyTotal}>{formatSaleMoney(0)} · 0 transactions</Text>
                <Text style={styles.dailySalesEmpty}>No sales recorded for this day.</Text>
              </View>
            ) : (
              <>
                <View style={styles.dailySalesSection}>
                  <Text style={styles.sectionTitle}>Sales per Payment Method</Text>
                  <View style={styles.dailySalesRows}>
                    {dailySalesSummary.paymentMethods.map((payment) => (
                      <View key={payment.paymentMethod} style={styles.dailySalesRow}>
                        <View style={styles.dailySalesRowCopy}>
                          <Text style={styles.dailySalesRowTitle}>{payment.paymentMethod}</Text>
                          <Text style={styles.dailySalesRowDetail}>{payment.transactionCount} {payment.transactionCount === 1 ? 'transaction' : 'transactions'}</Text>
                        </View>
                        <Text style={styles.dailySalesRowAmount}>{formatSaleMoney(payment.totalSales)}</Text>
                      </View>
                    ))}
                    <View style={styles.dailySalesRow}>
                      <Text style={styles.dailySalesRowTitle}>Total</Text>
                      <Text style={styles.dailySalesRowAmount}>{formatSaleMoney(dailySalesSummary.totalSales)}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.dailySalesSection}>
                  <Text style={styles.sectionTitle}>Products Sold</Text>
                  <View style={styles.dailySalesRows}>
                    {dailySalesSummary.products.map((product) => (
                      <View key={`${product.productId}-${product.variationName ?? 'base'}`} style={styles.dailySalesRow}>
                        <View style={styles.dailySalesRowCopy}>
                          <Text style={styles.dailySalesRowTitle} numberOfLines={2}>
                            {product.productName}{product.variationName ? ` · ${product.variationName}` : ''}
                          </Text>
                          <Text style={styles.dailySalesRowDetail}>
                            {product.variationName ?? 'Item'} · Quantity {formatQuantity(product.quantity)} · {formatSaleMoney(product.unitPrice ?? (product.quantity ? product.totalSales / product.quantity : product.totalSales))}
                          </Text>
                        </View>
                        <Text style={styles.dailySalesRowAmount}>{formatSaleMoney(product.totalSales)}</Text>
                      </View>
                    ))}
                    <View style={styles.dailySalesRow}>
                      <Text style={styles.dailySalesRowTitle}>Total · Quantity {formatQuantity(productQuantity)}</Text>
                      <Text style={styles.dailySalesRowAmount}>{formatSaleMoney(dailySalesSummary.totalSales)}</Text>
                    </View>
                  </View>
                </View>
              </>
            )}
            <View style={styles.dailySalesSection}>
              <Text style={styles.sectionTitle}>Receipts</Text>
              {dailySalesReceiptsError ? (
                <Text style={styles.recoveryErrorText}>{dailySalesReceiptsError}</Text>
              ) : dailySalesReceipts.length ? (
                <View style={styles.dailySalesRows}>
                  {dailySalesReceipts.map((sale) => {
                    const voidLabel = saleVoidStatusLabel(saleVoidState(sale, latestSaleVoidRequest(saleVoidRequests, sale.id)));
                    return (
                      <Pressable
                        key={`day-receipt-${sale.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`View receipt for ${sale.transaction_reference}${voidLabel ? `, ${voidLabel}` : ''}`}
                        onPress={() => openSaleReceipt(sale.id, 'dailySales')}
                        style={({ pressed }) => [styles.dailySalesRow, pressed && styles.pressed]}
                      >
                        <View style={styles.dailySalesRowCopy}>
                          <Text style={styles.dailySalesRowTitle}>{sale.transaction_reference}</Text>
                          <Text style={styles.dailySalesRowDetail}>
                            {formatHistoryDateTime(new Date(sale.created_at))} · {sale.payment_method}
                            {voidLabel ? ` · ${voidLabel}` : ''}
                            {sale.status === 'voided' ? ' (not counted)' : ''}
                          </Text>
                        </View>
                        <Text style={[styles.dailySalesRowAmount, sale.status === 'voided' && styles.dailySalesVoidedAmount]}>
                          {formatSaleMoney(sale.total_amount)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.dailySalesEmpty}>No receipts for this day.</Text>
              )}
            </View>
            <Text style={styles.dailySalesReadOnly}>Confirmed sales only · Voided sales are not counted · Read-only</Text>
          </>
        ) : null}
        {user?.branchId ? (
          <DailyClosingSection
            branchId={user.branchId}
            businessDate={formatLocalIsoDate(dailySalesDate)}
            isToday={formatLocalIsoDate(dailySalesDate) === formatLocalIsoDate(today)}
            refreshKey={dailySalesRefreshKey}
          />
        ) : null}
        <View style={styles.dailySalesBottomActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh daily sales"
            accessibilityState={{ disabled: dailySalesLoading }}
            disabled={dailySalesLoading}
            onPress={() => setDailySalesRefreshKey((key) => key + 1)}
            style={[styles.dailySalesRefreshButton, styles.dailySalesFullButton, dailySalesLoading && styles.buttonDisabled]}
          >
            <Text style={styles.dailySalesRefreshText}>Refresh</Text>
          </Pressable>
          <View style={styles.dailySalesDatePicker}>
            <DatePickerField
              label="Business date"
              triggerLabel="Select business date"
              value={dailySalesDate}
              useConfirmation
              confirmLabel="Apply date"
              maxDate={today}
              onChange={(date) => {
                if (date) setDailySalesDate(date);
              }}
            />
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderProfileSettings = () => {
    return (
      <>
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to More"
            onPress={() => setRoute('more')}
            style={styles.backButton}
          >
            <AppIcon name="back" style={styles.backGlyph} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Profile &amp; settings</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.profileSettingsContent} showsVerticalScrollIndicator={false}>
          {renderStaffIdentityCard()}

          <View style={styles.profileInformationCard}>
            <View style={styles.profileInformationRow}>
              <View style={styles.profileInformationCell}>
                <Text style={styles.profileInformationLabel}>Username</Text>
                <Text style={styles.profileInformationValue} numberOfLines={1}>{staffName}</Text>
              </View>
              <View style={styles.profileInformationCell}>
                <Text style={styles.profileInformationLabel}>Role</Text>
                <Text style={styles.profileInformationValue}>{staffRole}</Text>
              </View>
            </View>
            <View style={styles.profileInformationRow}>
              <View style={styles.profileInformationCell}>
                <Text style={styles.profileInformationLabel}>Account status</Text>
                <Text style={styles.profileInformationValue}>Active</Text>
              </View>
            </View>
          </View>

          <Text style={styles.profileSectionTitle}>Assigned branch · Staff</Text>
          <View style={styles.assignedBranchField}>
            <Text style={styles.assignedBranchText}>{assignedBranch}</Text>
            <AppIcon name="lock" style={styles.assignedBranchLock} />
          </View>
          <Text style={styles.assignedBranchHint}>Read-only. Staff record for their assigned branch only.</Text>
          <View style={styles.profileInfoBanner}>
            <Text style={styles.profileInfoIcon}>i</Text>
            <Text style={styles.profileInfoText}>
              Assigned branch cannot be changed. Master ingredients are read-only; contact the owner for account or ingredient updates.
            </Text>
          </View>

          <View style={styles.profileSettingsCard}>
            <Text style={styles.profileSectionTitle}>Account security</Text>
            <Text style={styles.profileAccountSecurityCopy}>
              You may set a different password at any time. Your password is never displayed in the app.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change password"
              onPress={onChangePassword}
              style={({ pressed }) => [
                styles.profilePasswordButton,
                pressed && styles.profilePasswordButtonPressed,
              ]}
            >
              <Text style={styles.profilePasswordButtonText}>Change password</Text>
            </Pressable>
          </View>

          <View style={styles.profileVersionRow}>
            <Text style={styles.profileSectionTitle}>App version</Text>
            <Text style={styles.profileSettingsValue}>TakoSync · {appVersion}</Text>
          </View>

          <View style={styles.themeSection}>
            <Text style={styles.profileSectionTitle}>Theme toggle</Text>
            <View style={styles.themeSegmentedControl}>
            {(['light', 'dark'] as const).map((mode) => {
              const selected = theme.mode === mode;
              return (
                <Pressable
                  key={mode}
                  accessibilityRole="button"
                  accessibilityLabel={`${mode === 'dark' ? 'Dark' : 'Light'} mode`}
                  accessibilityState={{ selected }}
                  onPress={() => theme.setMode(mode)}
                  style={[styles.themeOption, selected && styles.themeOptionSelected]}
                >
                  <AppIcon name={mode === 'dark' ? 'themeDark' : 'themeLight'} style={[styles.themeOptionIcon, selected && styles.themeOptionIconSelected]} />
                  <Text style={[styles.themeOptionText, selected && styles.themeOptionTextSelected]}>
                    {mode === 'dark' ? 'Dark' : 'Light'}
                  </Text>
                </Pressable>
              );
            })}
            </View>
            <Text style={styles.themeLimitation}>Your theme preference is saved on this device.</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={openLogoutConfirmation}
            style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
          >
            <Text style={styles.logoutButtonText}>Log out</Text>
          </Pressable>
        </ScrollView>
      </>
    );
  };

  const renderIngredientSelector = () => {
    const stockInSearchTerm = stockInIngredientSearch.trim().toLowerCase();
    const stockInItems = ingredients.filter((item) =>
      stockInSearchTerm === '' || `${item.name} ${item.category}`.toLowerCase().includes(stockInSearchTerm),
    );
    return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>Ingredient *</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selectedIngredient ? `${selectedIngredient.name}, ${selectedIngredient.quantity} ${selectedIngredient.unit} available` : 'Choose ingredient'}
        onPress={() => setIngredientListOpen((open) => !open)}
        style={[
          styles.selectInput,
          (route === 'stockIn' && stockInFieldErrors.ingredient) ||
          (route === 'stockOut' && stockOutFieldErrors.ingredient)
            ? styles.textInputError
            : undefined,
        ]}
      >
        <Text style={[styles.selectText, !selectedIngredient && styles.placeholderText]}>
          {selectedIngredient
            ? route === 'stockOut'
              ? `${selectedIngredient.name} · ${formatQuantity(selectedIngredient.quantity)} ${selectedIngredient.unit} available`
              : selectedIngredient.name
            : 'Select an ingredient'}
        </Text>
        {selectedIngredient && route !== 'stockIn' && route !== 'stockOut' ? (
          <Text style={styles.availableQuantity}>{selectedIngredient.quantity} {selectedIngredient.unit} available</Text>
        ) : null}
        <AppIcon name={ingredientListOpen ? 'dropdownOpen' : 'dropdown'} style={styles.selectChevron} />
      </Pressable>
      {route === 'stockIn' && stockInFieldErrors.ingredient ? (
        <InlineFieldError message={stockInFieldErrors.ingredient} />
      ) : null}
      {route === 'stockOut' && stockOutFieldErrors.ingredient ? (
        <InlineFieldError message={stockOutFieldErrors.ingredient} />
      ) : null}
      {ingredientListOpen && (
        <ScrollView
          style={styles.dropdown}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {ingredients.length === 0 ? (
            <Text style={styles.ingredientPickerEmpty}>
              {backendLoading
                ? 'Loading branch ingredients…'
                : backendError || 'No active ingredients are configured for this branch.'}
            </Text>
          ) : route === 'stockIn' ? (
            <>
              <TextInput
                value={stockInIngredientSearch}
                onChangeText={setStockInIngredientSearch}
                placeholder="Search this branch's items..."
                placeholderTextColor={colors.muted}
                style={styles.dropdownSearchInput}
                accessibilityLabel="Search this branch's items"
              />
              {[...new Set(stockInItems.map((item) => item.category).sort((a, b) => a.localeCompare(b)))].map((group) => (
            <View key={group}>
              <Text style={styles.ingredientCategoryHeading}>{group}</Text>
              {stockInItems
                .filter((item) => item.category === group)
                .map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: item.id === selectedIngredientId }}
                    onPress={() => {
                      wasteReviewGeneration.current += 1;
                      setSelectedIngredientId(item.id);
                      setIngredientListOpen(false);
                      setSuccessMessage('');
                      setFormError('');
                      setQuantityError('');
                      if (stockInValidationAttempted) updateStockInValidation({ ingredientId: item.id });
                    }}
                    style={styles.dropdownOption}
                  >
                    <View style={[styles.dropdownCopy, styles.stockInDropdownCopy]}>
                      <Text style={styles.dropdownName}>{item.name}</Text>
                      <Text style={styles.dropdownQuantity}>{item.unit}</Text>
                    </View>
                  </Pressable>
                ))}
            </View>
              ))}
              {stockInItems.length === 0 ? <Text style={styles.ingredientPickerEmpty}>No items match your search.</Text> : null}
            </>
          ) : ingredients.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${formatUnitQuantity(item.quantity, item.unit)} available`}
              accessibilityState={{ selected: item.id === selectedIngredientId }}
              onPress={() => {
                setSelectedIngredientId(item.id);
                setIngredientListOpen(false);
                setFormError('');
                setQuantityError('');
                if (route === 'stockOut' && stockOutValidationAttempted) {
                  updateStockOutValidation({ ingredientId: item.id });
                }
              }}
              style={styles.dropdownOption}
            >
              {route !== 'stockOut' ? <IngredientThumbnail item={item} /> : null}
              <View style={[
                styles.dropdownCopy,
                route === 'stockOut' ? styles.stockOutDropdownCopy : undefined,
              ]}>
                <Text style={styles.dropdownName}>{item.name}</Text>
                <Text style={styles.dropdownQuantity}>
                  {formatUnitQuantity(item.quantity, item.unit)} available
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
    );
  };

  const renderStockInForm = () => (
    <View style={styles.wasteFormSurface}>
      <View style={styles.formHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={returnFromForm} style={styles.backButton}>
          <AppIcon name="back" style={styles.backGlyph} />
        </Pressable>
        <View style={styles.formHeaderCopy}>
          <Text style={styles.formTitle}>Stock-In</Text>
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.compactFormContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {formError !== '' && (
          <View style={styles.stockInErrorBanner} accessibilityRole="alert">
            <Text style={styles.stockInErrorIcon}>!</Text>
            <Text style={styles.stockInErrorText}>{formError}</Text>
          </View>
        )}
        {renderInventoryRecoveryControls('stock_in')}
        {successMessage !== '' ? (
          <View style={styles.successBanner} accessibilityRole="alert">
            <AppIcon name="success" style={styles.successIcon} />
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}
        {renderIngredientSelector()}
        <View style={windowWidth >= 600 ? styles.formRowWide : styles.formRow}>
          <View style={windowWidth >= 600 ? styles.rowField : undefined}>
            <TextField
              label="Quantity Received *"
              value={quantity}
              onChangeText={changeQuantity}
              placeholder="Enter quantity"
              keyboardType="decimal-pad"
              error={stockInFieldErrors.quantity}
              suffix={selectedIngredient?.unit}
            />
          </View>
          <View style={windowWidth >= 600 ? styles.rowField : undefined}>
            <DatePickerField
              label="Transaction Date *"
              value={transactionDate}
              maxDate={today}
              error={stockInFieldErrors.transactionDate}
              onChange={(date) => {
                setTransactionDate(date);
                setSuccessMessage('');
                setFormError('');
                if (stockInValidationAttempted) updateStockInValidation({ transactionDateValue: date });
              }}
            />
          </View>
        </View>
        <DatePickerField
          label="Expiration Date"
          value={expirationDate}
          error={stockInFieldErrors.expirationDate}
          allowClear
          onChange={(date) => {
            setExpirationDate(date);
            setSuccessMessage('');
            setFormError('');
            if (stockInValidationAttempted) updateStockInValidation({ expirationDateValue: date });
          }}
        />
        <Text style={styles.helperText}>Track expiry by received batch.</Text>
        <TextField
          label="Notes"
          value={notes}
          onChangeText={(value) => {
            setNotes(value);
            setSuccessMessage('');
          }}
          placeholder="Delivered by Supplier"
          multiline
        />
        <View style={styles.wasteFormActions}>
          <Pressable accessibilityRole="button" onPress={reviewTransaction} style={({ pressed }) => [styles.saveButton, styles.wasteFormActionButton, pressed && styles.pressed]}>
            <Text style={styles.saveButtonText}>Save</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={returnFromForm} style={({ pressed }) => [styles.cancelButton, styles.wasteFormActionButton, pressed && styles.pressed]}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );

  const renderWasteForm = () => (
    <View style={styles.wasteFormSurface}>
      <View style={styles.formHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Stocks"
          onPress={() => {
            wasteReviewGeneration.current += 1;
            setIngredientListOpen(false);
            setConfirmationVisible(false);
            setRoute('stocks');
            setSuccessMessage('');
            setFormError('');
          }}
          style={styles.backButton}
        >
          <AppIcon name="back" style={styles.backGlyph} />
        </Pressable>
        <View style={styles.formHeaderCopy}>
          <Text style={styles.formTitle}>Waste / Spoilage</Text>
          <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.compactFormContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {successMessage !== '' ? (
          <View style={styles.successBanner} accessibilityRole="alert">
            <AppIcon name="success" style={styles.successIcon} />
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}
        {formError !== '' ? (
          <View style={styles.stockInErrorBanner} accessibilityRole="alert">
            <Text style={styles.stockInErrorIcon}>!</Text>
            <Text style={styles.stockInErrorText}>{formError}</Text>
          </View>
        ) : null}
        {renderInventoryRecoveryControls(reason === 'Spoilage' ? 'spoilage' : 'waste')}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Ingredient *</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: ingredientListOpen }}
            accessibilityLabel={`Ingredient, ${selectedIngredient ? `${selectedIngredient.name} · ${formatUnitQuantity(selectedIngredient.quantity, selectedIngredient.unit)} available` : 'choose an ingredient'}`}
            onPress={() => setIngredientListOpen((open) => !open)}
            style={[styles.selectInput, wasteFieldErrors.item ? styles.textInputError : undefined]}
          >
            <Text style={styles.selectText} numberOfLines={1}>
              {selectedIngredient
                ? `${selectedIngredient.name} · ${formatUnitQuantity(selectedIngredient.quantity, selectedIngredient.unit)} available`
                : 'Select an ingredient'}
            </Text>
            <AppIcon name={ingredientListOpen ? 'dropdownOpen' : 'dropdown'} style={styles.selectChevron} />
          </Pressable>
          {wasteFieldErrors.item ? <InlineFieldError message={wasteFieldErrors.item} /> : null}
          {ingredientListOpen ? (
            <View style={styles.reasonDropdown}>
              <TextInput
                value={wasteIngredientSearch}
                onChangeText={setWasteIngredientSearch}
                placeholder="Search ingredients"
                placeholderTextColor={colors.muted}
                style={styles.ingredientSearchInput}
                accessibilityLabel="Search waste ingredients"
              />
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {ingredients.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(wasteIngredientSearch.trim().toLowerCase())).length === 0 ? (
                <Text style={styles.ingredientPickerEmpty}>
                  {backendLoading
                    ? 'Loading branch ingredients…'
                    : 'No ingredients are configured for this branch.'}
                </Text>
              ) : ingredients.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(wasteIngredientSearch.trim().toLowerCase())).map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.id === selectedIngredientId }}
                  onPress={() => {
                    wasteReviewGeneration.current += 1;
                    setSelectedIngredientId(item.id);
                    setIngredientListOpen(false);
                    setSuccessMessage('');
                    setWasteFieldErrors((current) => ({ ...current, item: '' }));
                    updateWasteValidation({ ingredientId: item.id });
                  }}
                  style={styles.ingredientReasonOption}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.reasonOptionText, item.id === selectedIngredientId && styles.reasonOptionSelected]}
                  >
                    {item.name} · {formatUnitQuantity(item.quantity, item.unit)} available
                  </Text>
                </Pressable>
              ))}
              </ScrollView>
            </View>
          ) : null}
        </View>

        <View style={windowWidth >= 600 ? styles.formRowWide : styles.formRow}>
          <View style={windowWidth >= 600 ? styles.rowField : undefined}>
            <TextField
              label="Quantity *"
              value={quantity}
              onChangeText={changeWasteQuantity}
              placeholder="Enter quantity"
              keyboardType="decimal-pad"
              error={wasteFieldErrors.quantity}
              suffix={selectedIngredient?.unit}
            />
          </View>
          <View style={windowWidth >= 600 ? styles.rowField : undefined}>
            <DatePickerField
                label="Date *"
              value={transactionDate}
              error={wasteFieldErrors.date}
              onChange={(date) => {
                wasteReviewGeneration.current += 1;
                setTransactionDate(date);
                setSuccessMessage('');
                updateWasteValidation({ dateValue: date });
              }}
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Reason/Category *</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: reasonListOpen }}
            onPress={() => setReasonListOpen((open) => !open)}
            style={[styles.selectInput, wasteFieldErrors.reason ? styles.textInputError : undefined]}
          >
            <Text style={styles.selectText}>{reason || 'Select a reason'}</Text>
            <AppIcon name={reasonListOpen ? 'dropdownOpen' : 'dropdown'} style={styles.selectChevron} />
          </Pressable>
          <Text style={styles.wasteReasonHelper}>Waste · Spillage · Spoilage · Other</Text>
          {/* ST-10 c8: unexplained differences belong to the physical count, not here. */}
          <View style={styles.wasteCountGuidance}>
            <Text style={styles.wasteCountGuidanceText}>
              Record only losses you know about. If stock is missing and you do not know why, record it in the
              Physical Inventory Count instead.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open the Physical Inventory Count"
              onPress={() => void startDailyInventoryCheck()}
              hitSlop={6}
            >
              <Text style={styles.wasteCountGuidanceLink}>Open Physical Inventory Count ›</Text>
            </Pressable>
          </View>
          {reasonListOpen ? (
            <View style={styles.reasonDropdown}>
              {wasteReasons.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: reason === option }}
                  onPress={() => {
                    wasteReviewGeneration.current += 1;
                    setReason(option);
                    setReasonListOpen(false);
                    setSuccessMessage('');
                    setWasteFieldErrors((current) => ({ ...current, reason: '' }));
                    updateWasteValidation({ reasonValue: option });
                  }}
                  style={styles.reasonOption}
                >
                  <Text style={[styles.reasonOptionText, reason === option && styles.reasonOptionSelected]}>
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {wasteFieldErrors.reason ? <InlineFieldError message={wasteFieldErrors.reason} /> : null}
        </View>

        <TextField
          label="Remarks (optional)"
          value={notes}
          onChangeText={(value) => {
            wasteReviewGeneration.current += 1;
            setNotes(value);
            setSuccessMessage('');
          }}
          placeholder="Add context (optional)"
          multiline
        />

        <View style={styles.wasteFormActions}>
          <Pressable
            accessibilityRole="button"
            disabled={confirming}
            onPress={reviewTransaction}
            style={({ pressed }) => [styles.saveButton, styles.wasteFormActionButton, pressed && styles.pressed]}
          >
            <Text style={styles.saveButtonText}>Save</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={confirming}
            onPress={returnFromForm}
            style={({ pressed }) => [styles.cancelButton, styles.wasteFormActionButton, pressed && styles.pressed]}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );

  const renderMovementForm = () => {
    const formTitle = route === 'waste'
      ? 'Waste / Spoilage'
      : route === 'stockOut'
        ? 'Stock-Out'
        : 'Stock-Out / Usage';
    const quantityLabel = route === 'waste' ? 'Quantity lost *' : 'Quantity Used *';
    const reasonOptions = route === 'waste'
      ? ['Waste', 'Spillage', 'Spoilage', 'Other']
      : route === 'stockOut'
        ? ['Cooking usage', 'Preparation usage', 'Other']
        : ['Cooking usage', 'Spoilage', 'Other'];

    return (
    <View style={route === 'stockOut' ? styles.wasteFormSurface : styles.movementFormRoot}>
      <View style={styles.formHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={returnFromForm} style={styles.backButton}>
          <AppIcon name="back" style={styles.backGlyph} />
        </Pressable>
        <View style={styles.formHeaderCopy}>
          <Text style={styles.formTitle}>{formTitle}</Text>
          <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.compactFormContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {route === 'stockOut' && (
          <View style={styles.usageModeRow}>
            {([
              { key: 'manual', label: 'Manual quantity' },
              { key: 'cookingBatch', label: 'Cooking batch' },
            ] as const).map((mode) => {
              const selected = usageMode === mode.key;
              return (
                <Pressable
                  key={mode.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setUsageMode(mode.key);
                    setFormError('');
                    setQuantityError('');
                    setStockOutFieldErrors({});
                    setStockOutValidationAttempted(false);
                    setBatchPresetOpen(false);
                  }}
                  style={[styles.usageModeChip, selected && styles.usageModeChipSelected]}
                >
                  <Text style={[styles.usageModeChipText, selected && styles.usageModeChipTextSelected]}>
                    {mode.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {successMessage !== '' && (
          <View style={styles.successBanner} accessibilityRole="alert">
            <AppIcon name="success" style={styles.successIcon} />
            <Text style={styles.successText}>{successMessage}</Text>
            <Pressable onPress={() => setSuccessMessage('')} accessibilityRole="button" accessibilityLabel="Dismiss success message">
              <Text style={styles.bannerDismiss}>×</Text>
            </Pressable>
          </View>
        )}
        {formError !== '' && (route === 'stockOut' ? (
          <View style={styles.stockInErrorBanner} accessibilityRole="alert">
            <Text style={styles.stockInErrorIcon}>!</Text>
            <Text style={styles.stockInErrorText}>{formError}</Text>
          </View>
        ) : <Text style={styles.formError} accessibilityRole="alert">{formError}</Text>)}
        {route === 'stockOut'
          ? renderInventoryRecoveryControls(usageMode === 'cookingBatch' ? 'usage' : 'stock_out')
          : null}
        {route === 'stockOut' && usageMode === 'cookingBatch' ? (
          <>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Cooking batch *</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setBatchPresetOpen((open) => !open)}
                style={styles.selectInput}
              >
                <Text style={styles.selectText}>{batchPreset}</Text>
                <AppIcon name={batchPresetOpen ? 'dropdownOpen' : 'dropdown'} style={styles.selectChevron} />
              </Pressable>
              {batchPresetOpen && (
                <View style={styles.reasonDropdown}>
                  {stockOutBatchPresets.map((preset) => (
                    <Pressable
                      key={preset.name}
                      onPress={() => {
                        setBatchPreset(preset.name);
                        setBatchPresetOpen(false);
                        setFormError('');
                      }}
                      style={styles.reasonOption}
                    >
                      <Text style={[styles.reasonOptionText, batchPreset === preset.name && styles.reasonOptionSelected]}>
                        {preset.name}
                      </Text>
                      <Text style={styles.dropdownQuantity}>
                        {preset.deductions.map((deduction) => {
                          const item = ingredients.find((ingredient) => ingredient.id === deduction.ingredientId);
                          return item ? `${item.name} ${formatQuantity(deduction.quantity)} ${item.unit}` : '';
                        }).filter(Boolean).join(' · ')} per batch
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <TextField
              label="Number of batches *"
              value={batchCount}
              onChangeText={(value) => {
                setBatchCount(value);
                setFormError('');
              }}
              placeholder="Enter batch count"
              keyboardType="decimal-pad"
            />
          </>
        ) : (
          <>
            {renderIngredientSelector()}
            {route === 'stockOut' ? (
              <View style={windowWidth >= 600 ? styles.formRowWide : styles.formRow}>
                <View style={windowWidth >= 600 ? styles.rowField : undefined}>
                  <TextField
                    label={quantityLabel}
                    value={quantity}
                    onChangeText={changeQuantity}
                    placeholder="Enter quantity"
                    keyboardType="decimal-pad"
                    error={stockOutFieldErrors.quantity || quantityError}
                    suffix={selectedIngredient?.unit}
                  />
                </View>
                <View style={windowWidth >= 600 ? styles.rowField : undefined}>
                  <DatePickerField
                    label="Transaction Date *"
                    value={transactionDate}
                    error={stockOutFieldErrors.transactionDate}
                    onChange={(date) => {
                      setTransactionDate(date);
                      setFormError('');
                      if (stockOutValidationAttempted) {
                        updateStockOutValidation({ transactionDateValue: date });
                      }
                    }}
                  />
                </View>
              </View>
            ) : (
              <TextField
                label={quantityLabel}
                value={quantity}
                onChangeText={changeQuantity}
                placeholder="Enter quantity"
                keyboardType="decimal-pad"
                suffix={selectedIngredient?.unit}
              />
            )}
          </>
        )}
        {route === 'stockOut' && usageMode === 'manual' ? null : (
          <DatePickerField
            label="Transaction Date *"
            value={transactionDate}
            error={route === 'stockOut' ? stockOutFieldErrors.transactionDate : undefined}
            onChange={(date) => {
              setTransactionDate(date);
              setFormError('');
              if (route === 'stockOut' && stockOutValidationAttempted) {
                updateStockOutValidation({ transactionDateValue: date });
              }
            }}
          />
        )}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Reason *</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setReasonListOpen((open) => !open)}
            style={[
              styles.selectInput,
              route === 'stockOut' && stockOutFieldErrors.reason ? styles.textInputError : undefined,
            ]}
          >
            <Text style={[styles.selectText, !reason && styles.placeholderText]}>
              {reason || 'Select a reason'}
            </Text>
            <AppIcon name={reasonListOpen ? 'dropdownOpen' : 'dropdown'} style={styles.selectChevron} />
          </Pressable>
          {route === 'stockOut' && stockOutFieldErrors.reason ? (
            <InlineFieldError message={stockOutFieldErrors.reason} />
          ) : null}
          {reasonListOpen && (
            <View style={styles.reasonDropdown}>
              {reasonOptions.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    setReason(option);
                    setReasonListOpen(false);
                    if (route === 'stockOut' && stockOutValidationAttempted) {
                      updateStockOutValidation({ reasonValue: option });
                    }
                  }}
                  style={styles.reasonOption}
                >
                  <Text style={[styles.reasonOptionText, reason === option && styles.reasonOptionSelected]}>{option}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <TextField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder={route === 'stockOut' ? 'Add context (optional)' : 'Add a note'}
          multiline
        />
        <View style={route === 'stockOut' ? styles.wasteFormActions : styles.formButtons}>
          <Pressable
            accessibilityRole="button"
            onPress={reviewTransaction}
            style={({ pressed }) => [
              styles.saveButton,
              route === 'stockOut' ? styles.wasteFormActionButton : undefined,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.saveButtonText}>{route === 'stockOut' ? 'Save' : 'Review Waste'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={returnFromForm}
            style={({ pressed }) => [
              styles.cancelButton,
              route === 'stockOut' ? styles.wasteFormActionButton : undefined,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
        {route !== 'stockOut' ? (
          <Text style={styles.formDemoNote}>Confirmed movements are saved to the assigned branch.</Text>
        ) : null}
      </ScrollView>
    </View>
    );
  };

  const renderUsagePreview = () => {
    const deductions = usageDeductions.map((deduction) => ({
      ...deduction,
      ingredient: ingredients.find((item) => item.id === deduction.ingredientId),
    }));
    const leavesBelowMinimum = deductions.some(
      ({ ingredient, newQuantity }) => ingredient !== undefined && newQuantity < ingredient.minimumStock,
    );

    return (
      <>
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to edit usage"
            onPress={() => setRoute('stockOut')}
            style={styles.backButton}
          >
            <AppIcon name="back" style={styles.backGlyph} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Usage preview</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.compactFormContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.usageInfoBanner}>
            <Text style={styles.permissionIcon}>i</Text>
            <Text style={styles.permissionText}>
              Review the ingredient, quantity and remaining stock before recording.
            </Text>
          </View>
          <View style={styles.usageSummaryCard}>
            <Text style={styles.usageSummaryHeading}>
              {usageMode === 'cookingBatch' ? batchPreset : selectedIngredient?.name ?? 'Stock summary'}
            </Text>
            {usageMode === 'manual' && selectedIngredient ? (
              <>
                <DetailRow label="Ingredient" value={selectedIngredient.name} />
                <DetailRow label="Available" value={`${formatQuantity(selectedIngredient.quantity)} ${selectedIngredient.unit}`} />
                <DetailRow label="Quantity used" value={`-${formatQuantity(Number(quantity))} ${selectedIngredient.unit}`} />
                <DetailRow label="After usage" value={`${formatQuantity(selectedIngredient.quantity - Number(quantity))} ${selectedIngredient.unit}`} />
                <DetailRow label="Minimum stock" value={`${formatQuantity(selectedIngredient.minimumStock)} ${selectedIngredient.unit}`} />
              </>
            ) : (
              deductions.map(({ ingredient, quantity: amount, newQuantity }) => ingredient ? (
                <DetailRow
                  key={ingredient.id}
                  label={`${ingredient.name} · −${formatQuantity(amount)} ${ingredient.unit}`}
                  value={`${formatQuantity(newQuantity)} ${ingredient.unit} remaining`}
                />
              ) : null)
            )}
            <DetailRow label="Reason" value={reason} />
          </View>
          <View style={styles.usageReceiptDetails}>
            <DetailRow label="Transaction date" value={transactionDate ? formatDate(transactionDate) : '—'} />
            <DetailRow label="Notes" value={notes.trim() || '—'} />
          </View>
          {leavesBelowMinimum && (
            <View style={styles.usageWarningBanner}>
              <Text style={styles.usageWarningText}>
                Low stock will remain after this deduction. Quantities cannot fall below zero.
              </Text>
            </View>
          )}
          <View style={styles.formButtons}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmationVisible(true)}
              style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
            >
              <Text style={styles.saveButtonText}>Confirm usage</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setRoute('stockOut')}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.cancelButtonText}>Edit transaction</Text>
            </Pressable>
          </View>
          <Text style={styles.formDemoNote}>Confirmed movements are saved to the assigned branch.</Text>
        </ScrollView>
      </>
    );
  };

  const renderUsageSuccess = () => {
    const receipt = currentUsageReceipt;
    if (!receipt) {
      return (
        <View style={styles.inventoryFallback}>
          <Text style={styles.inventoryEmptyTitle}>No usage receipt to display</Text>
          <Pressable onPress={() => setRoute('stocks')} style={styles.detailBackFallback}>
            <Text style={styles.detailBackLabel}>Back to Stocks</Text>
          </Pressable>
        </View>
      );
    }

    const firstDeduction = receipt.deductions[0];
    const firstIngredient = ingredients.find((item) => item.id === firstDeduction?.ingredientId);
    const afterLines = receipt.deductions.map((deduction) => {
      const item = ingredients.find((ingredient) => ingredient.id === deduction.ingredientId);
      return item
        ? `${formatQuantity(deduction.previousQuantity)} ${item.unit} → ${formatQuantity(deduction.newQuantity)} ${item.unit} remaining`
        : '';
    }).filter(Boolean);

    return (
      <>
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Stocks"
            onPress={() => setRoute('stocks')}
            style={styles.backButton}
          >
            <AppIcon name="back" style={styles.backGlyph} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Stock-Out / Usage</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.compactFormContent} showsVerticalScrollIndicator={false}>
          <View style={styles.successBanner} accessibilityRole="alert">
            <AppIcon name="success" style={styles.successIcon} />
            <Text style={styles.successText}>Stock-Out recorded successfully.</Text>
          </View>
          <View style={styles.receiptSummaryCard}>
            <Text style={styles.receiptSummaryTitle}>
              {receipt.mode === 'cookingBatch' ? receipt.batchPreset : `${firstIngredient?.name ?? 'Ingredient'} · ${receipt.reason}`}
            </Text>
            <Text style={styles.receiptSummaryQuantity}>
              -{formatQuantity(firstDeduction?.quantity ?? 0)} {firstIngredient?.unit ?? ''}
            </Text>
            <Text style={styles.receiptSummarySubtitle}>{afterLines.join(' · ')}</Text>
          </View>
          <View style={styles.receiptDetails}>
            <DetailRow label="Reference" value={receipt.reference} />
            <DetailRow label="Date" value={formatUsageDate(receipt.transactionDate)} />
            <DetailRow label="Staff" value={staffName} />
            <DetailRow label="Branch" value={assignedBranch} />
            {receipt.deductions.map((deduction) => {
              const item = ingredients.find((ingredient) => ingredient.id === deduction.ingredientId);
              return item ? (
                <DetailRow
                  key={item.id}
                  label={item.name}
                  value={`-${formatUnitQuantity(deduction.quantity, item.unit)}`}
                />
              ) : null;
            })}
            <DetailRow label="Notes" value={receipt.notes.trim() || '—'} />
          </View>
          <View style={styles.permissionNotice}>
            <Text style={styles.permissionIcon}>i</Text>
            <Text style={styles.permissionText}>
              This saved transaction was deducted from the recorded {formatQuantity(firstDeduction?.previousQuantity ?? 0)} {firstIngredient?.unit ?? ''} balance.
              {firstIngredient && (firstDeduction?.newQuantity ?? 0) < firstIngredient.minimumStock
                ? ` ${firstIngredient.name} remains below the ${formatQuantity(firstIngredient.minimumStock)} ${firstIngredient.unit} minimum.`
                : ''}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRoute('stockHistory')}
            style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}
          >
            <Text style={styles.historyButtonText}>View transaction history</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRoute('stocks')}
            style={({ pressed }) => [styles.cancelButton, styles.receiptBackButton, pressed && styles.pressed]}
          >
            <Text style={styles.cancelButtonText}>Back to Stocks</Text>
          </Pressable>
        </ScrollView>
      </>
    );
  };

  const renderWasteSuccess = () => {
    const receipt = currentWasteReceipt;
    const receiptIngredient = receipt
      ? ingredients.find((item) => item.id === receipt.ingredientId)
      : undefined;
    if (!receipt || !receiptIngredient) {
      return (
        <View style={styles.inventoryFallback}>
          <Text style={styles.inventoryEmptyTitle}>No waste receipt to display</Text>
          <Pressable onPress={() => setRoute('stocks')} style={styles.detailBackFallback}>
            <Text style={styles.detailBackLabel}>Back to Stocks</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.compactFormContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Stocks"
            onPress={() => setRoute('stocks')}
            style={styles.backButton}
          >
            <AppIcon name="back" style={styles.backGlyph} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Waste / Spoilage</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>
        <View style={styles.receiptSuccessBanner}>
          <AppIcon name="success" style={styles.receiptSuccessIcon} />
          <Text style={styles.receiptSuccessText}>Waste record saved successfully.</Text>
        </View>
        <View style={styles.receiptSummaryCard}>
          <Text style={styles.receiptSummaryTitle}>{receiptIngredient.name} · Waste</Text>
          <Text style={styles.receiptSummaryQuantity}>-{formatUnitQuantity(receipt.quantity, receiptIngredient.unit)}</Text>
          <Text style={styles.receiptSummarySubtitle}>
            {formatUnitQuantity(receipt.previousQuantity, receiptIngredient.unit)} → {formatUnitQuantity(receipt.newQuantity, receiptIngredient.unit)} after waste
          </Text>
        </View>
        <View style={styles.receiptDetails}>
          <DetailRow label="Reference" value={receipt.reference} />
          <DetailRow label="Date" value={formatWasteDate(receipt.transactionDate)} />
          <DetailRow label="Reason" value={receipt.reason} />
          <DetailRow label="Notes" value={receipt.notes || '—'} />
          <DetailRow label="Staff" value={staffName} />
        </View>
        <View style={styles.permissionNotice}>
          <Text style={styles.permissionIcon}>i</Text>
          <Text style={styles.permissionText}>
            This saved waste transaction was deducted once from the recorded balance.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setRoute('stockHistory')}
          style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}
        >
          <Text style={styles.historyButtonText}>View transaction history</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setRoute('stocks')}
          style={({ pressed }) => [styles.cancelButton, styles.receiptBackButton, pressed && styles.pressed]}
        >
          <Text style={styles.cancelButtonText}>Back to Stocks</Text>
        </Pressable>
      </ScrollView>
    );
  };

  const renderStockInSuccess = () => {
    const receipt = currentStockInReceipt;
    const ingredient = receipt ? ingredients.find((item) => item.id === receipt.ingredientId) : null;
    if (!receipt || !ingredient) {
      return (
        <View style={styles.inventoryFallback}>
          <Text style={styles.inventoryEmptyTitle}>No Stock-In receipt to display</Text>
          <Pressable onPress={() => setRoute('stocks')} style={styles.detailBackFallback}>
            <Text style={styles.detailBackLabel}>Back to Stocks</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.compactFormContent} showsVerticalScrollIndicator={false}>
        <View style={styles.formHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Stock-In" onPress={() => setRoute('stockIn')} style={styles.backButton}>
            <AppIcon name="back" style={styles.backGlyph} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Transaction History</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} · Read-only receipt</Text>
          </View>
        </View>
        <View style={styles.receiptSuccessBanner}>
          <AppIcon name="success" style={styles.receiptSuccessIcon} />
          <Text style={styles.receiptSuccessText}>Expected stock and low-stock alerts updated.</Text>
        </View>
        <View style={styles.receiptSummaryCard}>
          <Text style={styles.receiptSummaryTitle}>{ingredient.name} received · New expected: {formatUnitQuantity(receipt.newQuantity, ingredient.unit)}</Text>
          <Text style={styles.receiptSummaryQuantity}>+{formatUnitQuantity(receipt.quantity, ingredient.unit)}</Text>
          <Text style={styles.receiptSummarySubtitle}>Stock-In · {formatDate(receipt.transactionDate)} · {assignedBranch}</Text>
        </View>
        <View style={styles.receiptDetails}>
          <DetailRow label="Reference" value={receipt.reference} />
          <DetailRow label="Type" value="Stock-In" />
          <DetailRow label="Ingredient" value={ingredient.name} />
          <DetailRow label="Date" value={formatDate(receipt.transactionDate)} />
          <DetailRow label="Quantity received" value={formatUnitQuantity(receipt.quantity, ingredient.unit)} />
          <DetailRow label="Expiration date" value={receipt.expirationDate ? formatDate(receipt.expirationDate) : 'Not recorded'} />
          <DetailRow label="Supplier Reference" value={receipt.notes || 'Not provided'} />
          <DetailRow label="Branch" value={assignedBranch} />
          <DetailRow label="Employee" value={staffName} />
          <DetailRow label="Expected quantity update" value={`${formatUnitQuantity(receipt.previousQuantity, ingredient.unit)} + ${formatUnitQuantity(receipt.quantity, ingredient.unit)} = ${formatUnitQuantity(receipt.newQuantity, ingredient.unit)}`} />
        </View>
        <View style={styles.permissionNotice}>
          <Text style={styles.permissionIcon}>i</Text>
          <Text style={styles.permissionText}>This saved Stock-In record cannot be edited or deleted by staff. Stock-In is retained in Transaction History.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setRoute('stockHistory')} style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}>
          <Text style={styles.historyButtonText}>View Transaction History</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => openForm('stockIn', 'stocks')} style={({ pressed }) => [styles.cancelButton, styles.receiptBackButton, pressed && styles.pressed]}>
          <Text style={styles.cancelButtonText}>Back to Stock-In</Text>
        </Pressable>
      </ScrollView>
    );
  };

  const renderStockHistory = () => {
    const octopusLedger = historyLedgerExplanation('octopus');

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.historyPageContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={navigationOrigin === 'more' ? 'Back to More' : 'Back to Stocks'}
            onPress={() => setRoute(staffReturnTab(navigationOrigin, 'stocks'))}
            style={styles.backButton}
          >
            <AppIcon name="back" style={styles.backGlyph} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Transaction History</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} · View only</Text>
          </View>
        </View>
        <View style={styles.historySearchWrap}>
          <SearchBar
            value={historySearch}
            onChangeText={setHistorySearch}
            placeholder="Searching for something?"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select transaction date range"
          onPress={beginHistoryFilters}
          style={({ pressed }) => [styles.historyDateSelector, pressed && styles.pressed]}
        >
          <Text style={styles.historyDateSelectorText}>
            {historyFromDate && historyToDate
              ? `${formatDate(historyFromDate)} – ${formatDate(historyToDate)}`
              : historyFromDate
                ? `From ${formatDate(historyFromDate)}`
                : historyToDate
                  ? `Until ${formatDate(historyToDate)}`
                  : 'All business dates'}
          </Text>
          <AppIcon name="calendar" style={styles.historyDateSelectorIcon} />
        </Pressable>
        <View style={styles.historyMetadataRow}>
          <View style={styles.historyMetadataCopy}>
            <Text style={styles.historyMetadataTitle}>{assignedBranch} · {formatDate(today)}</Text>
            <Text style={styles.historyMetadataSubtitle}>
              {historyTypeFilter === 'All types' ? 'All transaction types' : historyTypeFilter}
              {' · '}{filteredHistoryTransactions.length} {filteredHistoryTransactions.length === 1 ? 'transaction' : 'transactions'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={beginHistoryFilters}
            style={({ pressed }) => [styles.historyFilterAction, pressed && styles.pressed]}
          >
            <Text style={styles.historyFilterActionText}>Filters</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyTypeTabs}>
          {historyTypeFilters.map((filter) => {
            const selected = historyTypeFilter === filter;
            const label = historyTypeFilterTabLabel(filter);
            return (
              <Pressable
                key={filter}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setHistoryTypeFilter(filter)}
                style={[styles.historyTypeTab, selected && styles.historyTypeTabSelected]}
              >
                <Text style={[styles.historyTypeTabText, selected && styles.historyTypeTabTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionTitle}>Inventory transactions</Text>
          <Text style={styles.sectionHint}>Newest first</Text>
        </View>
        {false ? (
          <Pressable accessibilityRole="button" onPress={() => void refreshBackendData()} style={styles.recoveryError}>
            <Text style={styles.recoveryErrorText}>{saleHistoryError} · Tap to retry</Text>
          </Pressable>
        ) : false && recentSales.length ? (
          <View style={styles.unresolvedSalesList}>
            {recentSales.map((sale) => (
              <Pressable
                key={`history-sale-${sale.id}`}
                accessibilityRole="button"
                accessibilityLabel={`View receipt for ${sale.transaction_reference}`}
                onPress={() => openSaleReceipt(sale.id)}
                style={({ pressed }) => [styles.unresolvedSaleRow, pressed && styles.pressed]}
              >
                <View style={styles.unresolvedSaleCopy}>
                  <Text style={styles.unresolvedSaleReference}>{sale.transaction_reference}</Text>
                  <Text style={styles.unresolvedSaleDate}>
                    {new Date(sale.created_at).toLocaleString('en-PH')} · {sale.payment_method} · {formatSaleMoney(sale.total_amount)}
                  </Text>
                  <Text style={styles.unresolvedSaleStatus}>Inventory {sale.inventory_processing_status}</Text>
                </View>
                <Text style={styles.inventoryRetryActionText}>Receipt</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {backendLoading ? (
          <View style={styles.historyStateCard}>
            <ActivityIndicator color={colors.pink} />
            <Text style={styles.historyStateText}>Loading transactionsâ€¦</Text>
          </View>
        ) : backendError && historyTransactions.length === 0 ? (
          <View style={styles.historyStateCard}>
            <AppIcon name="noInternet" size={44} />
            <Text style={styles.historyStateText}>Unable to load data. Please check your internet connection and try again.</Text>
            <Pressable accessibilityRole="button" onPress={() => void refreshBackendData()} style={styles.historyEmptyButton}>
              <Text style={styles.historyEmptyButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : filteredHistoryTransactions.length > 0 ? (
          <>
            <View style={styles.historyTransactionList}>
              {filteredHistoryTransactions.map((transaction) => (
                <Pressable
                  key={transaction.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${transaction.type} ${transaction.ingredientName}, ${transaction.movement > 0 ? 'plus' : 'minus'} ${formatUnitQuantity(transaction.quantity, transaction.unit)}, ${transaction.reference}`}
                  onPress={() => {
                    setSelectedHistoryTransactionId(transaction.id);
                    setRoute('transactionDetails');
                  }}
                  style={({ pressed }) => [styles.historyTransactionCard, pressed && styles.pressed]}
                >
                  <View style={styles.historyTransactionTop}>
                    <View style={styles.historyTransactionTitleWrap}>
                      <Text style={styles.historyTransactionTitle}>
                        {transaction.type} · {transaction.ingredientName}
                      </Text>
                      <Text style={styles.historyTransactionReference}>{transaction.reference}</Text>
                      <View style={[styles.historyTypeBadge, transaction.type === 'Stock-In' ? styles.historyTypeBadgePositive : transaction.type === 'Waste' || transaction.type === 'Spoilage' ? styles.historyTypeBadgeNegative : styles.historyTypeBadgeNeutral]}>
                        <Text style={styles.historyTypeBadgeText}>{transaction.type}</Text>
                      </View>
                    </View>
                    <Text style={[
                      styles.historyTransactionQuantity,
                      transaction.movement > 0
                        ? styles.historyTransactionPositive
                        : styles.historyTransactionNegative,
                    ]}>
                      {transaction.movement === 0 ? '' : transaction.movement > 0 ? '+' : '-'}{formatUnitQuantity(transaction.quantity, transaction.unit)}
                    </Text>
                  </View>
                  <Text style={styles.historyTransactionMeta}>
                    {formatHistoryDateTime(transaction.transactionDate)} · {transaction.staff.split(' ')[0]} · {transaction.branch}
                    {(() => {
                      const entry = entryReversalSupported ? reversibleEntryOf(transaction) : null;
                      const label = entry
                        ? entryReversalStatusLabel(entryReversalState(latestEntryReversalRequest(entryReversalRequests, entry.key)))
                        : null;
                      return label ? ` · ${label}` : '';
                    })()}
                  </Text>
                </Pressable>
              ))}
            </View>
            {octopusLedger ? (
              <View style={styles.historyLedgerBanner}>
                <Text style={styles.permissionIcon}>i</Text>
                <Text style={styles.permissionText}>{octopusLedger}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.historyEmptyState}>
            <AppIcon name="noRecords" size={68} />
            <Text style={styles.historyEmptyTitle}>No transactions found.</Text>
            <Text style={styles.historyEmptyText}>
              There are no transactions matching these filters. Change the date, type or search to see records.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={resetHistoryFilters}
              style={({ pressed }) => [styles.historyEmptyButton, pressed && styles.pressed]}
            >
              <Text style={styles.historyEmptyButtonText}>Clear filters</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    );
  };

  const renderHistoryFilters = () => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.historyFilterPageContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.formHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to transaction history"
          onPress={() => setRoute('stockHistory')}
          style={styles.backButton}
        >
          <AppIcon name="back" style={styles.backGlyph} />
        </Pressable>
        <View style={styles.formHeaderCopy}>
          <Text style={styles.formTitle}>History filters</Text>
          <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
        </View>
      </View>
      <Text style={styles.historyFilterLabel}>Transaction type</Text>
      <View style={styles.historyTypeChips}>
        {historyTypeFilters.map((filter) => {
          const selected = draftHistoryTypeFilter === filter;
          return (
            <Pressable
              key={filter}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setDraftHistoryTypeFilter(filter)}
              style={[styles.historyTypeChip, selected && styles.historyTypeChipSelected]}
            >
              <Text style={[styles.historyTypeChipText, selected && styles.historyTypeChipTextSelected]}>
                {filter}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <DatePickerField
        label="From date"
        value={draftHistoryFromDate}
        onChange={(date) => {
          setDraftHistoryFromDate(date);
          setHistoryDateError('');
        }}
      />
      <DatePickerField
        label="To date"
        value={draftHistoryToDate}
        onChange={(date) => {
          setDraftHistoryToDate(date);
          setHistoryDateError('');
        }}
      />
      {historyDateError ? <Text style={styles.fieldError}>{historyDateError}</Text> : null}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Staff</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: historyStaffPickerOpen }}
          onPress={() => setHistoryStaffPickerOpen((open) => !open)}
          style={styles.selectInput}
        >
          <Text style={styles.selectText}>{draftHistoryStaffFilter}</Text>
          <AppIcon name={historyStaffPickerOpen ? 'dropdownOpen' : 'dropdown'} style={styles.selectChevron} />
        </Pressable>
        {historyStaffPickerOpen ? (
          <View style={styles.reasonDropdown}>
            {historyStaffOptions.map((staff) => (
              <Pressable
                key={staff}
                accessibilityRole="button"
                accessibilityState={{ selected: draftHistoryStaffFilter === staff }}
                onPress={() => {
                  setDraftHistoryStaffFilter(staff);
                  setHistoryStaffPickerOpen(false);
                }}
                style={styles.reasonOption}
              >
                <Text style={[
                  styles.reasonOptionText,
                  draftHistoryStaffFilter === staff && styles.reasonOptionSelected,
                ]}>{staff}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.formButtons}>
        <Pressable
          accessibilityRole="button"
          onPress={applyHistoryFilters}
          style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
        >
          <Text style={styles.saveButtonText}>Apply filters</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={resetTransactionFilters}
          style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
        >
          <Text style={styles.cancelButtonText}>Reset filters</Text>
        </Pressable>
      </View>
    </ScrollView>
  );

  const renderTransactionDetails = () => {
    const transaction = selectedHistoryTransaction;
    if (!transaction) {
      return (
        <View style={styles.inventoryFallback}>
          <Text style={styles.inventoryEmptyTitle}>Transaction not found</Text>
          <Pressable onPress={() => setRoute('stockHistory')} style={styles.detailBackFallback}>
            <Text style={styles.detailBackLabel}>Back to history</Text>
          </Pressable>
        </View>
      );
    }

    const ledgerExplanation = historyLedgerExplanation(transaction.ingredientId);
    const typeLabel = transaction.type;
    const purpose = transaction.reason === 'Cooking usage'
      ? 'Cooking usage'
      : transaction.type === 'Stock-In'
        ? 'Stock receipt'
        : transaction.type;

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.historyDetailPageContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to transaction history"
            onPress={() => setRoute('stockHistory')}
            style={styles.backButton}
          >
            <AppIcon name="back" style={styles.backGlyph} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Transaction details</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>
        <View style={styles.historyDetailSummary}>
          <Text style={styles.historyDetailSummaryTitle}>
            {transaction.ingredientName} · {purpose}
          </Text>
          <Text style={[
            styles.historyDetailSummaryQuantity,
            transaction.movement > 0 && styles.historyTransactionPositive,
          ]}>
            {transaction.movement === 0 ? '' : transaction.movement > 0 ? '+' : '-'}{formatUnitQuantity(transaction.quantity, transaction.unit)}
          </Text>
          <Text style={styles.historyDetailSummaryReference}>
            {transaction.reference} · Recorded
          </Text>
        </View>
        <View style={styles.historyDetailRows}>
          <DetailRow label="Transaction type" value={typeLabel} />
          <DetailRow label="Branch" value={transaction.branch} />
          <DetailRow label="Ingredient" value={`${transaction.ingredientName} · ${transaction.category}`} />
          <DetailRow label="Date and time" value={formatHistoryDateTime(transaction.transactionDate)} />
          <DetailRow label="Staff" value={transaction.staff} />
          {transaction.type === 'Stock-In' ? (
            <>
              {transaction.beforeQuantity !== null ? (
                <DetailRow label="Before receipt" value={formatUnitQuantity(transaction.beforeQuantity, transaction.unit)} />
              ) : null}
              <DetailRow label="Quantity received" value={formatUnitQuantity(transaction.quantity, transaction.unit)} />
              {transaction.afterQuantity !== null ? (
                <DetailRow label="After receipt" value={formatUnitQuantity(transaction.afterQuantity, transaction.unit)} />
              ) : null}
            </>
          ) : transaction.type === 'Waste' || transaction.type === 'Spoilage' ? (
            <>
              {transaction.beforeQuantity !== null ? (
                <DetailRow label="Before waste" value={formatUnitQuantity(transaction.beforeQuantity, transaction.unit)} />
              ) : null}
              <DetailRow label="Quantity wasted" value={formatUnitQuantity(transaction.quantity, transaction.unit)} />
              {transaction.afterQuantity !== null ? (
                <DetailRow label="After waste" value={formatUnitQuantity(transaction.afterQuantity, transaction.unit)} />
              ) : null}
              <DetailRow label="Reason" value={transaction.reason} />
            </>
          ) : transaction.type === 'Physical Inventory Count' && transaction.physicalCount ? (
            <>
              <DetailRow label="Expected quantity" value={formatUnitQuantity(transaction.physicalCount.expectedQuantity, transaction.unit)} />
              <DetailRow label="Original physical count" value={formatUnitQuantity(transaction.physicalCount.originalActualQuantity, transaction.unit)} />
              <DetailRow label="Difference" value={formatDailyDifference(transaction.physicalCount.difference, transaction.unit)} />
              <DetailRow
                label="Count status"
                value={countHistoryStatusLabel({
                  status: transaction.physicalCount.status,
                  validated: Boolean(transaction.physicalCount.validation),
                  correctionStatuses: [
                    ...transaction.physicalCount.correctionHistory.map((correction) => correction.status),
                    ...(sentCountCorrectionLineIds.has(countLineIdOfHistoryRecord(transaction.id) ?? '') ? ['pending'] : []),
                  ],
                })}
              />
              <DetailRow label="Remarks" value={transaction.notes || '—'} />
              {transaction.physicalCount.revisedActualQuantity !== null ? (
                <DetailRow label="Revised actual quantity" value={formatUnitQuantity(transaction.physicalCount.revisedActualQuantity, transaction.unit)} />
              ) : null}
              {transaction.physicalCount.validation ? (
                <>
                  <DetailRow label="Validation outcome" value={transaction.physicalCount.validation.outcome} />
                  <DetailRow label="Validated by" value={transaction.physicalCount.validation.validatedBy} />
                  <DetailRow label="Validation reason" value={transaction.physicalCount.validation.reason} />
                  <DetailRow label="Validated at" value={formatHistoryDateTime(new Date(transaction.physicalCount.validation.validatedAt))} />
                </>
              ) : null}
              {transaction.physicalCount.correctionHistory.map((correction, index) => (
                <View key={`${transaction.id}-correction-${index}`}>
                  <DetailRow label={`Correction ${index + 1}`} value={`${correction.status} · ${formatUnitQuantity(correction.correctedActualQuantity, transaction.unit)}`} />
                  <DetailRow label="Correction reason" value={correction.reason} />
                  {correction.decisionReason ? <DetailRow label="Owner decision" value={correction.decisionReason} /> : null}
                  {correction.decidedAt ? <DetailRow label="Decided at" value={formatHistoryDateTime(new Date(correction.decidedAt))} /> : null}
                </View>
              ))}
            </>
          ) : (
            <>
              {transaction.beforeQuantity !== null ? (
                <DetailRow label="Before usage" value={formatUnitQuantity(transaction.beforeQuantity, transaction.unit)} />
              ) : null}
              <DetailRow label="Quantity used" value={formatUnitQuantity(transaction.quantity, transaction.unit)} />
              {transaction.afterQuantity !== null ? (
                <DetailRow label="After usage" value={formatUnitQuantity(transaction.afterQuantity, transaction.unit)} />
              ) : null}
              <DetailRow label="Purpose" value={transaction.reason} />
            </>
          )}
          {transaction.batchReference ? <DetailRow label="Batch reference" value={transaction.batchReference} /> : null}
          <DetailRow label="Notes" value={transaction.notes || '—'} />
        </View>
        {transaction.type === 'Physical Inventory Count' && transaction.physicalCount ? (() => {
          const countLineId = countLineIdOfHistoryRecord(transaction.id);
          if (!countLineId) return null;
          const count = transaction.physicalCount;
          const action = countHistoryCorrectionAction({
            countedByUserId: transaction.staffId,
            currentUserId: user.id,
            expectedQuantity: count.expectedQuantity,
            originalActualQuantity: count.originalActualQuantity,
            validated: Boolean(count.validation),
            correctionStatuses: count.correctionHistory.map((correction) => correction.status),
            // A request sent a moment ago counts as waiting until the history reloads.
            waitingOnDevice: pendingCountCorrections.some((request) => request.countLineId === countLineId)
              || sentCountCorrectionLineIds.has(countLineId),
          });
          return (
            <View style={styles.historyLedgerBanner}>
              <Text style={styles.permissionIcon}>i</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.permissionText}>
                  A submitted count cannot be edited. It is changed only through a correction request, which the owner decides.
                </Text>
                {action ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={action === 'request'
                      ? `Request a correction for the ${transaction.ingredientName} count`
                      : `View correction requests for the ${transaction.ingredientName} count`}
                    onPress={() => openCountCorrectionFromHistory(countLineId, action === 'request', count.originalActualQuantity)}
                    style={styles.discrepancyNeutralButton}
                  >
                    <Text style={styles.discrepancyNeutralButtonText}>
                      {action === 'request' ? 'Request a correction' : 'View correction requests'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })() : null}
        {entryReversalSupported ? (() => {
          const entry = reversibleEntryOf(transaction);
          if (!entry) return null;
          const latest = latestEntryReversalRequest(entryReversalRequests, entry.key);
          const batter = entry.type === 'batter_preparation';
          return (
            <>
              <EntryReversalStatusPanel
                state={entryReversalState(latest)}
                availability={entryReversalAvailability(transaction, user?.id, latest)}
                onRequestReversal={() => setEntryReversalModalVisible(true)}
              />
              <EntryReversalRequestModal
                visible={entryReversalModalVisible}
                entry={{
                  type: entry.type,
                  reference: batter ? entry.key : transaction.reference,
                  itemName: batter ? 'Prepared batter' : transaction.ingredientName,
                  quantityLabel: batter ? '5 bottles' : formatUnitQuantity(transaction.quantity, transaction.unit),
                }}
                onClose={() => setEntryReversalModalVisible(false)}
                onSubmit={async (reason, clientRequestId) => {
                  const saved = await requestEntryReversal({ movementId: transaction.id, reason, clientRequestId });
                  setEntryReversalRequests((current) => [saved, ...current.filter((request) => request.id !== saved.id)]);
                  setEntryReversalModalVisible(false);
                }}
              />
            </>
          );
        })() : null}
        {ledgerExplanation ? (
          <View style={styles.historyLedgerBanner}>
            <Text style={styles.permissionIcon}>i</Text>
            <Text style={styles.permissionText}>{ledgerExplanation}</Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => setRoute('stockHistory')}
          style={({ pressed }) => [styles.historyDetailButton, pressed && styles.pressed]}
        >
          <Text style={styles.historyDetailButtonText}>Back to history</Text>
        </Pressable>
      </ScrollView>
    );
  };

  const renderSaleCompleted = () => {
    if (!completedSale) {
      return (
        <View style={styles.inventoryFallback}>
          <Text style={styles.inventoryEmptyTitle}>No sale to show</Text>
          <Pressable onPress={() => setRoute('menu')} style={styles.detailBackFallback}>
            <Text style={styles.detailBackLabel}>Back to POS</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.saleReceiptPage} showsVerticalScrollIndicator={false}>
        <View style={styles.saleReceiptHeader}>
          <AppIcon name="success" style={styles.saleCompletedCheck} />
          <Text style={styles.saleReceiptBusiness} accessibilityRole="header">Sale Completed</Text>
          <Text style={styles.saleReceiptReference}>{completedSale.reference}</Text>
          <Text style={styles.saleCompletedTotal}>{formatSaleMoney(completedSale.totalAmount)}</Text>
        </View>
        <View style={styles.saleReceiptDetails}>
          <DetailRow label="Transaction reference" value={completedSale.reference} />
          <DetailRow label="Payment method" value={completedSale.paymentMethod} />
          {completedSale.cashReceived !== null ? <DetailRow label="Cash received" value={formatSaleMoney(completedSale.cashReceived)} /> : null}
          {completedSale.change !== null ? <DetailRow label="Change" value={formatSaleMoney(completedSale.change)} /> : null}
        </View>
        <View style={styles.saleCompletedActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => openSaleReceipt(completedSale.id, 'saleCompleted')}
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
          >
            <Text style={styles.saveButtonText}>Generate Receipt</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setCompletedSale(null);
              setRoute('menu');
            }}
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
          >
            <Text style={styles.saveButtonText}>New Order</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  };

  const renderSaleReceipt = () => {
    if (saleReceiptLoading) {
      return (
        <View style={styles.inventoryFallback}>
          <ActivityIndicator color={colors.pink} />
          <Text style={styles.emptyState}>Loading recorded receipt…</Text>
        </View>
      );
    }
    if (saleReceiptError || !saleReceipt) {
      return (
        <View style={styles.inventoryFallback}>
          <Text style={styles.inventoryEmptyTitle}>Receipt unavailable</Text>
          <Text style={styles.receiptErrorText}>{saleReceiptError || 'The recorded sale details could not be loaded.'}</Text>
          <Pressable onPress={() => setRoute('menu')} style={styles.detailBackFallback}>
            <Text style={styles.detailBackLabel}>Back to POS</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.saleReceiptPage}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saleReceiptReturnRoute === 'dailySales'
              ? 'Back to Daily Sales'
              : saleReceiptReturnRoute === 'saleCompleted' ? 'Back to Sale Completed' : 'Back to POS'}
            onPress={() => setRoute(saleReceiptReturnRoute)}
            style={styles.backButton}
          >
            <AppIcon name="back" style={styles.backGlyph} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Sale receipt</Text>
            <Text style={styles.formSubtitle}>{saleReceipt.branchName} / Staff</Text>
          </View>
        </View>
        <View style={styles.saleReceiptHeader}>
          <Text style={styles.saleReceiptBusiness}>Gelo's Takoyaki</Text>
          <Text style={styles.saleReceiptBranch}>{saleReceipt.branchName}</Text>
          <Text style={styles.saleReceiptReference}>{saleReceipt.transactionReference}</Text>
          <Text style={styles.saleReceiptDate}>Date Purchased: {formatReceiptDatePurchased(saleReceipt.createdAt)}</Text>
          {saleReceipt.servedBy ? <Text style={styles.saleReceiptDate}>Served by {saleReceipt.servedBy}</Text> : null}
          {saleReceipt.isBulkOrder ? <Text style={styles.saleReceiptBulk}>BULK ORDER</Text> : null}
          {saleReceipt.isVoided ? (
            <Text style={styles.saleReceiptVoid} accessibilityLabel="This sale is void">VOID</Text>
          ) : null}
        </View>
        <View style={styles.saleReceiptLines}>
          {saleReceipt.lines.map((line) => (
            <View key={`${line.kind}-${line.id}`} style={styles.saleReceiptLine}>
              <View style={styles.saleReceiptLineCopy}>
                <Text style={styles.saleReceiptLineName}>
                  {line.name}{line.variantLabel ? ` · ${line.variantLabel}` : ''}
                </Text>
                <Text style={styles.saleReceiptLineMeta}>
                  {line.quantity} × {formatSaleMoney(line.unitPrice)}
                </Text>
              </View>
              <Text style={styles.saleReceiptLineTotal}>{formatSaleMoney(line.subtotal)}</Text>
            </View>
          ))}
          <View style={styles.saleReceiptTotalRow}>
            <Text style={styles.saleReceiptTotalLabel}>Total</Text>
            <Text style={styles.saleReceiptTotalValue}>{formatSaleMoney(saleReceipt.totalAmount)}</Text>
          </View>
        </View>
        <View style={styles.saleReceiptDetails}>
          <DetailRow label="Payment method" value={saleReceipt.paymentMethod} />
          {saleReceipt.cashReceived !== null ? <DetailRow label="Cash received" value={formatSaleMoney(saleReceipt.cashReceived)} /> : null}
          {saleReceipt.change !== null ? <DetailRow label="Change" value={formatSaleMoney(saleReceipt.change)} /> : null}
          <DetailRow label="Sale status" value={saleReceipt.saleStatus} />
          <DetailRow label="Inventory processing" value={saleReceipt.inventoryProcessingStatus} />
        </View>
        {saleVoidSupported ? (() => {
          const latest = latestSaleVoidRequest(saleVoidRequests, saleReceipt.id);
          const receiptSale = {
            status: saleReceipt.saleStatus,
            inventory_processing_status: saleReceipt.inventoryProcessingStatus,
            created_at: saleReceipt.createdAt,
          };
          return (
            <>
              <SaleVoidStatusPanel
                state={saleVoidState(receiptSale, latest)}
                availability={saleVoidAvailability(receiptSale, latest)}
                onRequestVoid={() => setSaleVoidModalVisible(true)}
              />
              <SaleVoidRequestModal
                visible={saleVoidModalVisible}
                sale={{
                  transactionReference: saleReceipt.transactionReference,
                  totalAmount: saleReceipt.totalAmount,
                  lines: saleReceipt.lines.map((line) => ({
                    id: `${line.kind}-${line.id}`,
                    name: line.name,
                    variantLabel: line.variantLabel,
                    quantity: line.quantity,
                    subtotal: line.subtotal,
                  })),
                }}
                onClose={() => setSaleVoidModalVisible(false)}
                onSubmit={submitSaleVoid}
              />
            </>
          );
        })() : null}
        <Text style={styles.saleReceiptFooter}>{SALE_RECEIPT_FOOTER}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saleReceiptOutputBusy !== null, busy: saleReceiptOutputBusy === 'print' }}
          disabled={saleReceiptOutputBusy !== null}
          onPress={() => void outputSaleReceipt('print')}
          style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, saleReceiptOutputBusy !== null && styles.buttonDisabled]}
        >
          <Text style={styles.saveButtonText}>{saleReceiptOutputBusy === 'print' ? 'Preparing…' : 'Print Receipt'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saleReceiptOutputBusy !== null, busy: saleReceiptOutputBusy === 'pdf' }}
          disabled={saleReceiptOutputBusy !== null}
          onPress={() => void outputSaleReceipt('pdf')}
          style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, saleReceiptOutputBusy !== null && styles.buttonDisabled]}
        >
          <Text style={styles.saveButtonText}>{saleReceiptOutputBusy === 'pdf' ? 'Preparing…' : 'Download PDF'}</Text>
        </Pressable>
        {saleReceiptOutputNotice ? <Text style={styles.saleReceiptFooter}>{saleReceiptOutputNotice}</Text> : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setSaleReceipt(null);
            setSaleReceiptError('');
            setSaleReceiptShareError('');
            setRoute('menu');
          }}
          style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
        >
          <Text style={styles.saveButtonText}>New Order</Text>
        </Pressable>
        {saleReceiptShareError ? <Text style={styles.receiptErrorText}>{saleReceiptShareError}</Text> : null}
      </ScrollView>
    );
  };

  let screenContent: React.ReactNode;
  switch (route) {
    case 'menu':
    case 'cart':
    case 'checkout':
      screenContent = null;
      break;
    case 'inventory':
      screenContent = renderInventory();
      break;
    case 'ingredientDetails':
      screenContent = renderIngredientDetails();
      break;
    case 'unitsPackSizes':
      screenContent = renderUnitsPackSizes();
      break;
    case 'expirationInfo':
      screenContent = renderExpirationInfo();
      break;
    case 'inventoryHistory':
      screenContent = renderInventoryHistory();
      break;
    case 'alertDetails':
      screenContent = renderAlertDetails();
      break;
    case 'dailyInventoryCheck':
      screenContent = renderDailyInventoryCheck();
      break;
    case 'dailyInventoryOverview':
      screenContent = renderDailyInventoryOverview();
      break;
    case 'dailyCheckSuccess':
      screenContent = renderDailyCheckSuccess();
      break;
    case 'profileSettings':
      screenContent = renderProfileSettings();
      break;
    case 'stocks':
      screenContent = renderStocks();
      break;
    case 'batterBatch':
      screenContent = renderBatterBatch();
      break;
    case 'stockIn':
      // ST-09: header (supplier, date purchased, date received) with one or more lines.
      screenContent = user?.branchId ? (
        <StockInForm
          branchId={user.branchId}
          branchLabel={assignedBranch}
          today={today}
          // Prepared batter enters stock through Batter Batch Recording (ST-08), not Stock-In.
          ingredients={ingredients.filter((item) => item.id !== PREPARED_BATTER_ID)}
          DateField={DatePickerField}
          onBack={returnFromForm}
          onSaved={async () => {
            setStockAlertsUpdated(true);
            await refreshBackendData();
          }}
        />
      ) : renderStockInForm();
      break;
    case 'stockOut':
      screenContent = renderMovementForm();
      break;
    case 'waste':
      screenContent = renderWasteForm();
      break;
    case 'usagePreview':
      screenContent = renderUsagePreview();
      break;
    case 'stockOutSuccess':
      screenContent = renderUsageSuccess();
      break;
    case 'wasteSuccess':
      screenContent = renderWasteSuccess();
      break;
    case 'stockInSuccess':
      screenContent = renderStockInSuccess();
      break;
    case 'stockHistory':
      screenContent = renderStockHistory();
      break;
    case 'historyFilters':
      screenContent = renderHistoryFilters();
      break;
    case 'transactionDetails':
      screenContent = renderTransactionDetails();
      break;
    case 'saleCompleted':
      screenContent = renderSaleCompleted();
      break;
    case 'saleReceipt':
      screenContent = renderSaleReceipt();
      break;
    case 'dailySales':
      screenContent = renderDailySales();
      break;
    case 'inventoryReport':
      screenContent = renderInventoryReportDetail();
      break;
    case 'inventoryCountDetails':
      screenContent = renderInventoryCountDetails();
      break;
    case 'inventoryDiscrepancySubmission':
      screenContent = renderInventoryDiscrepancySubmission();
      break;
    case 'alerts':
      screenContent = renderAlerts();
      break;
    case 'more':
      screenContent = renderMore();
      break;
  }

  return (
    <KeyboardAvoidingView style={styles.workspace} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.screenArea}>
        {backendError !== '' &&
        route !== 'menu' &&
        route !== 'cart' &&
        route !== 'checkout' &&
        route !== 'inventory' &&
        route !== 'ingredientDetails' &&
        route !== 'inventoryHistory' &&
        route !== 'alerts' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading branch data"
            onPress={() => void refreshBackendData()}
            style={styles.infoBanner}
          >
            <Text style={styles.infoBannerText}>{backendError} · Tap to retry</Text>
          </Pressable>
        ) : null}
        {screenContent}
        <MenuWorkspace
          visible={route === 'menu' || route === 'cart' || route === 'checkout'}
          page={route === 'menu' || route === 'cart' || route === 'checkout' ? route : 'menu'}
          staffName={staffName}
          assignedBranch={assignedBranch}
          cart={menuCart}
          onSetPage={setRoute}
          onAddProduct={addMenuProduct}
          onIncreaseQuantity={(productId) => changeMenuProductQuantity(productId, 1)}
          onDecreaseQuantity={(productId) => changeMenuProductQuantity(productId, -1)}
          onSetQuantity={setMenuProductQuantity}
          selectedAddonIds={menuSelectedAddonIds}
          onSetSelectedAddonIds={setMenuSelectedAddonIds}
          onRemoveProduct={removeMenuProduct}
          onCancelOrder={cancelMenuOrder}
          onSubmitSale={submitMenuSale}
          catalog={menuCatalog}
          addons={menuAddons}
          catalogLoading={menuCatalogLoading}
          catalogError={menuCatalogError}
          onRetryCatalog={retryMenuCatalog}
          feedbackMessage={dashboardMessage}
          stockWarnings={menuStockWarnings}
          onDismissFeedback={() => setDashboardMessage('')}
          onRetryInventory={menuInventoryRetrySale ? () => void retryMenuSaleInventory() : undefined}
        />
      </View>
      <BottomNavigation
        active={route}
        origin={navigationOrigin}
        onSelect={navigate}
        staffOnly
        staffAlertCount={activeAlertCount}
      />
      <Modal
        visible={batterConfirmationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!batterPreparationSubmitting) setBatterConfirmationVisible(false);
        }}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Record this batter batch?</Text>
            <Text style={styles.confirmSubtitle}>
              Deduct the owner-configured raw ingredients once and add exactly {PREPARED_BATTER_BATCH_BOTTLES} prepared batter bottles.
            </Text>
            <View style={styles.confirmSummary}>
              <Text style={styles.confirmSummaryText}>{batterBatchReference ? `Batch reference ${batterBatchReference}` : 'Auto-generated batch reference'}</Text>
              <Text style={styles.confirmSummaryText}>{assignedBranch} · {formatDate(batterPreparationDate)}</Text>
              <Text style={styles.confirmSummaryText}>Recorded with your employee account.</Text>
              <Text style={styles.confirmSummaryText}>If any part fails, nothing is saved.</Text>
            </View>
            {batterPreparationError ? <Text style={styles.fieldError} accessibilityRole="alert">{batterPreparationError}</Text> : null}
            <View style={styles.confirmActions}>
              <Pressable
                accessibilityRole="button"
                disabled={batterPreparationSubmitting}
                onPress={() => setBatterConfirmationVisible(false)}
                style={styles.confirmCancelButton}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={batterPreparationSubmitting}
                onPress={() => void submitBatterPreparation()}
                style={[styles.confirmButton, batterPreparationSubmitting && styles.confirmButtonDisabled]}
              >
                {batterPreparationSubmitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.confirmButtonText}>Confirm</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={batterPreparationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!batterPreparationSubmitting) setBatterPreparationVisible(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.batterPreparationModal}>
            <Text style={styles.modalTitle}>Prepare batter</Text>
            <Text style={styles.modalSubtitle}>
              Every batch produces exactly {PREPARED_BATTER_BATCH_BOTTLES} bottles. Ingredient usage follows the Owner-configured recipe.
            </Text>
            <Text style={styles.fieldLabel}>Batch reference</Text>
            <TextInput
              value={batterBatchReference}
              onChangeText={setBatterBatchReference}
              placeholder="e.g. BATTER-2026-001"
              autoCapitalize="characters"
              editable={!batterPreparationSubmitting}
              style={styles.textInput}
            />
            {batterPreparationError ? (
              <Text style={styles.fieldError} accessibilityRole="alert">{batterPreparationError}</Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                disabled={batterPreparationSubmitting}
                onPress={() => setBatterPreparationVisible(false)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={batterPreparationSubmitting}
              onPress={requestBatterPreparation}
                style={[styles.primaryButton, batterPreparationSubmitting && styles.buttonDisabled]}
              >
                {batterPreparationSubmitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Prepare batch</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={logoutConfirmationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!logoutPending) setLogoutConfirmationVisible(false);
        }}
      >
        <View style={styles.logoutModalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel logout"
            disabled={logoutPending}
            onPress={() => setLogoutConfirmationVisible(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.logoutModalCard}>
            <View style={styles.logoutModalIcon}>
              <AppIcon name="logout" style={styles.logoutModalIconText} />
            </View>
            <Text style={styles.logoutModalTitle}>Do you want to Log out?</Text>
            <Text style={styles.logoutModalDescription}>
              End your session? Any unconfirmed order will be discarded.
            </Text>
            {logoutError !== '' ? (
              <Text style={styles.logoutError} accessibilityRole="alert">{logoutError}</Text>
            ) : null}
            <View style={styles.logoutModalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={logoutPending}
                onPress={() => setLogoutConfirmationVisible(false)}
                style={({ pressed }) => [styles.logoutCancelAction, pressed && styles.pressed]}
              >
                <Text style={styles.logoutCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={logoutPending}
                onPress={confirmLogout}
                style={({ pressed }) => [
                  styles.logoutConfirmAction,
                  pressed && styles.pressed,
                  logoutPending && styles.confirmButtonDisabled,
                ]}
              >
                <Text style={styles.logoutConfirmText}>{logoutPending ? 'Logging out…' : 'Log Out'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={dailyCheckModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDailyCheckModal(null)}
      >
        <View style={styles.dailyModalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close physical inventory dialog"
            onPress={() => setDailyCheckModal(null)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.dailyModalCard}>
            {dailyCheckModal === 'review' ? (
              <>
                <View style={styles.dailyModalIcon}><Text style={styles.dailyModalIconText}>!</Text></View>
                <Text style={styles.dailyModalTitle}>Review your count</Text>
                <Text style={styles.dailyModalSubtitle}>
                  Check each count before submitting. The expected quantities are shown after you submit.
                </Text>
                <View style={styles.dailyModalSummary}>
                  <Text style={styles.dailyModalSummaryText}>
                    {assignedBranch} · {formatDate(today)} · {formatManilaTime(new Date())}
                  </Text>
                  <Text style={styles.dailyModalSummaryEmphasis}>
                    {dailyCheckResults.filter((line) => line.valid).length} of {dailyCheckResults.length} items counted
                  </Text>
                  {dailyCheckResults.map((line) => (
                    <Text key={line.ingredientId} style={styles.dailyModalSummaryText}>
                      {line.name}: {line.valid ? formatDailyUnitQuantity(line.parsedQuantity, line.unit) : '—'}
                    </Text>
                  ))}
                  <Text style={styles.dailyModalSummaryText}>Remarks: {dailyCheckRemarks.trim() || '—'}</Text>
                </View>
                <View style={styles.dailyModalActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setDailyCheckModal(null)}
                    style={({ pressed }) => [styles.dailyModalReviewButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.dailyModalReviewText}>Review</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      if (validateDailyInventoryCheck()) setDailyCheckModal('confirm');
                    }}
                    style={({ pressed }) => [styles.dailyModalPrimaryButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.dailyModalPrimaryText}>Continue</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.dailyModalIcon, styles.dailyConfirmIcon]}>
                  <AppIcon name="success" style={styles.dailyModalIconText} />
                </View>
                <Text style={styles.dailyModalTitle}>Physical Inventory</Text>
                <Text style={styles.dailyModalSubtitle}>
                  Submit the physical count for this branch?
                </Text>
                <View style={styles.dailyModalSummary}>
                  <Text style={styles.dailyModalSummaryText}>{assignedBranch} · {formatDate(today)}</Text>
                  <Text style={styles.dailyModalSummaryText}>Submitting employee account: {user.id}</Text>
                  <Text style={styles.dailyModalSummaryEmphasis}>
                    {dailyCheckLines.length} ingredients counted
                  </Text>
                  {dailyCheckResults.map((line) => (
                    <Text key={line.ingredientId} style={styles.dailyModalSummaryText}>
                      {line.name}: {line.valid ? formatDailyUnitQuantity(line.parsedQuantity, line.unit) : '—'}
                    </Text>
                  ))}
                  <Text style={styles.dailyModalSummaryText}>
                    After you submit, each count is compared with the expected quantity. Differences are sent to the owner for review.
                  </Text>
                  <Text style={styles.dailyModalSummaryText}>Remarks: {dailyCheckRemarks.trim() || '—'}</Text>
                </View>
                <View style={styles.dailyModalActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setDailyCheckModal(route === 'inventoryDiscrepancySubmission' ? null : 'review')
                    }
                    style={({ pressed }) => [styles.dailyModalReviewButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.dailyModalReviewText}>Review</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={dailyCheckSubmitting}
                    onPress={() => {
                      setDailyCheckModal(null);
                      void saveOrRetryDailyInventoryCheck();
                    }}
                    style={({ pressed }) => [
                      styles.dailyModalPrimaryButton,
                      pressed && styles.pressed,
                      dailyCheckSubmitting && styles.confirmButtonDisabled,
                    ]}
                  >
                    <Text style={styles.dailyModalPrimaryText}>{dailyCheckSubmitting ? 'Saving…' : 'Submit Count'}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      <Modal
        visible={dailyCheckLeavePromptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDailyCheckLeavePromptVisible(false)}
      >
        <View style={styles.dailyModalBackdrop}>
          <View style={styles.dailyModalCard} accessibilityRole="alert">
            <View style={styles.dailyModalIcon}><Text style={styles.dailyModalIconText}>!</Text></View>
            <Text style={styles.dailyModalTitle}>Leave the count?</Text>
            <Text style={styles.dailyModalSubtitle}>
              Your entries are not saved yet. Save them as a draft to continue later, or leave without saving.
            </Text>
            <View style={styles.dailyModalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={dailyCheckDraftSaving}
                onPress={() => setDailyCheckLeavePromptVisible(false)}
                style={({ pressed }) => [styles.dailyModalReviewButton, pressed && styles.pressed]}
              >
                <Text style={styles.dailyModalReviewText}>Keep counting</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={dailyCheckDraftSaving}
                onPress={() => void saveDraftAndLeaveDailyInventoryCheck()}
                style={({ pressed }) => [
                  styles.dailyModalPrimaryButton,
                  pressed && styles.pressed,
                  dailyCheckDraftSaving && styles.confirmButtonDisabled,
                ]}
              >
                <Text style={styles.dailyModalPrimaryText}>
                  {dailyCheckDraftSaving ? 'Saving…' : 'Save Draft and Leave'}
                </Text>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={dailyCheckDraftSaving}
              onPress={leaveDailyInventoryCheck}
              style={({ pressed }) => [styles.dailyModalLeaveLink, pressed && styles.pressed]}
            >
              <Text style={styles.dailyModalLeaveLinkText}>Leave without saving</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={confirmationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!confirming) setConfirmationVisible(false);
        }}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            {route !== 'waste' ? (
              <View style={[styles.confirmIcon, route === 'usagePreview' && styles.usageConfirmIcon]}>
                <AppIcon name="download" style={styles.confirmIconText} />
              </View>
            ) : null}
            <Text style={styles.confirmTitle}>
              {route === 'waste'
                ? 'Record Waste / Spoilage'
                : route === 'stockOut'
                ? 'Confirm Stock-Out / Usage'
                : route === 'usagePreview'
                ? 'Confirm cooking usage'
                : route === 'stockIn'
                ? 'Confirm Stock-In'
                : 'Confirm Stock-Out'}
            </Text>
            <Text style={styles.confirmSubtitle}>
              {route === 'waste'
                ? 'Remove spoiled items from available stock.'
                : route === 'stockOut'
                ? 'Record ingredients used in preparation?'
                : route === 'usagePreview'
                ? `Deduct this ${usageMode === 'manual' ? 'manual usage' : 'cooking batch'} from ${assignedBranch}?`
                : route === 'stockIn'
                ? 'Record this ingredient receipt?'
                : `Record this ingredient deduction for ${assignedBranch}?`}
            </Text>
            {route === 'waste' && selectedIngredient && transactionDate ? (
              <View style={styles.confirmSummary}>
                <Text style={styles.confirmSummaryText}>
                  {selectedIngredient.name} · {formatUnitQuantity(Number(quantity), selectedIngredient.unit)}
                </Text>
                <Text style={styles.confirmSummaryText}>Reason: {reason} · {assignedBranch}</Text>
              </View>
            ) : route === 'usagePreview' || route === 'stockOut' ? (
              <View style={styles.confirmSummary}>
                {usageDeductions.map((deduction) => {
                  const ingredient = ingredients.find((item) => item.id === deduction.ingredientId);
                  if (!ingredient) return null;
                  return (
                    <React.Fragment key={ingredient.id}>
                      <Text style={styles.confirmSummaryText}>
                        {ingredient.name} · -{formatQuantity(deduction.quantity)} {ingredient.unit}
                      </Text>
                      <Text style={styles.confirmSummaryText}>
                        Available {formatQuantity(deduction.previousQuantity)} {ingredient.unit} → Remaining {formatQuantity(deduction.newQuantity)} {ingredient.unit}
                      </Text>
                    </React.Fragment>
                  );
                })}
                <Text style={styles.confirmSummaryText}>{assignedBranch} · {reason}</Text>
                <Text style={styles.confirmSummaryText}>{transactionDate ? formatDate(transactionDate) : ''}</Text>
                <Text style={styles.confirmSummaryText}>{staffName}</Text>
                {usageDeductions.some((deduction) => {
                  const item = ingredients.find((ingredient) => ingredient.id === deduction.ingredientId);
                  return item && classifyStockLevel(deduction.newQuantity, item.minimumStock) === 'Low Stock';
                }) ? (
                  <Text style={styles.confirmSummaryText}>
                    This will remain below the {formatQuantity(
                      ingredients.find((item) => item.id === usageDeductions[0]?.ingredientId)?.minimumStock ?? 0,
                    )} {ingredients.find((item) => item.id === usageDeductions[0]?.ingredientId)?.unit ?? ''} minimum.
                  </Text>
                ) : null}
                <Text style={styles.confirmSummaryText}>Notes: {notes.trim() || '—'}</Text>
              </View>
            ) : route === 'stockIn' && selectedIngredient && transactionDate ? (
              <View style={styles.confirmSummary}>
                <Text style={styles.confirmSummaryText}>
                  {selectedIngredient.name} · +{formatUnitQuantity(Number(quantity), selectedIngredient.unit)}
                </Text>
                <Text style={styles.confirmSummaryText}>
                  {assignedBranch} · {formatDate(transactionDate)}
                </Text>
                {expirationDate ? (
                  <Text style={styles.confirmSummaryText}>Expires {formatDate(expirationDate)}</Text>
                ) : null}
              </View>
            ) : selectedIngredient ? (
              <View style={styles.confirmSummary}>
                <View style={styles.confirmSummaryRow}>
                  <Text style={styles.confirmSummaryText}>
                    {selectedIngredient.name} · {route === 'stockIn' ? '+' : '−'}{quantity} {selectedIngredient.unit}
                  </Text>
                </View>
                <Text style={styles.confirmSummaryText}>{transactionDate ? formatReceiptDate(transactionDate) : ''}</Text>
                {route === 'stockIn' ? (
                  <>
                    <Text style={styles.confirmSummaryText}>
                      Expires {expirationDate ? formatDate(expirationDate) : 'not recorded'}
                    </Text>
                    <Text style={styles.confirmBalance}>
                      {formatQuantity(selectedIngredient.quantity)} {selectedIngredient.unit} → {formatQuantity(
                        selectedIngredient.quantity + Number(quantity),
                      )} {selectedIngredient.unit} after receipt
                    </Text>
                    <Text style={styles.confirmSummaryText}>Notes: {notes || '—'}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.confirmSummaryText}>Reason: {reason}</Text>
                    <Text style={styles.confirmBalance}>
                      Available after: {formatQuantity(selectedIngredient.quantity - Number(quantity))} {selectedIngredient.unit}
                    </Text>
                  </>
                )}
              </View>
            ) : null}
            <View style={route === 'waste' || route === 'stockIn' || route === 'stockOut' ? styles.stockInConfirmActions : styles.confirmActions}>
              {route === 'waste' ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    disabled={confirming}
                    onPress={confirmTransaction}
                    style={({ pressed }) => [
                      styles.confirmButton,
                      styles.stockInConfirmButton,
                      pressed && styles.pressed,
                      confirming && styles.confirmButtonDisabled,
                    ]}
                  >
                    <Text style={styles.confirmButtonText}>{confirming ? 'Recording…' : 'Record Waste'}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={confirming}
                    onPress={() => setConfirmationVisible(false)}
                    style={({ pressed }) => [
                      styles.confirmCancelButton,
                      styles.stockInConfirmButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </Pressable>
                </>
              ) : route === 'stockIn' ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    disabled={confirming}
                    onPress={confirmTransaction}
                    style={({ pressed }) => [
                      styles.confirmButton,
                      styles.stockInConfirmButton,
                      pressed && styles.pressed,
                      confirming && styles.confirmButtonDisabled,
                    ]}
                  >
                    <Text style={styles.confirmButtonText}>{confirming ? 'Saving…' : 'Confirm Stock-In'}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={confirming}
                    onPress={() => setConfirmationVisible(false)}
                    style={({ pressed }) => [
                      styles.confirmCancelButton,
                      styles.stockInConfirmButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </Pressable>
                </>
              ) : route === 'stockOut' ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    disabled={confirming}
                    onPress={confirmTransaction}
                    style={({ pressed }) => [
                      styles.confirmButton,
                      styles.stockInConfirmButton,
                      pressed && styles.pressed,
                      confirming && styles.confirmButtonDisabled,
                    ]}
                  >
                    <Text style={styles.confirmButtonText}>
                      {confirming ? 'Recording…' : 'Record Usage'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={confirming}
                    onPress={() => setConfirmationVisible(false)}
                    style={({ pressed }) => [
                      styles.confirmCancelButton,
                      styles.stockInConfirmButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    accessibilityRole="button"
                    disabled={confirming}
                    onPress={() => setConfirmationVisible(false)}
                    style={({ pressed }) => [styles.confirmCancelButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={confirming}
                    onPress={confirmTransaction}
                    style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed, confirming && styles.confirmButtonDisabled]}
                  >
                    <Text style={styles.confirmButtonText}>
                      {confirming
                        ? 'Recording…'
                        : route === 'usagePreview'
                          ? 'Record usage'
                          : 'Confirm'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={route === 'stockOutSuccess' && stockOutAlert !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setStockOutAlert(null)}
      >
        <View style={styles.lowStockAlertBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss stock alert"
            onPress={() => setStockOutAlert(null)}
            style={StyleSheet.absoluteFill}
          />
          {stockOutAlert ? (() => {
            const alertIngredient = ingredients.find((item) => item.id === stockOutAlert.ingredientId);
            if (!alertIngredient) return null;
            const shortage = Math.max(0, stockOutAlert.minimumStock - stockOutAlert.remainingQuantity);
            return (
              <View style={styles.lowStockAlertCard}>
                <Text style={styles.lowStockAlertTitle}>
                  {stockOutAlert.outOfStock
                    ? `Out of stock: ${alertIngredient.name}`
                    : `Low stock: ${alertIngredient.name}`}
                </Text>
                <Text style={styles.lowStockAlertDescription}>
                  Stock-out recorded successfully.
                </Text>
                <View style={styles.lowStockAlertSummary}>
                  <Text style={styles.lowStockAlertSummaryText}>
                    {formatUnitQuantity(stockOutAlert.remainingQuantity, alertIngredient.unit)} available
                  </Text>
                  {stockOutAlert.minimumStock > 0 ? (
                    <Text style={styles.lowStockAlertSummaryText}>
                      Minimum {formatUnitQuantity(stockOutAlert.minimumStock, alertIngredient.unit)} · {formatUnitQuantity(shortage, alertIngredient.unit)} below the threshold
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setStockOutAlert(null);
                    setSelectedAlertIngredientId(alertIngredient.id);
                    setSelectedAlertKind('lowStock');
                    setRoute('alertDetails');
                  }}
                  style={({ pressed }) => [styles.lowStockAlertPrimary, pressed && styles.pressed]}
                >
                  <Text style={styles.lowStockAlertPrimaryText}>View Alerts</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setStockOutAlert(null)}
                  style={({ pressed }) => [styles.lowStockAlertSecondary, pressed && styles.pressed]}
                >
                  <Text style={styles.lowStockAlertSecondaryText}>Done</Text>
                </Pressable>
              </View>
            );
          })() : null}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function useStaffStyles() {
  const theme = useTheme();
  const cachedStyles = staffStylesCache.get(theme);
  if (cachedStyles) return cachedStyles;
  const styles = createStaffStyles(theme);
  staffStylesCache.set(theme, styles);
  return styles;
}

function createStaffStyles(theme: AppTheme) {
  return StyleSheet.create(createThemedStyles({
  workspace: { flex: 1, backgroundColor: '#F5F5F5' },
  screenArea: { flex: 1, minHeight: 0 },
  scroll: { flex: 1 },
  movementFormRoot: { flex: 1, minHeight: 0 },
  wasteFormSurface: {
    flex: 1, minHeight: 0, marginHorizontal: 12, marginVertical: 10, borderRadius: 16,
    backgroundColor: colors.white, overflow: 'hidden', elevation: 2,
    shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
  },
  dashboardContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 20 },
  dashboardLowStockScroll: { flexGrow: 0, marginHorizontal: -18 },
  dashboardLowStockList: { gap: 10, paddingHorizontal: 18, paddingTop: 2, paddingBottom: 8 },
  dashboardPageTitle: { color: colors.ink, fontFamily: font.semibold, fontSize: 21, lineHeight: 28, marginBottom: 9 },
  pageContent: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 24 },
  inventoryListContent: { flexGrow: 1, paddingHorizontal: 17, paddingTop: 22, paddingBottom: 24 },
  inventoryPageHeader: { marginBottom: 14 },
  inventoryHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  inventoryHeaderCopy: { flex: 1, minWidth: 0, paddingTop: 4 },
  inventoryHeaderActions: { alignItems: 'flex-end', justifyContent: 'center' },
  inventoryReportsButton: {
    minHeight: 48, minWidth: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingHorizontal: 12, borderRadius: 24,
    backgroundColor: '#F5F5F4',
  },
  inventoryReportsIcon: {
    width: 18, height: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2,
  },
  inventoryReportsBarOne: {
    width: 3, height: 8, borderRadius: 1, backgroundColor: '#000000',
  },
  inventoryReportsBarTwo: {
    width: 3, height: 13, borderRadius: 1, backgroundColor: '#000000',
  },
  inventoryReportsBarThree: {
    width: 3, height: 10, borderRadius: 1, backgroundColor: '#000000',
  },
  inventoryReportsButtonText: { color: '#000000', fontFamily: font.bold, fontSize: 11 },
  inventoryUnitsLink: {
    minHeight: 40, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 0, marginTop: -6, backgroundColor: 'transparent',
  },
  inventoryUnitsLinkText: { color: '#EC1358', fontFamily: font.semibold, fontSize: 9 },
  inventorySearch: { marginTop: 14 },
  inventoryFilterScroll: { flexGrow: 0, marginBottom: 17 },
  inventoryFilters: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 7, paddingRight: 8 },
  inventoryCount: { color: colors.muted, fontFamily: font.regular, fontSize: 9, marginBottom: 10 },
  inventoryAssignedEmpty: { flex: 1, paddingHorizontal: 17, paddingTop: 22 },
  inventoryState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  inventoryCardSeparator: { height: 9 },
  inventoryCard: {
    minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11,
    paddingVertical: 8, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1,
    borderColor: colors.line, elevation: 1, shadowColor: colors.navy, shadowOpacity: 0.05,
    shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  inventoryCardCopy: { flex: 1, minWidth: 0, marginLeft: 11 },
  inventoryIngredientName: { color: colors.navy, fontFamily: font.semibold, fontSize: 12 },
  inventoryIngredientCategory: { color: colors.muted, fontFamily: font.regular, fontSize: 9, marginTop: 3 },
  inventoryQuantityColumn: { minWidth: 88, alignItems: 'flex-end', justifyContent: 'center', marginLeft: 8 },
  inventoryQuantity: { color: colors.navy, fontFamily: font.semibold, fontSize: 12 },
  inventoryBadgeStack: { alignItems: 'flex-end', gap: 4, marginTop: 4 },
  dashboardExpiration: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
  inventoryChipSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
  inventoryChipText: { color: colors.navy },
  inventoryChipTextSelected: { color: colors.white },
  inventoryEmpty: { flexGrow: 1, minHeight: 290, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingBottom: 20 },
  emptyCube: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyCubeTopLeft: { position: 'absolute', top: 5, left: 7, width: 19, height: 19, borderColor: colors.orange, borderLeftWidth: 2, borderTopWidth: 2, transform: [{ rotate: '45deg' }] },
  emptyCubeTopRight: { position: 'absolute', top: 5, right: 7, width: 19, height: 19, borderColor: colors.orange, borderRightWidth: 2, borderTopWidth: 2, transform: [{ rotate: '-45deg' }] },
  emptyCubeBody: { width: 31, height: 24, marginTop: 9, borderColor: colors.orange, borderWidth: 2, borderTopWidth: 0, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  emptyCubeSeam: { position: 'absolute', top: 16, width: 2, height: 20, backgroundColor: colors.orange },
  inventoryEmptyTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 16, textAlign: 'center' },
  inventoryEmptyMessage: { maxWidth: 295, color: colors.muted, fontFamily: font.regular, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 7 },
  clearFiltersButton: { width: '100%', maxWidth: 300, minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.pink, marginTop: 20 },
  clearFiltersText: { color: colors.white, fontFamily: font.semibold, fontSize: 11 },
  inventoryFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  receiptErrorText: { color: colors.red, fontFamily: font.regular, fontSize: 9, lineHeight: 14, textAlign: 'center', paddingHorizontal: 20, marginTop: 8 },
  detailBackFallback: { padding: 12 },
  detailBackLabel: { color: colors.pink, fontFamily: font.medium, fontSize: 10 },
  detailPage: { paddingHorizontal: 19, paddingTop: 18, paddingBottom: 25 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  detailBackButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#EEEEEF', marginRight: 11 },
  detailBackArrow: { color: colors.navy, fontFamily: font.regular, fontSize: 30, lineHeight: 32, marginTop: -4 },
  detailHeaderCopy: { flex: 1 },
  detailPageTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 17, lineHeight: 23 },
  ingredientSummary: { flexDirection: 'row', alignItems: 'center', marginBottom: 19 },
  ingredientSummaryCopy: { flex: 1, marginLeft: 14 },
  detailIngredientName: { color: colors.navy, fontFamily: font.bold, fontSize: 19 },
  detailIngredientCategory: { color: colors.muted, fontFamily: font.regular, fontSize: 9, marginTop: 2, marginBottom: 4 },
  stockSummaryCard: {
    paddingHorizontal: 17, paddingVertical: 16, borderRadius: 18, backgroundColor: '#EEEEEF',
    elevation: 2, shadowColor: colors.navy, shadowOpacity: 0.06, shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 }, marginBottom: 16,
  },
  stockSummaryQuantity: { color: colors.navy, fontFamily: font.bold, fontSize: 30, lineHeight: 37 },
  stockSummaryCaption: { color: colors.muted, fontFamily: font.regular, fontSize: 9, marginTop: 1 },
  stockSummaryDivider: { height: 1, backgroundColor: '#DADADD', marginVertical: 12 },
  stockSummaryLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  stockSummaryLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 9 },
  stockSummaryValue: { color: colors.navy, fontFamily: font.medium, fontSize: 9, textAlign: 'right', flexShrink: 1, marginLeft: 10 },
  stockGapWarning: { color: colors.red },
  detailRows: { paddingHorizontal: 13, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, marginBottom: 15 },
  detailRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  detailLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 9 },
  detailValue: { flexShrink: 1, color: colors.navy, fontFamily: font.medium, fontSize: 9, textAlign: 'right' },
  permissionNotice: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderRadius: 13, backgroundColor: '#FFF5CB', marginBottom: 15 },
  permissionIcon: { width: 18, height: 18, overflow: 'hidden', borderRadius: 9, backgroundColor: colors.orange, color: colors.white, fontFamily: font.bold, fontSize: 11, textAlign: 'center', marginRight: 9 },
  permissionText: { flex: 1, color: colors.navy, fontFamily: font.regular, fontSize: 9, lineHeight: 14 },
  inventoryDetailSection: { marginBottom: 16 },
  inventoryBatchCard: { paddingHorizontal: 13, paddingTop: 12, paddingBottom: 4, borderRadius: 15, backgroundColor: '#EEEEEF', marginBottom: 9 },
  inventoryBatchTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 10, marginBottom: 3 },
  historyButton: { minHeight: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.pink },
  historyButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 11 },
  historySecondaryButton: { minHeight: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 13, ...secondaryOutline(theme.isDark) },
  historySecondaryButtonText: { color: colors.navy, fontFamily: font.semibold, fontSize: 11 },
  detailDemoNote: { color: colors.muted, fontFamily: font.regular, fontSize: 8, textAlign: 'center', lineHeight: 13, marginTop: 13 },
  historyPlaceholderText: { color: colors.navy, fontFamily: font.semibold, fontSize: 13, marginBottom: 10 },
  historyPageContent: { paddingHorizontal: 17, paddingTop: 12, paddingBottom: 24, flexGrow: 1 },
  saleCompletedCheck: { color: colors.pink, fontFamily: font.bold, fontSize: 34, lineHeight: 40 },
  saleCompletedActions: { gap: 10 },
  saleCompletedTotal: { color: colors.navy, fontFamily: font.bold, fontSize: 22, marginTop: 8 },
  saleReceiptPage: { paddingHorizontal: 17, paddingTop: 12, paddingBottom: 24, flexGrow: 1 },
  saleReceiptHeader: { alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  saleReceiptBusiness: { color: colors.navy, fontFamily: font.bold, fontSize: 16 },
  saleReceiptBranch: { color: colors.muted, fontFamily: font.regular, fontSize: 9, marginTop: 4 },
  saleReceiptReference: { color: colors.navy, fontFamily: font.semibold, fontSize: 10, marginTop: 12 },
  saleReceiptDate: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 4 },
  saleReceiptBulk: { color: colors.pink, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.8, marginTop: 8 },
  dailySalesVoidedAmount: { textDecorationLine: 'line-through', color: colors.muted },
  saleReceiptFooter: { color: colors.muted, fontFamily: font.regular, fontSize: 9, textAlign: 'center', marginTop: 10 },
  saleReceiptVoid: {
    color: colors.red, fontFamily: font.bold, fontSize: 16, letterSpacing: 3, marginTop: 8,
    paddingHorizontal: 14, paddingVertical: 2, borderWidth: 2, borderColor: colors.red, borderRadius: 6,
  },
  saleReceiptLines: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  saleReceiptLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  saleReceiptLineCopy: { flex: 1, minWidth: 0 },
  saleReceiptLineName: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
  saleReceiptLineMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 3 },
  saleReceiptLineTotal: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
  saleReceiptTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginTop: 3, borderTopWidth: 1, borderTopColor: colors.line },
  saleReceiptTotalLabel: { color: colors.navy, fontFamily: font.semibold, fontSize: 11 },
  saleReceiptTotalValue: { color: colors.navy, fontFamily: font.bold, fontSize: 12 },
  saleReceiptDetails: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 13, backgroundColor: '#EEEEEF', marginTop: 13, marginBottom: 12 },
  historyFilterPageContent: { paddingHorizontal: 17, paddingTop: 12, paddingBottom: 24 },
  historyDetailPageContent: { paddingHorizontal: 17, paddingTop: 12, paddingBottom: 24 },
  historySearchWrap: { marginTop: 13, marginBottom: -3 },
  historyMetadataRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginTop: 1, marginBottom: 11,
  },
  historyMetadataCopy: { flex: 1, minWidth: 0 },
  historyMetadataTitle: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
  historyMetadataSubtitle: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 3 },
  historyDateSelector: {
    minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 11, marginBottom: 9, borderRadius: 11, backgroundColor: colors.pale,
    borderWidth: 1, borderColor: colors.line,
  },
  historyDateSelectorText: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
  historyDateSelectorIcon: { color: colors.muted, fontFamily: font.semibold, fontSize: 13 },
  historyTypeTabs: { gap: 7, paddingBottom: 12 },
  historyTypeTab: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#EEEEEF' },
  historyTypeTabSelected: { backgroundColor: colors.navy },
  historyTypeTabText: { color: colors.navy, fontFamily: font.medium, fontSize: 8 },
  historyTypeTabTextSelected: { color: colors.white },
  historyStateCard: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18, borderRadius: 14, backgroundColor: colors.pale },
  historyStateText: { color: colors.muted, fontFamily: font.regular, fontSize: 9, lineHeight: 14, textAlign: 'center' },
  historyFilterAction: { paddingHorizontal: 5, paddingVertical: 6 },
  historyFilterActionText: { color: colors.pink, fontFamily: font.semibold, fontSize: 9 },
  historyTransactionList: { gap: 8 },
  historyTransactionCard: {
    minHeight: 65, justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 9,
    borderRadius: 13, backgroundColor: '#EEEEEF', borderWidth: 1, borderColor: colors.line,
  },
  historyTransactionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  historyTransactionTitleWrap: { flex: 1, minWidth: 0 },
  historyTransactionTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
  historyTransactionReference: { color: colors.muted, fontFamily: font.regular, fontSize: 7, marginTop: 2 },
  historyTypeBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, marginTop: 5, borderRadius: 8 },
  historyTypeBadgePositive: { backgroundColor: '#E8F6EC' },
  historyTypeBadgeNegative: { backgroundColor: '#FCE9EB' },
  historyTypeBadgeNeutral: { backgroundColor: '#E6E6F6' },
  historyTypeBadgeText: { color: colors.navy, fontFamily: font.medium, fontSize: 6 },
  historyTransactionQuantity: { color: colors.navy, fontFamily: font.semibold, fontSize: 10, textAlign: 'right' },
  historyTransactionPositive: { color: colors.green },
  historyTransactionNegative: { color: colors.navy },
  historyTransactionMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 5 },
  historyLedgerBanner: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 10, borderRadius: 12,
    backgroundColor: '#FFF5CB', marginTop: 13,
  },
  historyEmptyState: { flex: 1, minHeight: 370, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  historyEmptyTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 15, textAlign: 'center', marginTop: 13 },
  historyEmptyText: { maxWidth: 275, color: colors.muted, fontFamily: font.regular, fontSize: 9, lineHeight: 15, textAlign: 'center', marginTop: 6 },
  historyEmptyButton: {
    width: '100%', maxWidth: 270, minHeight: 45, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: colors.pink, marginTop: 19,
  },
  historyEmptyButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 10 },
  historyFilterLabel: { color: colors.navy, fontFamily: font.medium, fontSize: 10, marginTop: 17, marginBottom: 8 },
  historyTypeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 17 },
  historyTypeChip: {
    minHeight: 31, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11,
    borderRadius: 16, backgroundColor: '#EEEEEF',
  },
  historyTypeChipSelected: { backgroundColor: colors.navy },
  historyTypeChipText: { color: colors.navy, fontFamily: font.medium, fontSize: 8 },
  historyTypeChipTextSelected: { color: colors.white },
  historyDetailSummary: {
    paddingHorizontal: 15, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.navy,
    marginTop: 14, marginBottom: 12, elevation: 3, shadowColor: colors.navy,
    shadowOpacity: 0.1, shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
  },
  historyDetailSummaryTitle: { color: colors.white, fontFamily: font.semibold, fontSize: 10 },
  historyDetailSummaryQuantity: { color: colors.orange, fontFamily: font.bold, fontSize: 25, lineHeight: 31, marginTop: 3 },
  historyDetailSummaryReference: { color: '#D5D5DF', fontFamily: font.regular, fontSize: 8, marginTop: 3 },
  historyDetailRows: {
    paddingHorizontal: 11, borderRadius: 14, backgroundColor: '#EEEEEF',
    borderWidth: 1, borderColor: colors.line, marginBottom: 12,
  },
  historyDetailButton: {
    minHeight: 46, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, marginTop: 4, ...secondaryOutline(theme.isDark),
  },
  historyDetailButtonText: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
  historyActivityCard: { flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 15, backgroundColor: '#EEEEEF', marginBottom: 8 },
  historyActivityMarker: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFF1E2', marginRight: 10 },
  historyActivityGlyph: { color: colors.orange, fontFamily: font.semibold, fontSize: 18 },
  historyActivityCopy: { flex: 1 },
  historyActivityTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
  historyActivityDetail: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginTop: 3 },
  historicalWasteCard: { backgroundColor: '#FFF8DC', borderWidth: 1, borderColor: '#F1E5B8' },
  historyActivityAmount: { color: colors.green, fontFamily: font.semibold, fontSize: 9, marginLeft: 7 },
  historyUsageAmount: { color: colors.red, fontFamily: font.semibold, fontSize: 9, marginLeft: 7 },
  stockHistoryList: { gap: 9, marginTop: 10 },
  formContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 },
  dashboardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  profileAvatar: {
    width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FCE3EB', marginRight: 10,
  },
  profileHead: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.pink, marginBottom: 2 },
  profileBody: { width: 19, height: 10, borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: colors.pink },
  greetingCopy: { flex: 1 },
  greeting: { color: colors.ink, fontFamily: font.semibold, fontSize: 14, lineHeight: 20 },
  branchName: { color: colors.muted, fontFamily: font.regular, fontSize: 10, marginTop: 1 },
  alertButton: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.pale },
  bellIcon: { width: 22, height: 23, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 1 },
  bellBody: { width: 14, height: 15, borderWidth: 1.7, borderColor: colors.navy, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  bellBase: { width: 18, height: 2, borderRadius: 1, backgroundColor: colors.navy, marginTop: 1 },
  bellClapper: { width: 4, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.navy, marginTop: 1 },
  alertCountBadge: {
    position: 'absolute', top: 3, right: 2, minWidth: 18, height: 18, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.pink,
    borderWidth: 2, borderColor: colors.white,
  },
  alertCountText: { color: colors.white, fontFamily: font.bold, fontSize: 8, lineHeight: 10 },
  searchBar: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    borderRadius: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, marginBottom: 17,
  },
  searchGlyph: { color: colors.muted, fontSize: 25, lineHeight: 29, width: 24, textAlign: 'center', marginRight: 7 },
  searchInput: { flex: 1, minHeight: 42, paddingVertical: 0, color: colors.ink, fontFamily: font.regular, fontSize: 11 },
  clearSearch: { color: colors.muted, fontFamily: font.medium, fontSize: 21, paddingHorizontal: 4 },
  infoBanner: { flexDirection: 'row', alignItems: 'center', padding: 11, borderRadius: 11, backgroundColor: '#EFEEFA', marginBottom: 14 },
  infoBannerText: { flex: 1, color: colors.navy, fontFamily: font.medium, fontSize: 10, lineHeight: 15 },
  inventoryRetryAction: { paddingHorizontal: 6, paddingVertical: 4 },
  inventoryRetryActionText: { color: colors.pink, fontFamily: font.semibold, fontSize: 9 },
  inventoryRetryDisabled: { opacity: 0.55 },
  inventoryRecoveryActions: { gap: 5, marginTop: 6, marginBottom: 8 },
  inventoryRecoveryMessage: { color: colors.orange, fontFamily: font.medium, fontSize: 8, lineHeight: 12, marginTop: 3 },
  inventorySeparateAction: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 4 },
  inventorySeparateActionText: { color: colors.navy, fontFamily: font.medium, fontSize: 8 },
  bannerDismissButton: { paddingLeft: 4, paddingVertical: 2 },
  bannerDismiss: { color: colors.muted, fontFamily: font.medium, fontSize: 19, paddingHorizontal: 4 },
  recoveryError: { paddingVertical: 9, paddingHorizontal: 11, borderRadius: 11, backgroundColor: '#FFF2C4', marginBottom: 12 },
  recoveryErrorText: { color: colors.navy, fontFamily: font.medium, fontSize: 10, lineHeight: 15 },
  unresolvedSalesList: { gap: 7, marginBottom: 15 },
  unresolvedSaleRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line,
  },
  unresolvedSaleCopy: { flex: 1, minWidth: 0 },
  unresolvedSaleReference: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
  unresolvedSaleDate: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
  unresolvedSaleStatus: { color: colors.orange, fontFamily: font.medium, fontSize: 8, marginTop: 2 },
  summaryCard: {
    minHeight: 170, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 17,
    borderRadius: 22, backgroundColor: colors.navy, marginBottom: 19, elevation: 5,
    shadowColor: colors.navy, shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 5 },
  },
  summaryCopy: { width: '77%', zIndex: 2 },
  summaryEyebrow: { color: colors.white, fontFamily: font.semibold, fontSize: 9, letterSpacing: 1.1 },
  summaryTotalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 3 },
  summaryTotal: { color: colors.orange, fontFamily: font.bold, fontSize: 37, lineHeight: 45 },
  summaryItems: { color: colors.white, fontFamily: font.medium, fontSize: 10 },
  summaryAlerts: { color: colors.white, fontFamily: font.regular, fontSize: 9, marginTop: 2 },
  checkNowButton: {
    minHeight: 31, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, marginTop: 11, borderRadius: 17, backgroundColor: colors.pink,
  },
  checkNowText: { color: colors.white, fontFamily: font.semibold, fontSize: 10 },
  checkNowArrow: { color: colors.white, fontSize: 18, lineHeight: 20, marginLeft: 5 },
  summaryPhoto: {
    position: 'absolute', right: -9, top: 24, width: 126, height: 126, overflow: 'hidden',
    borderRadius: 64, backgroundColor: '#FFF4D6', borderWidth: 4, borderColor: '#333448',
  },
  summaryImage: { width: '100%', height: '100%' },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { color: colors.ink, fontFamily: font.semibold, fontSize: 15 },
  sectionHint: { color: colors.muted, fontFamily: font.regular, fontSize: 9 },
  quickActions: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  quickAction: {
    flex: 1, minWidth: 0, minHeight: 76, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 2, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.line, elevation: 2, shadowColor: colors.navy,
    shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  quickActionIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFF1E2', marginBottom: 4 },
  quickActionGlyph: { color: colors.orange, fontFamily: font.semibold, fontSize: 21, lineHeight: 25 },
  quickActionTitle: { color: colors.navy, fontFamily: font.medium, fontSize: 9, textAlign: 'center' },
  dashboardIngredientList: { gap: 8 },
  ingredientThumbnail: { width: 62, height: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  smallThumbnail: { width: 38, height: 38, flexShrink: 0, borderRadius: 11 },
  thumbnailEmoji: { fontSize: 24 },
  thumbnailImage: { width: 34, height: 34 },
  smallThumbnailImage: { width: 24, height: 24 },
  largeThumbnailImage: { width: 40, height: 40 },
  smallThumbnailEmoji: { fontSize: 17 },
  largeThumbnail: { width: 70, height: 80 },
  largeThumbnailEmoji: { fontSize: 28 },
  ingredientCopy: { flex: 1, minWidth: 0, justifyContent: 'center', marginLeft: 9 },
  statusBadge: { alignSelf: 'flex-start', borderRadius: 9, paddingHorizontal: 6, paddingVertical: 3, marginTop: 4 },
  lotBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusBadgeRight: { alignSelf: 'flex-end' },
  statusBadgeText: { fontFamily: font.medium, fontSize: 7 },
  lowBadge: { backgroundColor: colors.yellow },
  lowBadgeText: { color: colors.navy },
  warningBadge: { backgroundColor: colors.paleRed },
  warningBadgeText: { color: colors.red },
  goodBadge: { backgroundColor: colors.paleGreen },
  goodBadgeText: { color: colors.green },
  cardChevron: { color: '#B5B5BF', fontFamily: font.regular, fontSize: 19, marginLeft: 3 },
  expirationHeading: { marginTop: 20 },
  demoNote: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 22 },
  pageHeader: { marginBottom: 17 },
  pageTitle: { color: colors.ink, fontFamily: font.semibold, fontSize: 22, lineHeight: 29 },
  pageSubtitle: { color: colors.muted, fontFamily: font.regular, fontSize: 10, marginTop: 2 },
  categoryScroll: { flexGrow: 0, marginBottom: 19 },
  categoryList: { gap: 8, paddingRight: 6 },
  categoryChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.pale, borderWidth: 1, borderColor: colors.pale },
  inventoryChip: { flexShrink: 0 },
  categoryChipSelected: { backgroundColor: colors.pink, borderColor: colors.pink },
  categoryChipText: { color: colors.muted, fontFamily: font.medium, fontSize: 9 },
  categoryChipTextSelected: { color: colors.white },
  inventorySectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  ingredientList: { gap: 10 },
  emptyState: { color: colors.muted, fontFamily: font.regular, fontSize: 10, lineHeight: 16, paddingVertical: 15 },
  stocksIntro: { color: colors.muted, fontFamily: font.regular, fontSize: 10, lineHeight: 16, marginTop: 3 },
  stocksSummaryCard: { paddingHorizontal: 15, paddingVertical: 15, borderRadius: 16, backgroundColor: colors.navy, marginBottom: 15 },
  stocksSummaryTitle: { color: colors.white, fontFamily: font.semibold, fontSize: 14 },
  stocksSummarySubtitle: { color: '#D5D5DF', fontFamily: font.regular, fontSize: 9, marginTop: 4 },
  stockActionList: { gap: 12, marginTop: 12 },
  actionCard: {
    minHeight: 82, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 11,
    borderRadius: 16, backgroundColor: '#EEEEEF', borderWidth: 1, borderColor: colors.line,
    elevation: 3, shadowColor: colors.navy, shadowOpacity: 0.07, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  actionIconBox: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#FFF5E9', marginRight: 12 },
  actionIcon: { color: colors.orange, fontFamily: font.medium, fontSize: 23, lineHeight: 28 },
  actionCopy: { flex: 1 },
  actionTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 16 },
  actionDescription: { color: colors.muted, fontFamily: font.regular, fontSize: 9, lineHeight: 14, marginTop: 3 },
  actionChevron: { color: colors.orange, fontFamily: font.regular, fontSize: 25, marginLeft: 8 },
  stockTip: { flexDirection: 'row', alignItems: 'flex-start', padding: 13, borderRadius: 13, backgroundColor: '#F7F6FB', marginTop: 19 },
  stockTipIcon: { width: 17, height: 17, borderRadius: 9, overflow: 'hidden', color: colors.white, backgroundColor: colors.navy, fontFamily: font.semibold, fontSize: 11, textAlign: 'center', marginRight: 9 },
  stockTipText: { flex: 1, color: colors.muted, fontFamily: font.regular, fontSize: 9, lineHeight: 14 },
  alertsPageContent: {
    flexGrow: 1, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, backgroundColor: colors.white,
  },
  alertsScreen: { flex: 1, backgroundColor: colors.white },
  alertLandingHeader: { marginBottom: 13 },
  alertPageTitle: { color: colors.ink, fontFamily: font.bold, fontSize: 22, lineHeight: 29 },
  alertBranchName: { color: colors.navy, fontFamily: font.semibold, fontSize: 10, marginTop: 1 },
  alertBusinessDate: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
  alertTabsGrid: { gap: 7, marginBottom: 12 },
  alertTabRow: { flexDirection: 'row', gap: 8 },
  alertTab: {
    flex: 1, minWidth: 0, minHeight: 34, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 7, borderRadius: 18, backgroundColor: '#F5F5F4',
  },
  alertTabSelected: { backgroundColor: '#0F1025' },
  alertTabText: { color: colors.navy, fontFamily: font.medium, fontSize: 9, textAlign: 'center' },
  alertTabTextSelected: { color: colors.white },
  alertCategoryCopy: { gap: 2, marginBottom: 9 },
  alertSortText: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 12 },
  alertCategoryDescription: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 12 },
  alertCardList: { gap: 8 },
  inventoryAlertCard: {
    minHeight: 77, justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 9,
    borderRadius: 11, backgroundColor: '#FDFDFC', borderWidth: 1, borderColor: '#E3E3E6',
  },
  inventoryAlertTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  inventoryAlertName: { flex: 1, minWidth: 0, color: '#000000', fontFamily: font.semibold, fontSize: 11 },
  inventoryAlertBadge: {
    flexShrink: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 9, backgroundColor: '#FDE672',
  },
  inventoryDangerBadge: { backgroundColor: '#FDEBEC' },
  inventoryAlertBadgeIcon: { color: colors.navy, fontFamily: font.bold, fontSize: 8, marginRight: 4 },
  inventoryDangerBadgeText: { color: '#F52F2E' },
  inventoryAlertBadgeText: { color: colors.navy, fontFamily: font.medium, fontSize: 8 },
  inventoryAlertDetail: {
    color: colors.navy, fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 5,
  },
  alertEmptyCard: {
    flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 17,
  },
  alertEmptyIconCircle: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderRadius: 19, backgroundColor: '#E3E3E6', marginBottom: 11,
  },
  alertEmptyBellBody: {
    position: 'absolute', top: 8, width: 13, height: 15, borderWidth: 1.5, borderColor: '#777783',
    borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 3, borderBottomRightRadius: 3,
  },
  alertEmptyBellBase: { position: 'absolute', top: 24, width: 17, height: 1.5, borderRadius: 1, backgroundColor: '#777783' },
  alertEmptyBellClapper: { position: 'absolute', top: 26, width: 4, height: 3, borderRadius: 2, backgroundColor: '#777783' },
  alertEmptyTitle: { color: '#000000', fontFamily: font.semibold, fontSize: 12, textAlign: 'center' },
  alertEmptyText: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 12, textAlign: 'center', marginTop: 5 },
  alertState: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  alertStateTitle: { color: '#000000', fontFamily: font.semibold, fontSize: 12, textAlign: 'center' },
  alertStateText: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 12, textAlign: 'center', marginTop: 6 },
  alertRetryButton: {
    minWidth: 90, minHeight: 40, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, borderRadius: 20, backgroundColor: alertPink, marginTop: 13,
  },
  alertRetryText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
  alertStaleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 9,
    backgroundColor: '#FDE672', marginBottom: 10,
  },
  alertStaleText: { flex: 1, color: colors.navy, fontFamily: font.medium, fontSize: 8, lineHeight: 12 },
  alertStaleRetry: { minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  alertStaleRetryText: { color: alertPink, fontFamily: font.semibold, fontSize: 9 },
  alertRefreshingBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10,
  },
  alertRefreshingText: { color: colors.muted, fontFamily: font.medium, fontSize: 9 },
  alertInfoNote: { alignItems: 'center', gap: 2, marginTop: 'auto', paddingTop: 12 },
  alertInfoText: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11, textAlign: 'center' },
  alertCardAction: {
    color: colors.navy, fontFamily: font.medium, fontSize: 8, marginTop: 5,
  },
  alertDetailContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 },
  alertDetailName: { color: '#000000', fontFamily: font.semibold, fontSize: 15, marginBottom: 6 },
  alertDetailBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  alertDetailBadge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 9, backgroundColor: '#FDE672',
  },
  alertDetailDangerBadge: { backgroundColor: '#FDEBEC' },
  alertDetailBadgeIcon: { color: colors.navy, fontFamily: font.bold, fontSize: 8, marginRight: 4 },
  alertDetailDangerText: { color: '#F52F2E' },
  alertDetailBadgeText: { color: colors.navy, fontFamily: font.medium, fontSize: 8 },
  alertDetailMetrics: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  alertDetailMetric: {
    flex: 1, minWidth: 0, minHeight: 56, justifyContent: 'center',
    paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: '#F5F5F4',
  },
  alertDetailMetricLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 7 },
  alertDetailMetricValue: { color: '#000000', fontFamily: font.semibold, fontSize: 12, marginTop: 3 },
  alertDetailBatchHeading: { color: '#000000', fontFamily: font.semibold, fontSize: 10, marginBottom: 7 },
  alertDetailBatch: {
    paddingHorizontal: 9, paddingVertical: 8, borderRadius: 9,
    backgroundColor: '#F5F5F4', marginBottom: 7,
  },
  alertDetailBatchName: { color: '#000000', fontFamily: font.semibold, fontSize: 8, marginBottom: 3 },
  alertDetailBatchText: { color: colors.navy, fontFamily: font.regular, fontSize: 7, lineHeight: 11 },
  alertDetailBatchEmpty: { color: colors.muted, fontFamily: font.regular, fontSize: 8, paddingVertical: 8 },
  alertDetailBack: {
    minHeight: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 9, backgroundColor: '#EEEEEF', marginTop: 'auto',
  },
  alertDetailBackText: { color: '#000000', fontFamily: font.semibold, fontSize: 8 },
  morePageContent: { paddingHorizontal: 17, paddingTop: 16, paddingBottom: 18 },
  staffIdentityCard: {
    minHeight: 81, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15,
    paddingVertical: 13, borderRadius: 16, backgroundColor: colors.navy, marginBottom: 13,
    elevation: 4, shadowColor: colors.navy, shadowOpacity: 0.13, shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
  },
  staffIdentityAvatar: {
    width: 43, height: 43, alignItems: 'center', justifyContent: 'center',
    borderRadius: 22, backgroundColor: colors.pink, marginRight: 11,
  },
  staffIdentityHead: {
    width: 11, height: 11, borderRadius: 6, backgroundColor: colors.white, marginBottom: 2,
  },
  staffIdentityBody: {
    width: 22, height: 12, borderTopLeftRadius: 12, borderTopRightRadius: 12,
    backgroundColor: colors.white,
  },
  staffIdentityCopy: { flex: 1, minWidth: 0 },
  staffIdentityName: { color: colors.white, fontFamily: font.semibold, fontSize: 11 },
  staffIdentitySubtitle: { color: colors.orange, fontFamily: font.medium, fontSize: 8, marginTop: 3 },
  moreNavigationList: { gap: 8 },
  moreNavigationCard: {
    minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11,
    paddingVertical: 9, borderRadius: 13, backgroundColor: colors.pale,
    borderWidth: 1, borderColor: colors.line,
  },
  moreNavigationIcon: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    borderRadius: 11, backgroundColor: colors.yellow, borderWidth: 1, borderColor: colors.orange,
    marginRight: 10,
  },
  moreNavigationIconText: { color: colors.orange, fontFamily: font.medium, fontSize: 18, lineHeight: 22 },
  moreNavigationCopy: { flex: 1, minWidth: 0 },
  moreNavigationTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
  moreNavigationDescription: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 2 },
  moreNavigationChevron: { color: colors.muted, fontFamily: font.regular, fontSize: 22, marginLeft: 5 },
  moreLogoutButton: { marginTop: 12, marginBottom: 3 },
  profileSettingsContent: { paddingHorizontal: 17, paddingTop: 13, paddingBottom: 18 },
  profileInformationCard: {
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 13, backgroundColor: '#EEEEEF',
    marginBottom: 13,
  },
  profileInformationRow: { flexDirection: 'row', gap: 9, paddingVertical: 4 },
  profileInformationCell: { flex: 1, minWidth: 0 },
  profileInformationLabel: { color: colors.muted, fontFamily: font.regular, fontSize: 7 },
  profileInformationValue: { color: colors.navy, fontFamily: font.medium, fontSize: 8, marginTop: 2 },
  profileSectionTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
  assignedBranchField: {
    minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#EEEEEF', marginTop: 6,
  },
  assignedBranchText: { color: colors.navy, fontFamily: font.medium, fontSize: 8 },
  assignedBranchLock: { color: colors.muted, fontSize: 14 },
  assignedBranchHint: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 4, marginBottom: 9 },
  profileInfoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 9, borderRadius: 10,
    backgroundColor: colors.yellow, marginBottom: 10,
  },
  profileInfoIcon: {
    width: 16, height: 16, overflow: 'hidden', borderRadius: 8, color: colors.white,
    backgroundColor: colors.orange, fontFamily: font.bold, fontSize: 9,
    textAlign: 'center', lineHeight: 16, marginRight: 7,
  },
  profileInfoText: { flex: 1, color: colors.navy, fontFamily: font.regular, fontSize: 7, lineHeight: 11 },
  profileSettingsCard: {
    paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, backgroundColor: '#EEEEEF',
    marginBottom: 10,
  },
  profileAccountSecurityCopy: {
    color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 4,
  },
  profilePasswordButton: {
    minHeight: 48, alignItems: 'center', justifyContent: 'center',
    marginTop: 8, borderRadius: 10, backgroundColor: colors.pink,
  },
  profilePasswordButtonPressed: { opacity: 0.82 },
  profilePasswordButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 12 },
  profileSettingsValue: { color: colors.muted, fontFamily: font.regular, fontSize: 7, textAlign: 'right' },
  profileVersionRow: {
    minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 1, marginBottom: 7,
  },
  themeSection: { marginBottom: 12 },
  themeSegmentedControl: {
    minHeight: 42, flexDirection: 'row', padding: 3, borderRadius: 11,
    backgroundColor: '#EEEEEF', marginTop: 6,
  },
  themeOption: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, gap: 5,
  },
  themeOptionSelected: { backgroundColor: colors.navy },
  themeOptionDisabled: { opacity: 0.58 },
  themeOptionIcon: { color: colors.muted, fontSize: 14 },
  themeOptionIconSelected: { color: '#FFA126' },
  themeOptionText: { color: colors.navy, fontFamily: font.medium, fontSize: 8 },
  themeOptionTextSelected: { color: colors.white },
  themeLimitation: { color: colors.muted, fontFamily: font.regular, fontSize: 6, lineHeight: 9, marginTop: 4 },
  logoutModalBackdrop: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 21,
    paddingVertical: 25, backgroundColor: 'rgba(16, 16, 39, 0.62)',
  },
  logoutModalCard: {
    width: '100%', maxWidth: 355, padding: 17, borderRadius: 18, backgroundColor: colors.white,
    elevation: 16, shadowColor: '#000000', shadowOpacity: 0.22, shadowRadius: 15,
    shadowOffset: { width: 0, height: 7 },
  },
  logoutModalIcon: {
    width: 35, height: 35, alignItems: 'center', justifyContent: 'center',
    borderRadius: 11, backgroundColor: '#FCE3EB', marginBottom: 10,
  },
  logoutModalIconText: { color: colors.pink, fontFamily: font.semibold, fontSize: 20, lineHeight: 23 },
  logoutModalTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 13, lineHeight: 18 },
  logoutModalDescription: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginTop: 5 },
  logoutSessionPanel: { padding: 10, borderRadius: 11, backgroundColor: '#EEEEEF', gap: 4, marginTop: 12 },
  logoutSessionText: { color: colors.navy, fontFamily: font.medium, fontSize: 8, lineHeight: 12 },
  logoutSessionNote: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11 },
  logoutError: { color: colors.red, fontFamily: font.medium, fontSize: 8, lineHeight: 12, marginTop: 8 },
  logoutModalActions: { alignItems: 'stretch', gap: 9, marginTop: 14 },
  logoutCancelAction: {
    minHeight: 39, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, ...secondaryOutline(theme.isDark),
  },
  logoutCancelText: { color: colors.navy, fontFamily: font.medium, fontSize: 8 },
  logoutConfirmAction: {
    minHeight: 39, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, backgroundColor: colors.pink,
  },
  logoutConfirmText: { color: colors.white, fontFamily: font.semibold, fontSize: 8 },
  accountCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 16, backgroundColor: colors.pale, marginBottom: 13 },
  dailyEntryCard: {
    minHeight: 65, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line,
    marginBottom: 14, elevation: 2, shadowColor: colors.navy, shadowOpacity: 0.05,
    shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  dailyEntryIcon: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: '#FCE3EB', marginRight: 10,
  },
  dailyEntryIconText: { color: colors.pink, fontFamily: font.semibold, fontSize: 17 },
  accountName: { color: colors.ink, fontFamily: font.semibold, fontSize: 12 },
  accountBranch: { color: colors.muted, fontFamily: font.regular, fontSize: 9, marginTop: 2 },
  settingsList: { overflow: 'hidden', borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  settingRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  settingIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#FFF1E2', marginRight: 10 },
  settingGlyph: { color: colors.orange, fontFamily: font.semibold, fontSize: 14 },
  settingCopy: { flex: 1 },
  settingChevron: { color: colors.muted, fontFamily: font.regular, fontSize: 22 },
  preferencesHeading: { paddingHorizontal: 13, paddingTop: 14, paddingBottom: 7 },
  preferenceRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 13, paddingRight: 6, borderTopWidth: 1, borderTopColor: colors.line },
  preferenceLabel: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
  moreItemTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 11 },
  moreItemDetail: { color: colors.muted, fontFamily: font.regular, fontSize: 9, marginTop: 5 },
  logoutButton: { alignItems: 'center', justifyContent: 'center', minHeight: 47, borderRadius: 14, backgroundColor: colors.pale, marginTop: 22 },
  logoutButtonText: { color: colors.pink, fontFamily: font.semibold, fontSize: 11 },
  formHeader: {
    minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  categoryReportHeader: { minHeight: 74, alignItems: 'center', borderBottomWidth: 0 },
  formHeaderCopy: { flex: 1, marginLeft: 10 },
  backButton: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.pale },
  backGlyph: { color: colors.navy, fontSize: 30, lineHeight: 32, marginTop: -3 },
  formTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 15, lineHeight: 19 },
  categoryReportTitle: {
    maxWidth: 245, minHeight: 38, fontFamily: font.bold, fontSize: 16, lineHeight: 19,
  },
  formSubtitle: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 1 },
  dailyCheckContent: { paddingHorizontal: 14, paddingTop: 13, paddingBottom: 18 },
  dailySalesContent: { paddingBottom: 20 },
  inventoryReportPage: { flex: 1 },
  inventoryReportScroll: { flex: 1 },
  inventoryReportContent: { paddingHorizontal: 14, paddingTop: 13, paddingBottom: 22 },
  totalQuantityReportContent: { flexGrow: 1, paddingHorizontal: 17, paddingTop: 12, paddingBottom: 18 },
  totalQuantityMetadata: { marginBottom: 8 },
  totalQuantityMetadataText: { color: colors.navy, fontFamily: font.medium, fontSize: 8, lineHeight: 12 },
  totalQuantityInstruction: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginBottom: 7 },
  totalQuantityTable: {
    minWidth: 330, overflow: 'hidden', borderWidth: 1, borderColor: colors.line,
    borderRadius: 10, backgroundColor: colors.white,
  },
  totalQuantityTableHeader: { backgroundColor: colors.pale, borderBottomWidth: 1, borderBottomColor: colors.line },
  totalQuantityTableRow: {
    minHeight: 29, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7,
    borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.white,
  },
  totalQuantityCell: { color: colors.navy, fontFamily: font.regular, fontSize: 8, paddingHorizontal: 4 },
  totalQuantityIngredientCell: { width: 168, fontFamily: font.medium },
  totalQuantityExpectedCell: { width: 89, textAlign: 'right' },
  totalQuantityUnitCell: { width: 48, textAlign: 'right' },
  totalQuantityNote: { color: colors.navy, fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 7 },
  totalQuantityReadOnly: { color: colors.muted, fontFamily: font.medium, fontSize: 8, marginTop: 10 },
  totalQuantityState: { flexGrow: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  totalQuantityStateText: { color: colors.navy, fontFamily: font.semibold, fontSize: 9, marginTop: 8 },
  inventoryReportIntro: { color: colors.muted, fontFamily: font.regular, fontSize: 9, lineHeight: 14, marginBottom: 11 },
  inventoryReportingMetadata: {
    color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginBottom: 11,
  },
  inventoryReportingFooter: {
    color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 7,
  },
  discrepancySaveFailure: {
    marginTop: 8, paddingHorizontal: 2,
  },
  discrepancySaveFailureTitle: {
    color: '#F52F2E', fontFamily: font.medium, fontSize: 8, lineHeight: 12,
  },
  discrepancySaveFailureText: {
    color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 2,
  },
  inventoryReportMetadata: {
    paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.pale,
    marginBottom: 11,
  },
  inventoryReportMetadataText: { color: colors.navy, fontFamily: font.medium, fontSize: 8, lineHeight: 13 },
  physicalCountReportTitle: {
    maxWidth: 245, minHeight: 38, fontFamily: font.bold, fontSize: 16, lineHeight: 19,
  },
  physicalCountMetadata: {
    color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12,
    marginBottom: 9,
  },
  physicalCountContent: { flexGrow: 1 },
  physicalCountCardList: { gap: 8 },
  physicalCountCard: {
    paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, backgroundColor: '#EEEEEE',
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  physicalCountCardTitle: { color: '#000000', fontFamily: font.bold, fontSize: 9, lineHeight: 13 },
  physicalCountCardLine: { color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 2 },
  physicalCountDifference: { fontFamily: font.semibold, fontSize: 8, lineHeight: 12, marginTop: 2 },
  physicalCountDifferenceNegative: { color: '#B9244C' },
  physicalCountDifferenceNeutral: { color: '#000000' },
  physicalCountMeta: { color: '#000000', fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 2 },
  physicalCountAction: { color: '#EC1358', fontFamily: font.semibold, fontSize: 8, lineHeight: 12, marginTop: 5 },
  physicalCountFooter: { color: '#000000', fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 7 },
  physicalCountEmptyState: { flexGrow: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center' },
  physicalCountDetailContent: { flexGrow: 1 },
  physicalCountDetailCard: {
    borderRadius: 12, backgroundColor: '#EEEEEE', paddingHorizontal: 11, paddingVertical: 9,
    marginTop: 8,
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  physicalCountDetailMeta: { color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 2 },
  physicalCountDetailTitle: { color: '#000000', fontFamily: font.bold, fontSize: 10, lineHeight: 14 },
  physicalCountDetailLine: { color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 3 },
  physicalCountSectionTitle: { color: '#000000', fontFamily: font.bold, fontSize: 9, lineHeight: 13 },
  physicalCountReadOnly: { color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 8 },
  branchSummaryReportTitle: {
    maxWidth: 245, minHeight: 38, fontFamily: font.bold, fontSize: 16, lineHeight: 19,
  },
  branchSummaryMetadata: {
    color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12,
    marginBottom: 12,
  },
  branchSummaryStateContainer: {
    flex: 1, paddingHorizontal: 14, paddingTop: 13,
  },
  branchSummaryContent: { flexGrow: 1 },
  branchSummaryCount: {
    color: '#000000', fontFamily: font.bold, fontSize: 9, lineHeight: 12, marginBottom: 7,
  },
  branchSummaryTable: {
    borderRadius: 12, backgroundColor: '#EEEEEE', overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  branchSummaryRow: {
    minHeight: 29, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8,
  },
  branchSummaryHeaderRow: { minHeight: 30, borderBottomWidth: 1, borderBottomColor: '#E3E3E6' },
  branchSummaryCell: {
    color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12,
  },
  branchSummaryIngredientCell: { width: '58%', fontFamily: font.medium },
  branchSummaryExpectedCell: { width: '22%', textAlign: 'right', fontFamily: font.medium },
  branchSummaryUnitCell: { width: '20%', textAlign: 'right' },
  branchSummaryReadOnly: {
    color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 9,
  },
  branchSummaryZeroNote: {
    color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 2,
  },
  branchSummaryEmptyState: {
    flexGrow: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center',
  },
  discrepancyReportTitle: {
    maxWidth: 245, minHeight: 38, fontFamily: font.bold, fontSize: 16, lineHeight: 19,
  },
  discrepancyMetadata: {
    color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12,
    marginBottom: 9,
  },
  discrepancyReportContent: { flexGrow: 1 },
  discrepancyRecordList: { gap: 8 },
  discrepancyRecordCard: {
    paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, backgroundColor: '#EEEEEE',
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  discrepancyRecordTitle: { color: '#000000', fontFamily: font.bold, fontSize: 9, lineHeight: 13 },
  discrepancyRecordLine: { color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12 },
  discrepancyDifference: { color: '#B9244C', fontFamily: font.semibold, fontSize: 8, lineHeight: 12, marginTop: 2 },
  discrepancyRecordMeta: { color: '#000000', fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 2 },
  discrepancyAdjustmentNote: { color: '#000000', fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 2 },
  discrepancyViewLink: { color: '#EC1358', fontFamily: font.semibold, fontSize: 8, lineHeight: 12, marginTop: 5 },
  discrepancyFooter: { color: '#000000', fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 6 },
  discrepancyEmptyState: { flexGrow: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center' },
  discrepancyNeutralButton: {
    minHeight: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, marginTop: 8, ...secondaryOutline(theme.isDark),
  },
  discrepancyNeutralButtonText: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
  discrepancyDetailContent: { flexGrow: 1 },
  discrepancyDetailMetadata: { color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginBottom: 8 },
  discrepancyDetailTitle: { color: '#000000', fontFamily: font.bold, fontSize: 12, lineHeight: 16 },
  discrepancyDetailSummary: { color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 3 },
  discrepancyDetailDifference: { color: '#B9244C', fontFamily: font.semibold, fontSize: 8, lineHeight: 12, marginTop: 2 },
  discrepancyDetailCard: {
    borderRadius: 12, backgroundColor: '#EEEEEE', paddingHorizontal: 10, paddingVertical: 7,
    marginTop: 8,
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  discrepancyDetailRow: {
    minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  discrepancyDetailLabel: { width: '48%', color: '#000000', fontFamily: font.regular, fontSize: 8 },
  discrepancyDetailValue: { width: '52%', color: '#000000', fontFamily: font.bold, fontSize: 8, textAlign: 'right' },
  discrepancyDetailDifferenceValue: { color: '#B9244C' },
  discrepancyDetailReadOnly: { color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 8 },
  discrepancyReviewStatus: { color: '#000000', fontFamily: font.semibold, fontSize: 8, lineHeight: 12, marginTop: 7 },
  discrepancyReviewText: { color: '#000000', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 3 },
  stockStatusMetadata: {
    color: colors.navy, fontFamily: font.medium, fontSize: 8, lineHeight: 12,
    marginBottom: 10,
  },
  stockStatusReportTitle: {
    maxWidth: 245, minHeight: 38, fontFamily: font.bold, fontSize: 16, lineHeight: 19,
  },
  stockStatusReportContent: { flexGrow: 1 },
  stockStatusCardList: { gap: 8 },
  stockStatusCard: {
    minHeight: 62, justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 8,
    borderRadius: 13, backgroundColor: '#EEEEEE',
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  stockStatusIngredientName: {
    color: '#171724', fontFamily: font.bold, fontSize: 10, lineHeight: 13,
  },
  stockStatusQuantity: {
    color: '#171724', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 1,
  },
  stockStatusLabel: {
    fontFamily: font.semibold, fontSize: 8, lineHeight: 11, marginTop: 1,
  },
  stockStatusNormal: { color: '#21823B' },
  stockStatusLow: { color: '#C58A00' },
  stockStatusOut: { color: '#D32F45' },
  stockStatusExplanation: {
    color: '#171724', fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 5,
  },
  stockStatusEmptyState: {
    flexGrow: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center',
  },
  categoryReportMetadata: {
    paddingHorizontal: 0, paddingVertical: 0, borderRadius: 0, backgroundColor: 'transparent',
    marginTop: -2, marginBottom: 13,
  },
  categoryReportMetadataText: {
    color: colors.muted, fontFamily: font.medium, fontSize: 8, lineHeight: 12,
  },
  inventoryReportLink: {
    minHeight: 55, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
    borderRadius: 12, backgroundColor: '#EEEEEF', borderWidth: 1, borderColor: colors.line,
    marginBottom: 7,
  },
  inventoryReportIndex: {
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    borderRadius: 9, backgroundColor: colors.pale, marginRight: 9,
  },
  inventoryReportIndexText: { color: '#FCA639', fontFamily: font.semibold, fontSize: 9 },
  inventoryReportLinkText: { flex: 1, color: colors.navy, fontFamily: font.semibold, fontSize: 9, lineHeight: 13 },
  inventoryReportState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  inventoryReportErrorText: { color: colors.red, fontFamily: font.medium, fontSize: 9, lineHeight: 14, textAlign: 'center' },
  inventoryReportEmpty: { color: colors.muted, fontFamily: font.regular, fontSize: 9, textAlign: 'center', paddingVertical: 18 },
  inventoryReportTable: { minWidth: 480, borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: 'hidden' },
  inventoryReportTableHeader: { backgroundColor: colors.pale, borderBottomWidth: 1, borderBottomColor: colors.line },
  inventoryReportTableRow: {
    minHeight: 43, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.white,
  },
  inventoryReportCell: { width: 110, color: colors.navy, fontFamily: font.regular, fontSize: 8, paddingHorizontal: 5 },
  inventoryReportNameCell: { width: 175, fontFamily: font.medium },
  inventoryReportStatusCell: { width: 105, paddingHorizontal: 5 },
  inventoryReportStatus: {
    alignSelf: 'flex-start', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4,
    borderRadius: 10, fontFamily: font.semibold, fontSize: 7,
  },
  inventoryStatusNormal: { color: '#237547', backgroundColor: '#E4F4EB' },
  inventoryStatusLow: { color: '#97600B', backgroundColor: '#FFF0D0' },
  inventoryStatusOut: { color: '#A6243C', backgroundColor: '#FCE3E9' },
  inventoryReportCountBadge: {
    minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 13, marginBottom: 10, borderRadius: 13, backgroundColor: colors.navy,
  },
  inventoryReportCountLabel: { color: colors.white, fontFamily: font.medium, fontSize: 9 },
  inventoryReportCountValue: { color: colors.orange, fontFamily: font.bold, fontSize: 21 },
  inventoryReportCategoryList: { gap: 7 },
  inventoryReportCategory: { overflow: 'hidden', borderRadius: 12, backgroundColor: '#EEEEEF', borderWidth: 1, borderColor: colors.line },
  inventoryReportCategoryHeading: {
    minHeight: 57, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
  },
  inventoryReportCategoryCopy: { flex: 1, minWidth: 0 },
  inventoryReportCategoryTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
  inventoryReportExpand: { color: colors.pink, fontFamily: font.semibold, fontSize: 18, paddingHorizontal: 8 },
  inventoryReportCategoryItem: {
    minHeight: 41, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 11, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.white,
  },
  categoryReportCategoryList: { gap: 8 },
  categoryReportCategory: {
    overflow: 'hidden', borderRadius: 13, backgroundColor: '#F0F0EF',
    shadowColor: '#000000', shadowOpacity: 0.035, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  categoryReportCategoryHeading: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 13,
  },
  categoryReportCategoryCopy: {
    flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center',
  },
  categoryReportCategoryTitle: {
    flexShrink: 1, color: colors.navy, fontFamily: font.bold, fontSize: 10,
  },
  categoryReportCategoryCount: {
    color: colors.muted, fontFamily: font.medium, fontSize: 8, marginLeft: 4,
  },
  categoryReportExpand: {
    minWidth: 28, textAlign: 'right', color: '#4A4A59',
    fontFamily: font.regular, fontSize: 20, lineHeight: 24,
  },
  categoryReportItems: {
    borderTopWidth: 1, borderTopColor: '#E5E5E7',
  },
  categoryReportItem: {
    minHeight: 39, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 13,
  },
  categoryReportItemName: {
    flex: 1, color: colors.navy, fontFamily: font.regular, fontSize: 9,
  },
  categoryReportItemQuantity: {
    color: colors.navy, fontFamily: font.regular, fontSize: 9,
  },
  categoryReportInstruction: {
    color: colors.muted, fontFamily: font.regular, fontSize: 8,
    lineHeight: 12, textAlign: 'center', marginTop: 10,
  },
  inventoryReportRecordList: { gap: 8 },
  inventoryReportRecord: {
    paddingHorizontal: 11, paddingVertical: 10, borderRadius: 12, backgroundColor: '#EEEEEF',
    borderWidth: 1, borderColor: colors.line,
  },
  inventoryReportShortage: { backgroundColor: '#FFF1F2' },
  inventoryReportExcess: { backgroundColor: '#FFF8EA' },
  inventoryReportRecordHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 },
  inventoryReportRecordTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
  inventoryReportRecordDetail: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 12, marginTop: 2 },
  inventoryReportCorrection: { paddingTop: 5, marginTop: 5, borderTopWidth: 1, borderTopColor: colors.line },
  inventoryReportCorrectionPending: { padding: 10, marginTop: 8, borderRadius: 11, backgroundColor: colors.yellow },
  inventoryReportAction: {
    minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
    marginTop: 9, borderRadius: 11, backgroundColor: colors.pink,
  },
  inventoryReportActionText: { color: colors.white, fontFamily: font.semibold, fontSize: 8 },
  inventoryReportBackButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  inventoryReportBackText: { color: colors.muted, fontFamily: font.medium, fontSize: 8 },
  inventoryReportRecordDifference: { fontFamily: font.semibold, fontSize: 9, marginTop: 4 },
  inventoryReportDifferenceNegative: { color: colors.red },
  inventoryReportDifferencePositive: { color: '#97600B' },
  inventoryReportRecordLink: { color: colors.pink, fontFamily: font.semibold, fontSize: 7, marginTop: 6 },
  inventoryDiscrepancyRemarks: { marginTop: 5, marginBottom: 8 },
  inventoryDiscrepancySaving: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dailySalesDatePicker: { marginHorizontal: 14, marginTop: 13 },
  dailySalesBottomActions: { marginTop: 8, paddingBottom: 8 },
  dailySalesDateButton: {
    minHeight: 42, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 14, borderRadius: 11, backgroundColor: colors.pale,
    borderWidth: 1, borderColor: colors.line,
  },
  dailySalesDateButtonText: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
  dailySalesRefreshButton: {
    minHeight: 42, minWidth: 72, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, borderRadius: 11, backgroundColor: colors.pink,
  },
  dailySalesRefreshText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
  dailySalesFullButton: { alignSelf: 'stretch', marginHorizontal: 14, marginTop: 8 },
  dailySalesTotals: { marginHorizontal: 14, marginBottom: 14, padding: 14, borderRadius: 16, backgroundColor: colors.pale },
  dailySalesSummaryEyebrow: { color: colors.navy, fontFamily: font.semibold, fontSize: 12 },
  dailySalesSummaryLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  dailySalesSummaryMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 9 },
  dailySalesSection: { marginHorizontal: 14, marginBottom: 14, padding: 14, borderRadius: 16, backgroundColor: colors.pale },
  dailySalesRows: {
    gap: 6, marginTop: 8, padding: 8, borderRadius: 13,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line,
  },
  dailySalesRow: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  dailySalesRowCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  dailySalesRowTitle: { color: colors.navy, fontFamily: font.medium, fontSize: 10 },
  dailySalesRowDetail: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
  dailySalesRowAmount: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
  dailySalesLoading: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 10 },
  dailySalesStateText: { color: colors.muted, fontFamily: font.regular, fontSize: 10 },
  dailySalesError: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 35 },
  dailySalesErrorText: { color: colors.red, fontFamily: font.medium, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  dailySalesRetryButton: {
    minHeight: 40, minWidth: 90, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 14, marginTop: 12, borderRadius: 8, backgroundColor: '#EC1358',
  },
  dailySalesRetryText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
  dailySalesEmptyCard: { marginHorizontal: 14, padding: 16, borderRadius: 16, backgroundColor: colors.pale },
  dailySalesEmptyTotal: { color: colors.navy, fontFamily: font.semibold, fontSize: 11 },
  dailySalesReadOnly: { color: colors.muted, fontFamily: font.regular, fontSize: 9, textAlign: 'center', marginVertical: 8 },
  dailySalesEmpty: { color: colors.muted, fontFamily: font.regular, fontSize: 9, textAlign: 'center', padding: 15 },
  dailyCheckIntro: { color: colors.navy, fontFamily: font.medium, fontSize: 9, lineHeight: 14, marginBottom: 12 },
  dailyCheckSearch: {
    minHeight: 42, paddingHorizontal: 11, marginBottom: 10, borderRadius: 11,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.pale,
    color: colors.ink, fontFamily: font.regular, fontSize: 9,
  },
  dailyIngredientOverviewCard: {
    minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8, borderRadius: 13,
    backgroundColor: colors.pale, borderWidth: 1, borderColor: colors.line,
  },
  dailyIngredientOverviewCopy: { flex: 1, minWidth: 0 },
  dailyIngredientOverviewName: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
  dailyIngredientOverviewRecorded: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 3 },
  dailyIngredientOverviewEdit: { color: colors.orange, fontFamily: font.semibold, fontSize: 8 },
  dailyDraftMessage: { color: colors.green, fontFamily: font.medium, fontSize: 8, lineHeight: 12, marginVertical: 7 },
  dailyTableHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingBottom: 6,
  },
  dailyColumnTitle: { color: colors.muted, fontFamily: font.medium, fontSize: 7, minWidth: 0 },
  dailyIngredientColumn: { flex: 1.05 },
  dailyRecordedColumn: { flex: 0.88, textAlign: 'center' },
  dailyPhysicalColumn: { flex: 1.02, textAlign: 'center' },
  dailyDifferenceColumn: { flex: 0.82, textAlign: 'right' },
  dailyRows: { gap: 5 },
  dailyIngredientRow: {
    minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7,
    paddingVertical: 6, borderRadius: 10, backgroundColor: '#EEEEEF',
  },
  dailyIngredientRowDiscrepant: { backgroundColor: colors.paleRed },
  dailyIngredientName: { color: colors.navy, fontFamily: font.semibold, fontSize: 8, minWidth: 0 },
  dailyRecordedValue: { color: colors.ink, fontFamily: font.medium, fontSize: 7, textAlign: 'center', minWidth: 0 },
  dailyPhysicalCell: { alignItems: 'stretch', justifyContent: 'center' },
  dailyPhysicalInput: {
    minHeight: 34, width: '100%', paddingHorizontal: 3, borderRadius: 7,
    borderWidth: 1, borderColor: '#E1E1E4', backgroundColor: '#EEEEEF',
    color: colors.navy, fontFamily: font.medium, fontSize: 9, textAlign: 'center',
  },
  dailyPhysicalInputDiscrepant: { borderWidth: 1.5, borderColor: colors.red, backgroundColor: colors.white },
  dailyPhysicalInputError: { borderWidth: 1.5, borderColor: colors.red },
  dailyFieldError: { color: colors.red, fontFamily: font.regular, fontSize: 6, lineHeight: 9, textAlign: 'center', marginTop: 2 },
  dailyDifferenceValue: { color: colors.red, fontFamily: font.semibold, fontSize: 7, minWidth: 0, textAlign: 'right' },
  dailyDifferenceZero: { color: colors.green },
  dailyDifferenceNegative: { color: colors.red },
  dailyRemarksGroup: { marginTop: 15, marginBottom: 12 },
  dailyLabel: { color: colors.navy, fontFamily: font.medium, fontSize: 9, marginBottom: 5 },
  dailyRemarksInput: {
    minHeight: 48, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10,
    backgroundColor: '#EEEEEF', color: colors.ink, fontFamily: font.regular, fontSize: 9,
    textAlignVertical: 'top',
  },
  dailyDiscrepancyBanner: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 10, borderRadius: 10,
    backgroundColor: colors.paleRed, marginBottom: 10,
  },
  dailyDiscrepancyIcon: {
    width: 17, height: 17, overflow: 'hidden', borderRadius: 9, borderWidth: 1,
    borderColor: colors.red, color: colors.red, fontFamily: font.bold, fontSize: 10,
    textAlign: 'center', lineHeight: 15, marginRight: 7,
  },
  dailyDiscrepancyText: { flex: 1, color: colors.red, fontFamily: font.medium, fontSize: 8, lineHeight: 13 },
  dailyFormError: { color: colors.red, fontFamily: font.medium, fontSize: 8, lineHeight: 13, marginBottom: 9 },
  dailyRetryButton: {
    minHeight: 38, minWidth: 78, alignItems: 'center', justifyContent: 'center',
    alignSelf: 'flex-start', paddingHorizontal: 13, borderRadius: 10, backgroundColor: colors.pink, marginTop: 1,
  },
  dailyRetryButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 8 },
  dailyFormActions: { gap: 8, marginTop: 3 },
  dailyPrimaryButton: {
    minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 12,
    backgroundColor: colors.pink,
  },
  dailyPrimaryButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 10 },
  dailySecondaryButton: {
    minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 12,
    ...secondaryOutline(theme.isDark),
  },
  dailySecondaryButtonText: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
  dailyVerificationRow: { flexDirection: 'row', alignItems: 'center', minHeight: 42, marginBottom: 8 },
  dailyVerificationBox: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginRight: 8, borderRadius: 5, borderWidth: 1.5, borderColor: colors.muted, backgroundColor: colors.white },
  dailyVerificationBoxChecked: { borderColor: colors.pink, backgroundColor: colors.pink },
  dailyVerificationMark: { color: colors.white, fontFamily: font.bold, fontSize: 14, lineHeight: 16 },
  dailyVerificationText: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
  dailyDemoNote: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11, textAlign: 'center', marginTop: 9 },
  dailySuccessFallback: { flex: 1, justifyContent: 'center', padding: 18 },
  dailySuccessBanner: {
    minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11,
    borderRadius: 10, backgroundColor: colors.paleGreen, marginBottom: 13,
  },
  dailySuccessIcon: { color: colors.green, fontFamily: font.bold, fontSize: 15, marginRight: 8 },
  dailySuccessText: { flex: 1, color: '#286D45', fontFamily: font.medium, fontSize: 8, lineHeight: 12 },
  dailySummaryCard: {
    paddingHorizontal: 14, paddingVertical: 13, borderRadius: 15, backgroundColor: colors.navy,
    marginBottom: 12,
  },
  dailySummaryTitle: { color: colors.white, fontFamily: font.semibold, fontSize: 10 },
  dailySummaryCount: { color: colors.orange, fontFamily: font.bold, fontSize: 29, lineHeight: 34, marginTop: 2 },
  dailySummarySubtitle: { color: '#E2E2E9', fontFamily: font.regular, fontSize: 8, marginTop: 2 },
  dailyReceiptDetails: { paddingHorizontal: 11, borderRadius: 13, backgroundColor: '#EEEEEF', marginBottom: 11 },
  dailyReceiptRow: {
    minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, borderBottomWidth: 1, borderBottomColor: '#DDDDDF',
  },
  dailyReceiptLabel: { flex: 0.8, color: colors.muted, fontFamily: font.regular, fontSize: 7 },
  dailyReceiptValue: { flex: 1.2, color: colors.navy, fontFamily: font.medium, fontSize: 7, textAlign: 'right' },
  dailyAuditBanner: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 10, borderRadius: 10,
    backgroundColor: colors.yellow, marginBottom: 12,
  },
  dailyAuditIcon: {
    width: 17, height: 17, overflow: 'hidden', borderRadius: 9, color: colors.white,
    backgroundColor: colors.orange, fontFamily: font.bold, fontSize: 10, textAlign: 'center',
    lineHeight: 17, marginRight: 7,
  },
  dailyAuditText: { flex: 1, color: colors.navy, fontFamily: font.regular, fontSize: 8, lineHeight: 13 },
  compactFormContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 22 },
  receiptInfoBanner: { flexDirection: 'row', alignItems: 'flex-start', padding: 10, borderRadius: 11, backgroundColor: '#FFF5CB', marginBottom: 12 },
  receiptInfoIcon: { width: 17, height: 17, overflow: 'hidden', borderRadius: 9, color: colors.white, backgroundColor: colors.orange, fontFamily: font.bold, fontSize: 10, textAlign: 'center', marginRight: 8 },
  receiptInfoText: { flex: 1, color: colors.navy, fontFamily: font.regular, fontSize: 8, lineHeight: 13 },
  stockInErrorBanner: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 11, backgroundColor: colors.paleRed, marginBottom: 13 },
  stockInErrorIcon: { width: 17, height: 17, overflow: 'hidden', borderRadius: 9, borderWidth: 1, borderColor: colors.red, color: colors.red, fontFamily: font.bold, fontSize: 10, textAlign: 'center', lineHeight: 15, marginRight: 8 },
  stockInErrorText: { flex: 1, color: colors.red, fontFamily: font.medium, fontSize: 8, lineHeight: 13 },
  formError: { color: colors.red, fontFamily: font.medium, fontSize: 10, lineHeight: 15, padding: 10, borderRadius: 10, backgroundColor: colors.paleRed, marginBottom: 13 },
  successBanner: { flexDirection: 'row', alignItems: 'center', padding: 11, borderRadius: 11, backgroundColor: colors.paleGreen, marginBottom: 14 },
  successIcon: { color: colors.green, fontFamily: font.bold, fontSize: 16, marginRight: 8 },
  successText: { flex: 1, color: '#286D45', fontFamily: font.medium, fontSize: 9, lineHeight: 14 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { color: colors.navy, fontFamily: font.medium, fontSize: 10, marginBottom: 6 },
  textInput: {
    minHeight: 42, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 11,
    borderWidth: 1, borderColor: '#E9E9ED', backgroundColor: '#EEEEEF',
    color: colors.ink, fontFamily: font.regular, fontSize: 10,
  },
  textInputError: { borderWidth: 1.5, borderColor: colors.red },
  suffixedInput: { minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 1, borderRadius: 11, borderWidth: 1, borderColor: '#E9E9ED', backgroundColor: '#EEEEEF' },
  suffixedTextInput: { flex: 1, minHeight: 40, borderWidth: 0, backgroundColor: 'transparent' },
  inputSuffix: { color: colors.muted, fontFamily: font.medium, fontSize: 10, paddingHorizontal: 12 },
  fieldError: { color: colors.red, fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 4 },
  batterPreparationModal: {
    width: '100%', maxWidth: 370, padding: 18, borderRadius: 19,
    backgroundColor: colors.white, elevation: 12, shadowColor: '#000000',
    shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 7 },
  },
  batterRecipeCard: {
    padding: 14, borderRadius: 16, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.line, marginBottom: 13,
    elevation: 2, shadowColor: colors.navy, shadowOpacity: 0.05,
    shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
  },
  batterSectionTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 12, marginBottom: 7 },
  batterRecipeTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 11, marginBottom: 8 },
  batterRecipeHeaderRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, paddingBottom: 6 },
  batterRecipeHeaderText: { width: 92, color: colors.muted, fontFamily: font.medium, fontSize: 8, textAlign: 'right' },
  batterRecipeMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 9, lineHeight: 14 },
  batterRecipeRow: {
    minHeight: 31, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line,
  },
  batterRecipeIngredient: { flex: 1, color: colors.ink, fontFamily: font.regular, fontSize: 9 },
  batterRecipeQuantity: { color: colors.navy, fontFamily: font.medium, fontSize: 9, marginLeft: 10 },
  batterRecipeQuantities: { flexDirection: 'row', justifyContent: 'flex-end', width: 204 },
  batterMetaCard: {
    padding: 14, borderRadius: 16, backgroundColor: colors.pale,
    marginBottom: 14,
  },
  batterReferenceText: { color: colors.navy, fontFamily: font.semibold, fontSize: 13, marginTop: 2 },
  batterOutputCard: {
    padding: 14, borderRadius: 16, backgroundColor: '#FFF5CB', marginBottom: 14,
  },
  batterOutputTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
  batterOutputMeta: { color: colors.navy, fontFamily: font.regular, fontSize: 9, lineHeight: 14, marginTop: 3 },
  batterBranchNote: { color: colors.muted, fontFamily: font.regular, fontSize: 8, textAlign: 'center', marginTop: 10 },
  modalTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 15 },
  modalSubtitle: { color: colors.muted, fontFamily: font.regular, fontSize: 9, lineHeight: 14, marginTop: 5, marginBottom: 14 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 15 },
  secondaryButton: { minHeight: 40, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 11, ...secondaryOutline(theme.isDark) },
  secondaryButtonText: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
  primaryButton: { minHeight: 40, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.pink },
  primaryButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
  buttonDisabled: { opacity: 0.6 },
  inlineFieldError: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  inlineFieldErrorIcon: { width: 13, height: 13, overflow: 'hidden', borderRadius: 7, borderWidth: 1, borderColor: colors.red, color: colors.red, fontFamily: font.bold, fontSize: 8, textAlign: 'center', lineHeight: 11, marginRight: 5 },
  notesInput: { minHeight: 76 },
  dateInput: {
    minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: '#E9E9ED', backgroundColor: '#EEEEEF',
  },
  dateInputText: { color: colors.ink, fontFamily: font.regular, fontSize: 10 },
  dateInputAction: { flex: 1, minWidth: 0, justifyContent: 'center', minHeight: 40 },
  calendarButton: { width: 30, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  clearDateButton: { width: 25, height: 32, alignItems: 'center', justifyContent: 'center' },
  clearDateText: { color: colors.muted, fontFamily: font.medium, fontSize: 18, lineHeight: 21 },
  placeholderText: { color: '#A0A0AA' },
  calendarGlyph: { color: colors.orange, fontSize: 17 },
  formRow: { flexDirection: 'column', gap: 0 },
  formRowWide: { flexDirection: 'row', gap: 12 },
  rowField: { flex: 1, minWidth: 0 },
  helperText: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginTop: -8, marginBottom: 14 },
  wasteReasonHelper: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginTop: 5, marginBottom: 12 },
  wasteCountGuidance: { padding: 10, borderRadius: 11, backgroundColor: colors.pale, marginBottom: 12, gap: 4 },
  wasteCountGuidanceText: { color: colors.ink, fontFamily: font.regular, fontSize: 9, lineHeight: 13 },
  wasteCountGuidanceLink: { color: colors.pink, fontFamily: font.semibold, fontSize: 9 },
  selectInput: {
    minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    borderRadius: 11, borderWidth: 1, borderColor: '#E9E9ED', backgroundColor: '#EEEEEF',
  },
  selectText: { flex: 1, color: colors.ink, fontFamily: font.regular, fontSize: 10 },
  availableQuantity: { color: colors.muted, fontFamily: font.medium, fontSize: 8, marginRight: 8 },
  selectChevron: { color: colors.orange, fontSize: 18, marginLeft: 5 },
  dropdown: { maxHeight: 230, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.white, marginTop: 5, overflow: 'hidden' },
  dropdownSearchInput: { minHeight: 38, margin: 8, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.pale, color: colors.ink, fontFamily: font.regular, fontSize: 9 },
  ingredientCategoryHeading: { paddingHorizontal: 10, paddingTop: 9, paddingBottom: 4, color: colors.muted, fontFamily: font.semibold, fontSize: 8, textTransform: 'uppercase' },
  stockInDropdownCopy: { marginLeft: 0, paddingVertical: 2 },
  stockOutDropdownCopy: { marginLeft: 0, paddingVertical: 2 },
  ingredientPickerEmpty: {
    paddingHorizontal: 12, paddingVertical: 13, color: colors.muted,
    fontFamily: font.regular, fontSize: 9, lineHeight: 14,
  },
  dropdownOption: { flexDirection: 'row', alignItems: 'center', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  dropdownCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
  dropdownName: { color: colors.navy, fontFamily: font.medium, fontSize: 10 },
  dropdownQuantity: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
  reasonDropdown: { maxHeight: 230, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.white, marginTop: 5, overflow: 'hidden' },
  ingredientSearchInput: { minHeight: 38, margin: 7, paddingHorizontal: 10, borderRadius: 9, backgroundColor: colors.pale, color: colors.ink, fontFamily: font.regular, fontSize: 9 },
  reasonOption: { paddingHorizontal: 13, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  ingredientReasonOption: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9,
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  reasonOptionText: { color: colors.ink, fontFamily: font.regular, fontSize: 10 },
  reasonOptionSelected: { color: colors.pink, fontFamily: font.semibold },
  stockInFormActions: { alignItems: 'flex-end', gap: 8, marginTop: 7 },
  stockInFormButton: { width: '50%', maxWidth: 180, minHeight: 44 },
  formButtons: { gap: 9, marginTop: 7 },
  wasteFormActions: { alignItems: 'flex-end', gap: 8, marginTop: 7 },
  wasteFormActionButton: { width: '50%', maxWidth: 180, minHeight: 44 },
  saveButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.pink },
  saveButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 11 },
  cancelButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 13, ...secondaryOutline(theme.isDark) },
  cancelButtonText: { color: colors.navy, fontFamily: font.semibold, fontSize: 11 },
  formDemoNote: { color: colors.muted, fontFamily: font.regular, fontSize: 8, textAlign: 'center', marginTop: 14 },
  receiptSuccessBanner: { flexDirection: 'row', alignItems: 'center', padding: 11, borderRadius: 11, backgroundColor: '#F0F6F0', marginTop: 14, marginBottom: 13 },
  receiptSuccessIcon: { color: colors.green, fontFamily: font.bold, fontSize: 16, marginRight: 8 },
  receiptSuccessText: { color: colors.green, fontFamily: font.medium, fontSize: 9 },
  usageModeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  usageModeChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, backgroundColor: '#EEEEEF' },
  usageModeChipSelected: { backgroundColor: colors.navy },
  usageModeChipText: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
  usageModeChipTextSelected: { color: colors.white },
  usageInfoBanner: { flexDirection: 'row', alignItems: 'flex-start', padding: 11, borderRadius: 11, backgroundColor: '#FFF5CB', marginBottom: 13 },
  usageSummaryCard: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: '#EEEEEF',
    elevation: 2, shadowColor: colors.navy, shadowOpacity: 0.05, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, marginBottom: 11,
  },
  usageSummaryHeading: { color: colors.navy, fontFamily: font.semibold, fontSize: 11, paddingVertical: 5 },
  usageReceiptDetails: { paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, marginBottom: 11 },
  usageWarningBanner: { padding: 11, borderRadius: 11, backgroundColor: colors.paleRed, marginBottom: 11 },
  usageWarningText: { color: colors.red, fontFamily: font.medium, fontSize: 9, lineHeight: 14 },
  usageConfirmIcon: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.pink },
  wasteConfirmIcon: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.pink },
  receiptSummaryCard: { paddingHorizontal: 16, paddingVertical: 15, borderRadius: 17, backgroundColor: colors.navy, marginBottom: 14 },
  receiptSummaryTitle: { color: colors.white, fontFamily: font.semibold, fontSize: 12 },
  receiptSummaryQuantity: { color: colors.orange, fontFamily: font.bold, fontSize: 31, lineHeight: 37, marginTop: 3 },
  receiptSummarySubtitle: { color: '#E2E2E9', fontFamily: font.regular, fontSize: 9, marginTop: 2 },
  receiptDetails: { paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#EEEEEF', marginBottom: 13 },
  receiptBackButton: { marginTop: 9 },
  confirmBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(25, 25, 34, 0.55)' },
  confirmCard: { width: '100%', maxWidth: 370, maxHeight: '92%', padding: 18, borderRadius: 19, backgroundColor: colors.white, elevation: 12, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 7 } },
  confirmIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FCE3EB', marginBottom: 11 },
  confirmIconText: { color: colors.pink, fontFamily: font.semibold, fontSize: 22, lineHeight: 26 },
  confirmTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 15 },
  confirmSubtitle: { color: colors.muted, fontFamily: font.regular, fontSize: 9, lineHeight: 14, marginTop: 5 },
  confirmSummary: { padding: 11, borderRadius: 12, backgroundColor: '#EEEEEF', gap: 5, marginTop: 13 },
  confirmSummaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  confirmSummaryText: { color: colors.navy, fontFamily: font.regular, fontSize: 8, lineHeight: 13 },
  confirmBalance: { color: colors.navy, fontFamily: font.semibold, fontSize: 9, lineHeight: 14 },
  confirmActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 9, marginTop: 15 },
  stockInConfirmActions: { gap: 8, marginTop: 15 },
  stockInConfirmButton: { width: '100%', minHeight: 44 },
  confirmCancelButton: { minWidth: 82, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11, ...secondaryOutline(theme.isDark) },
  confirmCancelText: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
  confirmButton: { minWidth: 104, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.pink },
  confirmButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
  confirmButtonDisabled: { opacity: 0.6 },
  lowStockAlertBackdrop: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 19,
    paddingVertical: 26, backgroundColor: 'rgba(25, 25, 34, 0.55)',
  },
  lowStockAlertCard: {
    width: '100%', maxWidth: 370, maxHeight: '92%', padding: 18, borderRadius: 19,
    backgroundColor: colors.white, elevation: 12, shadowColor: '#000000',
    shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 7 },
  },
  lowStockAlertTitle: { color: '#D29A00', fontFamily: font.semibold, fontSize: 14, lineHeight: 20 },
  lowStockAlertDescription: { color: colors.muted, fontFamily: font.regular, fontSize: 9, lineHeight: 14, marginTop: 5 },
  lowStockAlertSummary: {
    padding: 12, borderRadius: 12, backgroundColor: '#FFF5CB', gap: 5, marginTop: 13, marginBottom: 14,
  },
  lowStockAlertSummaryText: { color: colors.navy, fontFamily: font.medium, fontSize: 9, lineHeight: 14 },
  lowStockAlertPrimary: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11,
    backgroundColor: colors.pink, marginBottom: 8,
  },
  lowStockAlertPrimaryText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
  lowStockAlertSecondary: {
    minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11,
    ...secondaryOutline(theme.isDark),
  },
  lowStockAlertSecondaryText: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
  dailyModalBackdrop: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 19,
    paddingVertical: 26, backgroundColor: 'rgba(16, 16, 39, 0.58)',
  },
  dailyModalCard: {
    width: '100%', maxWidth: 365, maxHeight: '90%', padding: 17, borderRadius: 19,
    backgroundColor: colors.white, elevation: 16, shadowColor: '#000000',
    shadowOpacity: 0.22, shadowRadius: 15, shadowOffset: { width: 0, height: 7 },
  },
  dailyModalIcon: {
    width: 37, height: 37, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.pink, backgroundColor: '#FFF8FA',
    marginBottom: 10,
  },
  dailyConfirmIcon: { backgroundColor: '#FCE3EB' },
  dailyModalIconText: { color: colors.pink, fontFamily: font.semibold, fontSize: 20, lineHeight: 23 },
  dailyModalTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 14, lineHeight: 19 },
  dailyModalSubtitle: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginTop: 4 },
  dailyModalSummary: {
    maxHeight: 230, padding: 10, borderRadius: 11, backgroundColor: '#EEEEEF',
    gap: 4, marginTop: 11,
  },
  dailyModalSummaryText: { color: colors.navy, fontFamily: font.regular, fontSize: 7, lineHeight: 11 },
  dailyModalSummaryEmphasis: { color: colors.navy, fontFamily: font.semibold, fontSize: 7, lineHeight: 11 },
  dailyModalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 13 },
  dailyModalReviewButton: { minWidth: 56, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  dailyModalLeaveLink: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 12, marginTop: 6 },
  dailyModalLeaveLinkText: { color: destructiveTextColor(theme.isDark), fontFamily: font.semibold, fontSize: 12 },
  dailyModalReviewText: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
  dailyModalPrimaryButton: {
    minWidth: 100, minHeight: 39, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 13, borderRadius: 10, backgroundColor: colors.pink,
  },
  dailyModalPrimaryText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22, backgroundColor: 'rgba(16, 16, 39, 0.42)' },
  calendarModal: { width: '100%', maxWidth: 350, padding: 18, borderRadius: 20, backgroundColor: colors.white },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  monthArrow: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.pale },
  monthArrowText: { color: colors.navy, fontSize: 24, lineHeight: 27 },
  monthTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 13 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', height: 34, color: colors.muted, fontFamily: font.medium, fontSize: 9, textAlign: 'center', textAlignVertical: 'center' },
  calendarDayCell: { width: '14.2857%', height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  calendarDayDisabled: { opacity: 0.35 },
  calendarDaySelected: { backgroundColor: colors.pink },
  calendarDayText: { color: colors.navy, fontFamily: font.regular, fontSize: 10 },
  calendarDayTextDisabled: { color: colors.muted },
  calendarDayTextSelected: { color: colors.white, fontFamily: font.semibold },
  calendarCancel: { alignSelf: 'flex-end', paddingHorizontal: 13, paddingVertical: 9, marginTop: 8 },
  calendarCancelText: { color: colors.muted, fontFamily: font.medium, fontSize: 10 },
  calendarSelectedText: { color: colors.navy, fontFamily: font.medium, fontSize: 9, marginTop: 14 },
  calendarActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 13 },
  calendarCancelButton: { minHeight: 40, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 11, ...secondaryOutline(theme.isDark) },
  calendarUseButton: { minHeight: 40, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.pink },
  calendarUseText: { color: colors.white, fontFamily: font.semibold, fontSize: 10 },
  stockAlertsUpdatedBanner: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 13, backgroundColor: colors.paleGreen, marginBottom: 14 },
  stockAlertsUpdatedCopy: { flex: 1 },
  stockAlertsUpdatedTitle: { color: colors.green, fontFamily: font.semibold, fontSize: 10 },
  stockAlertsUpdatedText: { color: colors.green, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginTop: 2 },
  stockAlertsUpdatedDismiss: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  stockAlertsUpdatedDismissText: { color: colors.green, fontFamily: font.medium, fontSize: 19 },
  inventoryAlertMovement: { color: colors.muted, fontFamily: font.medium, fontSize: 8, lineHeight: 13, marginTop: 5 },
  }, theme));
}

type StaffStyles = ReturnType<typeof createStaffStyles>;
const staffStylesCache = new WeakMap<AppTheme, StaffStyles>();
