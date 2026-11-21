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
    status: 'pending',
    requestedAt: '2026-11-25T03:00:00Z',
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    decisionReason: null,
    ...overrides,
  };
}

test('Request Void is offered for a completed sale from the current business day (ST-07 c1)', () => {
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

test('a pending request blocks a second one; a rejected one does not (ST-07 c6, c9)', () => {
  assert.equal(saleVoidAvailability(todaySale, request(), now).allowed, false);
  assert.equal(saleVoidAvailability(todaySale, request({ status: 'rejected' }), now).allowed, true);
});

test('voided, cancelled, and unprocessed sales cannot be voided', () => {
  assert.equal(saleVoidAvailability({ ...todaySale, status: 'voided' }, null, now).allowed, false);
  assert.equal(saleVoidAvailability({ ...todaySale, status: 'cancelled' }, null, now).allowed, false);
  assert.deepEqual(saleVoidAvailability({ ...todaySale, inventory_processing_status: 'failed' }, null, now), {
    allowed: false,
    reason: 'Finish inventory processing for this sale before requesting a void.',
  });
});

test('the sale shows Pending, Voided, or Rejected from its latest request (ST-07 c5, c7, c9)', () => {
  const older = request({ id: 'r0', status: 'rejected', requestedAt: '2026-11-25T02:30:00Z' });
  const newer = request({ id: 'r1', status: 'pending' });
  const latest = latestSaleVoidRequest([newer, older, request({ id: 'x', saleId: 'other' })], 's1');
  assert.equal(latest?.id, 'r1');

  assert.equal(saleVoidStatusLabel(saleVoidState(todaySale, latest)), 'Void pending');
  assert.equal(saleVoidStatusLabel(saleVoidState(todaySale, older)), 'Void rejected');
  const approved = request({ status: 'approved' });
  const voided = saleVoidState({ status: 'voided' }, approved);
  assert.equal(saleVoidStatusLabel(voided), 'Voided');
  assert.equal(voided.kind === 'voided' && voided.request?.id, 'r1');
  assert.equal(saleVoidStatusLabel(saleVoidState(todaySale, null)), null);
});

test('the reason is required and limited in length (ST-07 c3, OM-15 c8)', () => {
  assert.equal(validateSaleVoidReason('   '), 'Enter the reason for voiding this sale.');
  assert.equal(validateSaleVoidReason('Customer cancelled'), '');
  assert.match(validateSaleVoidReason('x'.repeat(501)), /500 characters/);
  assert.equal(validateSaleVoidRejectionReason(''), 'Enter the reason for rejecting this request.');
  assert.equal(validateSaleVoidRejectionReason('Sale was correct'), '');
});

test('owner review lists Pending first, then the newest (OM-15 c1)', () => {
  const sorted = sortSaleVoidRequestsForReview([
    request({ id: 'old-approved', status: 'approved', requestedAt: '2026-11-25T01:00:00Z' }),
    request({ id: 'old-pending', requestedAt: '2026-11-25T02:00:00Z' }),
    request({ id: 'new-rejected', status: 'rejected', requestedAt: '2026-11-25T05:00:00Z' }),
    request({ id: 'new-pending', requestedAt: '2026-11-25T04:00:00Z' }),
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ['new-pending', 'old-pending', 'new-rejected', 'old-approved']);
});

test('server errors become specific messages', () => {
  assert.equal(
    saleVoidErrorMessage({ message: 'A void request for this sale is already pending.' }),
    'A void request for this sale is already pending.',
  );
  assert.equal(
    saleVoidErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint' }),
    'A void request for this sale is already pending.',
  );
  assert.equal(
    saleVoidErrorMessage({ message: 'This request has already been approved.' }),
    'This request has already been approved and can no longer be changed.',
  );
  assert.equal(saleVoidErrorMessage({ message: 'TypeError: Failed to fetch' }), 'No connection. Check the internet connection and try again.');
  assert.equal(saleVoidErrorMessage({ message: 'something odd' }), 'Unable to save the void request. Please try again.');
});

test('a database without the void tables is recognised', () => {
  assert.equal(isMissingSaleVoidSupport({ code: 'PGRST205', message: 'Could not find the table' }), true);
  assert.equal(isMissingSaleVoidSupport({ code: '42P01', message: 'relation does not exist' }), true);
  assert.equal(
    isMissingSaleVoidSupport({ message: 'Could not find the function public.request_sale_void in the schema cache' }),
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
    status: 'rejected',
    requested_at: '2026-11-25T03:00:00Z',
    decided_by: 'owner-1',
    decided_at: '2026-11-25T04:00:00Z',
    decision_reason: 'Sale was correct',
  }, new Map([['staff-1', 'Ana'], ['owner-1', 'Gelo']]));
  assert.equal(mapped.requestedByName, 'Ana');
  assert.equal(mapped.decidedByName, 'Gelo');
  assert.equal(mapped.status, 'rejected');
});
