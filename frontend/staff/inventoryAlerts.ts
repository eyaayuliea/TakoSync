export type InventoryAlertKind = 'lowStock' | 'outOfStock' | 'nearExpiration' | 'expired';

export type InventoryAlertScreenStatus =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'refreshing' }
  | { status: 'stale'; message: string }
  | { status: 'ready' };

export async function runInventoryAlertsRefreshOnce(
  lock: { current: boolean },
  refresh: () => Promise<void>,
): Promise<boolean> {
  if (lock.current) return false;
  lock.current = true;
  try {
    await refresh();
    return true;
  } finally {
    lock.current = false;
  }
}

export function getInventoryAlertScreenStatus(
  hasSnapshot: boolean,
  loading: boolean,
  error: string,
): InventoryAlertScreenStatus {
  const message = error.trim();
  if (hasSnapshot) {
    if (message) return { status: 'stale', message };
    return loading ? { status: 'refreshing' } : { status: 'ready' };
  }
  if (message) return { status: 'error', message };
  return { status: 'loading' };
}

export function inventoryAlertEmptyCopy(kind: InventoryAlertKind) {
  switch (kind) {
    case 'lowStock':
      return {
        title: 'No active alerts.',
        message: 'There are no low-stock alerts',
      };
    case 'outOfStock':
      return {
        title: 'No active alerts.',
        message: 'There are no out-of-stock alerts',
      };
    case 'nearExpiration':
      return {
        title: 'No active alerts.',
        message: 'There are no near-expiration alerts',
      };
    case 'expired':
      return {
        title: 'No active alerts.',
        message: 'There are no expired alerts',
      };
  }
}

export type BranchInventoryAlertItem = { hasBranchInventory: boolean };

export function filterBranchInventoryAlertItems<T extends BranchInventoryAlertItem>(items: readonly T[]): T[] {
  return items.filter((item) => item.hasBranchInventory);
}

export function filterBatchesWithRemainingStock<T extends { quantityRemaining: number }>(
  batches: readonly T[],
): T[] {
  return batches.filter((batch) => batch.quantityRemaining > 0);
}

export function deduplicateInventoryAlerts<T extends { id: string }>(alerts: readonly T[]): T[] {
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    if (seen.has(alert.id)) return false;
    seen.add(alert.id);
    return true;
  });
}

export type SortableInventoryAlert = {
  id: string;
  kind: InventoryAlertKind;
  title: string;
  quantity?: number;
  daysRemaining?: number;
};

export function sortInventoryAlerts<T extends SortableInventoryAlert>(alerts: readonly T[]): T[] {
  return [...alerts].sort((left, right) => {
    if (isStockAlert(left.kind) && isStockAlert(right.kind)) {
      return (left.quantity ?? 0) - (right.quantity ?? 0) || left.title.localeCompare(right.title);
    }
    if (!isStockAlert(left.kind) && !isStockAlert(right.kind)) {
      return (left.daysRemaining ?? Number.POSITIVE_INFINITY)
        - (right.daysRemaining ?? Number.POSITIVE_INFINITY)
        || left.title.localeCompare(right.title);
    }
    return left.kind.localeCompare(right.kind);
  });
}

export function countInventoryAlertsByKind<T extends { kind: InventoryAlertKind }>(alerts: readonly T[]) {
  return alerts.reduce<Record<InventoryAlertKind, number>>((counts, alert) => {
    counts[alert.kind] += 1;
    return counts;
  }, { lowStock: 0, outOfStock: 0, nearExpiration: 0, expired: 0 });
}

export function countInventoryAlertsForSnapshot<T extends { kind: InventoryAlertKind }>(
  alerts: readonly T[],
  hasSnapshot: boolean,
) {
  return hasSnapshot ? countInventoryAlertsByKind(alerts) : null;
}

/**
 * Counts are only current when the latest alert query has settled successfully.
 * Returning empty counts while loading or after an error prevents stale badges
 * from presenting an older snapshot as current data.
 */
export function countInventoryAlertsWhenReady<T extends { kind: InventoryAlertKind }>(
  alerts: readonly T[],
  loading: boolean,
  error: string,
) {
  if (loading || error.trim() !== '') return countInventoryAlertsByKind([]);
  return countInventoryAlertsByKind(alerts);
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
      return 'Low stock';
    case 'outOfStock':
      return 'Out of stock';
    case 'nearExpiration':
      return 'Near expiration';
    case 'expired':
      return 'Expired';
  }
}
