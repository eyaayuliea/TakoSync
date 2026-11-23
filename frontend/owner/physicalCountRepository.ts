import type { OwnerCountDraftLine, OwnerDiscrepancyReview, TransactionHistoryItem } from '../services/takosync.ts';
import type { InventoryCountHistoryRecord } from '../staff/inventoryReports.ts';

export type PhysicalCountResult = 'Matches' | 'Lower than Expected' | 'Higher than Expected';
/** OM-20 c1: Draft is a count staff saved but have not submitted yet. */
export type PhysicalCountStatus = 'Draft' | 'Submitted' | 'Validated' | 'Rejected for Recount';
export type PhysicalCountDiscrepancyStatus = 'Pending Review' | 'Adjusted';

export type PhysicalCountBranch = {
  id: string;
  name: string;
};

export type PhysicalCountRecord = {
  id: string;
  countLineId: string;
  reference: string;
  ingredientId: string;
  ingredientName: string;
  branchId: string;
  branchName: string;
  expectedQuantity: number;
  originalActualQuantity: number;
  actualQuantity: number;
  difference: number;
  unit: string;
  submittedAt: string;
  submittedBy: string;
  employeeId: string | null;
  email: string | null;
  role: string | null;
  countStatus: PhysicalCountStatus;
  result: PhysicalCountResult;
  discrepancyReference: string | null;
  discrepancyStatus: PhysicalCountDiscrepancyStatus | null;
  discrepancyReviewId: string | null;
  revision: {
    originalValue: number;
    revisedValue: number;
    editor: string;
    date: string;
  } | null;
};

export function getPhysicalCountResult(difference: number): PhysicalCountResult {
  if (difference < 0) return 'Lower than Expected';
  if (difference > 0) return 'Higher than Expected';
  return 'Matches';
}

export function formatPhysicalCountDateTime(value: string): string {
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

export function formatPhysicalCountDate(value: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${Number(part('day'))} ${part('month')} ${part('year')}`;
}

export function formatPhysicalCountQuantity(value: number, unit: string): string {
  const formatted = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(Math.abs(value));
  return `${formatted} ${unit}`;
}

export function formatPhysicalCountDifference(value: number, unit: string): string {
  const sign = value < 0 ? '−' : value > 0 ? '+' : '';
  return `${sign}${formatPhysicalCountQuantity(value, unit)}`;
}

type CountHistoryItem = TransactionHistoryItem & {
  type: 'Physical Inventory Count';
  physicalCount: InventoryCountHistoryRecord['physicalCount'];
};

export function buildPhysicalCountRecords(
  history: TransactionHistoryItem[],
  reviews: OwnerDiscrepancyReview[],
): PhysicalCountRecord[] {
  const reviewsByLine = new Map(reviews.map((review) => [review.countLineId, review]));
  return history
    .filter((record): record is CountHistoryItem =>
      record.type === 'Physical Inventory Count' &&
      record.physicalCount !== undefined &&
      // OM-20 c1, c4: a count stays listed after it is settled. Its check becomes
      // "validated" once every discrepancy is validated or rejected for a recount.
      ['submitted', 'pending_owner_review', 'validated'].includes(record.physicalCount.status),
    )
    .map((record) => {
      const count = record.physicalCount;
      const countLineId = record.id.replace(/^physical-count-/, '');
      const review = reviewsByLine.get(countLineId);
      const actualQuantity = count.validation?.correctedActualQuantity ?? count.originalActualQuantity;
      const difference = Number((actualQuantity - count.expectedQuantity).toFixed(3));
      const reference = review?.correctionRequestId ?? null;
      const hasPublicReference = difference !== 0 &&
        reference !== null &&
        !reference.startsWith('pending-count:') &&
        !reference.startsWith('legacy:');
      const rejectedForRecount = review?.status === 'Rejected for Recount' || Boolean(review?.rejection);
      const discrepancyStatus: PhysicalCountDiscrepancyStatus | null = difference === 0 || rejectedForRecount
        ? null
        : review?.status === 'Validated' || count.validation
          ? 'Adjusted'
          : 'Pending Review';
      const countStatus: PhysicalCountStatus = rejectedForRecount
        ? 'Rejected for Recount'
        : difference === 0 || count.validation || review?.status === 'Validated'
          ? 'Validated'
          : 'Submitted';
      const revision = count.revisedActualQuantity !== null && count.revisedActualQuantity !== count.originalActualQuantity
        ? {
          originalValue: count.originalActualQuantity,
          revisedValue: count.revisedActualQuantity,
          editor: count.validation?.validatedByName || record.staff,
          date: count.validation?.validatedAt ?? record.transactionDate.toISOString(),
        }
        : null;

      return {
        id: record.id,
        countLineId,
        reference: record.reference,
        ingredientId: record.ingredientId,
        ingredientName: record.ingredientName,
        branchId: record.branchId,
        branchName: record.branch,
        expectedQuantity: count.expectedQuantity,
        originalActualQuantity: count.originalActualQuantity,
        actualQuantity,
        difference,
        unit: record.unit,
        submittedAt: record.transactionDate.toISOString(),
        submittedBy: record.staff,
        employeeId: record.staffEmployeeId ?? null,
        email: record.staffEmail ?? null,
        role: record.staffRole ?? null,
        countStatus,
        result: getPhysicalCountResult(difference),
        discrepancyReference: hasPublicReference ? reference : null,
        discrepancyStatus,
        discrepancyReviewId: reference,
        revision,
      };
    })
    .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime());
}

/**
 * OM-20 c1: each counted line of a saved draft, with the Draft status. Lines
 * not counted yet have no actual quantity and are not listed. A draft creates
 * no discrepancy until it is submitted.
 */
export function buildDraftCountRecords(
  drafts: OwnerCountDraftLine[],
  branches: PhysicalCountBranch[],
): PhysicalCountRecord[] {
  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
  return drafts
    .filter((line) => line.actualQuantity !== null && Number.isFinite(line.actualQuantity))
    .map((line) => {
      const actual = line.actualQuantity as number;
      const difference = Number((actual - line.expectedQuantity).toFixed(3));
      return {
        id: `draft-${line.draftId}-${line.ingredientId}`,
        countLineId: '',
        reference: 'Draft · not submitted',
        ingredientId: line.ingredientId,
        ingredientName: line.ingredientName,
        branchId: line.branchId,
        branchName: branchNames.get(line.branchId) ?? 'Branch',
        expectedQuantity: line.expectedQuantity,
        originalActualQuantity: actual,
        actualQuantity: actual,
        difference,
        unit: line.unit,
        submittedAt: line.savedAt,
        submittedBy: line.staffName,
        employeeId: null,
        email: null,
        role: null,
        countStatus: 'Draft' as const,
        result: getPhysicalCountResult(difference),
        discrepancyReference: null,
        discrepancyStatus: null,
        discrepancyReviewId: null,
        revision: null,
      };
    });
}

export async function loadPhysicalCountRecords(
  branches: PhysicalCountBranch[],
): Promise<PhysicalCountRecord[]> {
  if (branches.length === 0) throw new Error('Owner branches are unavailable for Physical Count records.');
  const { loadOwnerCountDrafts, loadOwnerDiscrepancyReviews, loadTransactionHistory } = await import('../services/takosync.ts');
  const [historyByBranch, reviews, drafts] = await Promise.all([
    Promise.all(branches.map((branch) => loadTransactionHistory(branch.id))),
    loadOwnerDiscrepancyReviews(null),
    loadOwnerCountDrafts(null),
  ]);
  return [...buildDraftCountRecords(drafts, branches), ...buildPhysicalCountRecords(historyByBranch.flat(), reviews)]
    .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime());
}
