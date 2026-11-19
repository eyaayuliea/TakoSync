import { formatInventoryQuantity, getInventoryStockStatus } from './ownerInventoryStatus';
import { manilaDateKey } from '../services/businessDaySettings';

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
};

type OwnerInventorySnapshot = {
  branches: Array<{ id: string; name: string }>;
  inventory: Array<{
    branch_id: string;
    ingredient_id: string;
    quantity: number | string | null;
    minimum_stock: number | string;
  }>;
  ingredients: Array<{
    id: string;
    category_id: string;
    name: string;
    unit: string;
    expiration_tracking: boolean;
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
        Number(record.minimum_stock),
        trackedExpiry,
        referenceDate,
        snapshot.nearExpirationDays,
      ),
      expiry: trackedExpiry ?? '—',
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
