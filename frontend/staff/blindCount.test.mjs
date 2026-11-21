import assert from 'node:assert/strict';
import test from 'node:test';
import { blindCountProgress, compareCount, countComparisonLabel } from './blindCount.ts';

const kg = (value) => `${value} kg`;

test('a count is compared with the expected quantity after submission (ST-12 c6)', () => {
  assert.deepEqual(compareCount(10, 10), { kind: 'match', difference: 0 });
  assert.deepEqual(compareCount(10, 8), { kind: 'lower', difference: -2 });
  assert.deepEqual(compareCount(10, 10.5), { kind: 'higher', difference: 0.5 });
  assert.equal(compareCount(0.3, 0.1 + 0.2).kind, 'match', 'float noise is not a discrepancy');
});

test('the comparison reads as Matches, Lower by, or Higher by', () => {
  assert.equal(countComparisonLabel(compareCount(10, 10), kg), 'Matches');
  assert.equal(countComparisonLabel(compareCount(10, 8), kg), 'Lower by 2 kg');
  assert.equal(countComparisonLabel(compareCount(10, 10.5), kg), 'Higher by 0.5 kg');
});

test('progress counts the items with a count entered', () => {
  assert.deepEqual(blindCountProgress([{ physicalQuantity: '2' }, { physicalQuantity: ' ' }, { physicalQuantity: '0' }]), {
    counted: 2,
    total: 3,
  });
});
