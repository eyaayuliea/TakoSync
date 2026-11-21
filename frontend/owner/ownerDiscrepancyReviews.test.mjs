import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
register('../services/testTsLoader.mjs', import.meta.url);
const { isOwnerDiscrepancyActionable, isOwnerDiscrepancyValidatable } = await import('../services/takosync.ts');

test('submitted counts without a correction request remain read-only for Owner review', () => {
  assert.equal(isOwnerDiscrepancyActionable({ status: 'Pending', canDecide: false }), false);
  assert.equal(isOwnerDiscrepancyActionable({ status: 'Pending', canDecide: true }), true);
  assert.equal(isOwnerDiscrepancyActionable({ status: 'Approved', canDecide: true }), false);
});

test('submitted discrepancies are directly validatable while correction requests keep their workflow', () => {
  assert.equal(isOwnerDiscrepancyValidatable({ status: 'Pending', canValidate: true }), true);
  assert.equal(isOwnerDiscrepancyValidatable({ status: 'Pending', canValidate: false }), false);
  assert.equal(isOwnerDiscrepancyValidatable({ status: 'Approved', canValidate: true }), true);
  assert.equal(isOwnerDiscrepancyValidatable({ status: 'Validated', canValidate: false }), false);
});

test('OM-14 c1, c10: statuses read Pending Review, Adjusted, or Rejected for Recount; open reviews come first', async () => {
  const { ownerDiscrepancyStatusLabel, sortOwnerDiscrepancyReviews } = await import('../services/takosync.ts');
  assert.equal(ownerDiscrepancyStatusLabel('Pending'), 'Pending Review');
  assert.equal(ownerDiscrepancyStatusLabel('Approved'), 'Pending Review');
  assert.equal(ownerDiscrepancyStatusLabel('Rejected'), 'Pending Review');
  assert.equal(ownerDiscrepancyStatusLabel('Validated'), 'Adjusted');
  assert.equal(ownerDiscrepancyStatusLabel('Rejected for Recount'), 'Rejected for Recount');
  const sorted = sortOwnerDiscrepancyReviews([
    { id: 'old-adjusted', status: 'Validated', submittedAt: '2026-11-25T05:00:00Z' },
    { id: 'old-pending', status: 'Pending', submittedAt: '2026-11-20T01:00:00Z' },
    { id: 'new-pending', status: 'Approved', submittedAt: '2026-11-24T01:00:00Z' },
    { id: 'recount', status: 'Rejected for Recount', submittedAt: '2026-11-26T01:00:00Z' },
  ]);
  assert.deepEqual(sorted.map((review) => review.id), ['new-pending', 'old-pending', 'recount', 'old-adjusted']);
});

test('OM-14 c9: Reject Count is offered only while the count is under review', async () => {
  const { isOwnerDiscrepancyRecountable } = await import('../services/takosync.ts');
  assert.equal(isOwnerDiscrepancyRecountable({ status: 'Pending', canReject: true }), true);
  assert.equal(isOwnerDiscrepancyRecountable({ status: 'Pending', canReject: false }), false);
  assert.equal(isOwnerDiscrepancyRecountable({ status: 'Validated', canReject: true }), false);
  assert.equal(isOwnerDiscrepancyRecountable({ status: 'Rejected for Recount', canReject: true }), false);
  assert.equal(isOwnerDiscrepancyValidatable({ status: 'Rejected for Recount', canValidate: true }), false);
  assert.equal(isOwnerDiscrepancyValidatable({ status: 'Rejected', canValidate: true }), true, 'after a rejected correction the original count can be validated');
});
