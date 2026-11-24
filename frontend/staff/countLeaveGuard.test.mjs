import assert from 'node:assert/strict';
import test from 'node:test';
import { countEntriesSnapshot, hasUnsavedCountEntries } from './countLeaveGuard.ts';

const lines = (octopus = '', eggs = '') => [
  { ingredientId: 'octopus', physicalQuantity: octopus },
  { ingredientId: 'eggs', physicalQuantity: eggs },
];

test('an untouched count can be left without a prompt', () => {
  assert.equal(hasUnsavedCountEntries(countEntriesSnapshot(lines(), '', false), null), false);
});

test('typed quantities, remarks or the verification tick are unsaved entries', () => {
  assert.equal(hasUnsavedCountEntries(countEntriesSnapshot(lines('40'), '', false), null), true);
  assert.equal(hasUnsavedCountEntries(countEntriesSnapshot(lines(), 'one pack thawed', false), null), true);
  assert.equal(hasUnsavedCountEntries(countEntriesSnapshot(lines(), '', true), null), true);
});

test('after saving a draft there is nothing unsaved until an entry changes', () => {
  const saved = countEntriesSnapshot(lines('40', '12'), 'ok', true);
  assert.equal(hasUnsavedCountEntries(countEntriesSnapshot(lines(' 40 ', '12'), 'ok ', true), saved), false);
  assert.equal(hasUnsavedCountEntries(countEntriesSnapshot(lines('41', '12'), 'ok', true), saved), true);
  assert.equal(hasUnsavedCountEntries(countEntriesSnapshot(lines('', '12'), 'ok', true), saved), true);
});

test('the snapshot does not depend on line order and never holds expected quantities', () => {
  const a = countEntriesSnapshot(lines('40', '12'), '', false);
  const b = countEntriesSnapshot([...lines('40', '12')].reverse(), '', false);
  assert.equal(a, b);
  assert.equal(a, '[["eggs=12","octopus=40"],"",false]');
});
