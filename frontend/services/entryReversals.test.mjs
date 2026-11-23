import assert from 'node:assert/strict';
import test from 'node:test';
import {
  entryReversalAvailability,
  entryReversalErrorMessage,
  entryReversalState,
  entryReversalStatusLabel,
  entryReversalRequestStatusLabel,
  isMissingEntryReversalSupport,
  latestEntryReversalRequest,
  mapEntryReversalRequestRow,
  reversibleEntryOf,
  sortEntryReversalRequestsForReview,
  validateEntryReversalReason,
} from './entryReversals.ts';

const now = new Date('2026-11-25T06:00:00Z'); // 2:00 PM Manila, 25 Nov

function row(overrides = {}) {
  return {
    id: 'mov-1',
    type: 'Stock-In',
    ingredientId: 'flour',
    staffId: 'staff-1',
    reason: '',
    notes: '',
    batchReference: 'B-1',
    createdAt: new Date('2026-11-25T02:00:00Z'),
    transactionDate: new Date('2026-11-25T02:00:00Z'),
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    id: 'r1', reference: 'REV-20261125-0001', branchId: 'b1', entryKind: 'movement', entryKey: 'mov-1',
    entryType: 'stock_in', entryReference: 'TX-1', itemName: 'Flour', quantity: 2, unit: 'kg',
    entryRecordedAt: '2026-11-25T02:00:00Z', requestedBy: 'staff-1', requestedByName: 'Ana', reason: 'Typo',
    status: 'pending', requestedAt: '2026-11-25T03:00:00Z', decidedBy: null, decidedByName: null,
    decidedAt: null, decisionReason: null,
    ...overrides,
  };
}

test('Stock-In, Waste, Spillage, Spoilage and batter rows map to their entry (ST-13)', () => {
  assert.deepEqual(reversibleEntryOf(row()), { key: 'mov-1', type: 'stock_in' });
  assert.deepEqual(reversibleEntryOf(row({ type: 'Waste', reason: 'Spillage' })), { key: 'mov-1', type: 'spillage' });
  assert.deepEqual(reversibleEntryOf(row({ type: 'Waste', reason: 'Waste' })), { key: 'mov-1', type: 'waste' });
  assert.deepEqual(reversibleEntryOf(row({ type: 'Spoilage' })), { key: 'mov-1', type: 'spoilage' });
  // Every movement of a batter preparation belongs to the same entry: the batch.
  assert.deepEqual(
    reversibleEntryOf(row({ type: 'Usage', reason: 'Batter preparation', notes: 'BATCH-20261125-0001' })),
    { key: 'BATCH-20261125-0001', type: 'batter_preparation' },
  );
  assert.deepEqual(
    reversibleEntryOf(row({ ingredientId: 'prepared-batter', batchReference: 'BATCH-20261125-0001' })),
    { key: 'BATCH-20261125-0001', type: 'batter_preparation' },
  );
  assert.equal(reversibleEntryOf(row({ type: 'Sales Consumption' })), null);
  assert.equal(reversibleEntryOf(row({ type: 'Authorized Adjustment' })), null);
});

test('only the staff member\'s own same-day entries can be reversed (ST-13 c1, c9)', () => {
  assert.deepEqual(entryReversalAvailability(row(), 'staff-1', null, now), { allowed: true });
  assert.deepEqual(entryReversalAvailability(row(), 'staff-2', null, now), {
    allowed: false, reason: 'You can only reverse your own entries.',
  });
  const yesterday = row({ createdAt: new Date('2026-11-24T15:30:00Z') }); // 11:30 PM Manila on 24 Nov
  assert.deepEqual(entryReversalAvailability(yesterday, 'staff-1', null, now), {
    allowed: false, reason: 'Only entries from the current business day can be reversed.',
  });
  // Back-dated transaction date, but recorded today: the recording time counts.
  const backDated = row({ transactionDate: new Date('2026-11-20T02:00:00Z') });
  assert.deepEqual(entryReversalAvailability(backDated, 'staff-1', null, now), { allowed: true });
  assert.equal(entryReversalAvailability(row({ type: 'Sales Consumption' }), 'staff-1', null, now).allowed, false);
});

test('pending and reversed entries cannot be requested again; rejected ones can (ST-13 c6, c8)', () => {
  assert.equal(entryReversalAvailability(row(), 'staff-1', request(), now).allowed, false);
  assert.deepEqual(entryReversalAvailability(row(), 'staff-1', request({ status: 'approved' }), now), {
    allowed: false, reason: 'This entry has already been reversed.',
  });
  assert.equal(entryReversalAvailability(row(), 'staff-1', request({ status: 'rejected' }), now).allowed, true);
});

test('the history shows Reversal pending, Reversed, or Reversal rejected (ST-13 c5, c7, c8)', () => {
  const older = request({ id: 'old', status: 'rejected', requestedAt: '2026-11-25T02:30:00Z' });
  const latest = latestEntryReversalRequest([older, request(), request({ id: 'x', entryKey: 'other' })], 'mov-1');
  assert.equal(latest?.id, 'r1');
  assert.equal(entryReversalStatusLabel(entryReversalState(latest)), 'Reversal pending');
  assert.equal(entryReversalStatusLabel(entryReversalState(older)), 'Reversal rejected');
  assert.equal(entryReversalStatusLabel(entryReversalState(request({ status: 'approved' }))), 'Reversed');
  assert.equal(entryReversalStatusLabel(entryReversalState(null)), null);
});

test('the reason is required (ST-13 c3)', () => {
  assert.equal(validateEntryReversalReason(' '), 'Enter the reason for reversing this entry.');
  assert.equal(validateEntryReversalReason('Entered the wrong quantity'), '');
  assert.match(validateEntryReversalReason('x'.repeat(501)), /500 characters/);
});

test('owner review lists Pending first (OM-15 c1)', () => {
  const sorted = sortEntryReversalRequestsForReview([
    request({ id: 'a', status: 'approved', requestedAt: '2026-11-25T05:00:00Z' }),
    request({ id: 'p', requestedAt: '2026-11-25T01:00:00Z' }),
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ['p', 'a']);
});

test('server errors become specific messages', () => {
  assert.equal(
    entryReversalErrorMessage({ message: 'Part of this entry has already been used, so it cannot be reversed. Ask the owner to record an authorized adjustment instead.' }),
    'Part of this entry has already been used, so it cannot be reversed. Ask the owner to record an authorized adjustment instead.',
  );
  assert.equal(
    entryReversalErrorMessage({ message: 'Not enough Flour in stock to reverse this entry (2.000 kg needed, 1.000 kg available).' }),
    'Not enough Flour in stock to reverse this entry (2.000 kg needed, 1.000 kg available).',
  );
  assert.equal(entryReversalErrorMessage({ code: '23505', message: 'duplicate key' }), 'A reversal request for this entry is already pending.');
  assert.equal(
    entryReversalErrorMessage({ message: 'This request has already been rejected.' }),
    'This request has already been rejected and can no longer be changed.',
  );
  assert.equal(entryReversalErrorMessage({ message: '???' }), 'Unable to save the reversal request. Please try again.');
});

test('a database without entry reversals is recognised', () => {
  assert.equal(isMissingEntryReversalSupport({ code: 'PGRST205' }), true);
  assert.equal(
    isMissingEntryReversalSupport({ message: 'Could not find the function public.request_inventory_entry_reversal in the schema cache' }),
    true,
  );
  assert.equal(isMissingEntryReversalSupport({ code: '42501', message: 'permission denied' }), false);
});

test('request rows map to the screen model', () => {
  const mapped = mapEntryReversalRequestRow({
    id: 'r1', reference: 'REV-1', branch_id: 'b1', entry_kind: 'batter_batch', entry_key: 'BATCH-1',
    entry_type: 'batter_preparation', entry_reference: 'BATCH-1', item_name: 'Prepared batter', quantity: '5.000',
    unit: 'bottle', entry_recorded_at: '2026-11-25T02:00:00Z', requested_by: 'staff-1', reason: 'Wrong batch',
    status: 'approved', requested_at: '2026-11-25T03:00:00Z', decided_by: 'owner-1',
    decided_at: '2026-11-25T04:00:00Z', decision_reason: null,
  }, new Map([['staff-1', 'Ana'], ['owner-1', 'Gelo']]));
  assert.equal(mapped.quantity, 5);
  assert.equal(mapped.entryKind, 'batter_batch');
  assert.equal(mapped.decidedByName, 'Gelo');
});

test('OW-26 c10: the owner sees a reversal request as Pending, Reversed or Rejected', () => {
  assert.deepEqual(
    ['pending', 'approved', 'rejected'].map(entryReversalRequestStatusLabel),
    ['Pending', 'Reversed', 'Rejected'],
  );
});
