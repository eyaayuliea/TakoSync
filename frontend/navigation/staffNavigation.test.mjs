import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeStaffTab,
  isMoreFlowRoute,
  STAFF_NAVIGATION_TOUCH_TARGET,
  staffDestinations,
  staffReturnTab,
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

const moreFlowRoutes = [
  'dailySales',
  'profileSettings',
  'dailyInventoryOverview',
  'dailyInventoryCheck',
  'inventoryDiscrepancySubmission',
  'dailyCheckSuccess',
  'inventoryReporting',
  'inventoryReport',
  'inventoryCountDetails',
  'stockHistory',
  'historyFilters',
  'transactionDetails',
];

test('screens opened from More keep the More tab highlighted on every route of the flow', () => {
  for (const route of moreFlowRoutes) {
    assert.equal(isMoreFlowRoute(route), true, route);
    assert.equal(activeStaffTab(route, 'more'), 'more', route);
  }
});

test('the same screens keep their own tab when not opened from More', () => {
  assert.equal(activeStaffTab('stockHistory'), 'stocks');
  assert.equal(activeStaffTab('historyFilters'), 'stocks');
  assert.equal(activeStaffTab('transactionDetails'), 'stocks');
  assert.equal(activeStaffTab('stockHistory', null), 'stocks');
  assert.equal(activeStaffTab('dailyInventoryOverview'), 'inventory');
  assert.equal(activeStaffTab('dailyInventoryCheck', null), 'inventory');
  assert.equal(activeStaffTab('inventoryDiscrepancySubmission'), 'inventory');
  assert.equal(activeStaffTab('dailyCheckSuccess'), 'inventory');
  // Daily Sales and Profile & Settings only exist under More.
  assert.equal(activeStaffTab('dailySales'), 'more');
  assert.equal(activeStaffTab('profileSettings'), 'more');
});

test('the More origin never changes routes that are not part of a More flow', () => {
  for (const route of ['menu', 'checkout', 'stockIn', 'waste', 'ingredientDetails', 'alertDetails', 'alerts', 'inventory', 'stocks']) {
    assert.equal(isMoreFlowRoute(route), false, route);
    assert.equal(activeStaffTab(route, 'more'), activeStaffTab(route), route);
  }
});

test('Back from a screen opened from More returns to More, otherwise to its own tab', () => {
  assert.equal(staffReturnTab('more', 'stocks'), 'more');
  assert.equal(staffReturnTab('more', 'inventory'), 'more');
  assert.equal(staffReturnTab(null, 'stocks'), 'stocks');
  assert.equal(staffReturnTab(null, 'inventory'), 'inventory');
});
