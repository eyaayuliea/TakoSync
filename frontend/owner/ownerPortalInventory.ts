import { formatInventoryQuantity, getInventoryStockStatus } from './ownerInventoryStatus';
import { lowStockThreshold } from '../services/reorderPoint.ts';
import { manilaDateKey } from '../services/businessDaySettings';
import { calendarDaysUntil, classifyExpirationLevel, classifyStockLevel, itemNearExpirationDays } from '../services/inventoryStatusRules.ts';

export type OwnerPortalInventoryRow = {
  ingredientId: string;
  name: string;
  category: string;
  qty: number | null;
  quantityLabel: string;
  unit: string;
  branch: string;
  branchId: string;
  status: string;
  expiry: string;
  batches: string;
  /** OW-14 c2: the minimum stock level set for the item at this branch. */
  minimumStock?: number | null;
  /** OW-14 c5: stock level only (expiry aside), so Summary counts match the Detailed view. */
  stockLevel?: 'Normal' | 'Low Stock' | 'Out of Stock' | 'Not tracked';
  /** OW-02 c6: the earliest lot's expiration level, kept apart from the stock level. */
  expirationLevel?: 'Expired' | 'Near Expiration' | null;
};

type OwnerInventorySnapshot = {
  branches: Array<{ id: string; name: string }>;
  inventory: Array<{
    branch_id: string;
    ingredient_id: string;
    quantity: number | string | null;
    minimum_stock: number | string;
    low_stock_threshold?: number | string | null;
  }>;
  ingredients: Array<{
    id: string;
    category_id: string;
    name: string;
    unit: string;
    expiration_tracking: boolean;
    /** The item's own near-expiration window in days; null or missing = the general setting. */
    near_expiration_days?: number | null;
  }>;
  categories: Array<{ id: string; name: string }>;
  batches: Array<{
    id: string;
    branch_id: string;
    ingredient_id: string;
    batch_reference: string | null;
    expiration_date: string | null;
    quantity_remaining: number | string;
  }>;
  nearExpirationDays: number;
};

function compareExpiration(
  left: OwnerInventorySnapshot['batches'][number],
  right: OwnerInventorySnapshot['batches'][number],
): number {
  return (left.expiration_date ?? '9999-12-31').localeCompare(right.expiration_date ?? '9999-12-31')
    || left.id.localeCompare(right.id);
}

export function buildOwnerPortalInventoryRows(
  snapshot: OwnerInventorySnapshot | null,
  now = new Date(),
): OwnerPortalInventoryRow[] {
  if (!snapshot) return [];

  const branches = new Map(snapshot.branches.map((branch) => [branch.id, branch.name]));
  const ingredients = new Map(snapshot.ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const categories = new Map(snapshot.categories.map((category) => [category.id, category.name]));
  const referenceDate = manilaDateKey(now);

  return snapshot.inventory.flatMap((record) => {
    const ingredient = ingredients.get(record.ingredient_id);
    const branch = branches.get(record.branch_id);
    if (!ingredient || !branch) return [];

    const activeBatches = snapshot.batches
      .filter((batch) =>
        batch.branch_id === record.branch_id
        && batch.ingredient_id === record.ingredient_id
        && Number(batch.quantity_remaining) > 0,
      )
      .sort(compareExpiration);
    const trackedExpiry = ingredient.expiration_tracking
      ? activeBatches.find((batch) => batch.expiration_date)?.expiration_date ?? null
      : null;
    const quantity = record.quantity === null ? null : Number(record.quantity);
    const threshold = lowStockThreshold(record);
    const level = quantity === null ? 'Not tracked' : classifyStockLevel(quantity, threshold);

    return [{
      ingredientId: ingredient.id,
      name: ingredient.name,
      category: categories.get(ingredient.category_id) ?? 'Other',
      qty: quantity,
      quantityLabel: formatInventoryQuantity(quantity),
      unit: ingredient.unit,
      branch,
      branchId: record.branch_id,
      status: getInventoryStockStatus(
        quantity,
        lowStockThreshold(record),
        trackedExpiry,
        referenceDate,
        itemNearExpirationDays(ingredient.near_expiration_days, snapshot.nearExpirationDays),
      ),
      expiry: trackedExpiry ?? '—',
      minimumStock: record.minimum_stock === null || record.minimum_stock === undefined ? null : Number(record.minimum_stock),
      stockLevel: level === 'In Stock' ? 'Normal' : level,
      expirationLevel: trackedExpiry && quantity !== null && quantity > 0
        ? classifyExpirationLevel(calendarDaysUntil(trackedExpiry, referenceDate), itemNearExpirationDays(ingredient.near_expiration_days, snapshot.nearExpirationDays))
        : null,
      batches: activeBatches.map((batch) => {
        const reference = batch.batch_reference?.trim() || 'Unreferenced batch';
        const expiration = ingredient.expiration_tracking
          ? batch.expiration_date ?? 'No expiry date'
          : 'Not tracked';
        return `${reference}: ${formatInventoryQuantity(Number(batch.quantity_remaining))} ${ingredient.unit} · ${expiration}`;
      }).join('; ') || 'No active batches',
    }];
  });
}
