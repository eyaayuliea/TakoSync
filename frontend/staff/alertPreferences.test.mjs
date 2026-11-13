import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_STAFF_ALERT_PREFERENCES,
  loadStaffAlertPreferences,
  parseStaffAlertPreferences,
  saveStaffAlertPreferences,
  staffAlertPreferencesStorageKey,
} from './alertPreferences.ts';

function memoryStorage() {
  const values = new Map();
  return {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
  };
}

test('alert preferences default safely when storage is empty or malformed', () => {
  assert.deepEqual(parseStaffAlertPreferences(null), DEFAULT_STAFF_ALERT_PREFERENCES);
  assert.deepEqual(parseStaffAlertPreferences('{not-json'), DEFAULT_STAFF_ALERT_PREFERENCES);
  assert.deepEqual(parseStaffAlertPreferences('[]'), DEFAULT_STAFF_ALERT_PREFERENCES);
  assert.deepEqual(parseStaffAlertPreferences('{"lowStock":false}'), {
    lowStock: false,
    expiration: true,
  });
});

test('alert preferences round-trip per user without losing explicit false values', async () => {
  const storage = memoryStorage();
  const userId = 'staff-a';
  const preferences = { lowStock: false, expiration: true };

  await saveStaffAlertPreferences(storage, userId, preferences);

  assert.equal(staffAlertPreferencesStorageKey(userId), 'takosync.staff-alert-preferences.v1:staff-a');
  assert.deepEqual(await loadStaffAlertPreferences(storage, userId), preferences);
  assert.deepEqual(await loadStaffAlertPreferences(storage, 'staff-b'), DEFAULT_STAFF_ALERT_PREFERENCES);
});

test('storage failures remain visible to the caller', async () => {
  const storage = {
    async getItem() { throw new Error('device storage unavailable'); },
    async setItem() { throw new Error('device storage unavailable'); },
  };

  await assert.rejects(
    () => loadStaffAlertPreferences(storage, 'staff-a'),
    /device storage unavailable/,
  );
  await assert.rejects(
    () => saveStaffAlertPreferences(storage, 'staff-a', DEFAULT_STAFF_ALERT_PREFERENCES),
    /device storage unavailable/,
  );
});
