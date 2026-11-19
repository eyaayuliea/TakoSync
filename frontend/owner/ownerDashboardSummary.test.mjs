import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeOwnerDashboardSales, summarizeOwnerInventoryStatus } from './ownerDashboardSummary.ts';

const branches = [
  { id: 'branch-1', name: 'Branch 1' },
  { id: 'branch-2', name: 'Branch 2' },
  { id: 'branch-3', name: 'Branch 3' },
];

test('aggregates completed recorded sales regardless of inventory processing status', () => {
  const summary = summarizeOwnerDashboardSales([
    { branch_id: 'branch-1', total_amount: 100, status: 'completed', inventory_processing_status: 'completed' },
    { branch_id: 'branch-2', total_amount: '250.50', status: 'completed', inventory_processing_status: 'pending' },
    { branch_id: 'branch-3', total_amount: 75, status: 'completed', inventory_processing_status: 'failed' },
    { branch_id: 'branch-1', total_amount: 40, status: 'completed', inventory_processing_status: 'processing' },
    { branch_id: 'branch-2', total_amount: 25, status: 'completed' },
    { branch_id: 'branch-3', total_amount: 999, status: 'pending', inventory_processing_status: 'completed' },
  ], branches);

  assert.equal(summary.total, 490.5);
  assert.equal(summary.transactions, 5);
  assert.deepEqual(summary.branchMetrics.map(({ name, total, transactions }) => ({ name, total, transactions })), [
    { name: 'Branch 1', total: 140, transactions: 2 },
    { name: 'Branch 2', total: 275.5, transactions: 2 },
    { name: 'Branch 3', total: 75, transactions: 1 },
  ]);
});

test('keeps zero-sales branches and excludes invalid or noncompleted transactions', () => {
  const summary = summarizeOwnerDashboardSales([
    { branch_id: 'branch-1', total_amount: 100, status: 'completed', inventory_processing_status: 'failed' },
    { branch_id: 'branch-1', total_amount: 999, status: 'pending', inventory_processing_status: 'completed' },
    { branch_id: 'branch-2', total_amount: 'not-a-number', status: 'completed', inventory_processing_status: 'completed' },
    { branch_id: 'branch-3', total_amount: -25, status: 'completed', inventory_processing_status: 'failed' },
    { branch_id: 'branch-1', total_amount: 500, status: 'completed', inventory_processing_status: 'processing' },
  ], branches);

  assert.equal(summary.total, 600);
  assert.deepEqual(summary.branchMetrics.map((branch) => branch.total), [600, 0, 0]);
  assert.deepEqual(summary.branchMetrics.map((branch) => branch.transactions), [2, 0, 0]);
});

test('can summarize one selected branch without losing the branch identity', () => {
  const summary = summarizeOwnerDashboardSales([
    { branch_id: 'branch-1', total_amount: 100, status: 'completed', inventory_processing_status: 'failed' },
    { branch_id: 'branch-2', total_amount: 250, status: 'completed', inventory_processing_status: 'pending' },
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
