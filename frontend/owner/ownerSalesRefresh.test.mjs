import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshOwnerMonitoring } from './ownerSalesRefresh.ts';

test('Owner monitoring refresh uses the shared refresh for sales and inventory together', async () => {
  const calls = [];
  const result = await refreshOwnerMonitoring(
    async () => { calls.push('shared'); },
    async () => { calls.push('sales-only'); },
  );
  assert.equal(result, 'shared');
  assert.deepEqual(calls, ['shared']);
});

test('standalone sales refresh remains available when no shared Owner refresh is supplied', async () => {
  const calls = [];
  const result = await refreshOwnerMonitoring(undefined, async () => { calls.push('sales-only'); });
  assert.equal(result, 'sales-only');
  assert.deepEqual(calls, ['sales-only']);
});
