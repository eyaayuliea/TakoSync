// OW-02 c5, c6 on the Owner Web Portal dashboard: the stock status counts per
// branch, and one alert per low, out-of-stock, near-expiry or expired item.
import type { OwnerPortalInventoryRow } from './ownerPortalInventory.ts';

export type BranchStockCounts = { branchId: string; branch: string; normal: number; low: number; out: number };

/** OW-02 c5: normal, low and out-of-stock items of each branch (stock level only). */
export function dashboardStockCounts(
  rows: readonly OwnerPortalInventoryRow[],
  branches: ReadonlyArray<{ id: string; name: string }>,
): BranchStockCounts[] {
  return branches.map((branch) => {
    const branchRows = rows.filter((row) => row.branchId === branch.id);
    return {
      branchId: branch.id,
      branch: branch.name,
      normal: branchRows.filter((row) => row.stockLevel === 'Normal').length,
      low: branchRows.filter((row) => row.stockLevel === 'Low Stock').length,
      out: branchRows.filter((row) => row.stockLevel === 'Out of Stock').length,
    };
  });
}

/**
 * The four alert categories, named as on the staff and owner mobile Alerts
 * screens. The dashboard counts and lists each one separately.
 */
export const DASHBOARD_ALERT_CATEGORIES = ['Low Stock', 'Out of Stock', 'Near Expiration', 'Expired'] as const;
export type DashboardAlertType = typeof DASHBOARD_ALERT_CATEGORIES[number];
export type DashboardAlert = { ingredient: string; branch: string; type: DashboardAlertType; detail: string };

const ORDER: Record<DashboardAlertType, number> = { 'Out of Stock': 0, Expired: 1, 'Low Stock': 2, 'Near Expiration': 3 };

/**
 * OW-02 c6: each affected ingredient with its branch and alert type. An item can
 * have a stock alert and an expiration alert at the same time. Most urgent first.
 */
export function dashboardAlerts(rows: readonly OwnerPortalInventoryRow[]): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  for (const row of rows) {
    const quantity = `${row.quantityLabel} ${row.unit}`;
    if (row.stockLevel === 'Out of Stock') alerts.push({ ingredient: row.name, branch: row.branch, type: 'Out of Stock', detail: `${quantity} left` });
    if (row.stockLevel === 'Low Stock') {
      const minimum = row.minimumStock === null || row.minimumStock === undefined ? '' : ` (minimum ${row.minimumStock} ${row.unit})`;
      alerts.push({ ingredient: row.name, branch: row.branch, type: 'Low Stock', detail: `${quantity} left${minimum}` });
    }
    if (row.expirationLevel === 'Expired') alerts.push({ ingredient: row.name, branch: row.branch, type: 'Expired', detail: `Expired ${row.expiry}` });
    if (row.expirationLevel === 'Near Expiration') alerts.push({ ingredient: row.name, branch: row.branch, type: 'Near Expiration', detail: `Expires ${row.expiry}` });
  }
  return alerts.sort((left, right) =>
    ORDER[left.type] - ORDER[right.type] || left.branch.localeCompare(right.branch, 'en', { numeric: true }) || left.ingredient.localeCompare(right.ingredient));
}

/** The number of alerts in each category, zero included. */
export function dashboardAlertCounts(alerts: readonly DashboardAlert[]): Record<DashboardAlertType, number> {
  const counts = Object.fromEntries(DASHBOARD_ALERT_CATEGORIES.map((category) => [category, 0])) as Record<DashboardAlertType, number>;
  for (const alert of alerts) counts[alert.type] += 1;
  return counts;
}

/** The alerts of one category, or all of them. */
export function filterDashboardAlerts(alerts: readonly DashboardAlert[], category: DashboardAlertType | 'All'): DashboardAlert[] {
  return category === 'All' ? [...alerts] : alerts.filter((alert) => alert.type === category);
}
