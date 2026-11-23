import assert from 'node:assert/strict';
import test from 'node:test';
import { extraFlavorTabs } from './menuFlavorOptions.ts';

const known = ['Octobits Takoyaki', 'Octobits / Cheese', 'Cheese Takoyaki'];

test('OW-21 c7: a product the owner adds gets a POS flavor tab; the designed flavors are not repeated', () => {
  const catalog = [
    { name: 'Octobits Takoyaki', flavor: 'Octobits', portionType: 'Regular' },
    { name: 'Walk Test Takoyaki', flavor: 'Walk Test', portionType: 'Regular' },
    { name: 'Walk Test Takoyaki', flavor: 'Walk Test', portionType: 'Regular' }, // another size
    { name: 'Walk Test / Cheese', flavor: 'Walk Test', portionType: 'Combo + Cheese' },
    { name: 'Ube Special', flavor: null, portionType: null },
  ];
  assert.deepEqual(extraFlavorTabs(catalog, known), [
    { id: 'extra:ube special', label: 'Ube Special', productName: 'Ube Special' },
    { id: 'extra:walk test', label: 'Walk Test', productName: 'Walk Test Takoyaki', comboName: 'Walk Test / Cheese' },
  ]);
});

test('a flavor with only a combo product shows that product', () => {
  assert.deepEqual(extraFlavorTabs([{ name: 'Mango / Cheese', flavor: 'Mango', portionType: 'Combo + Cheese' }], known), [
    { id: 'extra:mango', label: 'Mango', productName: 'Mango / Cheese' },
  ]);
  assert.deepEqual(extraFlavorTabs([{ name: 'Cheese Takoyaki', flavor: 'Cheese' }], known), []);
});
