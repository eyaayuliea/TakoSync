import type { OwnerDiscrepancyReview } from '../services/takosync.ts';

export type AuthorizedAdjustmentForcedState = 'success' | 'empty' | 'loading' | 'error' | null;

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

const mockRecords: AuthorizedAdjustmentRecord[] = [
  { id: 'adjustment-flour', ingredientName: 'All-Purpose Flour', branchName: 'Branch 1', previousExpectedQuantity: 12, actualQuantity: 10, adjustedQuantity: 10, unit: 'kg', reason: 'Recount verified', approvingOwner: 'Owner', approvedAt: '2026-11-12T11:02:00+08:00', relatedDiscrepancy: 'DISC-1112-0007' },
  { id: 'adjustment-sauce', ingredientName: 'Takoyaki Sauce', branchName: 'Branch 1', previousExpectedQuantity: 2.5, actualQuantity: 2, adjustedQuantity: 2, unit: 'L', reason: 'Recount verified', approvingOwner: 'Owner', approvedAt: '2026-11-12T10:15:00+08:00', relatedDiscrepancy: 'DISC-1112-0006' },
  { id: 'adjustment-mayonnaise', ingredientName: 'Mayonnaise', branchName: 'Branch 3', previousExpectedQuantity: 4.4, actualQuantity: 4, adjustedQuantity: 4, unit: 'kg', reason: 'Recount verified', approvingOwner: 'Owner', approvedAt: '2026-11-12T09:40:00+08:00', relatedDiscrepancy: 'DISC-1112-0005' },
];

export function getForcedAuthorizedAdjustmentState(): AuthorizedAdjustmentForcedState {
  const value = typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_FORCE_AUTHORIZED_ADJUSTMENT_STATE : undefined;
  return value === 'success' || value === 'empty' || value === 'loading' || value === 'error' ? value : null;
}

export function getAuthorizedAdjustmentMockRecords(): AuthorizedAdjustmentRecord[] { return mockRecords.map((record) => ({ ...record })); }

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
