import type { OwnerSalesTransactionBundle } from '../services/takosync.ts';
import { recordedSaleIsBulkOrder } from '../services/bulkOrder.ts';

export const pageSize = 20;

// Kept so a design preview can still force the loading / empty / error screens. Real data is
// always read from the database; the old 'success' and 'load_more' mock states were removed.
export type SalesTransactionForcedState = 'success' | 'empty' | 'loading' | 'error' | 'load_more' | null;

export type SalesTransaction = {
  id: string;
  transactionReference: string;
  branchId: string;
  branchName: string;
  recordedBy: string;
  paymentMethod: string;
  /** OM-09 c3: cash received, for cash sales saved with it (null before #37's migration). */
  amountTendered: number | null;
  createdAt: string;
  status: 'Recorded' | 'Pending' | 'Cancelled' | 'Voided';
  /** OM-09 c4. */
  isBulkOrder: boolean;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  total: number;
  change: number | null;
};

export type SalesTransactionPage = {
  transactions: SalesTransaction[];
  hasMore: boolean;
};

export function getForcedSalesTransactionState(): SalesTransactionForcedState {
  const value = typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_FORCE_SALES_TRANSACTION_STATE
    : undefined;
  if (value === 'empty' || value === 'loading' || value === 'error') return value;
  return null;
}

function branchLabel(city: string, code: string): string {
  const number = Number(code.replace(/\D/g, '')) || code;
  return `${city ? `${city} · ` : ''}Branch ${number}`;
}

function money(value: number | string | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export function buildSalesTransactions(bundle: OwnerSalesTransactionBundle): SalesTransaction[] {
  const branches = new Map(bundle.branches.map((branch) => [branch.id, branchLabel(branch.city, branch.code)]));
  const staff = new Map(bundle.profiles.map((profile) => [profile.id, profile.full_name?.trim() || '']));
  const products = new Map(bundle.products.map((product) => [product.id, product.product_name]));
  const variants = new Map(bundle.variants.map((variant) => [variant.id, variant.size_label]));
  const addonNames = new Map(bundle.addonNames.map((addon) => [addon.id, addon.addon_name]));

  return bundle.sales.map((sale) => {
    const productLines = bundle.items
      .filter((item) => item.sale_id === sale.id)
      .map((item) => {
        const quantity = Number(item.quantity);
        const name = products.get(item.product_id) ?? 'Product unavailable';
        const size = item.product_variant_id ? variants.get(item.product_variant_id) : undefined;
        const lineTotal = money(item.subtotal);
        return {
          name: size && !name.toLowerCase().includes(size.toLowerCase()) ? `${name} (${size})` : name,
          quantity,
          unitPrice: item.unit_price === null ? money(lineTotal / (quantity || 1)) : money(item.unit_price),
          lineTotal,
        };
      });
    const addonLines = bundle.addons
      .filter((addon) => addon.sale_id === sale.id)
      .map((addon) => ({
        name: `Add-on: ${addonNames.get(addon.addon_id) ?? 'Add-on unavailable'}`,
        quantity: Number(addon.quantity),
        unitPrice: money(addon.unit_price),
        lineTotal: money(addon.subtotal),
      }));
    const recordedBy = sale.served_by_name?.trim() || staff.get(sale.staff_id);
    const optionalMoney = (value: number | string | null | undefined) =>
      value === null || value === undefined ? null : money(value);
    return {
      id: sale.id,
      transactionReference: sale.transaction_reference,
      branchId: sale.branch_id,
      branchName: branches.get(sale.branch_id) ?? 'Branch unavailable',
      recordedBy: recordedBy ? `${recordedBy} (employee account)` : 'Employee account',
      paymentMethod: sale.payment_method,
      amountTendered: optionalMoney(sale.cash_received),
      createdAt: sale.created_at,
      status: sale.status === 'voided' ? 'Voided' as const
        : sale.status === 'cancelled' ? 'Cancelled' as const
          : sale.status === 'pending' ? 'Pending' as const
            : 'Recorded' as const,
      isBulkOrder: recordedSaleIsBulkOrder(undefined, productLines.map((line) => line.quantity)),
      items: [...productLines, ...addonLines],
      // The saved sale total is authoritative; it already includes add-ons.
      total: money(sale.total_amount),
      change: optionalMoney(sale.change_amount),
    };
  });
}

export type SalesTransactionFilters = {
  branchKey?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

/** OM-09 c5: the completed total of the listed transactions; voided ones are not added. */
export function completedTotal(transactions: SalesTransaction[]): number {
  return transactions
    .filter((transaction) => transaction.status === 'Recorded')
    .reduce((sum, transaction) => sum + Math.round(transaction.total * 100), 0) / 100;
}

export async function loadSalesTransactionPage(offset = 0, filters: SalesTransactionFilters = {}): Promise<SalesTransactionPage> {
  const { loadOwnerSalesTransactionBundle } = await import('../services/takosync.ts');
  const bundle = await loadOwnerSalesTransactionBundle({ offset, limit: pageSize, ...filters });
  return { transactions: buildSalesTransactions(bundle), hasMore: bundle.hasMore };
}

/** Returns null only when the query succeeded and no visible completed sale has this id. */
export async function loadSalesTransactionById(id: string): Promise<SalesTransaction | null> {
  const { loadOwnerSalesTransactionBundle } = await import('../services/takosync.ts');
  const bundle = await loadOwnerSalesTransactionBundle({ saleId: id, limit: 1 });
  return buildSalesTransactions(bundle)[0] ?? null;
}
