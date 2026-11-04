import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatBusinessTime,
  readBusinessDaySettings,
} from './businessDaySettings.ts';

const normalSchedule = {
  active: true,
  business_date: '2026-11-04',
  opening_time: '16:00:00',
  normal_closing_time: '22:00:00',
  extended_closing_time: '23:00:00',
  extended_closing_enabled: false,
  timezone: 'Asia/Manila',
  milliseconds_until_expiration: 60_000,
};

test('reads the server schedule and keeps normal closing as the default', () => {
  const settings = readBusinessDaySettings(normalSchedule);
  assert.equal(settings.businessDate, '2026-11-04');
  assert.equal(settings.normalClosingTime, '22:00');
  assert.equal(settings.extendedClosingEnabled, false);
  assert.equal(settings.timezone, 'Asia/Manila');
  assert.equal(settings.millisecondsUntilExpiration, 60_000);
});

test('reads an Owner-authorized extension from the persisted server schedule', () => {
  const settings = readBusinessDaySettings({
    ...normalSchedule,
    extended_closing_enabled: true,
    milliseconds_until_expiration: 3_600_000,
  });
  assert.equal(settings.extendedClosingEnabled, true);
  assert.equal(settings.extendedClosingTime, '23:00');
  assert.equal(settings.millisecondsUntilExpiration, 3_600_000);
});

test('formats business times as clear 12-hour closing labels', () => {
  assert.equal(formatBusinessTime('22:00'), '10:00 PM');
  assert.equal(formatBusinessTime('23:00'), '11:00 PM');
  assert.equal(formatBusinessTime('16:00'), '4:00 PM');
});

test('rejects inactive sessions and unsupported timezones', () => {
  assert.throws(
    () => readBusinessDaySettings({ ...normalSchedule, active: false }),
    /active business session/,
  );
  assert.throws(
    () => readBusinessDaySettings({ ...normalSchedule, timezone: 'UTC' }),
    /unsupported business timezone/,
  );
});

test('explains when the database has not returned the closing extension setting', () => {
  const { extended_closing_enabled, ...statusWithoutExtensionSetting } = normalSchedule;
  assert.throws(
    () => readBusinessDaySettings(statusWithoutExtensionSetting),
    /business-day session migration may not be applied/,
  );
});
