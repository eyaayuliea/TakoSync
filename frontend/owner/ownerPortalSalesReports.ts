// OW-07 Branch Sales, OW-08 Products Sold and OW-09 Transaction Summary reports
// on the Owner Web Portal. Totals are summed in centavos.
import { recordedSaleIsBulkOrder, BULK_ORDER_LABEL } from '../services/bulkOrder.ts';
import { summarizeAddons, summarizeProductVariants } from './ownerSalesBreakdowns.ts';

type Sale = {
  id: string;
  transaction_reference: string;
  branch_id: string;
  total_amount: number | string;
  payment_method: string;
  status?: string | null;
  inventory_processing_status?: string | null;
  created_at: string;
  recorded_by_name?: string;
  cash_received?: number | string | null;
  change_amount?: number | string | null;
};
type Item = { sale_id: string; product_id: string; product_name: string; variant_label?: string | null; quantity: number | string; unit_price?: number | string; subtotal: number | string };
type Addon = { sale_id: string; addon_id: string; addon_name: string; quantity: number | string; subtotal: number | string };

const cents = (value: number | string) => Math.round(Number(value) * 100);
export const pesoText = (amount: number) =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A sale counted in sales totals: completed and fully recorded. */
export function isCountedSale(sale: Pick<Sale, 'status' | 'inventory_processing_status'>): boolean {
  return sale.status === 'completed' && sale.inventory_processing_status === 'completed';
}

export const BRANCH_SALES_HEADERS = ['Branch', 'Transactions', 'Total Sales'];

/** OW-07 c2–c5: one row per branch (zero when it had no sales) and a grand total row. */
export function buildWebBranchSalesReport(
  sales: readonly Sale[],
  branches: ReadonlyArray<{ id: string; name: string }>,
): { rows: string[][]; transactions: number; total: number } {
  const counted = sales.filter(isCountedSale);
  let transactions = 0;
  let totalCents = 0;
  const rows = branches.map((branch) => {
    const branchSales = counted.filter((sale) => sale.branch_id === branch.id);
    const branchCents = branchSales.reduce((sum, sale) => sum + cents(sale.total_amount), 0);
    transactions += branchSales.length;
    totalCents += branchCents;
    return [branch.name, String(branchSales.length), pesoText(branchCents / 100)];
  });
  rows.push(['Grand total', String(transactions), pesoText(totalCents / 100)]);
  return { rows, transactions, total: totalCents / 100 };
}

export const PRODUCTS_SOLD_HEADERS = ['Product (flavor)', 'Portion', 'Quantity Sold', 'Sales Amount'];
export const ADDONS_SOLD_HEADERS = ['Add-on', 'Quantity Sold', 'Sales Amount'];

/**
 * OW-08 c2–c5, c8: each product by flavor and portion, highest quantity first,
 * and the add-ons sold. Only items of counted sales (voided sales excluded).
 */
export function buildWebProductsSoldReport(
  sales: readonly Sale[],
  items: readonly Item[],
  addons: readonly Addon[],
): { productRows: string[][]; addonRows: string[][]; quantity: number; total: number } {
  const counted = new Set(sales.filter(isCountedSale).map((sale) => sale.id));
  const products = summarizeProductVariants(items.filter((item) => counted.has(item.sale_id)));
  const extras = summarizeAddons(addons.filter((addon) => counted.has(addon.sale_id)));
  return {
    productRows: products.map((row) => [row.name, row.variantLabel ?? '—', String(row.quantity), pesoText(row.total)]),
    addonRows: extras.map((row) => [row.name, String(row.quantity), pesoText(row.total)]),
    quantity: products.reduce((sum, row) => sum + row.quantity, 0),
    total: (products.reduce((sum, row) => sum + cents(row.total), 0) + extras.reduce((sum, row) => sum + cents(row.total), 0)) / 100,
  };
}

export const TRANSACTION_SUMMARY_HEADERS = [
  'Reference', 'Branch', 'Date Purchased', 'Employee Account', 'Payment', 'Order', 'Status', 'Total',
];

/**
 * OW-09 c2–c7: every completed and voided sale with its payment, Bulk Order
 * flag and status. Voided sales are listed but not added to the total.
 */
export function buildWebTransactionSummaryReport(input: {
  sales: readonly Sale[];
  items: readonly Item[];
  branchName: (branchId: string) => string;
  formatDateTime: (iso: string) => string;
}): { rows: string[][]; saleIds: string[]; completed: number; voided: number; total: number } {
  const listed = input.sales.filter((sale) => isCountedSale(sale) || sale.status === 'voided');
  const quantities = new Map<string, number[]>();
  for (const item of input.items) quantities.set(item.sale_id, [...(quantities.get(item.sale_id) ?? []), Number(item.quantity)]);
  let completed = 0;
  let voided = 0;
  let totalCents = 0;
  const ordered = [...listed].sort((left, right) => right.created_at.localeCompare(left.created_at));
  const rows = ordered
    .map((sale) => {
      const isVoided = sale.status === 'voided';
      if (isVoided) voided += 1;
      else {
        completed += 1;
        totalCents += cents(sale.total_amount);
      }
      const cash = sale.cash_received === null || sale.cash_received === undefined || sale.cash_received === '' ? null : Number(sale.cash_received);
      const change = sale.change_amount === null || sale.change_amount === undefined || sale.change_amount === '' ? null : Number(sale.change_amount);
      const payment = sale.payment_method.trim().toLowerCase() === 'cash' && cash !== null && Number.isFinite(cash)
        ? `${sale.payment_method}\nCash ${pesoText(cash)} · Change ${pesoText(change ?? cash - Number(sale.total_amount))}`
        : sale.payment_method;
      return [
        sale.transaction_reference,
        input.branchName(sale.branch_id),
        input.formatDateTime(sale.created_at),
        sale.recorded_by_name ?? 'Staff unavailable',
        payment,
        recordedSaleIsBulkOrder(null, quantities.get(sale.id) ?? []) ? BULK_ORDER_LABEL : '—',
        isVoided ? 'Voided' : 'Completed',
        isVoided ? `${pesoText(Number(sale.total_amount))}\n(not counted)` : pesoText(Number(sale.total_amount)),
      ];
    });
  return { rows, saleIds: ordered.map((sale) => sale.id), completed, voided, total: totalCents / 100 };
}

export const SALE_DETAIL_HEADERS = ['Item', 'Quantity', 'Unit Price', 'Line Amount'];

/**
 * OW-03 c8: one sale's lines with the quantity, the unit price saved at the
 * time of sale and the line amount; add-ons follow the products.
 */
export function buildSaleDetailRows(saleId: string, items: readonly Item[], addons: readonly Addon[]): { rows: string[][]; total: number } {
  let totalCents = 0;
  const rows: string[][] = [];
  for (const item of items.filter((line) => line.sale_id === saleId)) {
    const quantity = Number(item.quantity);
    const unit = item.unit_price === undefined ? Number(item.subtotal) / (quantity || 1) : Number(item.unit_price);
    totalCents += cents(item.subtotal);
    rows.push([`${item.product_name}${item.variant_label ? ` · ${item.variant_label}` : ''}`, String(quantity), pesoText(unit), pesoText(Number(item.subtotal))]);
  }
  for (const addon of addons.filter((line) => line.sale_id === saleId)) {
    const quantity = Number(addon.quantity);
    totalCents += cents(addon.subtotal);
    rows.push([`Add-on: ${addon.addon_name}`, String(quantity), pesoText(Number(addon.subtotal) / (quantity || 1)), pesoText(Number(addon.subtotal))]);
  }
  return { rows, total: totalCents / 100 };
}
