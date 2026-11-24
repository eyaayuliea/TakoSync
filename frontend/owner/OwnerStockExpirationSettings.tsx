import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  calendarDaysUntil,
  classifyExpirationLevel,
  classifyStockLevel,
  manilaCalendarDate,
  itemNearExpirationDays,
  resolveNearExpirationDays,
} from '../services/inventoryStatusRules.ts';
import { describeLotsForDisplay, lotExpiryTone, type LotDisplay } from '../services/fefoAllocation.ts';
import {
  DEFAULT_REPLENISHMENT_SETTINGS,
  SERVICE_LEVEL_OPTIONS,
  reorderPointSourceLabel,
  serviceLevelLabel,
  type ReplenishmentSettings,
} from '../services/reorderPoint.ts';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  loadStockExpirationSettings,
  updateBatchExpirationDate,
  updateBatchHold,
  saveReplenishmentSettings,
  updateIngredientExpirationTracking,
  updateMinimumStock,
  updateLotExpiryWindow,
  updateNearExpirationDays,
  type ExpirationBatchRecord,
  type StockExpirationSettingsData,
} from '../services/takosync';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';
import { secondaryOutline } from '../theme/buttonRoles';
import { ownerColors } from './shared/ownerTokens';
import AppIcon from '../theme/AppIcon';

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

type Props = {
  branchId: string | null;
  refreshing: boolean;
  onRefresh: () => void;
};

type StockRow = {
  key: string;
  branchId: string;
  branchName: string;
  ingredientId: string;
  ingredientName: string;
  category: string;
  unit: string;
  quantityPrecision: number;
  quantity: number;
  minimumStock: number;
};

type BatchRow = ExpirationBatchRecord & {
  ingredientName: string;
  unit: string;
  branchName: string;
};

type StockFilter = 'All' | 'At/below minimum' | 'In stock';
type ExpirationFilter = 'All batches' | 'With date' | 'Missing date';

function localDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysUntil(value: string) {
  return calendarDaysUntil(value, manilaCalendarDate());
}

function formatAmount(value: number, precision: number) {
  return value.toLocaleString('en-PH', { maximumFractionDigits: precision });
}

export default function OwnerStockExpirationSettings({ branchId, refreshing, onRefresh }: Props) {
  const styles = useStyles();
  const [data, setData] = useState<StockExpirationSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('All');
  const [expirationFilter, setExpirationFilter] = useState<ExpirationFilter>('All batches');
  const [editingThreshold, setEditingThreshold] = useState<string | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState('');
  const [savingThreshold, setSavingThreshold] = useState<string | null>(null);
  const [editingBatch, setEditingBatch] = useState<string | null>(null);
  const [expirationDraft, setExpirationDraft] = useState('');
  const [savingBatch, setSavingBatch] = useState<string | null>(null);
  const [savingTracking, setSavingTracking] = useState<string | null>(null);
  const [alertDaysDraft, setAlertDaysDraft] = useState('7');
  const [savingAlertDays, setSavingAlertDays] = useState(false);
  const [warningHoursDraft, setWarningHoursDraft] = useState('48');
  const [criticalHoursDraft, setCriticalHoursDraft] = useState('24');
  const [savingLotWindow, setSavingLotWindow] = useState(false);
  const [savingHold, setSavingHold] = useState<string | null>(null);
  const [editingReorder, setEditingReorder] = useState<string | null>(null);
  const [reorderDraft, setReorderDraft] = useState({ leadTimeDays: '', windowDays: '', minHistoryDays: '', shelfLifeDays: '', serviceLevelZ: 1.645 });
  const [savingReorder, setSavingReorder] = useState(false);
  const previousRefreshing = useRef(refreshing);

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const next = await loadStockExpirationSettings();
      setData(next);
      setAlertDaysDraft(String(next.nearExpirationDays));
      setWarningHoursDraft(String(next.lotExpiryWindow.warningHours));
      setCriticalHoursDraft(String(next.lotExpiryWindow.criticalHours));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load stock and expiration settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (refreshing && !previousRefreshing.current) void refresh();
    previousRefreshing.current = refreshing;
  }, [refreshing]);

  const rows = useMemo<StockRow[]>(() => {
    if (!data) return [];
    const branches = new Map(data.branches.map((branch) => [branch.id, branch.name]));
    const categories = new Map(data.categories.map((category) => [category.id, category.name]));
    const ingredients = new Map(data.ingredients.map((ingredient) => [ingredient.id, ingredient]));
    return data.inventory.flatMap((record) => {
      if (branchId && branchId !== record.branch_id) return [];
      const ingredient = ingredients.get(record.ingredient_id);
      const branchName = branches.get(record.branch_id);
      if (!ingredient || !branchName) return [];
      return [{
        key: `${record.branch_id}:${record.ingredient_id}`,
        branchId: record.branch_id,
        branchName,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        category: categories.get(ingredient.category_id) ?? 'Other',
        unit: ingredient.unit,
        quantityPrecision: ingredient.quantity_precision,
        quantity: record.quantity,
        minimumStock: record.minimum_stock,
      }];
    });
  }, [branchId, data]);

  const batches = useMemo<BatchRow[]>(() => {
    if (!data) return [];
    const branches = new Map(data.branches.map((branch) => [branch.id, branch.name]));
    const ingredients = new Map(data.ingredients.map((ingredient) => [ingredient.id, ingredient]));
    return data.batches.flatMap((batch) => {
      if (branchId && branchId !== batch.branch_id) return [];
      const ingredient = ingredients.get(batch.ingredient_id);
      const branchName = branches.get(batch.branch_id);
      if (!ingredient?.expiration_tracking || !branchName) return [];
      return [{ ...batch, ingredientName: ingredient.name, unit: ingredient.unit, branchName }];
    });
  }, [branchId, data]);

  // A1 FEFO: per branch and ingredient, the lot sales take from next and each lot's 48 h / 24 h colour.
  const lotDisplays = useMemo(() => {
    const result = new Map<string, LotDisplay<{ id: string; expirationDate: string | null; receivedDate: string; quantityRemaining: number; usable: boolean }>>();
    if (!data) return result;
    const groups = new Map<string, ExpirationBatchRecord[]>();
    for (const batch of data.batches) {
      const key = `${batch.branch_id}:${batch.ingredient_id}`;
      groups.set(key, [...(groups.get(key) ?? []), batch]);
    }
    const now = new Date();
    for (const group of groups.values()) {
      for (const lot of describeLotsForDisplay(group.map((batch) => ({
        id: batch.id,
        expirationDate: batch.expiration_date,
        receivedDate: batch.received_date,
        quantityRemaining: batch.quantity_remaining,
        usable: !data.heldLotIds.has(batch.id),
      })), now, data.lotExpiryWindow)) {
        result.set(lot.id, lot);
      }
    }
    return result;
  }, [data]);

  // A2: an item is low at or below its reorder point, which is never below the owner minimum.
  const thresholdFor = (item: StockRow) => Math.max(
    item.minimumStock,
    data?.reorderPoints.get(`${item.branchId}:${item.ingredientId}`)?.effectiveRop ?? item.minimumStock,
  );
  const lowRows = rows.filter((item) => classifyStockLevel(item.quantity, thresholdFor(item)) !== 'In Stock');
  const thresholdKeys = useMemo(() => new Set(lowRows.map((item) => item.key)), [lowRows]);
  // Each item has its own near-expiration window; the general setting is the fallback.
  const windowByIngredient = new Map((data?.ingredients ?? []).map((ingredient) => [
    ingredient.id, itemNearExpirationDays(ingredient.near_expiration_days, data?.nearExpirationDays),
  ]));
  const windowFor = (ingredientId: string) => windowByIngredient.get(ingredientId) ?? resolveNearExpirationDays(data?.nearExpirationDays);
  const batchStatuses = batches.flatMap((batch) => {
    if (!batch.expiration_date) return [];
    return [{ batch, days: daysUntil(batch.expiration_date) }];
  });
  const expiredCount = batchStatuses.filter((item) => classifyExpirationLevel(item.days, windowFor(item.batch.ingredient_id)) === 'Expired').length;
  const nearingCount = batchStatuses.filter((item) => classifyExpirationLevel(item.days, windowFor(item.batch.ingredient_id)) === 'Near Expiration').length;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleRows = rows.filter((item) => {
    const matchesSearch = `${item.ingredientName} ${item.category} ${item.branchName}`.toLocaleLowerCase().includes(normalizedSearch);
    const matchesStatus = stockFilter === 'All'
      || (stockFilter === 'At/below minimum'
        ? classifyStockLevel(item.quantity, thresholdFor(item)) !== 'In Stock'
        : classifyStockLevel(item.quantity, thresholdFor(item)) === 'In Stock');
    return matchesSearch && matchesStatus;
  });
  const visibleBatches = batches.filter((batch) => {
    const matchesSearch = `${batch.ingredientName} ${batch.branchName} ${batch.batch_reference} ${batch.expiration_date ?? ''}`.toLocaleLowerCase().includes(normalizedSearch);
    const matchesDate = expirationFilter === 'All batches'
      || (expirationFilter === 'With date' ? Boolean(batch.expiration_date) : !batch.expiration_date);
    return matchesSearch && matchesDate;
  });

  const saveThreshold = async (item: StockRow) => {
    const amount = Number(thresholdDraft);
    const decimalPlaces = thresholdDraft.includes('.') ? thresholdDraft.split('.')[1].length : 0;
    if (
      !thresholdDraft.trim()
      || !Number.isFinite(amount)
      || amount < 0
      || amount > 999_999_999.999
      || decimalPlaces > item.quantityPrecision
    ) {
      const precisionHint = decimalPlaces > item.quantityPrecision
        ? ` Use no more than ${item.quantityPrecision} decimal places for ${item.unit}.`
        : '';
      setFeedback({
        type: 'error',
        message: `Enter a valid minimum stock amount greater than or equal to zero.${precisionHint}`,
      });
      return;
    }
    setSavingThreshold(item.key);
    setFeedback(null);
    try {
      await updateMinimumStock(item.branchId, item.ingredientId, amount);
      setData((current) => current && ({
        ...current,
        inventory: current.inventory.map((record) =>
          record.branch_id === item.branchId && record.ingredient_id === item.ingredientId
            ? { ...record, minimum_stock: amount }
            : record,
        ),
      }));
      setEditingThreshold(null);
      setFeedback({ type: 'success', message: `Minimum stock saved for ${item.ingredientName} · ${item.branchName}.` });
      onRefresh();
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save the minimum stock setting.' });
    } finally {
      setSavingThreshold(null);
    }
  };

  const saveExpirationDate = async (batch: BatchRow) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDraft)) {
      setFeedback({ type: 'error', message: 'Enter an expiration date in YYYY-MM-DD format.' });
      return;
    }
    const [year, month, day] = expirationDraft.split('-').map(Number);
    const parsedDate = new Date(year, month - 1, day);
    if (parsedDate.getFullYear() !== year || parsedDate.getMonth() !== month - 1 || parsedDate.getDate() !== day) {
      setFeedback({ type: 'error', message: 'Enter a real calendar date for the expiration date.' });
      return;
    }
    setSavingBatch(batch.id);
    setFeedback(null);
    try {
      await updateBatchExpirationDate(batch.id, expirationDraft, batch.received_date);
      setData((current) => current && ({
        ...current,
        batches: current.batches.map((record) =>
          record.id === batch.id ? { ...record, expiration_date: expirationDraft } : record,
        ),
      }));
      setEditingBatch(null);
      setFeedback({ type: 'success', message: `Expiration date saved for batch ${batch.batch_reference}.` });
      onRefresh();
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save the batch expiration date.' });
    } finally {
      setSavingBatch(null);
    }
  };

  const toggleExpirationTracking = async (ingredientId: string, currentlyTracking: boolean) => {
    setSavingTracking(ingredientId);
    setFeedback(null);
    try {
      await updateIngredientExpirationTracking(ingredientId, !currentlyTracking);
      setData((current) => current && ({
        ...current,
        ingredients: current.ingredients.map((ingredient) =>
          ingredient.id === ingredientId
            ? { ...ingredient, expiration_tracking: !currentlyTracking }
            : ingredient,
        ),
      }));
      setFeedback({
        type: 'success',
        message: `Expiration tracking ${currentlyTracking ? 'disabled' : 'enabled'} for ${data?.ingredients.find((item) => item.id === ingredientId)?.name ?? 'ingredient'}.`,
      });
      onRefresh();
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Unable to update ingredient expiration tracking.' });
    } finally {
      setSavingTracking(null);
    }
  };

  const saveAlertDays = async () => {
    const days = Number(alertDaysDraft);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setFeedback({ type: 'error', message: 'Expiration alerts must be set from 1 to 365 days.' });
      return;
    }
    setSavingAlertDays(true);
    setFeedback(null);
    try {
      await updateNearExpirationDays(days);
      setData((current) => current && ({ ...current, nearExpirationDays: days }));
      setFeedback({ type: 'success', message: `Expiration alert window saved: ${days} days.` });
      onRefresh();
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save expiration alert settings.' });
    } finally {
      setSavingAlertDays(false);
    }
  };

  const saveLotWindow = async () => {
    const warningHours = Number(warningHoursDraft);
    const criticalHours = Number(criticalHoursDraft);
    setSavingLotWindow(true);
    setFeedback(null);
    try {
      await updateLotExpiryWindow(warningHours, criticalHours);
      setData((current) => current && ({ ...current, lotExpiryWindow: { warningHours, criticalHours } }));
      setFeedback({ type: 'success', message: `Batch colours saved: yellow within ${warningHours} hours, red within ${criticalHours} hours.` });
      onRefresh();
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save the batch colour windows.' });
    } finally {
      setSavingLotWindow(false);
    }
  };

  const startReorderEdit = (ingredientId: string, settings: ReplenishmentSettings) => {
    setFeedback(null);
    setEditingReorder(ingredientId);
    setReorderDraft({
      leadTimeDays: String(settings.leadTimeDays),
      windowDays: String(settings.windowDays),
      minHistoryDays: String(settings.minHistoryDays),
      shelfLifeDays: settings.shelfLifeDays == null ? '' : String(settings.shelfLifeDays),
      serviceLevelZ: settings.serviceLevelZ,
    });
  };

  const saveReorder = async (ingredientId: string, ingredientName: string) => {
    setSavingReorder(true);
    setFeedback(null);
    try {
      await saveReplenishmentSettings(ingredientId, {
        leadTimeDays: Number(reorderDraft.leadTimeDays),
        serviceLevelZ: reorderDraft.serviceLevelZ,
        windowDays: Number(reorderDraft.windowDays),
        minHistoryDays: Number(reorderDraft.minHistoryDays),
        shelfLifeDays: reorderDraft.shelfLifeDays.trim() ? Number(reorderDraft.shelfLifeDays) : null,
      });
      setEditingReorder(null);
      setFeedback({ type: 'success', message: `Reorder settings saved for ${ingredientName}. Reorder points were recalculated.` });
      await refresh();
      onRefresh();
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save the reorder settings.' });
    } finally {
      setSavingReorder(false);
    }
  };

  const toggleHold = async (batch: BatchRow, held: boolean) => {
    setSavingHold(batch.id);
    setFeedback(null);
    try {
      await updateBatchHold(batch.id, held);
      setData((current) => {
        if (!current) return current;
        const heldLotIds = new Set(current.heldLotIds);
        if (held) heldLotIds.add(batch.id); else heldLotIds.delete(batch.id);
        return { ...current, heldLotIds };
      });
      setFeedback({
        type: 'success',
        message: held
          ? `Batch ${batch.batch_reference} is on hold. Sales will not use it.`
          : `Batch ${batch.batch_reference} is released and can be used again.`,
      });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Unable to update the batch.' });
    } finally {
      setSavingHold(null);
    }
  };

  const startThresholdEdit = (item: StockRow) => {
    setFeedback(null);
    setThresholdDraft(String(item.minimumStock));
    setEditingThreshold(item.key);
  };

  const startExpirationEdit = (batch: BatchRow) => {
    setFeedback(null);
    setExpirationDraft(batch.expiration_date ?? '');
    setEditingBatch(batch.id);
  };

  const renderFilterChips = <T extends string>(
    options: readonly T[],
    selected: T,
    onSelect: (value: T) => void,
  ) => (
    <View style={styles.filterRow}>
      {options.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === option }}
          onPress={() => onSelect(option)}
          style={[styles.filterChip, selected === option && styles.filterChipSelected]}
        >
          <Text style={[styles.filterChipText, selected === option && styles.filterChipTextSelected]}>{option}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View>
      <View style={styles.introCard}>
        <Text style={styles.introEyebrow}>INVENTORY CONFIGURATION</Text>
        <Text style={styles.introTitle}>Stock Threshold & Expiration Settings</Text>
        <Text style={styles.introCopy}>Set branch-level minimum stock and manage expiration dates recorded against stock-in batches.</Text>
      </View>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Tracked ingredients</Text>
          <Text style={styles.summaryValue}>{!data ? '—' : rows.length}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>At/below minimum</Text>
          <Text style={[styles.summaryValue, lowRows.length > 0 && styles.summaryLow]}>{!data ? '—' : lowRows.length}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Nearing expiration</Text>
          <Text style={[styles.summaryValue, nearingCount > 0 && styles.summaryWarning]}>{!data ? '—' : nearingCount}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Expired batches</Text>
          <Text style={[styles.summaryValue, expiredCount > 0 && styles.summaryLow]}>{!data ? '—' : expiredCount}</Text>
        </View>
      </View>

      {feedback && (
        <View style={[styles.feedback, feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess]}>
          <Text style={styles.feedbackText}>{feedback.message}</Text>
        </View>
      )}
      {loadError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {loading && !data ? (
        <View style={styles.loadingCard}><ActivityIndicator color={colors.pink} /><Text style={styles.loadingText}>Loading stock and expiration settings…</Text></View>
      ) : null}

      {data && (
        <>
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Expiration alert window</Text>
            <Text style={styles.helperText}>Mark an active batch as nearing expiration when it is within this many days. Expired batches remain separate. This setting changes dashboard status only; it does not send notifications.</Text>
            <View style={styles.settingRow}>
              <View style={styles.settingInputWrap}>
                <Text style={styles.fieldLabel}>Days before expiration</Text>
                <TextInput
                  accessibilityLabel="Nearing expiration alert days"
                  value={alertDaysDraft}
                  onChangeText={setAlertDaysDraft}
                  keyboardType="number-pad"
                  placeholder="7"
                  style={styles.input}
                />
              </View>
              <Pressable accessibilityRole="button" disabled={savingAlertDays} onPress={() => void saveAlertDays()} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{savingAlertDays ? 'Saving…' : 'Save window'}</Text>
              </Pressable>
            </View>
            <Text style={styles.currentSetting}>Current alert window: <Text style={styles.currentSettingStrong}>{data.nearExpirationDays} days</Text></Text>
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Batch colours (FEFO)</Text>
            <Text style={styles.helperText}>Sales use the batch that expires first. A batch turns yellow when it expires within the first window and red within the second, and staff are told to use red batches first. Expired batches are not used for sales.</Text>
            <View style={styles.settingRow}>
              <View style={styles.settingInputWrap}>
                <Text style={styles.fieldLabel}>Yellow within (hours)</Text>
                <TextInput
                  accessibilityLabel="Yellow batch window in hours"
                  value={warningHoursDraft}
                  onChangeText={setWarningHoursDraft}
                  keyboardType="number-pad"
                  placeholder="48"
                  style={styles.input}
                />
              </View>
              <View style={styles.settingInputWrap}>
                <Text style={styles.fieldLabel}>Red within (hours)</Text>
                <TextInput
                  accessibilityLabel="Red batch window in hours"
                  value={criticalHoursDraft}
                  onChangeText={setCriticalHoursDraft}
                  keyboardType="number-pad"
                  placeholder="24"
                  style={styles.input}
                />
              </View>
              <Pressable accessibilityRole="button" disabled={savingLotWindow} onPress={() => void saveLotWindow()} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{savingLotWindow ? 'Saving…' : 'Save colours'}</Text>
              </Pressable>
            </View>
            <Text style={styles.currentSetting}>Current: <Text style={styles.currentSettingStrong}>yellow within {data.lotExpiryWindow.warningHours} h, red within {data.lotExpiryWindow.criticalHours} h</Text></Text>
          </View>

          {data.replenishmentSettings ? (
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Reorder settings</Text>
              <Text style={styles.helperText}>Low-stock alerts use a reorder point: average daily use × supplier lead time, plus safety stock for days with higher use. It is worked out from the last operating days and never goes below the minimum stock. With too little sales history the minimum stock is used. Alerts are advice only; no purchase orders are created.</Text>
              {data.ingredients.filter((ingredient) => ingredient.id !== 'prepared-batter').map((ingredient) => {
                const settings = data.replenishmentSettings?.find((row) => row.ingredientId === ingredient.id)
                  ?? { ingredientId: ingredient.id, ...DEFAULT_REPLENISHMENT_SETTINGS };
                const editing = editingReorder === ingredient.id;
                return (
                  <View key={ingredient.id} style={styles.reorderRow}>
                    <View style={styles.reorderRowHeading}>
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle}>{ingredient.name}</Text>
                        <Text style={styles.rowMeta}>
                          Lead time {settings.leadTimeDays} d · {serviceLevelLabel(settings.serviceLevelZ)} service level · last {settings.windowDays} operating days (min {settings.minHistoryDays})
                          {settings.shelfLifeDays != null ? ` · shelf life ${settings.shelfLifeDays} d` : ''}
                        </Text>
                      </View>
                      {!editing ? (
                        <Pressable accessibilityRole="button" accessibilityLabel={`Edit reorder settings for ${ingredient.name}`} onPress={() => startReorderEdit(ingredient.id, settings)} style={styles.editButton}>
                          <Text style={styles.editButtonText}>Edit</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    {editing ? (
                      <View style={styles.reorderEditor}>
                        {([
                          ['leadTimeDays', 'Supplier lead time (days)'],
                          ['windowDays', 'Usage window (operating days)'],
                          ['minHistoryDays', 'Minimum history (days)'],
                          ['shelfLifeDays', 'Shelf life (days, optional)'],
                        ] as const).map(([key, label]) => (
                          <View key={key} style={styles.settingInputWrap}>
                            <Text style={styles.fieldLabel}>{label}</Text>
                            <TextInput
                              accessibilityLabel={`${label} for ${ingredient.name}`}
                              value={reorderDraft[key]}
                              onChangeText={(value) => setReorderDraft((current) => ({ ...current, [key]: value }))}
                              keyboardType="decimal-pad"
                              style={styles.input}
                            />
                          </View>
                        ))}
                        <Text style={styles.fieldLabel}>Service level</Text>
                        <View style={styles.lotBadgeRow}>
                          {SERVICE_LEVEL_OPTIONS.map((option) => (
                            <Pressable
                              key={option.label}
                              accessibilityRole="button"
                              accessibilityState={{ selected: Math.abs(reorderDraft.serviceLevelZ - option.z) < 0.0005 }}
                              onPress={() => setReorderDraft((current) => ({ ...current, serviceLevelZ: option.z }))}
                              style={[styles.statusBadge, Math.abs(reorderDraft.serviceLevelZ - option.z) < 0.0005 ? styles.goodBadge : styles.neutralBadge]}
                            >
                              <Text style={[styles.statusText, Math.abs(reorderDraft.serviceLevelZ - option.z) < 0.0005 ? styles.goodText : styles.neutralText]}>{option.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <View style={styles.lotBadgeRow}>
                          <Pressable accessibilityRole="button" disabled={savingReorder} onPress={() => void saveReorder(ingredient.id, ingredient.name)} style={styles.smallPrimaryButton}>
                            <Text style={styles.primaryButtonText}>{savingReorder ? 'Saving…' : 'Save'}</Text>
                          </Pressable>
                          <Pressable accessibilityRole="button" disabled={savingReorder} onPress={() => setEditingReorder(null)} style={styles.cancelButton}>
                            <Text style={styles.cancelText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeadingCopy}>
              <Text style={styles.sectionTitle}>Minimum stock levels</Text>
              <Text style={styles.helperText}>Expected on-hand quantities and branch-specific reorder thresholds.</Text>
            </View>
          </View>
          <View style={styles.searchBox}>
            <AppIcon name="search" style={styles.searchGlyph} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search ingredients or branches"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              accessibilityLabel="Search stock thresholds and expiration batches"
              returnKeyType="search"
            />
            {search ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')}>
                <Text style={styles.clearSearch}>×</Text>
              </Pressable>
            ) : null}
          </View>
          {renderFilterChips(['All', 'At/below minimum', 'In stock'] as const, stockFilter, setStockFilter)}
          {visibleRows.length ? visibleRows.map((item) => (
            <View key={item.key} style={styles.stockCard}>
              <View style={styles.rowHeading}>
                <View style={styles.itemMark}>
                  <Text style={styles.itemMarkText}>{item.ingredientName.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{item.ingredientName}</Text>
                  <Text style={styles.rowMeta}>{item.category} · {item.branchName}</Text>
                </View>
                <View style={[styles.statusBadge, thresholdKeys.has(item.key) ? styles.lowBadge : styles.goodBadge]}>
                  <Text style={[styles.statusText, thresholdKeys.has(item.key) ? styles.lowText : styles.goodText]}>
                    {thresholdKeys.has(item.key)
                      ? thresholdFor(item) > item.minimumStock ? 'At/below reorder point' : 'At/below minimum'
                      : 'In stock'}
                  </Text>
                </View>
              </View>
              <View style={styles.stockDetails}>
                <View style={styles.stockMeasure}>
                  <Text style={styles.measureLabel}>Expected stock</Text>
                  <Text style={styles.measureValue}>{formatAmount(item.quantity, item.quantityPrecision)} {item.unit}</Text>
                </View>
                {editingThreshold === item.key ? (
                  <View style={styles.thresholdEditor}>
                    <View style={styles.thresholdInputWrap}>
                      <Text style={styles.measureLabel}>Minimum stock ({item.unit})</Text>
                      <TextInput
                        accessibilityLabel={`Minimum stock for ${item.ingredientName} at ${item.branchName}`}
                        value={thresholdDraft}
                        onChangeText={setThresholdDraft}
                        keyboardType="decimal-pad"
                        style={styles.input}
                      />
                    </View>
                    <Pressable accessibilityRole="button" disabled={savingThreshold === item.key} onPress={() => void saveThreshold(item)} style={styles.smallPrimaryButton}>
                      <Text style={styles.primaryButtonText}>{savingThreshold === item.key ? 'Saving…' : 'Save'}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={savingThreshold === item.key} onPress={() => setEditingThreshold(null)} style={styles.cancelButton}>
                      <Text style={styles.cancelText}>Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.measureAction}>
                    <View>
                      <Text style={styles.measureLabel}>Minimum stock</Text>
                      <Text style={styles.measureValue}>{formatAmount(item.minimumStock, item.quantityPrecision)} {item.unit}</Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Edit minimum stock for ${item.ingredientName} at ${item.branchName}`} onPress={() => startThresholdEdit(item)} style={styles.editButton}>
                      <Text style={styles.editButtonText}>Edit</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              {(() => {
                const point = data.reorderPoints.get(`${item.branchId}:${item.ingredientId}`);
                if (!point) return null;
                return (
                  <View style={styles.reorderLine}>
                    <Text style={styles.rowMeta}>
                      Low-stock alert at {formatAmount(thresholdFor(item), item.quantityPrecision)} {item.unit} · {reorderPointSourceLabel(point)}
                      {point.method === 'DYNAMIC_ROP' && point.averageDailyUsage != null
                        ? ` · uses ${formatAmount(point.averageDailyUsage, item.quantityPrecision)} ${item.unit}/day, safety stock ${formatAmount(point.safetyStock, item.quantityPrecision)} ${item.unit}`
                        : ''}
                    </Text>
                    {point.configInconsistent ? (
                      <Text style={[styles.rowMeta, styles.lowText]}>Shelf life is shorter than the supplier lead time. Check the reorder settings.</Text>
                    ) : null}
                  </View>
                );
              })()}
            </View>
          )) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{rows.length ? 'No ingredients match the current search and stock filter.' : 'No branch inventory records are available for this selection.'}</Text>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeadingCopy}>
              <Text style={styles.sectionTitle}>Expiration tracking</Text>
              <Text style={styles.helperText}>Choose which ingredients require expiration dates on future stock-in batches.</Text>
            </View>
          </View>
          {data.ingredients.filter((ingredient) =>
            `${ingredient.name} ${data.categories.find((category) => category.id === ingredient.category_id)?.name ?? ''}`
              .toLocaleLowerCase().includes(normalizedSearch),
          ).map((ingredient) => (
            <View key={ingredient.id} style={styles.trackingCard}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{ingredient.name}</Text>
                <Text style={styles.rowMeta}>{ingredient.expiration_tracking ? 'Expiration date required for stock-in' : 'Expiration dates are not currently tracked'}</Text>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={`Expiration tracking for ${ingredient.name}`}
                accessibilityState={{ checked: ingredient.expiration_tracking, disabled: savingTracking === ingredient.id }}
                disabled={savingTracking === ingredient.id}
                onPress={() => void toggleExpirationTracking(ingredient.id, ingredient.expiration_tracking)}
                style={[styles.trackingButton, ingredient.expiration_tracking && styles.trackingButtonSelected]}
              >
                <Text style={[styles.trackingButtonText, ingredient.expiration_tracking && styles.trackingButtonTextSelected]}>
                  {savingTracking === ingredient.id ? 'Saving…' : ingredient.expiration_tracking ? 'On' : 'Off'}
                </Text>
              </Pressable>
            </View>
          ))}

          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeadingCopy}>
              <Text style={styles.sectionTitle}>Batch expiration records</Text>
              <Text style={styles.helperText}>Dates and remaining quantities from existing stock-in batches.</Text>
            </View>
          </View>
          {renderFilterChips(['All batches', 'With date', 'Missing date'] as const, expirationFilter, setExpirationFilter)}
          {visibleBatches.length ? visibleBatches.map((batch) => {
            const days = batch.expiration_date ? daysUntil(batch.expiration_date) : null;
            const expirationLevel = days === null ? null : classifyExpirationLevel(days, windowFor(batch.ingredient_id));
            const expired = expirationLevel === 'Expired';
            const nearing = expirationLevel === 'Near Expiration';
            return (
              <View key={batch.id} style={styles.batchCard}>
                <View style={styles.rowHeading}>
                  <View style={[styles.itemMark, expired ? styles.expiredMark : nearing ? styles.warningMark : styles.batchMark]}>
                    <Text style={styles.itemMarkText}>{expired ? '!' : nearing ? '!' : 'B'}</Text>
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{batch.ingredientName}</Text>
                    <Text style={styles.rowMeta}>{batch.branchName} · Batch {batch.batch_reference}</Text>
                  </View>
                  <View style={[styles.statusBadge, expired ? styles.lowBadge : nearing ? styles.warningBadge : batch.expiration_date ? styles.goodBadge : styles.neutralBadge]}>
                    <Text style={[styles.statusText, expired ? styles.lowText : nearing ? styles.warningText : batch.expiration_date ? styles.goodText : styles.neutralText]}>
                      {expired ? 'Expired' : nearing ? (days === 0 ? 'Expires today' : `${days}d left`) : batch.expiration_date ? 'On track' : 'No date'}
                    </Text>
                  </View>
                </View>
                <View style={styles.batchDetails}>
                  <Text style={styles.rowMeta}>Received {localDate(batch.received_date)} · {formatAmount(batch.quantity_remaining, 3)} {batch.unit} remaining of {formatAmount(batch.quantity_received, 3)} {batch.unit}</Text>
                  {(() => {
                    const lot = lotDisplays.get(batch.id);
                    if (!lot || (!lot.useFirst && !lot.held && lot.expiry === 'NO_EXPIRY')) return null;
                    const tone = lot.held ? 'warning' : lotExpiryTone(lot.expiry);
                    const badgeStyle = tone === 'low' ? styles.lowBadge : tone === 'warning' ? styles.warningBadge : tone === 'good' ? styles.goodBadge : styles.neutralBadge;
                    const textStyle = tone === 'low' ? styles.lowText : tone === 'warning' ? styles.warningText : tone === 'good' ? styles.goodText : styles.neutralText;
                    return (
                      <View style={styles.lotBadgeRow}>
                        {lot.useFirst ? (
                          <View style={[styles.statusBadge, styles.goodBadge]}><Text style={[styles.statusText, styles.goodText]}>Use first</Text></View>
                        ) : null}
                        {lot.held || lot.expiry !== 'NO_EXPIRY' ? (
                          <View style={[styles.statusBadge, badgeStyle]}><Text style={[styles.statusText, textStyle]}>{lot.expiryLabel}</Text></View>
                        ) : null}
                      </View>
                    );
                  })()}
                  {editingBatch === batch.id ? (
                    <View style={styles.expirationEditor}>
                      <View style={styles.expirationInputWrap}>
                        <Text style={styles.measureLabel}>Expiration date (YYYY-MM-DD)</Text>
                        <TextInput
                          accessibilityLabel={`Expiration date for ${batch.ingredientName}, batch ${batch.batch_reference}`}
                          value={expirationDraft}
                          onChangeText={setExpirationDraft}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.muted}
                          style={styles.input}
                          autoCapitalize="none"
                        />
                      </View>
                      <Pressable accessibilityRole="button" disabled={savingBatch === batch.id} onPress={() => void saveExpirationDate(batch)} style={styles.smallPrimaryButton}>
                        <Text style={styles.primaryButtonText}>{savingBatch === batch.id ? 'Saving…' : 'Save'}</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" disabled={savingBatch === batch.id} onPress={() => setEditingBatch(null)} style={styles.cancelButton}>
                        <Text style={styles.cancelText}>Cancel</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.batchFooter}>
                      <Text style={styles.expirationDate}>{batch.expiration_date ? `Expires ${localDate(batch.expiration_date)}` : 'No expiration date recorded'}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${data.heldLotIds.has(batch.id) ? 'Release' : 'Hold'} batch ${batch.batch_reference}`}
                        disabled={savingHold === batch.id}
                        onPress={() => void toggleHold(batch, !data.heldLotIds.has(batch.id))}
                        style={styles.editButton}
                      >
                        <Text style={styles.editButtonText}>
                          {savingHold === batch.id ? 'Saving…' : data.heldLotIds.has(batch.id) ? 'Release' : 'Hold'}
                        </Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={() => startExpirationEdit(batch)} style={styles.editButton}>
                        <Text style={styles.editButtonText}>{batch.expiration_date ? 'Edit date' : 'Add date'}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            );
          }) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {batches.length
                  ? 'No stock-in batches match this search and expiration filter.'
                  : 'No active stock-in batches are available. Record a stock-in with a batch reference before adding its expiration date; this page does not create stock batches or change quantities.'}
              </Text>
            </View>
          )}
          <Text style={styles.footerNote}>Expiration dates are stored on their original stock-in batches. Alert status is calculated from active batch quantities and the configured day window; no notification delivery is configured.</Text>
        </>
      )}
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(createThemedStyles({
    introCard: { padding: 15, marginBottom: 10, borderRadius: 16, backgroundColor: colors.navy },
    introEyebrow: { color: colors.orange, fontFamily: 'Poppins_600SemiBold', fontSize: 7, letterSpacing: 0.9 },
    introTitle: { color: colors.white, fontFamily: 'Poppins_700Bold', fontSize: 14, marginTop: 4 },
    introCopy: { color: '#D5D5E0', fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 13, marginTop: 4 },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8 },
    summaryCard: { flexGrow: 1, flexBasis: '46%', minHeight: 66, justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
    summaryLabel: { color: colors.muted, fontFamily: 'Poppins_500Medium', fontSize: 7 },
    summaryValue: { color: colors.navy, fontFamily: 'Poppins_700Bold', fontSize: 17, marginTop: 4 },
    summaryLow: { color: colors.red },
    summaryWarning: { color: '#8D6414' },
    feedback: { padding: 10, marginBottom: 8, borderRadius: 10 },
    feedbackError: { backgroundColor: colors.paleRed },
    feedbackSuccess: { backgroundColor: colors.paleGreen },
    feedbackText: { color: colors.ink, fontFamily: 'Poppins_500Medium', fontSize: 8, lineHeight: 13 },
    errorCard: { padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.paleRed, borderRadius: 12, backgroundColor: colors.white },
    errorText: { color: colors.red, fontFamily: 'Poppins_500Medium', fontSize: 8, lineHeight: 13 },
    retryButton: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.pink },
    retryText: { color: colors.white, fontFamily: 'Poppins_600SemiBold', fontSize: 8 },
    loadingCard: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.white },
    loadingText: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 8 },
    panel: { padding: 12, marginBottom: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 7 },
    sectionHeadingCopy: { flex: 1 },
    sectionTitle: { color: colors.navy, fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
    helperText: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 7, lineHeight: 11, marginTop: 3 },
    settingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 9 },
    settingInputWrap: { flex: 1 },
    fieldLabel: { color: colors.muted, fontFamily: 'Poppins_500Medium', fontSize: 7, marginBottom: 4 },
    input: { minWidth: 86, minHeight: 34, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.white, color: colors.ink, fontFamily: 'Poppins_500Medium', fontSize: 9 },
    primaryButton: { minHeight: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderRadius: 9, backgroundColor: colors.pink },
    primaryButtonText: { color: colors.white, fontFamily: 'Poppins_600SemiBold', fontSize: 8 },
    currentSetting: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 7, marginTop: 8 },
    currentSettingStrong: { color: colors.navy, fontFamily: 'Poppins_600SemiBold' },
    searchBox: { minHeight: 39, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 7, borderRadius: 11, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
    searchGlyph: { color: colors.muted, fontSize: 19, marginRight: 7 },
    searchInput: { flex: 1, height: 38, color: colors.ink, fontFamily: 'Poppins_400Regular', fontSize: 8, paddingVertical: 0 },
    clearSearch: { color: colors.muted, fontSize: 19, paddingLeft: 8 },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 7 },
    filterChip: { minHeight: 27, justifyContent: 'center', paddingHorizontal: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white },
    filterChipSelected: { borderColor: colors.pink, backgroundColor: '#FCE3EB' },
    filterChipText: { color: colors.muted, fontFamily: 'Poppins_500Medium', fontSize: 7 },
    filterChipTextSelected: { color: colors.pink, fontFamily: 'Poppins_600SemiBold' },
    stockCard: { padding: 10, marginBottom: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.white },
    trackingCard: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.white },
    trackingButton: { minWidth: 46, minHeight: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.pale },
    trackingButtonSelected: { borderColor: colors.pink, backgroundColor: colors.pink },
    trackingButtonText: { color: colors.muted, fontFamily: 'Poppins_600SemiBold', fontSize: 7 },
    trackingButtonTextSelected: { color: colors.white },
    rowHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    itemMark: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.pale },
    itemMarkText: { color: colors.navy, fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
    rowCopy: { flex: 1, minWidth: 0 },
    rowTitle: { color: colors.ink, fontFamily: 'Poppins_600SemiBold', fontSize: 8 },
    rowMeta: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 7, lineHeight: 11, marginTop: 2 },
    statusBadge: { flexShrink: 0, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 10 },
    lotBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    reorderLine: { marginTop: 6, gap: 2 },
    reorderRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, marginTop: 8 },
    reorderRowHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    reorderEditor: { marginTop: 8, gap: 6 },
    statusText: { fontFamily: 'Poppins_600SemiBold', fontSize: 6 },
    lowBadge: { backgroundColor: colors.paleRed },
    lowText: { color: colors.red },
    goodBadge: { backgroundColor: colors.paleGreen },
    goodText: { color: colors.green },
    warningBadge: { backgroundColor: colors.yellow },
    warningText: { color: '#8D6414' },
    neutralBadge: { backgroundColor: colors.pale },
    neutralText: { color: colors.muted },
    stockDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 9, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
    stockMeasure: { flex: 1, minWidth: 90 },
    measureLabel: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 6 },
    measureValue: { color: colors.navy, fontFamily: 'Poppins_600SemiBold', fontSize: 8, marginTop: 3 },
    measureAction: { flex: 1, minWidth: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    editButton: { minHeight: 28, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, ...secondaryOutline(theme.isDark) },
    editButtonText: { fontFamily: 'Poppins_600SemiBold', fontSize: 7, color: colors.navy },
    thresholdEditor: { flex: 1, minWidth: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    thresholdInputWrap: { flex: 1 },
    smallPrimaryButton: { minHeight: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.pink },
    cancelButton: { minHeight: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, ...secondaryOutline(theme.isDark), borderRadius: 8 },
    cancelText: { fontFamily: 'Poppins_500Medium', fontSize: 7, color: colors.navy },
    batchCard: { padding: 10, marginBottom: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.white },
    batchMark: { backgroundColor: colors.paleGreen },
    warningMark: { backgroundColor: colors.yellow },
    expiredMark: { backgroundColor: colors.paleRed },
    batchDetails: { paddingTop: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
    batchFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 7 },
    expirationDate: { flex: 1, color: colors.ink, fontFamily: 'Poppins_500Medium', fontSize: 7 },
    expirationEditor: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 8 },
    expirationInputWrap: { flex: 1 },
    emptyCard: { padding: 13, marginBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.white },
    emptyText: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 8, lineHeight: 13 },
    footerNote: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 7, lineHeight: 11, marginTop: 3, marginBottom: 8 },
  }, theme)), [theme]);
}
