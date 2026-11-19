import type { OwnerSaleItem } from '../services/takosync';

export const PRODUCTS_SOLD_EMPTY_MESSAGE = 'No sales recorded for this period.';
export const PRODUCTS_SECTION_TITLE = 'Sales per branch';

export type OwnerProductSummary = {
  id: string;
  name: string;
  quantity: number;
  total: number;
};

/**
 * OM-08 criterion 3 counts quantities "only from confirmed and recorded sales" - the same sale set
 * that OM-03..OM-07 total (status 'completed', see shouldIncludeOwnerSaleInSummary). A recorded sale
 * whose inventory update is pending or failed is still a recorded sale (OM-14 criterion 5 lists it
 * with a retry/review flag), so its products are counted and the Products Sold quantities reconcile
 * with the sales totals.
 */
export function summarizeOwnerProducts(items: readonly OwnerSaleItem[]): OwnerProductSummary[] {
  const grouped = new Map<string, OwnerProductSummary>();
  for (const item of items) {
    const quantity = Number(item.quantity);
    const total = Number(item.subtotal);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const existing = grouped.get(item.product_id) ?? {
      id: item.product_id,
      name: item.product_name,
      quantity: 0,
      total: 0,
    };
    existing.quantity += quantity;
    existing.total += Number.isFinite(total) ? total : 0;
    grouped.set(item.product_id, existing);
  }
  return [...grouped.values()]
    .filter((product) => product.quantity > 0)
    .sort((left, right) => right.quantity - left.quantity || right.total - left.total || left.name.localeCompare(right.name));
}
