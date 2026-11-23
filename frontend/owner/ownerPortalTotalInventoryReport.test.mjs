import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTotalInventoryViews } from './ownerPortalTotalInventoryReport.ts';

const row = (overrides) => ({ name: 'Octopus', category: 'Protein', branch: 'Branch 1', qty: 10, unit: 'kg', status: 'Normal', expiry: '—', batches: 'No active batches', minimumStock: 2, stockLevel: 'Normal', ...overrides });
const rows = [
  row({}),
  row({ name: 'Eggs', qty: 5, unit: 'pcs', minimumStock: 12, stockLevel: 'Low Stock', status: 'Low Stock' }),
  row({ name: 'Takoyaki sauce', category: 'Sauces', qty: 0, unit: 'L', minimumStock: 1, stockLevel: 'Out of Stock', status: 'Out of Stock' }),
  row({ name: 'Cabbage', category: 'Produce', qty: 3, status: 'Near Expiration', batches: 'LOT-1: 3 kg · 2026-11-25; LOT-2: 1 kg · 2026-11-28' }),
];
const views = buildTotalInventoryViews(rows, { branch: 'Branch 1', asOf: '23 Nov 2026, 5:00 AM' });

test('OW-14 c2, c3: the Detailed view lists every item with minimum stock, status and lots', () => {
  const table = views.Detailed[0].table;
  assert.deepEqual(table.headers, ['Ingredient', 'Category', 'Quantity', 'Minimum stock', 'Stock status', 'Expiration · lots']);
  assert.equal(table.rows.length, 4);
  assert.deepEqual(table.rows[0], ['Cabbage', 'Produce', '3 kg', '2 kg', 'Normal · Near Expiration', 'LOT-1: 3 kg · 2026-11-25\nLOT-2: 1 kg · 2026-11-28']);
});

test('OW-14 c4, c5, c8: Summary totals per category and status counts agree with Detailed', () => {
  assert.deepEqual(views.Summary[0].summary, [['Items', '4'], ['Normal', '2'], ['Low Stock', '1'], ['Out of Stock', '1']]);
  const detailedStatuses = views.Detailed[0].table.rows.map((cells) => cells[4].split(' · ')[0]);
  for (const [label, count] of views.Summary[0].summary.slice(1)) {
    assert.equal(detailedStatuses.filter((status) => status === label).length, Number(count), label);
  }
  assert.deepEqual(views.Summary[1].table.rows.find((cells) => cells[0] === 'Protein'), ['Protein', '2', '5 pcs\n10 kg', '1', '1', '0']);
});

test('OW-14 c6, c7: the Information view names the branch, time and how figures are computed', () => {
  const [info] = views.Information;
  assert.deepEqual(info.summary.slice(0, 2), [['Branch', 'Branch 1'], ['Figures as of', '23 Nov 2026, 5:00 AM']]);
  assert.ok(info.notes.some((note) => /sum of its ledger movements/.test(note)));
});

test('OW-14: all branches add a Branch column', () => {
  const all = buildTotalInventoryViews([...rows, row({ branch: 'Branch 2' })], { branch: 'All Branches', asOf: 'now' });
  assert.equal(all.Detailed[0].table.headers[2], 'Branch');
});
