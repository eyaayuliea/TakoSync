import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_REPLENISHMENT_SETTINGS,
  classifyReplenishment,
  computeReorderPoint,
  lowStockThreshold,
  reorderPointSourceLabel,
  serviceLevelLabel,
  validateReplenishmentSettings,
} from './reorderPoint.ts';

// Flour in grams, 14 operating days alternating 1,000 g and 1,500 g (mean 1,250 g).
const FLOUR_USAGE = Array.from({ length: 14 }, (_, index) => (index % 2 === 0 ? 1000 : 1500));

test('AC-ROP-05-01: ROP = d̄ × L + z × σ × √L (the spec flour example, sample σ)', () => {
  const result = computeReorderPoint({
    dailyUsage: FLOUR_USAGE,
    ownerMinimum: 2000,
    settings: { leadTimeDays: 2, serviceLevelZ: 1.645 },
  });
  const sigma = 250 * Math.sqrt(14 / 13);
  assert.equal(result.method, 'DYNAMIC_ROP');
  assert.equal(result.averageDailyUsage, 1250);
  assert.ok(Math.abs(result.usageStddev - sigma) < 1e-9);
  assert.equal(result.safetyStock, Math.round(1.645 * sigma * Math.SQRT2 * 1000) / 1000);
  assert.equal(result.effectiveRop, Math.round((2500 + 1.645 * sigma * Math.SQRT2) * 1000) / 1000);
  assert.equal(result.thresholdSource, 'DYNAMIC_ROP');
  // With the spec's rounded σ = 250 g the same formula gives its 3,082 g.
  assert.equal(Math.round(1250 * 2 + 1.645 * 250 * Math.SQRT2), 3082);
});

test('the window keeps only the newest W operating days', () => {
  const result = computeReorderPoint({
    dailyUsage: [...FLOUR_USAGE, 50_000, 50_000],
    ownerMinimum: 0,
    settings: { leadTimeDays: 2 },
  });
  assert.equal(result.operatingDaysUsed, 14);
  assert.equal(result.averageDailyUsage, 1250);
});

test('AC-ROP-05-03: under N_min operating days the owner minimum is used', () => {
  const result = computeReorderPoint({ dailyUsage: [5000, 5000, 5000], ownerMinimum: 800, settings: {} });
  assert.deepEqual(
    [result.method, result.methodReason, result.effectiveRop, result.operatingDaysUsed],
    ['OWNER_MINIMUM', 'COLD_START', 800, 3],
  );
  assert.equal(reorderPointSourceLabel(result), 'Owner minimum (3 days of sales so far)');
});

test('the owner minimum is a floor, and in-house or unconfigured items keep it', () => {
  const low = computeReorderPoint({ dailyUsage: Array(14).fill(10), ownerMinimum: 500, settings: {} });
  assert.equal(low.effectiveRop, 500);
  assert.equal(low.thresholdSource, 'OWNER_MINIMUM');
  assert.equal(reorderPointSourceLabel(low), 'Owner minimum (higher than the reorder point)');
  assert.equal(computeReorderPoint({ dailyUsage: FLOUR_USAGE, ownerMinimum: 4, inHouseItem: true }).methodReason, 'IN_HOUSE_ITEM');
  assert.equal(computeReorderPoint({ dailyUsage: FLOUR_USAGE, ownerMinimum: 4, settings: null }).methodReason, 'NOT_CONFIGURED');
});

test('AC-ROP-05-07: shelf life caps the reorder point and flags shelf life < lead time', () => {
  const result = computeReorderPoint({
    dailyUsage: FLOUR_USAGE,
    ownerMinimum: 0,
    settings: { leadTimeDays: 2, shelfLifeDays: 1 },
  });
  assert.equal(result.reorderPoint, 1250);
  assert.equal(result.configInconsistent, true);
  assert.ok(result.safetyStock <= result.reorderPoint);
  assert.ok(result.reorderPoint >= 0);
});

test('AC-ROP-05-04: LOW_STOCK at or below ROP, CRITICAL at or below safety stock or zero', () => {
  const point = { effectiveRop: 3104, safetyStock: 604 };
  assert.equal(classifyReplenishment(3105, point), null);
  assert.equal(classifyReplenishment(2900, point), 'LOW_STOCK');
  assert.equal(classifyReplenishment(604, point), 'CRITICAL');
  assert.equal(classifyReplenishment(0, { effectiveRop: 0 }), 'CRITICAL');
  assert.equal(classifyReplenishment(1, { effectiveRop: 0 }), null);
});

test('apps use the stored reorder point, never below the owner minimum', () => {
  assert.equal(lowStockThreshold({ minimum_stock: 2, low_stock_threshold: 3.104 }), 3.104);
  assert.equal(lowStockThreshold({ minimum_stock: '2', low_stock_threshold: null }), 2);
  assert.equal(lowStockThreshold({ minimum_stock: 5, low_stock_threshold: 3 }), 5);
});

test('AC-ROP-05-02: owner inputs are validated', () => {
  assert.equal(validateReplenishmentSettings(DEFAULT_REPLENISHMENT_SETTINGS), null);
  assert.match(validateReplenishmentSettings({ ...DEFAULT_REPLENISHMENT_SETTINGS, leadTimeDays: 0 }), /Lead time/);
  assert.match(validateReplenishmentSettings({ ...DEFAULT_REPLENISHMENT_SETTINGS, minHistoryDays: 20 }), /Minimum history/);
  assert.match(validateReplenishmentSettings({ ...DEFAULT_REPLENISHMENT_SETTINGS, shelfLifeDays: -1 }), /Shelf life/);
  assert.equal(serviceLevelLabel(1.645), '95%');
  assert.equal(serviceLevelLabel(2.326), '99%');
});
