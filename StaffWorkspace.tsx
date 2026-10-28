import React, { useMemo, useState } from 'react';
import {
  Image,
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
  useWindowDimensions,
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
  emoji: string;
  tint: string;
};

const initialIngredients: Ingredient[] = [
  {
    id: 'octopus',
    name: 'Octopus',
    category: 'Seafood',
    quantity: 1.2,
    unit: 'kg',
    threshold: 2,
    lowStock: true,
    expiration: null,
    emoji: '🐙',
    tint: '#FCE9DE',
  },
  {
    id: 'flour',
    name: 'Flour',
    category: 'Dry Goods',
    quantity: 8,
    unit: 'kg',
    threshold: 3,
    lowStock: false,
    expiration: null,
    emoji: '🌾',
    tint: '#FFF1D8',
  },
  {
    id: 'eggs',
    name: 'Eggs',
    category: 'Dairy & Eggs',
    quantity: 2,
    unit: 'trays',
    threshold: 3,
    lowStock: true,
    expiration: 'Oct 30',
    emoji: '🥚',
    tint: '#FFF4D8',
  },
  {
    id: 'sauces',
    name: 'Sauces',
    category: 'Condiments',
    quantity: 4,
    unit: 'bottles',
    threshold: 2,
    lowStock: false,
    expiration: 'Oct 31',
    emoji: '🫙',
    tint: '#FBE7E9',
  },
];

const categories = ['All', 'Seafood', 'Dry Goods', 'Dairy & Eggs', 'Condiments'];
const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

function StatusBadge({ label, tone }: { label: string; tone: 'low' | 'good' | 'warning' }) {
  const toneStyle = tone === 'low' ? styles.lowBadge : tone === 'warning' ? styles.warningBadge : styles.goodBadge;
  const textStyle = tone === 'low' ? styles.lowBadgeText : tone === 'warning' ? styles.warningBadgeText : styles.goodBadgeText;
  return (
    <View style={[styles.statusBadge, toneStyle]}>
      <Text style={[styles.statusBadgeText, textStyle]}>{label}</Text>
    </View>
  );
}

function IngredientCard({
  item,
  onPress,
  compact = false,
  statusOverride,
}: {
  item: Ingredient;
  onPress?: () => void;
  compact?: boolean;
  statusOverride?: { label: string; tone: 'low' | 'good' | 'warning' };
}) {
  const Wrapper = onPress ? Pressable : View;
  const statusLabel = statusOverride?.label ?? (item.lowStock ? 'Low stock' : item.expiration ? 'Expiring soon' : 'In stock');
  const statusTone = statusOverride?.tone ?? (item.lowStock ? 'low' : item.expiration ? 'warning' : 'good');

  return (
    <Wrapper
      {...(onPress ? { onPress, accessibilityRole: 'button' as const } : {})}
      style={[styles.ingredientCard, !compact && styles.listIngredientCard]}
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
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#A0A0AA"
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.textInput, multiline && styles.notesInput]}
      />
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
  const { width } = useWindowDimensions();
  const wideForm = width >= 360;
  const [route, setRoute] = useState<StaffRoute>('dashboard');
  const [returnRoute, setReturnRoute] = useState<StaffTab>('stocks');
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedIngredientId, setSelectedIngredientId] = useState('');
  const [ingredientListOpen, setIngredientListOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [transactionDate, setTransactionDate] = useState<Date | null>(new Date());
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [reason, setReason] = useState('Cooking usage');
  const [reasonListOpen, setReasonListOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardMessage, setDashboardMessage] = useState('');
  const [readNotifications, setReadNotifications] = useState<string[]>(['activity-stock-in']);
  const [notificationPreferences, setNotificationPreferences] = useState({
    lowStock: true,
    expiration: true,
    activity: true,
  });

  const selectedIngredient = ingredients.find((item) => item.id === selectedIngredientId);
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
  const expiringItems = ingredients.filter((item) => item.expiration !== null);
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
  const dashboardMatches = (item: Ingredient) =>
    `${item.name} ${item.category}`.toLowerCase().includes(dashboardTerm);

  const navigate = (nextRoute: StaffTab) => {
    setRoute(nextRoute);
    setDashboardMessage('');
  };

  const openForm = (
    formRoute: 'stockIn' | 'stockOut',
    source: StaffTab = route === 'stockIn' || route === 'stockOut' ? 'stocks' : route,
  ) => {
    setReturnRoute(source);
    setSelectedIngredientId('');
    setIngredientListOpen(false);
    setQuantity('');
    setTransactionDate(new Date());
    setExpirationDate(null);
    setReason('Cooking usage');
    setReasonListOpen(false);
    setNotes('');
    setSuccessMessage('');
    setFormError('');
    setRoute(formRoute);
  };

  const returnFromForm = () => {
    setIngredientListOpen(false);
    setRoute(returnRoute);
    setSuccessMessage('');
    setFormError('');
  };

  const handleSave = () => {
    setSuccessMessage('');
    setFormError('');
    const parsedQuantity = Number(quantity);
    if (!selectedIngredient) {
      setFormError('Choose an ingredient to continue.');
      return;
    }
    if (!quantity.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setFormError('Enter a quantity greater than zero.');
      return;
    }
    if (!transactionDate) {
      setFormError('Choose a transaction date.');
      return;
    }
    if (route === 'stockOut' && parsedQuantity > selectedIngredient.quantity) {
      setFormError(`Only ${selectedIngredient.quantity} ${selectedIngredient.unit} available. Enter a smaller quantity.`);
      return;
    }

    setIngredients((current) =>
      current.map((item) => {
        if (item.id !== selectedIngredient.id) return item;
        const nextQuantity = route === 'stockIn'
          ? item.quantity + parsedQuantity
          : item.quantity - parsedQuantity;
        return {
          ...item,
          quantity: Number(nextQuantity.toFixed(2)),
          lowStock: nextQuantity < item.threshold,
          expiration:
            route === 'stockIn' && expirationDate
              ? expirationDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : item.expiration,
        };
      }),
    );
    setSuccessMessage(
      route === 'stockIn'
        ? `${parsedQuantity} ${selectedIngredient.unit} of ${selectedIngredient.name} added successfully.`
        : `${parsedQuantity} ${selectedIngredient.unit} of ${selectedIngredient.name} recorded successfully.`,
    );
  };

  const renderTopHeader = (title: string, subtitle?: string) => (
    <View style={styles.pageHeader}>
      <Text style={styles.pageTitle}>{title}</Text>
      {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
    </View>
  );

  const renderIngredientList = (items: Ingredient[], emptyText: string) =>
    items.length > 0 ? (
      <View style={styles.ingredientList}>
        {items.map((item) => (
          <IngredientCard key={item.id} item={item} onPress={() => openForm('stockOut', 'inventory')} />
        ))}
      </View>
    ) : (
      <Text style={styles.emptyState}>{emptyText}</Text>
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
        <Pressable onPress={() => navigate('inventory')}>
          <Text style={styles.viewAll}>View all ›</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalCards}>
        {lowStockItems.filter(dashboardMatches).map((item) => (
          <IngredientCard key={`low-${item.id}`} item={item} compact onPress={() => openForm('stockOut', 'dashboard')} />
        ))}
        {lowStockItems.filter(dashboardMatches).length === 0 && (
          <Text style={styles.emptyState}>No low-stock items match your search.</Text>
        )}
      </ScrollView>

      <View style={[styles.sectionHeadingRow, styles.expirationHeading]}>
        <Text style={styles.sectionTitle}>Nearing Expiration</Text>
        <Text style={styles.sectionHint}>{expiringItems.length} items</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalCards}>
        {expiringItems.filter(dashboardMatches).map((item) => (
          <IngredientCard
            key={`expiry-${item.id}`}
            item={item}
            compact
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
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.pageContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {renderTopHeader('Inventory', `${ingredients.length} ingredients in your branch`)}
      <SearchBar value={search} onChangeText={setSearch} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryList}
        style={styles.categoryScroll}
      >
        {categories.map((filter) => {
          const selected = filter === category;
          return (
            <Pressable
              key={filter}
              onPress={() => setCategory(filter)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.categoryChip, selected && styles.categoryChipSelected]}
            >
              <Text style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>{filter}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.inventorySectionHeading}>
        <Text style={styles.sectionTitle}>{category === 'All' ? 'All Ingredients' : category}</Text>
        <Text style={styles.sectionHint}>{visibleIngredients.length} items</Text>
      </View>
      {renderIngredientList(visibleIngredients, 'No ingredients match your search.')}
      <Text style={styles.demoNote}>DEMO PREVIEW · Inventory updates stay on this device only.</Text>
    </ScrollView>
  );

  const renderStocks = () => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
    >
      {renderTopHeader('Stocks', 'Manage ingredient movement')}
      <Text style={styles.sectionTitle}>Choose an action</Text>
      <Text style={styles.stocksIntro}>Keep your Manila Branch stock records up to date.</Text>
      <View style={styles.stockActionList}>
        <ActionCard
          title="Stock-In"
          description="Record newly received ingredients"
          icon="+"
          onPress={() => openForm('stockIn', 'stocks')}
        />
        <ActionCard
          title="Stock-Out"
          description="Record usage, spoilage, or other stock"
          icon="↗"
          onPress={() => openForm('stockOut', 'stocks')}
        />
      </View>
      <View style={styles.stockTip}>
        <Text style={styles.stockTipIcon}>i</Text>
        <Text style={styles.stockTipText}>Transactions are saved as a local demo and do not reach a live inventory.</Text>
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
          {selectedIngredient ? selectedIngredient.name : 'Select an ingredient'}
        </Text>
        {selectedIngredient && route === 'stockOut' ? (
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
        <Text style={styles.formTitle}>Stock-In</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
        {renderIngredientSelector()}
        <View style={[styles.formRow, wideForm && styles.formRowWide]}>
          <View style={styles.rowField}>
            <TextField
              label="Quantity Received *"
              value={quantity}
              onChangeText={(value) => { setQuantity(value); setFormError(''); setSuccessMessage(''); }}
              placeholder="Enter quantity"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.rowField}>
            <DatePickerField
              label="Transaction Date *"
              value={transactionDate}
              onChange={(date) => { setTransactionDate(date); setFormError(''); setSuccessMessage(''); }}
            />
          </View>
        </View>
        <DatePickerField
          label="Expiration Date (optional)"
          value={expirationDate}
          onChange={(date) => { setExpirationDate(date); setSuccessMessage(''); }}
        />
        <Text style={styles.helperText}>Choose an expiration date if the ingredient has a limited shelf life.</Text>
        <TextField
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Add a note"
          multiline
        />
        <View style={styles.formButtons}>
          <Pressable accessibilityRole="button" onPress={handleSave} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
            <Text style={styles.saveButtonText}>Save Stock-In</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={returnFromForm} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
        <Text style={styles.formDemoNote}>Local demo only · No live stock record will be created.</Text>
      </ScrollView>
    </>
  );

  const renderStockOutForm = () => (
    <>
      <View style={styles.formHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={returnFromForm} style={styles.backButton}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.formTitle}>Stock-Out</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
        {renderIngredientSelector()}
        <View style={[styles.formRow, wideForm && styles.formRowWide]}>
          <View style={styles.rowField}>
            <TextField
              label="Quantity Used *"
              value={quantity}
              onChangeText={(value) => { setQuantity(value); setFormError(''); setSuccessMessage(''); }}
              placeholder="Enter quantity"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.rowField}>
            <DatePickerField
              label="Transaction Date *"
              value={transactionDate}
              onChange={(date) => { setTransactionDate(date); setFormError(''); setSuccessMessage(''); }}
            />
          </View>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Reason *</Text>
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
              {['Cooking usage', 'Spoilage', 'Other'].map((option) => (
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
        <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Add a note" multiline />
        <View style={styles.formButtons}>
          <Pressable accessibilityRole="button" onPress={handleSave} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
            <Text style={styles.saveButtonText}>Save Stock-Out</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={returnFromForm} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
        <Text style={styles.formDemoNote}>Local demo only · No live stock record will be created.</Text>
      </ScrollView>
    </>
  );

  let screenContent: React.ReactNode;
  switch (route) {
    case 'dashboard':
      screenContent = renderDashboard();
      break;
    case 'inventory':
      screenContent = renderInventory();
      break;
    case 'stocks':
      screenContent = renderStocks();
      break;
    case 'stockIn':
      screenContent = renderStockInForm();
      break;
    case 'stockOut':
      screenContent = renderStockOutForm();
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  workspace: { flex: 1, backgroundColor: colors.white },
  screenArea: { flex: 1, minHeight: 0 },
  scroll: { flex: 1 },
  dashboardContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 20 },
  pageContent: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 24 },
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
  horizontalCards: { gap: 9, paddingBottom: 2 },
  ingredientCard: {
    minHeight: 116, width: 206, flexDirection: 'row', alignItems: 'center', padding: 9,
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
  statusBadgeText: { fontFamily: font.medium, fontSize: 7 },
  lowBadge: { backgroundColor: colors.yellow },
  lowBadgeText: { color: colors.navy },
  warningBadge: { backgroundColor: colors.paleRed },
  warningBadgeText: { color: colors.red },
  goodBadge: { backgroundColor: colors.paleGreen },
  goodBadgeText: { color: colors.green },
  cardChevron: { color: '#B5B5BF', fontFamily: font.regular, fontSize: 19, marginLeft: 3 },
  viewAll: { color: colors.pink, fontFamily: font.semibold, fontSize: 9 },
  expirationHeading: { marginTop: 20 },
  demoNote: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 22 },
  pageHeader: { marginBottom: 17 },
  pageTitle: { color: colors.ink, fontFamily: font.semibold, fontSize: 22, lineHeight: 29 },
  pageSubtitle: { color: colors.muted, fontFamily: font.regular, fontSize: 10, marginTop: 2 },
  categoryScroll: { flexGrow: 0, marginBottom: 19 },
  categoryList: { gap: 8, paddingRight: 6 },
  categoryChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.pale, borderWidth: 1, borderColor: colors.pale },
  categoryChipSelected: { backgroundColor: colors.pink, borderColor: colors.pink },
  categoryChipText: { color: colors.muted, fontFamily: font.medium, fontSize: 9 },
  categoryChipTextSelected: { color: colors.white },
  inventorySectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  ingredientList: { gap: 10 },
  emptyState: { color: colors.muted, fontFamily: font.regular, fontSize: 10, lineHeight: 16, paddingVertical: 15 },
  stocksIntro: { color: colors.muted, fontFamily: font.regular, fontSize: 10, lineHeight: 16, marginTop: 3 },
  stockActionList: { gap: 14, marginTop: 21 },
  actionCard: {
    minHeight: 120, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, paddingVertical: 18,
    borderRadius: 19, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line,
    elevation: 3, shadowColor: colors.navy, shadowOpacity: 0.07, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  actionIconBox: { width: 53, height: 53, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#FFF1E2', marginRight: 14 },
  actionIcon: { color: colors.orange, fontFamily: font.medium, fontSize: 30, lineHeight: 34 },
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
    minHeight: 57, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  backButton: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.pale },
  backGlyph: { color: colors.navy, fontSize: 30, lineHeight: 32, marginTop: -3 },
  formTitle: { flex: 1, color: colors.ink, fontFamily: font.semibold, fontSize: 17, textAlign: 'center', marginRight: 37 },
  headerSpacer: { width: 0 },
  formError: { color: colors.red, fontFamily: font.medium, fontSize: 10, lineHeight: 15, padding: 10, borderRadius: 10, backgroundColor: colors.paleRed, marginBottom: 13 },
  successBanner: { flexDirection: 'row', alignItems: 'center', padding: 11, borderRadius: 11, backgroundColor: colors.paleGreen, marginBottom: 14 },
  successIcon: { color: colors.green, fontFamily: font.bold, fontSize: 16, marginRight: 8 },
  successText: { flex: 1, color: '#286D45', fontFamily: font.medium, fontSize: 9, lineHeight: 14 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { color: colors.navy, fontFamily: font.medium, fontSize: 10, marginBottom: 6 },
  textInput: {
    minHeight: 45, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11,
    borderWidth: 1, borderColor: '#E9E9ED', backgroundColor: '#FAFAFB',
    color: colors.ink, fontFamily: font.regular, fontSize: 10,
  },
  notesInput: { minHeight: 76 },
  dateInput: {
    minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: '#E9E9ED', backgroundColor: '#FAFAFB',
  },
  dateInputText: { color: colors.ink, fontFamily: font.regular, fontSize: 10 },
  placeholderText: { color: '#A0A0AA' },
  calendarGlyph: { color: colors.orange, fontSize: 17 },
  formRow: { flexDirection: 'column', gap: 0 },
  formRowWide: { flexDirection: 'row', gap: 12 },
  rowField: { flex: 1, minWidth: 0 },
  helperText: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginTop: -8, marginBottom: 14 },
  selectInput: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    borderRadius: 11, borderWidth: 1, borderColor: '#E9E9ED', backgroundColor: '#FAFAFB',
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
