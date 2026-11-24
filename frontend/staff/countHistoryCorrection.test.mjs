import assert from 'node:assert/strict';
import test from 'node:test';
import { countHistoryCorrectionAction, countHistoryStatusLabel, countLineIdOfHistoryRecord } from './countHistoryCorrection.ts';

const base = {
  countedByUserId: 'staff-1', currentUserId: 'staff-1', expectedQuantity: 50, originalActualQuantity: 47.5,
  validated: false, correctionStatuses: [], waitingOnDevice: false,
};

test('a history record of a count leads to its count line; other records do not', () => {
  assert.equal(countLineIdOfHistoryRecord('physical-count-9f1c'), '9f1c');
  assert.equal(countLineIdOfHistoryRecord('7a2b'), null);
});

test('ST-12 c9: the employee who counted can request a correction of a count that differs', () => {
  assert.equal(countHistoryCorrectionAction(base), 'request');
  assert.equal(countHistoryCorrectionAction({ ...base, correctionStatuses: ['rejected'] }), 'request');
});

test('no request while one is pending, after validation, or for another employee: only viewing', () => {
  assert.equal(countHistoryCorrectionAction({ ...base, correctionStatuses: ['pending'] }), 'view');
  assert.equal(countHistoryCorrectionAction({ ...base, waitingOnDevice: true }), 'view');
  assert.equal(countHistoryCorrectionAction({ ...base, validated: true, correctionStatuses: ['approved'] }), 'view');
  assert.equal(countHistoryCorrectionAction({ ...base, currentUserId: 'staff-2', correctionStatuses: ['Pending'] }), 'view');
});

test('nothing is offered for a matching count, or for another employee\'s count without requests', () => {
  assert.equal(countHistoryCorrectionAction({ ...base, originalActualQuantity: 50 }), null);
  assert.equal(countHistoryCorrectionAction({ ...base, currentUserId: 'staff-2' }), null);
  assert.equal(countHistoryCorrectionAction({ ...base, validated: true }), null);
});

test('the count status reads as words, not as a database value', () => {
  assert.equal(countHistoryStatusLabel({ status: 'pending_owner_review', validated: false, correctionStatuses: [] }), 'Pending Review');
  assert.equal(countHistoryStatusLabel({ status: 'pending_owner_review', validated: false, correctionStatuses: ['pending'] }), 'Pending Review · correction requested');
  assert.equal(countHistoryStatusLabel({ status: 'pending_owner_review', validated: true, correctionStatuses: ['approved'] }), 'Validated by the owner');
  assert.equal(countHistoryStatusLabel({ status: 'submitted', validated: false, correctionStatuses: [] }), 'Submitted');
  assert.equal(countHistoryStatusLabel({ status: 'something_new', validated: false, correctionStatuses: [] }), 'Something new');
});
