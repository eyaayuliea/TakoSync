import React, { useMemo, useState } from 'react';
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
import BottomNavigation, { type StaffRoute, type StaffTab } from './BottomNavigation';

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
    expiration: '29 Oct 2026',
    nearExpiry: true,
    minimumStock: 1,
    type: 'Takoyaki sauce',
    unitName: 'Liters (L)',
    receivedBatch: 'SAU-2510 · 23 Oct 2026',
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

const cookingBatchPresets = [
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

function formatQuantity(quantity: number) {
  return Number.isInteger(quantity) ? `${quantity}` : `${Number(quantity.toFixed(2))}`;
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

export default function StaffWorkspace({ onLogout }: { onLogout: () => void }) {
  const [route, setRoute] = useState<StaffRoute>('dashboard');
  const [returnRoute, setReturnRoute] = useState<StaffTab>('stocks');
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedIngredientId, setSelectedIngredientId] = useState('');
  const [ingredientListOpen, setIngredientListOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [usageMode, setUsageMode] = useState<'manual' | 'cookingBatch'>('manual');
  const [batchPreset, setBatchPreset] = useState<string>(cookingBatchPresets[0].name);
  const [batchPresetOpen, setBatchPresetOpen] = useState(false);
  const [batchCount, setBatchCount] = useState('1');
  const [transactionDate, setTransactionDate] = useState<Date | null>(new Date());
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [reason, setReason] = useState('Cooking usage');
  const [reasonListOpen, setReasonListOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [quantityError, setQuantityError] = useState('');
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [stockReceipts, setStockReceipts] = useState<StockReceipt[]>([]);
  const [currentReceipt, setCurrentReceipt] = useState<StockReceipt | null>(null);
  const [usageReceipts, setUsageReceipts] = useState<UsageReceipt[]>([]);
  const [currentUsageReceipt, setCurrentUsageReceipt] = useState<UsageReceipt | null>(null);
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardMessage, setDashboardMessage] = useState('');
  const [dashboardCarouselWidth, setDashboardCarouselWidth] = useState(0);
  const [readNotifications, setReadNotifications] = useState<string[]>(['activity-stock-in']);
  const [notificationPreferences, setNotificationPreferences] = useState({
    lowStock: true,
    expiration: true,
    activity: true,
  });

  const selectedIngredient = ingredients.find((item) => item.id === selectedIngredientId);
  const selectedBatch = cookingBatchPresets.find((preset) => preset.name === batchPreset) ?? cookingBatchPresets[0];
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
  const lowStockItems = ingredients.filter((item) => item.lowStock);
  const expiringItems = ingredients.filter((item) => item.nearExpiry);
  const notifications = [
    ...lowStockItems.map((item) => ({
      id: `low-${item.id}`,
      kind: 'lowStock' as const,
      title: `${item.name} is running low`,
      detail: `Only ${item.quantity} ${item.unit} remaining · ${item.category}`,
    })),
    ...expiringItems.map((item) => ({
      id: `expiry-${item.id}`,
      kind: 'expiration' as const,
      title: `${item.name} is nearing expiration`,
      detail: `${item.quantity} ${item.unit} · Expires ${item.expiration}`,
    })),
    {
      id: 'activity-stock-in',
      kind: 'activity' as const,
      title: 'Stock-In recorded',
      detail: 'Flour · 4 kg added to Manila Branch · Today, 9:42 AM',
    },
  ];
  const visibleNotifications = notifications.filter((item) => notificationPreferences[item.kind]);
  const unreadCount = visibleNotifications.filter((item) => !readNotifications.includes(item.id)).length;
  const dashboardTerm = dashboardSearch.trim().toLowerCase();
  const dashboardCardWidth = Math.max(0, dashboardCarouselWidth - 12);
  const dashboardMatches = (item: Ingredient) =>
    `${item.name} ${item.category}`.toLowerCase().includes(dashboardTerm);

  const navigate = (nextRoute: StaffTab) => {
    setRoute(nextRoute);
    setDashboardMessage('');
  };

  const openForm = (
    formRoute: 'stockIn' | 'stockOut' | 'fastLog' | 'waste',
    source: StaffTab,
  ) => {
    setReturnRoute(source);
    setSelectedIngredientId(formRoute === 'stockIn' || formRoute === 'stockOut' ? 'octopus' : '');
    setIngredientListOpen(false);
    setQuantity(formRoute === 'stockIn' ? '5' : formRoute === 'stockOut' ? '1' : '');
    setUsageMode('manual');
    setBatchPresetOpen(false);
    setBatchCount('1');
    setTransactionDate(formRoute === 'stockIn' || formRoute === 'stockOut' ? openingDate : new Date());
    setExpirationDate(formRoute === 'stockIn' ? openingExpirationDate : null);
    setReason(formRoute === 'waste' ? 'Spoilage' : 'Cooking usage');
    setReasonListOpen(false);
    setNotes(formRoute === 'stockIn' ? 'Opening delivery' : formRoute === 'stockOut' ? 'Extra cooking preparation' : '');
    setSuccessMessage('');
    setFormError('');
    setQuantityError('');
    setCurrentReceipt(null);
    setCurrentUsageReceipt(null);
    setConfirmationVisible(false);
    setRoute(formRoute);
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
        };
      });
      setIngredients(nextIngredients);
      setConfirmationVisible(false);
      setConfirming(false);
      setQuantityError('');

      if (currentRoute === 'stockIn') {
        const receiptNumber = stockReceipts.length + 1;
        const referenceDate = transactionDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }).replace('/', '');
        const receipt: StockReceipt = {
          reference: `SI-${referenceDate}-${String(receiptNumber).padStart(3, '0')}`,
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
            source={require('./assets/takoyaki-plate.png')}
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
          <Pressable onPress={() => setRoute('inventory')} style={styles.detailBackFallback}>
            <Text style={styles.detailBackLabel}>Back to inventory</Text>
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
            accessibilityLabel="Back to inventory"
            onPress={() => setRoute('inventory')}
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

  const renderNotifications = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <View style={styles.notificationPageHeading}>
        <View>
          {renderTopHeader('Notifications', 'Inventory updates for Manila Branch')}
        </View>
        {unreadCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setReadNotifications(visibleNotifications.map((item) => item.id))}
            style={styles.markReadButton}
          >
            <Text style={styles.markReadText}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>
      {visibleNotifications.length > 0 ? (
        <View style={styles.notificationList}>
          {visibleNotifications.map((item) => {
            const isRead = readNotifications.includes(item.id);
            const iconStyle = item.kind === 'lowStock'
              ? styles.alertLowIcon
              : item.kind === 'expiration'
                ? styles.alertExpiryIcon
                : styles.alertActivityIcon;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${isRead ? 'Read' : 'Unread'} notification: ${item.title}`}
                accessibilityState={{ selected: isRead }}
                onPress={() => {
                  if (!isRead) setReadNotifications((current) => [...current, item.id]);
                }}
                style={[styles.notificationCard, !isRead && styles.notificationUnread]}
              >
                <View style={[styles.notificationAlertIcon, iconStyle]}>
                  <Text style={styles.alertGlyph}>{item.kind === 'activity' ? '↗' : '!'}</Text>
                </View>
                <View style={styles.notificationCopy}>
                  <Text style={[styles.notificationTitle, !isRead && styles.notificationUnreadTitle]}>{item.title}</Text>
                  <Text style={styles.notificationDetail}>{item.detail}</Text>
                </View>
                {!isRead ? <View style={styles.unreadDot} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.emptyState}>You're all caught up. No inventory alerts right now.</Text>
      )}
      <Text style={styles.demoNote}>DEMO PREVIEW · Example alerts generated from sample data.</Text>
    </ScrollView>
  );

  const renderMore = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      {renderTopHeader('Settings', 'Staff account and preferences')}
      <View style={styles.accountCard}>
        <View style={styles.profileAvatar}>
          <View style={styles.profileHead} />
          <View style={styles.profileBody} />
        </View>
        <View>
          <Text style={styles.accountName}>TakoSync Staff</Text>
          <Text style={styles.accountBranch}>Manila Branch</Text>
        </View>
      </View>
      <View style={styles.settingsList}>
        <View style={styles.settingRow}>
          <View style={styles.settingIcon}><Text style={styles.settingGlyph}>●</Text></View>
          <View style={styles.settingCopy}>
            <Text style={styles.moreItemTitle}>Profile</Text>
            <Text style={styles.moreItemDetail}>TakoSync Staff</Text>
          </View>
          <Text style={styles.settingChevron}>›</Text>
        </View>
        <View style={styles.settingRow}>
          <View style={styles.settingIcon}><Text style={styles.settingGlyph}>⌖</Text></View>
          <View style={styles.settingCopy}>
            <Text style={styles.moreItemTitle}>Assigned Branch</Text>
            <Text style={styles.moreItemDetail}>Manila Branch</Text>
          </View>
          <Text style={styles.settingChevron}>›</Text>
        </View>
        <View style={styles.preferencesHeading}>
          <Text style={styles.moreItemTitle}>Notification Preferences</Text>
          <Text style={styles.moreItemDetail}>Choose which updates to see</Text>
        </View>
        {([
          { key: 'lowStock', label: 'Low-stock alerts' },
          { key: 'expiration', label: 'Expiration reminders' },
          { key: 'activity', label: 'Inventory activity' },
        ] as const).map((preference) => (
          <View key={preference.key} style={styles.preferenceRow}>
            <Text style={styles.preferenceLabel}>{preference.label}</Text>
            <Switch
              accessibilityLabel={preference.label}
              value={notificationPreferences[preference.key]}
              onValueChange={(value) =>
                setNotificationPreferences((current) => ({ ...current, [preference.key]: value }))
              }
              trackColor={{ false: '#D8D8DE', true: '#F6A2BC' }}
              thumbColor={notificationPreferences[preference.key] ? colors.pink : '#FFFFFF'}
            />
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onLogout}
        style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
      >
        <Text style={styles.logoutButtonText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );

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
                  {cookingBatchPresets.map((preset) => (
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
                  value={`-${formatQuantity(deduction.quantity)} ${item.unit}`}
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

  const renderStockHistory = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <View style={styles.formHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Stocks" onPress={() => setRoute('stocks')} style={styles.backButton}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.formHeaderCopy}>
          <Text style={styles.formTitle}>Transaction history</Text>
          <Text style={styles.formSubtitle}>Manila · Branch 1 / Staff</Text>
        </View>
      </View>
      <Text style={styles.historyPlaceholderText}>Local demo transactions</Text>
      {stockReceipts.length === 0 && usageReceipts.length === 0 ? (
        <Text style={styles.emptyState}>No sample receipts have been confirmed in this session.</Text>
      ) : (
        <View style={styles.stockHistoryList}>
          {usageReceipts.slice().reverse().map((receipt) => {
            const first = receipt.deductions[0];
            const item = ingredients.find((ingredient) => ingredient.id === first?.ingredientId);
            return (
              <View key={receipt.reference} style={styles.historyActivityCard}>
                <View style={styles.historyActivityMarker}><Text style={styles.historyActivityGlyph}>↓</Text></View>
                <View style={styles.historyActivityCopy}>
                  <Text style={styles.historyActivityTitle}>{item?.name ?? 'Ingredient'} usage · {receipt.reason}</Text>
                  <Text style={styles.historyActivityDetail}>{receipt.reference} · {formatUsageDate(receipt.transactionDate)}</Text>
                </View>
                <Text style={styles.historyUsageAmount}>-{formatQuantity(first?.quantity ?? 0)} {item?.unit ?? ''}</Text>
              </View>
            );
          })}
          {stockReceipts.slice().reverse().map((receipt) => {
            const item = ingredients.find((ingredient) => ingredient.id === receipt.ingredientId);
            return (
              <View key={receipt.reference} style={styles.historyActivityCard}>
                <View style={styles.historyActivityMarker}><Text style={styles.historyActivityGlyph}>↓</Text></View>
                <View style={styles.historyActivityCopy}>
                  <Text style={styles.historyActivityTitle}>{item?.name ?? 'Ingredient'} received</Text>
                  <Text style={styles.historyActivityDetail}>{receipt.reference} · {formatReceiptDate(receipt.transactionDate)}</Text>
                </View>
                <Text style={styles.historyActivityAmount}>+{formatQuantity(receipt.quantity)} {item?.unit ?? ''}</Text>
              </View>
            );
          })}
        </View>
      )}
      <Text style={styles.detailDemoNote}>DEMO PREVIEW · These local entries are discarded when the app restarts.</Text>
    </ScrollView>
  );

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
    case 'stocks':
      screenContent = renderStocks();
      break;
    case 'stockIn':
      screenContent = renderStockInForm();
      break;
    case 'stockOut':
    case 'fastLog':
    case 'waste':
      screenContent = renderMovementForm();
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
    case 'stockHistory':
      screenContent = renderStockHistory();
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
        visible={confirmationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!confirming) setConfirmationVisible(false);
        }}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIcon, route === 'usagePreview' && styles.usageConfirmIcon]}>
              <Text style={styles.confirmIconText}>↓</Text>
            </View>
            <Text style={styles.confirmTitle}>
              {route === 'usagePreview'
                ? 'Confirm cooking usage'
                : route === 'stockIn'
                ? 'Confirm Stock-In'
                : route === 'fastLog'
                  ? 'Confirm Fast-Log'
                  : route === 'waste'
                    ? 'Confirm Waste / Spoilage'
                    : 'Confirm Stock-Out'}
            </Text>
            <Text style={styles.confirmSubtitle}>
              {route === 'usagePreview'
                ? `Deduct this ${usageMode === 'manual' ? 'manual usage' : 'cooking batch'} from Manila · Branch 1?`
                : `Record this ingredient ${route === 'stockIn' ? 'receipt' : 'deduction'} for Manila · Branch 1?`}
            </Text>
            {route === 'usagePreview' ? (
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
                  {confirming ? 'Recording…' : route === 'usagePreview' ? 'Record usage' : 'Confirm'}
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
  historyActivityCard: { flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 15, backgroundColor: '#EEEEEF' },
  historyActivityMarker: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFF1E2', marginRight: 10 },
  historyActivityGlyph: { color: colors.orange, fontFamily: font.semibold, fontSize: 18 },
  historyActivityCopy: { flex: 1 },
  historyActivityTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
  historyActivityDetail: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginTop: 3 },
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
  quickActions: { flexDirection: 'row', gap: 8, marginBottom: 21 },
  quickAction: {
    flex: 1, minWidth: 0, minHeight: 80, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 2, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.line, elevation: 2, shadowColor: colors.navy,
    shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  quickActionIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFF1E2', marginBottom: 4 },
  quickActionGlyph: { color: colors.orange, fontFamily: font.semibold, fontSize: 21, lineHeight: 25 },
  quickActionTitle: { color: colors.navy, fontFamily: font.medium, fontSize: 8, textAlign: 'center' },
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
  notificationList: { gap: 10 },
  notificationPageHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  markReadButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: '#FCE3EB', marginBottom: 17 },
  markReadText: { color: colors.pink, fontFamily: font.medium, fontSize: 8 },
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
