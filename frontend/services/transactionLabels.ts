import type { Database } from '../../backend/types/database';

export const inventoryTransactionLabels = {
  stock_in: 'Stock-In',
  stock_out: 'Stock-Out',
  usage: 'Usage',
  waste: 'Waste',
  spoilage: 'Spoilage',
  sales_consumption: 'Sales Consumption',
  transfer_in: 'Branch Transfer In',
  transfer_out: 'Branch Transfer Out',
  adjustment: 'Authorized Adjustment',
} as const satisfies Record<Database['public']['Enums']['inventory_transaction_type'], string>;

export type InventoryTransactionLabel =
  (typeof inventoryTransactionLabels)[keyof typeof inventoryTransactionLabels];

export function inventoryTransactionLabel(
  type: Database['public']['Enums']['inventory_transaction_type'],
): InventoryTransactionLabel {
  return inventoryTransactionLabels[type];
}
