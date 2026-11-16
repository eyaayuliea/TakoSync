import { manilaDateKey } from '../services/businessDaySettings.ts';

export const OWNER_ALERT_EMPTY_MESSAGE = 'No alerts at the moment.';
export const OWNER_ALERT_LOAD_ERROR = 'Unable to load data. Please check your internet connection and try again.';

export type OwnerStockAlertKind = 'Low Stock' | 'Out of Stock';
export type OwnerExpirationAlertKind = 'Near Expiration' | 'Expired';

export type OwnerAlertInventoryRecord = {
  branch_id: string;
  ingredient_id: string;
  quantity: number;
  minimum_stock: number;
};

export type OwnerAlertBatchRecord = {
  id: string;
  branch_id: string;
  ingredient_id: string;
  batch_reference: string;
  expiration_date: string | null;
  quantity_remaining: number;
};

export type OwnerAlertIngredient = {
  id: string;
  name: string;
  unit: string;
  expiration_tracking: boolean;
};

export type OwnerAlertBranch = { id: string; name: string };

export type OwnerLowStockAlert = {
  id: string;
  ingredientId: string;
  name: string;
  branchId: string;
  branch: string;
  quantity: number;
  minimumStock: number;
  unit: string;
  status: OwnerStockAlertKind;
};

export type OwnerExpirationAlert = {
  id: string;
  ingredientId: string;
  name: string;
  branchId: string;
  branch: string;
  quantity: number;
  unit: string;
  expirationDate: string;
  reference: string;
  days: number;
  status: OwnerExpirationAlertKind;
};

export function classifyOwnerStockAlert(quantity: number, minimumStock: number): OwnerStockAlertKind | null {
  if (quantity <= 0) return 'Out of Stock';
  return minimumStock > 0 && quantity <= minimumStock ? 'Low Stock' : null;
}

export function classifyOwnerExpirationAlert(daysUntilExpiration: number, alertWindowDays: number): OwnerExpirationAlertKind | null {
  if (daysUntilExpiration < 0) return 'Expired';
  return daysUntilExpiration <= alertWindowDays ? 'Near Expiration' : null;
}

export function daysUntilOwnerExpiration(expirationDate: string, now = new Date()): number {
  const expirationKey = expirationDate.slice(0, 10);
  const todayKey = manilaDateKey(now);
  const expiration = Date.parse(`${expirationKey}T00:00:00.000Z`);
  const today = Date.parse(`${todayKey}T00:00:00.000Z`);
  return Math.ceil((expiration - today) / 86_400_000);
}

export function sortOwnerExpirationAlerts<T extends { expirationDate: string }>(alerts: T[]): T[] {
  return [...alerts].sort((left, right) =>
    new Date(`${left.expirationDate.slice(0, 10)}T00:00:00`).getTime()
    - new Date(`${right.expirationDate.slice(0, 10)}T00:00:00`).getTime(),
  );
}

export function countOwnerAlertCategories(lowStockCount: number, expirationCount: number) {
  return { lowStock: lowStockCount, expiration: expirationCount };
}

/**
 * A refresh in progress or a failed refresh must not present an older alert
 * count as if it were current. The records remain available to render only
 * after the caller has a settled, successful inventory snapshot.
 */
export function countOwnerAlertsWhenReady(
  counts: { lowStock: number; expiration: number },
  loading: boolean,
  error: string,
) {
  if (loading || error.trim() !== '') return countOwnerAlertCategories(0, 0);
  return counts;
}

export function filterOwnerRecordsByBranch<T extends { branch_id: string }>(records: T[], branchId: string | null): T[] {
  return branchId ? records.filter((record) => record.branch_id === branchId) : records;
}

export function buildOwnerAlertSnapshot(input: {
  inventory: readonly OwnerAlertInventoryRecord[];
  batches: readonly OwnerAlertBatchRecord[];
  ingredients: readonly OwnerAlertIngredient[];
  branches: readonly OwnerAlertBranch[];
  nearExpirationDays: number;
  branchId: string | null;
  now?: Date;
}) {
  const branchNames = new Map(input.branches.map((branch) => [branch.id, branch.name]));
  const ingredients = new Map(input.ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const inventoryByKey = new Map<string, OwnerAlertInventoryRecord>();
  for (const record of filterOwnerRecordsByBranch([...input.inventory], input.branchId)) {
    inventoryByKey.set(`${record.branch_id}:${record.ingredient_id}`, record);
  }

  const lowStock = [...inventoryByKey.values()].flatMap((record) => {
    const ingredient = ingredients.get(record.ingredient_id);
    const status = classifyOwnerStockAlert(Number(record.quantity), Number(record.minimum_stock));
    if (!ingredient || !status) return [];
    return [{
      id: `${record.branch_id}:${record.ingredient_id}`,
      ingredientId: record.ingredient_id,
      name: ingredient.name,
      branchId: record.branch_id,
      branch: branchNames.get(record.branch_id) ?? 'Branch unavailable',
      quantity: Number(record.quantity),
      minimumStock: Number(record.minimum_stock),
      unit: ingredient.unit,
      status,
    } satisfies OwnerLowStockAlert];
  }).sort((left, right) => left.quantity - right.quantity || left.name.localeCompare(right.name));

  const batchesById = new Map<string, OwnerAlertBatchRecord>();
  for (const batch of filterOwnerRecordsByBranch([...input.batches], input.branchId)) {
    batchesById.set(batch.id, batch);
  }
  const expiration = [...batchesById.values()].flatMap((batch) => {
    const ingredient = ingredients.get(batch.ingredient_id);
    if (!ingredient?.expiration_tracking || !batch.expiration_date || Number(batch.quantity_remaining) <= 0) return [];
    const days = daysUntilOwnerExpiration(batch.expiration_date, input.now);
    const status = classifyOwnerExpirationAlert(days, input.nearExpirationDays);
    if (!status) return [];
    return [{
      id: batch.id,
      ingredientId: batch.ingredient_id,
      name: ingredient.name,
      branchId: batch.branch_id,
      branch: branchNames.get(batch.branch_id) ?? 'Branch unavailable',
      quantity: Number(batch.quantity_remaining),
      unit: ingredient.unit,
      expirationDate: batch.expiration_date,
      reference: batch.batch_reference,
      days,
      status,
    } satisfies OwnerExpirationAlert];
  });

  return {
    lowStock,
    expiration: sortOwnerExpirationAlerts(expiration),
    counts: countOwnerAlertCategories(lowStock.length, expiration.length),
  };
}
