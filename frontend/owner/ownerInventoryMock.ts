export type InventoryStockStatus = 'Low Stock' | 'Normal' | 'Out of Stock' | 'Near Expiration' | 'Not tracked';

export type InventoryIngredient = {
  id: string;
  sheetLabel: string;
  displayName: string;
  unit: 'kg' | 'L' | 'pcs' | 'bottles';
  minimumStock: number;
  batchCode?: string;
  expirationDate?: string;
};

export type BranchInventoryRecord = {
  ingredientId: string;
  branchId: string;
  quantity: number | null;
  minimumStock: number;
  batchCode?: string;
  expirationDate?: string;
};

export const NEAR_EXPIRY_DAYS = 7;

export const OWNER_INVENTORY_INGREDIENTS: InventoryIngredient[] = [
  { id: 'octopus', sheetLabel: 'Octopus', displayName: 'Octopus', unit: 'kg', minimumStock: 5 },
  { id: 'flour', sheetLabel: 'All-Purpose Flour', displayName: 'All-Purpose Flour', unit: 'kg', minimumStock: 5 },
  { id: 'eggs', sheetLabel: 'Eggs', displayName: 'Eggs', unit: 'pcs', minimumStock: 24 },
  { id: 'sauce', sheetLabel: 'Takoyaki Sauce', displayName: 'Takoyaki Sauce', unit: 'L', minimumStock: 1, expirationDate: '2026-11-14' },
  { id: 'mayonnaise', sheetLabel: 'Mayonnaise', displayName: 'Mayonnaise', unit: 'kg', minimumStock: 2 },
  { id: 'bonito', sheetLabel: 'Bonito Flakes', displayName: 'Bonito Flakes', unit: 'kg', minimumStock: 2 },
  { id: 'batter', sheetLabel: 'Prepared Batter (bottles)', displayName: 'Prepared Batter', unit: 'bottles', minimumStock: 2 },
];

export const OWNER_INVENTORY_RECORDS: BranchInventoryRecord[] = [
  { ingredientId: 'octopus', branchId: 'branch-1', quantity: 3, minimumStock: 5 },
  { ingredientId: 'octopus', branchId: 'branch-2', quantity: 9, minimumStock: 5 },
  { ingredientId: 'octopus', branchId: 'branch-3', quantity: 0, minimumStock: 5 },
  { ingredientId: 'flour', branchId: 'branch-1', quantity: 12, minimumStock: 5 },
  { ingredientId: 'flour', branchId: 'branch-2', quantity: 3, minimumStock: 5 },
  { ingredientId: 'flour', branchId: 'branch-3', quantity: 7, minimumStock: 5 },
  { ingredientId: 'eggs', branchId: 'branch-1', quantity: 0, minimumStock: 24 },
  { ingredientId: 'eggs', branchId: 'branch-2', quantity: 30, minimumStock: 24 },
  { ingredientId: 'eggs', branchId: 'branch-3', quantity: 18, minimumStock: 24 },
  { ingredientId: 'sauce', branchId: 'branch-1', quantity: 2, minimumStock: 1, expirationDate: '2026-11-14' },
  { ingredientId: 'sauce', branchId: 'branch-2', quantity: 4, minimumStock: 1, expirationDate: '2026-11-20' },
  { ingredientId: 'sauce', branchId: 'branch-3', quantity: 1, minimumStock: 1, expirationDate: '2026-11-18' },
  { ingredientId: 'mayonnaise', branchId: 'branch-1', quantity: 4, minimumStock: 2 },
  { ingredientId: 'mayonnaise', branchId: 'branch-2', quantity: 6, minimumStock: 2 },
  { ingredientId: 'mayonnaise', branchId: 'branch-3', quantity: 1, minimumStock: 2 },
  { ingredientId: 'bonito', branchId: 'branch-1', quantity: 1.5, minimumStock: 2 },
  { ingredientId: 'bonito', branchId: 'branch-2', quantity: 2.5, minimumStock: 2 },
  { ingredientId: 'batter', branchId: 'branch-1', quantity: 7, minimumStock: 2, batchCode: 'BB-1112-02' },
  { ingredientId: 'batter', branchId: 'branch-2', quantity: 4, minimumStock: 2, batchCode: 'BB-1111-01' },
  { ingredientId: 'batter', branchId: 'branch-3', quantity: 6, minimumStock: 2, batchCode: 'BB-1112-01' },
];

export function getInventoryStockStatus(
  quantity: number | null,
  minimumStock: number,
  expirationDate?: string,
  referenceDate = '2026-11-12',
): InventoryStockStatus {
  if (quantity === null) return 'Not tracked';
  if (quantity === 0) return 'Out of Stock';
  if (quantity < minimumStock) return 'Low Stock';
  if (expirationDate) {
    const expiry = new Date(`${expirationDate}T00:00:00+08:00`);
    const reference = new Date(`${referenceDate}T00:00:00+08:00`);
    const days = Math.ceil((expiry.getTime() - reference.getTime()) / 86_400_000);
    if (days >= 0 && days <= NEAR_EXPIRY_DAYS) return 'Near Expiration';
  }
  return 'Normal';
}

export function formatInventoryQuantity(quantity: number | null): string {
  if (quantity === null) return '—';
  return Number.isInteger(quantity) ? String(quantity) : String(quantity);
}
