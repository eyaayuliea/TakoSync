// ST-13 Entry Reversal Request and OW-26 / OM-15 owner review (Charter Rev 8
// BR-I10). The server (request_inventory_entry_reversal,
// decide_inventory_entry_reversal) enforces every rule; these helpers decide
// what the screens show.

import { manilaBusinessDate } from './staffDailySession.ts';

export const ENTRY_REVERSAL_REASON_MAX_LENGTH = 500;

export type EntryReversalType = 'stock_in' | 'batter_preparation' | 'waste' | 'spillage' | 'spoilage';
export type EntryReversalStatus = 'pending' | 'approved' | 'rejected';

export type EntryReversalRequest = {
  id: string;
  reference: string;
  branchId: string;
  entryKind: 'movement' | 'batter_batch';
  entryKey: string;
  entryType: EntryReversalType;
  entryReference: string;
  itemName: string;
  quantity: number;
  unit: string;
  entryRecordedAt: string;
  requestedBy: string;
  requestedByName: string | null;
  reason: string;
  status: EntryReversalStatus;
  requestedAt: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
};

const ENTRY_TYPE_LABELS: Record<EntryReversalType, string> = {
  stock_in: 'Stock-In',
  batter_preparation: 'Batter Preparation',
  waste: 'Waste',
  spillage: 'Spillage',
  spoilage: 'Spoilage',
};

export function entryReversalTypeLabel(type: EntryReversalType): string {
  return ENTRY_TYPE_LABELS[type];
}

/** A history row, as the Staff transaction history shows it. */
export type ReversibleHistoryEntry = {
  id: string;
  type: string;
  ingredientId: string;
  staffId: string;
  reason: string;
  notes: string;
  batchReference: string | null;
  createdAt?: Date | null;
  transactionDate: Date;
};

/**
 * Which entry a history row belongs to, or null when that kind of row cannot
 * be reversed. A batter preparation is one entry made of several movements,
 * keyed by its batch reference.
 */
export function reversibleEntryOf(
  row: ReversibleHistoryEntry,
): { key: string; type: EntryReversalType } | null {
  if (row.type === 'Usage' && row.reason === 'Batter preparation' && row.notes.trim()) {
    return { key: row.notes.trim(), type: 'batter_preparation' };
  }
  if (row.type === 'Stock-In' && row.ingredientId === 'prepared-batter' && row.batchReference) {
    return { key: row.batchReference, type: 'batter_preparation' };
  }
  if (row.type === 'Stock-In') return { key: row.id, type: 'stock_in' };
  if (row.type === 'Spoilage') return { key: row.id, type: 'spoilage' };
  if (row.type === 'Waste') {
    return { key: row.id, type: /^spillage/i.test(row.reason.trim()) ? 'spillage' : 'waste' };
  }
  return null;
}

/** The most recent request for one entry. */
export function latestEntryReversalRequest(
  requests: EntryReversalRequest[],
  entryKey: string,
): EntryReversalRequest | null {
  let latest: EntryReversalRequest | null = null;
  for (const request of requests) {
    if (request.entryKey !== entryKey) continue;
    if (!latest || request.requestedAt > latest.requestedAt) latest = request;
  }
  return latest;
}

export type EntryReversalAvailability =
  | { allowed: true }
  | { allowed: false; reason: string };

/** ST-13 c1, c6, c9: only the staff member's own same-day entry, with no open or approved request. */
export function entryReversalAvailability(
  row: ReversibleHistoryEntry,
  currentUserId: string | null | undefined,
  latestRequest: EntryReversalRequest | null,
  now: Date = new Date(),
): EntryReversalAvailability {
  if (!reversibleEntryOf(row)) {
    return { allowed: false, reason: 'Only Stock-In, Batter Preparation, Waste, and Spillage entries can be reversed.' };
  }
  if (latestRequest?.status === 'approved') return { allowed: false, reason: 'This entry has already been reversed.' };
  if (latestRequest?.status === 'pending') {
    return { allowed: false, reason: 'A reversal request for this entry is already pending.' };
  }
  if (!currentUserId || row.staffId !== currentUserId) {
    return { allowed: false, reason: 'You can only reverse your own entries.' };
  }
  const recorded = row.createdAt ?? row.transactionDate;
  if (Number.isNaN(recorded.getTime()) || manilaBusinessDate(recorded) !== manilaBusinessDate(now)) {
    return { allowed: false, reason: 'Only entries from the current business day can be reversed.' };
  }
  return { allowed: true };
}

export type EntryReversalState =
  | { kind: 'reversed'; request: EntryReversalRequest }
  | { kind: 'pending'; request: EntryReversalRequest }
  | { kind: 'rejected'; request: EntryReversalRequest }
  | { kind: 'none' };

export function entryReversalState(latestRequest: EntryReversalRequest | null): EntryReversalState {
  if (latestRequest?.status === 'approved') return { kind: 'reversed', request: latestRequest };
  if (latestRequest?.status === 'pending') return { kind: 'pending', request: latestRequest };
  if (latestRequest?.status === 'rejected') return { kind: 'rejected', request: latestRequest };
  return { kind: 'none' };
}

export function entryReversalStatusLabel(state: EntryReversalState): string | null {
  switch (state.kind) {
    case 'reversed': return 'Reversed';
    case 'pending': return 'Reversal pending';
    case 'rejected': return 'Reversal rejected';
    default: return null;
  }
}

export function entryReversalRequestStatusLabel(status: EntryReversalStatus): string {
  switch (status) {
    case 'pending': return 'Pending';
    // OW-26 c10: an approved request shows "Reversed" (the filter still reads Approved, OM-15 c1).
    case 'approved': return 'Reversed';
    case 'rejected': return 'Rejected';
  }
}

/** ST-13 c3. Returns an error message, or '' when valid. */
export function validateEntryReversalReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) return 'Enter the reason for reversing this entry.';
  if (trimmed.length > ENTRY_REVERSAL_REASON_MAX_LENGTH) {
    return `The reversal reason must be ${ENTRY_REVERSAL_REASON_MAX_LENGTH} characters or fewer.`;
  }
  return '';
}

/** OM-15 c1: Pending first, then the newest requests. */
export function sortEntryReversalRequestsForReview<T extends { status: EntryReversalStatus; requestedAt: string }>(
  requests: T[],
): T[] {
  return [...requests].sort((left, right) => {
    const leftPending = left.status === 'pending' ? 0 : 1;
    const rightPending = right.status === 'pending' ? 0 : 1;
    if (leftPending !== rightPending) return leftPending - rightPending;
    return right.requestedAt.localeCompare(left.requestedAt);
  });
}

const KNOWN_ENTRY_REVERSAL_MESSAGES = [
  'Enter the reason for reversing this entry.',
  'Enter the reason for rejecting this request.',
  'You can only reverse your own entries.',
  'Only entries from the current business day can be reversed.',
  'Only Stock-In, Batter Preparation, Waste, and Spillage entries can be reversed.',
  'This entry has already been reversed.',
  'A reversal request for this entry is already pending.',
  'This entry is not available for your assigned branch.',
  'The entry to reverse was not found.',
];

export function entryReversalErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  const message = error?.message ?? '';
  if (error?.code === '23505') return 'A reversal request for this entry is already pending.';
  const known = KNOWN_ENTRY_REVERSAL_MESSAGES.find((text) => message.includes(text));
  if (known) return known;
  const used = /Part of this entry has already been used[^.]*\.[^.]*\./.exec(message);
  if (used) return used[0];
  const shortage = /Not enough .+ in stock to reverse this entry \([^)]*\)\./.exec(message);
  if (shortage) return shortage[0];
  const decided = /This request has already been (approved|rejected)\./.exec(message);
  if (decided) return `This request has already been ${decided[1]} and can no longer be changed.`;
  if (/fetch|network|timeout/i.test(message)) return 'No connection. Check the internet connection and try again.';
  if (isMissingEntryReversalSupport(error)) {
    return 'Entry reversals are not available yet. Ask the owner to update the system.';
  }
  return 'Unable to save the reversal request. Please try again.';
}

export function isMissingEntryReversalSupport(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || error.code === 'PGRST202'
    || error.code === '42883'
    || /inventory_entry_reversal|request_inventory_entry_reversal|decide_inventory_entry_reversal/.test(error.message ?? '')
      && /does not exist|could not find|schema cache/i.test(error.message ?? '');
}

export function mapEntryReversalRequestRow(
  row: {
    id: string;
    reference: string;
    branch_id: string;
    entry_kind: string;
    entry_key: string;
    entry_type: string;
    entry_reference: string;
    item_name: string;
    quantity: number | string;
    unit: string;
    entry_recorded_at: string;
    requested_by: string;
    reason: string;
    status: string;
    requested_at: string;
    decided_by: string | null;
    decided_at: string | null;
    decision_reason: string | null;
  },
  names: Map<string, string> = new Map(),
): EntryReversalRequest {
  const status: EntryReversalStatus = row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending';
  const entryType: EntryReversalType = row.entry_type in ENTRY_TYPE_LABELS ? row.entry_type as EntryReversalType : 'waste';
  return {
    id: row.id,
    reference: row.reference,
    branchId: row.branch_id,
    entryKind: row.entry_kind === 'batter_batch' ? 'batter_batch' : 'movement',
    entryKey: row.entry_key,
    entryType,
    entryReference: row.entry_reference,
    itemName: row.item_name,
    quantity: Number(row.quantity),
    unit: row.unit,
    entryRecordedAt: row.entry_recorded_at,
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
