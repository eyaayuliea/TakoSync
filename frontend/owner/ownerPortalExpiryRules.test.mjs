import assert from 'node:assert/strict';
import test from 'node:test';
import { expiryRuleRows, expiryRuleSummary, expiryRuleWarning, parseItemAlertDays, parseShelfLifeDays } from './ownerPortalExpiryRules.ts';

const categories = [{ id: 'dairy-eggs', name: 'Dairy & eggs' }, { id: 'dry-goods', name: 'Dry goods' }];
const ingredients = [
  { id: 'salt', name: 'Salt', category_id: 'dry-goods', shelf_life_days: null, near_expiration_days: null },
  { id: 'eggs', name: 'Eggs', category_id: 'dairy-eggs', shelf_life_days: 28, near_expiration_days: 14 },
  { id: 'flour', name: 'All-purpose flour', category_id: 'dry-goods', shelf_life_days: 180 },
];

test('one row per item with its shelf life and window, sorted by name, searchable', () => {
  assert.deepEqual(expiryRuleRows({ ingredients, categories, query: '' }).map((row) => [row.name, row.category, row.shelfLifeDays, row.nearExpirationDays]), [
    ['All-purpose flour', 'Dry goods', 180, null],
    ['Eggs', 'Dairy & eggs', 28, 14],
    ['Salt', 'Dry goods', null, null],
  ]);
  assert.deepEqual(expiryRuleRows({ ingredients, categories, query: 'egg' }).map((row) => row.ingredientId), ['eggs']);
});

test('shelf life: blank means never expires; otherwise whole days from 1 to 3650', () => {
  assert.deepEqual(parseShelfLifeDays('  ', 'Salt'), { value: null });
  assert.deepEqual(parseShelfLifeDays('28', 'Eggs'), { value: 28 });
  for (const bad of ['0', '-3', '2.5', 'abc', '4000']) assert.ok('error' in parseShelfLifeDays(bad, 'Eggs'), bad);
  assert.match(parseShelfLifeDays('0', 'Eggs').error, /shelf life of Eggs/);
});

test('window: blank uses the general period; 0 is allowed (same-day alert)', () => {
  assert.deepEqual(parseItemAlertDays('', 'Eggs'), { value: null });
  assert.deepEqual(parseItemAlertDays('0', 'Prepared Takoyaki Batter'), { value: 0 });
  assert.deepEqual(parseItemAlertDays('30', 'Baking powder'), { value: 30 });
  for (const bad of ['-1', '1.5', 'x', '366']) assert.ok('error' in parseItemAlertDays(bad, 'Eggs'), bad);
});

test('a window as long as the shelf life is flagged', () => {
  assert.equal(expiryRuleWarning(5, 2), null);
  assert.match(expiryRuleWarning(5, 7), /on arrival/);
  assert.equal(expiryRuleWarning(null, 7), null);
  assert.equal(expiryRuleWarning(5, null), null);
});

test('the rule reads in words', () => {
  assert.equal(expiryRuleSummary({ shelfLifeDays: null, nearExpirationDays: null }, 3), 'Never expires · not date-tracked');
  assert.equal(expiryRuleSummary({ shelfLifeDays: 28, nearExpirationDays: 14 }, 3), 'Keeps 28 days · alert 14 days before');
  assert.equal(expiryRuleSummary({ shelfLifeDays: 1, nearExpirationDays: 0 }, 3), 'Keeps 1 day · alert on the day it is due');
  assert.equal(expiryRuleSummary({ shelfLifeDays: 180, nearExpirationDays: null }, 3), 'Keeps 180 days · alert 3 days before (general period)');
});
