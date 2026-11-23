// ST-14 c2: the Inventory Transaction History type filter offers exactly these
// types (User Story sheet of 2026-11-23). Other rows still appear under
// "All types": Usage, Stock-Out, transfers, the raw ingredients a batter batch
// used and the prepared batter it made (reason "Batter preparation"), and
// opening stock (a Stock-In with the reason "Opening", OW-28).
//
// Stock-In lists received supplies only, so batter batches and opening stock
// are not counted as deliveries.

export const STAFF_HISTORY_TYPE_FILTERS = [
  'All types',
  'Stock-In',
  'Sales Consumption',
  'Waste',
  'Spillage',
  'Spoilage',
  'Physical Inventory Count',
  'Count Revision',
  'Authorized Adjustment',
  'Void',
  'Entry Reversal',
] as const;

export type StaffHistoryTypeFilter = (typeof STAFF_HISTORY_TYPE_FILTERS)[number];

type HistoryRow = {
  type: string;
  reason: string;
  physicalCount?: {
    correctionHistory?: unknown[];
    revisedActualQuantity?: number | null;
  } | null;
};

function isSpillage(row: HistoryRow): boolean {
  return row.type === 'Waste' && /^spillage/i.test(row.reason.trim());
}

function isBatterPreparation(row: HistoryRow): boolean {
  return /^batter preparation/i.test(row.reason.trim());
}

function isOpening(row: HistoryRow): boolean {
  return row.type === 'Opening' || (row.type === 'Stock-In' && /^opening/i.test(row.reason.trim()));
}

export function matchesHistoryTypeFilter(row: HistoryRow, filter: StaffHistoryTypeFilter): boolean {
  switch (filter) {
    case 'All types':
      return true;
    case 'Stock-In':
      // Received supplies only: batter batches and opening stock show under All types.
      return row.type === 'Stock-In' && !isBatterPreparation(row) && !isOpening(row);
    case 'Waste':
      return row.type === 'Waste' && !isSpillage(row);
    case 'Spillage':
      return isSpillage(row);
    case 'Count Revision':
      // A count that was changed through a correction request.
      return row.type === 'Physical Inventory Count'
        && ((row.physicalCount?.correctionHistory?.length ?? 0) > 0 || row.physicalCount?.revisedActualQuantity != null);
    case 'Void':
      return row.type === 'Void Reversal';
    default:
      return row.type === filter;
  }
}

/** The short tab label. */
export function historyTypeFilterTabLabel(filter: StaffHistoryTypeFilter): string {
  return filter === 'All types' ? 'All' : filter;
}
