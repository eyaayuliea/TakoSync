// OW-18 Physical Inventory Count and Discrepancy Report and OW-19 Authorized
// Adjustment Report on the Owner Web Portal.
import type { PhysicalCountRecord } from './physicalCountRepository';

const quantity = (value: number, unit: string) =>
  `${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(value)} ${unit}`;
const signed = (value: number, unit: string) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${quantity(Math.abs(value), unit)}`;

type Range = { start: Date; end: Date };
const inRange = (iso: string, range: Range) => {
  const at = Date.parse(iso);
  return Number.isFinite(at) && at >= range.start.getTime() && at < range.end.getTime();
};

/** The parts of a discrepancy review these reports read. */
export type CountReview = {
  countLineId: string;
  reference: string;
  correctionRequestId: string;
  branchId: string;
  branch: string;
  ingredient: string;
  unit: string;
  expected: number;
  difference: number;
  remarks: string;
  adjustment: {
    approvingOwner: string;
    reason: string;
    approvedAt: string;
    movementReference: string;
    beforeQuantity: number;
    afterQuantity: number;
  } | null;
};

export const COUNT_REPORT_HEADERS = [
  'Item', 'Expected (saved with count)', 'Actual', 'Difference', 'Branch', 'Date & time',
  'Submitted by · remarks', 'Count status', 'Discrepancy review', 'Revision', 'Lock',
];

/** OW-18 c2–c7. Drafts are never listed: only submitted counts reach the owner. */
export function buildWebCountReport(input: {
  records: PhysicalCountRecord[];
  reviews: CountReview[];
  range: Range;
  branchId: string | null;
  formatDateTime: (iso: string) => string;
}): { rows: string[][]; summary: Array<[string, string]> } {
  const reviews = new Map(input.reviews.map((review) => [review.countLineId, review]));
  const records = input.records
    .filter((record) => (!input.branchId || record.branchId === input.branchId) && inRange(record.submittedAt, input.range))
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  let discrepancies = 0;
  let pending = 0;
  let locked = 0;
  const rows = records.map((record) => {
    const review = reviews.get(record.countLineId);
    const isLocked = Boolean(review?.adjustment);
    if (record.difference !== 0) discrepancies += 1;
    if (record.discrepancyStatus === 'Pending Review') pending += 1;
    if (isLocked) locked += 1;
    const remarks = review?.remarks.trim();
    return [
      record.ingredientName,
      quantity(record.expectedQuantity, record.unit),
      quantity(record.actualQuantity, record.unit),
      signed(record.difference, record.unit),
      record.branchName,
      input.formatDateTime(record.submittedAt),
      remarks ? `${record.submittedBy}\n“${remarks}”` : record.submittedBy,
      record.countStatus,
      record.discrepancyStatus ?? (record.difference === 0 ? 'No discrepancy' : '—'),
      record.revision
        ? `${quantity(record.revision.originalValue, record.unit)} → ${quantity(record.revision.revisedValue, record.unit)}\n${record.revision.editor} · ${input.formatDateTime(record.revision.date)}`
        : '—',
      isLocked ? 'Locked (adjustment authorized)' : '—',
    ];
  });
  return {
    rows,
    summary: [
      ['Counted items', String(records.length)],
      ['With a discrepancy', String(discrepancies)],
      ['Pending review', String(pending)],
      ['Locked', String(locked)],
    ],
  };
}

export const ADJUSTMENT_REPORT_HEADERS = [
  'Item', 'Branch', 'Previous expected', 'Actual', 'Adjusted quantity', 'Adjustment',
  'Reason', 'Approved by · date & time', 'Discrepancy record · ledger entry',
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** OW-19 c2–c6: only adjustments the owner authorized. */
export function buildWebAdjustmentReport(input: {
  reviews: CountReview[];
  range: Range;
  branchId: string | null;
  formatDateTime: (iso: string) => string;
}): { rows: string[][]; summary: Array<[string, string]> } {
  const adjusted = input.reviews
    .filter((review): review is CountReview & { adjustment: NonNullable<CountReview['adjustment']> } => review.adjustment !== null)
    .filter((review) => (!input.branchId || review.branchId === input.branchId) && inRange(review.adjustment.approvedAt, input.range))
    .sort((left, right) => right.adjustment.approvedAt.localeCompare(left.adjustment.approvedAt));
  const rows = adjusted.map((review) => {
    // c3: the counted quantity minus the expected quantity saved with the count.
    const actual = Math.round((review.expected + review.difference) * 1000) / 1000;
    // Internal ids (uuid, pending-count:, legacy:) are not references an owner can look up.
    const publicReference = review.correctionRequestId && !/^(pending-count|legacy):/.test(review.correctionRequestId) && !UUID.test(review.correctionRequestId)
      ? review.correctionRequestId
      : null;
    return [
      review.ingredient,
      review.branch,
      quantity(review.expected, review.unit),
      quantity(actual, review.unit),
      // c2: the expected quantity is set to what was counted.
      quantity(actual, review.unit),
      signed(review.difference, review.unit),
      review.adjustment.reason,
      `${review.adjustment.approvingOwner}\n${input.formatDateTime(review.adjustment.approvedAt)}`,
      [
        `Count ${review.reference}`,
        publicReference,
        // The ledger entry applies the adjustment to the stock at approval time.
        `${review.adjustment.movementReference} (${quantity(review.adjustment.beforeQuantity, review.unit)} → ${quantity(review.adjustment.afterQuantity, review.unit)})`,
      ].filter(Boolean).join('\n'),
    ];
  });
  return { rows, summary: [['Authorized adjustments', String(rows.length)]] };
}
