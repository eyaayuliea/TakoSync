import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import BottomNavigation, { type StaffRoute, type StaffTab } from '../navigation/BottomNavigation';
import { createThemedStyles, type AppTheme, useTheme } from '../theme/ThemeProvider';
import MenuWorkspace from './MenuWorkspace';
import { menuPreviewProducts, type MenuCartLine } from './menuPreviewData';
import {
  loadInventory,
  loadTransactionHistory,
  recordInventoryTransactions,
  submitDailyStockCheck,
  type AppUser,
} from '../services/takosync';

const colors = {
  pink: '#F20D55',
  navy: '#101027',
  orange: '#FF9418',
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

const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

type IngredientBatch = {
  reference: string;
  receivedDate: string;
  expirationDate: string | null;
  expirationDateIso: string | null;
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
  expiration: string | null;
  nearExpiry: boolean;
  minimumStock: number;
  type: string;
  unitName: string;
  receivedBatch: string;
  batchReference?: string;
  batches: IngredientBatch[];
  lastUpdated: string;
  emoji: string;
  tint: string;
};

const categories = ['All', 'Seafood', 'Dry Goods', 'Dairy & eggs', 'Condiments', 'Produce'];
const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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
  return `${formatLocalIsoDate(date)}T00:00:00+08:00`;
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
  physicalQuantity: string;
  unit: string;
};

type DailyCheckLineRecord = {
  ingredientId: string;
  name: string;
  recordedQuantity: number;
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

type WasteReason = 'Spoiled' | 'Expired' | 'Spilled/Damaged' | 'Other';

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

type HistoryTransactionType = 'Stock-In' | 'Stock-Out / Usage' | 'Usage' | 'Waste' | 'Spoilage';
type HistoryTypeFilter = 'All types' | 'Stock-In' | 'Stock-Out' | 'Usage' | 'Waste' | 'Spoilage';

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
};

const historyTypeFilters: HistoryTypeFilter[] = [
  'All types',
  'Stock-In',
  'Stock-Out',
  'Usage',
  'Waste',
  'Spoilage',
];

function formatHistoryDateTime(date: Date) {
  return `${formatDate(manilaBusinessDate(date))} · ${formatManilaTime(date)}`;
}

const wasteReasons: WasteReason[] = ['Spoiled', 'Expired', 'Spilled/Damaged', 'Other'];

const stockOutBatchPresets = [
  {
    name: 'Standard takoyaki batch',
    deductions: [
      { ingredientId: 'octopus', quantity: 1 },
      { ingredientId: 'flour', quantity: 0.5 },
    ],
  },
] as const;

const nearExpiryWindowDays = 3;

type InventoryAlertKind = 'lowStock' | 'expiration';

type InventoryAlert = {
  id: string;
  kind: InventoryAlertKind;
  ingredientId: string;
  batch: IngredientBatch | null;
  title: string;
  detail: string;
  stockProgress?: number;
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
  variant = 'default',
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  variant?: 'default' | 'alerts';
}) {
  const styles = useStaffStyles();
  const { colors: themeColors } = useTheme();
  return (
    <View style={[styles.searchBar, variant === 'alerts' && styles.alertSearchBar]}>
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
}: {
  label: string;
  tone: 'low' | 'good' | 'warning';
  alignRight?: boolean;
}) {
  const styles = useStaffStyles();
  const toneStyle = tone === 'low' ? styles.lowBadge : tone === 'warning' ? styles.warningBadge : styles.goodBadge;
  const textStyle = tone === 'low' ? styles.lowBadgeText : tone === 'warning' ? styles.warningBadgeText : styles.goodBadgeText;
  return (
    <View style={[styles.statusBadge, toneStyle, alignRight && styles.statusBadgeRight]}>
      <Text style={[styles.statusBadgeText, textStyle]}>{label}</Text>
    </View>
  );
}

function InventoryIngredientCard({
  item,
  onPress,
  statusOverride,
  showExpiration = false,
  cardWidth,
}: {
  item: Ingredient;
  onPress: () => void;
  statusOverride?: { label: string; tone: 'low' | 'good' | 'warning' };
  showExpiration?: boolean;
  cardWidth?: number;
}) {
  const styles = useStaffStyles();
  const statusLabel = statusOverride?.label ?? (item.quantity <= 0 ? 'Out of Stock' : item.lowStock ? 'Low Stock' : item.nearExpiry ? 'Near Expiry' : 'In Stock');
  const statusTone = statusOverride?.tone ?? (item.lowStock ? 'low' : item.nearExpiry ? 'warning' : 'good');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.category}, ${item.quantity} ${item.unit}${showExpiration && item.expiration ? `, expires ${item.expiration}` : ''}, ${statusLabel}`}
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
        <Text style={styles.inventoryIngredientCategory} numberOfLines={1}>{item.category}</Text>
      </View>
      <View style={styles.inventoryQuantityColumn}>
        <Text style={styles.inventoryQuantity}>{item.quantity} {item.unit}</Text>
        {showExpiration && item.expiration ? (
          <Text style={styles.dashboardExpiration}>Exp. {item.expiration}</Text>
        ) : null}
        <StatusBadge label={statusLabel} tone={statusTone} alignRight />
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
}: {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  error?: string;
  allowClear?: boolean;
}) {
  const styles = useStaffStyles();
  const [visible, setVisible] = useState(false);
  const [month, setMonth] = useState(() => value ?? new Date());
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const calendarDays: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const changeMonth = (amount: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };
  const openDatePicker = () => {
    setMonth(value ?? new Date());
    setVisible(true);
  };

  return (
    <>
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
              <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => changeMonth(1)} style={styles.monthArrow}>
                <Text style={styles.monthArrowText}>›</Text>
              </Pressable>
            </View>
            <View style={styles.calendarGrid}>
              {weekdays.map((day, index) => (
                <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>
              ))}
              {calendarDays.map((day, index) => {
                const isSelected =
                  day !== null &&
                  value?.getDate() === day &&
                  value.getMonth() === month.getMonth() &&
                  value.getFullYear() === month.getFullYear();
                return day === null ? (
                  <View key={`empty-${index}`} style={styles.calendarDayCell} />
                ) : (
                  <Pressable
                    key={`day-${day}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${month.toLocaleDateString('en-US', { month: 'long' })} ${day}`}
                    onPress={() => {
                      onChange(new Date(month.getFullYear(), month.getMonth(), day));
                      setVisible(false);
                    }}
                    style={[styles.calendarDayCell, isSelected && styles.calendarDaySelected]}
                  >
                    <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={() => setVisible(false)} style={styles.calendarCancel}>
              <Text style={styles.calendarCancelText}>Cancel</Text>
            </Pressable>
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
  const [route, setRoute] = useState<StaffRoute>('dashboard');
  const routeRef = useRef(route);
  routeRef.current = route;
  const [returnRoute, setReturnRoute] = useState<StaffTab>('stocks');
  const [menuCart, setMenuCart] = useState<MenuCartLine[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [backendHistory, setBackendHistory] = useState<HistoryTransaction[]>([]);
  const [backendLoading, setBackendLoading] = useState(true);
  const [backendError, setBackendError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const alertRefreshLock = useRef(false);
  const [dailyCheckLines, setDailyCheckLines] = useState<DailyCheckLine[]>([]);
  const [dailyCheckRemarks, setDailyCheckRemarks] = useState('');
  const [dailyCheckAttempted, setDailyCheckAttempted] = useState(false);
  const [dailyCheckModal, setDailyCheckModal] = useState<'review' | 'confirm' | null>(null);
  const [currentDailyCheck, setCurrentDailyCheck] = useState<DailyInventoryCheck | null>(null);
  const [dailyCheckSubmitting, setDailyCheckSubmitting] = useState(false);
  const dailyCheckSubmissionLock = useRef(false);
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
  const [successMessage, setSuccessMessage] = useState('');
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
  const [currentUsageReceipt, setCurrentUsageReceipt] = useState<UsageReceipt | null>(null);
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardMessage, setDashboardMessage] = useState('');
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
  const [alertSearch, setAlertSearch] = useState('');
  const [selectedAlertIngredientId, setSelectedAlertIngredientId] = useState('');
  const [selectedAlertBatchReference, setSelectedAlertBatchReference] = useState('');
  const [selectedAlertKind, setSelectedAlertKind] = useState<InventoryAlertKind>('lowStock');
  const [ingredientDetailReturnRoute, setIngredientDetailReturnRoute] = useState<'inventory' | 'alerts'>('inventory');
  const [logoutConfirmationVisible, setLogoutConfirmationVisible] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [logoutPending, setLogoutPending] = useState(false);
  const logoutSubmissionLock = useRef(false);
  const [alertPreferences, setAlertPreferences] = useState({
    lowStock: true,
    expiration: true,
  });

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
    let active = true;
    if (!user?.branchId) {
      setBackendLoading(false);
      setBackendError('Your account does not have an assigned branch. Contact the owner.');
      return () => {
        active = false;
      };
    }
    setBackendLoading(true);
    setBackendError('');
    Promise.all([loadInventory(user.branchId), loadTransactionHistory(user.branchId)])
      .then(([inventory, history]) => {
        if (!active) return;
        setIngredients(inventory);
        setBackendHistory(history);
      })
      .catch((error: unknown) => {
        if (active) setBackendError(error instanceof Error ? error.message : 'Unable to load branch records.');
      })
      .finally(() => {
        if (active) setBackendLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.branchId]);

  const refreshBackendData = async () => {
    if (!user?.branchId) {
      setBackendError('Your account does not have an assigned branch. Contact the owner.');
      return;
    }
    try {
      const [inventory, history] = await Promise.all([
        loadInventory(user.branchId),
        loadTransactionHistory(user.branchId),
      ]);
      setIngredients(inventory);
      setBackendHistory(history);
      setBackendError('');
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : 'The saved record could not be refreshed.');
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

  const refreshAlertsData = async () => {
    if (alertRefreshLock.current) return;
    alertRefreshLock.current = true;
    setRefreshing(true);
    setBackendLoading(true);
    try {
      await refreshBackendData();
    } finally {
      setBackendLoading(false);
      setRefreshing(false);
      alertRefreshLock.current = false;
    }
  };

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
        errors.quantity = 'Quantity must exceed zero.';
      } else {
        const precision = ingredient?.quantityPrecision ?? 2;
        const validFormat = precision === 0
          ? /^\d+$/.test(quantityValue.trim())
          : new RegExp(`^(?:\\d+(?:\\.\\d{1,${precision}})?|\\.\\d{1,${precision}})$`).test(quantityValue.trim());
        if (!Number.isFinite(parsedQuantity) || !validFormat) {
          errors.quantity = precision === 0
            ? `Enter a whole number of ${ingredient?.unit ?? 'units'}.`
            : `Enter a valid quantity with up to ${precision} decimal places.`;
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
      errors.expirationDate = 'Expiration date cannot be before the transaction date.';
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
    const matchesType = historyTypeFilter === 'All types' ||
      (historyTypeFilter === 'Stock-Out'
        ? transaction.type === 'Stock-Out / Usage' || transaction.type === 'Usage'
        : transaction.type === historyTypeFilter);
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
  const normalizedSearch = search.trim().toLowerCase();
  const visibleIngredients = useMemo(
    () =>
      ingredients.filter((item) => {
        const matchesCategory = category === 'All' || item.category === category;
        const matchesSearch = `${item.name} ${item.category}`.toLowerCase().includes(normalizedSearch);
        return matchesCategory && matchesSearch;
      }),
    [category, ingredients, normalizedSearch],
  );
  const alertDate = manilaBusinessDate();
  const lowStockItems = ingredients.filter((item) => item.lowStock);
  const expiringBatches = ingredients.flatMap((item) => {
    if (!item.expirationTracking) return [];
    return item.batches.flatMap((batch) => {
      const expirationDateValue = parseInventoryDate(batch.expirationDateIso ?? batch.expirationDate);
      if (!expirationDateValue) return [];
      const daysRemaining = daysBetweenDates(alertDate, expirationDateValue);
      return daysRemaining >= 0 && daysRemaining <= nearExpiryWindowDays
        ? [{ item, batch, daysRemaining }]
        : [];
    });
  });
  const expiringItems = [...new Map(expiringBatches.map(({ item }) => [item.id, item])).values()];
  const inventoryAlerts: InventoryAlert[] = [
    ...lowStockItems.map((item) => ({
      id: `low-${item.id}`,
      kind: 'lowStock' as const,
      ingredientId: item.id,
      batch: item.batches[0] ?? null,
      title: item.name,
      detail: `${formatUnitQuantity(item.quantity, item.unit)} available · Minimum ${formatUnitQuantity(item.minimumStock, item.unit)} · ${formatUnitQuantity(Math.max(0, item.minimumStock - item.quantity), item.unit)} below threshold`,
      stockProgress: item.minimumStock > 0
        ? Math.max(0, Math.min(1, item.quantity / item.minimumStock))
        : 0,
    })),
    ...expiringBatches.map(({ item, batch, daysRemaining }) => {
      const expiryText = daysRemaining === 0
        ? 'Expires today'
        : daysRemaining === 1
          ? 'Expires tomorrow'
          : `In ${daysRemaining} days`;
      return {
        id: `expiry-${item.id}-${batch.reference}`,
        kind: 'expiration' as const,
        ingredientId: item.id,
        batch,
        title: item.name,
        detail: `${formatUnitQuantity(batch.quantityRemaining, item.unit)} remaining · Expires ${batch.expirationDate} · ${expiryText}`,
      };
    }),
  ];
  const alertTerm = alertSearch.trim().toLowerCase();
  const visibleAlerts = inventoryAlerts.filter((item) =>
    alertPreferences[item.kind] &&
    `${item.title} ${ingredients.find((ingredient) => ingredient.id === item.ingredientId)?.category ?? ''} ${item.kind === 'lowStock' ? 'low stock' : 'nearing expiration near expiry'} ${item.detail}`
      .toLowerCase()
      .includes(alertTerm),
  );
  const dashboardTerm = dashboardSearch.trim().toLowerCase();
  const dashboardMatches = (item: Ingredient) =>
    `${item.name} ${item.category}`.toLowerCase().includes(dashboardTerm);
  const visibleLowStockItems = lowStockItems.filter(dashboardMatches);
  const visibleExpiringItems = expiringItems.filter(dashboardMatches);

  const navigate = (nextRoute: StaffTab) => {
    setDailyCheckModal(null);
    setLogoutConfirmationVisible(false);
    setRoute(nextRoute);
    setDashboardMessage('');
  };

  const addMenuProduct = (productId: string) => {
    if (!menuPreviewProducts.some((product) => product.id === productId)) return;
    setMenuCart((current) => current.some((line) => line.productId === productId)
      ? current
      : [...current, { productId, quantity: 1 }]);
  };

  const changeMenuProductQuantity = (productId: string, change: 1 | -1) => {
    setMenuCart((current) => current.flatMap((line) => {
      if (line.productId !== productId) return [line];
      const quantity = line.quantity + change;
      return quantity > 0 ? [{ ...line, quantity }] : [];
    }));
  };

  const removeMenuProduct = (productId: string) => {
    setMenuCart((current) => current.filter((line) => line.productId !== productId));
  };

  const openIngredientDetails = (item: Ingredient) => {
    setSelectedIngredientId(item.id);
    setIngredientDetailReturnRoute('inventory');
    setRoute('ingredientDetails');
  };

  const startDailyInventoryCheck = () => {
    setFormError('');
    const lines = ingredients.map((item) => ({
      ingredientId: item.id,
      name: item.name,
      recordedQuantity: item.quantity,
      physicalQuantity: '',
      unit: item.unit,
    }));
    setDailyCheckLines(lines);
    setDailyCheckRemarks('');
    setDailyCheckAttempted(false);
    setDailyCheckModal(null);
    setCurrentDailyCheck(null);
    dailyCheckSubmissionLock.current = false;
    setRoute('dailyInventoryCheck');
  };

  const validateDailyInventoryCheck = () => {
    setDailyCheckAttempted(true);
    return dailyCheckValid;
  };

  const openDailyCheckReview = () => {
    if (!validateDailyInventoryCheck()) return;
    setDailyCheckModal('review');
  };

  const submitDailyInventoryCheck = async () => {
    if (dailyCheckSubmissionLock.current || !validateDailyInventoryCheck()) return;
    if (!user?.branchId) {
      setFormError('Your account does not have an assigned branch. Contact the owner.');
      return;
    }
    dailyCheckSubmissionLock.current = true;
    setDailyCheckSubmitting(true);
    setFormError('');
    const checkDate = manilaBusinessDate();
    const lines = dailyCheckLines.map((line) => {
      const physicalQuantity = Number(line.physicalQuantity);
      return {
        ingredientId: line.ingredientId,
        name: line.name,
        recordedQuantity: line.recordedQuantity,
        physicalQuantity,
        difference: roundDailyQuantity(physicalQuantity - line.recordedQuantity, line.unit),
        unit: line.unit,
      };
    });
    try {
      const saved = await submitDailyStockCheck({
        branchId: user.branchId,
        checkDate: formatLocalIsoDate(checkDate),
        remarks: dailyCheckRemarks.trim(),
        lines: lines.map((line) => ({
          ingredientId: line.ingredientId,
          recordedQuantity: line.recordedQuantity,
          physicalQuantity: line.physicalQuantity,
          unit: line.unit,
        })),
      });
      const savedLines = saved.lines.map((line) => ({
        ...line,
        name: dailyCheckLines.find((entry) => entry.ingredientId === line.ingredientId)?.name ?? line.ingredientId,
      }));
      const check: DailyInventoryCheck = {
        reference: saved.reference,
        checkDate: new Date(`${saved.checkDate}T00:00:00`),
        submittedAt: new Date(),
        branch: assignedBranch,
        staff: staffName,
        lines: savedLines,
        remarks: dailyCheckRemarks.trim(),
        status: saved.status === 'pending_owner_review' ? 'pendingOwnerReview' : 'submitted',
      };
      setCurrentDailyCheck(check);
      setDailyCheckModal(null);
      setRoute('dailyCheckSuccess');
      void refreshBackendData();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to submit the daily check.');
    } finally {
      setDailyCheckSubmitting(false);
      dailyCheckSubmissionLock.current = false;
    }
  };

  const openForm = (
    formRoute: 'stockIn' | 'stockOut' | 'waste',
    source: StaffTab,
  ) => {
    wasteReviewGeneration.current += 1;
    setReturnRoute(source);
    setSelectedIngredientId('');
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
    setSuccessMessage('');
    setFormError('');
    setQuantityError('');
    setCurrentWasteReceipt(null);
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
        const latestInventory = await loadInventory(user.branchId);
        if (requestGeneration !== wasteReviewGeneration.current || routeRef.current !== 'waste') return;
        setIngredients(latestInventory);
        if (!validateWasteForm(latestInventory)) return;
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
        const saved = await recordInventoryTransactions(user.branchId, [{
          ingredientId: selectedIngredient.id,
          type: wasteReason === 'Spoiled' || wasteReason === 'Expired' ? 'spoilage' : 'waste',
          quantity: wasteQuantity,
          transactionDate: manilaMidnightTimestamp(receiptDate),
          reason: wasteReason,
          notes: notes.trim(),
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
        setRoute('waste');
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
        const saved = await recordInventoryTransactions(user.branchId, draftDeductions.map((deduction) => ({
          ingredientId: deduction.ingredientId,
          type: usageMode === 'cookingBatch' ? 'usage' : 'stock_out',
          quantity: deduction.quantity,
          transactionDate: manilaMidnightTimestamp(receiptDate),
          reason,
          notes,
        })));
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
      const saved = await recordInventoryTransactions(user.branchId, [{
        ingredientId: selectedIngredient.id,
        type: 'stock_in',
        quantity: parsedQuantity,
        transactionDate: formatLocalIsoDate(transactionDate),
        reason: 'Stock-In',
        notes: notes.trim(),
        expirationDate: expirationDate ? formatLocalIsoDate(expirationDate) : null,
      }]);
      const savedTransaction = saved[0];
      if (!savedTransaction) throw new Error('The saved stock-in returned incomplete details.');
      if (!savedTransaction.reference) throw new Error('The saved stock-in did not return a transaction reference.');
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
      setSuccessMessage('Stock-In recorded successfully.');
      setRoute('stockIn');
    } catch (error) {
      setConfirmationVisible(false);
      setFormError(error instanceof Error ? error.message : 'Unable to save the stock-in.');
    } finally {
      movementSubmissionLock.current = false;
      setConfirming(false);
    }
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
          onPress={() => navigate('alerts')}
          style={styles.alertButton}
        >
          <View style={styles.bellIcon}>
            <View style={styles.bellBody} />
            <View style={styles.bellBase} />
            <View style={styles.bellClapper} />
          </View>
          {inventoryAlerts.length > 0 ? <View style={styles.alertDot} /> : null}
        </Pressable>
      </View>
      <SearchBar value={dashboardSearch} onChangeText={setDashboardSearch} placeholder="Search inventory" />
      {dashboardMessage !== '' && (
        <Pressable onPress={() => setDashboardMessage('')} style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>{dashboardMessage}</Text>
          <Text style={styles.bannerDismiss}>×</Text>
        </Pressable>
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
                  : ingredients.length.toString().padStart(2, '0')}
            </Text>
            <Text style={styles.summaryItems}>items tracked</Text>
          </View>
          <Text style={styles.summaryAlerts}>
            {backendLoading
              ? 'Loading stock alerts…'
              : backendError !== '' && ingredients.length === 0
                ? 'Stock data unavailable'
                : `${lowStockItems.length + expiringItems.length} stock alerts need attention`}
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
          { title: 'Stock-In', icon: '+', onPress: () => openForm('stockIn', 'dashboard') },
          { title: 'Stock-Out', icon: '↗', onPress: () => openForm('stockOut', 'dashboard') },
          { title: 'Waste', icon: '×', onPress: () => openForm('waste', 'dashboard') },
          {
            title: 'Daily Check',
            icon: '✓',
            onPress: startDailyInventoryCheck,
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

  const renderInventory = () => (
    <FlatList
      style={styles.scroll}
      contentContainerStyle={styles.inventoryListContent}
      data={visibleIngredients}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      ItemSeparatorComponent={() => <View style={styles.inventoryCardSeparator} />}
      ListHeaderComponent={
        <View style={styles.inventoryPageHeader}>
          <Text style={styles.pageTitle}>Inventory</Text>
          <Text style={styles.pageSubtitle}>{assignedBranch} / Staff</Text>
          <View style={styles.inventorySearch}>
            <SearchBar value={search} onChangeText={setSearch} />
          </View>
          <ScrollView
            horizontal
            nestedScrollEnabled
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.inventoryFilterScroll}
            contentContainerStyle={styles.inventoryFilters}
          >
            {categories.map((filter) => (
              <FilterChip
                key={filter}
                label={filter}
                selected={filter === category}
                onPress={() => setCategory(filter)}
              />
            ))}
          </ScrollView>
          <Text style={styles.inventoryCount}>
            {visibleIngredients.length} {visibleIngredients.length === 1 ? 'ingredient' : 'ingredients'} · {assignedBranch}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <InventoryIngredientCard
          item={item}
          onPress={() => {
            setSelectedIngredientId(item.id);
            setIngredientDetailReturnRoute('inventory');
            setRoute('ingredientDetails');
          }}
        />
      )}
      ListEmptyComponent={
        <View style={styles.inventoryEmpty}>
          <CubeOutlineIcon />
          <Text style={styles.inventoryEmptyTitle}>No ingredients found</Text>
          <Text style={styles.inventoryEmptyMessage}>
            {search.trim()
              ? `No results for '${search.trim()}'. Try a different name or clear your category filters.`
              : `No results${category !== 'All' ? ` in '${category}'` : ''}. Try a different name or clear your category filters.`}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSearch('');
              setCategory('All');
            }}
            style={({ pressed }) => [styles.clearFiltersButton, pressed && styles.pressed]}
          >
            <Text style={styles.clearFiltersText}>Clear filters</Text>
          </Pressable>
        </View>
      }
      ListFooterComponent={
        visibleIngredients.length > 0 ? (
          <Text style={styles.demoNote}>Live branch inventory · Updates are saved to Supabase.</Text>
        ) : null
      }
    />
  );

  const renderIngredientDetails = () => {
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
      ? `${gap} ${selectedIngredient.unit} below minimum`
      : gap < 0
        ? `${Math.abs(gap)} ${selectedIngredient.unit} above minimum`
        : 'At minimum stock';
    const statusLabel = selectedIngredient.lowStock
      ? 'Low Stock'
      : selectedIngredient.nearExpiry
        ? 'Near Expiry'
        : 'In Stock';
    const statusTone = selectedIngredient.lowStock
      ? 'low'
      : selectedIngredient.nearExpiry
        ? 'warning'
        : 'good';

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
            <Text style={styles.detailIngredientCategory}>{selectedIngredient.category} · {selectedIngredient.type}</Text>
            <StatusBadge label={statusLabel} tone={statusTone} />
          </View>
        </View>

        <View style={styles.stockSummaryCard}>
          <Text style={styles.stockSummaryQuantity}>{selectedIngredient.quantity} {selectedIngredient.unit}</Text>
          <Text style={styles.stockSummaryCaption}>Recorded available stock</Text>
          <View style={styles.stockSummaryDivider} />
          <View style={styles.stockSummaryLine}>
            <Text style={styles.stockSummaryLabel}>Minimum stock</Text>
            <Text style={styles.stockSummaryValue}>{selectedIngredient.minimumStock} {selectedIngredient.unit}</Text>
          </View>
          <View style={styles.stockSummaryLine}>
            <Text style={styles.stockSummaryLabel}>Stock gap</Text>
            <Text style={[styles.stockSummaryValue, gap > 0 && styles.stockGapWarning]}>{stockGap}</Text>
          </View>
        </View>

        <View style={styles.detailRows}>
          <DetailRow label="Branch" value={assignedBranch} />
          <DetailRow label="Inventory unit" value={selectedIngredient.unitName} />
          <DetailRow label="Received batch" value={selectedIngredient.receivedBatch} />
          <DetailRow label="Expiration" value={selectedIngredient.expiration ?? 'Not recorded'} />
          <DetailRow label="Last updated" value={selectedIngredient.lastUpdated} />
        </View>

        <View style={styles.permissionNotice}>
          <Text style={styles.permissionIcon}>i</Text>
          <Text style={styles.permissionText}>
            Master ingredient information is read-only. Only the owner can add, edit or delete master records.
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
          </View>
          <Text style={styles.historyActivityAmount}>
            {transaction.movement > 0 ? '+' : ''}{formatUnitQuantity(transaction.movement, transaction.unit)}
          </Text>
        </View>
      )) : (
        <Text style={styles.historyPlaceholderText}>No saved transactions for this ingredient.</Text>
      )}
      </ScrollView>
    );
  };

  const renderStocks = () => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
    >
      {renderTopHeader('Stocks', `${assignedBranch} / Staff`)}
      <View style={styles.stocksSummaryCard}>
        <Text style={styles.stocksSummaryTitle}>Every movement, accounted for.</Text>
        <Text style={styles.stocksSummarySubtitle}>Record stock for {assignedBranch} only.</Text>
      </View>
      <View style={styles.stockActionList}>
        <ActionCard
          title="Stock-In"
          description="Receive ingredients and track batch expiry"
          icon="↓"
          onPress={() => openForm('stockIn', 'stocks')}
        />
        <ActionCard
          title="Stock-Out"
          description="Log manual usage or a cooking batch"
          icon="↑"
          onPress={() => openForm('stockOut', 'stocks')}
        />
        <ActionCard
          title="Waste / Spoilage"
          description="Record expired, spoiled, or discarded ingredients"
          icon={<WasteTrashIcon color={colors.orange} />}
          onPress={() => openForm('waste', 'stocks')}
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

    const isLowStock = selectedAlertKind === 'lowStock';
    const batch = item.batches.find((candidate) => candidate.reference === selectedAlertBatchReference) ?? item.batches[0] ?? null;
    const expirationDateValue = parseInventoryDate(batch?.expirationDateIso ?? batch?.expirationDate ?? null);
    const alertDate = manilaBusinessDate();
    const daysRemaining = expirationDateValue ? daysBetweenDates(alertDate, expirationDateValue) : null;
    const expirationStatus = daysRemaining === null
      ? 'No valid expiration date'
      : daysRemaining < 0
        ? `Expired ${batch?.expirationDate}`
        : daysRemaining === 0
          ? 'Expires today'
          : `Expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}`;
    const receivedDate = batch?.receivedDate ?? getReceivedDate(item);
    const stockGap = Math.max(0, item.minimumStock - item.quantity);

    return (
      <>
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Alerts"
            onPress={() => setRoute('alerts')}
            style={styles.backButton}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Alert item details</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.alertDetailContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.alertDetailBadge, !isLowStock && styles.alertDetailExpiryBadge]}>
            <Text style={styles.alertDetailBadgeIcon}>{isLowStock ? '!' : '▦'}</Text>
            <Text style={styles.alertDetailBadgeText}>{isLowStock ? 'Low Stock' : 'Near Expiry'}</Text>
          </View>

          <View style={styles.alertDetailSummaryCard}>
            <Text style={styles.alertDetailName}>{item.name}</Text>
            <Text style={styles.alertDetailQuantity}>{formatUnitQuantity(item.quantity, item.unit)}</Text>
            <Text style={styles.alertDetailSubtext}>{assignedBranch} · {item.category}</Text>
          </View>

          <View style={styles.alertDetailRows}>
            {isLowStock ? (
              <>
                <DetailRow label="Current stock" value={formatUnitQuantity(item.quantity, item.unit)} />
                <DetailRow label="Minimum stock" value={formatUnitQuantity(item.minimumStock, item.unit)} />
                <DetailRow label="Below minimum" value={formatUnitQuantity(stockGap, item.unit)} />
                <DetailRow label="Status" value={item.quantity < item.minimumStock ? 'Low stock' : 'At minimum'} />
                <DetailRow label="Received" value={receivedDate} />
                <DetailRow label="Batch expires" value={batch?.expirationDate ?? 'Not recorded'} />
                <DetailRow label="Last updated" value={item.lastUpdated} />
              </>
            ) : (
              <>
                <DetailRow label="Batch reference" value={batch?.reference ?? item.batchReference ?? item.receivedBatch.split('·')[0].trim()} />
                <DetailRow label="Received date" value={receivedDate} />
                <DetailRow label="Expiration date" value={batch?.expirationDate ?? 'Not recorded'} />
                <DetailRow label="As of" value={formatDate(alertDate)} />
                <DetailRow label="Batch quantity remaining" value={formatUnitQuantity(batch?.quantityRemaining ?? item.quantity, item.unit)} />
                <DetailRow label="Status" value={expirationStatus} />
                <DetailRow label="Minimum stock" value={formatUnitQuantity(item.minimumStock, item.unit)} />
                <DetailRow label="Available stock" value={formatUnitQuantity(item.quantity, item.unit)} />
              </>
            )}
          </View>

          <View style={styles.alertDetailInfoBanner}>
            <Text style={styles.alertDetailInfoIcon}>i</Text>
            <Text style={styles.alertDetailInfoText}>
              {isLowStock
                ? 'Replenish before the next cooking batch. Alert clears when available stock reaches the minimum.'
                : 'Use the earliest valid batch first. This batch remains usable until its recorded expiration date.'}
            </Text>
          </View>

          <View style={styles.alertDetailActions}>
            {isLowStock ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSelectedIngredientId(item.id);
                  openForm('stockIn', 'alerts');
                }}
                style={({ pressed }) => [styles.alertDetailPrimary, pressed && styles.pressed]}
              >
                <Text style={styles.alertDetailPrimaryText}>Record Stock-In</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSelectedIngredientId(item.id);
                  setIngredientDetailReturnRoute('alerts');
                  setRoute('ingredientDetails');
                }}
                style={({ pressed }) => [styles.alertDetailPrimary, pressed && styles.pressed]}
              >
                <Text style={styles.alertDetailPrimaryText}>View ingredient inventory</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => setRoute('alerts')}
              style={({ pressed }) => [styles.alertDetailSecondary, pressed && styles.pressed]}
            >
              <Text style={styles.alertDetailSecondaryText}>Back to Alerts</Text>
            </Pressable>
          </View>
        </ScrollView>
      </>
    );
  };

  const renderAlertCard = (alert: InventoryAlert) => {
    const isLowStock = alert.kind === 'lowStock';
    return (
      <Pressable
        key={alert.id}
        accessibilityRole="button"
        accessibilityLabel={`${alert.title}, ${isLowStock ? 'Low Stock' : 'Near Expiry'}. ${alert.detail}`}
        onPress={() => {
          setSelectedAlertIngredientId(alert.ingredientId);
          setSelectedAlertBatchReference(alert.batch?.reference ?? '');
          setSelectedAlertKind(alert.kind);
          setRoute('alertDetails');
        }}
        style={({ pressed }) => [styles.inventoryAlertCard, pressed && styles.pressed]}
      >
        <View style={styles.inventoryAlertTopline}>
          <Text style={styles.inventoryAlertName}>{alert.title}</Text>
          <View style={[styles.inventoryAlertBadge, !isLowStock && styles.inventoryExpiryBadge]}>
            {!isLowStock ? <Text style={styles.inventoryAlertBadgeIcon}>!</Text> : null}
            <Text style={[styles.inventoryAlertBadgeText, !isLowStock && styles.inventoryExpiryBadgeText]}>
              {isLowStock ? 'Low Stock' : 'Near Expiry'}
            </Text>
          </View>
        </View>
        <Text style={styles.inventoryAlertDetail}>{alert.detail}</Text>
        {isLowStock ? (
          <View
            style={styles.stockLevelTrack}
            accessibilityRole="progressbar"
            accessibilityLabel={`${alert.title} stock compared with minimum threshold`}
            accessibilityValue={{ min: 0, max: 100, now: Math.round((alert.stockProgress ?? 0) * 100) }}
          >
            <View style={[styles.stockLevelFill, { width: `${Math.round((alert.stockProgress ?? 0) * 100)}%` }]} />
          </View>
        ) : null}
      </Pressable>
    );
  };

  const renderAlerts = () => {
    const lowStockAlerts = visibleAlerts.filter((alert) => alert.kind === 'lowStock');
    const expirationAlerts = visibleAlerts.filter((alert) => alert.kind === 'expiration');

    return (
      <ScrollView
        style={[styles.scroll, styles.alertsScreen]}
        contentContainerStyle={styles.alertsPageContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshAlertsData()}
            tintColor={colors.pink}
            colors={[colors.pink]}
          />
        }
      >
        <View style={styles.pageHeader}>
          <Text style={styles.alertPageTitle}>Alerts</Text>
        </View>
        <SearchBar
          value={alertSearch}
          onChangeText={setAlertSearch}
          placeholder="Searching for something?"
          variant="alerts"
        />
        {backendLoading ? (
          <View style={styles.alertState}>
            <ActivityIndicator size="small" color={colors.pink} />
            <Text style={styles.alertStateText}>Loading alerts…</Text>
          </View>
        ) : backendError !== '' ? (
          <View style={styles.alertState}>
            <Text style={styles.alertStateTitle}>Unable to load alerts</Text>
            <Text style={styles.alertStateText}>{backendError}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refreshAlertsData()}
              style={({ pressed }) => [styles.alertRetryButton, pressed && styles.pressed]}
            >
              <Text style={styles.alertRetryText}>Retry</Text>
            </Pressable>
          </View>
        ) : alertTerm !== '' && visibleAlerts.length === 0 ? (
          <View style={styles.alertState}>
            <Text style={styles.alertStateTitle}>No matching alerts</Text>
            <Text style={styles.alertStateText}>Try another ingredient, alert type, or detail.</Text>
          </View>
        ) : inventoryAlerts.length === 0 ? (
          <View style={styles.alertEmptyCard}>
            <View style={styles.alertEmptyIconCircle}>
              <View style={styles.alertEmptyBellBody} />
              <View style={styles.alertEmptyBellBase} />
              <View style={styles.alertEmptyBellClapper} />
            </View>
            <Text style={styles.alertEmptyTitle}>No alerts at the moment.</Text>
            <Text style={styles.alertEmptyText}>Low-stock and expiry alerts appear here.</Text>
          </View>
        ) : visibleAlerts.length === 0 ? (
          <View style={styles.alertState}>
            <Text style={styles.alertStateTitle}>No active alerts are visible</Text>
            <Text style={styles.alertStateText}>Check alert visibility in Profile &amp; settings.</Text>
          </View>
        ) : (
          <View style={styles.alertSections}>
            {lowStockAlerts.length > 0 ? (
              <View style={styles.alertSection}>
                <Text style={styles.alertSectionTitle}>Low-Stock Items</Text>
                <View style={styles.alertCardList}>{lowStockAlerts.map(renderAlertCard)}</View>
              </View>
            ) : null}
            {expirationAlerts.length > 0 ? (
              <View style={styles.alertSection}>
                <Text style={styles.alertSectionTitle}>Nearing Expiration</Text>
                <View style={styles.alertCardList}>{expirationAlerts.map(renderAlertCard)}</View>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    );
  };

  const renderDailyInventoryCheck = () => {
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
          <Text style={styles.dailyCheckIntro}>{formatDate(today)} · Enter today's physical quantities.</Text>
          <View style={styles.dailyTableHeader}>
            <Text style={[styles.dailyColumnTitle, styles.dailyIngredientColumn]}>Ingredient</Text>
            <Text style={[styles.dailyColumnTitle, styles.dailyRecordedColumn]}>Recorded</Text>
            <Text style={[styles.dailyColumnTitle, styles.dailyPhysicalColumn]}>Physical</Text>
            <Text style={[styles.dailyColumnTitle, styles.dailyDifferenceColumn]}>Diff.</Text>
          </View>
          <View style={styles.dailyRows}>
            {dailyCheckResults.map((line) => {
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

          <View style={styles.dailyFormActions}>
            <Pressable
              accessibilityRole="button"
              onPress={openDailyCheckReview}
              style={({ pressed }) => [styles.dailyPrimaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.dailyPrimaryButtonText}>Review differences</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigate('more')}
              style={({ pressed }) => [styles.dailySecondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.dailySecondaryButtonText}>Back to More</Text>
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
    const flour = check.lines.find((line) => line.ingredientId === 'flour');
    const discrepancyCount = check.lines.filter((line) => line.difference !== 0).length;
    const time = formatManilaTime(check.submittedAt);
    const auditText = flour
      ? `Flour's recorded balance remains ${formatUnitQuantity(flour.recordedQuantity, flour.unit)}. The ${formatUnitQuantity(flour.physicalQuantity, flour.unit)} physical count is an audit observation, not a stock adjustment.`
      : 'Physical counts are audit observations and do not adjust recorded stock balances.';

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
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.dailySuccessBanner} accessibilityRole="alert">
            <Text style={styles.dailySuccessIcon}>✓</Text>
            <Text style={styles.dailySuccessText}>Daily inventory check saved successfully.</Text>
          </View>
          <View style={styles.dailySummaryCard}>
            <Text style={styles.dailySummaryTitle}>Check submitted</Text>
            <Text style={styles.dailySummaryCount}>{check.lines.length} counted</Text>
            <Text style={styles.dailySummarySubtitle}>
              {discrepancyCount} {discrepancyCount === 1 ? 'discrepancy' : 'discrepancies'} ·{' '}
              {discrepancyCount > 0 ? 'Pending owner review' : 'Submitted'}
            </Text>
          </View>

          <View style={styles.dailyReceiptDetails}>
            {[
              ['Check reference', check.reference],
              ['Date', `${formatDate(check.checkDate)} · ${time}`],
              ['Branch', check.branch],
              ['Submitted by', check.staff],
              [
                'Flour difference',
                flour
                  ? `${formatDailyDifference(flour.difference, flour.unit)} · ${
                      flour.difference === 0 ? 'No discrepancy' : 'Pending review'
                    }`
                  : 'Not counted',
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
          <Pressable
            accessibilityRole="button"
            onPress={() => navigate('dashboard')}
            style={({ pressed }) => [styles.dailyPrimaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.dailyPrimaryButtonText}>Back to Dashboard</Text>
          </Pressable>
        </ScrollView>
      </>
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
        <Text style={styles.staffIdentitySubtitle}>{staffRole} · {assignedBranch}</Text>
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

  const renderMore = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.morePageContent} showsVerticalScrollIndicator={false}>
      {renderTopHeader('More', `${assignedBranch} / Staff`)}
      {renderStaffIdentityCard()}
      <View style={styles.moreNavigationList}>
        {([
          {
            icon: '☷',
            title: 'Daily inventory check',
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
                {appAlertsEnabled ? 'Enabled for stock and expiry' : 'Some in-app alerts are off'}
              </Text>
            </View>
            <View style={styles.profilePreferenceRow}>
              <Text style={styles.profilePreferenceLabel}>Low-stock alerts</Text>
              <Switch
                accessibilityLabel="Low-stock alerts"
                value={alertPreferences.lowStock}
                onValueChange={(value) =>
                  setAlertPreferences((current) => ({ ...current, lowStock: value }))
                }
                trackColor={{ false: theme.isDark ? theme.colors.border : '#D8D8DE', true: theme.isDark ? theme.colors.accent : '#F6A2BC' }}
                thumbColor={alertPreferences.lowStock ? colors.pink : theme.isDark ? theme.colors.surface : '#FFFFFF'}
              />
            </View>
            <View style={styles.profilePreferenceRow}>
              <Text style={styles.profilePreferenceLabel}>Expiry alerts</Text>
              <Switch
                accessibilityLabel="Expiry alerts"
                value={alertPreferences.expiration}
                onValueChange={(value) =>
                  setAlertPreferences((current) => ({ ...current, expiration: value }))
                }
                trackColor={{ false: theme.isDark ? theme.colors.border : '#D8D8DE', true: theme.isDark ? theme.colors.accent : '#F6A2BC' }}
                thumbColor={alertPreferences.expiration ? colors.pink : theme.isDark ? theme.colors.surface : '#FFFFFF'}
              />
            </View>
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

  const renderIngredientSelector = () => (
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
          ) : route === 'stockIn' ? [...new Set(ingredients.map((item) => item.category).sort((a, b) => a.localeCompare(b)))].map((group) => (
            <View key={group}>
              <Text style={styles.ingredientCategoryHeading}>{group}</Text>
              {ingredients
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
          )) : ingredients.map((item) => (
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
            <ScrollView
              style={styles.reasonDropdown}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {ingredients.length === 0 ? (
                <Text style={styles.ingredientPickerEmpty}>
                  {backendLoading
                    ? 'Loading branch ingredients…'
                    : 'No ingredients are configured for this branch.'}
                </Text>
              ) : ingredients.map((item) => (
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
          ) : null}
        </View>

        <View style={windowWidth >= 600 ? styles.formRowWide : styles.formRow}>
          <View style={windowWidth >= 600 ? styles.rowField : undefined}>
            <TextField
              label="Quantity Wasted *"
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
              label="Transaction Date *"
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
          <Text style={styles.fieldLabel}>Reason *</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: reasonListOpen }}
            onPress={() => setReasonListOpen((open) => !open)}
            style={[styles.selectInput, wasteFieldErrors.reason ? styles.textInputError : undefined]}
          >
            <Text style={styles.selectText}>{reason || 'Select a reason'}</Text>
            <Text style={styles.selectChevron}>{reasonListOpen ? '⌃' : '⌄'}</Text>
          </Pressable>
          <Text style={styles.wasteReasonHelper}>Spoiled · Expired · Spilled/Damaged · Other</Text>
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
          label="Notes"
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
      ? ['Spoilage', 'Expired', 'Other']
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
            <Text style={styles.formTitle}>Transaction history</Text>
            <Text style={styles.formSubtitle}>{assignedBranch} / Staff</Text>
          </View>
        </View>
        <View style={styles.historySearchWrap}>
          <SearchBar
            value={historySearch}
            onChangeText={setHistorySearch}
            placeholder="Search item or transaction reference"
          />
        </View>
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

        {filteredHistoryTransactions.length > 0 ? (
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
                        {transaction.type === 'Stock-Out / Usage' ? 'Usage' : transaction.type} · {transaction.ingredientName}
                      </Text>
                      <Text style={styles.historyTransactionReference}>{transaction.reference}</Text>
                    </View>
                    <Text style={[
                      styles.historyTransactionQuantity,
                      transaction.movement > 0
                        ? styles.historyTransactionPositive
                        : styles.historyTransactionNegative,
                    ]}>
                      {transaction.movement > 0 ? '+' : '-'}{formatUnitQuantity(transaction.quantity, transaction.unit)}
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
    const typeLabel = transaction.type === 'Usage' || transaction.type === 'Stock-Out / Usage'
      ? 'Stock-Out / Usage'
      : transaction.type;
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
            {transaction.movement > 0 ? '+' : '-'}{formatUnitQuantity(transaction.quantity, transaction.unit)}
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

  let screenContent: React.ReactNode;
  switch (route) {
    case 'dashboard':
      screenContent = renderDashboard();
      break;
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
    case 'inventoryHistory':
      screenContent = renderInventoryHistory();
      break;
    case 'alertDetails':
      screenContent = renderAlertDetails();
      break;
    case 'dailyInventoryCheck':
      screenContent = renderDailyInventoryCheck();
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
    case 'stockHistory':
      screenContent = renderStockHistory();
      break;
    case 'historyFilters':
      screenContent = renderHistoryFilters();
      break;
    case 'transactionDetails':
      screenContent = renderTransactionDetails();
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
        {backendError !== '' && route !== 'menu' && route !== 'cart' && route !== 'checkout' && route !== 'alerts' ? (
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
          cart={menuCart}
          onSetPage={setRoute}
          onAddProduct={addMenuProduct}
          onIncreaseQuantity={(productId) => changeMenuProductQuantity(productId, 1)}
          onDecreaseQuantity={(productId) => changeMenuProductQuantity(productId, -1)}
          onRemoveProduct={removeMenuProduct}
        />
      </View>
      {route !== 'stockOut' && route !== 'usagePreview' ? (
        <BottomNavigation active={route} onSelect={navigate} />
      ) : null}
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
            <Text style={styles.logoutModalTitle}>Are you sure you want to log out?</Text>
            <Text style={styles.logoutModalDescription}>
              End your secure session on this device? You will need your email and password to sign in again.
            </Text>
            <View style={styles.logoutSessionPanel}>
              <Text style={styles.logoutSessionText}>{staffName} · {staffRole}</Text>
              <Text style={styles.logoutSessionText}>{assignedBranch}</Text>
              <Text style={styles.logoutSessionNote}>Saved inventory records stay safe.</Text>
              <Text style={styles.logoutSessionNote}>No unsaved changes on this screen.</Text>
            </View>
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
                <Text style={styles.logoutConfirmText}>{logoutPending ? 'Logging out…' : 'Log out'}</Text>
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
                  {dailyDiscrepancies.length > 0 ? 'Review discrepancy' : 'No discrepancies found'}
                </Text>
                <Text style={styles.dailyModalSubtitle}>
                  {dailyDiscrepancies.length > 0
                    ? 'Review the physical count. Recorded balances will not be overwritten.'
                    : 'All physical counts match their recorded balances. No stock will be changed.'}
                </Text>
                <View style={styles.dailyModalSummary}>
                  {dailyDiscrepancies.length > 0 ? (
                    <>
                      {dailyDiscrepancies.map((line) => (
                        <React.Fragment key={line.ingredientId}>
                          <Text style={styles.dailyModalSummaryText}>
                            {line.name} · {assignedBranch}
                          </Text>
                          <Text style={styles.dailyModalSummaryText}>
                            Recorded {formatDailyUnitQuantity(line.recordedQuantity, line.unit)} / Physical{' '}
                            {formatDailyUnitQuantity(line.parsedQuantity, line.unit)}
                          </Text>
                          <Text style={styles.dailyModalSummaryEmphasis}>
                            Computed difference {formatDailyDifference(line.difference ?? 0, line.unit)}
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
                    <Text style={styles.dailyModalPrimaryText}>Continue</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.dailyModalIcon, styles.dailyConfirmIcon]}>
                  <Text style={styles.dailyModalIconText}>✓</Text>
                </View>
                <Text style={styles.dailyModalTitle}>Submit daily check?</Text>
                <Text style={styles.dailyModalSubtitle}>
                  Send this physical count for owner review. Recorded balances will not change.
                </Text>
                <View style={styles.dailyModalSummary}>
                  <Text style={styles.dailyModalSummaryText}>{assignedBranch} · {formatDate(today)}</Text>
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
                      setDailyCheckModal(dailyDiscrepancies.length > 0 ? 'review' : null)
                    }
                    style={({ pressed }) => [styles.dailyModalReviewButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.dailyModalReviewText}>Review</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={dailyCheckSubmitting}
                    onPress={submitDailyInventoryCheck}
                    style={({ pressed }) => [
                      styles.dailyModalPrimaryButton,
                      pressed && styles.pressed,
                      dailyCheckSubmitting && styles.confirmButtonDisabled,
                    ]}
                  >
                    <Text style={styles.dailyModalPrimaryText}>{dailyCheckSubmitting ? 'Submitting…' : 'Submit check'}</Text>
                  </Pressable>
                </View>
              </>
            )}
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
                    <Text style={styles.confirmButtonText}>{confirming ? 'Recording…' : 'Confirm Stock-In'}</Text>
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
                    setSelectedAlertBatchReference('');
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
  inventorySearch: { marginTop: 14 },
  inventoryFilterScroll: { flexGrow: 0, marginBottom: 17 },
  inventoryFilters: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 7, paddingRight: 8 },
  inventoryCount: { color: colors.muted, fontFamily: font.regular, fontSize: 9, marginBottom: 10 },
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
  historyButton: { minHeight: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.pink },
  historyButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 11 },
  detailDemoNote: { color: colors.muted, fontFamily: font.regular, fontSize: 8, textAlign: 'center', lineHeight: 13, marginTop: 13 },
  historyPlaceholderText: { color: colors.navy, fontFamily: font.semibold, fontSize: 13, marginBottom: 10 },
  historyPageContent: { paddingHorizontal: 17, paddingTop: 12, paddingBottom: 24, flexGrow: 1 },
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
    borderRadius: 12, backgroundColor: colors.pink, marginTop: 4,
  },
  historyDetailButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 10 },
  historyActivityCard: { flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 15, backgroundColor: '#EEEEEF' },
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
  alertDot: { position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.pink },
  searchBar: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    borderRadius: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, marginBottom: 17,
  },
  alertSearchBar: {
    minHeight: 42, borderRadius: 13, backgroundColor: '#F5F5F7', borderColor: '#F5F5F7', marginBottom: 0,
  },
  searchGlyph: { color: colors.muted, fontSize: 25, lineHeight: 29, width: 24, textAlign: 'center', marginRight: 7 },
  searchInput: { flex: 1, minHeight: 42, paddingVertical: 0, color: colors.ink, fontFamily: font.regular, fontSize: 11 },
  clearSearch: { color: colors.muted, fontFamily: font.medium, fontSize: 21, paddingHorizontal: 4 },
  infoBanner: { flexDirection: 'row', alignItems: 'center', padding: 11, borderRadius: 11, backgroundColor: '#EFEEFA', marginBottom: 14 },
  infoBannerText: { flex: 1, color: colors.navy, fontFamily: font.medium, fontSize: 10, lineHeight: 15 },
  bannerDismiss: { color: colors.muted, fontFamily: font.medium, fontSize: 19, paddingHorizontal: 4 },
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
  thumbnailEmoji: { fontSize: 29 },
  smallThumbnailEmoji: { fontSize: 20 },
  largeThumbnail: { width: 70, height: 80 },
  largeThumbnailEmoji: { fontSize: 34 },
  ingredientCopy: { flex: 1, minWidth: 0, justifyContent: 'center', marginLeft: 9 },
  statusBadge: { alignSelf: 'flex-start', borderRadius: 9, paddingHorizontal: 6, paddingVertical: 3, marginTop: 4 },
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
  stockActionList: { gap: 14, marginTop: 21 },
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
  alertsPageContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 19, paddingBottom: 20, backgroundColor: colors.white },
  alertPageTitle: { color: colors.ink, fontFamily: font.bold, fontSize: 22, lineHeight: 29 },
  alertSections: { flex: 1, paddingTop: 17, gap: 19 },
  alertSection: { gap: 9 },
  alertSectionTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 13, lineHeight: 18 },
  alertCardList: { gap: 9 },
  alertsScreen: {
    marginHorizontal: 8, marginTop: 7, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    backgroundColor: colors.white, overflow: 'hidden',
  },
  inventoryAlertCard: {
    minHeight: 80, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 11,
    borderRadius: 13, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line,
    elevation: 2, shadowColor: colors.navy, shadowOpacity: 0.06, shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  inventoryAlertTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  inventoryAlertName: { flex: 1, minWidth: 0, color: colors.navy, fontFamily: font.semibold, fontSize: 11 },
  inventoryAlertBadge: {
    flexShrink: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10, backgroundColor: '#FFF2C4',
  },
  inventoryExpiryBadge: { backgroundColor: colors.red },
  inventoryAlertBadgeIcon: { color: colors.white, fontFamily: font.bold, fontSize: 8, marginRight: 4 },
  inventoryAlertBadgeText: { color: colors.navy, fontFamily: font.medium, fontSize: 8 },
  inventoryExpiryBadgeText: { color: colors.white },
  inventoryAlertDetail: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginTop: 6 },
  stockLevelTrack: { height: 5, overflow: 'hidden', borderRadius: 3, backgroundColor: '#E8E8EB', marginTop: 9 },
  stockLevelFill: { height: '100%', borderRadius: 3, backgroundColor: '#F0C419' },
  alertEmptyCard: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 17, paddingVertical: 22,
  },
  alertEmptyIconCircle: {
    width: 68, height: 68, alignItems: 'center', justifyContent: 'center',
    borderRadius: 34, backgroundColor: '#F0F0F2', marginBottom: 15,
  },
  alertEmptyBellBody: {
    position: 'absolute', top: 17, width: 19, height: 21, borderWidth: 1.7, borderColor: '#777783',
    borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
  },
  alertEmptyBellBase: { position: 'absolute', top: 39, width: 24, height: 2, borderRadius: 1, backgroundColor: '#777783' },
  alertEmptyBellClapper: { position: 'absolute', top: 42, width: 5, height: 4, borderRadius: 3, backgroundColor: '#777783' },
  alertEmptyTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 13, textAlign: 'center' },
  alertEmptyText: { color: colors.muted, fontFamily: font.regular, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 5 },
  alertState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  alertStateTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 13, textAlign: 'center' },
  alertStateText: { color: colors.muted, fontFamily: font.regular, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 6 },
  alertRetryButton: { minWidth: 90, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, backgroundColor: colors.pink, marginTop: 13 },
  alertRetryText: { color: colors.white, fontFamily: font.semibold, fontSize: 10 },
  alertDetailContent: { paddingHorizontal: 17, paddingTop: 13, paddingBottom: 20 },
  alertDetailBadge: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9,
    paddingVertical: 5, borderRadius: 11, backgroundColor: '#FFF2C4', marginBottom: 10,
  },
  alertDetailExpiryBadge: { backgroundColor: '#FFF2C4' },
  alertDetailBadgeIcon: { color: colors.orange, fontFamily: font.bold, fontSize: 10, marginRight: 5 },
  alertDetailBadgeText: { color: colors.navy, fontFamily: font.medium, fontSize: 8 },
  alertDetailSummaryCard: {
    minHeight: 112, justifyContent: 'center', paddingHorizontal: 15, paddingVertical: 13,
    borderRadius: 16, backgroundColor: colors.navy, marginBottom: 12,
    elevation: 4, shadowColor: colors.navy, shadowOpacity: 0.12, shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
  },
  alertDetailName: { color: colors.white, fontFamily: font.semibold, fontSize: 12 },
  alertDetailQuantity: { color: colors.orange, fontFamily: font.bold, fontSize: 27, lineHeight: 32, marginTop: 3 },
  alertDetailSubtext: { color: '#D5D5DF', fontFamily: font.regular, fontSize: 8, marginTop: 2 },
  alertDetailRows: {
    paddingHorizontal: 11, borderRadius: 13, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.line, marginBottom: 11,
  },
  alertDetailInfoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 10, borderRadius: 11,
    backgroundColor: colors.yellow, marginBottom: 12,
  },
  alertDetailInfoIcon: {
    width: 17, height: 17, overflow: 'hidden', borderRadius: 9, color: colors.white,
    backgroundColor: colors.orange, fontFamily: font.bold, fontSize: 10,
    textAlign: 'center', lineHeight: 17, marginRight: 7,
  },
  alertDetailInfoText: { flex: 1, color: colors.navy, fontFamily: font.regular, fontSize: 8, lineHeight: 13 },
  alertDetailActions: { gap: 8 },
  alertDetailPrimary: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: colors.pink,
  },
  alertDetailPrimaryText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
  alertDetailSecondary: {
    minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: '#EEEEEF',
  },
  alertDetailSecondaryText: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
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
  staffIdentitySubtitle: { color: '#FFA126', fontFamily: font.medium, fontSize: 8, marginTop: 3 },
  moreNavigationList: { gap: 8 },
  moreNavigationCard: {
    minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11,
    paddingVertical: 9, borderRadius: 13, backgroundColor: '#EEEEEF',
    borderWidth: 1, borderColor: '#E8E8EB',
  },
  moreNavigationIcon: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    borderRadius: 11, backgroundColor: '#FFF8EA', borderWidth: 1, borderColor: '#F6D6A4',
    marginRight: 10,
  },
  moreNavigationIconText: { color: '#E59420', fontFamily: font.medium, fontSize: 18, lineHeight: 22 },
  moreNavigationCopy: { flex: 1, minWidth: 0 },
  moreNavigationTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
  moreNavigationDescription: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 2 },
  moreNavigationChevron: { color: '#A8A8B1', fontFamily: font.regular, fontSize: 22, marginLeft: 5 },
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
  profileSettingsHeading: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    minHeight: 30,
  },
  profileSettingsValue: { color: colors.muted, fontFamily: font.regular, fontSize: 7, textAlign: 'right' },
  profilePreferenceRow: {
    minHeight: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: '#DDDDDF',
  },
  profilePreferenceLabel: { color: colors.navy, fontFamily: font.medium, fontSize: 8 },
  profileAlertNote: { color: colors.muted, fontFamily: font.regular, fontSize: 6, lineHeight: 9, marginTop: 2 },
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
  logoutModalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 9, marginTop: 14 },
  logoutCancelAction: {
    minWidth: 82, minHeight: 39, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, backgroundColor: '#EEEEF0',
  },
  logoutCancelText: { color: colors.navy, fontFamily: font.medium, fontSize: 8 },
  logoutConfirmAction: {
    minWidth: 95, minHeight: 39, alignItems: 'center', justifyContent: 'center',
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
  formHeaderCopy: { flex: 1, marginLeft: 10 },
  backButton: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.pale },
  backGlyph: { color: colors.navy, fontSize: 30, lineHeight: 32, marginTop: -3 },
  formTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 15, lineHeight: 19 },
  formSubtitle: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 1 },
  dailyCheckContent: { paddingHorizontal: 14, paddingTop: 13, paddingBottom: 18 },
  dailyCheckIntro: { color: colors.navy, fontFamily: font.medium, fontSize: 9, lineHeight: 14, marginBottom: 12 },
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
  dailyFormActions: { gap: 8, marginTop: 3 },
  dailyPrimaryButton: {
    minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 12,
    backgroundColor: colors.pink,
  },
  dailyPrimaryButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 10 },
  dailySecondaryButton: {
    minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 12,
    backgroundColor: '#EEEEF0',
  },
  dailySecondaryButtonText: { color: '#555560', fontFamily: font.semibold, fontSize: 10 },
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
  selectInput: {
    minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    borderRadius: 11, borderWidth: 1, borderColor: '#E9E9ED', backgroundColor: '#EEEEEF',
  },
  selectText: { flex: 1, color: colors.ink, fontFamily: font.regular, fontSize: 10 },
  availableQuantity: { color: colors.muted, fontFamily: font.medium, fontSize: 8, marginRight: 8 },
  selectChevron: { color: colors.orange, fontSize: 18, marginLeft: 5 },
  dropdown: { maxHeight: 230, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.white, marginTop: 5, overflow: 'hidden' },
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
  cancelButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#EEEEF0' },
  cancelButtonText: { color: '#555560', fontFamily: font.semibold, fontSize: 11 },
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
  wasteTrashIcon: { width: 20, height: 22, alignItems: 'center', justifyContent: 'flex-end' },
  wasteTrashHandle: { width: 7, height: 2, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: colors.pink, marginBottom: 2 },
  wasteTrashLid: { width: 16, height: 2, borderRadius: 1, backgroundColor: colors.pink, marginBottom: 2 },
  wasteTrashBody: {
    width: 13, height: 14, flexDirection: 'row', justifyContent: 'space-evenly',
    paddingTop: 3, borderWidth: 1.5, borderTopWidth: 0, borderColor: colors.pink,
    borderBottomLeftRadius: 3, borderBottomRightRadius: 3,
  },
  wasteTrashLine: { width: 1, height: 6, backgroundColor: colors.pink },
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
  confirmCancelButton: { minWidth: 82, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#EEEEF0' },
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
    backgroundColor: '#EEEEF0',
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
  calendarDaySelected: { backgroundColor: colors.pink },
  calendarDayText: { color: colors.navy, fontFamily: font.regular, fontSize: 10 },
  calendarDayTextSelected: { color: colors.white, fontFamily: font.semibold },
  calendarCancel: { alignSelf: 'flex-end', paddingHorizontal: 13, paddingVertical: 9, marginTop: 8 },
  calendarCancelText: { color: colors.muted, fontFamily: font.medium, fontSize: 10 },
  }, theme));
}

type StaffStyles = ReturnType<typeof createStaffStyles>;
const staffStylesCache = new WeakMap<AppTheme, StaffStyles>();
