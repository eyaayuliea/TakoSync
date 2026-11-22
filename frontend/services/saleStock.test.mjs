import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isVariantOutOfStock,
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
