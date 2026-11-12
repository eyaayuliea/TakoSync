export type InventoryAlertKind = 'lowStock' | 'outOfStock' | 'nearExpiration' | 'expired';

export type BranchInventoryAlertItem = { hasBranchInventory: boolean };

export function filterBranchInventoryAlertItems<T extends BranchInventoryAlertItem>(items: readonly T[]): T[] {
  return items.filter((item) => item.hasBranchInventory);
}

export function deduplicateInventoryAlerts<T extends { id: string }>(alerts: readonly T[]): T[] {
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    if (seen.has(alert.id)) return false;
    seen.add(alert.id);
    return true;
  });
}

export function classifyStockAlert(quantity: number, minimumStock: number): InventoryAlertKind | null {
  if (quantity <= 0) return 'outOfStock';
  return minimumStock > 0 && quantity <= minimumStock ? 'lowStock' : null;
}

export function classifyExpirationAlert(
  daysRemaining: number,
  nearExpirationDays: number,
): InventoryAlertKind | null {
  if (daysRemaining < 0) return 'expired';
  return daysRemaining <= nearExpirationDays ? 'nearExpiration' : null;
}

export function isStockAlert(kind: InventoryAlertKind): boolean {
  return kind === 'lowStock' || kind === 'outOfStock';
}

export function inventoryAlertLabel(kind: InventoryAlertKind): string {
  switch (kind) {
    case 'lowStock':
      return 'Low Stock';
    case 'outOfStock':
      return 'Out of Stock';
    case 'nearExpiration':
      return 'Near Expiration';
    case 'expired':
      return 'Expired';
  }
}
