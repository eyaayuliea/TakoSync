import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isMissingSaleVoidSupport,
  latestSaleVoidRequest,
  mapSaleVoidRequestRow,
  saleVoidAvailability,
  saleVoidErrorMessage,
  saleVoidState,
  saleVoidStatusLabel,
  sortSaleVoidRequestsForReview,
  validateSaleVoidFlagReason,
  validateSaleVoidReason,
  validateSaleVoidRejectionReason,
} from './saleVoids.ts';

const now = new Date('2026-11-25T06:00:00Z'); // 2:00 PM Manila, 25 Nov
const todaySale = {
  status: 'completed',
  inventory_processing_status: 'completed',
  created_at: '2026-11-25T02:00:00Z', // 10:00 AM Manila
};

function request(overrides = {}) {
  return {
    id: 'r1',
    reference: 'VOID-20261125-0001',
    saleId: 's1',
    branchId: 'b1',
    requestedBy: 'staff-1',
    requestedByName: 'Ana',
    reason: 'Wrong flavor',
    status: 'pending_review',
    requestedAt: '2026-11-25T03:00:00Z',
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    decisionReason: null,
    ...overrides,
  };
}

test('Void Sale is offered for a completed sale from the current business day (ST-07 c1)', () => {
  assert.deepEqual(saleVoidAvailability(todaySale, null, now), { allowed: true });
});

test('a sale from an earlier business day cannot be voided (ST-07 c1)', () => {
  // 11:30 PM Manila on 24 Nov is the previous business day.
  const yesterday = { ...todaySale, created_at: '2026-11-24T15:30:00Z' };
  assert.deepEqual(saleVoidAvailability(yesterday, null, now), {
    allowed: false,
    reason: 'Only sales from the current business day can be voided.',
  });
  // 12:30 AM Manila on 25 Nov is already today, although it is 24 Nov in UTC.
  const afterMidnight = { ...todaySale, created_at: '2026-11-24T16:30:00Z' };
  assert.deepEqual(saleVoidAvailability(afterMidnight, null, now), { allowed: true });
});

test('a sale that is already voided cannot be voided again (ST-07 c8)', () => {
  assert.deepEqual(saleVoidAvailability(todaySale, request(), now), { allowed: false, reason: 'This sale is already voided.' });
  assert.equal(saleVoidAvailability({ ...todaySale, status: 'voided' }, null, now).allowed, false);
});

test('Void Sale is not offered after the daily closing is recorded (ST-07 c1)', () => {
  assert.deepEqual(saleVoidAvailability(todaySale, null, now, true), {
    allowed: false,
    reason: 'The daily closing is already recorded, so sales of this business day can no longer be voided.',
  });
  assert.deepEqual(saleVoidAvailability(todaySale, null, now, false), { allowed: true });
});

test('cancelled and unprocessed sales cannot be voided', () => {
  assert.equal(saleVoidAvailability({ ...todaySale, status: 'cancelled' }, null, now).allowed, false);
  assert.deepEqual(saleVoidAvailability({ ...todaySale, inventory_processing_status: 'failed' }, null, now), {
    allowed: false,
    reason: 'Finish inventory processing for this sale before voiding it.',
  });
});

test('a voided sale shows Voided with the owner review status (ST-07 c5, c7)', () => {
  const latest = latestSaleVoidRequest([request(), request({ id: 'x', saleId: 'other' })], 's1');
  assert.equal(latest?.id, 'r1');
  assert.equal(saleVoidStatusLabel(saleVoidState({ status: 'voided' }, latest)), 'Voided · Pending Review');
  assert.equal(saleVoidStatusLabel(saleVoidState({ status: 'voided' }, request({ status: 'reviewed' }))), 'Voided · Reviewed');
  assert.equal(saleVoidStatusLabel(saleVoidState({ status: 'voided' }, request({ status: 'flagged' }))), 'Voided · Flagged');
  // The sale row may be stale right after the void; the void record still marks it Voided.
  assert.equal(saleVoidState(todaySale, latest).kind, 'voided');
  assert.equal(saleVoidStatusLabel(saleVoidState({ status: 'voided' }, null)), 'Voided');
  assert.equal(saleVoidStatusLabel(saleVoidState(todaySale, null)), null);
});

test('the reason is required and limited in length (ST-07 c3, OM-15 c8)', () => {
  assert.equal(validateSaleVoidReason('   '), 'Enter the reason for voiding this sale.');
  assert.equal(validateSaleVoidReason('Customer cancelled'), '');
  assert.match(validateSaleVoidReason('x'.repeat(501)), /500 characters/);
  assert.equal(validateSaleVoidRejectionReason(''), 'Enter the reason for rejecting this request.');
  assert.equal(validateSaleVoidRejectionReason('Sale was correct'), '');
  assert.equal(validateSaleVoidFlagReason(' '), 'Enter the reason for flagging this void.');
  assert.equal(validateSaleVoidFlagReason('No complaint on record'), '');
});

test('owner review lists Pending Review first, then the newest (OM-15)', () => {
  const sorted = sortSaleVoidRequestsForReview([
    request({ id: 'old-reviewed', status: 'reviewed', requestedAt: '2026-11-25T01:00:00Z' }),
    request({ id: 'old-pending', requestedAt: '2026-11-25T02:00:00Z' }),
    request({ id: 'new-flagged', status: 'flagged', requestedAt: '2026-11-25T05:00:00Z' }),
    request({ id: 'new-pending', requestedAt: '2026-11-25T04:00:00Z' }),
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ['new-pending', 'old-pending', 'new-flagged', 'old-reviewed']);
});

test('server errors become specific messages', () => {
  assert.equal(saleVoidErrorMessage({ message: 'This sale is already voided.' }), 'This sale is already voided.');
  assert.equal(
    saleVoidErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint' }),
    'This sale is already voided.',
  );
  assert.equal(
    saleVoidErrorMessage({ message: 'This void has already been reviewed.' }),
    'This void has already been reviewed and can no longer be changed.',
  );
  assert.equal(saleVoidErrorMessage({ message: 'TypeError: Failed to fetch' }), 'No connection. Check the internet connection and try again.');
  assert.equal(saleVoidErrorMessage({ message: 'something odd' }), 'Unable to save the void. Please try again.');
});

test('a database without the void tables is recognised', () => {
  assert.equal(isMissingSaleVoidSupport({ code: 'PGRST205', message: 'Could not find the table' }), true);
  assert.equal(isMissingSaleVoidSupport({ code: '42P01', message: 'relation does not exist' }), true);
  assert.equal(
    isMissingSaleVoidSupport({ message: 'Could not find the function public.void_sale in the schema cache' }),
    true,
  );
  assert.equal(isMissingSaleVoidSupport({ code: '42501', message: 'permission denied' }), false);
  assert.equal(isMissingSaleVoidSupport(null), false);
});

test('request rows map to the screen model with employee names', () => {
  const mapped = mapSaleVoidRequestRow({
    id: 'r1',
    reference: 'VOID-20261125-0001',
    sale_id: 's1',
    branch_id: 'b1',
    requested_by: 'staff-1',
    reason: 'Wrong flavor',
    status: 'flagged',
    requested_at: '2026-11-25T03:00:00Z',
    decided_by: 'owner-1',
    decided_at: '2026-11-25T04:00:00Z',
    decision_reason: 'No complaint on record',
  }, new Map([['staff-1', 'Ana'], ['owner-1', 'Gelo']]));
  assert.equal(mapped.requestedByName, 'Ana');
  assert.equal(mapped.decidedByName, 'Gelo');
  assert.equal(mapped.status, 'flagged');
});
