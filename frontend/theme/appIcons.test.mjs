import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { APP_ICONS, ingredientCategoryIcon, stockAlertIcon } from './appIcons.ts';

const glyphs = JSON.parse(readFileSync(new URL('../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json', import.meta.url), 'utf8'));

test('every app icon exists in the Ionicons set', () => {
  const missing = Object.entries(APP_ICONS).filter(([, name]) => !(name in glyphs)).map(([key, name]) => `${key}=${name}`);
  assert.deepEqual(missing, []);
});

test('each meaning has its own icon (no two meanings share one)', () => {
  const names = Object.values(APP_ICONS);
  assert.equal(new Set(names).size, names.length);
});

test('the four stock alert categories have four different icons', () => {
  const icons = ['lowStock', 'outOfStock', 'nearExpiration', 'expired'].map((kind) => APP_ICONS[stockAlertIcon(kind)]);
  assert.equal(new Set(icons).size, 4);
});

test('ingredients show their category icon; unknown categories get a generic one', () => {
  assert.equal(ingredientCategoryIcon('seafood'), 'categorySeafood');
  assert.equal(ingredientCategoryIcon('dairy-eggs'), 'categoryDairy');
  assert.equal(ingredientCategoryIcon('produce'), 'categoryVegetables');
  assert.equal(ingredientCategoryIcon('prepared'), 'categoryPrepared');
  assert.equal(ingredientCategoryIcon('something-new'), 'categoryOther');
  assert.equal(ingredientCategoryIcon(null), 'categoryOther');
});
