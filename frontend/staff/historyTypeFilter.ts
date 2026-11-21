// ST-14 c2: the Inventory Transaction History type filter offers exactly these
// types. Other movement types (Usage, Stock-Out, transfers) still appear under
// "All types".

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

export function matchesHistoryTypeFilter(row: HistoryRow, filter: StaffHistoryTypeFilter): boolean {
  switch (filter) {
    case 'All types':
      return true;
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
  if (filter === 'All types') return 'All';
  if (filter === 'Sales Consumption') return 'Sales';
  return filter;
}
