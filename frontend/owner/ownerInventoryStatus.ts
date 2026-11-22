import { manilaDateKey } from '../services/businessDaySettings.ts';
import { lowStockThreshold } from '../services/reorderPoint.ts';
import {
  NEAR_EXPIRATION_DEFAULT_DAYS,
  calendarDaysUntil,
  classifyInventoryStatus,
} from '../services/inventoryStatusRules.ts';

export type InventoryStockStatus = 'Low Stock' | 'Normal' | 'Out of Stock' | 'Near Expiration' | 'Expired' | 'Not tracked';

export const DEFAULT_NEAR_EXPIRY_DAYS = NEAR_EXPIRATION_DEFAULT_DAYS;

export type OwnerInventoryComparisonRow = {
  branchId: string;
  branchName: string;
  hasRecord: boolean;
  quantity: number | null;
  unit: string;
  batchCode: string | undefined;
  batchCount: number;
  status: InventoryStockStatus;
};

export function buildOwnerInventoryComparisonRows(input: {
  branches: readonly { id: string; name: string }[];
  inventory: readonly {
    branch_id: string;
    ingredient_id: string;
    quantity: number | string | null;
    minimum_stock: number | string;
    low_stock_threshold?: number | string | null;
  }[];
  batches: readonly {
    id: string;
    branch_id: string;
    ingredient_id: string;
    batch_reference: string | null;
    expiration_date: string | null;
    quantity_remaining: number | string;
  }[];
  ingredientId: string;
  unit: string;
}): OwnerInventoryComparisonRow[] {
  return input.branches.map((branch) => {
    const record = input.inventory.find((item) =>
      item.branch_id === branch.id && item.ingredient_id === input.ingredientId,
    );
    const activeBatches = input.batches
      .filter((batch) =>
        batch.branch_id === branch.id
        && batch.ingredient_id === input.ingredientId
        && Number(batch.quantity_remaining) > 0,
      )
      .sort((left, right) => {
        const leftExpiry = left.expiration_date ?? '9999-12-31';
        const rightExpiry = right.expiration_date ?? '9999-12-31';
        return leftExpiry.localeCompare(rightExpiry) || left.id.localeCompare(right.id);
      });
    const quantity = record
      ? record.quantity === null ? null : Number(record.quantity)
      : null;
    return {
      branchId: branch.id,
      branchName: branch.name,
      hasRecord: Boolean(record),
      quantity,
      unit: input.unit,
      batchCode: activeBatches[0]?.batch_reference ?? undefined,
      batchCount: activeBatches.length,
      status: getInventoryStockStatus(quantity, record ? lowStockThreshold(record) : 0),
    };
  });
}

export function daysUntilManilaExpiration(expirationDate: string, now = new Date()): number {
  return calendarDaysUntil(expirationDate, manilaDateKey(now));
}

export function getInventoryStockStatus(
  quantity: number | null,
  minimumStock: number,
  expirationDate: string | null = null,
  referenceDate = manilaDateKey(new Date()),
  nearExpiryDays = DEFAULT_NEAR_EXPIRY_DAYS,
): InventoryStockStatus {
  if (quantity === null) return 'Not tracked';
  return classifyInventoryStatus({
    quantity,
    minimumStock,
    expirationDate,
    today: referenceDate,
    nearExpirationDays: nearExpiryDays,
  });
}

export function formatInventoryQuantity(quantity: number | null): string {
  if (quantity === null) return '—';
  return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(quantity);
}
