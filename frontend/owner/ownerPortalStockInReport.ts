// OW-15 Stock-In Report on the Owner Web Portal, built from the same Stock-In
// records as the owner mobile report (OM-18): receipt dates, expiry, supplier,
// recorder, and approved reversals marked rather than hidden (c6).
import type { StockInRecord } from './stockInRepository';

export type WebStockInTotal = { ingredientName: string; unit: string; quantity: number; entries: number };

/** A receipt's YYYY-MM-DD date as the start of that Manila day. */
function manilaDay(key: string): number {
  return Date.parse(`${key.slice(0, 10)}T00:00:00+08:00`);
}

/** The date a Stock-In counts toward a period: the date received, else when it was recorded. */
export function stockInReportTime(record: Pick<StockInRecord, 'dateReceived' | 'createdAt'>): number {
  return record.dateReceived ? manilaDay(record.dateReceived) : Date.parse(record.createdAt);
}

export function buildWebStockInReport(
  records: StockInRecord[],
  range: { start: Date; end: Date },
): { rows: StockInRecord[]; totals: WebStockInTotal[] } {
  const start = range.start.getTime();
  const end = range.end.getTime();
  const rows = records
    .filter((record) => {
      const at = stockInReportTime(record);
      return Number.isFinite(at) && at >= start && at < end;
    })
    // Newest first; entries received the same day are ordered by when they were recorded.
    .sort((left, right) => stockInReportTime(right) - stockInReportTime(left)
      || (right.recordedAt ?? right.createdAt).localeCompare(left.recordedAt ?? left.createdAt));

  // c7: total received per ingredient. A reversed entry was undone, so it is
  // listed but not counted.
  const totals = new Map<string, WebStockInTotal>();
  for (const record of rows) {
    if (record.isReversed) continue;
    const key = `${record.ingredientName}\u0000${record.unit}`;
    const total = totals.get(key) ?? { ingredientName: record.ingredientName, unit: record.unit, quantity: 0, entries: 0 };
    total.quantity = Math.round((total.quantity + record.quantity) * 1000) / 1000;
    total.entries += 1;
    totals.set(key, total);
  }
  return {
    rows,
    totals: [...totals.values()].sort((left, right) => left.ingredientName.localeCompare(right.ingredientName)),
  };
}
