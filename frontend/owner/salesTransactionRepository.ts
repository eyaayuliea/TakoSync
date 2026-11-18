import { getDailySalesSampleData } from './dailySalesRepository';
import type { OwnerSale, OwnerSaleItem } from '../services/takosync';

export const pageSize = 20;

export type SalesTransactionForcedState = 'success' | 'empty' | 'loading' | 'error' | 'load_more' | null;

export type SalesTransaction = {
  id: string;
  transactionReference: string;
  branchId: string;
  branchName: string;
  recordedBy: string;
  paymentMethod: string;
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

export function getForcedSalesTransactionState(): SalesTransactionForcedState {
  const value = typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_FORCE_SALES_TRANSACTION_STATE
    : undefined;
  if (value === 'success' || value === 'empty' || value === 'loading' || value === 'error' || value === 'load_more') return value;
  return null;
}

function formatBranch(branchId: string) {
  return branchId === 'branch-1' ? 'Branch 1'
    : branchId === 'branch-2' ? 'Branch 2'
      : branchId === 'branch-3' ? 'Branch 3'
        : branchId;
}

function buildTransaction(sale: OwnerSale, items: OwnerSaleItem[]): SalesTransaction {
  const matchingItems = items.filter((item) => item.sale_id === sale.id);
  const transactionAmounts: Record<string, number> = {
    'TXN-1112-0047': 348,
    'TXN-1112-0046': 213,
    'TXN-1112-0045': 267,
    'TXN-1112-0044': 129,
    'TXN-1112-0043': 89,
  };
  const om13Amount = transactionAmounts[sale.transaction_reference];
  const lineItems = sale.transaction_reference === 'TXN-1112-0046'
    ? [
      { name: 'Takoyaki (8 pcs)', quantity: 2, unitPrice: 89, lineTotal: 178 },
      { name: 'Iced Tea', quantity: 1, unitPrice: 35, lineTotal: 35 },
    ]
    : matchingItems.length > 0 && om13Amount === undefined
    ? matchingItems.map((item) => ({
      name: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.quantity * item.unit_price,
    }))
      : [{
        name: 'Takoyaki (8 pcs)',
        quantity: 1,
        unitPrice: om13Amount ?? sale.total_amount,
        lineTotal: om13Amount ?? sale.total_amount,
      }];
  const total = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const cash = sale.payment_method === 'Cash';
  const amountTendered = cash ? (sale.transaction_reference === 'TXN-1112-0046' ? 250 : null) : null;
  return {
    id: sale.id,
    transactionReference: sale.transaction_reference,
    branchId: sale.branch_id,
    branchName: formatBranch(sale.branch_id),
    recordedBy: `${sale.recorded_by_name || 'Ana Reyes'} (employee account)`,
    paymentMethod: sale.payment_method,
    amountTendered,
    createdAt: sale.created_at,
    status: 'Recorded',
    items: lineItems,
    total,
    change: cash && amountTendered !== null ? amountTendered - total : null,
  };
}

export function getSalesTransactionMockList(): SalesTransaction[] {
  const data = getDailySalesSampleData();
  return data.sales
    .filter((sale) => ['TXN-1112-0047', 'TXN-1112-0046', 'TXN-1112-0045', 'TXN-1112-0044', 'TXN-1112-0043'].includes(sale.transaction_reference))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((sale) => buildTransaction(sale, data.items));
}

export function getSalesTransactionById(id: string): SalesTransaction | null {
  return getSalesTransactionMockList().find((transaction) => transaction.id === id) ?? null;
}
