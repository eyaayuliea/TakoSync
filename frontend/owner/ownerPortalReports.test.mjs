import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../services/testTsLoader.mjs', import.meta.url);
const {
  buildOwnerPortalCountReportRows,
  filterOwnerPortalConfirmedSales,
  filterOwnerPortalReportMovements,
  summarizeOwnerPortalSalesByBranch,
  summarizeOwnerPortalSalesByProduct,
  totalOwnerPortalSales,
} = await import('./ownerPortalReports.ts');

const sales = [
  { id: 'sale-1', branch_id: 'branch-1', total_amount: '150.50' },
  { id: 'sale-2', branch_id: 'branch-1', total_amount: 50 },
  { id: 'sale-3', branch_id: 'branch-2', total_amount: 80 },
];

test('Owner Web sales report totals are calculated from filtered completed sales', () => {
  assert.equal(totalOwnerPortalSales(sales), 280.5);
  assert.equal(totalOwnerPortalSales(sales.filter((sale) => sale.branch_id === 'branch-1')), 200.5);
});

test('Owner Web branch report retains database branches with no sales in the selected range', () => {
  assert.deepEqual(summarizeOwnerPortalSalesByBranch(sales, [
    { id: 'branch-1', name: 'Live Branch One' },
    { id: 'branch-2', name: 'Live Branch Two' },
    { id: 'branch-3', name: 'Live Branch Three' },
  ]), [
    { id: 'branch-1', name: 'Live Branch One', salesCount: 2, totalSales: 200.5 },
    { id: 'branch-2', name: 'Live Branch Two', salesCount: 1, totalSales: 80 },
    { id: 'branch-3', name: 'Live Branch Three', salesCount: 0, totalSales: 0 },
  ]);
});

test('Owner Web product report excludes items outside the filtered sales and aggregates actual quantity and subtotal', () => {
  assert.deepEqual(summarizeOwnerPortalSalesByProduct(
    sales.filter((sale) => sale.branch_id === 'branch-1'),
    [
      { sale_id: 'sale-1', product_id: 'product-1', product_name: 'Takoyaki', quantity: 2, subtotal: 100 },
      { sale_id: 'sale-2', product_id: 'product-1', product_name: 'Takoyaki', quantity: 1, subtotal: 50 },
      { sale_id: 'sale-3', product_id: 'product-2', product_name: 'Other Branch Product', quantity: 8, subtotal: 80 },
    ],
  ), [
    { id: 'product-1', name: 'Takoyaki', quantity: 3, totalSales: 150 },
  ]);
});

test('Owner Web totals include only completed sales with completed inventory processing', () => {
  const salesWithIncompleteProcessing = [
    { id: 'confirmed', branch_id: 'branch-1', total_amount: 10, status: 'completed', inventory_processing_status: 'completed' },
    { id: 'pending', branch_id: 'branch-1', total_amount: 10, status: 'completed', inventory_processing_status: 'pending' },
    { id: 'processing', branch_id: 'branch-1', total_amount: 10, status: 'completed', inventory_processing_status: 'processing' },
    { id: 'failed', branch_id: 'branch-1', total_amount: 10, status: 'completed', inventory_processing_status: 'failed' },
    { id: 'cancelled', branch_id: 'branch-1', total_amount: 0, status: 'cancelled', inventory_processing_status: 'completed' },
  ];

  assert.deepEqual(
    filterOwnerPortalConfirmedSales(salesWithIncompleteProcessing).map((sale) => sale.id),
    ['confirmed'],
  );
});

test('Owner Web movement reports keep types separate and apply branch and half-open date filters', () => {
  const movements = [
    { id: 'start', branch_id: 'branch-1', type: 'stock_in', transaction_date: '2026-11-01T00:00:00.000Z' },
    { id: 'inside', branch_id: 'branch-1', type: 'stock_in', transaction_date: '2026-11-01T12:00:00.000Z' },
    { id: 'other-branch', branch_id: 'branch-2', type: 'stock_in', transaction_date: '2026-11-01T12:00:00.000Z' },
    { id: 'waste', branch_id: 'branch-1', type: 'waste', transaction_date: '2026-11-01T12:00:00.000Z' },
    { id: 'end', branch_id: 'branch-1', type: 'stock_in', transaction_date: '2026-11-02T00:00:00.000Z' },
  ];

  assert.deepEqual(
    filterOwnerPortalReportMovements(movements, 'Stock-in report', {
      branchId: 'branch-1',
      start: new Date('2026-11-01T00:00:00.000Z'),
      end: new Date('2026-11-02T00:00:00.000Z'),
    }).map((movement) => movement.id),
    ['start', 'inside'],
  );
  assert.deepEqual(
    filterOwnerPortalReportMovements(movements, 'Waste and spillage report', {
      branchId: null,
      start: new Date('2026-11-01T00:00:00.000Z'),
      end: new Date('2026-11-02T00:00:00.000Z'),
    }).map((movement) => movement.id),
    ['waste'],
  );
});

test('Owner Web count reports preserve count status and correction revisions within branch and date scope', () => {
  const rows = buildOwnerPortalCountReportRows({
    checks: [
      { id: 'check-1', reference: 'COUNT-1', branch_id: 'branch-1', created_at: '2026-11-01T12:00:00Z', status: 'pending_owner_review', submitted_by_name: 'Staff One' },
      { id: 'check-2', reference: 'COUNT-2', branch_id: 'branch-2', created_at: '2026-11-01T12:00:00Z', status: 'submitted', submitted_by_name: 'Staff Two' },
      { id: 'check-3', reference: 'COUNT-3', branch_id: 'branch-1', created_at: '2026-11-02T00:00:00Z', status: 'submitted', submitted_by_name: 'Staff One' },
    ],
    lines: [
      { id: 'line-1', daily_stock_check_id: 'check-1', ingredient_id: 'item-1', recorded_quantity: 10, physical_quantity: 8, difference: -2, unit: 'kg', inventory_revision: 4 },
      { id: 'line-2', daily_stock_check_id: 'check-2', ingredient_id: 'item-1', recorded_quantity: 10, physical_quantity: 9, difference: -1, unit: 'kg', inventory_revision: 2 },
      { id: 'line-3', daily_stock_check_id: 'check-3', ingredient_id: 'item-1', recorded_quantity: 10, physical_quantity: 10, difference: 0, unit: 'kg', inventory_revision: null },
    ],
    correctionHistory: [
      { countLineId: 'line-1', status: 'Approved', correctedActual: 9, unit: 'kg', correctionReason: 'Recount', decisionReason: 'Approved by Owner', validationReason: null },
      { countLineId: 'line-1', status: 'Validated', correctedActual: 9, unit: 'kg', correctionReason: 'Recount', decisionReason: 'Approved by Owner', validationReason: 'Count reconciled' },
    ],
    branchId: 'branch-1',
    start: new Date('2026-11-01T00:00:00Z'),
    end: new Date('2026-11-02T00:00:00Z'),
    branchNames: new Map([['branch-1', 'Branch One']]),
    itemNames: new Map([['branch-1:item-1', 'Flour']]),
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].branch, 'Branch One');
  assert.equal(rows[0].ingredient, 'Flour');
  assert.equal(rows[0].status, 'pending_owner_review');
  assert.equal(rows[0].inventoryRevision, '4');
  assert.match(rows[0].revisionHistory, /Approved: 9 kg/);
  assert.match(rows[0].revisionHistory, /Validated: 9 kg/);
});
