/**
 * A2 — Dynamic low-stock threshold: Reorder Point with Safety Stock
 * (Algorithm Architecture Specification §2.5, §3.5; US-ROP-05).
 *
 * The database (private.compute_reorder_point / private.check_low_stock) is the
 * source of truth and stores one reorder point per branch and ingredient. This
 * module mirrors the formula for unit tests and gives the apps one rule for
 * "is this item low": stock <= the effective reorder point, which never falls
 * below the owner minimum. Without a stored reorder point (an older database)
 * the owner minimum is used, as before.
 * This module has no imports so it can be unit tested directly.
 */

export type ReorderMethod = 'DYNAMIC_ROP' | 'OWNER_MINIMUM';
export type ReorderMethodReason = 'COLD_START' | 'IN_HOUSE_ITEM' | 'NOT_CONFIGURED' | null;
export type ReplenishmentSeverity = 'LOW_STOCK' | 'CRITICAL';

export type ReplenishmentSettings = {
  leadTimeDays: number;
  serviceLevelZ: number;
  windowDays: number;
  minHistoryDays: number;
  shelfLifeDays: number | null;
};

export const DEFAULT_REPLENISHMENT_SETTINGS: ReplenishmentSettings = {
  leadTimeDays: 1,
  serviceLevelZ: 1.645,
  windowDays: 14,
  minHistoryDays: 7,
  shelfLifeDays: null,
};

/** One-sided service levels the owner can choose, and their z values. */
export const SERVICE_LEVEL_OPTIONS = [
  { label: '90%', z: 1.282 },
  { label: '95%', z: 1.645 },
  { label: '97.5%', z: 1.96 },
  { label: '99%', z: 2.326 },
] as const;

export function serviceLevelLabel(z: number): string {
  const match = SERVICE_LEVEL_OPTIONS.find((option) => Math.abs(option.z - z) < 0.0005);
  return match ? match.label : `z = ${z}`;
}

export type ReorderPointResult = {
  method: ReorderMethod;
  methodReason: ReorderMethodReason;
  thresholdSource: ReorderMethod;
  operatingDaysUsed: number;
  averageDailyUsage: number | null;
  usageStddev: number | null;
  safetyStock: number;
  reorderPoint: number | null;
  ownerMinimum: number;
  effectiveRop: number;
  configInconsistent: boolean;
};

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function sampleStddev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  const squares = values.reduce((sum, value) => sum + (value - average) ** 2, 0);
  return Math.sqrt(squares / (values.length - 1));
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * COMPUTE_ROP (§3.5). `dailyUsage` is the usage on each operating day, newest
 * first. Only the newest `windowDays` values are used.
 */
export function computeReorderPoint(input: {
  dailyUsage: readonly number[];
  ownerMinimum: number;
  settings?: Partial<ReplenishmentSettings> | null;
  inHouseItem?: boolean;
}): ReorderPointResult {
  const ownerMinimum = Math.max(0, input.ownerMinimum);
  const fallback = (methodReason: Exclude<ReorderMethodReason, null>, operatingDaysUsed = 0): ReorderPointResult => ({
    method: 'OWNER_MINIMUM',
    methodReason,
    thresholdSource: 'OWNER_MINIMUM',
    operatingDaysUsed,
    averageDailyUsage: null,
    usageStddev: null,
    safetyStock: 0,
    reorderPoint: null,
    ownerMinimum,
    effectiveRop: ownerMinimum,
    configInconsistent: false,
  });
  if (input.inHouseItem) return fallback('IN_HOUSE_ITEM');
  if (!input.settings) return fallback('NOT_CONFIGURED');
  const settings = { ...DEFAULT_REPLENISHMENT_SETTINGS, ...input.settings };
  const usage = input.dailyUsage.slice(0, settings.windowDays).map((value) => Math.max(0, value));
  if (usage.length < settings.minHistoryDays) return fallback('COLD_START', usage.length);

  const averageDailyUsage = mean(usage);
  const usageStddev = sampleStddev(usage);
  let safetyStock = settings.serviceLevelZ * usageStddev * Math.sqrt(settings.leadTimeDays);
  let reorderPoint = averageDailyUsage * settings.leadTimeDays + safetyStock;
  let configInconsistent = false;
  if (settings.shelfLifeDays != null) {
    configInconsistent = settings.shelfLifeDays < settings.leadTimeDays;
    reorderPoint = Math.min(reorderPoint, averageDailyUsage * settings.shelfLifeDays);
    safetyStock = Math.min(safetyStock, reorderPoint);
  }
  return {
    method: 'DYNAMIC_ROP',
    methodReason: null,
    thresholdSource: reorderPoint > ownerMinimum ? 'DYNAMIC_ROP' : 'OWNER_MINIMUM',
    operatingDaysUsed: usage.length,
    averageDailyUsage,
    usageStddev,
    safetyStock: round3(safetyStock),
    reorderPoint: round3(reorderPoint),
    ownerMinimum,
    effectiveRop: round3(Math.max(reorderPoint, ownerMinimum)),
    configInconsistent,
  };
}

/** CHECK_LOW_STOCK severity (§3.5): null when stock is above the effective reorder point. */
export function classifyReplenishment(
  stock: number,
  threshold: { effectiveRop: number; safetyStock?: number },
): ReplenishmentSeverity | null {
  if (stock > threshold.effectiveRop) return null;
  return stock <= 0 || stock <= (threshold.safetyStock ?? 0) ? 'CRITICAL' : 'LOW_STOCK';
}

/** The quantity at or below which an item is low: the stored reorder point, or the owner minimum. */
export function lowStockThreshold(record: {
  minimum_stock: number | string;
  low_stock_threshold?: number | string | null;
}): number {
  const minimum = Number(record.minimum_stock);
  const threshold = record.low_stock_threshold == null ? NaN : Number(record.low_stock_threshold);
  return Number.isFinite(threshold) ? Math.max(threshold, Number.isFinite(minimum) ? minimum : 0) : minimum;
}

/** Short explanation of where an item's low-stock threshold comes from. */
export function reorderPointSourceLabel(point: {
  thresholdSource: ReorderMethod;
  method: ReorderMethod;
  methodReason: ReorderMethodReason;
  operatingDaysUsed: number;
}): string {
  if (point.methodReason === 'IN_HOUSE_ITEM') return 'Owner minimum (made in-house)';
  if (point.methodReason === 'NOT_CONFIGURED') return 'Owner minimum (no reorder settings)';
  if (point.methodReason === 'COLD_START') {
    return `Owner minimum (${point.operatingDaysUsed} ${point.operatingDaysUsed === 1 ? 'day' : 'days'} of sales so far)`;
  }
  return point.thresholdSource === 'DYNAMIC_ROP'
    ? `Reorder point from ${point.operatingDaysUsed} days of use`
    : 'Owner minimum (higher than the reorder point)';
}

export function validateReplenishmentSettings(settings: ReplenishmentSettings): string | null {
  if (!Number.isFinite(settings.leadTimeDays) || settings.leadTimeDays <= 0 || settings.leadTimeDays > 60) {
    return 'Lead time must be more than 0 and at most 60 days.';
  }
  if (!Number.isFinite(settings.serviceLevelZ) || settings.serviceLevelZ < 0 || settings.serviceLevelZ > 4) {
    return 'Choose a service level.';
  }
  if (!Number.isInteger(settings.windowDays) || settings.windowDays < 2 || settings.windowDays > 90) {
    return 'The usage window must be from 2 to 90 operating days.';
  }
  if (!Number.isInteger(settings.minHistoryDays) || settings.minHistoryDays < 2 || settings.minHistoryDays > settings.windowDays) {
    return 'Minimum history must be at least 2 days and no longer than the usage window.';
  }
  if (settings.shelfLifeDays != null && (!Number.isFinite(settings.shelfLifeDays) || settings.shelfLifeDays <= 0)) {
    return 'Shelf life must be more than 0 days, or left empty.';
  }
  return null;
}
