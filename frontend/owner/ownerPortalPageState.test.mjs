import assert from 'node:assert/strict';
import test from 'node:test';
import { portalPageState } from './ownerPortalPageState.ts';

test('OW-02 c9 / OW-31 c2: a page with failed data shows the error (with Retry in the UI)', () => {
  assert.deepEqual(
    portalPageState(['inventory', 'sales'], { sales: 'Unable to connect.' }, new Set()),
    { kind: 'error', message: 'Unable to connect.' },
  );
});

test('OW-31 c8: a page waits while its data loads for the first time, not on a refresh', () => {
  assert.deepEqual(portalPageState(['inventory'], {}, new Set(['inventory'])), { kind: 'loading' });
  assert.deepEqual(portalPageState(['inventory'], {}, new Set(['inventory']), new Set(['inventory'])), { kind: 'ready' });
});

test('a page is ready when its own data is in, whatever else is loading or failed', () => {
  assert.deepEqual(portalPageState(['reviews'], { staff: 'x' }, new Set(['sales'])), { kind: 'ready' });
  assert.deepEqual(portalPageState([], { staff: 'x' }, new Set(['sales'])), { kind: 'ready' });
});
