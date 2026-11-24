import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The approved ingredient catalog (owner message pt29u): exact names, exact categories.
const REQUIRED = {
  'Dry Goods': ['All-purpose flour', 'Salt', 'Baking powder', 'Bonito flakes'],
  Seafood: ['Octopus', 'Crab stick'],
  Dairy: ['Eggs', 'Cheese'],
  Condiments: ['Dashi stock', 'Soy sauce', 'Takoyaki sauce', 'Japanese mayonnaise'],
  Meat: ['Bacon'],
  Vegetables: ['Chopped cabbage'],
  Supplies: ['Packaging'],
};
const CATEGORY_IDS = {
  'dry-goods': 'Dry Goods', seafood: 'Seafood', 'dairy-eggs': 'Dairy',
  condiments: 'Condiments', meat: 'Meat', produce: 'Vegetables', supplies: 'Supplies',
};

function ingredientRows(sql, startMarker, endMarker) {
  const start = sql.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const block = sql.slice(start, sql.indexOf(endMarker, start));
  return [...block.matchAll(/\(\s*'([a-z-]+)',\s*'?([a-z-]+)'?,\s*'([^']+)',\s*'([^']+)',\s*(\d)\s*\)/g)]
    .map(([, id, category, name, unit]) => ({ id, categoryId: category, category: CATEGORY_IDS[category], name, unit }));
}

function groupByCategory(rows) {
  const grouped = {};
  for (const row of rows) (grouped[row.category] ??= []).push(row.name);
  return grouped;
}

const sortValues = (value) => Object.fromEntries(Object.entries(value).map(([k, v]) => [k, [...v].sort()]));

// The team's inventory catalog of 2026-11-25 (migration 202611250001): Takoyaki picks is
// added, the seafood items get their own categories, and units are g / ml / pcs. Salt,
// baking powder, cheese and dashi keep their earlier units until the owner gives grams.
const CATALOG = {
  'Dry goods': ['All-purpose flour', 'Salt', 'Baking powder'],
  'Dried seafood': ['Bonito flakes'],
  'Frozen seafood': ['Octopus'],
  'Chilled seafood': ['Crab stick'],
  'Dairy & eggs': ['Eggs', 'Cheese'],
  'Sauces & oils': ['Dashi stock', 'Soy sauce', 'Takoyaki sauce', 'Japanese mayonnaise'],
  'Chilled meat': ['Bacon'],
  'Fresh produce': ['Chopped cabbage'],
  Supplies: ['Packaging', 'Takoyaki picks'],
};
const CATALOG_CATEGORY_IDS = {
  'dry-goods': 'Dry goods', 'dried-seafood': 'Dried seafood', 'frozen-seafood': 'Frozen seafood',
  'chilled-seafood': 'Chilled seafood', 'dairy-eggs': 'Dairy & eggs', condiments: 'Sauces & oils',
  meat: 'Chilled meat', produce: 'Fresh produce', supplies: 'Supplies',
};
const CATALOG_UNITS = {
  flour: 'g', octopus: 'g', 'bonito-flakes': 'g', 'bacon-bits': 'g', cabbage: 'g',
  sauces: 'ml', 'japanese-mayonnaise': 'ml', 'soy-sauce': 'ml',
  'crab-sticks': 'pcs', eggs: 'pcs', packaging: 'pcs', 'takoyaki-picks': 'pcs',
  // waiting for the owner's amounts in grams
  salt: 'tsp', 'baking-powder': 'tsp', 'cheese-cubes': 'pcs', dashi: 'L',
};

test('seed.sql seeds exactly the inventory catalog, in the catalog units', () => {
  const seed = readFileSync(new URL('../../backend/supabase/seed.sql', import.meta.url), 'utf8');
  const rows = ingredientRows(seed, 'insert into public.ingredients', 'on conflict')
    .map((row) => ({ ...row, category: CATALOG_CATEGORY_IDS[row.categoryId] }));
  assert.equal(rows.length, 16);
  assert.equal(new Set(rows.map((row) => row.id)).size, 16, 'no duplicate ids');
  assert.equal(new Set(rows.map((row) => row.name)).size, 16, 'no duplicate names');
  assert.deepEqual(sortValues(groupByCategory(rows)), sortValues(CATALOG));
  assert.deepEqual(Object.fromEntries(rows.map((row) => [row.id, row.unit])), CATALOG_UNITS);
});

test('the catalog migration converts units through one recorded ledger entry and loads the sheet values', () => {
  const sql = readFileSync(
    new URL('../../backend/supabase/migrations/202611250001_inventory_catalog.sql', import.meta.url),
    'utf8',
  );
  const changes = [...sql.matchAll(/select private\.change_ingredient_unit\('([a-z-]+)', '(\w+)', '(\w+)', (\d+)\);/g)]
    .map(([, id, from, to, factor]) => `${id}:${from}>${to}x${factor}`);
  assert.deepEqual(changes, [
    'flour:kg>gx1000', 'octopus:kg>gx1000', 'sauces:L>mlx1000', 'japanese-mayonnaise:L>mlx1000', 'soy-sauce:tbsp>mlx15', 'packaging:pack>pcsx100',
  ]);
  assert.match(sql, /no stock was added or removed/);
  // History is not rewritten: the ledger and decided counts are never updated or deleted.
  assert.doesNotMatch(sql, /update public\.inventory_movements|delete from public\.inventory_movements/i);
  assert.match(sql, /not exists \(select 1 from public\.inventory_count_validations/);
  // Thresholds from the sheet, per branch, in the catalog units.
  for (const row of ["('flour', 'g', 2000)", "('eggs', 'pcs', 30)", "('prepared-batter', 'bottle', 5)", "('takoyaki-picks', 'pcs', 200)"]) {
    assert.ok(sql.includes(row), `missing threshold ${row}`);
  }
});

test('the catalog migration enforces the same names and categories and never deletes rows', () => {
  const sql = readFileSync(
    new URL('../../backend/supabase/migrations/202611200003_required_ingredient_catalog.sql', import.meta.url),
    'utf8',
  );
  const tupleRows = [...sql.matchAll(/\('([a-z-]+)',\s+'([^']+)',\s+'([a-z-]+)',\s+'([^']+)',\s+(\d)\)/g)]
    .map(([, id, name, category, unit]) => ({ id, name, category: CATEGORY_IDS[category], unit }));
  assert.equal(tupleRows.length, 15);
  assert.deepEqual(sortValues(groupByCategory(tupleRows)), sortValues(REQUIRED));
  assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
  assert.doesNotMatch(sql, /\bquantity_(?:per_|required)/i);
  assert.match(sql, /not exists \(select 1 from public\.recipes/);
  assert.match(sql, /not exists \(select 1 from public\.shared_recipe_ingredients/);
  assert.match(sql, /not exists \(select 1 from public\.shared_recipe_version_ingredients/);
});
