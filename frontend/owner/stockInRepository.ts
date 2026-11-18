import { getDailySalesSampleData } from './dailySalesRepository.ts';
import { OWNER_INVENTORY_INGREDIENTS } from './ownerInventoryMock.ts';
import type { TransactionHistoryItem } from '../services/takosync.ts';

export type StockInForcedState = 'success' | 'empty' | 'loading' | 'error' | null;

export type StockInBranch = {
  id: string;
  name: string;
};

export type StockInBatch = {
  batch_reference: string;
  expiration_date: string | null;
};

export type StockInRecord = {
  id: string;
  reference: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  branchName: string;
  createdAt: string;
  expirationDate: string | null;
  supplierReference: string;
  recordedBy: string;
};

type StockInHistoryItem = TransactionHistoryItem & { type: 'Stock-In' };

const stockInSeeds = [
  {
    id: 'SI-1112-0012',
    ingredientId: 'octopus',
    quantity: 5,
    branchName: 'Branch 2',
    createdAt: '2026-11-12T08:00:00+08:00',
    expirationDate: '2026-11-19',
    supplierReference: 'Seaport Traders · DR-20481',
  },
  {
    id: 'SI-1112-0011',
    ingredientId: 'flour',
    quantity: 25,
    branchName: 'Branch 1',
    createdAt: '2026-11-12T07:45:00+08:00',
    expirationDate: null,
    supplierReference: '',
  },
  {
    id: 'SI-1111-0010',
    ingredientId: 'eggs',
    quantity: 60,
    branchName: 'Branch 3',
    createdAt: '2026-11-11T16:10:00+08:00',
    expirationDate: null,
    supplierReference: '',
  },
  {
    id: 'SI-1111-0009',
    ingredientId: 'sauce',
    quantity: 4,
    branchName: 'Branch 1',
    createdAt: '2026-11-11T09:30:00+08:00',
    expirationDate: null,
    supplierReference: '',
  },
] as const;

export function getForcedStockInState(): StockInForcedState {
  const value = typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_FORCE_STOCK_IN_STATE
    : undefined;
  return value === 'success' || value === 'empty' || value === 'loading' || value === 'error'
    ? value
    : null;
}

function getSeedRecorder() {
  const employee = getDailySalesSampleData().sales.find((sale) => sale.staff_id === 'staff-ana');
  if (!employee?.recorded_by_name) {
    throw new Error('The shared mock employee account for Stock-In records is unavailable.');
  }
  return employee.recorded_by_name;
}

export function getStockInMockRecords(): StockInRecord[] {
  const recordedBy = getSeedRecorder();
  return stockInSeeds.map((seed) => {
    const ingredient = OWNER_INVENTORY_INGREDIENTS.find((item) => item.id === seed.ingredientId);
    if (!ingredient) throw new Error(`Shared inventory data is incomplete for Stock-In ${seed.id}.`);
    return {
      id: seed.id,
      reference: seed.id,
      ingredientId: seed.ingredientId,
      ingredientName: ingredient.displayName,
      quantity: seed.quantity,
      unit: ingredient.unit,
      branchName: seed.branchName,
      createdAt: seed.createdAt,
      expirationDate: seed.expirationDate,
      supplierReference: seed.supplierReference,
      recordedBy,
    };
  });
}

export function buildStockInRecords(
  history: TransactionHistoryItem[],
  batches: StockInBatch[],
): StockInRecord[] {
  return history
    .filter((record): record is StockInHistoryItem => record.type === 'Stock-In')
    .map((record) => ({
      id: record.id,
      reference: record.reference,
      ingredientId: record.ingredientId,
      ingredientName: record.ingredientName,
      quantity: Math.abs(record.quantity),
      unit: record.unit,
      branchName: record.branch,
      createdAt: record.transactionDate.toISOString(),
      expirationDate: record.expirationDate
        ?? batches.find((batch) => batch.batch_reference === record.batchReference)?.expiration_date
        ?? null,
      supplierReference: record.notes.trim() || record.batchReference || '',
      recordedBy: record.staff,
    }))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export async function loadStockInRecords(
  branches: StockInBranch[],
  batches: StockInBatch[],
): Promise<StockInRecord[]> {
  if (branches.length === 0) throw new Error('Owner branches are unavailable for Stock-In records.');
  const { loadTransactionHistory } = await import('../services/takosync.ts');
  const historyByBranch = await Promise.all(
    branches.map((branch) => loadTransactionHistory(branch.id)),
  );
  return buildStockInRecords(historyByBranch.flat(), batches);
}

export function formatStockInDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(part('day'))} ${months[Number(part('month')) - 1]} ${part('year')} · ${Number(part('hour'))}:${part('minute')} ${part('dayPeriod')}`;
}

export function formatStockInExpirationDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00+08:00`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${Number(part('day'))} ${part('month')} ${part('year')}`;
}

export function formatStockInQuantity(record: Pick<StockInRecord, 'quantity' | 'unit'>): string {
  const quantity = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(Math.abs(record.quantity));
  return `+${quantity} ${record.unit}`;
}
