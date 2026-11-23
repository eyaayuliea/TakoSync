// OW-25 Inventory Reconciliation on the Owner Web Portal: the Discrepancies tab
// (filters, table, details with revision history) and the Adjustment History tab.
import type { OwnerDiscrepancyReview } from '../services/takosync.ts';

export type ReconciliationStatus = 'All statuses' | 'Pending Review' | 'Adjusted' | 'Rejected for Recount';
export const RECONCILIATION_STATUSES: ReconciliationStatus[] = ['All statuses', 'Pending Review', 'Adjusted', 'Rejected for Recount'];

type Review = Pick<OwnerDiscrepancyReview,
  'countLineId' | 'reference' | 'branchId' | 'branch' | 'staff' | 'ingredient' | 'unit' | 'expected' | 'actual'
  | 'correctedActual' | 'correctionStatus' | 'difference' | 'correctionReason' | 'remarks' | 'submittedAt' | 'status'
  | 'decisionOwner' | 'decisionReason' | 'decisionAt' | 'rejection' | 'validatedAt' | 'validationReason' | 'adjustment'>;

const qty = (value: number, unit: string) => `${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(value)} ${unit}`;
const signed = (value: number, unit: string) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${qty(Math.abs(value), unit)}`;

/** OW-25 c10: a validated count reads Adjusted; open reviews read Pending Review. */
export function reconciliationStatus(review: Pick<Review, 'status' | 'correctionStatus'>): string {
  if (review.status === 'Validated') return 'Adjusted';
  if (review.status === 'Rejected for Recount') return 'Rejected for Recount';
  return review.correctionStatus === 'pending' ? 'Pending Review · correction requested' : 'Pending Review';
}

/** OW-25 c2: branch and status filters, open reviews first, then the newest. */
export function filterDiscrepancies<T extends Review>(reviews: readonly T[], input: { branchId: string | null; status: ReconciliationStatus }): T[] {
  return reviews
    .filter((review) => !input.branchId || review.branchId === input.branchId)
    .filter((review) => input.status === 'All statuses' || reconciliationStatus(review).startsWith(input.status))
    .sort((left, right) => {
      const open = (review: Review) => (reconciliationStatus(review).startsWith('Pending') ? 0 : 1);
      return open(left) - open(right) || right.submittedAt.localeCompare(left.submittedAt);
    });
}

export const DISCREPANCY_HEADERS = ['Item', 'Branch', 'Expected (saved)', 'Actual', 'Difference', 'Submitted By', 'Date & Time', 'Remarks', 'Review Status'];

export function discrepancyRow(review: Review, formatDateTime: (iso: string) => string): string[] {
  return [
    `${review.ingredient}\n${review.reference}`,
    review.branch,
    qty(review.expected, review.unit),
    qty(review.correctionStatus === 'approved' ? review.correctedActual : review.actual, review.unit),
    signed(review.difference, review.unit),
    review.staff,
    formatDateTime(review.submittedAt),
    review.remarks.trim() || '—',
    reconciliationStatus(review),
  ];
}

export const REVISION_HEADERS = ['Original Value', 'Revised Value', 'Editor', 'Date & Time', 'Outcome'];

/** OW-25 c3, c4: the count's revision history (a staff correction and its decision). */
export function revisionHistoryRows(review: Review, formatDateTime: (iso: string) => string): string[][] {
  if (!review.correctionStatus) return [];
  const outcome = review.correctionStatus === 'pending'
    ? 'Pending owner decision'
    : `${review.correctionStatus === 'approved' ? 'Approved' : 'Rejected'} by ${review.decisionOwner ?? 'Owner'}${review.decisionAt ? ` · ${formatDateTime(review.decisionAt)}` : ''}`;
  return [[
    qty(review.actual, review.unit),
    qty(review.correctedActual, review.unit),
    `${review.staff}${review.correctionReason ? `\n“${review.correctionReason}”` : ''}`,
    formatDateTime(review.submittedAt),
    outcome,
  ]];
}

export const ADJUSTMENT_HISTORY_HEADERS = [
  'Item', 'Branch', 'Previous Expected', 'Actual', 'Adjusted Quantity', 'Adjustment', 'Reason', 'Approved By', 'Date & Time', 'Discrepancy',
];

/** OW-25 c7, c10: every authorized adjustment, newest first. */
export function adjustmentHistoryRows(reviews: readonly Review[], formatDateTime: (iso: string) => string, branchId: string | null = null): string[][] {
  return reviews
    .filter((review) => review.adjustment && (!branchId || review.branchId === branchId))
    .sort((left, right) => (right.adjustment?.approvedAt ?? '').localeCompare(left.adjustment?.approvedAt ?? ''))
    .map((review) => {
      const adjustment = review.adjustment as NonNullable<Review['adjustment']>;
      return [
        review.ingredient,
        review.branch,
        qty(adjustment.beforeQuantity, review.unit),
        qty(review.correctionStatus === 'approved' ? review.correctedActual : review.actual, review.unit),
        qty(adjustment.afterQuantity, review.unit),
        signed(adjustment.movement, review.unit),
        adjustment.reason,
        adjustment.approvingOwner || adjustment.approvedBy,
        formatDateTime(adjustment.approvedAt),
        `${review.reference}\n${adjustment.movementReference}`,
      ];
    });
}
