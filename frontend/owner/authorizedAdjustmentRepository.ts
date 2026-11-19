import type { OwnerDiscrepancyReview } from '../services/takosync.ts';

export type AuthorizedAdjustmentRecord = {
  id: string;
  ingredientName: string;
  branchName: string;
  previousExpectedQuantity: number;
  actualQuantity: number;
  adjustedQuantity: number;
  unit: string;
  reason: string;
  approvingOwner: string;
  approvedAt: string;
  relatedDiscrepancy: string;
};

export function formatAuthorizedAdjustmentQuantity(value: number, unit: string): string {
  return `${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(value)} ${unit}`;
}

export function formatAuthorizedAdjustmentDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${Number(part('day'))} ${part('month')} ${part('year')} · ${Number(part('hour'))}:${part('minute')} ${part('dayPeriod')}`;
}

export function buildAuthorizedAdjustmentRecords(reviews: OwnerDiscrepancyReview[]): AuthorizedAdjustmentRecord[] {
  return reviews.filter((review) => review.status === 'Validated' && review.adjustment).map((review) => ({
    id: review.adjustment?.movementReference ?? review.correctionRequestId,
    ingredientName: review.ingredient, branchName: review.branch, previousExpectedQuantity: review.expected,
    actualQuantity: review.actual, adjustedQuantity: review.correctedActual, unit: review.unit,
    reason: review.adjustment?.reason ?? review.validationReason ?? 'Validated',
    approvingOwner: review.adjustment?.approvingOwner ?? review.decisionOwner ?? 'Owner',
    approvedAt: review.adjustment?.approvedAt ?? review.validatedAt ?? review.submittedAt,
    relatedDiscrepancy: review.correctionRequestId,
  })).sort((left, right) => new Date(right.approvedAt).getTime() - new Date(left.approvedAt).getTime());
}

export async function loadAuthorizedAdjustmentRecords(): Promise<AuthorizedAdjustmentRecord[]> {
  const { loadOwnerDiscrepancyReviews } = await import('../services/takosync.ts');
  return buildAuthorizedAdjustmentRecords(await loadOwnerDiscrepancyReviews(null));
}
