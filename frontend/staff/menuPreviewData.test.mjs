import assert from 'node:assert/strict';
import test from 'node:test';
import { filterBranchVisibleMenuVariants } from '../services/menuCatalog.ts';

test('branch menu filtering retains visible unavailable variants for the unavailable filter', () => {
  const variants = [
    { id: 'available', is_available: true },
    { id: 'unavailable', is_available: false },
    { id: 'hidden', is_available: true },
  ];

  assert.deepEqual(
    filterBranchVisibleMenuVariants(variants, new Set(['available', 'unavailable'])),
    variants.slice(0, 2),
  );
});
