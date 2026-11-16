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
