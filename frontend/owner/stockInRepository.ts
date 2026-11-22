import type { StockInReceiptDetail, TransactionHistoryItem } from '../services/takosync.ts';

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
  /** The entry was undone by an approved Entry Reversal; it stays listed. */
  isReversed: boolean;
  /**
   * OM-18 c2: from the Stock-In receipt (header + lines). Null for entries
   * recorded before receipts existed, which have a single transaction date.
   */
  receiptReference: string | null;
  datePurchased: string | null;
  dateReceived: string | null;
  /** When staff saved the receipt (server time). */
  recordedAt: string | null;
  /** The quantity as entered, when it was in a purchase unit (e.g. 3 pack). */
  enteredQuantity: number | null;
  enteredUnit: string | null;
};

type StockInHistoryItem = TransactionHistoryItem & { type: 'Stock-In' };

export function buildStockInRecords(
  history: TransactionHistoryItem[],
  batches: StockInBatch[],
  reversedIds: ReadonlySet<string> = new Set(),
  receipts: ReadonlyMap<string, StockInReceiptDetail> = new Map(),
): StockInRecord[] {
  return history
    // Received supplies only: a batter batch's yield is a Stock-In movement in the
    // ledger but belongs to Batter Batch Recording, not to this report.
    .filter((record): record is StockInHistoryItem =>
      record.type === 'Stock-In' && !/^batter preparation/i.test(record.reason.trim()))
    .map((record) => {
      const receipt = receipts.get(record.id) ?? null;
      const purchaseUnit = receipt !== null && receipt.enteredUnit !== record.unit;
      return ({
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
      // With a receipt, the supplier or reference staff typed; otherwise the old notes.
      supplierReference: receipt ? receipt.supplierReference ?? '' : record.notes.trim() || record.batchReference || '',
      recordedBy: record.staff,
      isReversed: reversedIds.has(record.id),
      receiptReference: receipt?.receiptReference ?? null,
      datePurchased: receipt?.datePurchased ?? null,
      dateReceived: receipt?.dateReceived ?? null,
      recordedAt: receipt?.recordedAt ?? null,
      enteredQuantity: purchaseUnit ? receipt.enteredQuantity : null,
      enteredUnit: purchaseUnit ? receipt.enteredUnit : null,
    });
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export async function loadStockInRecords(
  branches: StockInBranch[],
  batches: StockInBatch[],
): Promise<StockInRecord[]> {
  if (branches.length === 0) throw new Error('Owner branches are unavailable for Stock-In records.');
  const { loadReversedEntryIds, loadStockInReceiptDetails, loadTransactionHistory } = await import('../services/takosync.ts');
  const [historyByBranch, reversedIds, receipts] = await Promise.all([
    Promise.all(branches.map((branch) => loadTransactionHistory(branch.id))),
    loadReversedEntryIds(),
    loadStockInReceiptDetails(),
  ]);
  return buildStockInRecords(historyByBranch.flat(), batches, reversedIds, receipts);
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

/** "23 Nov 2026" for a YYYY-MM-DD date of a Stock-In receipt. */
export function formatStockInDate(value: string): string {
  return formatStockInExpirationDate(value);
}

/** OM-18 c1: the date line of a list row. Receipts show the date received, older entries their timestamp. */
export function stockInListDate(record: Pick<StockInRecord, 'dateReceived' | 'createdAt'>): string {
  return record.dateReceived ? `Received ${formatStockInDate(record.dateReceived)}` : formatStockInDateTime(record.createdAt);
}

/** "3 pack = 1.08 L" when the quantity was entered in a purchase unit, else null. */
export function stockInEnteredQuantity(record: Pick<StockInRecord, 'enteredQuantity' | 'enteredUnit' | 'quantity' | 'unit'>): string | null {
  if (record.enteredQuantity === null || !record.enteredUnit) return null;
  const trim = (value: number) => String(Math.round(value * 1000) / 1000);
  return `${trim(record.enteredQuantity)} ${record.enteredUnit} = ${trim(record.quantity)} ${record.unit}`;
}
