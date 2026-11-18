import { getDailySalesSampleData } from './dailySalesRepository';
import type { OwnerSale } from '../services/takosync';

export const pageSize = 20;

export type SalesConsumptionForcedState = 'success' | 'empty' | 'loading' | 'error' | 'load_more' | null;

export type SalesConsumptionRecord = {
  id: string;
  recordReference: string;
  ingredientName: string;
  quantity: number;
  unit: 'bottle' | 'g';
  saleId: string;
  saleReference: string;
  branchId: string;
  branchName: string;
  createdAt: string;
  recordedBy: string;
  updateFailed: boolean;
};

export function getForcedSalesConsumptionState(): SalesConsumptionForcedState {
  const value = typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_FORCE_SALES_CONSUMPTION_STATE
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

function buildRecord(sale: OwnerSale, index: number): SalesConsumptionRecord {
  const specs = [
    { recordReference: 'SC-1112-0047', ingredientName: 'Prepared Batter', quantity: 0.32, unit: 'bottle' as const, updateFailed: false },
    { recordReference: 'SC-1112-0046', ingredientName: 'Octopus', quantity: 80, unit: 'g' as const, updateFailed: false },
    { recordReference: 'SC-1112-0045', ingredientName: 'Prepared Batter', quantity: 0.64, unit: 'bottle' as const, updateFailed: true },
    { recordReference: 'SC-1112-0044', ingredientName: 'Prepared Batter', quantity: 0.20, unit: 'bottle' as const, updateFailed: false },
  ];
  const spec = specs[index];
  return {
    id: spec.recordReference,
    recordReference: spec.recordReference,
    ingredientName: spec.ingredientName,
    quantity: spec.quantity,
    unit: spec.unit,
    saleId: sale.id,
    saleReference: sale.transaction_reference,
    branchId: sale.branch_id,
    branchName: formatBranch(sale.branch_id),
    createdAt: sale.created_at,
    recordedBy: 'Maria Santos',
    updateFailed: spec.updateFailed,
  };
}

export function getSalesConsumptionMockList(): SalesConsumptionRecord[] {
  const sales = getDailySalesSampleData().sales
    .filter((sale) => ['TXN-1112-0047', 'TXN-1112-0046', 'TXN-1112-0045', 'TXN-1112-0044'].includes(sale.transaction_reference))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return sales.map(buildRecord);
}

export function getSalesConsumptionById(id: string): SalesConsumptionRecord | null {
  return getSalesConsumptionMockList().find((record) => record.id === id) ?? null;
}
