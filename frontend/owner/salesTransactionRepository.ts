import type { OwnerSalesTransactionBundle } from '../services/takosync.ts';

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
  /** The database does not store cash tendered or change, so these are always null. */
  amountTendered: number | null;
  createdAt: string;
  status: 'Recorded';
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
    const recordedBy = staff.get(sale.staff_id);
    return {
      id: sale.id,
      transactionReference: sale.transaction_reference,
      branchId: sale.branch_id,
      branchName: branches.get(sale.branch_id) ?? 'Branch unavailable',
      recordedBy: recordedBy ? `${recordedBy} (employee account)` : 'Employee account',
      paymentMethod: sale.payment_method,
      amountTendered: null,
      createdAt: sale.created_at,
      status: 'Recorded' as const,
      items: [...productLines, ...addonLines],
      // The saved sale total is authoritative; it already includes add-ons.
      total: money(sale.total_amount),
      change: null,
    };
  });
}

export async function loadSalesTransactionPage(offset = 0): Promise<SalesTransactionPage> {
  const { loadOwnerSalesTransactionBundle } = await import('../services/takosync.ts');
  const bundle = await loadOwnerSalesTransactionBundle({ offset, limit: pageSize });
  return { transactions: buildSalesTransactions(bundle), hasMore: bundle.hasMore };
}

/** Returns null only when the query succeeded and no visible completed sale has this id. */
export async function loadSalesTransactionById(id: string): Promise<SalesTransaction | null> {
  const { loadOwnerSalesTransactionBundle } = await import('../services/takosync.ts');
  const bundle = await loadOwnerSalesTransactionBundle({ saleId: id, limit: 1 });
  return buildSalesTransactions(bundle)[0] ?? null;
}
