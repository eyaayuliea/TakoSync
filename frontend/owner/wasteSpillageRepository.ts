import type { TransactionHistoryItem } from '../services/takosync.ts';

export const WasteSpillageCategory = {
  Spoilage: 'spoilage',
  Spillage: 'spillage',
  Waste: 'waste',
  Other: 'other',
} as const;

export type WasteSpillageCategory = typeof WasteSpillageCategory[keyof typeof WasteSpillageCategory];

export const WASTE_SPILLAGE_CATEGORY_LABELS: Record<WasteSpillageCategory, string> = {
  [WasteSpillageCategory.Spoilage]: 'Spoilage',
  [WasteSpillageCategory.Spillage]: 'Spillage',
  [WasteSpillageCategory.Waste]: 'Waste',
  [WasteSpillageCategory.Other]: 'Other',
};

export type WasteSpillageRecord = {
  id: string;
  recordReference: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  category: WasteSpillageCategory;
  branchId: string;
  branchName: string;
  createdAt: string;
  remarks: string;
  recordedBy: string;
};

type WasteSpillageHistoryItem = TransactionHistoryItem & {
  type: 'Waste' | 'Spoilage';
};

function categoryFromHistory(record: WasteSpillageHistoryItem): WasteSpillageCategory {
  const reason = record.reason.trim().toLowerCase();
  if (reason === WasteSpillageCategory.Spoilage) return WasteSpillageCategory.Spoilage;
  if (reason === WasteSpillageCategory.Spillage) return WasteSpillageCategory.Spillage;
  if (reason === WasteSpillageCategory.Waste) return WasteSpillageCategory.Waste;
  if (reason === WasteSpillageCategory.Other) return WasteSpillageCategory.Other;
  return record.type === 'Spoilage' ? WasteSpillageCategory.Spoilage : WasteSpillageCategory.Waste;
}

export function buildWasteSpillageRecords(history: TransactionHistoryItem[]): WasteSpillageRecord[] {
  return history
    .filter((record): record is WasteSpillageHistoryItem => record.type === 'Waste' || record.type === 'Spoilage')
    .map((record) => ({
      id: record.id,
      recordReference: record.reference,
      ingredientId: record.ingredientId,
      ingredientName: record.ingredientName,
      quantity: Math.abs(record.quantity),
      unit: record.unit,
      category: categoryFromHistory(record),
      branchId: record.branchId,
      branchName: record.branch,
      createdAt: record.transactionDate.toISOString(),
      remarks: record.notes,
      recordedBy: record.staff,
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function loadWasteSpillageRecords(
  branches: { id: string; name: string }[],
): Promise<WasteSpillageRecord[]> {
  if (branches.length === 0) throw new Error('Owner branches are unavailable for Waste and Spillage records.');
  const { loadTransactionHistory } = await import('../services/takosync.ts');
  const historyByBranch = await Promise.all(
    branches.map((branch) => loadTransactionHistory(branch.id)),
  );
  return buildWasteSpillageRecords(historyByBranch.flat());
}

export function formatWasteSpillageDateTime(value: string): string {
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
  return `${Number(part('day'))} ${months[Number(part('month')) - 1]} ${part('year')} · ${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
}

export function formatWasteSpillageQuantity(record: Pick<WasteSpillageRecord, 'quantity' | 'unit'>): string {
  const quantity = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(record.quantity);
  return `${quantity} ${record.unit}`;
}
