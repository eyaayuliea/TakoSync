import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import BottomNavigation, { type StaffTab } from '../navigation/BottomNavigation';
import {
  branchLabel,
  formatOwnerDate,
  getIngredientStatus,
  isNearExpiry,
  ownerActivities,
  ownerBranches,
  ownerCategories,
  type OwnerBranch,
  type OwnerBranchId,
  type OwnerCategory,
  type OwnerIngredient,
  type OwnerInventoryStatus,
} from './mockData';

type OwnerPage =
  | 'dashboard'
  | 'branchPicker'
  | 'inventory'
  | 'details'
  | 'itemManagement'
  | 'stocks'
  | 'notifications'
  | 'settings';
type BaseTab = Extract<OwnerPage, 'dashboard' | 'inventory' | 'stocks' | 'notifications'>;

const FONT = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

function alertSummary(branch: OwnerBranch) {
  const low = branch.ingredients.filter((item) => item.quantity <= item.minimumStock).length;
  const expiring = branch.ingredients.filter(isNearExpiry).length;
  if (low === 0 && expiring === 0) return 'No stock alerts';
  return `${low} low stock · ${expiring} expiring`;
}

function statusStyle(status: OwnerInventoryStatus) {
  if (status === 'Low stock') return { backgroundColor: '#FCE9EB', color: '#C92F3C' };
  if (status === 'Near expiry') return { backgroundColor: '#FFF2C4', color: '#8D6414' };
  return { backgroundColor: '#E8F6EC', color: '#2F8C57' };
}

function StatusBadge({ status }: { status: OwnerInventoryStatus }) {
  const tone = statusStyle(status);
  return (
    <View style={[styles.statusBadge, { backgroundColor: tone.backgroundColor }]}>
      <Text style={[styles.statusText, { color: tone.color }]}>{status}</Text>
    </View>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.searchField}>
      <Text style={styles.searchIcon}>⌕</Text>
      <TextInput
        accessibilityLabel="Search inventory"
        value={value}
        onChangeText={onChange}
        placeholder="Search ingredients"
        placeholderTextColor="#858591"
        style={styles.searchInput}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value !== '' && (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChange('')}>
          <Text style={styles.clearSearch}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

function IngredientCard({
  ingredient,
  branch,
  statusOverride,
  showExpiration = false,
  onPress,
}: {
  ingredient: OwnerIngredient;
  branch: OwnerBranch;
  statusOverride?: OwnerInventoryStatus;
  showExpiration?: boolean;
  onPress: () => void;
}) {
  const status = statusOverride ?? getIngredientStatus(ingredient);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ingredient.name}, ${ingredient.quantity} ${ingredient.unit}, ${status}, ${branchLabel(branch)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.ingredientCard, pressed && styles.pressed]}
    >
      <View style={styles.ingredientThumbnail}>
        <Text style={styles.ingredientEmoji}>{ingredient.emoji}</Text>
      </View>
      <View style={styles.ingredientCopy}>
        <Text style={styles.branchEyebrow}>{branchLabel(branch)}</Text>
        <Text style={styles.ingredientName} numberOfLines={1}>{ingredient.name}</Text>
        <Text style={styles.ingredientCategory} numberOfLines={1}>
          {showExpiration && ingredient.expirationDate
            ? `${ingredient.category} · Exp. ${formatOwnerDate(ingredient.expirationDate)}`
            : ingredient.category}
        </Text>
      </View>
      <View style={styles.quantityColumn}>
        <Text style={styles.quantityText}>{ingredient.quantity} {ingredient.unit}</Text>
        <StatusBadge status={status} />
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function BranchCard({
  branch,
  selected,
  onPress,
}: {
  branch: OwnerBranch;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={`${branchLabel(branch)}. ${branch.ingredients.length} ingredients. ${alertSummary(branch)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.branchCard,
        selected && styles.branchCardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.branchIcon}>
        <View style={styles.pinHead}><View style={styles.pinDot} /></View>
        <View style={styles.pinTail} />
      </View>
      <View style={styles.branchCopy}>
        <Text style={styles.branchName}>{branchLabel(branch)}</Text>
        <Text style={styles.branchMeta}>{branch.ingredients.length} ingredients</Text>
        <Text style={styles.branchAlerts}>{alertSummary(branch)}</Text>
      </View>
      {selected ? <Text style={styles.selectedCheck}>✓</Text> : <Text style={styles.chevron}>›</Text>}
    </Pressable>
  );
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction && (
        <Pressable accessibilityRole="button" onPress={onAction}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ActivityRow({ activity }: { activity: (typeof ownerActivities)[number] }) {
  const branch = ownerBranches.find((item) => item.id === activity.branchId);
  return (
    <View style={styles.activityRow}>
      <View style={styles.activityMark}><Text style={styles.activityMarkText}>↗</Text></View>
      <View style={styles.activityCopy}>
        <Text style={styles.activityTitle}>{activity.kind} · {activity.ingredient}</Text>
        <Text style={styles.activityDetail}>
          {branch ? branchLabel(branch) : 'Branch'} · {activity.quantity} · {activity.time}
        </Text>
      </View>
    </View>
  );
}

export default function OwnerWorkspace({ onExitPreview }: { onExitPreview: () => void }) {
  const [page, setPage] = useState<OwnerPage>('dashboard');
  const [branchId, setBranchId] = useState<OwnerBranchId | null>(null);
  const [pickerReturn, setPickerReturn] = useState<'dashboard' | 'inventory'>('dashboard');
  const [selectedBranchId, setSelectedBranchId] = useState<OwnerBranchId>('branch-1');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'All' | OwnerCategory>('All');
  const [selectedIngredient, setSelectedIngredient] = useState<OwnerIngredient | null>(null);

  const inventoryBranches = branchId
    ? ownerBranches.filter((branch) => branch.id === branchId)
    : ownerBranches;
  const visibleIngredients = useMemo(
    () => inventoryBranches.flatMap((branch) => branch.ingredients
      .filter((ingredient) => category === 'All' || ingredient.category === category)
      .filter((ingredient) => `${ingredient.name} ${ingredient.category} ${branchLabel(branch)}`
        .toLowerCase().includes(search.trim().toLowerCase()))
      .map((ingredient) => ({ branch, ingredient }))),
    [category, inventoryBranches, search],
  );
  const lowStock = ownerBranches.flatMap((branch) =>
    branch.ingredients
      .filter((item) => item.quantity <= item.minimumStock)
      .map((ingredient) => ({ branch, ingredient })));
  const nearExpiry = ownerBranches.flatMap((branch) =>
    branch.ingredients
      .filter(isNearExpiry)
      .map((ingredient) => ({ branch, ingredient })));
  const totalAlerts = lowStock.length + nearExpiry.length;

  const openBranchPicker = (from: 'dashboard' | 'inventory') => {
    setPickerReturn(from);
    setSelectedBranchId(branchId ?? 'branch-1');
    setPage('branchPicker');
  };

  const showInventory = (id: OwnerBranchId | null) => {
    setBranchId(id);
    setSearch('');
    setCategory('All');
    setPage('inventory');
  };

  const navigateTab = (tab: StaffTab) => {
    if (tab === 'dashboard') {
      setBranchId(null);
      setPage('dashboard');
    } else if (tab === 'inventory') {
      setPage('inventory');
    } else if (tab === 'stocks') {
      setPage('stocks');
    } else if (tab === 'notifications') {
      setPage('notifications');
    } else {
      setPage('settings');
    }
  };

  const openIngredient = (ingredient: OwnerIngredient, branch?: OwnerBranch) => {
    if (branch) setBranchId(branch.id);
    setSelectedIngredient(ingredient);
    setPage('details');
  };

  const selectedTab: StaffTab = page === 'branchPicker' || page === 'details' || page === 'itemManagement'
    ? page === 'branchPicker' && pickerReturn === 'dashboard' ? 'dashboard' : 'inventory'
    : page === 'settings' ? 'more' : page as BaseTab;

  return (
    <View style={styles.screen}>
      {page === 'dashboard' && (
        <ScrollView style={styles.flex} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
          <View style={styles.dashboardHeader}>
            <View>
              <Text style={styles.hello}>Hello, Gelo!</Text>
              <Text style={styles.subheading}>Owner access · all three branches</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose a branch"
              onPress={() => openBranchPicker('dashboard')}
              style={styles.headerBranchButton}
            >
              <Text style={styles.headerBranchIcon}>⌖</Text>
            </Pressable>
          </View>

          <View style={styles.previewLabel}>
            <View style={styles.previewDot} />
            <Text style={styles.previewLabelText}>DEVELOPMENT PREVIEW · SAMPLE DATA</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryEyebrow}>ALL BRANCHES AT A GLANCE</Text>
              <View style={styles.summaryCountRow}>
                <Text style={styles.summaryCount}>3</Text>
                <Text style={styles.summaryCountLabel}>branches monitored</Text>
              </View>
              <Text style={styles.summaryAlert}>
                {totalAlerts} stock alerts · {nearExpiry.length} expiration warnings
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => showInventory(null)}
                style={styles.summaryAction}
              >
                <Text style={styles.summaryActionText}>View inventory</Text>
                <Text style={styles.summaryActionText}>›</Text>
              </Pressable>
            </View>
            <View style={styles.summaryImageWrap}>
              <Image
                source={require('../../assets/takoyaki-plate.png')}
                style={styles.summaryImage}
                resizeMode="cover"
                accessibilityLabel="Takoyaki"
              />
            </View>
          </View>

          <SectionTitle title="Branch overview" action="Choose" onAction={() => openBranchPicker('dashboard')} />
          {ownerBranches.map((branch) => (
            <BranchCard key={branch.id} branch={branch} onPress={() => showInventory(branch.id)} />
          ))}

          <SectionTitle title="Low-Stock Items" action="View all" onAction={() => showInventory(null)} />
          {lowStock.map(({ branch, ingredient }) => (
            <IngredientCard
              key={`${branch.id}-${ingredient.id}-low`}
              branch={branch}
              ingredient={ingredient}
              onPress={() => openIngredient(ingredient, branch)}
            />
          ))}

          <SectionTitle title="Nearing Expiration" action="View all" onAction={() => showInventory(null)} />
          {nearExpiry.length > 0 ? nearExpiry.map(({ branch, ingredient }) => (
            <IngredientCard
              key={`${branch.id}-${ingredient.id}-expiry`}
              branch={branch}
              ingredient={ingredient}
              statusOverride="Near expiry"
              showExpiration
              onPress={() => openIngredient(ingredient, branch)}
            />
          )) : <Text style={styles.emptyText}>No sample items are nearing expiration.</Text>}

          <SectionTitle title="Recent Activities" action="All activity" onAction={() => setPage('stocks')} />
          <Text style={styles.activityDate}>29 October 2026 · Sample activity</Text>
          {ownerActivities.map((activity) => <ActivityRow key={activity.id} activity={activity} />)}
          <Text style={styles.lastUpdated}>Sample data last updated 29 Oct 2026 · 10:30 AM</Text>
        </ScrollView>
      )}

      {page === 'branchPicker' && (
        <ScrollView style={styles.flex} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
          <PageHeader title="Choose a branch" subtitle="Owner access · all three branches" onBack={() => setPage(pickerReturn)} />
          <Text style={styles.introText}>Monitor inventory records for each of your three branches.</Text>
          {ownerBranches.map((branch) => (
            <BranchCard
              key={branch.id}
              branch={branch}
              selected={selectedBranchId === branch.id}
              onPress={() => setSelectedBranchId(branch.id)}
            />
          ))}
          <View style={styles.infoBanner}>
            <Text style={styles.infoIcon}>i</Text>
            <Text style={styles.infoText}>
              Changing branches changes the records you are viewing. Master ingredient information is shared.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => showInventory(selectedBranchId)}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>View selected branch</Text>
          </Pressable>
        </ScrollView>
      )}

      {page === 'inventory' && (
        <View style={styles.flex}>
          <View style={styles.inventoryHeader}>
            <PageHeader
              title="Inventory"
              subtitle={branchId
                ? `Owner access · ${branchLabel(ownerBranches.find((branch) => branch.id === branchId) ?? ownerBranches[0])}`
                : 'Owner access · all three branches'}
              onBack={() => {
                if (branchId) setBranchId(null);
                else setPage('dashboard');
              }}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change branch"
                  onPress={() => openBranchPicker('inventory')}
                  style={styles.changeBranch}
                >
                  <Text style={styles.changeBranchText}>{branchId ? 'Change' : 'Branches'}⌄</Text>
                </Pressable>
              }
            />
            <SearchField value={search} onChange={setSearch} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {ownerCategories.map((item) => {
                const active = category === item;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setCategory(item)}
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                  >
                    <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{item}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.inventoryCount}>
              {visibleIngredients.length} ingredients · {branchId
                ? branchLabel(ownerBranches.find((branch) => branch.id === branchId) ?? ownerBranches[0])
                : 'All branches'}
            </Text>
          </View>
          <ScrollView contentContainerStyle={styles.inventoryList} keyboardShouldPersistTaps="handled">
            {visibleIngredients.length > 0 ? visibleIngredients.map(({ branch, ingredient }) => (
              <IngredientCard
                key={`${branch.id}-${ingredient.id}`}
                branch={branch}
                ingredient={ingredient}
                onPress={() => openIngredient(ingredient, branch)}
              />
            )) : <Text style={styles.emptyText}>No ingredients match this search and category.</Text>}
          </ScrollView>
        </View>
      )}

      {page === 'details' && selectedIngredient && (
        <ScrollView style={styles.flex} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
          <PageHeader title="Ingredient details" subtitle={branchId ? 'Owner inventory view' : 'All branches · sample record'} onBack={() => setPage('inventory')} />
          <View style={styles.detailHero}>
            <View style={styles.detailEmojiWrap}><Text style={styles.detailEmoji}>{selectedIngredient.emoji}</Text></View>
            <Text style={styles.detailName}>{selectedIngredient.name}</Text>
            <Text style={styles.detailCategory}>{selectedIngredient.category}</Text>
            <StatusBadge status={getIngredientStatus(selectedIngredient)} />
          </View>
          <View style={styles.quantitySummary}>
            <Text style={styles.summaryEyebrow}>CURRENT QUANTITY</Text>
            <Text style={styles.detailQuantity}>{selectedIngredient.quantity} {selectedIngredient.unit}</Text>
            <Text style={styles.summaryDetail}>Recorded available stock</Text>
          </View>
          <View style={styles.detailsCard}>
            <DetailRow label="Minimum stock" value={`${selectedIngredient.minimumStock} ${selectedIngredient.unit}`} />
            <DetailRow
              label="Stock gap"
              value={selectedIngredient.quantity < selectedIngredient.minimumStock
                ? `${(selectedIngredient.minimumStock - selectedIngredient.quantity).toFixed(2).replace(/\.?0+$/, '')} ${selectedIngredient.unit} below minimum`
                : `${(selectedIngredient.quantity - selectedIngredient.minimumStock).toFixed(2).replace(/\.?0+$/, '')} ${selectedIngredient.unit} above minimum`}
            />
            <DetailRow
              label="Branch"
              value={branchId ? branchLabel(ownerBranches.find((branch) => branch.id === branchId) ?? ownerBranches[0]) : 'All branches · sample'}
            />
            <DetailRow label="Inventory unit" value={selectedIngredient.unit} />
            <DetailRow label="Received batch" value={selectedIngredient.receivedBatch} />
            <DetailRow label="Expiration date" value={selectedIngredient.expirationDate ? formatOwnerDate(selectedIngredient.expirationDate) : 'Not recorded'} />
            <DetailRow label="Last updated" value={selectedIngredient.lastUpdated} last />
          </View>
          <View style={styles.infoBanner}>
            <Text style={styles.infoIcon}>i</Text>
            <Text style={styles.infoText}>Master ingredient information is managed by the Owner. This preview does not save changes.</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={() => setPage('itemManagement')}>
            <Text style={styles.primaryButtonText}>Open item management</Text>
          </Pressable>
        </ScrollView>
      )}

      {page === 'itemManagement' && (
        <ScrollView style={styles.flex} contentContainerStyle={styles.pageContent}>
          <PageHeader title="Item management" subtitle="Owner preview" onBack={() => setPage('details')} />
          <View style={styles.infoBanner}>
            <Text style={styles.infoIcon}>i</Text>
            <Text style={styles.infoText}>
              Ingredient management is not connected. Your backend teammate can connect this screen to the authorized item-management workflow.
            </Text>
          </View>
          {selectedIngredient && (
            <View style={styles.detailsCard}>
              <DetailRow label="Ingredient" value={selectedIngredient.name} />
              <DetailRow label="Category" value={selectedIngredient.category} />
              <DetailRow label="Unit" value={selectedIngredient.unit} last />
            </View>
          )}
        </ScrollView>
      )}

      {page === 'stocks' && (
        <ScrollView style={styles.flex} contentContainerStyle={styles.pageContent}>
          <PageHeader title="Stocks" subtitle="Owner access · sample activity" />
          <View style={styles.infoBanner}>
            <Text style={styles.infoIcon}>i</Text>
            <Text style={styles.infoText}>Activity below is mock data for the frontend preview, not synchronized stock records.</Text>
          </View>
          <Text style={styles.activityDate}>29 October 2026</Text>
          {ownerActivities.map((activity) => <ActivityRow key={activity.id} activity={activity} />)}
        </ScrollView>
      )}

      {page === 'notifications' && (
        <ScrollView style={styles.flex} contentContainerStyle={styles.pageContent}>
          <PageHeader title="Notifications" subtitle="Owner access · all three branches" />
          <SectionTitle title="Stock alerts" />
          {[...lowStock, ...nearExpiry].map(({ branch, ingredient }) => (
            <IngredientCard
              key={`${branch.id}-${ingredient.id}-notification`}
              branch={branch}
              ingredient={ingredient}
              onPress={() => {
                setBranchId(branch.id);
                openIngredient(ingredient, branch);
              }}
            />
          ))}
          {totalAlerts === 0 && <Text style={styles.emptyText}>No sample alerts.</Text>}
        </ScrollView>
      )}

      {page === 'settings' && (
        <ScrollView style={styles.flex} contentContainerStyle={styles.pageContent}>
          <PageHeader title="Settings" subtitle="Owner preview" />
          <View style={styles.detailsCard}>
            <DetailRow label="Access" value="Development preview" />
            <DetailRow label="Data source" value="Local sample data" last />
          </View>
          <Pressable style={styles.secondaryButton} onPress={onExitPreview}>
            <Text style={styles.secondaryButtonText}>Return to welcome screen</Text>
          </Pressable>
        </ScrollView>
      )}

      <BottomNavigation active={selectedTab} onSelect={navigateTab} showMenu={false} />
    </View>
  );
}

function PageHeader({
  title,
  subtitle,
  onBack,
  trailing,
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      {onBack && (
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.pageBack}>
          <Text style={styles.pageBackText}>‹</Text>
        </Pressable>
      )}
      <View style={styles.pageHeadingCopy}>
        <Text style={styles.pageTitle}>{title}</Text>
        <Text style={styles.subheading}>{subtitle}</Text>
      </View>
      {trailing}
    </View>
  );
}

function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  pageContent: { paddingHorizontal: 17, paddingTop: 16, paddingBottom: 22 },
  dashboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  hello: { color: '#101027', fontFamily: FONT.bold, fontSize: 20 },
  subheading: { color: '#858591', fontFamily: FONT.regular, fontSize: 10, marginTop: 2 },
  headerBranchButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBranchIcon: { color: '#FF9418', fontSize: 24, lineHeight: 28 },
  previewLabel: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  previewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF9418', marginRight: 6 },
  previewLabelText: { color: '#858591', fontFamily: FONT.semibold, fontSize: 8, letterSpacing: 0.4 },
  summaryCard: {
    minHeight: 156,
    borderRadius: 22,
    backgroundColor: '#101027',
    padding: 17,
    marginBottom: 20,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryCopy: { flex: 1, zIndex: 1, paddingRight: 4 },
  summaryEyebrow: { color: '#FF9418', fontFamily: FONT.semibold, fontSize: 8, letterSpacing: 0.35 },
  summaryCountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  summaryCount: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 36, lineHeight: 42, marginRight: 8 },
  summaryCountLabel: { color: '#FFFFFF', fontFamily: FONT.medium, fontSize: 10 },
  summaryAlert: { color: '#D5D5DF', fontFamily: FONT.regular, fontSize: 8, marginTop: 1 },
  summaryAction: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 7,
    marginTop: 11,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F20D55',
  },
  summaryActionText: { color: '#FFFFFF', fontFamily: FONT.semibold, fontSize: 8 },
  summaryImageWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
    marginLeft: 5,
  },
  summaryImage: { width: '100%', height: '100%' },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
    marginBottom: 9,
  },
  sectionTitle: { color: '#101027', fontFamily: FONT.semibold, fontSize: 14 },
  sectionAction: { color: '#F20D55', fontFamily: FONT.semibold, fontSize: 9 },
  branchCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderWidth: 1,
    borderColor: '#EEEEF1',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  branchCardSelected: { borderWidth: 1.5, borderColor: '#F20D55', backgroundColor: '#FFF5F8' },
  branchIcon: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  pinHead: {
    width: 18,
    height: 18,
    borderRadius: 10,
    borderWidth: 1.8,
    borderColor: '#FF9418',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: { width: 5, height: 5, borderRadius: 3, borderWidth: 1.4, borderColor: '#FF9418' },
  pinTail: {
    position: 'absolute',
    bottom: 1,
    width: 8,
    height: 8,
    borderRightWidth: 1.8,
    borderBottomWidth: 1.8,
    borderColor: '#FF9418',
    transform: [{ rotate: '45deg' }],
  },
  branchCopy: { flex: 1 },
  branchName: { color: '#101027', fontFamily: FONT.semibold, fontSize: 11 },
  branchMeta: { color: '#858591', fontFamily: FONT.regular, fontSize: 8, marginTop: 2 },
  branchAlerts: { color: '#C92F3C', fontFamily: FONT.medium, fontSize: 8, marginTop: 2 },
  selectedCheck: { color: '#F20D55', fontFamily: FONT.bold, fontSize: 17, marginHorizontal: 4 },
  chevron: { color: '#FF9418', fontFamily: FONT.medium, fontSize: 23, lineHeight: 25, marginLeft: 7 },
  ingredientCard: {
    minHeight: 69,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 8,
    marginBottom: 7,
  },
  pressed: { opacity: 0.78 },
  ingredientThumbnail: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  ingredientEmoji: { fontSize: 22 },
  ingredientCopy: { flex: 1, minWidth: 0 },
  branchEyebrow: { color: '#858591', fontFamily: FONT.medium, fontSize: 7, marginBottom: 1 },
  ingredientName: { color: '#101027', fontFamily: FONT.semibold, fontSize: 10 },
  ingredientCategory: { color: '#858591', fontFamily: FONT.regular, fontSize: 8, marginTop: 1 },
  quantityColumn: { alignItems: 'flex-end', maxWidth: 112 },
  quantityText: { color: '#101027', fontFamily: FONT.semibold, fontSize: 9, marginBottom: 4 },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' },
  statusText: { fontFamily: FONT.medium, fontSize: 7 },
  emptyText: { color: '#858591', fontFamily: FONT.regular, fontSize: 10, marginVertical: 10 },
  activityDate: { color: '#858591', fontFamily: FONT.medium, fontSize: 8, marginBottom: 8 },
  activityRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEEEF1',
  },
  activityMark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF1E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  activityMarkText: { color: '#FF9418', fontFamily: FONT.semibold, fontSize: 15 },
  activityCopy: { flex: 1 },
  activityTitle: { color: '#101027', fontFamily: FONT.medium, fontSize: 9 },
  activityDetail: { color: '#858591', fontFamily: FONT.regular, fontSize: 8, marginTop: 3 },
  lastUpdated: { color: '#858591', fontFamily: FONT.regular, fontSize: 8, textAlign: 'center', marginTop: 14 },
  pageHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  pageBack: {
    width: 32,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginRight: 4,
  },
  pageBackText: { color: '#101027', fontFamily: FONT.medium, fontSize: 29, lineHeight: 32 },
  pageHeadingCopy: { flex: 1 },
  pageTitle: { color: '#101027', fontFamily: FONT.bold, fontSize: 18 },
  introText: { color: '#858591', fontFamily: FONT.regular, fontSize: 10, lineHeight: 16, marginBottom: 14 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    backgroundColor: '#EFEEFA',
    padding: 12,
    marginTop: 10,
    marginBottom: 13,
  },
  infoIcon: {
    width: 17,
    height: 17,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: '#595EC0',
    color: '#FFFFFF',
    fontFamily: FONT.bold,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
    marginRight: 9,
  },
  infoText: { flex: 1, color: '#38384A', fontFamily: FONT.regular, fontSize: 9, lineHeight: 14 },
  primaryButton: {
    height: 46,
    borderRadius: 24,
    backgroundColor: '#F20D55',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  primaryButtonText: { color: '#FFFFFF', fontFamily: FONT.semibold, fontSize: 11 },
  secondaryButton: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#F20D55',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  secondaryButtonText: { color: '#F20D55', fontFamily: FONT.semibold, fontSize: 10 },
  inventoryHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 7 },
  changeBranch: { paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#FFF1E2', borderRadius: 14 },
  changeBranchText: { color: '#A86708', fontFamily: FONT.semibold, fontSize: 8 },
  searchField: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#F5F5F7',
    paddingHorizontal: 11,
    marginBottom: 9,
  },
  searchIcon: { color: '#FF9418', fontSize: 21, lineHeight: 24, marginRight: 7 },
  searchInput: { flex: 1, height: '100%', color: '#101027', fontFamily: FONT.regular, fontSize: 10 },
  clearSearch: { color: '#858591', fontSize: 19, paddingHorizontal: 3 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingRight: 5 },
  categoryChip: {
    height: 29,
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChipActive: { backgroundColor: '#F20D55' },
  categoryText: { color: '#555560', fontFamily: FONT.medium, fontSize: 8 },
  categoryTextActive: { color: '#FFFFFF' },
  inventoryCount: { color: '#858591', fontFamily: FONT.medium, fontSize: 8, marginTop: 9 },
  inventoryList: { paddingHorizontal: 16, paddingTop: 5, paddingBottom: 14 },
  detailHero: {
    alignItems: 'center',
    paddingVertical: 15,
    backgroundColor: '#F5F5F7',
    borderRadius: 18,
    marginBottom: 10,
  },
  detailEmojiWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  detailEmoji: { fontSize: 38 },
  detailName: { color: '#101027', fontFamily: FONT.bold, fontSize: 16 },
  detailCategory: { color: '#858591', fontFamily: FONT.regular, fontSize: 9, marginTop: 2, marginBottom: 8 },
  quantitySummary: { padding: 15, borderRadius: 16, backgroundColor: '#F5F5F7', marginBottom: 9 },
  detailQuantity: { color: '#101027', fontFamily: FONT.bold, fontSize: 30, marginTop: 2 },
  summaryDetail: { color: '#858591', fontFamily: FONT.regular, fontSize: 8 },
  detailsCard: { borderRadius: 15, backgroundColor: '#F5F5F7', paddingHorizontal: 13, marginBottom: 2 },
  detailRow: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDDEE3',
    gap: 8,
  },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { color: '#858591', fontFamily: FONT.regular, fontSize: 8 },
  detailValue: { flexShrink: 1, color: '#101027', fontFamily: FONT.medium, fontSize: 8, textAlign: 'right' },
});
