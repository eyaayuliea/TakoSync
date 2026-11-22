import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSalesConsumptionRecords,
  formatConsumptionQuantity,
  getForcedSalesConsumptionState,
} from './salesConsumptionRepository.ts';

const bundle = {
  movements: [
    { id: 'm2', reference: 'TX-BBB', branch_id: 'b2', ingredient_id: 'octopus', actor_id: 'u2', quantity: '80.000', unit: 'g', transaction_date: '2026-11-19T09:30:00Z', created_at: '2026-11-19T09:30:01Z', sale_id: 's2' },
    { id: 'm1', reference: 'TX-AAA', branch_id: 'b1', ingredient_id: 'batter', actor_id: 'u1', quantity: 0.32, unit: 'bottle', transaction_date: '2026-11-19T08:00:00Z', created_at: '2026-11-19T08:00:01Z', sale_id: 's1' },
  ],
  ingredients: [{ id: 'octopus', name: 'Octopus' }, { id: 'batter', name: 'Prepared Batter' }],
  branches: [{ id: 'b1', city: 'Manila', code: 'B1' }, { id: 'b2', city: 'Cebu', code: 'B2' }],
  profiles: [{ id: 'u1', full_name: 'Ana Reyes' }, { id: 'u2', full_name: null }],
  sales: [
    { id: 's1', transaction_reference: 'TXN-0001', status: 'completed', inventory_processing_status: 'completed' },
    { id: 's2', transaction_reference: 'TXN-0002', status: 'completed', inventory_processing_status: 'failed' },
  ],
  hasMore: false,
};

test('consumption records are built from the real movement, ingredient, branch and sale rows', () => {
  const [octopus, batter] = buildSalesConsumptionRecords(bundle);
  assert.equal(octopus.id, 'm2');
  assert.equal(octopus.recordReference, 'TX-BBB');
  assert.equal(octopus.ingredientName, 'Octopus');
  assert.equal(octopus.quantity, 80);
  assert.equal(octopus.unit, 'g');
  assert.equal(octopus.branchName, 'Cebu · Branch 2');
  assert.equal(octopus.recordedBy, 'Employee account');
  assert.equal(batter.recordedBy, 'Ana Reyes');
  assert.equal(batter.ingredientName, 'Prepared Batter');
  assert.equal(batter.createdAt, '2026-11-19T08:00:00Z');
});

test('the linked sale id is the real sales.id so Sales Transaction Records can open it', () => {
  const [octopus, batter] = buildSalesConsumptionRecords(bundle);
  assert.equal(batter.saleId, 's1');
  assert.equal(batter.saleReference, 'TXN-0001');
  assert.equal(octopus.saleId, 's2');
  assert.equal(octopus.saleReference, 'TXN-0002');
});

test('only a sale flagged as failed is marked for review', () => {
  const [octopus, batter] = buildSalesConsumptionRecords(bundle);
  assert.equal(octopus.updateFailed, true);
  assert.equal(batter.updateFailed, false);
});

test('no rows produce an empty list, not sample records', () => {
  assert.deepEqual(buildSalesConsumptionRecords({ ...bundle, movements: [] }), []);
});

test('rows without a sale are skipped and missing lookups degrade to labels', () => {
  const records = buildSalesConsumptionRecords({
    ...bundle,
    movements: [{ ...bundle.movements[0], sale_id: null }, { ...bundle.movements[1], ingredient_id: 'gone', branch_id: 'gone' }],
    sales: [],
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].ingredientName, 'Ingredient unavailable');
  assert.equal(records[0].branchName, 'Branch unavailable');
  assert.equal(records[0].saleReference, 'Sale unavailable');
  assert.equal(records[0].updateFailed, false);
});

test('quantities are formatted without float noise', () => {
  assert.equal(formatConsumptionQuantity(80, 'g'), '80');
  assert.equal(formatConsumptionQuantity(0.1 + 0.2, 'bottle'), '0.30');
  assert.equal(formatConsumptionQuantity(0.125, 'bottle'), '0.125');
  assert.equal(formatConsumptionQuantity(1, 'bottle'), '1.00');
  assert.equal(formatConsumptionQuantity(12.5, 'g'), '12.5');
});

test('design-preview states can force loading, empty and error but never inject records', () => {
  const original = process.env.EXPO_PUBLIC_FORCE_SALES_CONSUMPTION_STATE;
  try {
    for (const [value, expected] of [['empty', 'empty'], ['loading', 'loading'], ['error', 'error'], ['success', null], ['load_more', null]]) {
      process.env.EXPO_PUBLIC_FORCE_SALES_CONSUMPTION_STATE = value;
      assert.equal(getForcedSalesConsumptionState(), expected, value);
    }
  } finally {
    if (original === undefined) delete process.env.EXPO_PUBLIC_FORCE_SALES_CONSUMPTION_STATE;
    else process.env.EXPO_PUBLIC_FORCE_SALES_CONSUMPTION_STATE = original;
  }
});

test('OM-17 c3: the consumption of a voided sale carries its Void Reversal entry', () => {
  const voided = {
    ...bundle,
    sales: [
      { id: 's1', transaction_reference: 'TXN-0001', status: 'voided', inventory_processing_status: 'completed' },
      { id: 's2', transaction_reference: 'TXN-0002', status: 'completed', inventory_processing_status: 'completed' },
    ],
    voidReversals: [
      { id: 'v1', reference: 'TX-VOID', sale_id: 's1', ingredient_id: 'batter', quantity: '0.320', unit: 'bottle', transaction_date: '2026-11-19T08:30:00Z' },
    ],
  };
  const [octopus, batter] = buildSalesConsumptionRecords(voided);
  assert.equal(batter.saleVoided, true);
  assert.deepEqual(batter.voidReversal, { reference: 'TX-VOID', quantity: 0.32, unit: 'bottle', createdAt: '2026-11-19T08:30:00Z' });
  assert.equal(octopus.saleVoided, false);
  assert.equal(octopus.voidReversal, null);
  // A bundle from a database without void reversals leaves every record unmarked.
  assert.equal(buildSalesConsumptionRecords(bundle).every((record) => !record.saleVoided && record.voidReversal === null), true);
});
