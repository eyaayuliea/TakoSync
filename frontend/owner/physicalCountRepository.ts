import type { OwnerDiscrepancyReview, TransactionHistoryItem } from '../services/takosync.ts';
import type { InventoryCountHistoryRecord } from '../staff/inventoryReports.ts';

export type PhysicalCountForcedState = 'success' | 'empty' | 'loading' | 'error' | null;
export type PhysicalCountResult = 'Matches' | 'Lower than Expected' | 'Higher than Expected';
export type PhysicalCountStatus = 'Submitted' | 'Validated';
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
  mockDiscrepancyId: string | null;
  isMock: boolean;
  revision: {
    originalValue: number;
    revisedValue: number;
    editor: string;
    date: string;
  } | null;
};

const physicalCountSeeds = [
  {
    id: 'flour',
    countLineId: 'mock-line-flour',
    reference: 'PC-1112-0012',
    ingredientId: 'flour',
    ingredientName: 'All-Purpose Flour',
    branchId: 'branch-1',
    branchName: 'Branch 1',
    expectedQuantity: 12,
    originalActualQuantity: 10,
    actualQuantity: 10,
    unit: 'kg',
    submittedAt: '2026-11-12T10:30:00+08:00',
    submittedBy: 'Maria Santos',
    employeeId: 'EMP-014',
    email: 'maria.santos@gelostakoyaki.com',
    role: 'Employee',
    countStatus: 'Submitted' as const,
    discrepancyReference: 'DISC-1112-0007',
    discrepancyStatus: 'Pending Review' as const,
    mockDiscrepancyId: 'flour-b1',
    revision: null,
  },
  {
    id: 'eggs',
    countLineId: 'mock-line-eggs',
    reference: 'PC-1112-0011',
    ingredientId: 'eggs',
    ingredientName: 'Eggs',
    branchId: 'branch-3',
    branchName: 'Branch 3',
    expectedQuantity: 50,
    originalActualQuantity: 48,
    actualQuantity: 50,
    unit: 'pcs',
    submittedAt: '2026-11-12T09:15:00+08:00',
    submittedBy: 'Ana Reyes',
    employeeId: 'EMP-021',
    email: null,
    role: null,
    countStatus: 'Validated' as const,
    discrepancyReference: null,
    discrepancyStatus: null,
    mockDiscrepancyId: null,
    revision: {
      originalValue: 48,
      revisedValue: 50,
      editor: 'Ana Reyes',
      date: '2026-11-12T10:00:00+08:00',
    },
  },
  {
    id: 'octopus',
    countLineId: 'mock-line-octopus',
    reference: '—',
    ingredientId: 'octopus',
    ingredientName: 'Octopus',
    branchId: 'branch-2',
    branchName: 'Branch 2',
    expectedQuantity: 9,
    originalActualQuantity: 8,
    actualQuantity: 8,
    unit: 'kg',
    submittedAt: '2026-11-11T20:40:00+08:00',
    submittedBy: 'Maria Santos',
    employeeId: 'EMP-014',
    email: 'maria.santos@gelostakoyaki.com',
    role: 'Employee',
    countStatus: 'Submitted' as const,
    discrepancyReference: null,
    discrepancyStatus: 'Pending Review' as const,
    mockDiscrepancyId: null,
    revision: null,
  },
  {
    id: 'bonito',
    countLineId: 'mock-line-bonito',
    reference: 'PC-1111-0008',
    ingredientId: 'bonito-flakes',
    ingredientName: 'Bonito Flakes',
    branchId: 'branch-1',
    branchName: 'Branch 1',
    expectedQuantity: 2,
    originalActualQuantity: 2.3,
    actualQuantity: 2.3,
    unit: 'kg',
    submittedAt: '2026-11-11T18:30:00+08:00',
    submittedBy: 'Maria Santos',
    employeeId: 'EMP-014',
    email: 'maria.santos@gelostakoyaki.com',
    role: 'Employee',
    countStatus: 'Validated' as const,
    discrepancyReference: 'DISC-1111-0004',
    discrepancyStatus: 'Adjusted' as const,
    mockDiscrepancyId: 'bonito-b1',
    revision: null,
  },
  {
    id: 'sauce',
    countLineId: 'mock-line-sauce',
    reference: 'PC-1110-0006',
    ingredientId: 'sauce',
    ingredientName: 'Takoyaki Sauce',
    branchId: 'branch-1',
    branchName: 'Branch 1',
    expectedQuantity: 2,
    originalActualQuantity: 2,
    actualQuantity: 2,
    unit: 'L',
    submittedAt: '2026-11-10T17:45:00+08:00',
    submittedBy: 'Maria Santos',
    employeeId: 'EMP-014',
    email: 'maria.santos@gelostakoyaki.com',
    role: 'Employee',
    countStatus: 'Validated' as const,
    discrepancyReference: null,
    discrepancyStatus: null,
    mockDiscrepancyId: null,
    revision: null,
  },
] as const;

export function getForcedPhysicalCountState(): PhysicalCountForcedState {
  const value = typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_FORCE_PHYSICAL_COUNT_STATE
    : undefined;
  return value === 'success' || value === 'empty' || value === 'loading' || value === 'error'
    ? value
    : null;
}

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

export function getPhysicalCountMockRecords(): PhysicalCountRecord[] {
  return physicalCountSeeds.map((seed) => ({
    ...seed,
    difference: Number((seed.actualQuantity - seed.expectedQuantity).toFixed(3)),
    result: getPhysicalCountResult(seed.actualQuantity - seed.expectedQuantity),
    discrepancyReviewId: seed.discrepancyReference,
    isMock: true,
  }));
}

type CountHistoryItem = TransactionHistoryItem & {
  type: 'Physical Inventory Count';
  physicalCount: InventoryCountHistoryRecord['physicalCount'];
};

function branchNameWithoutCity(value: string): string {
  const match = value.match(/Branch\s+\d+$/);
  return match?.[0] ?? value;
}

export function buildPhysicalCountRecords(
  history: TransactionHistoryItem[],
  reviews: OwnerDiscrepancyReview[],
): PhysicalCountRecord[] {
  const reviewsByLine = new Map(reviews.map((review) => [review.countLineId, review]));
  return history
    .filter((record): record is CountHistoryItem =>
      record.type === 'Physical Inventory Count' &&
      record.physicalCount !== undefined &&
      ['submitted', 'pending_owner_review'].includes(record.physicalCount.status),
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
      const discrepancyStatus: PhysicalCountDiscrepancyStatus | null = difference === 0
        ? null
        : review?.status === 'Validated' || count.validation
          ? 'Adjusted'
          : 'Pending Review';
      const countStatus: PhysicalCountStatus = difference === 0 || count.validation || review?.status === 'Validated'
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
        branchName: branchNameWithoutCity(record.branch),
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
        mockDiscrepancyId: null,
        isMock: false,
        revision,
      };
    })
    .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime());
}

export async function loadPhysicalCountRecords(
  branches: PhysicalCountBranch[],
): Promise<PhysicalCountRecord[]> {
  if (branches.length === 0) throw new Error('Owner branches are unavailable for Physical Count records.');
  const { loadOwnerDiscrepancyReviews, loadTransactionHistory } = await import('../services/takosync.ts');
  const [historyByBranch, reviews] = await Promise.all([
    Promise.all(branches.map((branch) => loadTransactionHistory(branch.id))),
    loadOwnerDiscrepancyReviews(null),
  ]);
  return buildPhysicalCountRecords(historyByBranch.flat(), reviews);
}
