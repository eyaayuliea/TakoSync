import assert from 'node:assert/strict';
import test from 'node:test';
import {
  salesPerBranch,
  salesPerDay,
  salesPerWeek,
  summarizeAddons,
  summarizeProductVariants,
  totalOfSales,
  orderBranchesForSales,
} from './ownerSalesBreakdowns.ts';

const sale = (branch, amount, at) => ({ branch_id: branch, total_amount: amount, created_at: at });

const sales = [
  sale('b1', '100.10', '2026-11-23T02:00:00Z'), // Mon 23 Nov
  sale('b1', '50.20', '2026-11-23T15:30:00Z'), // 23 Nov 11:30 PM Manila
  sale('b2', '0.10', '2026-11-23T16:30:00Z'), // 24 Nov 12:30 AM Manila
  sale('b2', '0.20', '2026-11-25T03:00:00Z'), // Wed 25 Nov
  sale('b1', '999', '2026-10-31T03:00:00Z'), // 31 Oct, outside the week
];

test('the week lists each day up to today with Manila dates (OM-05 c4)', () => {
  const days = salesPerDay(sales, '2026-11-23', '2026-11-25');
  assert.deepEqual(days.map((day) => [day.label, day.total, day.count]), [
    ['Mon, Nov 23', 150.3, 2],
    ['Tue, Nov 24', 0.1, 1],
    ['Wed, Nov 25', 0.2, 1],
  ]);
});

test('the month lists Monday-to-Sunday weeks cut at the month and today (OM-06 c4)', () => {
  const weeks = salesPerWeek(sales, '2026-11-01', '2026-11-30', '2026-11-25');
  assert.deepEqual(weeks.map((week) => [week.label, week.start, week.end]), [
    ['Week 1 · Nov 1', '2026-11-01', '2026-11-01'],
    ['Week 2 · Nov 2–8', '2026-11-02', '2026-11-08'],
    ['Week 3 · Nov 9–15', '2026-11-09', '2026-11-15'],
    ['Week 4 · Nov 16–22', '2026-11-16', '2026-11-22'],
    ['Week 5 · Nov 23–25', '2026-11-23', '2026-11-25'],
  ]);
  assert.deepEqual(weeks.at(-1), { key: '2026-11-23', label: 'Week 5 · Nov 23–25', start: '2026-11-23', end: '2026-11-25', total: 150.6, count: 4 });
});

test('every branch is listed, a branch without sales at zero (OM-07 c2, c5)', () => {
  const rows = salesPerBranch(sales.slice(0, 4), [
    { id: 'b1', name: 'Branch 1' }, { id: 'b2', name: 'Branch 2' }, { id: 'b3', name: 'Branch 3' },
  ]);
  assert.deepEqual(rows, [
    { id: 'b1', name: 'Branch 1', total: 150.3, count: 2 },
    { id: 'b2', name: 'Branch 2', total: 0.3, count: 2 },
    { id: 'b3', name: 'Branch 3', total: 0, count: 0 },
  ]);
  const grand = rows.reduce((sum, row) => sum + Math.round(row.total * 100), 0) / 100;
  assert.equal(grand, totalOfSales(sales.slice(0, 4)), 'the grand total equals the sum of the branches (OM-07 c3)');
});

test('totals match the saved sales to the centavo (OM-04 c7)', () => {
  assert.equal(totalOfSales([sale('b1', '0.10', ''), sale('b1', '0.20', '')]), 0.3);
});

test('products are listed by flavor and portion, highest quantity first (OM-08 c2, c4)', () => {
  const rows = summarizeProductVariants([
    { product_id: 'p1', product_name: 'Octobits Cheese', variant_label: '4 PCS', quantity: 2, subtotal: 120 },
    { product_id: 'p1', product_name: 'Octobits Cheese', variant_label: '8 PCS', quantity: 5, subtotal: 500 },
    { product_id: 'p1', product_name: 'Octobits Cheese', variant_label: '4 PCS', quantity: 1, subtotal: 60 },
    { product_id: 'p2', product_name: 'Classic', variant_label: null, quantity: 3, subtotal: 150 },
  ]);
  assert.deepEqual(rows.map((row) => [row.name, row.variantLabel, row.quantity, row.total]), [
    ['Octobits Cheese', '8 PCS', 5, 500],
    ['Octobits Cheese', '4 PCS', 3, 180],
    ['Classic', null, 3, 150],
  ]);
});

test('add-ons are listed with their quantities (OM-08 c3)', () => {
  assert.deepEqual(summarizeAddons([
    { addon_id: 'mayo', addon_name: 'Extra mayo', quantity: 2, subtotal: 20 },
    { addon_id: 'cheese', addon_name: 'Cheese', quantity: 5, subtotal: 75 },
    { addon_id: 'mayo', addon_name: 'Extra mayo', quantity: 1, subtotal: 10 },
  ]), [
    { id: 'cheese', name: 'Cheese', quantity: 5, total: 75 },
    { id: 'mayo', name: 'Extra mayo', quantity: 3, total: 30 },
  ]);
});

test('OM-07 c2, c6: real branch names are matched and sales are counted for them', () => {
  const branches = orderBranchesForSales([
    { id: 'b3', name: "Gelo's Takoyaki · Branch 3" },
    { id: 'b1', name: "Gelo's Takoyaki · Branch 1" },
    { id: 'b2', name: "Gelo's Takoyaki · Branch 2" },
  ]);
  assert.deepEqual(branches.map((branch) => [branch.id, branch.name]), [['b1', 'Branch 1'], ['b2', 'Branch 2'], ['b3', 'Branch 3']]);
  const rows = salesPerBranch([
    { branch_id: 'b1', total_amount: 260 }, { branch_id: 'b1', total_amount: 89 }, { branch_id: 'b1', total_amount: 49 },
  ], branches);
  assert.deepEqual(rows.map((row) => [row.name, row.count, row.total]), [['Branch 1', 3, 398], ['Branch 2', 0, 0], ['Branch 3', 0, 0]]);
  assert.deepEqual(orderBranchesForSales([{ id: 'x', name: 'Main Store' }]).map((branch) => branch.name), ['Main Store']);
});
