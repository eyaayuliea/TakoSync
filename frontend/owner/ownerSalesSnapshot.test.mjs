import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateOwnerSalesSnapshot,
  ownerSalesSelectionKey,
} from './ownerSalesSelection.ts';

const monthly = ownerSalesSelectionKey({ period: 'Monthly', branchId: null, fromText: '2026-11-01', toText: '2026-11-30' });
const weekly = ownerSalesSelectionKey({ period: 'Weekly', branchId: null, fromText: '2026-11-09', toText: '2026-11-15' });
const branch = ownerSalesSelectionKey({ period: 'Monthly', branchId: 'b1', fromText: '2026-11-01', toText: '2026-11-30' });

test('the parent snapshot is reused only while the screen shows the selection it was loaded for', () => {
  let state = evaluateOwnerSalesSnapshot({ key: monthly, reached: false }, monthly);
  assert.equal(state.reuse, true);
  state = evaluateOwnerSalesSnapshot(state.tracker, monthly);
  assert.equal(state.reuse, true);
});

test('the first render before the selection is applied does not discard the snapshot', () => {
  const state = evaluateOwnerSalesSnapshot({ key: monthly, reached: false }, weekly);
  assert.equal(state.reuse, false);
  assert.deepEqual(state.tracker, { key: monthly, reached: false });
  assert.equal(evaluateOwnerSalesSnapshot(state.tracker, monthly).reuse, true);
});

test('changing any filter refetches, and going back to the original selection refetches again', () => {
  let state = evaluateOwnerSalesSnapshot({ key: monthly, reached: false }, monthly);
  state = evaluateOwnerSalesSnapshot(state.tracker, weekly);
  assert.equal(state.reuse, false);
  assert.equal(state.tracker, null);
  state = evaluateOwnerSalesSnapshot(state.tracker, monthly);
  assert.equal(state.reuse, false);

  let branchChange = evaluateOwnerSalesSnapshot({ key: monthly, reached: false }, monthly);
  branchChange = evaluateOwnerSalesSnapshot(branchChange.tracker, branch);
  assert.equal(branchChange.reuse, false);
  assert.equal(branchChange.tracker, null);
});

test('selection keys distinguish period, branch and dates', () => {
  assert.notEqual(monthly, weekly);
  assert.notEqual(monthly, branch);
  assert.notEqual(
    ownerSalesSelectionKey({ period: 'Custom', branchId: null, fromText: '2026-11-01', toText: '2026-11-05' }),
    ownerSalesSelectionKey({ period: 'Custom', branchId: null, fromText: '2026-11-01', toText: '2026-11-06' }),
  );
});
