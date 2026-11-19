import type { Database } from '../../backend/types/database';

export const inventoryTransactionLabels = {
  stock_in: 'Stock-in',
  stock_out: 'Stock-out',
  usage: 'Usage',
  waste: 'Waste',
  spoilage: 'Spoilage',
  sales_consumption: 'Sales consumption',
  transfer_in: 'Branch transfer in',
  transfer_out: 'Branch transfer out',
  adjustment: 'Authorized Adjustment',
} as const satisfies Record<Database['public']['Enums']['inventory_transaction_type'], string>;

export type InventoryTransactionLabel =
  (typeof inventoryTransactionLabels)[keyof typeof inventoryTransactionLabels];

export function inventoryTransactionLabel(
  type: Database['public']['Enums']['inventory_transaction_type'],
): InventoryTransactionLabel {
  return inventoryTransactionLabels[type];
}
