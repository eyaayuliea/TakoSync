import assert from 'node:assert/strict';
import test from 'node:test';
import { approvedOnly, newestFirst, summarizeVoidReport } from './voidReversalReports.ts';

test('only approved requests are reported; rejected and pending are left out (OM-22 c4)', () => {
  const rows = [{ id: 'a', status: 'approved' }, { id: 'p', status: 'pending' }, { id: 'r', status: 'rejected' }];
  assert.deepEqual(approvedOnly(rows).map((row) => row.id), ['a']);
});

test('the Void Report totals the count and amount without float drift (OM-10 c5)', () => {
  assert.deepEqual(
    summarizeVoidReport([{ sale: { totalAmount: 0.1 } }, { sale: { totalAmount: 0.2 } }, { sale: null }]),
    { count: 3, total: 0.3 },
  );
  assert.deepEqual(summarizeVoidReport([]), { count: 0, total: 0 });
});

test('rows are listed newest first', () => {
  const rows = [{ id: 'old', at: '2026-11-20T01:00:00Z' }, { id: 'new', at: '2026-11-25T01:00:00Z' }, { id: 'none', at: null }];
  assert.deepEqual(newestFirst(rows, (row) => row.at).map((row) => row.id), ['new', 'old', 'none']);
});
