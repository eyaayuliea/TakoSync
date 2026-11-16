import assert from 'node:assert/strict';
import test from 'node:test';
import { findOwnerActivity, sortOwnerActivities } from './ownerActivities.ts';

test('sorts recent activities newest first without mutating the source', () => {
  const activities = [
    { id: 'older', date: '2026-11-10T10:00:00Z' },
    { id: 'newer', date: '2026-11-11T10:00:00Z' },
  ];
  assert.deepEqual(sortOwnerActivities(activities).map((activity) => activity.id), ['newer', 'older']);
  assert.equal(activities[0].id, 'older');
});

test('selects the exact tapped activity and safely handles missing records', () => {
  const activities = [
    { id: 'sale-1', date: '2026-11-11T10:00:00Z', detail: 'PHP 100.00' },
    { id: 'inventory-1', date: '2026-11-10T10:00:00Z', detail: '2 kg' },
  ];
  assert.deepEqual(findOwnerActivity(activities, 'inventory-1'), activities[1]);
  assert.equal(findOwnerActivity(activities, 'missing'), null);
});
