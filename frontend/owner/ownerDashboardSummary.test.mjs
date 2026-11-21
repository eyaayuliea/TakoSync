import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeOwnerDashboardSales, summarizeOwnerInventoryStatus } from './ownerDashboardSummary.ts';

const branches = [
  { id: 'branch-1', name: 'Branch 1' },
  { id: 'branch-2', name: 'Branch 2' },
  { id: 'branch-3', name: 'Branch 3' },
];

test('aggregates completed recorded sales across all three branches', () => {
  const summary = summarizeOwnerDashboardSales([
    { branch_id: 'branch-1', total_amount: 100, status: 'completed' },
    { branch_id: 'branch-2', total_amount: '250.50', status: 'completed' },
    { branch_id: 'branch-3', total_amount: 75, status: 'completed' },
  ], branches);

  assert.equal(summary.total, 425.5);
  assert.equal(summary.transactions, 3);
  assert.deepEqual(summary.branchMetrics.map(({ name, total, transactions }) => ({ name, total, transactions })), [
    { name: 'Branch 1', total: 100, transactions: 1 },
    { name: 'Branch 2', total: 250.5, transactions: 1 },
    { name: 'Branch 3', total: 75, transactions: 1 },
  ]);
});

test('keeps zero-sales branches and excludes invalid or unconfirmed transactions', () => {
  const summary = summarizeOwnerDashboardSales([
    { branch_id: 'branch-1', total_amount: 100, status: 'completed' },
    { branch_id: 'branch-1', total_amount: 999, status: 'pending' },
    { branch_id: 'branch-2', total_amount: 'not-a-number', status: 'completed' },
    { branch_id: 'branch-3', total_amount: -25, status: 'completed' },
  ], branches);

  assert.equal(summary.total, 100);
  assert.deepEqual(summary.branchMetrics.map((branch) => branch.total), [100, 0, 0]);
  assert.deepEqual(summary.branchMetrics.map((branch) => branch.transactions), [1, 0, 0]);
});

test('can summarize one selected branch without losing the branch identity', () => {
  const summary = summarizeOwnerDashboardSales([
    { branch_id: 'branch-1', total_amount: 100, status: 'completed' },
    { branch_id: 'branch-2', total_amount: 250, status: 'completed' },
  ], branches, 'branch-2');

  assert.equal(summary.total, 250);
  assert.deepEqual(summary.branchMetrics.map((branch) => branch.name), ['Branch 2']);
});

test('summarizes normal, low-stock, and out-of-stock inventory separately', () => {
  assert.deepEqual(summarizeOwnerInventoryStatus([
    { quantity: 10, minimum_stock: 5 },
    { quantity: 5, minimum_stock: 5 },
    { quantity: 0, minimum_stock: 5 },
    { quantity: null, minimum_stock: 5 },
    { quantity: 'invalid', minimum_stock: 5 },
  ]), { normal: 1, lowStock: 1, outOfStock: 1 });
});

test('OM-02 c4: inventory status is counted per branch', async () => {
  const { summarizeOwnerInventoryStatusByBranch } = await import('./ownerDashboardSummary.ts');
  const rows = summarizeOwnerInventoryStatusByBranch([
    { branch_id: 'b1', quantity: 10, minimum_stock: 2 },
    { branch_id: 'b1', quantity: 1, minimum_stock: 2 },
    { branch_id: 'b2', quantity: 0, minimum_stock: 2 },
    { branch_id: 'b2', quantity: null, minimum_stock: 2 },
  ], [{ id: 'b1', name: 'Branch 1' }, { id: 'b2', name: 'Branch 2' }, { id: 'b3', name: 'Branch 3' }]);
  assert.deepEqual(rows, [
    { id: 'b1', name: 'Branch 1', normal: 1, lowStock: 1, outOfStock: 0 },
    { id: 'b2', name: 'Branch 2', normal: 0, lowStock: 0, outOfStock: 1 },
    { id: 'b3', name: 'Branch 3', normal: 0, lowStock: 0, outOfStock: 0 },
  ]);
});
