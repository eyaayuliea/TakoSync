// ST-07 Void Request and OW-26 / OM-15 owner review (Charter Rev 8 BR-S4).
//
// A confirmed sale is never edited or deleted. Staff ask for a void with a
// reason; the owner approves or rejects it. The server (request_sale_void,
// decide_sale_void) enforces every rule below; these helpers only decide what
// the screens show and catch mistakes before a round trip.

import { manilaBusinessDate } from './staffDailySession.ts';

export const SALE_VOID_REASON_MAX_LENGTH = 500;

export type SaleVoidRequestStatus = 'pending' | 'approved' | 'rejected';

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
 * ST-07 c1 and c6: Request Void is offered only for a completed sale of the
 * current business day (Manila, default midnight cut-off) with no pending
 * request. The server re-checks with its own clock.
 */
export function saleVoidAvailability(
  sale: VoidableSale,
  latestRequest: SaleVoidRequest | null,
  now: Date = new Date(),
): SaleVoidAvailability {
  if (sale.status === 'voided') return { allowed: false, reason: 'This sale is already voided.' };
  if (sale.status !== 'completed') return { allowed: false, reason: 'Only a completed sale can be voided.' };
  if (latestRequest?.status === 'pending') {
    return { allowed: false, reason: 'A void request for this sale is already pending.' };
  }
  if (sale.inventory_processing_status !== 'completed') {
    return { allowed: false, reason: 'Finish inventory processing for this sale before requesting a void.' };
  }
  const created = new Date(sale.created_at);
  if (Number.isNaN(created.getTime()) || manilaBusinessDate(created) !== manilaBusinessDate(now)) {
    return { allowed: false, reason: 'Only sales from the current business day can be voided.' };
  }
  return { allowed: true };
}

export type SaleVoidState =
  | { kind: 'voided'; request: SaleVoidRequest | null }
  | { kind: 'pending'; request: SaleVoidRequest }
  | { kind: 'rejected'; request: SaleVoidRequest }
  | { kind: 'none' };

/** What the receipt and sale list show about a sale's void (ST-07 c5, c7, c9). */
export function saleVoidState(
  sale: { status: string },
  latestRequest: SaleVoidRequest | null,
): SaleVoidState {
  if (sale.status === 'voided') {
    return { kind: 'voided', request: latestRequest?.status === 'approved' ? latestRequest : null };
  }
  if (latestRequest?.status === 'pending') return { kind: 'pending', request: latestRequest };
  if (latestRequest?.status === 'rejected') return { kind: 'rejected', request: latestRequest };
  return { kind: 'none' };
}

export function saleVoidStatusLabel(state: SaleVoidState): string | null {
  switch (state.kind) {
    case 'voided': return 'Voided';
    case 'pending': return 'Void pending';
    case 'rejected': return 'Void rejected';
    default: return null;
  }
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

/** OW-26 c8 / OM-15 c8: rejecting needs a reason. Returns an error message, or ''. */
export function validateSaleVoidRejectionReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) return 'Enter the reason for rejecting this request.';
  if (trimmed.length > SALE_VOID_REASON_MAX_LENGTH) {
    return `The reason must be ${SALE_VOID_REASON_MAX_LENGTH} characters or fewer.`;
  }
  return '';
}

/** OM-15 c1: Pending first, then the newest requests. */
export function sortSaleVoidRequestsForReview(requests: SaleVoidRequest[]): SaleVoidRequest[] {
  return [...requests].sort((left, right) => {
    const leftPending = left.status === 'pending' ? 0 : 1;
    const rightPending = right.status === 'pending' ? 0 : 1;
    if (leftPending !== rightPending) return leftPending - rightPending;
    return right.requestedAt.localeCompare(left.requestedAt);
  });
}

export function saleVoidRequestStatusLabel(status: SaleVoidRequestStatus): string {
  switch (status) {
    case 'pending': return 'Pending';
    case 'approved': return 'Voided';
    case 'rejected': return 'Rejected';
  }
}

// Messages the server raises on purpose; anything else gets a generic message.
const KNOWN_SALE_VOID_MESSAGES = [
  'Enter the reason for voiding this sale.',
  'Enter the reason for rejecting this request.',
  'This sale is already voided.',
  'Only a completed sale can be voided.',
  'Finish inventory processing for this sale before requesting a void.',
  'Finish inventory processing for this sale before approving the void.',
  'Only sales from the current business day can be voided.',
  'A void request for this sale is already pending.',
  'This sale is not available for your assigned branch.',
];

/** Turns a server or network error into the message staff and owner see. */
export function saleVoidErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  const message = error?.message ?? '';
  if (error?.code === '23505') return 'A void request for this sale is already pending.';
  const known = KNOWN_SALE_VOID_MESSAGES.find((text) => message.includes(text));
  if (known) return known;
  const decided = /This request has already been (approved|rejected)\./.exec(message);
  if (decided) return `This request has already been ${decided[1]} and can no longer be changed.`;
  if (/fetch|network|timeout/i.test(message)) return 'No connection. Check the internet connection and try again.';
  if (isMissingSaleVoidSupport(error)) return 'Void requests are not available yet. Ask the owner to update the system.';
  return 'Unable to save the void request. Please try again.';
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
    || /sale_void_requests|request_sale_void|decide_sale_void/.test(error.message ?? '')
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
  const status: SaleVoidRequestStatus = row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending';
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
