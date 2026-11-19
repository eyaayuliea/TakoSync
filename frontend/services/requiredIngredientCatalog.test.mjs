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
    .map(([, id, category, name, unit]) => ({ id, category: CATEGORY_IDS[category], name, unit }));
}

function groupByCategory(rows) {
  const grouped = {};
  for (const row of rows) (grouped[row.category] ??= []).push(row.name);
  return grouped;
}

const sortValues = (value) => Object.fromEntries(Object.entries(value).map(([k, v]) => [k, [...v].sort()]));

test('seed.sql seeds exactly the approved ingredient catalog', () => {
  const seed = readFileSync(new URL('../../backend/supabase/seed.sql', import.meta.url), 'utf8');
  const rows = ingredientRows(seed, 'insert into public.ingredients', 'on conflict');
  assert.equal(rows.length, 15);
  assert.equal(new Set(rows.map((row) => row.id)).size, 15, 'no duplicate ids');
  assert.equal(new Set(rows.map((row) => row.name)).size, 15, 'no duplicate names');
  assert.deepEqual(sortValues(groupByCategory(rows)), sortValues(REQUIRED));
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
