// ST-14 c6 / ST-12 c9: staff see their counts in Transaction History (type
// "Physical Inventory Count"), and a count is changed only through a correction
// request started from its record there.

const HISTORY_ID_PREFIX = 'physical-count-';

/** The count line behind a Transaction History record, or null for other records. */
export function countLineIdOfHistoryRecord(historyRecordId: string): string | null {
  return historyRecordId.startsWith(HISTORY_ID_PREFIX) ? historyRecordId.slice(HISTORY_ID_PREFIX.length) : null;
}

/** The status of a count as staff read it in Transaction History. */
export function countHistoryStatusLabel(input: { status: string; validated: boolean; correctionStatuses: readonly string[] }): string {
  if (input.validated) return 'Validated by the owner';
  if (input.correctionStatuses.some((status) => status.toLowerCase() === 'pending')) return 'Pending Review · correction requested';
  switch (input.status) {
    case 'pending_owner_review': return 'Pending Review';
    case 'submitted': return 'Submitted';
    case 'rejected_for_recount': return 'Rejected for Recount';
    default: return input.status.replace(/_/g, ' ').replace(/^./, (first) => first.toUpperCase());
  }
}

export type CountHistoryCorrectionAction = 'request' | 'view' | null;

/**
 * What a count's record in Transaction History offers:
 * - 'request': the staff member who counted may ask for a correction (the count
 *   differs from the expected quantity, the owner has not validated it, and no
 *   request is waiting);
 * - 'view': there are correction requests to look at;
 * - null: nothing to do (for example a matching count, or another employee's).
 */
export function countHistoryCorrectionAction(input: {
  countedByUserId: string;
  currentUserId: string;
  expectedQuantity: number;
  originalActualQuantity: number;
  validated: boolean;
  correctionStatuses: readonly string[];
  /** A request saved on this device that the server has not confirmed yet. */
  waitingOnDevice: boolean;
}): CountHistoryCorrectionAction {
  const hasRequests = input.correctionStatuses.length > 0 || input.waitingOnDevice;
  const pending = input.waitingOnDevice || input.correctionStatuses.some((status) => status.toLowerCase() === 'pending');
  const mayRequest = input.countedByUserId === input.currentUserId
    && !input.validated
    && !pending
    && input.originalActualQuantity !== input.expectedQuantity;
  if (mayRequest) return 'request';
  return hasRequests ? 'view' : null;
}
