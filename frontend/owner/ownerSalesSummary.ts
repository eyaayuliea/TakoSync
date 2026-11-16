import type { OwnerSaleItem } from '../services/takosync';

export const PRODUCTS_SOLD_EMPTY_MESSAGE = 'No sales recorded for this period.';

export type OwnerProductSummary = {
  id: string;
  name: string;
  quantity: number;
  total: number;
};

export function summarizeOwnerProducts(items: readonly OwnerSaleItem[]): OwnerProductSummary[] {
  const grouped = new Map<string, OwnerProductSummary>();
  for (const item of items) {
    if (item.inventory_processing_status && item.inventory_processing_status !== 'completed') continue;
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
