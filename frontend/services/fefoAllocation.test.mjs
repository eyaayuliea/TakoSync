import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MinHeap,
  classifyLotExpiry,
  compareFefoLots,
  describeLotsForDisplay,
  fefoAllocate,
  isLotExpired,
  lotExpiresAt,
  lotExpiryLabel,
  lotExpiryTone,
  lotHoursLeft,
  resolveLotExpiryWindow,
} from './fefoAllocation.ts';

const BRANCH = 'branch-1';
const FLOUR = 'flour';
// 2026-11-22 10:00 in Manila.
const NOW = new Date('2026-11-22T02:00:00.000Z');

const lot = (id, expirationDate, quantity, extra = {}) => ({
  id,
  branchId: BRANCH,
  ingredientId: FLOUR,
  expirationDate,
  receivedDate: '2026-11-15',
  createdAt: '2026-11-15T01:00:00.000Z',
  quantityRemaining: quantity,
  ...extra,
});

test('the min-heap always pops the smallest item', () => {
  const values = [9, 3, 7, 1, 8, 2, 6, 4, 5, 0];
  const heap = new MinHeap((a, b) => a - b, values);
  heap.push(-1);
  const popped = [];
  while (heap.size > 0) popped.push(heap.pop());
  assert.deepEqual(popped, [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(heap.pop(), undefined);
});

test('AC-FEFO-01-03: a lot is usable through the end of its expiration date in Manila', () => {
  assert.equal(new Date(lotExpiresAt('2026-11-22')).toISOString(), '2026-11-22T16:00:00.000Z');
  assert.equal(isLotExpired({ expirationDate: '2026-11-22' }, NOW), false);
  assert.equal(isLotExpired({ expirationDate: '2026-11-21' }, NOW), true);
  assert.equal(isLotExpired({ expirationDate: '2026-11-22' }, new Date('2026-11-22T16:00:00.000Z')), true);
  assert.equal(isLotExpired({ expirationDate: null }, NOW), false);
});

test('AC-FEFO-01-04: order is expiration date, then received date, then record time, then id', () => {
  const lots = [
    lot('c', '2026-11-25', 1),
    lot('none', null, 1),
    lot('b2', '2026-11-24', 1, { receivedDate: '2026-11-16' }),
    lot('b1z', '2026-11-24', 1, { createdAt: '2026-11-15T02:00:00.000Z' }),
    lot('b1b', '2026-11-24', 1),
    lot('b1a', '2026-11-24', 1),
  ];
  assert.deepEqual([...lots].sort(compareFefoLots).map((item) => item.id), ['b1a', 'b1b', 'b1z', 'b2', 'c', 'none']);
});

test('AC-FEFO-01-04: the earliest-expiring lot is used first and later lots only for the rest', () => {
  const certificate = fefoAllocate({
    branchId: BRANCH,
    ingredientId: FLOUR,
    quantity: 1.2,
    now: NOW,
    lots: [lot('late', '2026-12-01', 5), lot('soon', '2026-11-23', 0.5), lot('mid', '2026-11-26', 0.5)],
  });
  assert.deepEqual(certificate.allocations, [
    { lotId: 'soon', quantity: 0.5, remainingAfter: 0 },
    { lotId: 'mid', quantity: 0.5, remainingAfter: 0 },
    { lotId: 'late', quantity: 0.2, remainingAfter: 4.8 },
  ]);
  assert.equal(certificate.status, 'COMPLETED');
  assert.equal(certificate.allocated, 1.2);
  assert.equal(certificate.shortfall, 0);
});

test('AC-FEFO-01-01/03: other branches, other items, expired and held lots are never used', () => {
  const certificate = fefoAllocate({
    branchId: BRANCH,
    ingredientId: FLOUR,
    quantity: 1,
    now: NOW,
    lots: [
      lot('other-branch', '2026-11-23', 5, { branchId: 'branch-2' }),
      lot('other-item', '2026-11-23', 5, { ingredientId: 'dashi' }),
      lot('expired', '2026-11-21', 5),
      lot('quarantined', '2026-11-23', 5, { status: 'quarantined' }),
      lot('damaged', '2026-11-23', 5, { status: 'damaged' }),
      lot('reserved', '2026-11-23', 5, { status: 'reserved' }),
      lot('empty', '2026-11-23', 0),
      lot('good', '2026-11-30', 5),
    ],
  });
  assert.deepEqual(certificate.allocations.map((item) => item.lotId), ['good']);
});

test('AC-FEFO-01-06/07: short stock is allocated in full and the shortfall is reported, never negative', () => {
  const partial = fefoAllocate({
    branchId: BRANCH,
    ingredientId: FLOUR,
    quantity: 3,
    now: NOW,
    lots: [lot('a', '2026-11-23', 1.25), lot('b', '2026-11-24', 0.5)],
  });
  assert.equal(partial.status, 'PARTIAL');
  assert.equal(partial.allocated, 1.75);
  assert.equal(partial.shortfall, 1.25);
  assert.ok(partial.allocations.every((item) => item.remainingAfter >= 0));

  const none = fefoAllocate({ branchId: BRANCH, ingredientId: FLOUR, quantity: 1, now: NOW, lots: [lot('x', '2026-11-20', 4)] });
  assert.equal(none.status, 'INSUFFICIENT_STOCK');
  assert.deepEqual(none.allocations, []);
  assert.equal(none.shortfall, 1);
});

test('spoilage of expired stock can be taken from the expired lots first', () => {
  const certificate = fefoAllocate({
    branchId: BRANCH,
    ingredientId: FLOUR,
    quantity: 2,
    now: NOW,
    includeExpired: true,
    lots: [lot('fresh', '2026-11-30', 5), lot('expired', '2026-11-20', 1.5)],
  });
  assert.deepEqual(certificate.allocations.map((item) => [item.lotId, item.quantity]), [['expired', 1.5], ['fresh', 0.5]]);
});

test('AC-FEFO-01-02: the quantity must be greater than zero', () => {
  for (const quantity of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => fefoAllocate({ branchId: BRANCH, ingredientId: FLOUR, quantity, lots: [] }), RangeError);
  }
});

test('allocation does not change the lots it was given and rounds to grams', () => {
  const lots = [lot('a', '2026-11-23', 0.1), lot('b', '2026-11-24', 0.2)];
  const certificate = fefoAllocate({ branchId: BRANCH, ingredientId: FLOUR, quantity: 0.3, now: NOW, lots });
  assert.equal(certificate.status, 'COMPLETED');
  assert.equal(certificate.allocated, 0.3);
  assert.equal(lots[0].quantityRemaining, 0.1);
});

test('AC-FEFO-01-11: lots are GREEN, YELLOW (24-48 h), RED (under 24 h) or EXPIRED', () => {
  // NOW is 10:00 on 22 Nov in Manila, so 22 Nov ends in 14 h, 23 Nov in 38 h, 24 Nov in 62 h.
  assert.equal(classifyLotExpiry({ expirationDate: '2026-11-21' }, NOW), 'EXPIRED');
  assert.equal(classifyLotExpiry({ expirationDate: '2026-11-22' }, NOW), 'RED');
  assert.equal(classifyLotExpiry({ expirationDate: '2026-11-23' }, NOW), 'YELLOW');
  assert.equal(classifyLotExpiry({ expirationDate: '2026-11-24' }, NOW), 'GREEN');
  assert.equal(classifyLotExpiry({ expirationDate: null }, NOW), 'NO_EXPIRY');
  assert.equal(lotHoursLeft({ expirationDate: '2026-11-23' }, NOW), 38);
});

test('the yellow and red windows are owner-configurable', () => {
  assert.equal(classifyLotExpiry({ expirationDate: '2026-11-24' }, NOW, { warningHours: 72 }), 'YELLOW');
  assert.equal(classifyLotExpiry({ expirationDate: '2026-11-23' }, NOW, { criticalHours: 40 }), 'RED');
  assert.deepEqual(resolveLotExpiryWindow({ warningHours: 12, criticalHours: 24 }), { warningHours: 12, criticalHours: 12 });
  assert.deepEqual(resolveLotExpiryWindow({ warningHours: 0, criticalHours: -1 }), { warningHours: 48, criticalHours: 24 });
  assert.equal(lotExpiryLabel('YELLOW', { warningHours: 72 }), 'Expires within 72 hours');
  assert.equal(lotExpiryLabel('RED'), 'Use first — expires within 24 hours');
});

test('AC-FEFO-01-11: lot lists are in FEFO order and mark the lot to use first', () => {
  const lots = [
    { id: 'later', expirationDate: '2026-11-30', receivedDate: '2026-11-15', quantityRemaining: 2 },
    { id: 'empty', expirationDate: '2026-11-20', receivedDate: '2026-11-10', quantityRemaining: 0 },
    { id: 'expired', expirationDate: '2026-11-21', receivedDate: '2026-11-10', quantityRemaining: 1 },
    { id: 'held', expirationDate: '2026-11-22', receivedDate: '2026-11-11', quantityRemaining: 1, usable: false },
    { id: 'soon', expirationDate: '2026-11-23', receivedDate: '2026-11-12', quantityRemaining: 1 },
    { id: 'none', expirationDate: null, receivedDate: '2026-11-01', quantityRemaining: 5 },
  ];
  const shown = describeLotsForDisplay(lots, NOW);
  assert.deepEqual(shown.map((item) => item.id), ['expired', 'held', 'soon', 'later', 'none', 'empty']);
  assert.deepEqual(shown.filter((item) => item.useFirst).map((item) => item.id), ['soon']);
  assert.deepEqual(shown.map((item) => item.expiry), ['EXPIRED', 'RED', 'YELLOW', 'GREEN', 'NO_EXPIRY', 'EXPIRED']);
  assert.equal(shown[1].expiryLabel, 'On hold — not used for sales');
  assert.equal(shown[0].expiryLabel, 'Expired — record as waste');
  assert.deepEqual(['EXPIRED', 'RED', 'YELLOW', 'GREEN', 'NO_EXPIRY'].map(lotExpiryTone), ['low', 'low', 'warning', 'good', 'neutral']);
});
