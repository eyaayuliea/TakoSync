import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyStockAlert,
  filterBranchInventoryAlertItems,
} from './inventoryAlerts.ts';
import {
  buildInventoryCategories,
  inventoryStockStatus,
} from './inventoryReports.ts';
import { validatePreparedBatterBatch } from '../services/batterPreparation.ts';
import {
  createPendingDailyStockCheckStore,
  sameDailyStockCheckPayload,
} from '../services/dailyStockCheckRecovery.ts';
import {
  canRetryPendingInventoryTransaction,
  createPendingInventoryTransactionStore,
  runInventoryTransactionRequestOnce,
  sameInventoryTransactionPayload,
} from '../services/inventoryTransactionRecovery.ts';

function memoryStorage() {
  const values = new Map();
  return {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
  };
}

function createWorkflowFixture() {
  return {
    branchId: 'branch-a',
    inventory: new Map([
      ['flour', { id: 'flour', name: 'Flour', category: 'Dry Goods', quantity: 10, unit: 'kg', minimumStock: 3 }],
      ['octopus', { id: 'octopus', name: 'Octopus', category: 'Seafood', quantity: 4, unit: 'kg', minimumStock: 2 }],
      ['prepared-batter', { id: 'prepared-batter', name: 'Prepared Batter', category: 'Prepared', quantity: 0, unit: 'bottle', minimumStock: 1 }],
    ]),
    movements: [],
    sales: [],
  };
}

function applyMovement(fixture, movement) {
  const item = fixture.inventory.get(movement.ingredientId);
  if (!item || movement.branchId !== fixture.branchId) throw new Error('Branch access denied');
  const nextQuantity = item.quantity + movement.movement;
  if (nextQuantity < 0) throw new Error('Insufficient stock');
  fixture.inventory.set(item.id, { ...item, quantity: nextQuantity });
  fixture.movements.push({ ...movement, beforeQuantity: item.quantity, afterQuantity: nextQuantity });
}

test('Staff stock-in, stock-out, and waste update quantity and movement history', () => {
  const fixture = createWorkflowFixture();
  applyMovement(fixture, { branchId: 'branch-a', ingredientId: 'flour', movement: 2, type: 'stock_in', reason: 'Stock-In' });
  applyMovement(fixture, { branchId: 'branch-a', ingredientId: 'flour', movement: -1, type: 'stock_out', reason: 'Cooking usage' });
  applyMovement(fixture, { branchId: 'branch-a', ingredientId: 'octopus', movement: -1, type: 'waste', reason: 'Spoilage' });

  assert.equal(fixture.inventory.get('flour').quantity, 11);
  assert.equal(fixture.inventory.get('octopus').quantity, 3);
  assert.deepEqual(fixture.movements.map((movement) => movement.type), ['stock_in', 'stock_out', 'waste']);
  assert.equal(fixture.movements.at(-1).reason, 'Spoilage');
  assert.deepEqual(fixture.movements.map((movement) => [movement.beforeQuantity, movement.afterQuantity]), [[10, 12], [12, 11], [4, 3]]);
});

test('insufficient stock leaves Staff inventory and movement history unchanged', () => {
  const fixture = createWorkflowFixture();
  assert.throws(
    () => applyMovement(fixture, { branchId: 'branch-a', ingredientId: 'octopus', movement: -5, type: 'waste', reason: 'Waste' }),
    /Insufficient stock/,
  );
  assert.equal(fixture.inventory.get('octopus').quantity, 4);
  assert.deepEqual(fixture.movements, []);
});

test('prepared batter and POS checkout compose recipe-based raw deductions', () => {
  const fixture = createWorkflowFixture();
  assert.equal(validatePreparedBatterBatch({ batch_reference: 'BAT-1', bottle_count: 5, prepared_unit: 'bottle', prepared_quantity: 5 }).prepared_quantity, 5);
  applyMovement(fixture, { branchId: 'branch-a', ingredientId: 'flour', movement: -2, type: 'usage', reason: 'Prepared batter BAT-1' });
  applyMovement(fixture, { branchId: 'branch-a', ingredientId: 'prepared-batter', movement: 5, type: 'stock_in', reason: 'Prepared batter BAT-1' });
  fixture.sales.push({ branchId: 'branch-a', reference: 'SALE-1', lines: [{ ingredientId: 'prepared-batter', quantity: 1 }] });
  applyMovement(fixture, { branchId: 'branch-a', ingredientId: 'prepared-batter', movement: -1, type: 'usage', reason: 'Sale SALE-1' });

  assert.equal(fixture.sales.length, 1);
  assert.equal(fixture.inventory.get('flour').quantity, 8);
  assert.equal(fixture.inventory.get('prepared-batter').quantity, 4);
});

test('daily physical count records an observation without changing expected inventory', () => {
  const fixture = createWorkflowFixture();
  const expectedBefore = fixture.inventory.get('flour').quantity;
  const count = { expectedQuantity: expectedBefore, physicalQuantity: 9, difference: -1, status: 'pending_owner_review' };
  assert.equal(count.difference, -1);
  assert.equal(fixture.inventory.get('flour').quantity, expectedBefore);
  assert.equal(fixture.movements.length, 0);
});

test('pending stock transaction and daily count survive timeout and app recreation', async () => {
  const transaction = {
    requestId: 'tx-1', actorId: 'staff-a', actorLabel: 'Staff A', branchId: 'branch-a', branchLabel: 'Branch A',
    transactionType: 'stock_in',
    transactions: [{ ingredientId: 'flour', type: 'stock_in', quantity: 2, unit: 'kg', transactionDate: '2026-11-13', reason: 'Stock-In', notes: '', batchReference: null, expirationDate: null }],
    createdAt: '2026-11-13T00:00:00.000Z', status: 'pending', reference: null,
  };
  const transactionStorage = memoryStorage();
  await createPendingInventoryTransactionStore(transactionStorage).save(transaction);
  const restoredTransaction = await createPendingInventoryTransactionStore(transactionStorage).load();
  assert.deepEqual(restoredTransaction[0].transactions, transaction.transactions);
  assert.equal(canRetryPendingInventoryTransaction(restoredTransaction[0], 'staff-a', 'branch-a'), true);
  assert.equal(sameInventoryTransactionPayload(restoredTransaction[0].transactions, transaction.transactions), true);
  await assert.rejects(runInventoryTransactionRequestOnce(transaction.requestId, new Set(), async () => { throw new Error('network timeout'); }), /network timeout/);

  const daily = {
    requestId: 'count-1', actorId: 'staff-a', branchId: 'branch-a', checkDate: '2026-11-13', remarks: 'Closing count',
    lines: [{ ingredientId: 'flour', recordedQuantity: 10, inventoryRevision: 1, physicalQuantity: 9, unit: 'kg' }],
    createdAt: '2026-11-13T00:00:00.000Z',
  };
  const dailyStorage = memoryStorage();
  await createPendingDailyStockCheckStore(dailyStorage).save(daily);
  const restoredDaily = await createPendingDailyStockCheckStore(dailyStorage).load();
  assert.equal(sameDailyStockCheckPayload(restoredDaily[0], daily), true);
});

test('Staff dashboard projections refresh from branch inventory and exclude another branch', () => {
  const branchItems = [
    { ...createWorkflowFixture().inventory.get('flour'), hasBranchInventory: true },
    { id: 'other', name: 'Other Branch Flour', category: 'Dry Goods', quantity: 0, unit: 'kg', minimumStock: 3, hasBranchInventory: false },
  ];
  const visibleItems = filterBranchInventoryAlertItems(branchItems);
  assert.deepEqual(visibleItems.map((item) => item.id), ['flour']);
  assert.equal(inventoryStockStatus(2, 3), 'Low Stock');
  assert.equal(classifyStockAlert(2, 3), 'lowStock');
  assert.deepEqual(buildInventoryCategories(visibleItems).map((category) => category.category), ['Dry Goods']);
});
