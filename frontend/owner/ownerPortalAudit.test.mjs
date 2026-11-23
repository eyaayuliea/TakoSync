import assert from 'node:assert/strict';
import test from 'node:test';
import { AUDIT_HEADERS, auditRow, buildAuditRecords, filterAuditRecords } from './ownerPortalAudit.ts';

const lineId = '11111111-1111-4111-8111-111111111111';
const input = {
  sales: [
    { id: 's1', transaction_reference: 'SALE-A1', branch_id: 'b1', total_amount: 260, payment_method: 'Cash', status: 'completed', inventory_processing_status: 'completed', created_at: '2026-11-23T10:00:00Z', recorded_by_name: 'Ana', cash_received: 500, change_amount: 240 },
    { id: 's2', transaction_reference: 'SALE-V2', branch_id: 'b1', total_amount: 49, payment_method: 'Cash', status: 'voided', inventory_processing_status: 'completed', created_at: '2026-11-23T11:00:00Z', recorded_by_name: 'Ana' },
  ],
  items: [
    { sale_id: 's1', product_name: 'Octobits Takoyaki', variant_label: '4 PCS', quantity: 5, subtotal: 245 },
    { sale_id: 's2', product_name: 'Octobits Takoyaki', variant_label: '4 PCS', quantity: 1, subtotal: 49 },
  ],
  movements: [
    { id: 'm1', reference: 'TX-C1', branch_id: 'b1', ingredient_id: 'batter', type: 'sales_consumption', quantity: 0.16, unit: 'bottle', movement: -0.16, reason: 'Sales consumption', notes: 'sale:s2', transaction_date: '2026-11-23T11:00:01Z', actor_name: 'Ana' },
    { id: 'm2', reference: 'TX-VR', branch_id: 'b1', ingredient_id: 'batter', type: 'void_reversal', quantity: 0.16, unit: 'bottle', movement: 0.16, reason: 'Void of sale SALE-V2', notes: 'void:VOID-1', transaction_date: '2026-11-23T12:00:00Z', actor_name: 'Owner' },
    { id: 'm3', reference: 'TX-W', branch_id: 'b1', ingredient_id: 'eggs', type: 'waste', quantity: 2, unit: 'pcs', movement: -2, reason: 'Spillage', notes: '', transaction_date: '2026-11-22T09:00:00Z', actor_name: 'Ana' },
    { id: 'm4', reference: 'TX-ER', branch_id: 'b1', ingredient_id: 'eggs', type: 'entry_reversal', quantity: 2, unit: 'pcs', movement: 2, reason: 'Reversal of TX-W', notes: 'reversal:REV-1', transaction_date: '2026-11-22T10:00:00Z', actor_name: 'Owner' },
    { id: 'm5', reference: 'TX-ADJ', branch_id: 'b1', ingredient_id: 'octopus', type: 'adjustment', quantity: 1, unit: 'kg', movement: -1, before_quantity: 50, after_quantity: 49, reason: 'Recount', notes: `Validated physical count line ${lineId}`, transaction_date: '2026-11-24T01:41:00Z', actor_name: 'Owner' },
  ],
  checks: [{ id: 'c1', reference: 'IC-261123-D9', branch_id: 'b1', status: 'validated', remarks: 'Two lids cracked', created_at: '2026-11-24T01:40:00Z', submitted_by_name: 'Ana' }],
  countLines: [{ id: lineId, daily_stock_check_id: 'c1', ingredient_id: 'octopus', recorded_quantity: 50, physical_quantity: 47, difference: -3, unit: 'kg' }],
  reviews: [{
    countLineId: lineId, reference: 'IC-261123-D9', branchId: 'b1', branch: 'Branch 1', staff: 'Ana', ingredient: 'Octopus', unit: 'kg',
    expected: 50, actual: 47, correctedActual: 49, correctionStatus: 'approved', correctionReason: 'Missed a tray', difference: -1, remarks: 'Two lids cracked',
    submittedAt: '2026-11-24T01:40:00Z', status: 'Validated', decisionOwner: 'Owner', decisionAt: '2026-11-24T01:41:00Z',
    adjustment: { movementReference: 'TX-ADJ', approvingOwner: 'Owner', approvedAt: '2026-11-24T01:41:00Z', reason: 'Recount' },
  }],
  branchName: () => 'Branch 1',
  itemName: (_branch, id) => ({ batter: 'Prepared batter', eggs: 'Eggs', octopus: 'Octopus' })[id] ?? id,
  formatDateTime: (iso) => iso.slice(0, 16),
};
const records = buildAuditRecords(input);
const byId = new Map(records.map((record) => [record.id, record]));

test('OW-29 c2: every record type is listed separately', () => {
  assert.deepEqual([...new Set(records.map((record) => record.type))].sort(), [
    'Authorized Adjustment', 'Completed Sale', 'Count Revision', 'Discrepancy', 'Entry Reversal', 'Physical Inventory Count',
    'Sales Consumption', 'Spillage', 'Void Reversal', 'Voided Sale',
  ]);
});

test('OW-29 c3, c4: each row has reference, type, branch, item, quantity, employee and date', () => {
  const row = auditRow(byId.get('sale:s1'), input.formatDateTime);
  assert.equal(row.length, AUDIT_HEADERS.length);
  assert.deepEqual(row, ['SALE-A1', 'Completed Sale', 'Branch 1', 'Octobits Takoyaki 4 PCS ×5', '5 items', 'Ana', '2026-11-23T10:00']);
});

test('OW-29 c5, c7: related records link both ways; the voided sale stays next to its compensating entry', () => {
  assert.deepEqual(byId.get('sale:s2').related.sort(), ['movement:m1', 'movement:m2']);
  assert.deepEqual(byId.get('movement:m4').related, ['movement:m3']);
  assert.deepEqual(byId.get('movement:m3').related, ['movement:m4']);
  assert.deepEqual(byId.get('movement:m5').related, [`count:${lineId}`]);
  assert.ok(byId.get(`count:${lineId}`).related.includes(`discrepancy:${lineId}`));
  assert.equal(byId.get('sale:s2').details[0][1], 'Voided (kept in history, not counted)');
});

test('OW-29 c6: a count revision shows original value, revised value, editor and outcome', () => {
  const revision = byId.get(`revision:${lineId}`);
  assert.deepEqual(revision.details.slice(0, 3), [['Original value', '47 kg'], ['Revised value', '49 kg'], ['Editor', 'Ana']]);
  assert.equal(revision.details[4][1], 'Approved by Owner · 2026-11-24T01:41');
});

test('OW-29 c1, c10: type, branch, date and partial reference filters', () => {
  assert.deepEqual(filterAuditRecords(records, { type: 'All types', branchId: null, reference: 'tx-' }).map((r) => r.reference).sort(), ['TX-ADJ', 'TX-C1', 'TX-ER', 'TX-VR', 'TX-W']);
  assert.deepEqual(filterAuditRecords(records, { type: 'Voided Sale', branchId: 'b1', reference: '' }).map((r) => r.reference), ['SALE-V2']);
  assert.deepEqual(filterAuditRecords(records, { type: 'All types', branchId: 'b2', reference: '' }), []);
  assert.deepEqual(filterAuditRecords(records, { type: 'All types', branchId: null, reference: 'nothing' }), []);
  const range = { start: new Date('2026-11-22T00:00:00Z'), end: new Date('2026-11-23T00:00:00Z') };
  assert.deepEqual(filterAuditRecords(records, { type: 'All types', branchId: null, reference: '', range }).map((r) => r.reference).sort(), ['TX-ER', 'TX-W']);
});
