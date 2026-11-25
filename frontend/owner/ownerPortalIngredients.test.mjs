import assert from 'node:assert/strict';
import test from 'node:test';
import { baseUnitOf, ingredientFormErrors, ingredientTableRows, recipeTableRows, UNITS_BY_BASE } from './ownerPortalIngredients.ts';

const form = { id: null, name: 'Nori', categoryId: 'c1', baseUnit: 'g', unit: 'kg', purchaseLabel: 'One pack', purchaseQuantity: '0.5' };
const existing = [{ id: 'flour', name: 'All-purpose flour' }, { id: 'eggs', name: 'Eggs' }];

test('OW-22 c1, c2: base units are g, ml and pcs with their units of measurement', () => {
  assert.equal(baseUnitOf('kg'), 'g');
  assert.equal(baseUnitOf('tbsp'), 'ml');
  assert.equal(baseUnitOf('bottle'), 'pcs');
  assert.equal(baseUnitOf('unknown'), null);
  assert.deepEqual(UNITS_BY_BASE.ml, ['ml', 'L', 'tsp', 'tbsp']);
});

test('OW-22 c3: required fields, duplicate names and the conversion factor', () => {
  assert.deepEqual(ingredientFormErrors(form, existing), []);
  assert.deepEqual(ingredientFormErrors({ ...form, name: ' ', categoryId: '', baseUnit: '', purchaseLabel: '', purchaseQuantity: '' }, existing), [
    'Enter the ingredient name.', 'Choose a category.', 'Choose a base unit (g, ml or pcs).',
  ]);
  assert.deepEqual(ingredientFormErrors({ ...form, name: 'eggs' }, existing), ['An ingredient named “eggs” already exists.']);
  assert.deepEqual(ingredientFormErrors({ ...form, id: 'eggs', name: 'Eggs' }, existing), []);
  assert.deepEqual(ingredientFormErrors({ ...form, unit: 'L' }, existing), ['Choose a unit of measurement for this base unit.']);
  assert.deepEqual(ingredientFormErrors({ ...form, purchaseQuantity: '0' }, existing), ['The conversion factor must be greater than zero.']);
  assert.deepEqual(ingredientFormErrors({ ...form, purchaseLabel: '' }, existing), ['Enter the purchase unit name, e.g. One bottle.']);
  assert.deepEqual(ingredientFormErrors({ ...form, purchaseLabel: '', purchaseQuantity: '' }, existing), []);
});

test('OW-22 c1: the ingredient table with search and category filter', () => {
  const ingredients = [
    { id: 'flour', name: 'All-purpose flour', category_id: 'dry', unit: 'kg', active: true },
    { id: 'sauces', name: 'Takoyaki sauce', category_id: 'cond', unit: 'L', active: true },
    { id: 'old', name: 'Old', category_id: 'dry', unit: 'kg', active: false },
  ];
  const categories = [{ id: 'dry', name: 'Dry Goods' }, { id: 'cond', name: 'Condiments' }];
  const packs = [{ ingredient_id: 'sauces', package_quantity: 360, package_unit: 'ml', package_label: 'One bottle' }];
  assert.deepEqual(ingredientTableRows(ingredients, categories, packs, { query: '', categoryId: null }).rows, [
    ['All-purpose flour', 'Dry Goods', 'g', 'kg', '—'],
    ['Takoyaki sauce', 'Condiments', 'ml', 'L', 'One bottle = 360 ml'],
  ]);
  assert.deepEqual(ingredientTableRows(ingredients, categories, packs, { query: 'SAUCE', categoryId: null }).rows.map((r) => r[0]), ['Takoyaki sauce']);
  assert.deepEqual(ingredientTableRows(ingredients, categories, packs, { query: '', categoryId: 'dry' }).rows.map((r) => r[0]), ['All-purpose flour']);
});

test('OW-22 c4, c6, c8: recipes per product, batter through the shared recipe, Recipe required otherwise', () => {
  const products = [{ id: 'p1', product_name: 'Octobits Takoyaki' }, { id: 'p2', product_name: 'Drink' }, { id: 'p3', product_name: 'Fries' }];
  const recipes = [
    { product_id: 'p1', ingredient_id: 'octobits', quantity_required: 4, unit_of_measure: 'pcs' },
    { product_id: 'p1', ingredient_id: 'prepared-batter', quantity_required: 1, unit_of_measure: 'bottle' },
    { product_id: 'p3', ingredient_id: 'oil', quantity_required: 0.05, unit_of_measure: 'L' },
  ];
  const shared = [{ name: 'Shared Takoyaki Batter', active: true, prepared_quantity: 5, prepared_unit: 'bottle', estimated_yield_pieces: 125, productIds: ['p1'] }];
  const table = recipeTableRows(products, recipes, shared, (id) => ({ octobits: 'Octobits', oil: 'Cooking oil' })[id] ?? id);
  assert.deepEqual(table.rows, [
    ['Octobits Takoyaki', 'Prepared batter: 0.04 bottle per piece (Shared Takoyaki Batter)\nOctobits: 4 pcs', 'Configured'],
    ['Drink', '—', 'Recipe required'],
    ['Fries', 'Cooking oil: 0.05 L', 'Configured'],
  ]);
  assert.deepEqual(table.recipeRequired, ['p2']);
});

test('a recipe line says whether its amount is per piece or per order', () => {
  const products = [{ id: 'p1', product_name: 'Crab Takoyaki' }];
  const recipes = [
    { product_id: 'p1', ingredient_id: 'crab', quantity_required: 5, unit_of_measure: 'g', consumption_basis: 'per_piece' },
    { product_id: 'p1', ingredient_id: 'sauce', quantity_required: 15, unit_of_measure: 'ml', consumption_basis: 'per_order' },
  ];
  const table = recipeTableRows(products, recipes, [], (id) => ({ crab: 'Crab stick', sauce: 'Takoyaki sauce' })[id] ?? id);
  assert.deepEqual(table.rows, [['Crab Takoyaki', 'Crab stick: 5 g per piece\nTakoyaki sauce: 15 ml per order', 'Configured']]);
});
