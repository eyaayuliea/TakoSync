import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { APP_ICONS } from './appIcons.ts';
import { INGREDIENT_ICON_FILES, OWNER_MENU_ICON_FILES, TEAM_ICON_FILES } from './teamIconFiles.ts';

const assets = new URL('../../assets/icons/', import.meta.url);
const loader = readFileSync(new URL('./appIconImages.ts', import.meta.url), 'utf8');

test('every team icon replaces a known app icon and its file is in assets/icons', () => {
  for (const [name, { dir, file }] of Object.entries(TEAM_ICON_FILES)) {
    assert.ok(name in APP_ICONS, `${name} is not an app icon`);
    assert.ok(existsSync(new URL(`${dir}/${file}.png`, assets)), `missing ${dir}/${file}.png`);
  }
});

test('every owner menu icon file is in assets/icons/owner', () => {
  for (const [name, file] of Object.entries(OWNER_MENU_ICON_FILES)) {
    assert.ok(existsSync(new URL(`owner/${file}.png`, assets)), `missing owner/${file}.png for ${name}`);
  }
});

test('every ingredient picture is in assets/icons/ingredients', () => {
  for (const [id, file] of Object.entries(INGREDIENT_ICON_FILES)) {
    assert.ok(existsSync(new URL(`ingredients/${file}.png`, assets)), `missing ingredients/${file}.png for ${id}`);
  }
});

test('the image loader lists exactly the same files', () => {
  for (const [name, { dir, file }] of Object.entries(TEAM_ICON_FILES)) {
    assert.ok(loader.includes(`${name}: require('../../assets/icons/${dir}/${file}.png')`), `loader is missing ${name}`);
  }
  for (const [name, file] of Object.entries(OWNER_MENU_ICON_FILES)) {
    assert.ok(loader.includes(`${name}: require('../../assets/icons/owner/${file}.png')`), `loader is missing owner menu icon ${name}`);
  }
  for (const [id, file] of Object.entries(INGREDIENT_ICON_FILES)) {
    const key = /^[a-zA-Z_]\w*$/.test(id) ? id : `'${id}'`;
    assert.ok(loader.includes(`${key}: require('../../assets/icons/ingredients/${file}.png')`), `loader is missing ${id}`);
  }
  const requires = loader.match(/require\(/g)?.length ?? 0;
  assert.equal(requires, Object.keys(TEAM_ICON_FILES).length + Object.keys(INGREDIENT_ICON_FILES).length + Object.keys(OWNER_MENU_ICON_FILES).length);
});

test('multi-colour icons are not tinted; the tab bar and menu icons are', () => {
  for (const name of ['error', 'info', 'noAlerts', 'noRecords', 'noInternet']) assert.equal(TEAM_ICON_FILES[name].tint, false);
  for (const name of ['pos', 'box', 'stock', 'bell', 'more', 'sales', 'history']) assert.equal(TEAM_ICON_FILES[name].tint, true);
});

test('all sixteen catalog ingredients and the prepared batter have a picture', () => {
  const ids = ['flour', 'salt', 'baking-powder', 'bonito-flakes', 'octopus', 'crab-sticks', 'eggs', 'cheese-cubes', 'dashi', 'soy-sauce',
    'sauces', 'japanese-mayonnaise', 'bacon-bits', 'cabbage', 'packaging', 'octobits', 'prepared-batter'];
  assert.deepEqual(ids.filter((id) => !(id in INGREDIENT_ICON_FILES)), []);
});

test('the owner tab bar and menus use the owner module drawings', () => {
  for (const name of ['ownerDashboard', 'ownerSales', 'ownerInventory', 'ownerSync', 'ownerBell', 'ownerMore']) {
    assert.deepEqual({ dir: TEAM_ICON_FILES[name].dir, tint: TEAM_ICON_FILES[name].tint }, { dir: 'owner', tint: true });
  }
  for (const name of ['receipt', 'profile', 'clipboardCheck', 'stockIn', 'droplet', 'cube', 'check', 'mapPin']) {
    assert.ok(name in OWNER_MENU_ICON_FILES, `${name} has no owner drawing`);
  }
});
