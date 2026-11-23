import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBranchName } from './branchNames.ts';

test('branches are named "City · Branch N", or "Branch N" without a city', () => {
  assert.equal(formatBranchName({ city: 'Manila', code: 'BR-001' }), 'Manila · Branch 1');
  assert.equal(formatBranchName({ city: '', code: 'BR-002' }), 'Branch 2');
  assert.equal(formatBranchName({ city: null, code: 'BR-003' }), 'Branch 3');
  assert.equal(formatBranchName({ city: '  Quezon City ', code: 'BR-010' }), 'Quezon City · Branch 10');
  assert.equal(formatBranchName({ city: 'Cebu', code: 'MAIN' }), 'Cebu · Branch MAIN');
});
