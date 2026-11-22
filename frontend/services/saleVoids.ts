// ST-07 Void Sale and OW-26 / OM-15 Void Review (Requirements Engineering v6).
//
// A confirmed sale is never edited or deleted. Staff void a sale of their branch
// on the current business day, before the daily closing, with a reason; the void
// applies at once (sale Voided, Void Reversal entries posted). The owner then
// marks it Reviewed or Flagged, which never undoes the void. The server
// (void_sale, review_sale_void) enforces every rule below; these helpers only
// decide what the screens show and catch mistakes before a round trip.
//
// The record type keeps the name SaleVoidRequest (table sale_void_requests):
// requestedBy / requestedAt = who voided and when; decidedBy / decidedAt = the
// reviewing owner and time; decisionReason = the reason a void was flagged.

import { manilaBusinessDate } from './staffDailySession.ts';

export const SALE_VOID_REASON_MAX_LENGTH = 500;

export type SaleVoidRequestStatus = 'pending_review' | 'reviewed' | 'flagged';

/** Statuses the app shows. Legacy request/approval rows (pending, rejected) are not loaded. */
export const SALE_VOID_STATUSES: readonly SaleVoidRequestStatus[] = ['pending_review', 'reviewed', 'flagged'];

export type SaleVoidRequest = {
  id: string;
  reference: string;
  saleId: string;
  branchId: string;
  requestedBy: string;
  requestedByName: string | null;
  reason: string;
  status: SaleVoidRequestStatus;
  requestedAt: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
};

export type VoidableSale = {
  status: string;
  inventory_processing_status?: string | null;
  created_at: string;
};

/** The most recent request for one sale (requests may be in any order). */
export function latestSaleVoidRequest(
  requests: SaleVoidRequest[],
  saleId: string,
): SaleVoidRequest | null {
  let latest: SaleVoidRequest | null = null;
  for (const request of requests) {
    if (request.saleId !== saleId) continue;
    if (!latest || request.requestedAt > latest.requestedAt) latest = request;
  }
  return latest;
}

export type SaleVoidAvailability =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * ST-07 c1 and c8: Void Sale is offered only for a completed sale of the
 * current business day (Manila, default midnight cut-off), before the daily
 * closing is recorded, and never for a sale that is already voided. The server
 * re-checks with its own clock.
 */
export function saleVoidAvailability(
  sale: VoidableSale,
  latestRequest: SaleVoidRequest | null,
  now: Date = new Date(),
  closingRecorded = false,
): SaleVoidAvailability {
  if (sale.status === 'voided' || latestRequest) return { allowed: false, reason: 'This sale is already voided.' };
  if (sale.status !== 'completed') return { allowed: false, reason: 'Only a completed sale can be voided.' };
  if (sale.inventory_processing_status !== 'completed') {
    return { allowed: false, reason: 'Finish inventory processing for this sale before voiding it.' };
  }
  const created = new Date(sale.created_at);
  if (Number.isNaN(created.getTime()) || manilaBusinessDate(created) !== manilaBusinessDate(now)) {
    return { allowed: false, reason: 'Only sales from the current business day can be voided.' };
  }
  if (closingRecorded) return { allowed: false, reason: SALE_VOID_AFTER_CLOSING_MESSAGE };
  return { allowed: true };
}

export const SALE_VOID_AFTER_CLOSING_MESSAGE =
  'The daily closing is already recorded, so sales of this business day can no longer be voided.';

export type SaleVoidState =
  | { kind: 'voided'; request: SaleVoidRequest | null }
  | { kind: 'none' };

/** What the receipt and sale list show about a sale's void (ST-07 c5, c7). */
export function saleVoidState(
  sale: { status: string },
  latestRequest: SaleVoidRequest | null,
): SaleVoidState {
  if (sale.status === 'voided' || latestRequest) return { kind: 'voided', request: latestRequest };
  return { kind: 'none' };
}

/** ST-07 c7: "Voided", with the owner's review status when it is known. */
export function saleVoidStatusLabel(state: SaleVoidState): string | null {
  if (state.kind !== 'voided') return null;
  return state.request ? `Voided · ${saleVoidRequestStatusLabel(state.request.status)}` : 'Voided';
}

/** ST-07 c3: the reason is required. Returns an error message, or '' when valid. */
export function validateSaleVoidReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) return 'Enter the reason for voiding this sale.';
  if (trimmed.length > SALE_VOID_REASON_MAX_LENGTH) {
    return `The void reason must be ${SALE_VOID_REASON_MAX_LENGTH} characters or fewer.`;
  }
  return '';
}

/** OW-26 c8 / OM-15 c8: rejecting an entry reversal needs a reason. Returns an error message, or ''. */
export function validateSaleVoidRejectionReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) return 'Enter the reason for rejecting this request.';
  if (trimmed.length > SALE_VOID_REASON_MAX_LENGTH) {
    return `The reason must be ${SALE_VOID_REASON_MAX_LENGTH} characters or fewer.`;
  }
  return '';
}

/** OW-26 c8 / OM-15 c8: flagging a void needs a reason. Returns an error message, or ''. */
export function validateSaleVoidFlagReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) return 'Enter the reason for flagging this void.';
  if (trimmed.length > SALE_VOID_REASON_MAX_LENGTH) {
    return `The reason must be ${SALE_VOID_REASON_MAX_LENGTH} characters or fewer.`;
  }
  return '';
}

/** OM-15: Pending Review first, then the newest voids. */
export function sortSaleVoidRequestsForReview(requests: SaleVoidRequest[]): SaleVoidRequest[] {
  return [...requests].sort((left, right) => {
    const leftPending = left.status === 'pending_review' ? 0 : 1;
    const rightPending = right.status === 'pending_review' ? 0 : 1;
    if (leftPending !== rightPending) return leftPending - rightPending;
    return right.requestedAt.localeCompare(left.requestedAt);
  });
}

export function saleVoidRequestStatusLabel(status: SaleVoidRequestStatus): string {
  switch (status) {
    case 'pending_review': return 'Pending Review';
    case 'reviewed': return 'Reviewed';
    case 'flagged': return 'Flagged';
  }
}

// Messages the server raises on purpose; anything else gets a generic message.
const KNOWN_SALE_VOID_MESSAGES = [
  'Enter the reason for voiding this sale.',
  'Enter the reason for flagging this void.',
  'This sale is already voided.',
  'Only a completed sale can be voided.',
  'Finish inventory processing for this sale before voiding it.',
  'Only sales from the current business day can be voided.',
  SALE_VOID_AFTER_CLOSING_MESSAGE,
  'This sale is not available for your assigned branch.',
];

/** Turns a server or network error into the message staff and owner see. */
export function saleVoidErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  const message = error?.message ?? '';
  if (error?.code === '23505') return 'This sale is already voided.';
  const known = KNOWN_SALE_VOID_MESSAGES.find((text) => message.includes(text));
  if (known) return known;
  const decided = /This void has already been (reviewed|flagged)\./.exec(message);
  if (decided) return `This void has already been ${decided[1]} and can no longer be changed.`;
  if (/fetch|network|timeout/i.test(message)) return 'No connection. Check the internet connection and try again.';
  if (isMissingSaleVoidSupport(error)) return 'Void Sale is not available yet. Ask the owner to update the system.';
  return 'Unable to save the void. Please try again.';
}

/**
 * True when the database has not been updated with the void tables yet
 * (missing table, column, or function), so screens can hide the feature
 * instead of failing.
 */
export function isMissingSaleVoidSupport(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || error.code === 'PGRST202'
    || error.code === '42883'
    || /sale_void_requests|void_sale|review_sale_void/.test(error.message ?? '')
      && /does not exist|could not find|schema cache/i.test(error.message ?? '');
}

export function mapSaleVoidRequestRow(
  row: {
    id: string;
    reference: string;
    sale_id: string;
    branch_id: string;
    requested_by: string;
    reason: string;
    status: string;
    requested_at: string;
    decided_by: string | null;
    decided_at: string | null;
    decision_reason: string | null;
  },
  names: Map<string, string> = new Map(),
): SaleVoidRequest {
  const status: SaleVoidRequestStatus = row.status === 'reviewed' || row.status === 'flagged' ? row.status : 'pending_review';
  return {
    id: row.id,
    reference: row.reference,
    saleId: row.sale_id,
    branchId: row.branch_id,
    requestedBy: row.requested_by,
    requestedByName: names.get(row.requested_by) ?? null,
    reason: row.reason,
    status,
    requestedAt: row.requested_at,
    decidedBy: row.decided_by,
    decidedByName: row.decided_by ? names.get(row.decided_by) ?? null : null,
    decidedAt: row.decided_at,
    decisionReason: row.decision_reason,
  };
}
