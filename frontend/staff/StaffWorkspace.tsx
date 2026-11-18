import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import BottomNavigation, { type StaffRoute, type StaffTab } from '../navigation/BottomNavigation';
import { createThemedStyles, type AppTheme, useTheme } from '../theme/ThemeProvider';
import MenuWorkspace from './MenuWorkspace';
import type { MenuCartLine } from './menuPreviewData';
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
  isStockAlert,
  runInventoryAlertsRefreshOnce,
  sortInventoryAlerts,
  type InventoryAlertKind,
} from './inventoryAlerts';
import { inventoryTransactionLabels, type InventoryTransactionLabel } from '../services/transactionLabels';
import { PREPARED_BATTER_BATCH_BOTTLES } from '../services/batterPreparation';
import {
  getStaffSaleFeedback,
  runInventoryRetryOnce,
  shouldOfferInventoryRetry,
  loadInventory,
  loadRecentStaffSales,
  loadStaffSaleReceipt,
  loadUnresolvedSales,
  loadStaffMenuCatalog,
  loadSharedRecipes,
  loadTransactionHistory,
  prepareBatterBatch,
  processSaleInventory,
  submitSale,
  submitDailyStockCheck,
  loadStaffDailyStockCheckDraft,
  saveStaffDailyStockCheckDraft,
  deleteStaffDailyStockCheckDraft,
  requestInventoryCountCorrection,
  InventoryCountCorrectionSubmissionError,
  type AppUser,
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
  STAFF_INVENTORY_CATEGORIES,
  type InventoryCountRecord,
  type InventoryReportData,
} from './inventoryReports';
import { formatStaffSaleReceipt } from './saleReceipt';
import { STAFF_INVENTORY_CATALOG } from './staffInventoryCatalog';
import { staffColors, staffFonts } from './theme/staffTokens';
import { StaffStatusBadge } from './components/staffComponents';
import { createStaffStyles } from './staffStyles';
import {
  DEFAULT_STAFF_ALERT_PREFERENCES,
  getActiveStaffAlertPreferences,
  loadStaffAlertPreferences,
  saveStaffAlertPreferences,
  type StaffAlertPreferenceKey,
  type StaffAlertPreferences,
} from './alertPreferences';

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

const inventoryReportSelectionTitles: Record<InventoryReportKey, string> = {
  totalIngredientQuantity: 'Total Ingredient Quantity',
  ingredientCategorySummary: 'Ingredient Category Summary',
  ingredientStockStatus: 'Ingredient Stock Status',
  branchInventorySummary: 'Branch Inventory Summary',
  inventoryDiscrepancy: 'Inventory Discrepancy',
  physicalInventoryCount: 'Physical Inventory Count',
};

const colors = {
  pink: staffColors.primary,
  navy: staffColors.navy,
  orange: staffColors.action,
  ink: staffColors.navy,
  muted: staffColors.secondaryText,
  pale: staffColors.background,
  line: staffColors.divider,
  white: staffColors.white,
  green: staffColors.success,
  paleGreen: staffColors.paleGreen,
  red: staffColors.error,
  paleRed: staffColors.paleRed,
  yellow: staffColors.warning,
} as const;

const alertPink = staffColors.primary;
const font = staffFonts;

type IngredientBatch = {
  reference: string;
  receivedDate: string;
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
  threshold: number;
  lowStock: boolean;
  hasBranchInventory: boolean;
  expiration: string | null;
  nearExpiry: boolean;
  expirationStatus: 'Near Expiry' | 'Expired' | null;
  minimumStock: number;
  type: string;
  unitName: string;
  receivedBatch: string;
  batchReference?: string;
  packageQuantity: number | null;
  packageUnit: string | null;
  packageLabel: string | null;
  batches: IngredientBatch[];
  lastUpdated: string;
  emoji: string;
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
type HistoryTypeFilter = 'All types' | InventoryTransactionLabel | 'Physical Inventory Count';

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

const historyTypeFilters: HistoryTypeFilter[] = [
  'All types',
  ...Object.values(inventoryTransactionLabels),
  'Physical Inventory Count',
];

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

function roundDailyQuantity(quantity: number, unit: string) {
  const precision = unit === 'pcs' ? 1 : 100;
  return Math.round(quantity * precision) / precision;
}

function isValidDailyQuantity(value: string, unit: string) {
  const pattern = unit === 'pcs' ? /^\d+$/ : /^\d+(?:\.\d{1,2})?$/;
  if (!pattern.test(value.trim())) return false;
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity >= 0;
}

function isValidWasteQuantity(value: string, ingredient: Ingredient) {
  const precision = ingredient.quantityPrecision;
  const pattern = precision === 0
    ? /^\d+$/
    : new RegExp(`^(?:\\d+(?:\\.\\d{1,${precision}})?|\\.\\d{1,${precision}})$`);
  return pattern.test(value.trim()) && Number.isFinite(Number(value));
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
      <Text style={styles.searchGlyph}>⌕</Text>
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
          <Text style={styles.clearSearch}>×</Text>
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
        { backgroundColor: isDark ? themeColors.surfaceSecondary : item.tint },
      ]}
      accessibilityLabel={`${item.name} image placeholder`}
    >
      <Text style={[styles.thumbnailEmoji, large && styles.largeThumbnailEmoji, small && styles.smallThumbnailEmoji]}>
        {item.emoji}
      </Text>
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
  return <View style={alignRight ? { alignSelf: 'flex-end' } : undefined}>
    <StaffStatusBadge label={label} status={tone === 'low' ? 'lowStock' : tone === 'warning' ? 'nearExpiry' : 'inStock'} />
  </View>;
}

function InventoryIngredientCard({
  item,
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
  const stockStatus = inventoryStockStatus(item.quantity, item.minimumStock);
  const statusLabel = statusOverride?.label ?? (item.quantity <= 0 ? 'Out of Stock' : item.lowStock ? 'Low Stock' : item.nearExpiry ? 'Near Expiry' : 'In Stock');
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
  const styles = useStaffStyles();
  return (
    <View style={styles.wasteTrashIcon} accessibilityLabel="Waste confirmation">
      <View style={[styles.wasteTrashHandle, { backgroundColor: color }]} />
      <View style={[styles.wasteTrashLid, { backgroundColor: color }]} />
      <View style={[styles.wasteTrashBody, { borderColor: color }]}>
        <View style={[styles.wasteTrashLine, { backgroundColor: color }]} />
        <View style={[styles.wasteTrashLine, { backgroundColor: color }]} />
      </View>
    </View>
  );
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
      <Text style={styles.actionChevron}>›</Text>
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
            <Text style={styles.calendarGlyph}>▦</Text>
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
                <Text style={styles.monthArrowText}>‹</Text>
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
                <Text style={styles.monthArrowText}>›</Text>
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
  user,
  appVersion,
}: {
  onLogout: () => void | Promise<void>;
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
    navy: theme.isDark ? theme.colors.surface : '#101027',
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
  const routeRef = useRef(route);
  routeRef.current = route;
  const [returnRoute, setReturnRoute] = useState<StaffTab>('stocks');
  const [menuCart, setMenuCart] = useState<MenuCartLine[]>([]);
  const [menuTransactionReference, setMenuTransactionReference] = useState<string | null>(null);
  const [menuCatalog, setMenuCatalog] = useState<StaffMenuCatalogItem[]>([]);
  const [menuAddons, setMenuAddons] = useState<StaffMenuAddon[]>([]);
  const menuSaleSubmissionLock = useRef(false);
  const [menuCatalogLoading, setMenuCatalogLoading] = useState(false);
  const [menuCatalogError, setMenuCatalogError] = useState('');
  const [menuCatalogLoaded, setMenuCatalogLoaded] = useState(false);
  const [menuCatalogBranchId, setMenuCatalogBranchId] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [nearExpirationDays, setNearExpirationDays] = useState<number | null>(null);
  const [backendHistory, setBackendHistory] = useState<HistoryTransaction[]>([]);
  const [recentSales, setRecentSales] = useState<StaffSaleRecord[]>([]);
  const [dailySalesDate, setDailySalesDate] = useState(() => manilaBusinessDate());
  const [dailySalesSummary, setDailySalesSummary] = useState<StaffDailySalesSummary | null>(null);
  const [dailySalesLoading, setDailySalesLoading] = useState(false);
  const [dailySalesError, setDailySalesError] = useState('');
  const [dailySalesRefreshKey, setDailySalesRefreshKey] = useState(0);
  const previousToday = useRef(formatLocalIsoDate(manilaBusinessDate()));
  const [inventoryReportData, setInventoryReportData] = useState<InventoryReportData | null>(null);
  const [inventoryReportLoading, setInventoryReportLoading] = useState(false);
  const [inventoryReportError, setInventoryReportError] = useState('');
  const [inventoryReportRefreshKey, setInventoryReportRefreshKey] = useState(0);
  const [selectedInventoryReport, setSelectedInventoryReport] = useState<InventoryReportKey>('totalIngredientQuantity');
  const [selectedInventoryCountId, setSelectedInventoryCountId] = useState<string | null>(null);
  const [expandedInventoryCategories, setExpandedInventoryCategories] = useState<Set<string>>(() => new Set());
  const [inventoryReportingReturnRoute, setInventoryReportingReturnRoute] = useState<'inventory' | 'more'>('inventory');
  const [unresolvedSales, setUnresolvedSales] = useState<UnresolvedSale[]>([]);
  const [unresolvedSalesLoading, setUnresolvedSalesLoading] = useState(false);
  const [unresolvedSalesError, setUnresolvedSalesError] = useState('');
  const [saleHistoryError, setSaleHistoryError] = useState('');
  const [retryingSaleIds, setRetryingSaleIds] = useState<Set<string>>(() => new Set());
  const inventoryRetryLocks = useRef(new Set<string>());
  const [selectedSaleReceiptId, setSelectedSaleReceiptId] = useState<string | null>(null);
  const [saleReceipt, setSaleReceipt] = useState<StaffSaleReceipt | null>(null);
  const [saleReceiptLoading, setSaleReceiptLoading] = useState(false);
  const [saleReceiptError, setSaleReceiptError] = useState('');
  const [saleReceiptShareError, setSaleReceiptShareError] = useState('');
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
  const [alertPreferences, setAlertPreferences] = useState<StaffAlertPreferences>(DEFAULT_STAFF_ALERT_PREFERENCES);
  const [alertPreferencesHydrated, setAlertPreferencesHydrated] = useState(false);
  const [alertPreferencesSaving, setAlertPreferencesSaving] = useState(false);
  const [alertPreferencesError, setAlertPreferencesError] = useState('');

  const applyInventorySnapshot = (
    inventory: Awaited<ReturnType<typeof loadInventory>>,
    branchId: string,
  ) => {
    setIngredients(inventory.items);
    setNearExpirationDays(inventory.nearExpirationDays);
    setAlertSnapshotBranchId(branchId);
    setAlertDataError('');
    setAlertErrorBranchId(null);
  };

  useEffect(() => {
    let active = true;
    setAlertPreferencesHydrated(false);
    setAlertPreferencesError('');
    loadStaffAlertPreferences(AsyncStorage, user.id)
      .then((preferences) => {
        if (active) setAlertPreferences(preferences);
      })
      .catch((error: unknown) => {
        if (active) {
          setAlertPreferencesError(error instanceof Error
            ? error.message
            : 'Unable to load alert preferences. Default alerts remain enabled.');
        }
      })
      .finally(() => {
        if (active) setAlertPreferencesHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [user.id]);

  const updateAlertPreference = async (key: StaffAlertPreferenceKey, value: boolean) => {
    if (!alertPreferencesHydrated || alertPreferencesSaving) return;
    const previous = alertPreferences;
    const next = { ...previous, [key]: value };
    setAlertPreferences(next);
    setAlertPreferencesSaving(true);
    setAlertPreferencesError('');
    try {
      await saveStaffAlertPreferences(AsyncStorage, user.id, next);
    } catch (error: unknown) {
      setAlertPreferences(previous);
      setAlertPreferencesError(error instanceof Error
        ? error.message
        : 'Unable to save alert preferences. Your previous settings were restored.');
    } finally {
      setAlertPreferencesSaving(false);
    }
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
    if (route !== 'inventoryReport') return;
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
  }, [route, user?.branchId, user?.branch, inventoryReportRefreshKey]);

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
      .then(({ products, addons }) => {
        if (active) {
          setMenuCatalog(products);
          setMenuAddons(addons);
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
      return;
    }
    loadStaffMenuCatalog(user.branchId)
      .then(({ products, addons }) => {
        setMenuCatalog(products);
        setMenuAddons(addons);
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
    const unresolved = pendingInventoryTransactions.filter((request) =>
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
  const validateStockInValues = ({
    ingredientId = selectedIngredientId,
    quantityValue = quantity,
    transactionDateValue = transactionDate,
    expirationDateValue = expirationDate,
  }: {
    ingredientId?: string;
    quantityValue?: string;
    transactionDateValue?: Date | null;
    expirationDateValue?: Date | null;
  } = {}) => {
    const errors: Record<string, string> = {};
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) {
      errors.ingredient = 'Ingredient is required.';
    }

    if (!quantityValue.trim()) {
      errors.quantity = 'Quantity is required.';
    } else {
      const parsedQuantity = Number(quantityValue);
      if (Number.isFinite(parsedQuantity) && parsedQuantity <= 0) {
        errors.quantity = 'Quantity must be greater than zero.';
      } else {
        const precision = ingredient?.quantityPrecision ?? 2;
        const validFormat = precision === 0
          ? /^\d+$/.test(quantityValue.trim())
          : new RegExp(`^(?:\\d+(?:\\.\\d{1,${precision}})?|\\.\\d{1,${precision}})$`).test(quantityValue.trim());
        if (!Number.isFinite(parsedQuantity) || !validFormat) {
          errors.quantity = 'Enter a valid number greater than zero.';
        }
      }
    }

    if (!transactionDateValue || !Number.isFinite(transactionDateValue.getTime())) {
      errors.transactionDate = 'Transaction date is required.';
    }
    if (
      expirationDateValue &&
      !Number.isFinite(expirationDateValue.getTime())
    ) {
      errors.expirationDate = 'Enter a valid expiration date.';
    } else if (ingredient?.expirationTracking && !expirationDateValue) {
      errors.expirationDate = 'Expiration date is required for this ingredient.';
    } else if (
      transactionDateValue &&
      expirationDateValue &&
      new Date(
        expirationDateValue.getFullYear(),
        expirationDateValue.getMonth(),
        expirationDateValue.getDate(),
      ).getTime() < new Date(
        transactionDateValue.getFullYear(),
        transactionDateValue.getMonth(),
        transactionDateValue.getDate(),
      ).getTime()
    ) {
      errors.expirationDate = 'Expiration date cannot be earlier than Date.';
    }
    return errors;
  };
  const updateStockInValidation = (values: Parameters<typeof validateStockInValues>[0]) => {
    const errors = validateStockInValues(values);
    setStockInFieldErrors(errors);
    setFormError(Object.keys(errors).length > 0 ? 'Check the required fields to continue.' : '');
  };
  const validateStockOutValues = ({
    ingredientId = selectedIngredientId,
    quantityValue = quantity,
    transactionDateValue = transactionDate,
    reasonValue = reason,
  }: {
    ingredientId?: string;
    quantityValue?: string;
    transactionDateValue?: Date | null;
    reasonValue?: string;
  } = {}) => {
    const errors: Record<string, string> = {};
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) {
      errors.ingredient = 'Ingredient is required.';
    }

    if (!quantityValue.trim()) {
      errors.quantity = 'Quantity used is required.';
    } else {
      const parsedQuantity = Number(quantityValue);
      const precision = ingredient?.quantityPrecision ?? 2;
      const validFormat = precision === 0
        ? /^\d+$/.test(quantityValue.trim())
        : new RegExp(`^\\d+(?:\\.\\d{1,${precision}})?$`).test(quantityValue.trim());
      if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !validFormat) {
        errors.quantity = precision === 0
          ? `Enter a whole number of ${ingredient?.unit ?? 'units'} greater than zero.`
          : `Enter a valid quantity with up to ${precision} decimal places greater than zero.`;
      } else if (ingredient && parsedQuantity > ingredient.quantity) {
        errors.quantity = 'Quantity used exceeds the available stock.';
      }
    }

    if (!transactionDateValue || !Number.isFinite(transactionDateValue.getTime())) {
      errors.transactionDate = 'Transaction date is required.';
    }
    if (!reasonValue.trim()) {
      errors.reason = 'Reason is required.';
    }
    return errors;
  };
  const updateStockOutValidation = (values: Parameters<typeof validateStockOutValues>[0]) => {
    const errors = validateStockOutValues(values);
    setStockOutFieldErrors(errors);
    setQuantityError(errors.quantity ?? '');
    setFormError(Object.keys(errors).length > 0 ? 'Check the required fields to continue.' : '');
  };
  const staffName = user.displayName;
  const staffRole = user.role;
  const staffEmail = user.email;
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
    const matchesType = historyTypeFilter === 'All types' || transaction.type === historyTypeFilter;
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
    const valid = isValidDailyQuantity(line.physicalQuantity, line.unit);
    const difference = valid
      ? roundDailyQuantity(parsedQuantity - line.recordedQuantity, line.unit)
      : null;
    return { ...line, parsedQuantity, valid, difference };
  });
  const dailyDiscrepancies = dailyCheckResults.filter(
    (line) => line.valid && line.difference !== 0,
  );
  const dailyCheckValid =
    dailyCheckResults.length > 0 &&
    dailyCheckResults.every((line) => line.valid);
  useEffect(() => {
    if (
      (route !== 'dailyInventoryCheck' && route !== 'inventoryDiscrepancySubmission') ||
      dailyDiscrepancies.length === 0 ||
      dailyCheckSubmitting ||
      Platform.OS === 'web'
    ) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setDailyCheckLeavePromptVisible(true);
      return true;
    });
    return () => subscription.remove();
  }, [route, dailyDiscrepancies.length, dailyCheckSubmitting]);
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
    (item) => classifyStockAlert(item.quantity, item.minimumStock) === 'lowStock',
  );
  const outOfStockItems = branchInventoryItems.filter(
    (item) => classifyStockAlert(item.quantity, item.minimumStock) === 'outOfStock',
  );
  const nearExpirationBatches = branchInventoryItems.flatMap((item) => {
    if (!item.expirationTracking) return [];
    return filterBatchesWithRemainingStock(item.batches).flatMap((batch) => {
      const expirationDateValue = parseInventoryDate(batch.expirationDateIso ?? batch.expirationDate);
      if (!expirationDateValue) return [];
      const daysRemaining = daysBetweenDates(alertDate, expirationDateValue);
      return classifyExpirationAlert(daysRemaining, nearExpirationDays ?? 0) === 'nearExpiration'
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
      return classifyExpirationAlert(daysRemaining, nearExpirationDays ?? 0) === 'expired'
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
      detail: `Expected: ${formatUnitQuantity(item.quantity, item.unit)}\nMinimum stock level: ${formatUnitQuantity(item.minimumStock, item.unit)}`,
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
      detail: `Expected: ${formatUnitQuantity(item.quantity, item.unit)}\nMinimum stock level: ${formatUnitQuantity(item.minimumStock, item.unit)}`,
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
  const enabledAlerts = inventoryAlerts.filter((item) => {
    const activeAlertPreferences = getActiveStaffAlertPreferences(alertPreferences, alertPreferencesHydrated);
    const preference = isStockAlert(item.kind) ? activeAlertPreferences.lowStock : activeAlertPreferences.expiration;
    return preference;
  });
  const enabledAlertCounts = countInventoryAlertsWhenReady(enabledAlerts, backendLoading, backendError);
  const enabledAlertCount = Object.values(enabledAlertCounts).reduce((total, count) => total + count, 0);
  const hasCurrentAlertSnapshot = Boolean(user.branchId) && alertSnapshotBranchId === user.branchId;
  const alertRefreshError = user.branchId
    ? alertErrorBranchId === user.branchId ? alertDataError : ''
    : backendError;
  const alertScreenStatus = getInventoryAlertScreenStatus(
    hasCurrentAlertSnapshot,
    backendLoading || alertRefreshing,
    alertRefreshError,
  );
  const alertCounts = countInventoryAlertsForSnapshot(enabledAlerts, hasCurrentAlertSnapshot);
  const activeAlertCount = alertCounts
    ? Object.values(alertCounts).reduce((total, count) => total + count, 0)
    : null;
  const dashboardTerm = dashboardSearch.trim().toLowerCase();
  const dashboardMatches = (item: Ingredient) =>
    `${item.name} ${item.category}`.toLowerCase().includes(dashboardTerm);
  const visibleLowStockItems = lowStockItems.filter(dashboardMatches);
  const visibleExpiringItems = expiringItems.filter(dashboardMatches);

  const navigate = (nextRoute: StaffTab) => {
    if (
      (route === 'dailyInventoryCheck' || route === 'inventoryDiscrepancySubmission') &&
      dailyDiscrepancies.length > 0 &&
      !dailyCheckSubmitting
    ) {
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

  const openInventoryReporting = (returnRoute: 'inventory' | 'more' = 'inventory') => {
    setSelectedInventoryReport('totalIngredientQuantity');
    setSelectedInventoryCountId(null);
    setExpandedInventoryCategories(new Set());
    setInventoryReportData(null);
    setInventoryReportError('');
    setInventoryReportingReturnRoute(returnRoute);
    setRoute('inventoryReporting');
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
      setDashboardMessage(`${product.name} is unavailable and was not added.`);
      return;
    }
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

  const changeMenuProductQuantity = (productId: string, change: 1 | -1) => {
    setMenuCart((current) => {
      const next = current.flatMap((line) => {
      if (line.productId !== productId) return [line];
      const quantity = line.quantity + change;
      return quantity > 0 ? [{ ...line, quantity }] : [];
      });
      if (next.length === 0) setMenuTransactionReference(null);
      return next;
    });
  };

  const removeMenuProduct = (productId: string) => {
    setMenuCart((current) => {
      const next = current.filter((line) => line.productId !== productId);
      if (next.length === 0) setMenuTransactionReference(null);
      return next;
    });
  };

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
      openSaleReceipt(sale.id);
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
        items: request.items,
        addons: request.addons,
      });
      setPendingSaleCheckouts(await pendingSaleCheckoutStore.resolve(request.requestId));
      setDashboardMessage(getStaffSaleFeedback(sale.transaction_reference, sale.inventory_processing_status));
      setMenuInventoryRetrySale(shouldOfferInventoryRetry(sale.inventory_processing_status)
        ? { id: sale.id, reference: sale.transaction_reference }
        : null);
      await refreshBackendData();
      openSaleReceipt(sale.id);
    } catch (error) {
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

  const openSaleReceipt = (saleId: string) => {
    setSelectedSaleReceiptId(saleId);
    setSaleReceipt(null);
    setSaleReceiptError('');
    setSaleReceiptShareError('');
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

  const shareSaleReceipt = async () => {
    if (!saleReceipt) return;
    setSaleReceiptShareError('');
    const text = formatStaffSaleReceipt(saleReceipt);
    const fileName = `${saleReceipt.transactionReference.replace(/[^a-z0-9-]/gi, '-')}-receipt.txt`;
    try {
      if (Platform.OS === 'web') {
        if (typeof document === 'undefined') throw new Error('Receipt sharing is unavailable in this browser.');
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        return;
      }
      const directory = FileSystem.cacheDirectory;
      if (!directory) throw new Error('A temporary storage location is unavailable for this receipt.');
      if (!await Sharing.isAvailableAsync()) throw new Error('Receipt sharing is not available on this device.');
      const uri = `${directory}${fileName}`;
      await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(uri, {
        mimeType: 'text/plain',
        dialogTitle: 'Share sale receipt',
        UTI: 'public.plain-text',
      });
    } catch (error) {
      setSaleReceiptShareError(error instanceof Error ? error.message : 'Unable to share this receipt.');
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
      setDashboardMessage(
        `Batter batch ${batch.batch_reference} is recorded: ${PREPARED_BATTER_BATCH_BOTTLES} ${batch.prepared_unit}.`,
      );
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
        .map((item) => ({
          ingredientId: item.id,
          name: item.name,
          recordedQuantity: item.quantity,
          inventoryRevision: item.inventoryRevision,
          physicalQuantity: '',
          unit: item.unit,
        }));
      const draft = await loadStaffDailyStockCheckDraft(user.branchId);
      const draftLines = draft?.lines ?? [];
      setDailyCheckLines(lines.map((line) => {
        const savedLine = draftLines.find((entry) => entry.ingredientId === line.ingredientId);
        return savedLine && savedLine.recordedQuantity === line.recordedQuantity && savedLine.inventoryRevision === line.inventoryRevision
          ? { ...line, physicalQuantity: savedLine.physicalQuantity }
          : line;
      }));
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

  const saveDailyInventoryDraft = async () => {
    if (dailyCheckDraftSaving || !user.branchId || dailyCheckLines.length === 0) return;
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
      setDailyCheckDraftMessage('Matches expected · Draft can be edited until submitted.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save the count draft.');
    } finally {
      setDailyCheckDraftSaving(false);
    }
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
          difference: roundDailyQuantity(physicalQuantity - line.recordedQuantity, line.unit),
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

  const getWasteFieldErrors = ({
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
  } = {}) => {
    const errors: Record<string, string> = {};
    const ingredient = inventory.find((item) => item.id === ingredientId);
    const parsedQuantity = Number(quantityValue);

    if (!ingredient) {
      errors.item = 'Ingredient is required.';
    }
    if (!quantityValue.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      errors.quantity = quantityValue.trim() ? 'Enter a quantity greater than 0.' : 'Quantity Wasted is required.';
    } else if (ingredient && !isValidWasteQuantity(quantityValue, ingredient)) {
      errors.quantity = ingredient.quantityPrecision === 0
        ? 'Enter a whole number of pieces.'
        : `Enter a quantity with up to ${ingredient.quantityPrecision} decimal places.`;
    } else if (ingredient && checkAvailableStock && parsedQuantity > ingredient.quantity) {
      errors.quantity = 'Exceeds available stock.';
    }
    if (!dateValue || !Number.isFinite(dateValue.getTime())) {
      errors.date = 'Transaction date is required.';
    }
    if (!wasteReasons.some((option) => option === reasonValue)) {
      errors.reason = 'Reason is required.';
    }

    return errors;
  };

  const validateWasteForm = (inventory = ingredients) => {
    const errors = getWasteFieldErrors({ inventory });
    setWasteValidationAttempted(true);
    setWasteFieldErrors(errors);
    setFormError(Object.keys(errors).length > 0 ? 'Check the required fields to continue.' : '');
    return Object.keys(errors).length === 0;
  };

  const updateWasteValidation = (values: Parameters<typeof getWasteFieldErrors>[0]) => {
    if (!wasteValidationAttempted) return;
    const errors = getWasteFieldErrors(values);
    setWasteFieldErrors(errors);
    setFormError(Object.keys(errors).length > 0 ? 'Check the required fields to continue.' : '');
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
      const errors = validateStockInValues();
      setStockInValidationAttempted(true);
      setStockInFieldErrors(errors);
      if (Object.keys(errors).length > 0) {
        setFormError('Check the required fields to continue.');
        return false;
      }
      return true;
    }
    if (route === 'stockOut') {
      setStockOutValidationAttempted(true);
      if (usageMode === 'manual') {
        const errors = validateStockOutValues();
        setStockOutFieldErrors(errors);
        setQuantityError(errors.quantity ?? '');
        if (Object.keys(errors).length > 0) {
          setFormError('Check the required fields to continue.');
          return false;
        }
        return true;
      }

      const errors: Record<string, string> = {};
      if (!transactionDate) errors.transactionDate = 'Transaction date is required.';
      if (!reason.trim()) errors.reason = 'Reason is required.';
      setStockOutFieldErrors(errors);
      if (Object.keys(errors).length > 0) {
        setFormError('Check the required fields to continue.');
        return false;
      }
      if (!Number.isFinite(parsedBatchCount) || parsedBatchCount <= 0) {
        setFormError('Enter a batch count greater than 0.');
        return false;
      }
      const unavailableDeduction = usageDeductions.find((deduction) => deduction.quantity > deduction.previousQuantity);
      if (unavailableDeduction) {
        const ingredient = ingredients.find((item) => item.id === unavailableDeduction.ingredientId);
        setFormError(`${ingredient?.name ?? 'Ingredient'} usage exceeds available stock.`);
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
      setFormError(`Only ${selectedIngredient.quantity} ${selectedIngredient.unit} available. Enter a smaller quantity.`);
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
      const requiredFieldErrors = getWasteFieldErrors({ checkAvailableStock: false });
      setWasteValidationAttempted(true);
      setWasteFieldErrors(requiredFieldErrors);
      if (Object.keys(requiredFieldErrors).length > 0) {
        setFormError('Check the required fields to continue.');
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
        const saved = await submitNewInventoryRequest(wasteReason === 'Spoilage' ? 'spoilage' : 'waste', [{
          ingredientId: selectedIngredient.id,
          type: wasteReason === 'Spoilage' ? 'spoilage' : 'waste',
          quantity: wasteQuantity,
          unit: selectedIngredient.unit,
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
        if (message.toLowerCase().includes('exceeds available stock')) {
          setWasteFieldErrors((current) => ({ ...current, quantity: 'Exceeds available stock.' }));
          setWasteValidationAttempted(true);
          setFormError('Check the required fields to continue.');
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
          return {
            ingredientId: deduction.ingredientId,
            type: inventoryType,
            quantity: deduction.quantity,
            unit: ingredient.unit,
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
            deduction.newQuantity <= 0 ||
            (ingredient.minimumStock > 0 && deduction.newQuantity < ingredient.minimumStock)
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
      const saved = await submitNewInventoryRequest('stock_in', [{
        ingredientId: selectedIngredient.id,
        type: 'stock_in',
        quantity: parsedQuantity,
        unit: selectedIngredient.unit,
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
          {enabledAlertCount > 0 ? (
            <View style={styles.alertCountBadge}>
              <Text style={styles.alertCountText}>{enabledAlertCount > 99 ? '99+' : enabledAlertCount}</Text>
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
                <Text style={styles.unresolvedSaleStatus}>Inventory {sale.inventory_processing_status}</Text>
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
                : `${enabledAlertCount} stock alerts need attention`}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigate('inventory')}
            style={({ pressed }) => [styles.checkNowButton, pressed && styles.pressed]}
          >
            <Text style={styles.checkNowText}>Check now</Text>
            <Text style={styles.checkNowArrow}>›</Text>
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
          { title: 'Stock-In', icon: '+', onPress: () => openForm('stockIn', 'menu') },
          { title: 'Stock-Out', icon: '↗', onPress: () => openForm('stockOut', 'menu') },
          { title: 'Waste', icon: '×', onPress: () => openForm('waste', 'menu') },
          {
            title: 'Daily Check',
            icon: '✓',
            onPress: startDailyInventoryCheck,
          },
          {
            title: 'Prepare Batter',
            icon: '＋',
            onPress: () => {
              const date = manilaBusinessDate();
              const sequence = String(Math.floor(Date.now() / 1000)).slice(-6);
              setBatterPreparationDate(date);
              setBatterBatchReference(`Batch #${sequence}`);
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
              <Text style={styles.quickActionGlyph}>{action.icon}</Text>
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
              accessibilityLabel="Reports"
              onPress={() => openInventoryReporting('inventory')}
              style={({ pressed }) => [styles.inventoryReportsButton, pressed && styles.pressed]}
            >
              <View style={styles.inventoryReportsIcon} accessibilityElementsHidden>
                <View style={styles.inventoryReportsBarOne} />
                <View style={styles.inventoryReportsBarTwo} />
                <View style={styles.inventoryReportsBarThree} />
              </View>
              <Text style={styles.inventoryReportsButtonText}>Reports</Text>
            </Pressable>
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
              {STAFF_INVENTORY_CATEGORIES.map((filter) => (
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
          <Text style={styles.detailBackArrow}>‹</Text>
        </Pressable>
        <View style={styles.detailHeaderCopy}>
          <Text style={styles.detailPageTitle}>Units &amp; pack sizes</Text>
          <Text style={styles.pageSubtitle}>{assignedBranch} · Read only</Text>
        </View>
      </View>

      <View style={styles.inventoryDetailSection}>
        <Text style={styles.historyPlaceholderText}>Ingredient UOM</Text>
        {STAFF_INVENTORY_CATALOG.map((item) => (
          <DetailRow
            key={item.id}
            label={item.name}
            value={item.unit === 'g' ? 'g' : item.unit === 'pcs' ? 'pcs' : 'ml'}
          />
        ))}
      </View>

      <View style={styles.inventoryDetailSection}>
        <Text style={styles.historyPlaceholderText}>Purchase packs</Text>
        {filterBranchInventoryAlertItems(ingredients)
          .filter((item) => STAFF_INVENTORY_CATALOG.some((catalogItem) => catalogItem.name === item.name))
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
          Octopus, Cheese and Bonito flakes: 1 kg = 1,000 g.{'\n'}
          Purchase-pack sizes are not current stock quantities.
        </Text>
      </View>
    </ScrollView>
  );

  const renderExpirationInfo = () => {
    const item = selectedIngredient;
    const sortedBatches = item
      ? [...item.batches].sort((left, right) => {
          if (!left.expirationDateIso && !right.expirationDateIso) return left.reference.localeCompare(right.reference);
          if (!left.expirationDateIso) return 1;
          if (!right.expirationDateIso) return -1;
          return left.expirationDateIso.localeCompare(right.expirationDateIso);
        })
      : [];
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.detailPage} showsVerticalScrollIndicator={false}>
        <View style={styles.detailHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to ingredient details"
            onPress={() => setRoute('ingredientDetails')}
            style={styles.detailBackButton}
          >
            <Text style={styles.detailBackArrow}>‹</Text>
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
                {batch.expirationDateIso ? (
                  <StatusBadge
                    label={inventoryExpirationStatus(
                      batch.expirationDateIso,
                      nearExpirationDays ?? 3,
                      manilaBusinessDate(),
                    ) ?? 'Normal'}
                    tone={inventoryExpirationStatus(batch.expirationDateIso, nearExpirationDays ?? 3, manilaBusinessDate()) === 'Expired'
                      ? 'low'
                      : 'warning'}
                  />
                ) : null}
              </View>
            )) : (
              <Text style={styles.inventoryEmptyMessage}>No received batches recorded.</Text>
            )}
          </View>
        ) : null}
        <View style={styles.inventoryDetailSection}>
          <Text style={styles.historyPlaceholderText}>How expiration is highlighted</Text>
          <Text style={styles.inventoryEmptyMessage}>
            Expired: expiration date is before today.{'\n'}
            Near expiry: expires today or within the owner’s alert period.{'\n'}
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

    const gap = selectedIngredient.minimumStock - selectedIngredient.quantity;
    const stockGap = gap > 0
      ? `${formatInventoryQuantity(gap, selectedIngredient.quantityPrecision)} ${selectedIngredient.unit} below minimum`
      : gap < 0
        ? `${formatInventoryQuantity(Math.abs(gap), selectedIngredient.quantityPrecision)} ${selectedIngredient.unit} above minimum`
        : 'At minimum stock';
    const statusLabel = inventoryStockStatus(selectedIngredient.quantity, selectedIngredient.minimumStock);
    const statusTone = statusLabel === 'Normal' ? 'good' : 'low';
    const recentMovements = historyTransactions
      .filter((transaction) => transaction.ingredientId === selectedIngredient.id)
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
            <Text style={styles.detailBackArrow}>‹</Text>
          </Pressable>
          <View style={styles.detailHeaderCopy}>
            <Text style={styles.detailPageTitle}>Ingredient details</Text>
            <Text style={styles.pageSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>

        <View style={styles.ingredientSummary}>
          <IngredientThumbnail item={selectedIngredient} large />
          <View style={styles.ingredientSummaryCopy}>
            <Text style={styles.detailIngredientName}>{selectedIngredient.name}</Text>
            <Text style={styles.detailIngredientCategory}>
              {displayInventoryCategory(selectedIngredient.category)} · {selectedIngredient.unit}
            </Text>
            <StatusBadge label={statusLabel} tone={statusTone} />
            {selectedIngredient.expirationStatus ? (
              <StatusBadge
                label={selectedIngredient.expirationStatus}
                tone={selectedIngredient.expirationStatus === 'Expired' ? 'low' : 'warning'}
              />
            ) : null}
          </View>
        </View>

        <View style={styles.stockSummaryCard}>
          <Text style={styles.stockSummaryQuantity}>
            {formatInventoryUnitQuantity(
              selectedIngredient.quantity,
              selectedIngredient.unit,
              selectedIngredient.quantityPrecision,
            )}
          </Text>
          <Text style={styles.stockSummaryCaption}>Expected quantity</Text>
          <View style={styles.stockSummaryDivider} />
          <View style={styles.stockSummaryLine}>
            <Text style={styles.stockSummaryLabel}>Minimum stock</Text>
            <Text style={styles.stockSummaryValue}>
              {formatInventoryUnitQuantity(
                selectedIngredient.minimumStock,
                selectedIngredient.unit,
                selectedIngredient.quantityPrecision,
              )}
            </Text>
          </View>
          <View style={styles.stockSummaryLine}>
            <Text style={styles.stockSummaryLabel}>Stock gap</Text>
            <Text style={[styles.stockSummaryValue, gap > 0 && styles.stockGapWarning]}>{stockGap}</Text>
          </View>
        </View>

        <View style={styles.detailRows}>
          <DetailRow label="Branch" value={assignedBranch} />
          <DetailRow label="Category" value={displayInventoryCategory(selectedIngredient.category)} />
          <DetailRow label="Unit of measurement" value={selectedIngredient.unitName} />
          <DetailRow
            label="Pack size"
            value={selectedIngredient.packageQuantity !== null && selectedIngredient.packageUnit
              ? `${selectedIngredient.packageLabel ? `${selectedIngredient.packageLabel} · ` : ''}${formatInventoryQuantity(selectedIngredient.packageQuantity, 3)} ${selectedIngredient.packageUnit}`
              : 'Not recorded'}
          />
          <DetailRow label="Expiration" value={selectedIngredient.expiration ?? 'Not recorded'} />
          {selectedIngredient.expirationStatus ? (
            <DetailRow label="Expiration status" value={selectedIngredient.expirationStatus} />
          ) : null}
          <DetailRow label="Last updated" value={selectedIngredient.lastUpdated} />
        </View>

        <View style={styles.inventoryDetailSection}>
          <Text style={styles.historyPlaceholderText}>Received batches</Text>
          {selectedIngredient.batches.length > 0 ? selectedIngredient.batches.map((batch) => {
            const expirationDate = parseInventoryDate(batch.expirationDateIso ?? batch.expirationDate);
            const daysRemaining = expirationDate ? daysBetweenDates(manilaBusinessDate(), expirationDate) : null;
            const alert = selectedIngredient.expirationTracking && daysRemaining !== null && nearExpirationDays !== null
              ? classifyExpirationAlert(daysRemaining, nearExpirationDays)
              : null;
            const batchStatus = alert === 'expired' ? 'Expired' : alert === 'nearExpiration' ? 'Near Expiry' : null;
            return (
              <View key={batch.reference} style={styles.inventoryBatchCard}>
                <Text style={styles.inventoryBatchTitle}>Batch {batch.reference}</Text>
                <DetailRow label="Received date" value={batch.receivedDate || 'Not recorded'} />
                <DetailRow
                  label="Received quantity"
                  value={formatInventoryUnitQuantity(
                    batch.quantityReceived,
                    selectedIngredient.unit,
                    selectedIngredient.quantityPrecision,
                  )}
                />
                <DetailRow label="Expiration date" value={batch.expirationDate ?? 'Not recorded'} />
                <DetailRow
                  label="Remaining quantity"
                  value={formatInventoryUnitQuantity(
                    batch.quantityRemaining,
                    selectedIngredient.unit,
                    selectedIngredient.quantityPrecision,
                  )}
                />
                {batchStatus ? (
                  <StatusBadge label={batchStatus} tone={batchStatus === 'Expired' ? 'low' : 'warning'} />
                ) : null}
              </View>
            );
          }) : (
            <Text style={styles.inventoryEmptyMessage}>No received batches recorded.</Text>
          )}
        </View>

        {selectedIngredient.expirationTracking ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setRoute('expirationInfo')}
            style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}
          >
            <Text style={styles.historyButtonText}>Expiration information</Text>
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
                      selectedIngredient.quantityPrecision,
                    )}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.historyActivityAmount}>
                {transaction.movement > 0 ? '+' : ''}
                {formatInventoryUnitQuantity(
                  transaction.movement,
                  transaction.unit,
                  selectedIngredient.quantityPrecision,
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
          <Text style={styles.detailBackArrow}>‹</Text>
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
            <Text style={styles.backGlyph}>‹</Text>
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

          <View style={styles.wasteFormActions}>
            <Pressable
              accessibilityRole="button"
              disabled={batterPreparationSubmitting}
              onPress={() => void submitBatterPreparation()}
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
          icon={<Text style={styles.actionIcon}>↓</Text>}
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
          icon={<Text style={styles.actionIcon}>◒</Text>}
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
    const relatedAlerts = enabledAlerts.filter((alert) => alert.ingredientId === item.id);
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
                <Text style={[styles.alertDetailBadgeIcon, danger && styles.alertDetailDangerText]}>
                  {kind === 'nearExpiration' ? '◷' : danger ? '!' : '▲'}
                </Text>
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
            <Text style={[
              styles.inventoryAlertBadgeIcon,
              danger && styles.inventoryDangerBadgeText,
            ]}>{alert.kind === 'nearExpiration' ? '◷' : danger ? '!' : '▲'}</Text>
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
    const selectedAlerts = enabledAlerts.filter((alert) => alert.kind === selectedAlertTab);
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
          ? `Owner setting: expiration within the next ${nearExpirationDays ?? 0} days`
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
                <View style={styles.alertEmptyIconCircle}>
                  <View style={styles.alertEmptyBellBody} />
                  <View style={styles.alertEmptyBellBase} />
                  <View style={styles.alertEmptyBellClapper} />
                </View>
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
          <Pressable accessibilityRole="button" accessibilityLabel="Back to More" onPress={() => navigate('more')} style={styles.backButton}>
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Daily Inventory Check</Text>
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
                  Recorded {formatDailyUnitQuantity(line.recordedQuantity, line.unit)}
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
        </ScrollView>
      </>
    );
  };

  const renderDailyInventoryCheck = () => {
    const unresolvedDailyChecks = pendingDailyStockChecks.filter(
      (request) => request.actorId === user.id && request.branchId === user.branchId,
    );
    const discrepancyMessage = dailyDiscrepancies.length === 1
      ? `1 discrepancy found. Review ${dailyDiscrepancies[0].name}'s ${formatDailyDifference(
          dailyDiscrepancies[0].difference ?? 0,
          dailyDiscrepancies[0].unit,
        )} difference before submitting.`
      : `${dailyDiscrepancies.length} discrepancies found. Review ${dailyDiscrepancies
          .map((line) => `${line.name}'s ${formatDailyDifference(line.difference ?? 0, line.unit)}`)
          .join(' and ')} differences before submitting.`;

    return (
      <>
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to More"
            onPress={() => navigate('more')}
            style={styles.backButton}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Daily inventory check</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.dailyCheckContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.dailyCheckIntro}>Enter the actual count. Difference = Actual − Recorded.</Text>
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
            <Text style={[styles.dailyColumnTitle, styles.dailyRecordedColumn]}>Recorded</Text>
            <Text style={[styles.dailyColumnTitle, styles.dailyPhysicalColumn]}>Physical</Text>
            <Text style={[styles.dailyColumnTitle, styles.dailyDifferenceColumn]}>Diff.</Text>
          </View>
          <View style={styles.dailyRows}>
            {dailyCheckResults.filter((line) => line.name.toLowerCase().includes(dailyCheckSearch.trim().toLowerCase())).map((line) => {
              const discrepant = line.valid && line.difference !== 0;
              const showError = !line.valid && (dailyCheckAttempted || line.physicalQuantity.trim() !== '');
              const errorText = line.physicalQuantity.trim() === ''
                ? 'Enter a quantity.'
                : line.physicalQuantity.includes('-')
                  ? 'Quantity cannot be negative.'
                  : line.unit === 'pcs'
                    ? 'Enter a whole number.'
                    : 'Enter a valid quantity (up to 2 decimals).';
              const physicalError = showError ? errorText : '';

              return (
                <View
                  key={line.ingredientId}
                  style={[styles.dailyIngredientRow, discrepant && styles.dailyIngredientRowDiscrepant]}
                >
                  <Text style={[styles.dailyIngredientName, styles.dailyIngredientColumn]} numberOfLines={1}>
                    {line.name}
                  </Text>
                  <Text style={[styles.dailyRecordedValue, styles.dailyRecordedColumn]} numberOfLines={1}>
                    {formatDailyUnitQuantity(line.recordedQuantity, line.unit)}
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
                      keyboardType={line.unit === 'pcs' ? 'number-pad' : 'decimal-pad'}
                      style={[
                        styles.dailyPhysicalInput,
                        discrepant && styles.dailyPhysicalInputDiscrepant,
                        physicalError !== '' && styles.dailyPhysicalInputError,
                      ]}
                    />
                    {physicalError !== '' ? (
                      <Text style={styles.dailyFieldError}>{physicalError}</Text>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.dailyDifferenceValue,
                      styles.dailyDifferenceColumn,
                      line.valid && line.difference === 0 && styles.dailyDifferenceZero,
                      discrepant && styles.dailyDifferenceNegative,
                    ]}
                    numberOfLines={1}
                  >
                    {line.valid && line.difference !== null
                      ? formatDailyDifference(line.difference, line.unit)
                      : '—'}
                  </Text>
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
              placeholder="Add remarks"
              placeholderTextColor={colors.muted}
              style={styles.dailyRemarksInput}
              multiline
            />
          </View>

          {dailyDiscrepancies.length > 0 ? (
            <View style={styles.dailyDiscrepancyBanner} accessibilityRole="alert">
              <Text style={styles.dailyDiscrepancyIcon}>!</Text>
              <Text style={styles.dailyDiscrepancyText}>{discrepancyMessage}</Text>
            </View>
          ) : null}
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
              {dailyCheckVerified ? <Text style={styles.dailyVerificationMark}>✓</Text> : null}
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
              <Text style={styles.dailyPrimaryButtonText}>{dailyDiscrepancies.length > 0 ? 'Save' : 'Review differences'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigate('more')}
              style={({ pressed }) => [styles.dailySecondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.dailySecondaryButtonText}>Back to More</Text>
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
            Daily checks are saved for owner review. Physical counts never adjust recorded stock.
          </Text>
        </ScrollView>
      </>
    );
  };

  const renderDailyCheckSuccess = () => {
    if (!currentDailyCheck) {
      return (
        <View style={styles.dailySuccessFallback}>
          <Text style={styles.dailyCheckIntro}>No submitted daily check is available.</Text>
          <Pressable onPress={() => navigate('more')} style={styles.dailyPrimaryButton}>
            <Text style={styles.dailyPrimaryButtonText}>Back to More</Text>
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
            accessibilityLabel="Back to Inventory"
            onPress={() => navigate('inventory')}
            style={styles.backButton}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>{hasDiscrepancies ? 'Inventory Discrepancy' : 'Daily inventory check'}</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.dailyCheckContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.dailySuccessBanner} accessibilityRole="alert">
            <Text style={styles.dailySuccessIcon}>✓</Text>
            <Text style={styles.dailySuccessText}>
              {hasDiscrepancies ? 'Submitted for Owner Review.' : 'Daily inventory check saved successfully.'}
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

          {hasDiscrepancies ? (
            <View style={styles.inventoryReportRecord}>
              <Text style={styles.inventoryReportRecordTitle}>Submitted discrepancies</Text>
              {check.lines.filter((line) => line.difference !== 0).map((line) => (
                <View key={line.ingredientId} style={styles.inventoryReportCorrection}>
                  <Text style={styles.inventoryReportRecordDetail}>{line.name}</Text>
                  <Text style={styles.inventoryReportRecordDetail}>
                    Expected {formatDailyUnitQuantity(line.recordedQuantity, line.unit)} · Actual{' '}
                    {formatDailyUnitQuantity(line.physicalQuantity, line.unit)}
                  </Text>
                  <Text style={[
                    styles.inventoryReportRecordDifference,
                    line.difference < 0
                      ? styles.inventoryReportDifferenceNegative
                      : styles.inventoryReportDifferencePositive,
                  ]}>
                    {formatDailyDifference(line.difference, line.unit)}
                  </Text>
                </View>
              ))}
              <Text style={styles.inventoryReportRecordDetail}>
                Staff remarks (read-only): {check.remarks || '—'}
              </Text>
              <Text style={styles.inventoryReportRecordDetail}>
                Count changes require a correction request in Override Inventory Count.
              </Text>
            </View>
          ) : null}

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
              onPress={() => {
                setSelectedInventoryReport('inventoryDiscrepancy');
                setSelectedInventoryCountId(null);
                setInventoryReportData(null);
                setInventoryReportError('');
                setInventoryReportingReturnRoute('inventory');
                setRoute('inventoryReport');
              }}
              style={({ pressed }) => [styles.dailyPrimaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.dailyPrimaryButtonText}>View discrepancy records</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => navigate('inventory')}
            style={({ pressed }) => [styles.dailyPrimaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.dailyPrimaryButtonText}>Back to Inventory</Text>
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
          if (dailyDiscrepancies.length > 0 && !dailyCheckSubmitting) {
            setDailyCheckLeavePromptVisible(true);
          } else {
            setRoute('dailyInventoryCheck');
          }
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
            Remarks lock after submission. Count changes require a correction request in Override Inventory Count.
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
        <Text style={styles.staffIdentityName}>{user.employeeId ?? 'Employee ID unavailable'}</Text>
        <Text style={styles.staffIdentitySubtitle}>{staffName} · {assignedBranch}</Text>
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
        <Text style={styles.backGlyph}>‹</Text>
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

  const renderInventoryReportsList = () => (
    <View style={styles.inventoryReportPage}>
      {renderInventoryReportHeader(
        'Inventory Reporting',
        inventoryReportingReturnRoute === 'inventory' ? 'Back to Inventory' : 'Back to More',
        () => setRoute(inventoryReportingReturnRoute),
      )}
      <ScrollView contentContainerStyle={styles.inventoryReportContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.inventoryReportingMetadata}>
          {assignedBranch} · {formatHistoryDateTime(new Date())}
        </Text>
        {(
          Object.entries(inventoryReportTitles) as Array<[InventoryReportKey, string]>
        ).map(([key], index) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            onPress={() => openInventoryReport(key)}
            style={({ pressed }) => [styles.inventoryReportLink, pressed && styles.pressed]}
          >
            <View style={styles.inventoryReportIndex}>
              <Text style={styles.inventoryReportIndexText}>
                {key === 'totalIngredientQuantity' ? '▦'
                  : key === 'ingredientCategorySummary' ? '▥'
                    : key === 'ingredientStockStatus' ? '▤'
                      : key === 'branchInventorySummary' ? '◇'
                        : key === 'inventoryDiscrepancy' ? '△'
                          : '▣'}
              </Text>
            </View>
            <Text style={styles.inventoryReportLinkText}>{inventoryReportSelectionTitles[key]}</Text>
            <Text style={styles.moreNavigationChevron}>›</Text>
          </Pressable>
        ))}
        <Text style={styles.inventoryReportingFooter}>
          Assigned branch only · Reports are read-only.
        </Text>
      </ScrollView>
    </View>
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
                  {' · '}{matches ? 'Matches' : 'Lower than expected'}
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
        {renderInventoryReportHeader(title, 'Back to Inventory Reporting', () => setRoute('inventoryReporting'))}
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
    if (!record) {
      return (
        <View style={styles.inventoryReportPage}>
          {renderInventoryReportHeader('Count details', 'Back to report', () => setRoute('inventoryReport'))}
          <View style={styles.inventoryReportState}>
            <Text style={styles.inventoryReportErrorText}>Count details are unavailable. Reload the report and try again.</Text>
            <Pressable onPress={() => setRoute('inventoryReport')} style={styles.dailySalesRetryButton}>
              <Text style={styles.dailySalesRetryText}>Back to report</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    if (selectedInventoryReport === 'physicalInventoryCount') {
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
                    {' · '}{matches ? 'Matches' : 'Lower than expected'}
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
                    {' · '}{matches ? 'Matches' : 'Lower than expected'}
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
                    {' · '}{matches ? 'Matches' : 'Lower than expected'}
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
                ? 'Read-only · Count changes require a correction request in Override Inventory Count.'
                : record.revisedActualQuantity !== null
                  ? 'No direct editing. Count changes require a correction request in Override Inventory Count.'
                  : 'Read-only · Count changes require a correction request in Override Inventory Count.'}
            </Text>
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
    if (selectedInventoryReport === 'inventoryDiscrepancy') {
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
                  Count changes require a correction request in Override Inventory Count.
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
        {renderInventoryReportHeader('Physical count details', 'Back to report', () => setRoute('inventoryReport'))}
        <ScrollView contentContainerStyle={styles.inventoryReportContent} showsVerticalScrollIndicator={false}>
          <View style={styles.inventoryReportMetadata}>
            <Text style={styles.inventoryReportMetadataText}>Branch: {record.branchName}</Text>
            <Text style={styles.inventoryReportMetadataText}>Submitted: {formatHistoryDateTime(new Date(record.submittedAt))}</Text>
            <Text style={styles.inventoryReportMetadataText}>Submitting employee account: {record.submittedBy}</Text>
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
            icon: '₱',
            title: 'Daily Sales',
            description: 'Count, compare and submit for review',
            onPress: openDailySales,
          },
          {
            icon: '☷',
            title: 'Physical Inventory Check',
            description: 'Count, compare and submit for review',
            onPress: startDailyInventoryCheck,
          },
          {
            icon: '⇩',
            title: 'Transaction history',
            description: "Your branch's complete stock ledger",
            onPress: () => setRoute('stockHistory'),
          },
          {
            icon: '♙',
            title: 'Profile & settings',
            description: 'Account, access and secure logout',
            onPress: () => setRoute('profileSettings'),
          },
        ]).map((option) => (
          <Pressable
            key={option.title}
            accessibilityRole="button"
            disabled={option.title === 'Physical Inventory Check' && dailyCheckStarting}
            onPress={option.onPress}
            style={({ pressed }) => [styles.moreNavigationCard, pressed && styles.pressed]}
          >
            <View style={styles.moreNavigationIcon}>
              <Text style={styles.moreNavigationIconText}>{option.icon}</Text>
            </View>
            <View style={styles.moreNavigationCopy}>
              <Text style={styles.moreNavigationTitle}>{option.title}</Text>
              <Text style={styles.moreNavigationDescription}>{option.description}</Text>
            </View>
            <Text style={styles.moreNavigationChevron}>›</Text>
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
            <Text style={styles.backGlyph}>‹</Text>
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
            <Text style={styles.dailySalesReadOnly}>Confirmed sales only · Read-only</Text>
          </>
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
    const appAlertsEnabled = alertPreferences.lowStock && alertPreferences.expiration;
    return (
      <>
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to More"
            onPress={() => setRoute('more')}
            style={styles.backButton}
          >
            <Text style={styles.backGlyph}>‹</Text>
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
                <Text style={styles.profileInformationLabel}>Employee ID</Text>
                <Text style={styles.profileInformationValue} selectable>{user.employeeId ?? 'Unavailable'}</Text>
              </View>
              <View style={styles.profileInformationCell}>
                <Text style={styles.profileInformationLabel}>Email</Text>
                <Text style={styles.profileInformationValue} numberOfLines={1}>{staffEmail}</Text>
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
            <Text style={styles.assignedBranchLock}>▣</Text>
          </View>
          <Text style={styles.assignedBranchHint}>Read-only. Staff record for their assigned branch only.</Text>
          <View style={styles.profileInfoBanner}>
            <Text style={styles.profileInfoIcon}>i</Text>
            <Text style={styles.profileInfoText}>
              Assigned branch cannot be changed. Master ingredients are read-only; contact the owner for account or ingredient updates.
            </Text>
          </View>

          <View style={styles.profileSettingsCard}>
            <View style={styles.profileSettingsHeading}>
              <Text style={styles.profileSectionTitle}>Alert visibility</Text>
              <Text style={styles.profileSettingsValue}>
                {!alertPreferencesHydrated
                  ? 'Loading alert preferences…'
                  : alertPreferencesSaving
                    ? 'Saving alert preferences…'
                    : appAlertsEnabled
                      ? 'Enabled for stock and expiry'
                      : 'Some in-app alerts are off'}
              </Text>
            </View>
            <View style={styles.profilePreferenceRow}>
              <Text style={styles.profilePreferenceLabel}>Low-stock alerts</Text>
              <Switch
                accessibilityLabel="Low-stock alerts"
                value={alertPreferences.lowStock}
                disabled={!alertPreferencesHydrated || alertPreferencesSaving}
                onValueChange={(value) => { void updateAlertPreference('lowStock', value); }}
                trackColor={{ false: theme.isDark ? theme.colors.border : '#D8D8DE', true: theme.isDark ? theme.colors.accent : '#F6A2BC' }}
                thumbColor={alertPreferences.lowStock ? colors.pink : theme.isDark ? theme.colors.surface : '#FFFFFF'}
              />
            </View>
            <View style={styles.profilePreferenceRow}>
              <Text style={styles.profilePreferenceLabel}>Expiry alerts</Text>
              <Switch
                accessibilityLabel="Expiry alerts"
                value={alertPreferences.expiration}
                disabled={!alertPreferencesHydrated || alertPreferencesSaving}
                onValueChange={(value) => { void updateAlertPreference('expiration', value); }}
                trackColor={{ false: theme.isDark ? theme.colors.border : '#D8D8DE', true: theme.isDark ? theme.colors.accent : '#F6A2BC' }}
                thumbColor={alertPreferences.expiration ? colors.pink : theme.isDark ? theme.colors.surface : '#FFFFFF'}
              />
            </View>
            {alertPreferencesError ? (
              <Text style={styles.profileAlertNote}>Alert preferences could not be saved or loaded: {alertPreferencesError}</Text>
            ) : null}
            <Text style={styles.profileAlertNote}>These preferences control in-app alert visibility only; push delivery is not configured.</Text>
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
                  <Text style={[styles.themeOptionIcon, selected && styles.themeOptionIconSelected]}>
                    {mode === 'dark' ? '☾' : '☼'}
                  </Text>
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
        <Text style={styles.selectChevron}>{ingredientListOpen ? '⌃' : '⌄'}</Text>
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
          <Text style={styles.backGlyph}>‹</Text>
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
            <Text style={styles.successIcon}>✓</Text>
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
          <Text style={styles.backGlyph}>‹</Text>
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
            <Text style={styles.successIcon}>✓</Text>
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
            <Text style={styles.selectChevron}>{ingredientListOpen ? '⌃' : '⌄'}</Text>
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
            <Text style={styles.selectChevron}>{reasonListOpen ? '⌃' : '⌄'}</Text>
          </Pressable>
          <Text style={styles.wasteReasonHelper}>Waste · Spillage · Spoilage · Other</Text>
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
          <Text style={styles.backGlyph}>‹</Text>
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
            <Text style={styles.successIcon}>✓</Text>
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
                <Text style={styles.selectChevron}>{batchPresetOpen ? '⌃' : '⌄'}</Text>
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
            <Text style={styles.selectChevron}>{reasonListOpen ? '⌃' : '⌄'}</Text>
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
            <Text style={styles.backGlyph}>‹</Text>
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
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Stock-Out / Usage</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.compactFormContent} showsVerticalScrollIndicator={false}>
          <View style={styles.successBanner} accessibilityRole="alert">
            <Text style={styles.successIcon}>✓</Text>
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
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Waste / Spoilage</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>
        <View style={styles.receiptSuccessBanner}>
          <Text style={styles.receiptSuccessIcon}>✓</Text>
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
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Transaction History</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} · Read-only receipt</Text>
          </View>
        </View>
        <View style={styles.receiptSuccessBanner}>
          <Text style={styles.receiptSuccessIcon}>✓</Text>
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
            accessibilityLabel="Back to Stocks"
            onPress={() => setRoute('stocks')}
            style={styles.backButton}
          >
            <Text style={styles.backGlyph}>‹</Text>
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
          <Text style={styles.historyDateSelectorIcon}>□</Text>
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
            const label = filter === 'All types' ? 'All' : filter === 'Sales Consumption' ? 'Sales' : filter;
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
            <Text style={styles.historyStateText}>Loading transactions…</Text>
          </View>
        ) : backendError && historyTransactions.length === 0 ? (
          <View style={styles.historyStateCard}>
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
            <CubeOutlineIcon />
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
          <Text style={styles.backGlyph}>‹</Text>
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
          <Text style={styles.selectChevron}>{historyStaffPickerOpen ? '⌃' : '⌄'}</Text>
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
            <Text style={styles.backGlyph}>‹</Text>
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
              <DetailRow label="Count status" value={transaction.physicalCount.status} />
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
            accessibilityLabel="Back to POS"
            onPress={() => setRoute('menu')}
            style={styles.backButton}
          >
            <Text style={styles.backGlyph}>‹</Text>
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
          <Text style={styles.saleReceiptDate}>{formatHistoryDateTime(new Date(saleReceipt.createdAt))}</Text>
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
          <DetailRow label="Sale status" value={saleReceipt.saleStatus} />
          <DetailRow label="Inventory processing" value={saleReceipt.inventoryProcessingStatus} />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void shareSaleReceipt()}
          style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
        >
          <Text style={styles.saveButtonText}>Generate Receipt</Text>
        </Pressable>
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
      screenContent = renderStockInForm();
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
    case 'saleReceipt':
      screenContent = renderSaleReceipt();
      break;
    case 'dailySales':
      screenContent = renderDailySales();
      break;
    case 'inventoryReporting':
      screenContent = renderInventoryReportsList();
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
          onRemoveProduct={removeMenuProduct}
          onCancelOrder={cancelMenuOrder}
          onSubmitSale={submitMenuSale}
          catalog={menuCatalog}
          addons={menuAddons}
          catalogLoading={menuCatalogLoading}
          catalogError={menuCatalogError}
          onRetryCatalog={retryMenuCatalog}
          feedbackMessage={dashboardMessage}
          onDismissFeedback={() => setDashboardMessage('')}
          onRetryInventory={menuInventoryRetrySale ? () => void retryMenuSaleInventory() : undefined}
        />
      </View>
      <BottomNavigation
        active={route}
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
              <Text style={styles.confirmSummaryText}>Auto-generated batch reference</Text>
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
              <Text style={styles.logoutModalIconText}>↪</Text>
            </View>
            <Text style={styles.logoutModalTitle}>Do you want to Log out?</Text>
            <Text style={styles.logoutModalDescription}>
              End the daily session? Any unconfirmed order will be discarded.
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
            accessibilityLabel="Close daily inventory check dialog"
            onPress={() => setDailyCheckModal(null)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.dailyModalCard}>
            {dailyCheckModal === 'review' ? (
              <>
                <View style={styles.dailyModalIcon}><Text style={styles.dailyModalIconText}>!</Text></View>
                <Text style={styles.dailyModalTitle}>
                  {dailyDiscrepancies.length > 0 ? 'Inventory Discrepancy' : 'Daily Inventory Check'}
                </Text>
                <Text style={styles.dailyModalSubtitle}>
                  {dailyDiscrepancies.length > 0
                    ? 'Review the difference before saving.'
                    : 'All physical counts match their recorded balances. No stock will be changed.'}
                </Text>
                <View style={styles.dailyModalSummary}>
                  {dailyDiscrepancies.length > 0 ? (
                    <>
                      <Text style={styles.dailyModalSummaryText}>
                        {assignedBranch} · {formatDate(today)} · {formatManilaTime(new Date())}
                      </Text>
                      <Text style={styles.dailyModalSummaryText}>Submitting employee account: {user.id}</Text>
                      {dailyDiscrepancies.map((line) => (
                        <React.Fragment key={line.ingredientId}>
                          <Text style={styles.dailyModalSummaryText}>
                            {line.name} · {assignedBranch}
                          </Text>
                          <Text style={styles.dailyModalSummaryText}>
                            {line.name} · Recorded {formatDailyUnitQuantity(line.recordedQuantity, line.unit)} / Actual{' '}
                            {formatDailyUnitQuantity(line.parsedQuantity, line.unit)}
                          </Text>
                          <Text style={styles.dailyModalSummaryEmphasis}>
                            Difference {formatDailyDifference(line.difference ?? 0, line.unit)} · {dailyCheckRemarks.trim() || 'No remarks'}
                          </Text>
                        </React.Fragment>
                      ))}
                      <Text style={styles.dailyModalSummaryText}>Remarks: {dailyCheckRemarks.trim() || '—'}</Text>
                      <Text style={styles.dailyModalSummaryText}>Pending owner review after submission</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.dailyModalSummaryText}>{assignedBranch}</Text>
                      <Text style={styles.dailyModalSummaryText}>
                        {dailyCheckLines.length} ingredients counted · 0 discrepancies
                      </Text>
                      <Text style={styles.dailyModalSummaryText}>Recorded balances remain unchanged</Text>
                    </>
                  )}
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
                    <Text style={styles.dailyModalPrimaryText}>{dailyDiscrepancies.length > 0 ? 'Save Check' : 'Continue'}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.dailyModalIcon, styles.dailyConfirmIcon]}>
                  <Text style={styles.dailyModalIconText}>✓</Text>
                </View>
                <Text style={styles.dailyModalTitle}>Daily Inventory Check</Text>
                <Text style={styles.dailyModalSubtitle}>
                  Submit the physical count for this branch?
                </Text>
                <View style={styles.dailyModalSummary}>
                  <Text style={styles.dailyModalSummaryText}>{assignedBranch} · {formatDate(today)}</Text>
                  <Text style={styles.dailyModalSummaryText}>Submitting employee account: {user.id}</Text>
                  <Text style={styles.dailyModalSummaryEmphasis}>
                    {dailyCheckLines.length} ingredients counted · {dailyDiscrepancies.length}{' '}
                    {dailyDiscrepancies.length === 1 ? 'discrepancy' : 'discrepancies'}
                  </Text>
                  {(dailyDiscrepancies.length > 0 ? dailyDiscrepancies : dailyCheckResults).map((line) => (
                    <React.Fragment key={line.ingredientId}>
                      <Text style={styles.dailyModalSummaryText}>
                        {line.name}: Recorded {formatDailyUnitQuantity(line.recordedQuantity, line.unit)} / Physical{' '}
                        {line.valid ? formatDailyUnitQuantity(line.parsedQuantity, line.unit) : '—'}
                      </Text>
                      <Text style={styles.dailyModalSummaryText}>
                        Difference {line.valid ? formatDailyDifference(line.difference ?? 0, line.unit) : '—'}
                      </Text>
                    </React.Fragment>
                  ))}
                  <Text style={styles.dailyModalSummaryText}>Remarks: {dailyCheckRemarks.trim() || '—'}</Text>
                </View>
                <View style={styles.dailyModalActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setDailyCheckModal(
                        route === 'inventoryDiscrepancySubmission'
                          ? null
                          : dailyDiscrepancies.length > 0
                            ? 'review'
                            : null,
                      )
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
          <View style={styles.dailyModalCard}>
            <View style={styles.dailyModalIcon}><Text style={styles.dailyModalIconText}>!</Text></View>
            <Text style={styles.dailyModalTitle}>Unsubmitted discrepancy</Text>
            <Text style={styles.dailyModalSubtitle}>
              You have {dailyDiscrepancies.length} unsubmitted {dailyDiscrepancies.length === 1 ? 'discrepancy' : 'discrepancies'}.
              Submit {dailyDiscrepancies.length === 1 ? 'it' : 'them'} for Owner Review now?
            </Text>
            <View style={styles.dailyModalSummary}>
              {dailyDiscrepancies.map((line) => (
                <Text key={line.ingredientId} style={styles.dailyModalSummaryText}>
                  {line.name}: {formatDailyUnitQuantity(line.recordedQuantity, line.unit)} expected ·{' '}
                  {formatDailyUnitQuantity(line.parsedQuantity, line.unit)} counted ·{' '}
                  {formatDailyDifference(line.difference ?? 0, line.unit)}
                </Text>
              ))}
              <Text style={styles.dailyModalSummaryText}>Remarks: {dailyCheckRemarks.trim() || '—'}</Text>
            </View>
            <View style={styles.dailyModalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={dailyCheckSubmitting}
                onPress={() => setDailyCheckLeavePromptVisible(false)}
                style={({ pressed }) => [styles.dailyModalReviewButton, pressed && styles.pressed]}
              >
                <Text style={styles.dailyModalReviewText}>Keep reviewing</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={dailyCheckSubmitting}
                onPress={() => void saveOrRetryDailyInventoryCheck()}
                style={({ pressed }) => [
                  styles.dailyModalPrimaryButton,
                  pressed && styles.pressed,
                  dailyCheckSubmitting && styles.confirmButtonDisabled,
                ]}
              >
                <Text style={styles.dailyModalPrimaryText}>
                  {dailyCheckSubmitting ? 'Saving…' : 'Submit for Owner Review'}
                </Text>
              </Pressable>
            </View>
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
                <Text style={styles.confirmIconText}>↓</Text>
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
                  return item && deduction.newQuantity < item.minimumStock;
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



type StaffStyles = ReturnType<typeof createStaffStyles>;
const staffStylesCache = new WeakMap<AppTheme, StaffStyles>();
