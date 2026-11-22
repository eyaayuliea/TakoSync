// ST-14 c2: the Inventory Transaction History type filter offers exactly these
// types. Other movement types (Usage, Stock-Out, transfers) still appear under
// "All types".
//
// The ledger stores a batter batch as a Usage movement per raw ingredient and a
// Stock-In movement of prepared batter, both with the reason "Batter
// preparation"; they are shown under Batter Use and Batter Yield. Opening stock
// is a Stock-In with the reason "Opening" (it has no rows until opening stock
// is entered, OW-28).

export const STAFF_HISTORY_TYPE_FILTERS = [
  'All types',
  'Opening',
  'Stock-In',
  'Sales Consumption',
  'Batter Use',
  'Batter Yield',
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
    case 'Opening':
      return isOpening(row);
    case 'Stock-In':
      // Received supplies only: batter yield and opening stock have their own filters.
      return row.type === 'Stock-In' && !isBatterPreparation(row) && !isOpening(row);
    case 'Batter Use':
      return row.type === 'Usage' && isBatterPreparation(row);
    case 'Batter Yield':
      return row.type === 'Stock-In' && isBatterPreparation(row);
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
