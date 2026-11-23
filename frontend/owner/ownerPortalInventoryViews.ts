// OW-04 Multi-Branch Inventory Monitoring on the Owner Web Portal: one tab per
// branch and a Branch Comparison of the same item across the branches.
import type { OwnerPortalInventoryRow } from './ownerPortalInventory.ts';
import { branchKey } from './ownerRecordFilters.ts';

export const BRANCH_COMPARISON_TAB = 'Branch Comparison';
export const NO_RECORD_CELL = 'No record · Not tracked';

/** "Manila · Branch 1" → "Branch 1" (OW-04 c1 tab labels). */
export function inventoryTabLabel(branchName: string): string {
  return branchKey(branchName);
}

/** OW-04 c5: search by item name and filter by category ("All categories" keeps every row). */
export function filterInventoryRows(
  rows: readonly OwnerPortalInventoryRow[],
  input: { query: string; category: string },
): OwnerPortalInventoryRow[] {
  const query = input.query.trim().toLowerCase();
  return rows.filter((row) =>
    (input.category === 'All categories' || row.category === input.category)
    && (!query || row.name.toLowerCase().includes(query)));
}

export function inventoryCategories(rows: readonly OwnerPortalInventoryRow[]): string[] {
  return ['All categories', ...[...new Set(rows.map((row) => row.category))].sort((left, right) => left.localeCompare(right))];
}

/** OW-04 c8: the status as a text label, never color alone. */
export function stockStatusLabel(row: Pick<OwnerPortalInventoryRow, 'stockLevel' | 'status'>): string {
  if (row.stockLevel === 'Low Stock') return 'Low';
  if (row.stockLevel === 'Out of Stock') return 'Out of Stock';
  if (row.stockLevel === 'Not tracked') return 'Not tracked';
  return 'Normal';
}

export const BRANCH_INVENTORY_HEADERS = ['Item', 'Category', 'Unit', 'Expected Quantity', 'Minimum Stock', 'Status', 'Lot · Expiration'];

/** OW-04 c2–c4: one branch's rows, prepared batter first (bottles available). */
export function branchInventoryRows(rows: readonly OwnerPortalInventoryRow[], branchId: string): string[][] {
  return rows
    .filter((row) => row.branchId === branchId)
    .sort((left, right) => Number(right.ingredientId === 'prepared-batter') - Number(left.ingredientId === 'prepared-batter') || left.name.localeCompare(right.name))
    .map((row) => [
      row.ingredientId === 'prepared-batter' ? `${row.name} (bottles available)` : row.name,
      row.category,
      row.unit,
      row.quantityLabel,
      row.minimumStock === null || row.minimumStock === undefined ? '—' : String(row.minimumStock),
      stockStatusLabel(row),
      row.expiry === '—' ? '—' : row.batches,
    ]);
}

/** OW-04 c6, c7: each item side by side per branch; a missing record reads "No record · Not tracked". */
export function inventoryComparison(
  rows: readonly OwnerPortalInventoryRow[],
  branches: ReadonlyArray<{ id: string; name: string }>,
): { headers: string[]; rows: string[][] } {
  const items = new Map<string, { name: string; unit: string }>();
  for (const row of rows) if (!items.has(row.ingredientId)) items.set(row.ingredientId, { name: row.name, unit: row.unit });
  const byKey = new Map(rows.map((row) => [`${row.branchId}:${row.ingredientId}`, row]));
  return {
    headers: ['Item', 'Unit', ...branches.map((branch) => inventoryTabLabel(branch.name))],
    rows: [...items.entries()]
      .sort((left, right) => left[1].name.localeCompare(right[1].name))
      .map(([id, item]) => [
        item.name,
        item.unit,
        ...branches.map((branch) => {
          const row = byKey.get(`${branch.id}:${id}`);
          if (!row || row.stockLevel === 'Not tracked') return NO_RECORD_CELL;
          return `${row.quantityLabel} · ${stockStatusLabel(row)}`;
        }),
      ]),
  };
}
