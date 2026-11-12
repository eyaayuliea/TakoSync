import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInventoryCategories,
  buildInventoryCountReports,
  buildInventoryReportData,
  inventoryStockStatus,
  runDiscrepancySubmissionOnce,
  runInventoryReportLoad,
} from './inventoryReports.ts';

const ingredientItems = [
  { id: 'flour', name: 'Flour', category: 'Dry Goods', quantity: 3, unit: 'kg', minimumStock: 5 },
  { id: 'batter', name: 'Prepared Takoyaki Batter', category: 'Prepared', quantity: 0, unit: 'bottle', minimumStock: 2 },
  { id: 'sugar', name: 'Sugar', category: 'Dry Goods', quantity: 1, unit: 'kg', minimumStock: 1 },
  { id: 'eggs', name: 'Eggs', category: 'Dairy', quantity: 4, unit: 'pcs', minimumStock: 2 },
  { id: 'sauce', name: 'Sauce', category: 'Condiments', quantity: 6, unit: 'bottle', minimumStock: 3 },
];

const checks = [
  { id: 'check-old', reference: 'IC-OLD', branch_id: 'branch-a', submitted_by: 'staff-1', remarks: 'Short count', status: 'pending_owner_review', created_at: '2026-11-11T08:00:00+08:00' },
  { id: 'check-new', reference: 'IC-NEW', branch_id: 'branch-a', submitted_by: 'staff-2', remarks: '', status: 'pending_owner_review', created_at: '2026-11-12T08:00:00+08:00' },
  { id: 'check-draft', reference: 'IC-DRAFT', branch_id: 'branch-a', submitted_by: 'staff-1', remarks: '', status: 'draft', created_at: '2026-11-12T09:00:00+08:00' },
  { id: 'check-other', reference: 'IC-OTHER', branch_id: 'branch-b', submitted_by: 'staff-3', remarks: '', status: 'pending_owner_review', created_at: '2026-11-12T10:00:00+08:00' },
];

const lines = [
  { id: 'line-short', daily_stock_check_id: 'check-old', ingredient_id: 'flour', recorded_quantity: 5, physical_quantity: 3, difference: -2, unit: 'kg', inventory_revision: 4 },
  { id: 'line-excess', daily_stock_check_id: 'check-new', ingredient_id: 'eggs', recorded_quantity: 2, physical_quantity: 4, difference: 2, unit: 'pcs', inventory_revision: 7 },
  { id: 'line-match', daily_stock_check_id: 'check-new', ingredient_id: 'sugar', recorded_quantity: 1, physical_quantity: 1, difference: 0, unit: 'kg', inventory_revision: 7 },
  { id: 'line-draft', daily_stock_check_id: 'check-draft', ingredient_id: 'flour', recorded_quantity: 4, physical_quantity: 3, difference: -1, unit: 'kg', inventory_revision: 8 },
  { id: 'line-other', daily_stock_check_id: 'check-other', ingredient_id: 'flour', recorded_quantity: 4, physical_quantity: 2, difference: -2, unit: 'kg', inventory_revision: 8 },
];

const movements = [{
  id: 'movement-1',
  branch_id: 'branch-a',
  actor_id: 'owner-1',
  type: 'adjustment',
  reference: 'ADJ-001',
  movement: -2,
  before_quantity: 5,
  after_quantity: 3,
  notes: 'Authorized physical count line line-short',
  created_at: '2026-11-11T09:00:00+08:00',
}];

test('ingredient quantity rows are alphabetic and preserve zero balances including prepared batter', () => {
  const reports = buildInventoryReportData({
    branchId: 'branch-a',
    branchName: 'Manila 1',
    generatedAt: '2026-11-12T10:00:00+08:00',
    ingredients: ingredientItems,
    checks: [],
    lines: [],
    itemNames: [],
    movements: [],
  });
  assert.deepEqual(reports.ingredients.map((item) => item.name), [
    'Eggs', 'Flour', 'Prepared Takoyaki Batter', 'Sauce', 'Sugar',
  ]);
  assert.equal(reports.ingredients.find((item) => item.id === 'batter')?.quantity, 0);
  assert.equal(reports.ingredients.find((item) => item.id === 'batter')?.unit, 'bottle');
  assert.equal(reports.generatedAt, '2026-11-12T10:00:00+08:00');
});

test('categories sort alphabetically, count ingredients, and total quantities only by matching unit', () => {
  const categories = buildInventoryCategories([
    ...ingredientItems,
    { id: 'oil', name: 'Oil', category: 'Dry Goods', quantity: 2, unit: 'L', minimumStock: 1 },
  ]);
  assert.deepEqual(categories.map((category) => category.category), ['Condiments', 'Dairy', 'Dry Goods', 'Prepared']);
  const dryGoods = categories.find((category) => category.category === 'Dry Goods');
  assert.equal(dryGoods?.ingredientCount, 3);
  assert.deepEqual(dryGoods?.ingredients.map((item) => item.name), ['Flour', 'Oil', 'Sugar']);
  assert.deepEqual(dryGoods?.totalsByUnit, [
    { unit: 'kg', quantity: 4 },
    { unit: 'L', quantity: 2 },
  ]);
});

test('stock status boundaries match Normal, Low Stock, and Out of Stock rules', () => {
  assert.equal(inventoryStockStatus(5.01, 5), 'Normal');
  assert.equal(inventoryStockStatus(5, 5), 'Low Stock');
  assert.equal(inventoryStockStatus(1, 5), 'Low Stock');
  assert.equal(inventoryStockStatus(0, 5), 'Out of Stock');
});

test('counts and discrepancies are branch-scoped, newest-first, and exclude drafts', () => {
  const result = buildInventoryCountReports({
    branchId: 'branch-a',
    branchName: 'Manila 1',
    checks,
    lines,
    itemNames: [{ id: 'flour', name: 'Flour' }, { id: 'eggs', name: 'Eggs' }, { id: 'sugar', name: 'Sugar' }],
    movements: [],
  });
  assert.deepEqual(result.physicalCounts.map((count) => count.id), ['line-excess', 'line-match', 'line-short']);
  assert.deepEqual(result.discrepancies.map((count) => count.id), ['line-excess', 'line-short']);
  assert.equal(result.discrepancies[0].submittedBy, 'staff-2');
  assert.equal(result.discrepancies[0].branchName, 'Manila 1');
  assert.equal(result.discrepancies[0].remarks, '');
  assert.equal(result.discrepancies[0].countStatus, 'Submitted');
  assert.equal(result.physicalCounts[0].result, 'Higher than expected');
  assert.equal(result.physicalCounts[2].result, 'Lower than expected');
  assert.equal(result.physicalCounts[1].result, 'Matches');
});

test('approved adjustment retains original count and exposes revised actual and revision audit', () => {
  const result = buildInventoryCountReports({
    branchId: 'branch-a',
    branchName: 'Manila 1',
    checks,
    lines,
    itemNames: [{ id: 'flour', name: 'Flour' }, { id: 'eggs', name: 'Eggs' }, { id: 'sugar', name: 'Sugar' }],
    movements,
  });
  const corrected = result.discrepancies.find((count) => count.id === 'line-short');
  assert.equal(corrected?.originalActualQuantity, 3);
  assert.equal(corrected?.actualQuantity, 3);
  assert.equal(corrected?.difference, -2);
  assert.equal(corrected?.revisedActualQuantity, 3);
  assert.equal(corrected?.inventoryRevision, 4);
  assert.deepEqual(corrected?.adjustment, {
    reference: 'ADJ-001',
    actorId: 'owner-1',
    createdAt: '2026-11-11T09:00:00+08:00',
    beforeQuantity: 5,
    afterQuantity: 3,
  });
  assert.equal(corrected?.countStatus, 'Validated');
});

test('correction history and no-change validation retain the original submitted quantities', () => {
  const result = buildInventoryCountReports({
    branchId: 'branch-a',
    branchName: 'Manila 1',
    checks,
    lines,
    itemNames: [{ id: 'flour', name: 'Flour' }, { id: 'eggs', name: 'Eggs' }, { id: 'sugar', name: 'Sugar' }],
    movements: [],
    correctionRequests: [
      {
        id: 'request-rejected',
        daily_stock_count_line_id: 'line-short',
        corrected_actual_quantity: 4,
        reason: 'First recount',
        status: 'rejected',
        decision_reason: 'Owner requested another count',
        decided_at: '2026-11-12T08:00:00+08:00',
      },
      {
        id: 'request-approved',
        daily_stock_count_line_id: 'line-short',
        corrected_actual_quantity: 5,
        reason: 'Final recount',
        status: 'approved',
        decision_reason: 'Verified',
        decided_at: '2026-11-12T09:00:00+08:00',
      },
    ],
    validations: [{
      daily_stock_count_line_id: 'line-short',
      corrected_actual_quantity: 5,
      outcome: 'no_change',
      reason: 'Corrected quantity equals expected inventory',
      validated_at: '2026-11-12T10:00:00+08:00',
    }],
  });
  const count = result.physicalCounts.find((entry) => entry.id === 'line-short');
  assert.equal(count?.expectedQuantity, 5);
  assert.equal(count?.originalActualQuantity, 3);
  assert.equal(count?.actualQuantity, 3);
  assert.equal(count?.revisedActualQuantity, 5);
  assert.equal(count?.inventoryRevision, 4);
  assert.deepEqual(count?.correctionRequests.map((request) => request.status), ['rejected', 'approved']);
  assert.equal(count?.validation?.outcome, 'no_change');
  assert.equal(count?.validation?.reason, 'Corrected quantity equals expected inventory');
  assert.equal(count?.countStatus, 'Validated');
});

test('empty reports remain empty and data loading failures return retryable error state', async () => {
  const empty = buildInventoryCountReports({
    branchId: 'branch-a', branchName: 'Manila 1', checks: [], lines: [], itemNames: [], movements: [],
  });
  assert.deepEqual(empty, { discrepancies: [], physicalCounts: [] });
  const failed = await runInventoryReportLoad(async () => { throw new Error('query failed'); });
  assert.equal(failed.data, null);
  assert.equal(failed.error, 'Unable to load data. Please check your internet connection and try again.');
});

test('discrepancy submission lock prevents overlapping writes and releases after failure', async () => {
  const lock = { current: false };
  let release;
  let calls = 0;
  const delayed = new Promise((resolve) => { release = resolve; });
  const first = runDiscrepancySubmissionOnce(lock, async () => {
    calls += 1;
    await delayed;
    return 'saved';
  });
  assert.equal(await runDiscrepancySubmissionOnce(lock, async () => {
    calls += 1;
    return 'duplicate';
  }), null);
  release();
  assert.equal(await first, 'saved');
  assert.equal(calls, 1);
  await assert.rejects(runDiscrepancySubmissionOnce(lock, async () => { throw new Error('failed'); }));
  assert.equal(lock.current, false);
});
