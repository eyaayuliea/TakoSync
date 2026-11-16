import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOwnerSalesSelection } from './ownerSalesSelection.ts';

test('dashboard branch navigation applies the selected branch to Sales monitoring', () => {
  assert.deepEqual(resolveOwnerSalesSelection({
    branchId: 'branch-2',
    period: 'Weekly',
    startDate: '2026-11-09',
    endDate: '2026-11-15',
  }), {
    branchId: 'branch-2',
    period: 'Weekly',
    startDate: '2026-11-09',
    endDate: '2026-11-15',
  });
});
