import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeStaffTab,
  STAFF_NAVIGATION_TOUCH_TARGET,
  staffDestinations,
} from './staffNavigation.ts';

test('Staff bottom navigation has the required routes and exact labels in order', () => {
  assert.deepEqual(
    staffDestinations.map(({ route, label }) => [route, label]),
    [
      ['menu', 'POS'],
      ['inventory', 'INVENTORY'],
      ['stocks', 'STOCKS'],
      ['alerts', 'ALERTS'],
      ['more', 'MORE'],
    ],
  );
});

test('Staff navigation keeps the active tab selected for nested routes', () => {
  assert.equal(activeStaffTab('menu'), 'menu');
  assert.equal(activeStaffTab('checkout'), 'menu');
  assert.equal(activeStaffTab('ingredientDetails'), 'inventory');
  assert.equal(activeStaffTab('inventoryReporting'), 'inventory');
  assert.equal(activeStaffTab('inventoryReport'), 'inventory');
  assert.equal(activeStaffTab('inventoryCountDetails'), 'inventory');
  assert.equal(activeStaffTab('inventoryDiscrepancySubmission'), 'inventory');
  assert.equal(activeStaffTab('dailyInventoryCheck'), 'inventory');
  assert.equal(activeStaffTab('dailyCheckSuccess'), 'inventory');
  assert.equal(activeStaffTab('stockIn'), 'stocks');
  assert.equal(activeStaffTab('alertDetails'), 'alerts');
  assert.equal(activeStaffTab('profileSettings'), 'more');
});

test('Staff navigation touch targets meet the 48 px minimum', () => {
  assert.ok(STAFF_NAVIGATION_TOUCH_TARGET >= 48);
});
