import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isVariantOutOfStock,
  lowStockWarningMessage,
  orderLowStockWarnings,
  orderStockShortage,
  parseSaleStockSnapshot,
  stockShortageMessage,
  withLineQuantity,
} from './saleStock.ts';

const snapshot = parseSaleStockSnapshot({
  requirements: [
    { variant_id: 'v4', ingredient_id: 'prepared-batter', ingredient_name: 'Prepared Takoyaki Batter', unit: 'bottle', per_unit: 0.16 },
    { variant_id: 'v8', ingredient_id: 'prepared-batter', ingredient_name: 'Prepared Takoyaki Batter', unit: 'bottle', per_unit: 0.32 },
    { variant_id: 'v8', ingredient_id: 'octobits', ingredient_name: 'Octobits', unit: 'g', per_unit: 40 },
    { variant_id: 'bad', ingredient_id: 'x', per_unit: 0 },
  ],
  stock: { 'prepared-batter': '0.5', octobits: 100 },
});

test('parses the RPC body and skips unusable rows', () => {
  assert.equal(snapshot.requirements.length, 3);
  assert.equal(snapshot.stock['prepared-batter'], 0.5);
  assert.equal(parseSaleStockSnapshot(null), null);
  assert.equal(parseSaleStockSnapshot({ requirements: 'x', stock: {} }), null);
});

test('ST-02 c6: shared ingredients are checked across the whole order', () => {
  assert.equal(orderStockShortage([{ productId: 'v4', quantity: 3 }], snapshot), null); // 0.48 of 0.5
  // 0.16 + 0.32 = 0.48 bottle of the shared batter fits in 0.5.
  assert.equal(orderStockShortage([{ productId: 'v4', quantity: 1 }, { productId: 'v8', quantity: 1 }], snapshot), null);
  // One more 4-piece makes 0.64 > 0.5.
  assert.equal(orderStockShortage([{ productId: 'v4', quantity: 2 }, { productId: 'v8', quantity: 1 }], snapshot)?.ingredientId,
    'prepared-batter');
});

test('a combined order over the stock is reported with the ingredient', () => {
  const shortage = orderStockShortage([{ productId: 'v4', quantity: 2 }, { productId: 'v8', quantity: 1 }], snapshot);
  assert.deepEqual(
    shortage && { id: shortage.ingredientId, required: Math.round(shortage.required * 100) / 100, available: shortage.available },
    { id: 'prepared-batter', required: 0.64, available: 0.5 },
  );
  assert.equal(stockShortageMessage('Octobits Takoyaki · 4 PCS', shortage),
    'Octobits Takoyaki · 4 PCS: not enough Prepared Takoyaki Batter in stock (needs 0.64 bottle, 0.5 bottle available).');
});

test('ST-02 c6: a variant the stock cannot make even once is Out of Stock', () => {
  const empty = { ...snapshot, stock: { 'prepared-batter': 0.2, octobits: 10 } };
  assert.equal(isVariantOutOfStock('v4', empty), false);
  assert.equal(isVariantOutOfStock('v8', empty), true);
  assert.equal(isVariantOutOfStock('no-recipe', empty), false, 'a product with no recipe is never blocked');
  assert.equal(isVariantOutOfStock('v8', null), false, 'without stock data the server check still applies');
});

test('withLineQuantity replaces one line', () => {
  assert.deepEqual(withLineQuantity([{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 2 }], 'a', 3),
    [{ productId: 'b', quantity: 2 }, { productId: 'a', quantity: 3 }]);
  assert.deepEqual(withLineQuantity([{ productId: 'a', quantity: 1 }], 'a', 0), []);
});

// Low-stock alert while adding orders (owner list of 2026-11-24).
const roomy = parseSaleStockSnapshot({
  requirements: [
    { variant_id: 'v4', ingredient_id: 'prepared-batter', ingredient_name: 'Prepared Takoyaki Batter', unit: 'bottle', per_unit: 0.16 },
    { variant_id: 'v8', ingredient_id: 'prepared-batter', ingredient_name: 'Prepared Takoyaki Batter', unit: 'bottle', per_unit: 0.32 },
    { variant_id: 'v8', ingredient_id: 'octobits', ingredient_name: 'Octobits', unit: 'pcs', per_unit: 8 },
  ],
  stock: { 'prepared-batter': 5.4, octobits: 100 },
});
const minimums = { 'prepared-batter': 5, octobits: 20 };

test('no warning while the order leaves every ingredient above its minimum', () => {
  assert.deepEqual(orderLowStockWarnings([{ productId: 'v4', quantity: 2 }], roomy, minimums), []); // 5.08 left > 5
  assert.deepEqual(orderLowStockWarnings([], roomy, minimums), []);
  assert.deepEqual(orderLowStockWarnings([{ productId: 'v4', quantity: 2 }], null, minimums), []);
});

test('warns when the order would leave an ingredient at or below its minimum', () => {
  const warnings = orderLowStockWarnings([{ productId: 'v4', quantity: 1 }, { productId: 'v8', quantity: 1 }], roomy, minimums);
  assert.deepEqual(warnings, [{ ingredientId: 'prepared-batter', ingredientName: 'Prepared Takoyaki Batter', unit: 'bottle', remaining: 4.92, minimum: 5 }]);
  assert.equal(lowStockWarningMessage(warnings[0]), 'Low stock: Prepared Takoyaki Batter will be at 4.92 bottle after this order (minimum 5 bottle).');
});

test('an ingredient already low before the order is still reported; one that runs out says so', () => {
  const low = { ...roomy, stock: { 'prepared-batter': 0.32, octobits: 100 } };
  const [warning] = orderLowStockWarnings([{ productId: 'v8', quantity: 1 }], low, minimums);
  assert.equal(warning.remaining, 0);
  assert.equal(lowStockWarningMessage(warning), 'Low stock: this order uses the last Prepared Takoyaki Batter (minimum 5 bottle).');
});

test('ingredients without a minimum level, or not used by the order, never warn', () => {
  assert.deepEqual(orderLowStockWarnings([{ productId: 'v8', quantity: 12 }], roomy, { octobits: 0 }), []);
  assert.deepEqual(orderLowStockWarnings([{ productId: 'v4', quantity: 3 }], roomy, { octobits: 500 }), []);
});

test('an order the stock cannot make is a shortage, not a low-stock warning', () => {
  const short = { ...roomy, stock: { 'prepared-batter': 0.1, octobits: 100 } };
  assert.deepEqual(orderLowStockWarnings([{ productId: 'v4', quantity: 1 }], short, minimums), []);
});
