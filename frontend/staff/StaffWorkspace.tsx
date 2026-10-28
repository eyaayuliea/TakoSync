import React, { useMemo, useRef, useState } from 'react';
import {
  Image,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import BottomNavigation, { type StaffRoute, type StaffTab } from '../navigation/BottomNavigation';

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
};

type Ingredient = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
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

const initialIngredients: Ingredient[] = [
  {
    id: 'octopus',
    name: 'Octopus',
    category: 'Seafood',
    quantity: 3,
    unit: 'kg',
    threshold: 5,
    lowStock: true,
    expiration: '30 Oct 2026',
    nearExpiry: false,
    minimumStock: 5,
    type: 'Frozen seafood',
    unitName: 'Kilograms (kg)',
    receivedBatch: 'OCT-2510 · 25 Oct 2026',
    batches: [{ reference: 'OCT-2510', receivedDate: '25 Oct 2026', expirationDate: '30 Oct 2026' }],
    lastUpdated: '25 Oct 2026 · 10:15 AM',
    emoji: '🐙',
    tint: '#FCE9DE',
  },
  {
    id: 'flour',
    name: 'Flour',
    category: 'Dry Goods',
    quantity: 12,
    unit: 'kg',
    threshold: 5,
    lowStock: false,
    expiration: null,
    nearExpiry: false,
    minimumStock: 5,
    type: 'Dry goods',
    unitName: 'Kilograms (kg)',
    receivedBatch: 'FLR-2510 · 24 Oct 2026',
    batches: [{ reference: 'FLR-2510', receivedDate: '24 Oct 2026', expirationDate: null }],
    lastUpdated: '25 Oct 2026 · 9:30 AM',
    emoji: '🌾',
    tint: '#FFF1D8',
  },
  {
    id: 'eggs',
    name: 'Eggs',
    category: 'Dairy & eggs',
    quantity: 48,
    unit: 'pcs',
    threshold: 24,
    lowStock: false,
    expiration: '2 Nov 2026',
    nearExpiry: false,
    minimumStock: 24,
    type: 'Fresh eggs',
    unitName: 'Pieces (pcs)',
    receivedBatch: 'EGG-2510 · 25 Oct 2026',
    batches: [{ reference: 'EGG-2510', receivedDate: '25 Oct 2026', expirationDate: '2 Nov 2026' }],
    lastUpdated: '25 Oct 2026 · 10:20 AM',
    emoji: '🥚',
    tint: '#FFF4D8',
  },
  {
    id: 'sauces',
    name: 'Sauces',
    category: 'Condiments',
    quantity: 2,
    unit: 'L',
    threshold: 2,
    lowStock: false,
    expiration: '27 Oct 2026',
    nearExpiry: true,
    minimumStock: 1,
    type: 'Takoyaki sauce',
    unitName: 'Liters (L)',
    receivedBatch: 'SC-B1-2710 · 23 Oct 2026',
    batchReference: 'SC-B1-2710',
    batches: [{ reference: 'SC-B1-2710', receivedDate: '23 Oct 2026', expirationDate: '27 Oct 2026' }],
    lastUpdated: '25 Oct 2026 · 10:05 AM',
    emoji: '🫙',
    tint: '#FBE7E9',
  },
];

const categories = ['All', 'Seafood', 'Dry Goods', 'Dairy & eggs', 'Condiments'];
const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatDate(date: Date) {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

function formatStockInReference(date: Date, receiptNumber: number) {
  const datePart = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }).replace('/', '');
  return `SI-${datePart}-${String(receiptNumber).padStart(3, '0')}`;
}

type StockReceipt = {
  reference: string;
  ingredientId: string;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  transactionDate: Date;
  expirationDate: Date | null;
  notes: string;
};

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

type FastLogPreset = {
  id: string;
  section: 'cooking' | 'waste';
  name: string;
  pieces?: number;
  reason: string;
  reasonDetail: string;
  deductions: { ingredientId: string; quantity: number }[];
};

type FastLogReceipt = {
  reference: string;
  preset: FastLogPreset;
  deductions: UsageDeduction[];
  transactionDate: Date;
  reason: string;
  notes: string;
  pieces: number | null;
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

type StaffAccount = {
  displayName: string;
  role: string;
  email: string;
  branch: string;
};

type WasteReason = 'Waste / Other' | 'Damaged' | 'Spoiled' | 'Expired';

type WasteReceipt = {
  reference: string;
  ingredientId: string;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  transactionDate: Date;
  reason: WasteReason;
  description: string;
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
  historical: boolean;
};

const historyTypeFilters: HistoryTypeFilter[] = [
  'All types',
  'Stock-In',
  'Stock-Out',
  'Usage',
  'Waste',
  'Spoilage',
];

function transactionDateAt(hour: number, minute: number) {
  const date = new Date(2026, 9, 25);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function dateAtTime(date: Date, hour: number, minute: number) {
  const result = new Date(date.getTime());
  result.setHours(hour, minute, 0, 0);
  return result;
}

function formatHistoryDateTime(date: Date) {
  return `${formatDate(date)} · ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

const initialHistoryTransactions: HistoryTransaction[] = [
  {
    id: 'seed-si-octopus',
    reference: 'SI-1025-001',
    type: 'Stock-In',
    ingredientId: 'octopus',
    ingredientName: 'Octopus',
    category: 'Seafood',
    quantity: 5,
    unit: 'kg',
    movement: 5,
    branchId: 'manila-branch-1',
    branch: 'Manila · Branch 1',
    staffId: 'staff-isabel-san-esteban',
    staff: 'Isabel San Esteban',
    transactionDate: transactionDateAt(8, 0),
    reason: 'Stock-In',
    notes: 'Opening delivery',
    beforeQuantity: 0,
    afterQuantity: 5,
    batchReference: null,
    historical: true,
  },
  {
    id: 'seed-us-octopus-001',
    reference: 'US-1025-001',
    type: 'Usage',
    ingredientId: 'octopus',
    ingredientName: 'Octopus',
    category: 'Seafood',
    quantity: 1,
    unit: 'kg',
    movement: -1,
    branchId: 'manila-branch-1',
    branch: 'Manila · Branch 1',
    staffId: 'staff-isabel-san-esteban',
    staff: 'Isabel San Esteban',
    transactionDate: transactionDateAt(9, 30),
    reason: 'Cooking usage',
    notes: 'First cooking preparation',
    beforeQuantity: 5,
    afterQuantity: 4,
    batchReference: null,
    historical: true,
  },
  {
    id: 'seed-us-octopus-002',
    reference: 'US-1025-002',
    type: 'Usage',
    ingredientId: 'octopus',
    ingredientName: 'Octopus',
    category: 'Seafood',
    quantity: 1,
    unit: 'kg',
    movement: -1,
    branchId: 'manila-branch-1',
    branch: 'Manila · Branch 1',
    staffId: 'staff-isabel-san-esteban',
    staff: 'Isabel San Esteban',
    transactionDate: transactionDateAt(10, 15),
    reason: 'Cooking usage',
    notes: 'Second cooking preparation',
    beforeQuantity: 4,
    afterQuantity: 3,
    batchReference: null,
    historical: true,
  },
  {
    id: 'seed-ws-eggs',
    reference: 'WS-1025-001',
    type: 'Waste',
    ingredientId: 'eggs',
    ingredientName: 'Eggs',
    category: 'Dairy & eggs',
    quantity: 6,
    unit: 'pcs',
    movement: -6,
    branchId: 'manila-branch-1',
    branch: 'Manila · Branch 1',
    staffId: 'staff-isabel-san-esteban',
    staff: 'Isabel San Esteban',
    transactionDate: transactionDateAt(8, 30),
    reason: 'Waste / Other',
    notes: 'Tray slipped during handling · Cracked eggs discarded',
    beforeQuantity: 54,
    afterQuantity: 48,
    batchReference: null,
    historical: true,
  },
];

const wasteReasons: WasteReason[] = ['Waste / Other', 'Damaged', 'Spoiled', 'Expired'];

const fastLogPresets: FastLogPreset[] = [
  {
    id: 'standard-batch',
    section: 'cooking',
    name: 'Standard batch',
    pieces: 40,
    reason: 'Cooking usage',
    reasonDetail: 'One cooking batch',
    deductions: [
      { ingredientId: 'octopus', quantity: 0.5 },
      { ingredientId: 'flour', quantity: 1 },
      { ingredientId: 'eggs', quantity: 4 },
      { ingredientId: 'sauces', quantity: 0.1 },
    ],
  },
  {
    id: 'half-batch',
    section: 'cooking',
    name: 'Half batch',
    pieces: 20,
    reason: 'Cooking usage',
    reasonDetail: 'Half cooking batch',
    deductions: [
      { ingredientId: 'octopus', quantity: 0.25 },
      { ingredientId: 'flour', quantity: 0.5 },
      { ingredientId: 'eggs', quantity: 2 },
      { ingredientId: 'sauces', quantity: 0.05 },
    ],
  },
  {
    id: 'cracked-egg',
    section: 'waste',
    name: 'Cracked egg · Waste',
    reason: 'Waste',
    reasonDetail: 'Damaged during handling',
    deductions: [{ ingredientId: 'eggs', quantity: 1 }],
  },
  {
    id: 'sauce-spoilage',
    section: 'waste',
    name: 'Sauce spoilage',
    reason: 'Spoilage',
    reasonDetail: 'Unusable after opening',
    deductions: [{ ingredientId: 'sauces', quantity: 0.1 }],
  },
];

const stockOutBatchPresets = [
  {
    name: 'Standard takoyaki batch',
    deductions: [
      { ingredientId: 'octopus', quantity: 1 },
      { ingredientId: 'flour', quantity: 0.5 },
    ],
  },
  {
    name: 'Rush-hour takoyaki batch',
    deductions: [
      { ingredientId: 'octopus', quantity: 1.5 },
      { ingredientId: 'flour', quantity: 1 },
    ],
  },
] as const;

const openingDate = new Date(2026, 9, 25);
const openingExpirationDate = new Date(2026, 9, 30);
const nearExpiryWindowDays = 3;

type InventoryAlertKind = 'lowStock' | 'expiration';
type InventoryAlertFilter = 'all' | InventoryAlertKind;

type InventoryAlert = {
  id: string;
  kind: InventoryAlertKind;
  ingredientId: string;
  batch: IngredientBatch | null;
  title: string;
  detail: string;
};

function parseInventoryDate(value: string | null) {
  if (!value) return null;
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
  return (
    <View style={styles.searchBar}>
      <Text style={styles.searchGlyph}>⌕</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
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

function IngredientThumbnail({ item, large = false }: { item: Ingredient; large?: boolean }) {
  return (
    <View
      style={[styles.ingredientThumbnail, large && styles.largeThumbnail, { backgroundColor: item.tint }]}
      accessibilityLabel={`${item.name} image placeholder`}
    >
      <Text style={large ? styles.largeThumbnailEmoji : styles.thumbnailEmoji}>{item.emoji}</Text>
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
  const toneStyle = tone === 'low' ? styles.lowBadge : tone === 'warning' ? styles.warningBadge : styles.goodBadge;
  const textStyle = tone === 'low' ? styles.lowBadgeText : tone === 'warning' ? styles.warningBadgeText : styles.goodBadgeText;
  return (
    <View style={[styles.statusBadge, toneStyle, alignRight && styles.statusBadgeRight]}>
      <Text style={[styles.statusBadgeText, textStyle]}>{label}</Text>
    </View>
  );
}

function IngredientCard({
  item,
  onPress,
  compact = false,
  cardWidth,
  statusOverride,
}: {
  item: Ingredient;
  onPress?: () => void;
  compact?: boolean;
  cardWidth?: number;
  statusOverride?: { label: string; tone: 'low' | 'good' | 'warning' };
}) {
  const Wrapper = onPress ? Pressable : View;
  const statusLabel = statusOverride?.label ?? (item.lowStock ? 'Low Stock' : item.nearExpiry ? 'Near Expiry' : 'In Stock');
  const statusTone = statusOverride?.tone ?? (item.lowStock ? 'low' : item.nearExpiry ? 'warning' : 'good');

  return (
    <Wrapper
      {...(onPress ? { onPress, accessibilityRole: 'button' as const } : {})}
      style={[
        styles.ingredientCard,
        !compact && styles.listIngredientCard,
        compact && cardWidth !== undefined ? { width: cardWidth } : null,
      ]}
    >
      <IngredientThumbnail item={item} />
      <View style={styles.ingredientCopy}>
        <Text style={styles.ingredientName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.ingredientCategory}>{item.category}</Text>
        <Text style={styles.ingredientQuantity}>{item.quantity} {item.unit}</Text>
        {item.expiration ? <Text style={styles.ingredientExpiration}>Exp. {item.expiration}</Text> : null}
        <StatusBadge label={statusLabel} tone={statusTone} />
      </View>
      <Text style={styles.cardChevron}>›</Text>
    </Wrapper>
  );
}

function InventoryIngredientCard({ item, onPress }: { item: Ingredient; onPress: () => void }) {
  const statusLabel = item.lowStock ? 'Low Stock' : item.nearExpiry ? 'Near Expiry' : 'In Stock';
  const statusTone = item.lowStock ? 'low' : item.nearExpiry ? 'warning' : 'good';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.quantity} ${item.unit}, ${statusLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.inventoryCard, pressed && styles.pressed]}
    >
      <IngredientThumbnail item={item} />
      <View style={styles.inventoryCardCopy}>
        <Text style={styles.inventoryIngredientName}>{item.name}</Text>
        <Text style={styles.inventoryIngredientCategory}>{item.category}</Text>
      </View>
      <View style={styles.inventoryQuantityColumn}>
        <Text style={styles.inventoryQuantity}>{item.quantity} {item.unit}</Text>
        <StatusBadge label={statusLabel} tone={statusTone} alignRight />
      </View>
    </Pressable>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
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
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function WasteTrashIcon() {
  return (
    <View style={styles.wasteTrashIcon} accessibilityLabel="Waste confirmation">
      <View style={styles.wasteTrashHandle} />
      <View style={styles.wasteTrashLid} />
      <View style={styles.wasteTrashBody}>
        <View style={styles.wasteTrashLine} />
        <View style={styles.wasteTrashLine} />
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
  icon: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      onPress={onPress}
      style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}
    >
      <View style={styles.actionIconBox}>
        <Text style={styles.actionIcon}>{icon}</Text>
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
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {suffix ? (
        <View style={[styles.suffixedInput, error ? styles.textInputError : undefined]}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#A0A0AA"
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
          placeholderTextColor="#A0A0AA"
          keyboardType={keyboardType}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[styles.textInput, multiline && styles.notesInput, error !== undefined && error !== '' && styles.textInputError]}
        />
      )}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function DatePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
}) {
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

  return (
    <>
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${value ? formatDate(value) : 'choose date'}`}
          onPress={() => {
            setMonth(value ?? new Date());
            setVisible(true);
          }}
          style={styles.dateInput}
        >
          <Text style={[styles.dateInputText, !value && styles.placeholderText]}>
            {value ? formatDate(value) : 'Select a date'}
          </Text>
          <Text style={styles.calendarGlyph}>▦</Text>
        </Pressable>
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
  onLogout: () => void;
  user: StaffAccount | null;
  appVersion: string;
}) {
  const [route, setRoute] = useState<StaffRoute>('dashboard');
  const [returnRoute, setReturnRoute] = useState<StaffTab>('stocks');
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [dailyCheckLines, setDailyCheckLines] = useState<DailyCheckLine[]>([]);
  const [dailyCheckRemarks, setDailyCheckRemarks] = useState('Recounted; bag short by 2 kg');
  const [dailyCheckAttempted, setDailyCheckAttempted] = useState(false);
  const [dailyCheckModal, setDailyCheckModal] = useState<'review' | 'confirm' | null>(null);
  const [dailyCheckRecords, setDailyCheckRecords] = useState<DailyInventoryCheck[]>([]);
  const [currentDailyCheck, setCurrentDailyCheck] = useState<DailyInventoryCheck | null>(null);
  const dailyCheckSubmissionLock = useRef(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedIngredientId, setSelectedIngredientId] = useState('');
  const [ingredientListOpen, setIngredientListOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [usageMode, setUsageMode] = useState<'manual' | 'cookingBatch'>('manual');
  const [batchPreset, setBatchPreset] = useState<string>(stockOutBatchPresets[0].name);
  const [batchPresetOpen, setBatchPresetOpen] = useState(false);
  const [batchCount, setBatchCount] = useState('1');
  const [transactionDate, setTransactionDate] = useState<Date | null>(new Date());
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [reason, setReason] = useState('Cooking usage');
  const [reasonListOpen, setReasonListOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [wasteDescription, setWasteDescription] = useState('');
  const [wasteFieldErrors, setWasteFieldErrors] = useState<Record<string, string>>({});
  const [wasteValidationAttempted, setWasteValidationAttempted] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [quantityError, setQuantityError] = useState('');
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fastLogSubmissionLock = useRef(false);
  const wasteSubmissionLock = useRef(false);
  const [stockReceipts, setStockReceipts] = useState<StockReceipt[]>([]);
  const [currentReceipt, setCurrentReceipt] = useState<StockReceipt | null>(null);
  const [wasteReceipts, setWasteReceipts] = useState<WasteReceipt[]>([]);
  const [currentWasteReceipt, setCurrentWasteReceipt] = useState<WasteReceipt | null>(null);
  const [usageReceipts, setUsageReceipts] = useState<UsageReceipt[]>([]);
  const [currentUsageReceipt, setCurrentUsageReceipt] = useState<UsageReceipt | null>(null);
  const [selectedFastLogPresetId, setSelectedFastLogPresetId] = useState('');
  const [fastLogDraftDeductions, setFastLogDraftDeductions] = useState<{ ingredientId: string; quantity: string }[]>([]);
  const [fastLogReason, setFastLogReason] = useState('');
  const [fastLogNotes, setFastLogNotes] = useState('');
  const [fastLogPieces, setFastLogPieces] = useState('');
  const [fastLogFieldErrors, setFastLogFieldErrors] = useState<Record<string, string>>({});
  const [fastLogIngredientPickerIndex, setFastLogIngredientPickerIndex] = useState<number | null>(null);
  const [fastLogReceipts, setFastLogReceipts] = useState<FastLogReceipt[]>([]);
  const [currentFastLogReceipt, setCurrentFastLogReceipt] = useState<FastLogReceipt | null>(null);
  const [fastLogPopupVisible, setFastLogPopupVisible] = useState(false);
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardMessage, setDashboardMessage] = useState('');
  const [dashboardCarouselWidth, setDashboardCarouselWidth] = useState(0);
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
  const [notificationFilter, setNotificationFilter] = useState<InventoryAlertFilter>('all');
  const [selectedAlertIngredientId, setSelectedAlertIngredientId] = useState('');
  const [selectedAlertBatchReference, setSelectedAlertBatchReference] = useState('');
  const [selectedAlertKind, setSelectedAlertKind] = useState<InventoryAlertKind>('lowStock');
  const [ingredientDetailReturnRoute, setIngredientDetailReturnRoute] = useState<'inventory' | 'notifications'>('inventory');
  const [logoutConfirmationVisible, setLogoutConfirmationVisible] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [logoutPending, setLogoutPending] = useState(false);
  const logoutSubmissionLock = useRef(false);
  const [notificationPreferences, setNotificationPreferences] = useState({
    lowStock: true,
    expiration: true,
    activity: true,
  });

  const selectedIngredient = ingredients.find((item) => item.id === selectedIngredientId);
  const staffName = user?.displayName || 'Isabel San Esteban';
  const staffRole = user?.role || 'Staff';
  const staffEmail = user?.email || 'isabel@gelos.ph';
  const assignedBranch = user?.branch || 'Manila · Branch 1';
  const historyTransactions: HistoryTransaction[] = [
    ...initialHistoryTransactions,
    ...stockReceipts.flatMap((receipt) => {
      const ingredient = ingredients.find((item) => item.id === receipt.ingredientId);
      if (!ingredient) return [];
      return [{
        id: `stock-in-${receipt.reference}-${receipt.ingredientId}`,
        reference: receipt.reference,
        type: 'Stock-In' as const,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        category: ingredient.category,
        quantity: receipt.quantity,
        unit: ingredient.unit,
        movement: receipt.quantity,
        branchId: 'manila-branch-1',
        branch: 'Manila · Branch 1',
        staffId: 'staff-isabel-san-esteban',
        staff: 'Isabel San Esteban',
        transactionDate: dateAtTime(receipt.transactionDate, 8, 0),
        reason: 'Stock-In',
        notes: receipt.notes,
        beforeQuantity: receipt.previousQuantity,
        afterQuantity: receipt.newQuantity,
        batchReference: null,
        historical: false,
      }];
    }),
    ...usageReceipts.flatMap((receipt) => receipt.deductions.flatMap((deduction) => {
      const ingredient = ingredients.find((item) => item.id === deduction.ingredientId);
      if (!ingredient) return [];
      return [{
        id: `usage-${receipt.reference}-${ingredient.id}`,
        reference: receipt.reference,
        type: 'Usage' as const,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        category: ingredient.category,
        quantity: deduction.quantity,
        unit: ingredient.unit,
        movement: -deduction.quantity,
        branchId: 'manila-branch-1',
        branch: 'Manila · Branch 1',
        staffId: 'staff-isabel-san-esteban',
        staff: 'Isabel San Esteban',
        transactionDate: dateAtTime(receipt.transactionDate, 10, 30),
        reason: receipt.reason,
        notes: receipt.notes,
        beforeQuantity: deduction.previousQuantity,
        afterQuantity: deduction.newQuantity,
        batchReference: receipt.batchPreset,
        historical: false,
      }];
    })),
    ...fastLogReceipts.flatMap((receipt) => receipt.deductions.flatMap((deduction) => {
      const ingredient = ingredients.find((item) => item.id === deduction.ingredientId);
      if (!ingredient) return [];
      const type: HistoryTransactionType = receipt.preset.section === 'waste' ? 'Waste' : 'Usage';
      return [{
        id: `fastlog-${receipt.reference}-${ingredient.id}`,
        reference: receipt.reference,
        type,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        category: ingredient.category,
        quantity: deduction.quantity,
        unit: ingredient.unit,
        movement: -deduction.quantity,
        branchId: 'manila-branch-1',
        branch: 'Manila · Branch 1',
        staffId: 'staff-isabel-san-esteban',
        staff: 'Isabel San Esteban',
        transactionDate: dateAtTime(receipt.transactionDate, 10, 30),
        reason: receipt.reason,
        notes: receipt.notes,
        beforeQuantity: deduction.previousQuantity,
        afterQuantity: deduction.newQuantity,
        batchReference: receipt.preset.name,
        historical: false,
      }];
    })),
    ...wasteReceipts.flatMap((receipt) => {
      const ingredient = ingredients.find((item) => item.id === receipt.ingredientId);
      if (!ingredient) return [];
      return [{
        id: `waste-${receipt.reference}-${ingredient.id}`,
        reference: receipt.reference,
        type: receipt.reason === 'Spoiled' || receipt.reason === 'Expired' ? 'Spoilage' as const : 'Waste' as const,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        category: ingredient.category,
        quantity: receipt.quantity,
        unit: ingredient.unit,
        movement: -receipt.quantity,
        branchId: 'manila-branch-1',
        branch: 'Manila · Branch 1',
        staffId: 'staff-isabel-san-esteban',
        staff: 'Isabel San Esteban',
        transactionDate: dateAtTime(receipt.transactionDate, 8, 30),
        reason: receipt.reason,
        notes: [receipt.description, receipt.notes].filter(Boolean).join(' · '),
        beforeQuantity: receipt.previousQuantity,
        afterQuantity: receipt.newQuantity,
        batchReference: null,
        historical: false,
      }];
    }),
  ].sort((first, second) => second.transactionDate.getTime() - first.transactionDate.getTime());
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
    const dateValue = new Date(
      transaction.transactionDate.getFullYear(),
      transaction.transactionDate.getMonth(),
      transaction.transactionDate.getDate(),
    ).getTime();
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
  const selectedFastLogPreset = fastLogPresets.find((preset) => preset.id === selectedFastLogPresetId);
  const fastLogDeductions: UsageDeduction[] = fastLogDraftDeductions
    .map((deduction) => {
        const ingredient = ingredients.find((item) => item.id === deduction.ingredientId);
        const parsedQuantity = Number(deduction.quantity);
        return {
          ingredientId: deduction.ingredientId,
          quantity: parsedQuantity,
          previousQuantity: ingredient?.quantity ?? 0,
          newQuantity: (ingredient?.quantity ?? 0) - parsedQuantity,
        };
      })
    ;
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
  const lowStockItems = ingredients.filter((item) => item.quantity < item.minimumStock);
  const expiringBatches = ingredients.flatMap((item) =>
    item.batches.flatMap((batch) => {
      const expirationDateValue = parseInventoryDate(batch.expirationDate);
      if (!expirationDateValue) return [];
      const daysRemaining = daysBetweenDates(openingDate, expirationDateValue);
      return daysRemaining >= 0 && daysRemaining <= nearExpiryWindowDays
        ? [{ item, batch, daysRemaining }]
        : [];
    }),
  );
  const expiringItems = [...new Map(expiringBatches.map(({ item }) => [item.id, item])).values()];
  const inventoryAlerts: InventoryAlert[] = [
    ...lowStockItems.map((item) => ({
      id: `low-${item.id}`,
      kind: 'lowStock' as const,
      ingredientId: item.id,
      batch: item.batches[0] ?? null,
      title: item.name,
      detail: `Manila · Branch 1 · Current ${formatUnitQuantity(item.quantity, item.unit)} / Minimum ${formatUnitQuantity(item.minimumStock, item.unit)}`,
    })),
    ...expiringBatches.map(({ item, batch, daysRemaining }) => {
      const expiryText = daysRemaining === 0 ? 'today' : `in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}`;
      return {
        id: `expiry-${item.id}-${batch.reference}`,
        kind: 'expiration' as const,
        ingredientId: item.id,
        batch,
        title: item.name,
        detail: `Manila · Branch 1 · ${formatUnitQuantity(item.quantity, item.unit)} · Expires ${batch.expirationDate} (${expiryText})`,
      };
    }),
  ];
  const visibleNotifications = inventoryAlerts.filter((item) =>
    notificationPreferences[item.kind] &&
    (notificationFilter === 'all' || notificationFilter === item.kind),
  );
  const dashboardTerm = dashboardSearch.trim().toLowerCase();
  const dashboardCardWidth = Math.max(0, dashboardCarouselWidth - 12);
  const dashboardMatches = (item: Ingredient) =>
    `${item.name} ${item.category}`.toLowerCase().includes(dashboardTerm);

  const navigate = (nextRoute: StaffTab) => {
    setDailyCheckModal(null);
    setLogoutConfirmationVisible(false);
    setRoute(nextRoute);
    setDashboardMessage('');
  };

  const startDailyInventoryCheck = () => {
    const checkIngredients = ['flour', 'octopus', 'eggs', 'sauces'];
    const lines = checkIngredients.flatMap((id) => {
      const item = ingredients.find((ingredient) => ingredient.id === id);
      return item
        ? [{
            ingredientId: item.id,
            name: item.name,
            recordedQuantity: item.quantity,
            physicalQuantity: id === 'flour' ? '10' : String(item.quantity),
            unit: item.unit,
          }]
        : [];
    });
    setDailyCheckLines(lines);
    setDailyCheckRemarks('Recounted; bag short by 2 kg');
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

  const submitDailyInventoryCheck = () => {
    if (dailyCheckSubmissionLock.current || !validateDailyInventoryCheck()) return;
    dailyCheckSubmissionLock.current = true;
    const referenceNumber = dailyCheckRecords.length + 1;
    const checkDate = new Date(2026, 9, 25);
    const submittedAt = new Date(checkDate);
    submittedAt.setHours(10, 30, 0, 0);
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
    const hasDiscrepancies = lines.some((line) => line.difference !== 0);
    const check: DailyInventoryCheck = {
      reference: `IC-1025-${String(referenceNumber).padStart(3, '0')}`,
      checkDate,
      submittedAt,
      branch: 'Manila · Branch 1',
      staff: 'Isabel San Esteban',
      lines,
      remarks: dailyCheckRemarks.trim(),
      status: hasDiscrepancies ? 'pendingOwnerReview' : 'submitted',
    };
    setCurrentDailyCheck(check);
    setDailyCheckRecords((current) => [...current, check]);
    setDailyCheckModal(null);
    setRoute('dailyCheckSuccess');
  };

  const openForm = (
    formRoute: 'stockIn' | 'stockOut' | 'fastLog' | 'waste',
    source: StaffTab,
  ) => {
    setReturnRoute(source);
    setSelectedIngredientId(
      formRoute === 'stockIn' || formRoute === 'stockOut'
        ? 'octopus'
        : formRoute === 'waste'
          ? 'eggs'
          : '',
    );
    setIngredientListOpen(false);
    setQuantity(formRoute === 'stockIn' ? '5' : formRoute === 'stockOut' ? '1' : formRoute === 'waste' ? '6' : '');
    setUsageMode('manual');
    setBatchPresetOpen(false);
    setBatchCount('1');
    setTransactionDate(formRoute === 'stockIn' || formRoute === 'stockOut' || formRoute === 'waste' ? openingDate : new Date());
    setExpirationDate(formRoute === 'stockIn' ? openingExpirationDate : null);
    setReason(formRoute === 'waste' ? 'Waste / Other' : 'Cooking usage');
    setReasonListOpen(false);
    setNotes(
      formRoute === 'stockIn'
        ? 'Opening delivery'
        : formRoute === 'stockOut'
          ? 'Extra cooking preparation'
          : formRoute === 'waste'
            ? 'Cracked eggs discarded'
            : '',
    );
    setWasteDescription(formRoute === 'waste' ? 'Tray slipped during handling' : '');
    setWasteFieldErrors({});
    setWasteValidationAttempted(false);
    setSuccessMessage('');
    setFormError('');
    setQuantityError('');
    setCurrentReceipt(null);
    setCurrentWasteReceipt(null);
    setCurrentUsageReceipt(null);
    setConfirmationVisible(false);
    setRoute(formRoute);
  };

  const prepareFastLogPreset = (preset: FastLogPreset) => {
    setSelectedFastLogPresetId(preset.id);
    setFastLogDraftDeductions(
      preset.deductions.map((deduction) => ({
        ingredientId: deduction.ingredientId,
        quantity: String(deduction.quantity),
      })),
    );
    setFastLogReason(preset.reasonDetail);
    setFastLogNotes('');
    setFastLogPieces(preset.pieces ? String(preset.pieces) : '');
    setFastLogFieldErrors({});
    setFastLogIngredientPickerIndex(null);
    setTransactionDate(openingDate);
    setConfirmationVisible(false);
    setConfirming(false);
    setFormError('');
  };

  const selectFastLogPreset = (preset: FastLogPreset) => {
    prepareFastLogPreset(preset);
    setRoute('fastLogReview');
  };

  const openFastLogPopup = () => {
    setSelectedFastLogPresetId('');
    setFastLogDraftDeductions([]);
    setFastLogReason('');
    setFastLogNotes('');
    setFastLogFieldErrors({});
    setFormError('');
    setFastLogPopupVisible(true);
  };

  const closeFastLogPopup = () => {
    if (confirming) return;
    setFastLogPopupVisible(false);
    setSelectedFastLogPresetId('');
    setFastLogDraftDeductions([]);
    setFastLogReason('');
    setFastLogNotes('');
    setFastLogFieldErrors({});
    setFormError('');
  };

  const validateFastLogDraft = () => {
    const errors: Record<string, string> = {};
    if (!selectedFastLogPreset || !fastLogReason.trim()) {
      errors.reason = 'Enter a reason or description.';
    }
    if (selectedFastLogPreset?.section === 'cooking') {
      const pieces = Number(fastLogPieces);
      if (!fastLogPieces.trim() || !Number.isFinite(pieces) || pieces <= 0) {
        errors.pieces = 'Enter a batch size greater than 0.';
      }
    }
    fastLogDraftDeductions.forEach((deduction, index) => {
      const key = `${deduction.ingredientId}-${index}`;
      const parsedQuantity = Number(deduction.quantity);
      const ingredient = ingredients.find((item) => item.id === deduction.ingredientId);
      if (!deduction.quantity.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
        errors[key] = 'Enter a quantity greater than 0.';
      } else if (ingredient && parsedQuantity > ingredient.quantity) {
        errors[key] = `Only ${formatUnitQuantity(ingredient.quantity, ingredient.unit)} available.`;
      }
    });
    setFastLogFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const updateFastLogDeduction = (
    index: number,
    property: 'ingredientId' | 'quantity',
    value: string,
  ) => {
    setFastLogDraftDeductions((current) =>
      current.map((deduction, itemIndex) =>
        itemIndex === index ? { ...deduction, [property]: value } : deduction,
      ),
    );
    setFastLogFieldErrors((current) => {
      const next = { ...current };
      const existing = fastLogDraftDeductions[index];
      if (existing) delete next[`${existing.ingredientId}-${index}`];
      return next;
    });
    setFormError('');
  };

  const returnToFastLogList = () => {
    setConfirmationVisible(false);
    setConfirming(false);
    setRoute('fastLog');
  };

  const returnFromForm = () => {
    setIngredientListOpen(false);
    setConfirmationVisible(false);
    setRoute(returnRoute);
    setSuccessMessage('');
    setFormError('');
  };

  const changeQuantity = (value: string) => {
    setQuantity(value);
    setFormError('');
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

  const validateWasteForm = () => {
    const errors: Record<string, string> = {};
    const parsedQuantity = Number(quantity);

    if (!selectedIngredient) {
      errors.item = 'Choose an item to continue.';
    }
    if (!quantity.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      errors.quantity = 'Enter a quantity greater than 0.';
    } else if (selectedIngredient && !isValidDailyQuantity(quantity, selectedIngredient.unit)) {
      errors.quantity = selectedIngredient.unit === 'pcs'
        ? 'Enter a whole number of pieces.'
        : 'Enter a quantity with up to 2 decimal places.';
    } else if (selectedIngredient && parsedQuantity > selectedIngredient.quantity) {
      errors.quantity = `Only ${formatUnitQuantity(selectedIngredient.quantity, selectedIngredient.unit)} available.`;
    }
    if (!transactionDate) {
      errors.date = 'Choose a transaction date.';
    }
    if (reason === 'Waste / Other' && !wasteDescription.trim()) {
      errors.description = 'Describe the cause when Other is selected.';
    }

    setWasteValidationAttempted(true);
    setWasteFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const updateWasteDescription = (value: string) => {
    setWasteDescription(value);
    if (wasteValidationAttempted && value.trim()) {
      setWasteFieldErrors((current) => ({ ...current, description: '' }));
    }
  };

  const validateTransaction = () => {
    setSuccessMessage('');
    setFormError('');
    if (route === 'stockOut' && usageMode === 'cookingBatch') {
      if (!Number.isFinite(parsedBatchCount) || parsedBatchCount <= 0) {
        setFormError('Enter a batch count greater than 0.');
        return false;
      }
      if (!transactionDate) {
        setFormError('Choose a transaction date.');
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
    if (route === 'stockIn' && selectedIngredient.category !== 'Dry Goods' && !expirationDate) {
      setFormError('Choose an expiration date for this perishable ingredient.');
      return false;
    }
    if (route === 'stockOut' && parsedQuantity > selectedIngredient.quantity) {
      setQuantityError('Quantity used exceeds the available stock.');
      return false;
    }
    if ((route === 'fastLog' || route === 'waste') && parsedQuantity > selectedIngredient.quantity) {
      setFormError(`Only ${selectedIngredient.quantity} ${selectedIngredient.unit} available. Enter a smaller quantity.`);
      return false;
    }
    return true;
  };

  const reviewTransaction = () => {
    if (route === 'waste') {
      if (!validateWasteForm()) return;
      setConfirmationVisible(true);
      return;
    }
    if (route === 'fastLogReview') {
      if (!validateFastLogDraft()) return;
      setRoute('fastLogPreview');
      return;
    }
    if (!validateTransaction()) return;
    if (route === 'stockOut') {
      setConfirmationVisible(false);
      setRoute('usagePreview');
      return;
    }
    setConfirmationVisible(true);
  };

  const confirmTransaction = () => {
    if (confirming || !transactionDate) return;
    if (route === 'fastLogPreview' || fastLogPopupVisible) {
      if (fastLogSubmissionLock.current) return;
      if (
        !selectedFastLogPreset ||
        fastLogDeductions.length === 0 ||
        fastLogDeductions.some((deduction) =>
          !Number.isFinite(deduction.quantity) ||
          deduction.quantity <= 0 ||
          deduction.quantity > deduction.previousQuantity,
        ) ||
        !fastLogReason.trim()
      ) {
        setFormError('The edited preset is invalid or exceeds available stock.');
        return;
      }

      fastLogSubmissionLock.current = true;
      setConfirming(true);
      setTimeout(() => {
        const receiptDate = transactionDate;
        const deductions = fastLogDeductions.map((deduction) => ({ ...deduction }));
        const referenceNumber = fastLogReceipts.length + 1;
        const datePart = `${String(receiptDate.getMonth() + 1).padStart(2, '0')}${String(receiptDate.getDate()).padStart(2, '0')}`;
        const receipt: FastLogReceipt = {
          reference: `FL-${datePart}-${String(referenceNumber).padStart(3, '0')}`,
          preset: selectedFastLogPreset,
          deductions,
          transactionDate: receiptDate,
          reason: fastLogReason,
          notes: fastLogNotes,
          pieces: selectedFastLogPreset.pieces ? Number(fastLogPieces) : null,
        };
        setIngredients((current) =>
          current.map((item) => {
            const deduction = deductions.find((entry) => entry.ingredientId === item.id);
            if (!deduction) return item;
            return {
              ...item,
              quantity: Number(deduction.newQuantity.toFixed(2)),
              lowStock: deduction.newQuantity < item.threshold,
              lastUpdated: formatUsageDate(receiptDate),
            };
          }),
        );
        setFastLogReceipts((current) => [...current, receipt]);
        setCurrentFastLogReceipt(receipt);
        setConfirmationVisible(false);
        setConfirming(false);
        fastLogSubmissionLock.current = false;
        if (fastLogPopupVisible) {
          setFastLogPopupVisible(false);
          setSelectedFastLogPresetId('');
          setFastLogDraftDeductions([]);
          setFastLogReason('');
          setFastLogNotes('');
          setFastLogFieldErrors({});
          setDashboardMessage(`${selectedFastLogPreset.name} recorded successfully. Inventory updated locally.`);
        } else {
          setRoute('fastLogSuccess');
        }
      }, 250);
      return;
    }

    if (route === 'waste') {
      if (wasteSubmissionLock.current) return;
      if (!validateWasteForm() || !selectedIngredient || !transactionDate) return;
      const wasteReason = wasteReasons.find((option) => option === reason);
      if (!wasteReason) {
        setWasteFieldErrors((current) => ({ ...current, reason: 'Choose a waste reason.' }));
        return;
      }

      wasteSubmissionLock.current = true;
      setConfirming(true);
      setTimeout(() => {
        const wasteQuantity = Number(quantity);
        const receiptDate = transactionDate;
        const previousQuantity = selectedIngredient.quantity;
        const newQuantity = Number((previousQuantity - wasteQuantity).toFixed(2));
        const datePart = `${String(receiptDate.getMonth() + 1).padStart(2, '0')}${String(receiptDate.getDate()).padStart(2, '0')}`;
        const sameDateCount = wasteReceipts.filter((entry) =>
          entry.transactionDate.getFullYear() === receiptDate.getFullYear() &&
          entry.transactionDate.getMonth() === receiptDate.getMonth() &&
          entry.transactionDate.getDate() === receiptDate.getDate(),
        ).length;
        const historicalSampleOffset =
          receiptDate.getFullYear() === 2026 &&
          receiptDate.getMonth() === 9 &&
          receiptDate.getDate() === 25
            ? 2
            : 1;
        const receipt: WasteReceipt = {
          reference: `WS-${datePart}-${String(sameDateCount + historicalSampleOffset).padStart(3, '0')}`,
          ingredientId: selectedIngredient.id,
          quantity: wasteQuantity,
          previousQuantity,
          newQuantity,
          transactionDate: receiptDate,
          reason: wasteReason,
          description: wasteDescription.trim(),
          notes: notes.trim(),
        };
        setIngredients((current) =>
          current.map((item) => item.id === selectedIngredient.id
            ? {
                ...item,
                quantity: newQuantity,
                lowStock: newQuantity < item.threshold,
                lastUpdated: formatWasteDate(receiptDate),
              }
            : item),
        );
        setWasteReceipts((current) => [...current, receipt]);
        setCurrentWasteReceipt(receipt);
        setConfirmationVisible(false);
        setConfirming(false);
        wasteSubmissionLock.current = false;
        setRoute('wasteSuccess');
      }, 250);
      return;
    }

    if (route === 'usagePreview') {
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
      setTimeout(() => {
        const receiptDate = transactionDate;
        const deductions = usageDeductions.map((deduction) => ({ ...deduction }));
        const referenceNumber = usageReceipts.length + 3;
        const datePart = `${String(receiptDate.getMonth() + 1).padStart(2, '0')}${String(receiptDate.getDate()).padStart(2, '0')}`;
        const receipt: UsageReceipt = {
          reference: `US-${datePart}-${String(referenceNumber).padStart(3, '0')}`,
          deductions,
          transactionDate: receiptDate,
          reason,
          notes,
          mode: usageMode,
          batchPreset: usageMode === 'cookingBatch' ? batchPreset : null,
          batchCount: usageMode === 'cookingBatch' ? parsedBatchCount : 1,
        };
        setIngredients((current) =>
          current.map((item) => {
            const deduction = deductions.find((entry) => entry.ingredientId === item.id);
            if (!deduction) return item;
            return {
              ...item,
              quantity: Number(deduction.newQuantity.toFixed(2)),
              lowStock: deduction.newQuantity < item.threshold,
              lastUpdated: formatUsageDate(receiptDate),
            };
          }),
        );
        setUsageReceipts((current) => [...current, receipt]);
        setCurrentUsageReceipt(receipt);
        setConfirmationVisible(false);
        setConfirming(false);
        setRoute('stockOutSuccess');
      }, 250);
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
    setTimeout(() => {
      const currentRoute = route;
      const stockInReference = transactionDate
        ? formatStockInReference(transactionDate, stockReceipts.length + 1)
        : '';
      const newQuantity = currentRoute === 'stockIn'
        ? selectedIngredient.quantity + parsedQuantity
        : selectedIngredient.quantity - parsedQuantity;
      const nextIngredients = ingredients.map((item) => {
        if (item.id !== selectedIngredient.id) return item;
        return {
          ...item,
          quantity: Number(newQuantity.toFixed(2)),
          lowStock: newQuantity < item.threshold,
          expiration:
            currentRoute === 'stockIn' && expirationDate
              ? formatDate(expirationDate)
              : item.expiration,
          nearExpiry: currentRoute === 'stockIn' && expirationDate ? true : item.nearExpiry,
          receivedBatch: currentRoute === 'stockIn' && transactionDate
            ? `${stockInReference} · ${formatDate(transactionDate)}`
            : item.receivedBatch,
          batchReference: currentRoute === 'stockIn'
            ? stockInReference
            : item.batchReference,
          batches: currentRoute === 'stockIn' && transactionDate
            ? [
                ...item.batches,
                {
                  reference: stockInReference,
                  receivedDate: formatDate(transactionDate),
                  expirationDate: expirationDate ? formatDate(expirationDate) : null,
                },
              ]
            : item.batches,
        };
      });
      setIngredients(nextIngredients);
      setConfirmationVisible(false);
      setConfirming(false);
      setQuantityError('');

      if (currentRoute === 'stockIn') {
        const receiptNumber = stockReceipts.length + 2;
        const receipt: StockReceipt = {
          reference: stockInReference || `SI-0000-${String(receiptNumber).padStart(3, '0')}`,
          ingredientId: selectedIngredient.id,
          quantity: parsedQuantity,
          previousQuantity: selectedIngredient.quantity,
          newQuantity,
          transactionDate,
          expirationDate,
          notes,
        };
        setCurrentReceipt(receipt);
        setStockReceipts((current) => [...current, receipt]);
        setRoute('stockInSuccess');
        return;
      }

      setSuccessMessage(
        `${parsedQuantity} ${selectedIngredient.unit} of ${selectedIngredient.name} recorded successfully as a local mock transaction.`,
      );
    }, 250);
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
    >
      <View style={styles.dashboardHeader}>
        <View style={styles.profileAvatar}>
          <View style={styles.profileHead} />
          <View style={styles.profileBody} />
        </View>
        <View style={styles.greetingCopy}>
          <Text style={styles.greeting}>Hello, Staff!</Text>
          <Text style={styles.branchName}>Manila Branch</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => navigate('notifications')}
          style={styles.notificationButton}
        >
          <View style={styles.bellIcon}>
            <View style={styles.bellBody} />
            <View style={styles.bellBase} />
            <View style={styles.bellClapper} />
          </View>
          <View style={styles.notificationDot} />
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
            <Text style={styles.summaryTotal}>{ingredients.length.toString().padStart(2, '0')}</Text>
            <Text style={styles.summaryItems}>items tracked</Text>
          </View>
          <Text style={styles.summaryAlerts}>{lowStockItems.length + expiringItems.length} stock alerts need attention</Text>
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
          { title: 'Waste', icon: '×', onPress: () => { openForm('stockOut', 'dashboard'); setReason('Spoilage'); } },
          {
            title: 'Daily Check',
            icon: '✓',
            onPress: () => setDashboardMessage('Daily Check is ready for this demo branch. No inventory will be changed.'),
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start Rush-Hour Fast-Log"
        onPress={openFastLogPopup}
        style={({ pressed }) => [styles.dashboardFastLogCard, pressed && styles.pressed]}
      >
        <View style={styles.dashboardFastLogIcon}>
          <Text style={styles.dashboardFastLogIconText}>⚡</Text>
        </View>
        <View style={styles.dashboardFastLogCopy}>
          <Text style={styles.dashboardFastLogTitle}>Rush-Hour Fast-Log</Text>
          <Text style={styles.dashboardFastLogSubtitle}>
            Record usage or waste quickly during busy hours.
          </Text>
        </View>
        <View style={styles.dashboardFastLogAction}>
          <Text style={styles.dashboardFastLogActionText}>Start fast-log</Text>
          <Text style={styles.dashboardFastLogChevron}>›</Text>
        </View>
      </Pressable>

      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>Low-Stock Items</Text>
      </View>
      <ScrollView
        style={styles.dashboardCarousel}
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalCards}
        onLayout={(event) => setDashboardCarouselWidth(event.nativeEvent.layout.width)}
      >
        {lowStockItems.filter(dashboardMatches).map((item) => (
          <IngredientCard
            key={`low-${item.id}`}
            item={item}
            compact
            cardWidth={dashboardCardWidth}
            onPress={() => openForm('stockOut', 'dashboard')}
          />
        ))}
        {lowStockItems.filter(dashboardMatches).length === 0 && (
          <Text style={styles.emptyState}>No low-stock items match your search.</Text>
        )}
      </ScrollView>

      <View style={[styles.sectionHeadingRow, styles.expirationHeading]}>
        <Text style={styles.sectionTitle}>Nearing Expiration</Text>
        <Text style={styles.sectionHint}>{expiringItems.length} items</Text>
      </View>
      <ScrollView
        style={styles.dashboardCarousel}
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalCards}
        onLayout={(event) => setDashboardCarouselWidth(event.nativeEvent.layout.width)}
      >
        {expiringItems.filter(dashboardMatches).map((item) => (
          <IngredientCard
            key={`expiry-${item.id}`}
            item={item}
            compact
            cardWidth={dashboardCardWidth}
            statusOverride={{ label: 'Expiring soon', tone: 'warning' }}
            onPress={() => openForm('stockOut', 'dashboard')}
          />
        ))}
        {expiringItems.filter(dashboardMatches).length === 0 && (
          <Text style={styles.emptyState}>No items nearing expiration match your search.</Text>
        )}
      </ScrollView>
      <Text style={styles.demoNote}>DEMO PREVIEW · Sample inventory only, not connected to a live store.</Text>
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
          <Text style={styles.pageSubtitle}>Manila · Branch 1 / Staff</Text>
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
            {visibleIngredients.length} {visibleIngredients.length === 1 ? 'ingredient' : 'ingredients'} · Manila · Branch 1
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
          <Text style={styles.demoNote}>DEMO PREVIEW · Sample inventory only, not connected to a live store.</Text>
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
            accessibilityLabel={ingredientDetailReturnRoute === 'notifications' ? 'Back to Notifications' : 'Back to inventory'}
            onPress={() => setRoute(ingredientDetailReturnRoute)}
            style={styles.detailBackButton}
          >
            <Text style={styles.detailBackArrow}>‹</Text>
          </Pressable>
          <View style={styles.detailHeaderCopy}>
            <Text style={styles.detailPageTitle}>Ingredient details</Text>
            <Text style={styles.pageSubtitle}>Manila · Branch 1 / Staff</Text>
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
          <DetailRow label="Branch" value="Manila · Branch 1" />
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
        <Text style={styles.detailDemoNote}>DEMO PREVIEW · Sample data, not a live inventory record.</Text>
      </ScrollView>
    );
  };

  const renderInventoryHistory = () => (
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
          <Text style={styles.pageSubtitle}>{selectedIngredient?.name ?? 'Ingredient'} · Manila · Branch 1</Text>
        </View>
      </View>
      <Text style={styles.historyPlaceholderText}>Sample activity</Text>
      <View style={styles.historyActivityCard}>
        <View style={styles.historyActivityMarker}><Text style={styles.historyActivityGlyph}>+</Text></View>
        <View style={styles.historyActivityCopy}>
          <Text style={styles.historyActivityTitle}>Stock-In received</Text>
          <Text style={styles.historyActivityDetail}>
            {selectedIngredient?.receivedBatch ?? 'Sample batch'} · {selectedIngredient?.lastUpdated ?? '25 Oct 2026'}
          </Text>
        </View>
        <Text style={styles.historyActivityAmount}>+{selectedIngredient?.quantity ?? 0} {selectedIngredient?.unit ?? ''}</Text>
      </View>
      <Text style={styles.detailDemoNote}>DEMO PREVIEW · This sample history is not connected to live transactions.</Text>
    </ScrollView>
  );

  const renderStocks = () => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
    >
      {renderTopHeader('Stocks', 'Manila · Branch 1 / Staff')}
      <View style={styles.stocksSummaryCard}>
        <Text style={styles.stocksSummaryTitle}>Every movement, accounted for.</Text>
        <Text style={styles.stocksSummarySubtitle}>Record stock for Manila Branch 1 only.</Text>
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
          title="Rush-Hour Fast-Log"
          description="Cooking waste and spoilage presets"
          icon="⚡"
          onPress={() => openForm('fastLog', 'stocks')}
        />
        <ActionCard
          title="Waste / Spoilage"
          description="Record lost or unusable ingredients"
          icon="⌫"
          onPress={() => openForm('waste', 'stocks')}
        />
      </View>
      <View style={styles.stockTip}>
        <Text style={styles.stockTipIcon}>i</Text>
        <Text style={styles.stockTipText}>
          Check available stock before confirming a deduction. Master ingredients are managed by the owner.
        </Text>
      </View>
    </ScrollView>
  );

  const renderNotificationAlertDetails = () => {
    const item = ingredients.find((ingredient) => ingredient.id === selectedAlertIngredientId);
    if (!item) {
      return (
        <View style={styles.inventoryFallback}>
          <Text style={styles.inventoryEmptyTitle}>Alert item not found</Text>
          <Pressable onPress={() => setRoute('notifications')} style={styles.detailBackFallback}>
            <Text style={styles.detailBackLabel}>Back to Notifications</Text>
          </Pressable>
        </View>
      );
    }

    const isLowStock = selectedAlertKind === 'lowStock';
    const batch = item.batches.find((candidate) => candidate.reference === selectedAlertBatchReference) ?? item.batches[0] ?? null;
    const expirationDateValue = parseInventoryDate(batch?.expirationDate ?? null);
    const daysRemaining = expirationDateValue ? daysBetweenDates(openingDate, expirationDateValue) : null;
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
            accessibilityLabel="Back to Notifications"
            onPress={() => setRoute('notifications')}
            style={styles.backButton}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Alert item details</Text>
            <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
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
            <Text style={styles.alertDetailSubtext}>Manila · Branch 1 · {item.category}</Text>
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
                <DetailRow label="As of" value={formatDate(openingDate)} />
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
                  openForm('stockIn', 'notifications');
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
                  setIngredientDetailReturnRoute('notifications');
                  setRoute('ingredientDetails');
                }}
                style={({ pressed }) => [styles.alertDetailPrimary, pressed && styles.pressed]}
              >
                <Text style={styles.alertDetailPrimaryText}>View ingredient inventory</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => setRoute('notifications')}
              style={({ pressed }) => [styles.alertDetailSecondary, pressed && styles.pressed]}
            >
              <Text style={styles.alertDetailSecondaryText}>Back to Notifications</Text>
            </Pressable>
          </View>
        </ScrollView>
      </>
    );
  };

  const renderNotifications = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.notificationPageContent} showsVerticalScrollIndicator={false}>
      {renderTopHeader('Notifications', 'Manila · Branch 1 / Staff')}
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.alertFilterScroll}
        contentContainerStyle={styles.alertFilterRow}
      >
        {([
          { key: 'all', label: 'All alerts' },
          { key: 'lowStock', label: 'Low stock' },
          { key: 'expiration', label: 'Near expiry' },
        ] as const).map((filter) => {
          const selected = notificationFilter === filter.key;
          return (
            <Pressable
              key={filter.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setNotificationFilter(filter.key)}
              style={[styles.alertFilterChip, selected && styles.alertFilterChipSelected]}
            >
              <Text style={[styles.alertFilterChipText, selected && styles.alertFilterChipTextSelected]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.alertMetadata}>
        {visibleNotifications.length} {visibleNotifications.length === 1 ? 'alert' : 'alerts'} · Your assigned branch only · {formatDate(openingDate)}
      </Text>
      {visibleNotifications.length > 0 ? (
        <View style={styles.notificationList}>
          {visibleNotifications.map((alert) => {
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
                  setRoute('notificationAlertDetails');
                }}
                style={({ pressed }) => [
                  styles.inventoryAlertCard,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.inventoryAlertTopline}>
                  <Text style={styles.inventoryAlertName}>{alert.title}</Text>
                  <View style={[styles.inventoryAlertBadge, !isLowStock && styles.inventoryExpiryBadge]}>
                    <Text style={styles.inventoryAlertBadgeIcon}>{isLowStock ? '!' : '▦'}</Text>
                    <Text style={styles.inventoryAlertBadgeText}>{isLowStock ? 'Low Stock' : 'Near Expiry'}</Text>
                  </View>
                </View>
                <Text style={styles.inventoryAlertDetail}>{alert.detail}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.alertEmptyCard}>
          <Text style={styles.alertEmptyTitle}>No alerts to show</Text>
          <Text style={styles.alertEmptyText}>
            {inventoryAlerts.length === 0
              ? 'There are no current stock or near-expiry alerts for Manila · Branch 1.'
              : 'No alerts match this filter. Choose another alert type to see current items.'}
          </Text>
        </View>
      )}
      <View style={styles.alertListInfoBanner}>
        <Text style={styles.alertDetailInfoIcon}>i</Text>
        <Text style={styles.alertDetailInfoText}>
          Stock and expiry alerts show Manila · Branch 1 records only. Tap an item to review its threshold or batch dates.
        </Text>
      </View>
    </ScrollView>
  );

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
            <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.dailyCheckContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.dailyCheckIntro}>25 Oct 2026 · Enter today's physical quantities.</Text>
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
            Local mock check · Physical counts are audit observations and never adjust stock.
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
    const time = check.submittedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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
            <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
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

  const confirmLogout = () => {
    if (logoutSubmissionLock.current) return;
    logoutSubmissionLock.current = true;
    setLogoutPending(true);
    setLogoutError('');
    try {
      onLogout();
    } catch (error) {
      logoutSubmissionLock.current = false;
      setLogoutPending(false);
      setLogoutError(error instanceof Error ? error.message : 'Unable to log out. Please try again.');
    }
  };

  const renderMore = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.morePageContent} showsVerticalScrollIndicator={false}>
      {renderTopHeader('More', 'Manila · Branch 1 / Staff')}
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
            icon: '↗',
            title: 'Rush-Hour Fast-Log',
            description: 'Common cooking and waste presets',
            onPress: () => setRoute('fastLog'),
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
    const appNotificationsEnabled = notificationPreferences.lowStock && notificationPreferences.expiration;
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
            <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
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
              <Text style={styles.profileSectionTitle}>App notifications</Text>
              <Text style={styles.profileSettingsValue}>
                {appNotificationsEnabled ? 'Enabled for stock and expiry (in-app)' : 'Some in-app alerts are off'}
              </Text>
            </View>
            <View style={styles.profilePreferenceRow}>
              <Text style={styles.profilePreferenceLabel}>Low-stock alerts</Text>
              <Switch
                accessibilityLabel="Low-stock alerts"
                value={notificationPreferences.lowStock}
                onValueChange={(value) =>
                  setNotificationPreferences((current) => ({ ...current, lowStock: value }))
                }
                trackColor={{ false: '#D8D8DE', true: '#F6A2BC' }}
                thumbColor={notificationPreferences.lowStock ? colors.pink : '#FFFFFF'}
              />
            </View>
            <View style={styles.profilePreferenceRow}>
              <Text style={styles.profilePreferenceLabel}>Expiry alerts</Text>
              <Switch
                accessibilityLabel="Expiry alerts"
                value={notificationPreferences.expiration}
                onValueChange={(value) =>
                  setNotificationPreferences((current) => ({ ...current, expiration: value }))
                }
                trackColor={{ false: '#D8D8DE', true: '#F6A2BC' }}
                thumbColor={notificationPreferences.expiration ? colors.pink : '#FFFFFF'}
              />
            </View>
            <Text style={styles.profileNotificationNote}>These preferences control in-app alert visibility only; push notifications are not configured.</Text>
          </View>

          <View style={styles.profileVersionRow}>
            <Text style={styles.profileSectionTitle}>App version</Text>
            <Text style={styles.profileSettingsValue}>TakoSync · {appVersion}</Text>
          </View>

          <View style={styles.themeSection}>
            <Text style={styles.profileSectionTitle}>Theme toggle</Text>
            <View style={styles.themeSegmentedControl}>
              <View style={[styles.themeOption, styles.themeOptionSelected]}>
                <Text style={[styles.themeOptionIcon, styles.themeOptionIconSelected]}>☼</Text>
                <Text style={[styles.themeOptionText, styles.themeOptionTextSelected]}>Light</Text>
              </View>
              <View style={[styles.themeOption, styles.themeOptionDisabled]}>
                <Text style={styles.themeOptionIcon}>☾</Text>
                <Text style={styles.themeOptionText}>Dark</Text>
              </View>
            </View>
            <Text style={styles.themeLimitation}>Dark theme is not supported in this light-only app.</Text>
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
        style={styles.selectInput}
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
      {ingredientListOpen && (
        <View style={styles.dropdown}>
          {ingredients.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                setSelectedIngredientId(item.id);
                setIngredientListOpen(false);
                setFormError('');
                setQuantityError('');
              }}
              style={styles.dropdownOption}
            >
              <IngredientThumbnail item={item} />
              <View style={styles.dropdownCopy}>
                <Text style={styles.dropdownName}>{item.name}</Text>
                <Text style={styles.dropdownQuantity}>{item.quantity} {item.unit} available</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  const renderStockInForm = () => (
    <>
      <View style={styles.formHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={returnFromForm} style={styles.backButton}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.formHeaderCopy}>
          <Text style={styles.formTitle}>Stock-In</Text>
          <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.compactFormContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.receiptInfoBanner}>
          <Text style={styles.receiptInfoIcon}>i</Text>
          <Text style={styles.receiptInfoText}>
            Receipt example · 25 Oct 2026, 08:00 AM. Opening Octopus balance: 0 kg.
          </Text>
        </View>
        {formError !== '' && <Text style={styles.formError} accessibilityRole="alert">{formError}</Text>}
        {renderIngredientSelector()}
        <TextField
          label="Quantity received *"
          value={quantity}
          onChangeText={changeQuantity}
          placeholder="Enter quantity"
          keyboardType="decimal-pad"
          error={quantityError}
          suffix={selectedIngredient?.unit}
        />
        <DatePickerField
          label="Transaction date *"
          value={transactionDate}
          onChange={(date) => { setTransactionDate(date); setFormError(''); }}
        />
        <DatePickerField
          label="Expiration date"
          value={expirationDate}
          onChange={setExpirationDate}
        />
        <Text style={styles.helperText}>Required for perishable ingredients. Track by received batch.</Text>
        <TextField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Add receipt notes"
        />
        <View style={styles.formButtons}>
          <Pressable accessibilityRole="button" onPress={reviewTransaction} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
            <Text style={styles.saveButtonText}>Review Stock-In</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={returnFromForm} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
        <Text style={styles.formDemoNote}>Local demo only · This example does not create a live stock record.</Text>
      </ScrollView>
    </>
  );

  const renderWasteForm = () => (
    <>
      <View style={styles.formHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Stocks"
          onPress={returnFromForm}
          style={styles.backButton}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.formHeaderCopy}>
          <Text style={styles.formTitle}>Waste / Spoilage</Text>
          <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.compactFormContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Item *</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Item, ${selectedIngredient ? `${selectedIngredient.name} · ${formatUnitQuantity(selectedIngredient.quantity, selectedIngredient.unit)} before this event` : 'choose an item'}`}
            onPress={() => setIngredientListOpen((open) => !open)}
            style={[styles.selectInput, wasteFieldErrors.item ? styles.textInputError : undefined]}
          >
            <Text style={styles.selectText} numberOfLines={1}>
              {selectedIngredient
                ? `${selectedIngredient.name} · ${formatUnitQuantity(selectedIngredient.quantity, selectedIngredient.unit)} before this event`
                : 'Select an item'}
            </Text>
            <Text style={styles.selectChevron}>{ingredientListOpen ? '⌃' : '⌄'}</Text>
          </Pressable>
          {wasteFieldErrors.item ? <Text style={styles.fieldError}>{wasteFieldErrors.item}</Text> : null}
          {ingredientListOpen ? (
            <View style={styles.reasonDropdown}>
              {ingredients.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.id === selectedIngredientId }}
                  onPress={() => {
                    setSelectedIngredientId(item.id);
                    setIngredientListOpen(false);
                    setWasteFieldErrors((current) => ({ ...current, item: '' }));
                  }}
                  style={styles.reasonOption}
                >
                  <Text style={[styles.reasonOptionText, item.id === selectedIngredientId && styles.reasonOptionSelected]}>
                    {item.name} · {formatUnitQuantity(item.quantity, item.unit)} before this event
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <TextField
          label="Quantity wasted *"
          value={quantity}
          onChangeText={(value) => {
            changeQuantity(value);
            if (wasteValidationAttempted) {
              const parsed = Number(value);
              const error = !value.trim() || !Number.isFinite(parsed) || parsed <= 0
                ? 'Enter a quantity greater than 0.'
                : selectedIngredient && !isValidDailyQuantity(value, selectedIngredient.unit)
                  ? selectedIngredient.unit === 'pcs'
                    ? 'Enter a whole number of pieces.'
                    : 'Enter a quantity with up to 2 decimal places.'
                : selectedIngredient && parsed > selectedIngredient.quantity
                  ? `Only ${formatUnitQuantity(selectedIngredient.quantity, selectedIngredient.unit)} available.`
                  : '';
              setWasteFieldErrors((current) => ({ ...current, quantity: error }));
            }
          }}
          placeholder="Enter quantity"
          keyboardType="decimal-pad"
          error={wasteFieldErrors.quantity}
          suffix={selectedIngredient?.unit}
        />

        <View>
          <DatePickerField
            label="Transaction date *"
            value={transactionDate}
            onChange={(date) => {
              setTransactionDate(date);
              setWasteFieldErrors((current) => ({ ...current, date: '' }));
            }}
          />
          {wasteFieldErrors.date ? <Text style={styles.fieldError}>{wasteFieldErrors.date}</Text> : null}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Type / Reason *</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setReasonListOpen((open) => !open)}
            style={[styles.selectInput, wasteFieldErrors.reason ? styles.textInputError : undefined]}
          >
            <Text style={styles.selectText}>{reason}</Text>
            <Text style={styles.selectChevron}>{reasonListOpen ? '⌃' : '⌄'}</Text>
          </Pressable>
          {reasonListOpen ? (
            <View style={styles.reasonDropdown}>
              {wasteReasons.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: reason === option }}
                  onPress={() => {
                    setReason(option);
                    setReasonListOpen(false);
                    setWasteFieldErrors((current) => ({ ...current, reason: '', description: '' }));
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
          {wasteFieldErrors.reason ? <Text style={styles.fieldError}>{wasteFieldErrors.reason}</Text> : null}
        </View>

        <TextField
          label="Other description *"
          value={wasteDescription}
          onChangeText={updateWasteDescription}
          placeholder="Describe the cause"
          error={wasteFieldErrors.description}
        />
        <TextField
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Add notes"
          multiline
        />

        <View style={styles.formButtons}>
          <Pressable
            accessibilityRole="button"
            disabled={confirming}
            onPress={reviewTransaction}
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
          >
            <Text style={styles.saveButtonText}>Review waste</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={confirming}
            onPress={returnFromForm}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );

  const renderMovementForm = () => {
    const formTitle = route === 'fastLog'
      ? 'Rush-Hour Fast-Log'
      : route === 'waste'
        ? 'Waste / Spoilage'
        : 'Stock-Out / Usage';
    const quantityLabel = route === 'waste' ? 'Quantity lost *' : 'Quantity used *';
    const reasonLabel = route === 'fastLog' ? 'Preset *' : 'Reason *';
    const reasonOptions = route === 'waste'
      ? ['Spoilage', 'Expired', 'Other']
      : ['Cooking usage', 'Spoilage', 'Other'];

    return (
    <>
      <View style={styles.formHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={returnFromForm} style={styles.backButton}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.formHeaderCopy}>
          <Text style={styles.formTitle}>{formTitle}</Text>
          <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
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
        {formError !== '' && <Text style={styles.formError} accessibilityRole="alert">{formError}</Text>}
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
            <TextField
              label={quantityLabel}
              value={quantity}
              onChangeText={changeQuantity}
              placeholder="Enter quantity"
              keyboardType="decimal-pad"
              error={route === 'stockOut' ? quantityError : undefined}
              suffix={route === 'stockOut' ? selectedIngredient?.unit : undefined}
            />
          </>
        )}
        <DatePickerField
          label="Transaction date *"
          value={transactionDate}
          onChange={(date) => { setTransactionDate(date); setFormError(''); }}
        />
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{reasonLabel}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setReasonListOpen((open) => !open)}
            style={styles.selectInput}
          >
            <Text style={styles.selectText}>{reason}</Text>
            <Text style={styles.selectChevron}>{reasonListOpen ? '⌃' : '⌄'}</Text>
          </Pressable>
          {reasonListOpen && (
            <View style={styles.reasonDropdown}>
              {reasonOptions.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => { setReason(option); setReasonListOpen(false); }}
                  style={styles.reasonOption}
                >
                  <Text style={[styles.reasonOptionText, reason === option && styles.reasonOptionSelected]}>{option}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Add a note" multiline />
        <View style={styles.formButtons}>
          <Pressable accessibilityRole="button" onPress={reviewTransaction} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
            <Text style={styles.saveButtonText}>
              {route === 'stockOut'
                ? 'Preview transaction'
                : route === 'fastLog'
                  ? 'Review Fast-Log'
                  : 'Review Waste'}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={returnFromForm} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
        <Text style={styles.formDemoNote}>Local demo only · No live stock record will be created.</Text>
      </ScrollView>
    </>
    );
  };

  const renderFastLogList = () => {
    const renderPresetCard = (preset: FastLogPreset) => (
      <Pressable
        key={preset.id}
        accessibilityRole="button"
        accessibilityLabel={`Review ${preset.name}`}
        onPress={() => selectFastLogPreset(preset)}
        style={({ pressed }) => [styles.fastLogPresetCard, pressed && styles.pressed]}
      >
        <Text style={styles.fastLogPresetTitle}>
          {preset.name}{preset.pieces ? ` · ${preset.pieces} pieces` : ''}
        </Text>
        {preset.section === 'cooking' ? (
          <View style={styles.fastLogPresetIngredients}>
            {preset.deductions.map((deduction) => {
              const ingredient = ingredients.find((item) => item.id === deduction.ingredientId);
              return ingredient ? (
                <Text key={ingredient.id} style={styles.fastLogPresetDetail}>
                  {ingredient.name} {formatUnitQuantity(deduction.quantity, ingredient.unit)}
                </Text>
              ) : null;
            })}
          </View>
        ) : (
          <Text style={styles.fastLogPresetDetail}>
            {preset.deductions.map((deduction) => {
              const ingredient = ingredients.find((item) => item.id === deduction.ingredientId);
              return ingredient ? `${ingredient.name} ${formatUnitQuantity(deduction.quantity, ingredient.unit)}` : '';
            }).filter(Boolean).join(' · ')} · Reason: {preset.reasonDetail}
          </Text>
        )}
        <Text style={styles.fastLogReviewLink}>Review preset →</Text>
      </Pressable>
    );

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
            <Text style={styles.formTitle}>Rush-Hour Fast-Log</Text>
            <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.fastLogListContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.usageInfoBanner}>
            <Text style={styles.permissionIcon}>i</Text>
            <Text style={styles.permissionText}>
              Tap a preset once to review. Confirm after checking the configured ingredient quantities.
            </Text>
          </View>
          <Text style={styles.fastLogSectionTitle}>Cooking batches</Text>
          <View style={styles.fastLogPresetList}>
            {fastLogPresets.filter((preset) => preset.section === 'cooking').map(renderPresetCard)}
          </View>
          <Text style={[styles.fastLogSectionTitle, styles.fastLogSecondSection]}>Waste / spoilage presets</Text>
          <View style={styles.fastLogPresetList}>
            {fastLogPresets.filter((preset) => preset.section === 'waste').map(renderPresetCard)}
          </View>
          <Text style={styles.fastLogFootnote}>
            Preset quantities are illustrative. Date: 25 Oct 2026. Review stock and reason before logging.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRoute('stockHistory')}
            style={({ pressed }) => [styles.historyButton, styles.fastLogHistoryButton, pressed && styles.pressed]}
          >
            <Text style={styles.historyButtonText}>View transaction history</Text>
          </Pressable>
        </ScrollView>
      </>
    );
  };

  const renderFastLogReview = () => {
    const preset = selectedFastLogPreset;
    if (!preset) {
      return (
        <View style={styles.inventoryFallback}>
          <Text style={styles.inventoryEmptyTitle}>Choose a preset to review</Text>
          <Pressable onPress={() => setRoute('fastLog')} style={styles.detailBackFallback}>
            <Text style={styles.detailBackLabel}>Back to Fast-Log</Text>
          </Pressable>
        </View>
      );
    }

    const isCooking = preset.section === 'cooking';
    return (
      <>
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to presets"
            onPress={returnToFastLogList}
            style={styles.backButton}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Rush-Hour Fast-Log</Text>
            <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.compactFormContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.fastLogSummaryCard}>
            <Text style={styles.fastLogSummaryTitle}>
              {preset.name}
            </Text>
            <Text style={styles.fastLogSummaryAmount}>
              {isCooking ? `${fastLogPieces || '0'} pieces · 1 batch` : 'Editable waste / spoilage preset'}
            </Text>
            <Text style={styles.fastLogSummaryNote}>
              {isCooking ? 'Configured preset · Adjust actual quantities below' : 'Preset template · Adjust the actual item and quantity below'}
            </Text>
          </View>
          {isCooking ? (
            <TextField
              label="Batch size (pieces) *"
              value={fastLogPieces}
              onChangeText={(value) => {
                setFastLogPieces(value);
                setFastLogFieldErrors((current) => ({ ...current, pieces: '' }));
              }}
              placeholder="Enter batch size"
              keyboardType="decimal-pad"
              error={fastLogFieldErrors.pieces}
            />
          ) : null}
          <Text style={styles.fastLogSectionTitle}>Ingredient deductions</Text>
          {fastLogDraftDeductions.map((draft, index) => {
            const ingredient = ingredients.find((item) => item.id === draft.ingredientId);
            const errorKey = `${draft.ingredientId}-${index}`;
            const error = fastLogFieldErrors[errorKey];
            return (
              <View key={`${preset.id}-deduction-${index}`} style={styles.fastLogEditCard}>
                <Text style={styles.fieldLabel}>Ingredient {index + 1} *</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ingredient ${index + 1}`}
                  onPress={() => setFastLogIngredientPickerIndex((current) => current === index ? null : index)}
                  style={styles.selectInput}
                >
                  <Text style={styles.selectText}>
                    {ingredient ? `${ingredient.name} · ${formatUnitQuantity(ingredient.quantity, ingredient.unit)} available` : 'Select ingredient'}
                  </Text>
                  <Text style={styles.selectChevron}>{fastLogIngredientPickerIndex === index ? '⌃' : '⌄'}</Text>
                </Pressable>
                {fastLogIngredientPickerIndex === index ? (
                  <View style={styles.reasonDropdown}>
                    {ingredients.map((option) => (
                      option.id !== draft.ingredientId && fastLogDraftDeductions.some(
                        (otherDraft, otherIndex) => otherIndex !== index && otherDraft.ingredientId === option.id,
                      ) ? null : (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          updateFastLogDeduction(index, 'ingredientId', option.id);
                          setFastLogIngredientPickerIndex(null);
                        }}
                        style={styles.reasonOption}
                      >
                        <Text style={[
                          styles.reasonOptionText,
                          option.id === draft.ingredientId && styles.reasonOptionSelected,
                        ]}>
                          {option.name} · {formatUnitQuantity(option.quantity, option.unit)} available
                        </Text>
                      </Pressable>
                      )
                    ))}
                  </View>
                ) : null}
                <View style={styles.fastLogQuantityEditRow}>
                  <Text style={styles.fieldLabel}>Actual quantity *</Text>
                  <View style={styles.fastLogQuantityInputWrap}>
                    <TextInput
                      value={draft.quantity}
                      onChangeText={(value) => updateFastLogDeduction(index, 'quantity', value)}
                      placeholder="Enter quantity"
                      placeholderTextColor="#A0A0AA"
                      keyboardType="decimal-pad"
                      style={[styles.textInput, styles.fastLogQuantityInput, error ? styles.textInputError : undefined]}
                    />
                    <Text style={styles.inputSuffix}>{ingredient?.unit ?? 'unit'}</Text>
                  </View>
                </View>
                {error ? <Text style={styles.fieldError}>{error}</Text> : null}
                {ingredient ? (
                  <Text style={styles.fastLogAvailableHint}>
                    Current stock: {formatUnitQuantity(ingredient.quantity, ingredient.unit)}
                  </Text>
                ) : null}
              </View>
            );
          })}
          <TextField
            label="Reason / description *"
            value={fastLogReason}
            onChangeText={(value) => {
              setFastLogReason(value);
              setFastLogFieldErrors((current) => ({ ...current, reason: '' }));
            }}
            placeholder={isCooking ? 'Describe this cooking batch' : 'Describe the waste or spoilage'}
            error={fastLogFieldErrors.reason}
          />
          <TextField
            label="Notes"
            value={fastLogNotes}
            onChangeText={setFastLogNotes}
            placeholder="Optional notes"
            multiline
          />
          <DatePickerField
            label="Transaction date *"
            value={transactionDate}
            onChange={setTransactionDate}
          />
          <View style={styles.fastLogReceiptDetails}>
            <DetailRow label="Recorded by" value="Isabel San Esteban" />
          </View>
          <View style={styles.usageInfoBanner}>
            <Text style={styles.permissionIcon}>i</Text>
            <Text style={styles.permissionText}>
              Preset values are editable. All deductions are checked against available stock before preview.
            </Text>
          </View>
          <View style={styles.formButtons}>
            <Pressable
              accessibilityRole="button"
              onPress={reviewTransaction}
              style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
            >
              <Text style={styles.saveButtonText}>Preview transaction</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={returnToFastLogList}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.cancelButtonText}>Choose another preset</Text>
            </Pressable>
          </View>
          <Text style={styles.formDemoNote}>Local demo only · Nothing changes until confirmed.</Text>
        </ScrollView>
      </>
    );
  };

  const renderFastLogPreview = () => {
    const preset = selectedFastLogPreset;
    if (!preset) {
      return (
        <View style={styles.inventoryFallback}>
          <Text style={styles.inventoryEmptyTitle}>No preset selected</Text>
          <Pressable onPress={() => setRoute('fastLog')} style={styles.detailBackFallback}>
            <Text style={styles.detailBackLabel}>Back to Fast-Log</Text>
          </Pressable>
        </View>
      );
    }

    const deductionsValid = fastLogDeductions.length > 0 && fastLogDeductions.every(
      (deduction) =>
        Number.isFinite(deduction.quantity) &&
        deduction.quantity > 0 &&
        deduction.quantity <= deduction.previousQuantity,
    );
    const belowMinimum = fastLogDeductions.some((deduction) => {
      const item = ingredients.find((entry) => entry.id === deduction.ingredientId);
      return item !== undefined && deduction.newQuantity < item.minimumStock;
    });

    return (
      <>
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit preset"
            onPress={() => setRoute('fastLogReview')}
            style={styles.backButton}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Review Fast-Log</Text>
            <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.compactFormContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.fastLogSummaryCard}>
            <Text style={styles.fastLogSummaryTitle}>{preset.name}</Text>
            <Text style={styles.fastLogSummaryAmount}>
              {preset.pieces ? `${fastLogPieces || preset.pieces} pieces · 1 batch` : fastLogDeductions.map((entry) => {
                const item = ingredients.find((ingredient) => ingredient.id === entry.ingredientId);
                return item ? formatUnitQuantity(entry.quantity, item.unit) : '';
              }).filter(Boolean).join(' · ')}
            </Text>
            <Text style={styles.fastLogSummaryNote}>Review the actual edited quantities and balances below.</Text>
          </View>
          <Text style={styles.fastLogSectionTitle}>Ingredient deductions</Text>
          <View style={styles.fastLogRowsCard}>
            {fastLogDeductions.map((deduction, index) => {
              const ingredient = ingredients.find((item) => item.id === deduction.ingredientId);
              return ingredient ? (
                <View key={`${ingredient.id}-${index}`} style={styles.fastLogBalanceRow}>
                  <Text style={styles.fastLogBalanceName}>{ingredient.name}</Text>
                  <Text style={styles.fastLogBalanceValue}>
                    -{formatUnitQuantity(deduction.quantity, ingredient.unit)} / {formatQuantity(deduction.previousQuantity)} → {formatUnitQuantity(deduction.newQuantity, ingredient.unit)}
                  </Text>
                </View>
              ) : null;
            })}
          </View>
          <View style={styles.fastLogReceiptDetails}>
            <DetailRow label="Transaction date" value={transactionDate ? formatDate(transactionDate) : '—'} />
            <DetailRow label="Recorded by" value="Isabel San Esteban" />
            <DetailRow label="Reason" value={fastLogReason} />
            <DetailRow label="Notes" value={fastLogNotes.trim() || '—'} />
          </View>
          <View style={belowMinimum ? styles.usageWarningBanner : styles.usageInfoBanner}>
            {belowMinimum ? (
              <Text style={styles.usageWarningText}>
                One or more ingredients will remain below minimum stock. Deductions remain within available stock.
              </Text>
            ) : (
              <>
                <Text style={styles.permissionIcon}>i</Text>
                <Text style={styles.permissionText}>All quantities are available. No balance can fall below zero.</Text>
              </>
            )}
          </View>
          {formError !== '' ? <Text style={styles.formError} accessibilityRole="alert">{formError}</Text> : null}
          <View style={styles.formButtons}>
            <Pressable
              accessibilityRole="button"
              disabled={!deductionsValid}
              onPress={() => deductionsValid && setConfirmationVisible(true)}
              style={({ pressed }) => [
                styles.saveButton,
                !deductionsValid && styles.confirmButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.saveButtonText}>Confirm preset</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setRoute('fastLogReview')}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.cancelButtonText}>Edit transaction</Text>
            </Pressable>
          </View>
        </ScrollView>
      </>
    );
  };

  const renderFastLogSuccess = () => {
    const receipt = currentFastLogReceipt;
    if (!receipt) {
      return (
        <View style={styles.inventoryFallback}>
          <Text style={styles.inventoryEmptyTitle}>No Fast-Log receipt to display</Text>
          <Pressable onPress={() => setRoute('fastLog')} style={styles.detailBackFallback}>
            <Text style={styles.detailBackLabel}>Back to Fast-Log</Text>
          </Pressable>
        </View>
      );
    }

    const isCooking = receipt.preset.section === 'cooking';
    return (
      <>
        <View style={styles.formHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Fast-Log"
            onPress={() => setRoute(receipt.preset.section === 'waste' ? 'waste' : 'fastLog')}
            style={styles.backButton}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Rush-Hour Fast-Log</Text>
            <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.compactFormContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.receiptSuccessBanner}>
            <Text style={styles.receiptSuccessIcon}>✓</Text>
            <Text style={styles.receiptSuccessText}>
              {isCooking ? `${receipt.preset.name === 'Standard batch' ? 'Standard cooking batch' : 'Half cooking batch'} logged.` : `${receipt.preset.name} logged.`}
            </Text>
          </View>
          <View style={styles.receiptSummaryCard}>
            <Text style={styles.receiptSummaryTitle}>{receipt.preset.name}</Text>
            <Text style={styles.receiptSummaryQuantity}>
              {isCooking
                ? `${receipt.pieces ?? receipt.preset.pieces} pieces`
                : `-${formatUnitQuantity(
                    receipt.deductions[0].quantity,
                    ingredients.find((item) => item.id === receipt.deductions[0].ingredientId)?.unit ?? '',
                  )}`}
            </Text>
            <Text style={styles.receiptSummarySubtitle}>
              {isCooking ? 'One batch' : receipt.reason} · {formatUsageDate(receipt.transactionDate)}
            </Text>
          </View>
          <Text style={styles.fastLogSectionTitle}>Updated ingredient balances</Text>
          <View style={styles.fastLogRowsCard}>
            {receipt.deductions.map((deduction) => {
              const ingredient = ingredients.find((item) => item.id === deduction.ingredientId);
              return ingredient ? (
                <View key={ingredient.id} style={styles.fastLogBalanceRow}>
                  <Text style={styles.fastLogBalanceName}>{ingredient.name}</Text>
                  <Text style={styles.fastLogBalanceValue}>
                    {formatQuantity(deduction.newQuantity)} {ingredient.unit} remaining
                  </Text>
                </View>
              ) : null;
            })}
          </View>
          <Text style={styles.fastLogReference}>
            Reference {receipt.reference} · Isabel San Esteban
          </Text>
          <View style={styles.fastLogReceiptDetails}>
            <DetailRow label="Reason / description" value={receipt.reason} />
            <DetailRow label="Notes" value={receipt.notes.trim() || '—'} />
          </View>
          <View style={styles.usageInfoBanner}>
            <Text style={styles.permissionIcon}>i</Text>
            <Text style={styles.permissionText}>
              New preset example from the recorded balances. Each ingredient deduction is saved together in history.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRoute(receipt.preset.section === 'waste' ? 'waste' : 'fastLog')}
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
          >
            <Text style={styles.saveButtonText}>
              {receipt.preset.section === 'waste' ? 'Back to Waste Presets' : 'Back to Fast-Log'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRoute('stockHistory')}
            style={({ pressed }) => [styles.cancelButton, styles.receiptBackButton, pressed && styles.pressed]}
          >
            <Text style={styles.cancelButtonText}>View transaction history</Text>
          </Pressable>
        </ScrollView>
      </>
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
            <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
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
          <Text style={styles.formDemoNote}>Local demo only · No live stock record will be created.</Text>
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
            <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
          </View>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.compactFormContent} showsVerticalScrollIndicator={false}>
          <View style={styles.receiptSuccessBanner}>
            <Text style={styles.receiptSuccessIcon}>✓</Text>
            <Text style={styles.receiptSuccessText}>Stock-out recorded successfully.</Text>
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
            <DetailRow label="Staff" value="Isabel San Esteban" />
            <DetailRow label="Branch" value="Manila · Branch 1" />
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
              This is a new transaction example from the recorded {formatQuantity(firstDeduction?.previousQuantity ?? 0)} {firstIngredient?.unit ?? ''} balance.
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
          <Text style={styles.detailDemoNote}>DEMO PREVIEW · Local sample transaction only.</Text>
        </ScrollView>
      </>
    );
  };

  const renderStockInSuccess = () => {
    const receiptIngredient = currentReceipt
      ? ingredients.find((item) => item.id === currentReceipt.ingredientId)
      : undefined;
    if (!currentReceipt || !receiptIngredient) {
      return (
        <View style={styles.inventoryFallback}>
          <Text style={styles.inventoryEmptyTitle}>No receipt to display</Text>
          <Pressable onPress={() => setRoute('stocks')} style={styles.detailBackFallback}>
            <Text style={styles.detailBackLabel}>Back to Stocks</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.compactFormContent} showsVerticalScrollIndicator={false}>
        <View style={styles.formHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Stocks" onPress={() => setRoute('stocks')} style={styles.backButton}>
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={styles.formTitle}>Stock-In</Text>
            <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
          </View>
        </View>
        <View style={styles.receiptSuccessBanner}>
          <Text style={styles.receiptSuccessIcon}>✓</Text>
          <Text style={styles.receiptSuccessText}>Stock-In recorded successfully.</Text>
        </View>
        <View style={styles.receiptSummaryCard}>
          <Text style={styles.receiptSummaryTitle}>{receiptIngredient.name} received</Text>
          <Text style={styles.receiptSummaryQuantity}>+{formatQuantity(currentReceipt.quantity)} {receiptIngredient.unit}</Text>
          <Text style={styles.receiptSummarySubtitle}>
            Available after receipt: {formatQuantity(currentReceipt.newQuantity)} {receiptIngredient.unit}
          </Text>
        </View>
        <View style={styles.receiptDetails}>
          <DetailRow label="Reference" value={currentReceipt.reference} />
          <DetailRow label="Ingredient" value={`${receiptIngredient.name} · ${receiptIngredient.category}`} />
          <DetailRow label="Transaction date" value={formatReceiptDate(currentReceipt.transactionDate)} />
          <DetailRow label="Expiration" value={currentReceipt.expirationDate ? formatDate(currentReceipt.expirationDate) : 'Not recorded'} />
          <DetailRow label="Recorded by" value="Isabel San Esteban" />
          <DetailRow label="Branch" value="Manila · Branch 1" />
          <DetailRow label="Notes" value={currentReceipt.notes || '—'} />
        </View>
        <View style={styles.permissionNotice}>
          <Text style={styles.permissionIcon}>i</Text>
          <Text style={styles.permissionText}>
            Historical receipt. The total cooking usage recorded of 5 kg each leave the current balance at 5 kg.
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setRoute('stockHistory')} style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}>
          <Text style={styles.historyButtonText}>View transaction history</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setRoute('stocks')} style={({ pressed }) => [styles.cancelButton, styles.receiptBackButton, pressed && styles.pressed]}>
          <Text style={styles.cancelButtonText}>Back to Stocks</Text>
        </Pressable>
        <Text style={styles.detailDemoNote}>DEMO PREVIEW · Local sample receipt only.</Text>
      </ScrollView>
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
            <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
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
          <DetailRow label="Reason" value={receipt.reason === 'Waste / Other' ? 'Other' : receipt.reason} />
          <DetailRow label="Description" value={receipt.description || '—'} />
          <DetailRow label="Notes" value={receipt.notes || '—'} />
          <DetailRow label="Staff" value="Isabel San Esteban" />
        </View>
        <View style={styles.permissionNotice}>
          <Text style={styles.permissionIcon}>i</Text>
          <Text style={styles.permissionText}>
            This new waste event was deducted once after confirmation. Historical example WS-1025-001 (54 pcs → 48 pcs) is already reflected in the opening balance and is never deducted again.
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
    const historicalEggWaste = historyTransactions.find(
      (transaction) => transaction.id === 'seed-ws-eggs',
    );

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
            <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
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
            <Text style={styles.historyMetadataTitle}>Manila · Branch 1 · 25 Oct 2026</Text>
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
                    {formatHistoryDateTime(transaction.transactionDate)} · {transaction.staff.split(' ')[0]} · Branch 1
                  </Text>
                </Pressable>
              ))}
            </View>
            {octopusLedger || historicalEggWaste ? (
              <View style={styles.historyLedgerBanner}>
                <Text style={styles.permissionIcon}>i</Text>
                <Text style={styles.permissionText}>
                  {octopusLedger ? `${octopusLedger} ` : ''}
                  {historicalEggWaste
                    ? 'Eggs waste is already reflected in the recorded 48 pcs balance.'
                    : ''}
                </Text>
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
        <Text style={styles.detailDemoNote}>DEMO PREVIEW · Local transaction records for this session and sample history.</Text>
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
          <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
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
            <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
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
            {transaction.reference} · {transaction.historical ? 'Recorded · historical sample' : 'Recorded'}
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
        {transaction.historical && transaction.ingredientId === 'eggs' ? (
          <View style={styles.historyLedgerBanner}>
            <Text style={styles.permissionIcon}>i</Text>
            <Text style={styles.permissionText}>
              Historical Eggs waste is already reflected in the recorded 48 pcs balance. This display-only record does not deduct stock again.
            </Text>
          </View>
        ) : ledgerExplanation ? (
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
    case 'inventory':
      screenContent = renderInventory();
      break;
    case 'ingredientDetails':
      screenContent = renderIngredientDetails();
      break;
    case 'inventoryHistory':
      screenContent = renderInventoryHistory();
      break;
    case 'notificationAlertDetails':
      screenContent = renderNotificationAlertDetails();
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
    case 'fastLog':
      screenContent = renderFastLogList();
      break;
    case 'waste':
      screenContent = renderWasteForm();
      break;
    case 'fastLogReview':
      screenContent = renderFastLogReview();
      break;
    case 'fastLogPreview':
      screenContent = renderFastLogPreview();
      break;
    case 'fastLogSuccess':
      screenContent = renderFastLogSuccess();
      break;
    case 'usagePreview':
      screenContent = renderUsagePreview();
      break;
    case 'stockOutSuccess':
      screenContent = renderUsageSuccess();
      break;
    case 'stockInSuccess':
      screenContent = renderStockInSuccess();
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
    case 'notifications':
      screenContent = renderNotifications();
      break;
    case 'more':
      screenContent = renderMore();
      break;
  }

  return (
    <KeyboardAvoidingView style={styles.workspace} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.screenArea}>{screenContent}</View>
      <BottomNavigation active={route} onSelect={navigate} />
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
              End your demo session on this device? Sign-in uses local sample credentials in this preview.
            </Text>
            <View style={styles.logoutSessionPanel}>
              <Text style={styles.logoutSessionText}>{staffName} · {staffRole}</Text>
              <Text style={styles.logoutSessionText}>{assignedBranch}</Text>
              <Text style={styles.logoutSessionNote}>Inventory and transaction data are local mock data and are not synced.</Text>
              <Text style={styles.logoutSessionNote}>Settings changes are held for this session only.</Text>
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
                            {line.name} · Manila · Branch 1
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
                      <Text style={styles.dailyModalSummaryText}>Manila · Branch 1</Text>
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
                  <Text style={styles.dailyModalSummaryText}>Manila · Branch 1 · 25 Oct 2026</Text>
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
                    disabled={dailyCheckSubmissionLock.current}
                    onPress={submitDailyInventoryCheck}
                    style={({ pressed }) => [
                      styles.dailyModalPrimaryButton,
                      pressed && styles.pressed,
                      dailyCheckSubmissionLock.current && styles.confirmButtonDisabled,
                    ]}
                  >
                    <Text style={styles.dailyModalPrimaryText}>Submit check</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      <Modal
        visible={fastLogPopupVisible}
        transparent
        animationType="fade"
        onRequestClose={closeFastLogPopup}
      >
        <KeyboardAvoidingView
          style={styles.fastLogPopupBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Rush-Hour Fast-Log"
            onPress={closeFastLogPopup}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.fastLogPopupCard}>
            <View style={styles.fastLogPopupHandle} />
            <View style={styles.fastLogPopupHeader}>
              <View style={styles.fastLogPopupHeading}>
                <Text style={styles.fastLogPopupTitle}>Rush-Hour Fast-Log</Text>
                <Text style={styles.fastLogPopupSubtitle}>Record common usage or waste</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close popup"
                disabled={confirming}
                onPress={closeFastLogPopup}
                style={styles.fastLogPopupClose}
              >
                <Text style={styles.fastLogPopupCloseText}>×</Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.fastLogPopupScroll}
              contentContainerStyle={styles.fastLogPopupScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.fastLogPopupSectionTitle}>Choose a preset</Text>
              {fastLogPresets.map((preset) => {
                const isSelected = selectedFastLogPresetId === preset.id;
                const summary = preset.deductions.map((deduction) => {
                  const ingredient = ingredients.find((item) => item.id === deduction.ingredientId);
                  return ingredient
                    ? `${ingredient.name} ${formatUnitQuantity(deduction.quantity, ingredient.unit)}`
                    : '';
                }).filter(Boolean).join(' · ');
                return (
                  <Pressable
                    key={preset.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    disabled={confirming}
                    onPress={() => {
                      prepareFastLogPreset(preset);
                      setFastLogPopupVisible(true);
                    }}
                    style={({ pressed }) => [
                      styles.fastLogPopupPreset,
                      isSelected && styles.fastLogPopupPresetSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.fastLogPopupPresetCopy}>
                      <Text style={styles.fastLogPopupPresetName}>{preset.name}</Text>
                      <Text style={styles.fastLogPopupPresetDetail}>
                        {preset.section === 'waste' ? preset.reason : 'Cooking usage'} · {summary}
                      </Text>
                    </View>
                    <Text style={[
                      styles.fastLogPopupPresetCheck,
                      isSelected && styles.fastLogPopupPresetCheckSelected,
                    ]}>{isSelected ? '✓' : '›'}</Text>
                  </Pressable>
                );
              })}

              {selectedFastLogPreset ? (
                <View style={styles.fastLogPopupEditor}>
                  <Text style={styles.fastLogPopupSectionTitle}>Confirm actual quantities</Text>
                  <Text style={styles.fastLogPopupActionType}>
                    {selectedFastLogPreset.section === 'waste' ? 'Waste / spoilage' : 'Cooking usage'}
                    {selectedFastLogPreset.pieces ? ` · ${fastLogPieces || selectedFastLogPreset.pieces} pieces` : ''}
                  </Text>
                  {selectedFastLogPreset.pieces ? (
                    <View style={styles.fastLogPopupPieces}>
                      <Text style={styles.fieldLabel}>Batch size (pieces)</Text>
                      <TextInput
                        accessibilityLabel="Batch size in pieces"
                        value={fastLogPieces}
                        editable={!confirming}
                        onChangeText={(value) => {
                          setFastLogPieces(value);
                          setFastLogFieldErrors((current) => ({ ...current, pieces: '' }));
                        }}
                        keyboardType="number-pad"
                        style={styles.fastLogPopupTextInput}
                      />
                      {fastLogFieldErrors.pieces ? (
                        <Text style={styles.fieldError}>{fastLogFieldErrors.pieces}</Text>
                      ) : null}
                    </View>
                  ) : null}
                  {fastLogDraftDeductions.map((draft, index) => {
                    const ingredient = ingredients.find((item) => item.id === draft.ingredientId);
                    const error = fastLogFieldErrors[`${draft.ingredientId}-${index}`];
                    if (!ingredient) return null;
                    return (
                      <View key={`${draft.ingredientId}-${index}`} style={styles.fastLogPopupDeduction}>
                        <View style={styles.fastLogPopupDeductionHeading}>
                          <Text style={styles.fastLogPopupIngredientName}>{ingredient.name}</Text>
                          <Text style={styles.fastLogPopupAvailable}>
                            Available {formatUnitQuantity(ingredient.quantity, ingredient.unit)}
                          </Text>
                        </View>
                        <View style={[styles.fastLogQuantityInputWrap, error ? styles.textInputError : undefined]}>
                          <TextInput
                            accessibilityLabel={`${ingredient.name} quantity`}
                            value={draft.quantity}
                            editable={!confirming}
                            onChangeText={(value) => updateFastLogDeduction(index, 'quantity', value)}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                            style={[styles.textInput, styles.fastLogQuantityInput]}
                          />
                          <Text style={styles.inputSuffix}>{ingredient.unit}</Text>
                        </View>
                        {error ? <Text style={styles.fieldError}>{error}</Text> : null}
                      </View>
                    );
                  })}
                  <View style={styles.fastLogPopupNotes}>
                    <Text style={styles.fieldLabel}>Reason or description</Text>
                    <TextInput
                      accessibilityLabel="Reason or description"
                      value={fastLogReason}
                      editable={!confirming}
                      onChangeText={(value) => {
                        setFastLogReason(value);
                        setFastLogFieldErrors((current) => ({ ...current, reason: '' }));
                      }}
                      placeholder="Add a short reason"
                      style={styles.fastLogPopupTextInput}
                    />
                    {fastLogFieldErrors.reason ? (
                      <Text style={styles.fieldError}>{fastLogFieldErrors.reason}</Text>
                    ) : null}
                    <Text style={[styles.fieldLabel, styles.fastLogPopupNotesLabel]}>Notes (optional)</Text>
                    <TextInput
                      accessibilityLabel="Fast-Log notes"
                      value={fastLogNotes}
                      editable={!confirming}
                      onChangeText={setFastLogNotes}
                      placeholder="Add notes"
                      style={styles.fastLogPopupTextInput}
                    />
                  </View>
                  {fastLogDraftDeductions.some((draft) => {
                    const item = ingredients.find((ingredient) => ingredient.id === draft.ingredientId);
                    return item && Number(draft.quantity) > 0 &&
                      Number(draft.quantity) <= item.quantity &&
                      item.quantity - Number(draft.quantity) < item.minimumStock;
                  }) ? (
                    <Text style={styles.fastLogPopupWarning}>
                      The resulting balance will be below the minimum stock level.
                    </Text>
                  ) : null}
                  {formError ? <Text style={styles.fastLogPopupError}>{formError}</Text> : null}
                  <View style={styles.fastLogPopupActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={confirming}
                      onPress={() => {
                        setSelectedFastLogPresetId('');
                        setFastLogDraftDeductions([]);
                        setFastLogReason('');
                        setFastLogNotes('');
                        setFastLogFieldErrors({});
                      }}
                      style={({ pressed }) => [styles.fastLogPopupCancel, pressed && styles.pressed]}
                    >
                      <Text style={styles.fastLogPopupCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={confirming}
                      onPress={() => {
                        if (!validateFastLogDraft()) return;
                        confirmTransaction();
                      }}
                      style={({ pressed }) => [
                        styles.fastLogPopupSave,
                        pressed && styles.pressed,
                        confirming && styles.confirmButtonDisabled,
                      ]}
                    >
                      <Text style={styles.fastLogPopupSaveText}>
                        {confirming
                          ? 'Recording…'
                          : selectedFastLogPreset.section === 'waste'
                            ? 'Record waste'
                            : 'Record usage'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
            <View style={[
              styles.confirmIcon,
              (route === 'usagePreview' || route === 'fastLogPreview') && styles.usageConfirmIcon,
              route === 'waste' && styles.wasteConfirmIcon,
            ]}>
              {route === 'waste' ? <WasteTrashIcon /> : <Text style={styles.confirmIconText}>↓</Text>}
            </View>
            <Text style={styles.confirmTitle}>
              {route === 'waste'
                ? 'Confirm waste record'
                : route === 'fastLogPreview'
                ? selectedFastLogPreset?.section === 'cooking'
                  ? 'Log one cooking batch?'
                  : 'Log waste preset?'
                : route === 'usagePreview'
                ? 'Confirm cooking usage'
                : route === 'stockIn'
                ? 'Confirm Stock-In'
                : route === 'fastLog'
                  ? 'Confirm Fast-Log'
                  : 'Confirm Stock-Out'}
            </Text>
            <Text style={styles.confirmSubtitle}>
              {route === 'waste'
                ? 'Record this waste event for Manila · Branch 1?'
                : route === 'fastLogPreview'
                ? 'Confirm the edited quantities. Nothing is deducted until you confirm.'
                : route === 'usagePreview'
                ? `Deduct this ${usageMode === 'manual' ? 'manual usage' : 'cooking batch'} from Manila · Branch 1?`
                : `Record this ingredient ${route === 'stockIn' ? 'receipt' : 'deduction'} for Manila · Branch 1?`}
            </Text>
            {route === 'waste' && selectedIngredient && transactionDate ? (
              <View style={styles.confirmSummary}>
                <Text style={styles.confirmSummaryText}>
                  {selectedIngredient.name} · -{formatUnitQuantity(Number(quantity), selectedIngredient.unit)} · Waste
                </Text>
                <Text style={styles.confirmSummaryText}>{formatWasteDate(transactionDate)}</Text>
                <Text style={styles.confirmSummaryText}>
                  Reason: {reason === 'Waste / Other' ? 'Other' : reason}
                </Text>
                <Text style={styles.confirmSummaryText}>
                  Description: {wasteDescription.trim() || '—'}
                </Text>
                <Text style={styles.confirmSummaryText}>
                  {formatUnitQuantity(selectedIngredient.quantity, selectedIngredient.unit)} → {formatUnitQuantity(
                    selectedIngredient.quantity - Number(quantity),
                    selectedIngredient.unit,
                  )} after waste
                </Text>
                <Text style={styles.confirmSummaryText}>Notes: {notes.trim() || '—'}</Text>
              </View>
            ) : route === 'fastLogPreview' && selectedFastLogPreset ? (
              <View style={styles.confirmSummary}>
                <Text style={styles.confirmSummaryText}>
                  {selectedFastLogPreset.name} · {selectedFastLogPreset.pieces ? `${fastLogPieces || selectedFastLogPreset.pieces} pieces` : fastLogReason}
                </Text>
                {fastLogDeductions.map((deduction, index) => {
                  const ingredient = ingredients.find((item) => item.id === deduction.ingredientId);
                  if (!ingredient) return null;
                  return (
                    <Text key={`${ingredient.id}-${index}`} style={styles.confirmSummaryText}>
                      {ingredient.name} {formatUnitQuantity(deduction.quantity, ingredient.unit)} → {formatQuantity(deduction.previousQuantity)} → {formatUnitQuantity(deduction.newQuantity, ingredient.unit)}
                    </Text>
                  );
                })}
                <Text style={styles.confirmSummaryText}>{fastLogReason} · {transactionDate ? formatDate(transactionDate) : ''}</Text>
                <Text style={styles.confirmSummaryText}>Isabel San Esteban</Text>
                <Text style={styles.confirmSummaryText}>Notes: {fastLogNotes.trim() || '—'}</Text>
              </View>
            ) : route === 'usagePreview' ? (
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
                <Text style={styles.confirmSummaryText}>{reason} · {transactionDate ? formatDate(transactionDate) : ''}</Text>
                <Text style={styles.confirmSummaryText}>Isabel San Esteban</Text>
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
            <View style={styles.confirmActions}>
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
                    : route === 'waste'
                      ? 'Record waste'
                      : route === 'fastLogPreview'
                      ? selectedFastLogPreset?.section === 'waste' ? 'Log waste' : 'Log batch'
                      : route === 'usagePreview'
                        ? 'Record usage'
                        : 'Confirm'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  workspace: { flex: 1, backgroundColor: colors.white },
  screenArea: { flex: 1, minHeight: 0 },
  scroll: { flex: 1 },
  dashboardContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 20 },
  pageContent: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 24 },
  inventoryListContent: { flexGrow: 1, paddingHorizontal: 17, paddingTop: 22, paddingBottom: 24 },
  inventoryPageHeader: { marginBottom: 14 },
  inventorySearch: { marginTop: 14 },
  inventoryFilterScroll: { flexGrow: 0, marginBottom: 17 },
  inventoryFilters: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 7, paddingRight: 8 },
  inventoryCount: { color: colors.muted, fontFamily: font.regular, fontSize: 9, marginBottom: 10 },
  inventoryCardSeparator: { height: 9 },
  inventoryCard: {
    minHeight: 91, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11,
    paddingVertical: 8, borderRadius: 16, backgroundColor: '#EEEEEF', elevation: 2,
    shadowColor: colors.navy, shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  inventoryCardCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  inventoryIngredientName: { color: colors.navy, fontFamily: font.semibold, fontSize: 12 },
  inventoryIngredientCategory: { color: colors.muted, fontFamily: font.regular, fontSize: 9, marginTop: 3 },
  inventoryQuantityColumn: { minWidth: 82, alignItems: 'flex-end', justifyContent: 'center', marginLeft: 8 },
  inventoryQuantity: { color: colors.navy, fontFamily: font.semibold, fontSize: 12 },
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
  dashboardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 17 },
  profileAvatar: {
    width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FCE3EB', marginRight: 10,
  },
  profileHead: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.pink, marginBottom: 2 },
  profileBody: { width: 19, height: 10, borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: colors.pink },
  greetingCopy: { flex: 1 },
  greeting: { color: colors.ink, fontFamily: font.semibold, fontSize: 14, lineHeight: 20 },
  branchName: { color: colors.muted, fontFamily: font.regular, fontSize: 10, marginTop: 1 },
  notificationButton: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.pale },
  bellIcon: { width: 22, height: 23, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 1 },
  bellBody: { width: 14, height: 15, borderWidth: 1.7, borderColor: colors.navy, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  bellBase: { width: 18, height: 2, borderRadius: 1, backgroundColor: colors.navy, marginTop: 1 },
  bellClapper: { width: 4, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.navy, marginTop: 1 },
  notificationDot: { position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.pink },
  searchBar: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    borderRadius: 13, backgroundColor: colors.pale, marginBottom: 17,
  },
  searchGlyph: { color: colors.muted, fontSize: 25, lineHeight: 29, width: 24, textAlign: 'center', marginRight: 7 },
  searchInput: { flex: 1, minHeight: 42, paddingVertical: 0, color: colors.ink, fontFamily: font.regular, fontSize: 11 },
  clearSearch: { color: colors.muted, fontFamily: font.medium, fontSize: 21, paddingHorizontal: 4 },
  infoBanner: { flexDirection: 'row', alignItems: 'center', padding: 11, borderRadius: 11, backgroundColor: '#EFEEFA', marginBottom: 14 },
  infoBannerText: { flex: 1, color: colors.navy, fontFamily: font.medium, fontSize: 10, lineHeight: 15 },
  bannerDismiss: { color: colors.muted, fontFamily: font.medium, fontSize: 19, paddingHorizontal: 4 },
  summaryCard: {
    minHeight: 166, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 17,
    borderRadius: 22, backgroundColor: colors.navy, marginBottom: 20, elevation: 5,
    shadowColor: colors.navy, shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 5 },
  },
  summaryCopy: { width: '76%', zIndex: 2 },
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
    position: 'absolute', right: -9, top: 25, width: 124, height: 124, overflow: 'hidden',
    borderRadius: 64, backgroundColor: '#FFF4D6', borderWidth: 4, borderColor: '#333448',
  },
  summaryImage: { width: '100%', height: '100%' },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { color: colors.ink, fontFamily: font.semibold, fontSize: 15 },
  sectionHint: { color: colors.muted, fontFamily: font.regular, fontSize: 9 },
  quickActions: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  quickAction: {
    flex: 1, minWidth: 0, minHeight: 80, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 2, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.line, elevation: 2, shadowColor: colors.navy,
    shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  quickActionIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFF1E2', marginBottom: 4 },
  quickActionGlyph: { color: colors.orange, fontFamily: font.semibold, fontSize: 21, lineHeight: 25 },
  quickActionTitle: { color: colors.navy, fontFamily: font.medium, fontSize: 8, textAlign: 'center' },
  dashboardFastLogCard: {
    minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
    paddingVertical: 7, borderRadius: 14, backgroundColor: '#F5F5F7',
    borderWidth: 1, borderColor: colors.line, marginBottom: 16,
    elevation: 2, shadowColor: colors.navy, shadowOpacity: 0.06,
    shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
  },
  dashboardFastLogIcon: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: colors.navy, marginRight: 10,
  },
  dashboardFastLogIconText: { color: colors.orange, fontSize: 19, lineHeight: 23 },
  dashboardFastLogCopy: { flex: 1, minWidth: 0, marginRight: 6 },
  dashboardFastLogTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
  dashboardFastLogSubtitle: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 2 },
  dashboardFastLogAction: { flexDirection: 'row', alignItems: 'center', paddingLeft: 7 },
  dashboardFastLogActionText: { color: colors.pink, fontFamily: font.semibold, fontSize: 8 },
  dashboardFastLogChevron: { color: colors.pink, fontFamily: font.semibold, fontSize: 17, marginLeft: 3 },
  fastLogPopupBackdrop: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 28, backgroundColor: 'rgba(16, 16, 39, 0.48)',
  },
  fastLogPopupCard: {
    width: '85%', maxWidth: 360, maxHeight: '78%', alignSelf: 'center',
    paddingTop: 13, paddingHorizontal: 15, paddingBottom: 15,
    borderRadius: 20, backgroundColor: colors.white,
    elevation: 18, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
  },
  fastLogPopupHandle: {
    width: 36, height: 4, alignSelf: 'center', borderRadius: 2,
    backgroundColor: '#D8D8DE', marginBottom: 10,
  },
  fastLogPopupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  fastLogPopupHeading: { flex: 1, minWidth: 0 },
  fastLogPopupTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 15 },
  fastLogPopupSubtitle: { color: colors.muted, fontFamily: font.regular, fontSize: 9, marginTop: 2 },
  fastLogPopupClose: {
    width: 31, height: 31, alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, backgroundColor: '#F2F2F4', marginLeft: 10,
  },
  fastLogPopupCloseText: { color: colors.navy, fontFamily: font.medium, fontSize: 21, lineHeight: 24 },
  fastLogPopupScroll: { flexShrink: 1 },
  fastLogPopupScrollContent: { paddingTop: 12, paddingBottom: 5 },
  fastLogPopupSectionTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 10, marginBottom: 7 },
  fastLogPopupPreset: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
    paddingVertical: 7, borderRadius: 12, backgroundColor: '#F5F5F7',
    borderWidth: 1, borderColor: colors.line, marginBottom: 6,
  },
  fastLogPopupPresetSelected: { backgroundColor: '#FFF7FA', borderColor: '#F5AFC2' },
  fastLogPopupPresetCopy: { flex: 1, minWidth: 0 },
  fastLogPopupPresetName: { color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
  fastLogPopupPresetDetail: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 12, marginTop: 2 },
  fastLogPopupPresetCheck: { color: colors.muted, fontFamily: font.semibold, fontSize: 17, marginLeft: 8 },
  fastLogPopupPresetCheckSelected: { color: colors.pink },
  fastLogPopupEditor: {
    padding: 11, borderRadius: 14, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.line, marginTop: 5,
  },
  fastLogPopupActionType: { color: colors.orange, fontFamily: font.medium, fontSize: 8, marginTop: -4, marginBottom: 7 },
  fastLogPopupPieces: { marginBottom: 8 },
  fastLogPopupDeduction: { marginTop: 5 },
  fastLogPopupDeductionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  fastLogPopupIngredientName: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
  fastLogPopupAvailable: { color: colors.muted, fontFamily: font.regular, fontSize: 7 },
  fastLogPopupNotes: { marginTop: 10 },
  fastLogPopupNotesLabel: { marginTop: 8 },
  fastLogPopupTextInput: {
    minHeight: 38, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1, borderColor: '#E9E9ED', backgroundColor: '#F5F5F7',
    color: colors.navy, fontFamily: font.regular, fontSize: 9,
  },
  fastLogPopupWarning: {
    color: colors.navy, fontFamily: font.regular, fontSize: 8, lineHeight: 12,
    padding: 8, borderRadius: 9, backgroundColor: colors.yellow, marginTop: 9,
  },
  fastLogPopupError: { color: colors.red, fontFamily: font.medium, fontSize: 8, marginTop: 8 },
  fastLogPopupActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 11 },
  fastLogPopupCancel: {
    minWidth: 75, minHeight: 39, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, borderRadius: 11, backgroundColor: '#EEEEF0',
  },
  fastLogPopupCancelText: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
  fastLogPopupSave: {
    minWidth: 116, minHeight: 39, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 13, borderRadius: 11, backgroundColor: colors.pink,
  },
  fastLogPopupSaveText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
  dashboardCarousel: { width: '100%', flexGrow: 0 },
  horizontalCards: { gap: 9, paddingRight: 18, paddingBottom: 2 },
  ingredientCard: {
    minHeight: 116, flexShrink: 0, flexDirection: 'row', alignItems: 'center', padding: 9,
    borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line,
    elevation: 2, shadowColor: colors.navy, shadowOpacity: 0.05, shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  listIngredientCard: { width: '100%', minHeight: 108 },
  ingredientThumbnail: { width: 62, height: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  thumbnailEmoji: { fontSize: 29 },
  largeThumbnail: { width: 70, height: 80 },
  largeThumbnailEmoji: { fontSize: 34 },
  ingredientCopy: { flex: 1, minWidth: 0, justifyContent: 'center', marginLeft: 9 },
  ingredientName: { color: colors.ink, fontFamily: font.semibold, fontSize: 10 },
  ingredientCategory: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 1 },
  ingredientQuantity: { color: colors.orange, fontFamily: font.semibold, fontSize: 10, marginTop: 3 },
  ingredientExpiration: { color: colors.muted, fontFamily: font.medium, fontSize: 8, marginTop: 2 },
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
  fastLogListContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 22 },
  fastLogSectionTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 12, marginBottom: 8 },
  fastLogSecondSection: { marginTop: 17 },
  fastLogPresetList: { gap: 9 },
  fastLogPresetCard: {
    paddingHorizontal: 13, paddingVertical: 11, borderRadius: 15, backgroundColor: '#EEEEEF',
    borderWidth: 1, borderColor: colors.line, elevation: 2, shadowColor: colors.navy,
    shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
  },
  fastLogPresetTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 11, marginBottom: 5 },
  fastLogPresetIngredients: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 11, rowGap: 2 },
  fastLogPresetDetail: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13 },
  fastLogReviewLink: { color: colors.pink, fontFamily: font.semibold, fontSize: 9, marginTop: 7 },
  fastLogFootnote: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginTop: 16 },
  fastLogHistoryButton: { marginTop: 13 },
  fastLogSummaryCard: {
    paddingHorizontal: 15, paddingVertical: 13, borderRadius: 16, backgroundColor: colors.navy,
    marginBottom: 16, elevation: 3, shadowColor: colors.navy, shadowOpacity: 0.12,
    shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  fastLogSummaryTitle: { color: colors.white, fontFamily: font.semibold, fontSize: 12 },
  fastLogSummaryAmount: { color: colors.orange, fontFamily: font.semibold, fontSize: 16, marginTop: 4 },
  fastLogSummaryNote: { color: '#D5D5DF', fontFamily: font.regular, fontSize: 8, marginTop: 3 },
  fastLogRowsCard: {
    paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#EEEEEF', marginBottom: 12,
    elevation: 2, shadowColor: colors.navy, shadowOpacity: 0.05, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fastLogBalanceRow: {
    minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, borderBottomWidth: 1, borderBottomColor: '#DDDDDF',
  },
  fastLogBalanceName: { flexShrink: 0, color: colors.navy, fontFamily: font.semibold, fontSize: 9 },
  fastLogBalanceValue: { flexShrink: 1, color: colors.navy, fontFamily: font.medium, fontSize: 8, textAlign: 'right' },
  fastLogReceiptDetails: { paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, marginBottom: 12 },
  fastLogReference: { color: colors.navy, fontFamily: font.medium, fontSize: 9, marginBottom: 12 },
  fastLogEditCard: {
    padding: 11, borderRadius: 13, backgroundColor: '#EEEEEF', marginBottom: 9,
    borderWidth: 1, borderColor: colors.line,
  },
  fastLogQuantityEditRow: { marginTop: 9 },
  fastLogQuantityInputWrap: {
    minHeight: 42, flexDirection: 'row', alignItems: 'center',
    borderRadius: 11, borderWidth: 1, borderColor: '#E9E9ED', backgroundColor: colors.white,
  },
  fastLogQuantityInput: { flex: 1, minHeight: 40, borderWidth: 0, backgroundColor: 'transparent' },
  fastLogAvailableHint: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 4 },
  notificationList: { gap: 10 },
  notificationPageHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  markReadButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: '#FCE3EB', marginBottom: 17 },
  markReadText: { color: colors.pink, fontFamily: font.medium, fontSize: 8 },
  notificationPageContent: { paddingHorizontal: 18, paddingTop: 19, paddingBottom: 20 },
  alertFilterScroll: { flexGrow: 0, marginTop: -4, marginBottom: 13 },
  alertFilterRow: { flexDirection: 'row', gap: 7, paddingRight: 8 },
  alertFilterChip: {
    minHeight: 31, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
    borderRadius: 17, backgroundColor: '#EEEEEF',
  },
  alertFilterChipSelected: { backgroundColor: colors.navy },
  alertFilterChipText: { color: colors.navy, fontFamily: font.medium, fontSize: 8 },
  alertFilterChipTextSelected: { color: colors.white },
  alertMetadata: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 12, marginBottom: 11 },
  inventoryAlertCard: {
    minHeight: 78, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 13, backgroundColor: '#EEEEEF', borderWidth: 1, borderColor: '#E8E8EB',
    elevation: 2, shadowColor: colors.navy, shadowOpacity: 0.045, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  inventoryAlertTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  inventoryAlertName: { flex: 1, color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
  inventoryAlertBadge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 4,
    borderRadius: 10, backgroundColor: '#FFF2C4',
  },
  inventoryExpiryBadge: { backgroundColor: '#FFF2C4' },
  inventoryAlertBadgeIcon: { color: colors.orange, fontFamily: font.bold, fontSize: 9, marginRight: 4 },
  inventoryAlertBadgeText: { color: colors.navy, fontFamily: font.medium, fontSize: 7 },
  inventoryAlertDetail: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 12, marginTop: 6 },
  alertEmptyCard: {
    alignItems: 'center', paddingHorizontal: 17, paddingVertical: 23, borderRadius: 14,
    backgroundColor: '#F5F5F7', marginTop: 1,
  },
  alertEmptyTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
  alertEmptyText: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 4 },
  alertListInfoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 10, borderRadius: 11,
    backgroundColor: colors.yellow, marginTop: 14,
  },
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
  profileNotificationNote: { color: colors.muted, fontFamily: font.regular, fontSize: 6, lineHeight: 9, marginTop: 2 },
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
  notificationCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  notificationUnread: { backgroundColor: '#FFFAFC', borderColor: '#F7C3D2' },
  notificationAlertIcon: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 13, marginRight: 11 },
  alertLowIcon: { backgroundColor: colors.yellow },
  alertExpiryIcon: { backgroundColor: colors.paleRed },
  alertActivityIcon: { backgroundColor: '#E8EAFE' },
  alertGlyph: { color: colors.orange, fontFamily: font.bold, fontSize: 17 },
  notificationCopy: { flex: 1 },
  notificationTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
  notificationUnreadTitle: { color: colors.pink },
  notificationDetail: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginTop: 3 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.pink, marginLeft: 8 },
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
  notesInput: { minHeight: 76 },
  dateInput: {
    minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: '#E9E9ED', backgroundColor: '#EEEEEF',
  },
  dateInputText: { color: colors.ink, fontFamily: font.regular, fontSize: 10 },
  placeholderText: { color: '#A0A0AA' },
  calendarGlyph: { color: colors.orange, fontSize: 17 },
  formRow: { flexDirection: 'column', gap: 0 },
  formRowWide: { flexDirection: 'row', gap: 12 },
  rowField: { flex: 1, minWidth: 0 },
  helperText: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginTop: -8, marginBottom: 14 },
  selectInput: {
    minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    borderRadius: 11, borderWidth: 1, borderColor: '#E9E9ED', backgroundColor: '#EEEEEF',
  },
  selectText: { flex: 1, color: colors.ink, fontFamily: font.regular, fontSize: 10 },
  availableQuantity: { color: colors.muted, fontFamily: font.medium, fontSize: 8, marginRight: 8 },
  selectChevron: { color: colors.orange, fontSize: 18, marginLeft: 5 },
  dropdown: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.white, marginTop: 5, overflow: 'hidden' },
  dropdownOption: { flexDirection: 'row', alignItems: 'center', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  dropdownCopy: { marginLeft: 10 },
  dropdownName: { color: colors.navy, fontFamily: font.medium, fontSize: 10 },
  dropdownQuantity: { color: colors.muted, fontFamily: font.regular, fontSize: 8, marginTop: 2 },
  reasonDropdown: { borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.white, marginTop: 5, overflow: 'hidden' },
  reasonOption: { paddingHorizontal: 13, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  reasonOptionText: { color: colors.ink, fontFamily: font.regular, fontSize: 10 },
  reasonOptionSelected: { color: colors.pink, fontFamily: font.semibold },
  formButtons: { gap: 9, marginTop: 7 },
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
  confirmCard: { width: '100%', maxWidth: 370, padding: 18, borderRadius: 19, backgroundColor: colors.white, elevation: 12, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 7 } },
  confirmIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FCE3EB', marginBottom: 11 },
  confirmIconText: { color: colors.pink, fontFamily: font.semibold, fontSize: 22, lineHeight: 26 },
  confirmTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 15 },
  confirmSubtitle: { color: colors.muted, fontFamily: font.regular, fontSize: 9, lineHeight: 14, marginTop: 5 },
  confirmSummary: { padding: 11, borderRadius: 12, backgroundColor: '#EEEEEF', gap: 5, marginTop: 13 },
  confirmSummaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  confirmSummaryText: { color: colors.navy, fontFamily: font.regular, fontSize: 8, lineHeight: 13 },
  confirmBalance: { color: colors.navy, fontFamily: font.semibold, fontSize: 9, lineHeight: 14 },
  confirmActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 9, marginTop: 15 },
  confirmCancelButton: { minWidth: 82, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#EEEEF0' },
  confirmCancelText: { color: colors.navy, fontFamily: font.medium, fontSize: 9 },
  confirmButton: { minWidth: 104, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.pink },
  confirmButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
  confirmButtonDisabled: { opacity: 0.6 },
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
});
