import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPhysicalCountRecords,
  formatPhysicalCountDate,
  formatPhysicalCountDateTime,
  formatPhysicalCountDifference,
  formatPhysicalCountQuantity,
  getPhysicalCountResult,
} from './physicalCountRepository.ts';

function countHistoryRecord(overrides = {}) {
  return {
    id: 'physical-count-line-1',
    reference: 'PC-1112-0012',
    type: 'Physical Inventory Count',
    ingredientId: 'flour',
    ingredientName: 'All-Purpose Flour',
    category: 'Dry Goods',
    quantity: 2,
    unit: 'kg',
    movement: -2,
    branchId: 'branch-1',
    branch: 'Branch 1',
    staffId: 'employee-1',
    staff: 'Maria Santos',
    staffEmployeeId: 'EMP-014',
    staffEmail: 'maria.santos@gelostakoyaki.com',
    staffRole: 'staff',
    transactionDate: new Date('2026-11-12T10:30:00+08:00'),
    reason: 'Physical inventory count',
    notes: '',
    beforeQuantity: 12,
    afterQuantity: 10,
    batchReference: null,
    physicalCount: {
      checkId: 'check-1',
      status: 'pending_owner_review',
      expectedQuantity: 12,
      originalActualQuantity: 10,
      difference: -2,
      correctionHistory: [],
      revisedActualQuantity: null,
      validation: null,
    },
    ...overrides,
  };
}

function review(overrides = {}) {
  return {
    correctionRequestId: 'DISC-1112-0007',
    countLineId: 'line-1',
    checkId: 'check-1',
    reference: 'PC-1112-0012',
    branchId: 'branch-1',
    branch: 'Branch 1',
    staffId: 'employee-1',
    staff: 'Maria Santos',
    ingredientId: 'flour',
    ingredient: 'All-Purpose Flour',
    unit: 'kg',
    expected: 12,
    actual: 10,
    correctedActual: 10,
    difference: -2,
    correctionReason: '',
    remarks: '',
    submittedAt: '2026-11-12T10:30:00+08:00',
    status: 'Pending',
    canDecide: false,
    canValidate: true,
    validationTarget: 'count',
    decisionOwner: null,
    decisionReason: null,
    decisionAt: null,
    validationOutcome: null,
    validationReason: null,
    validatedAt: null,
    adjustment: null,
    ...overrides,
  };
}

test('live history maps revised values, employee metadata, review status, and public references', () => {
  const record = countHistoryRecord({
    reference: 'PC-1112-0011',
    ingredientId: 'eggs',
    ingredientName: 'Eggs',
    unit: 'pcs',
    branch: 'Quezon City · Branch 3',
    physicalCount: {
      ...countHistoryRecord().physicalCount,
      expectedQuantity: 50,
      originalActualQuantity: 48,
      revisedActualQuantity: 50,
      difference: -2,
      validation: {
        correctedActualQuantity: 50,
        outcome: 'adjusted',
        reason: 'Recount verified',
        validatedBy: 'employee-1',
        validatedAt: '2026-11-12T10:45:00+08:00',
        validatedByName: 'Ana Reyes',
      },
    },
  });
  const [mapped] = buildPhysicalCountRecords([record], [
    review({ status: 'Validated', validationOutcome: 'adjusted' }),
  ]);

  assert.equal(mapped.actualQuantity, 50);
  assert.equal(mapped.difference, 0);
  assert.equal(mapped.result, 'Matches');
  assert.equal(mapped.countStatus, 'Validated');
  assert.equal(mapped.discrepancyStatus, null);
  assert.equal(mapped.discrepancyReference, null);
  assert.equal(mapped.branchName, 'Branch 3');
  assert.equal(mapped.employeeId, 'EMP-014');
  assert.equal(mapped.email, 'maria.santos@gelostakoyaki.com');
  assert.equal(mapped.revision?.editor, 'Ana Reyes');

  const [discrepant] = buildPhysicalCountRecords([countHistoryRecord()], [
    review({ status: 'Validated', validationOutcome: 'adjusted' }),
  ]);
  assert.equal(discrepant.discrepancyStatus, 'Adjusted');
  assert.equal(discrepant.discrepancyReference, 'DISC-1112-0007');
});

test('live mapping excludes drafts and hides internal synthetic review IDs', () => {
  const records = buildPhysicalCountRecords([
    countHistoryRecord(),
    countHistoryRecord({
      id: 'physical-count-draft',
      physicalCount: { ...countHistoryRecord().physicalCount, status: 'draft' },
    }),
    countHistoryRecord({ id: 'transaction-1', type: 'Stock-In', physicalCount: undefined }),
  ], [
    review({ correctionRequestId: 'pending-count:line-1' }),
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].discrepancyReference, null);
  assert.equal(records[0].discrepancyReviewId, 'pending-count:line-1');
  assert.equal(records[0].discrepancyStatus, 'Pending Review');
});

test('result and quantity formatters use signed differences and Manila timestamps', () => {
  assert.equal(getPhysicalCountResult(-2), 'Lower than Expected');
  assert.equal(getPhysicalCountResult(0), 'Matches');
  assert.equal(getPhysicalCountResult(0.3), 'Higher than Expected');
  assert.equal(formatPhysicalCountQuantity(2.3, 'kg'), '2.3 kg');
  assert.equal(formatPhysicalCountDifference(-2, 'kg'), '−2 kg');
  assert.equal(formatPhysicalCountDifference(0, 'L'), '0 L');
  assert.equal(formatPhysicalCountDateTime('2026-11-12T02:30:00Z'), '12 Nov 2026 · 10:30 AM');
  assert.equal(formatPhysicalCountDate('2026-11-12T16:00:00Z'), '13 Nov 2026');
});

test('Owner physical-count records keep prepared batter in stored bottles, never millilitres', () => {
  const record = countHistoryRecord({
    ingredientId: 'prepared-batter',
    ingredientName: 'Takoyaki batter',
    unit: 'bottle',
    physicalCount: {
      ...countHistoryRecord().physicalCount,
      expectedQuantity: 3,
      originalActualQuantity: 2,
      difference: -1,
    },
  });
  const [mapped] = buildPhysicalCountRecords([record], []);
  assert.equal(mapped.unit, 'bottle');
  assert.equal(mapped.expectedQuantity, 3);
  assert.equal(mapped.actualQuantity, 2);
  assert.equal(mapped.difference, -1);
  assert.equal(formatPhysicalCountDifference(mapped.difference, mapped.unit), '−1 bottle');
  assert.equal(formatPhysicalCountQuantity(mapped.expectedQuantity, mapped.unit), '3 bottle');
});

test('OM-20 c1, c4: a settled count stays listed (check status "validated")', () => {
  const settled = (physicalCount) => countHistoryRecord({ physicalCount: { ...countHistoryRecord().physicalCount, status: 'validated', ...physicalCount } });
  const [validated] = buildPhysicalCountRecords([settled({})], [review({ status: 'Validated' })]);
  assert.equal(validated.countStatus, 'Validated');
  assert.equal(validated.discrepancyStatus, 'Adjusted');

  const [rejected] = buildPhysicalCountRecords([settled({})], [review({ status: 'Rejected for Recount', rejection: { reason: 'Recount', rejectedBy: 'Owner', rejectedAt: '2026-11-12T11:00:00+08:00' } })]);
  assert.equal(rejected.countStatus, 'Rejected for Recount');
  assert.equal(rejected.discrepancyStatus, null, 'a rejected count is no longer pending review and was not adjusted');

  const [matching] = buildPhysicalCountRecords([settled({ originalActualQuantity: 12, difference: 0 })], []);
  assert.equal(matching.countStatus, 'Validated');
});
