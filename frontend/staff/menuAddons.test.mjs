import assert from 'node:assert/strict';
import test from 'node:test';
import {
  matchSupportedAddon,
  pruneSelectedAddonIds,
  resolveMenuAddons,
} from './menuAddons.ts';
import {
  calculateMenuCart,
  calculateSelectedAddonTotal,
  hitSlopForTarget,
} from './menuPreviewData.ts';

const addon = (id, name, price, isAvailable = true) => ({ id, name, price, isAvailable });

test('add-on names match case-insensitively and across spelling variants', () => {
  for (const name of ['Japanese Mayonnaise', 'japanese mayonnaise', ' JAPANESE  MAYO ', 'Japanese-Mayo', 'Japanese white sauce']) {
    assert.equal(matchSupportedAddon(name), 'japanese-mayonnaise', name);
  }
  assert.equal(matchSupportedAddon('Takoyaki sauce'), 'takoyaki-sauce');
  assert.equal(matchSupportedAddon('TAKOYAKI SAUCE'), 'takoyaki-sauce');
  assert.equal(matchSupportedAddon('Flakes'), 'flakes');
  assert.equal(matchSupportedAddon('Bonito flakes'), 'flakes');
  assert.equal(matchSupportedAddon('Extra cheese'), null);
  assert.equal(matchSupportedAddon('Japanese sauce of the day'), null);
});

test('resolved add-ons exclude inactive and unsupported rows and report the missing ones', () => {
  const resolved = resolveMenuAddons([
    addon('a', 'Flakes', 10),
    addon('b', 'Japanese Mayonnaise', 10, false),
    addon('c', 'Extra cheese', 20),
    addon('d', 'takoyaki sauce', 15),
  ]);
  assert.deepEqual(resolved.available.map((entry) => entry.id), ['d', 'a']);
  assert.deepEqual(resolved.missingLabels, ['Japanese Mayonnaise']);
});

test('the displayed list, checkout list and total use the same resolved add-ons', () => {
  const rows = [
    addon('mayo', 'Japanese Mayonnaise', 10),
    addon('sauce', 'Takoyaki sauce', 15),
    addon('flakes', 'Flakes', 10),
    addon('cheese', 'Extra cheese', 99),
  ];
  const { available } = resolveMenuAddons(rows);
  assert.deepEqual(available.map((entry) => entry.id), ['mayo', 'sauce', 'flakes']);
  // An unsupported row selected earlier is neither offered nor counted.
  const selected = pruneSelectedAddonIds(['mayo', 'sauce', 'cheese'], available);
  assert.deepEqual(selected, ['mayo', 'sauce']);
  assert.equal(calculateSelectedAddonTotal(available, selected), 25);
  assert.equal(calculateSelectedAddonTotal(available, ['mayo', 'sauce', 'flakes']), 35);
  assert.equal(calculateSelectedAddonTotal(available, []), 0);
});

test('removing a product updates the order total', () => {
  const products = [
    { id: 'p1', price: 89 },
    { id: 'p2', price: 129.5 },
  ];
  const cart = [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }];
  assert.deepEqual(calculateMenuCart(cart, products), { count: 3, total: 307.5 });
  const afterRemove = cart.filter((line) => line.productId !== 'p1');
  assert.deepEqual(calculateMenuCart(afterRemove, products), { count: 1, total: 129.5 });
  assert.deepEqual(calculateMenuCart([], products), { count: 0, total: 0 });
});

test('the remove (x) control reaches a 44 px touch target', () => {
  const slop = hitSlopForTarget(22, 23);
  assert.ok(22 + slop.left + slop.right >= 44);
  assert.ok(23 + slop.top + slop.bottom >= 44);
  assert.deepEqual(hitSlopForTarget(48, 48), { top: 0, bottom: 0, left: 0, right: 0 });
});

test('OW-21 c5: an add-on linked to products is offered only when one of them is in the cart', async () => {
  const { addonsForCart } = await import('./menuAddons.ts');
  const addons = [{ id: 'sauce', productIds: [] }, { id: 'cheese', productIds: ['p-combo'] }, { id: 'flakes' }];
  assert.deepEqual(addonsForCart(addons, ['p-regular']).map((addon) => addon.id), ['sauce', 'flakes']);
  assert.deepEqual(addonsForCart(addons, ['p-regular', 'p-combo']).map((addon) => addon.id), ['sauce', 'cheese', 'flakes']);
  assert.deepEqual(addonsForCart(addons, []).map((addon) => addon.id), ['sauce', 'flakes']);
});
