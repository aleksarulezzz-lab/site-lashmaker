import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDateFormat, isValidSlotTime, isWorkingDay, addDays,
  nextWorkingDays, formatDateLabel, appointmentInstantUtcMs, isDueForReminder,
  hasSlotPassed, SLOT_BOOKING_GRACE_MS
} from './slots.js';

test('isValidDateFormat accepts well-formed dates', () => {
  assert.equal(isValidDateFormat('2026-08-28'), true);
});

test('isValidDateFormat rejects malformed dates', () => {
  assert.equal(isValidDateFormat('2026-13-40'), false);
  assert.equal(isValidDateFormat('28-08-2026'), false);
  assert.equal(isValidDateFormat('not-a-date'), false);
});

test('isValidSlotTime only accepts the three fixed slots', () => {
  assert.equal(isValidSlotTime('10:00'), true);
  assert.equal(isValidSlotTime('11:00'), false);
});

test('isWorkingDay is true Mon-Fri, false Sat/Sun', () => {
  assert.equal(isWorkingDay('2026-08-28'), true);  // Friday
  assert.equal(isWorkingDay('2026-08-29'), false); // Saturday
  assert.equal(isWorkingDay('2026-08-30'), false); // Sunday
  assert.equal(isWorkingDay('2026-08-31'), true);  // Monday
});

test('addDays advances the calendar date, including month rollover', () => {
  assert.equal(addDays('2026-08-30', 1), '2026-08-31');
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
});

test('nextWorkingDays skips weekends and returns the requested count', () => {
  const days = nextWorkingDays('2026-08-28', 4); // starts Friday
  assert.deepEqual(days, ['2026-08-28', '2026-08-31', '2026-09-01', '2026-09-02']);
});

test('formatDateLabel renders a short Russian weekday + day.month label', () => {
  assert.equal(formatDateLabel('2026-08-28'), 'Пт 28.08');
});

test('appointmentInstantUtcMs converts Moscow local date+time to a UTC instant', () => {
  // 2026-08-28 10:00 Moscow (UTC+3) == 2026-08-28 07:00 UTC
  assert.equal(appointmentInstantUtcMs('2026-08-28', '10:00'), Date.parse('2026-08-28T07:00:00Z'));
});

test('hasSlotPassed: same-day slots already started (or within the grace window) are not bookable', () => {
  // "now" = 2026-08-31 13:22 Moscow == 10:22 UTC
  const now = Date.parse('2026-08-31T10:22:00Z');
  assert.equal(hasSlotPassed('2026-08-31', '10:00', now), true,  '10:00 has passed');
  assert.equal(hasSlotPassed('2026-08-31', '13:00', now), true,  '13:00 has passed');
  assert.equal(hasSlotPassed('2026-08-31', '16:00', now), false, '16:00 is still ahead');
});

test('hasSlotPassed: a slot starting within the grace window still counts as passed', () => {
  // slot 16:00 Moscow == 13:00 UTC; now is 20 min before it -> inside the 30-min grace
  const now = appointmentInstantUtcMs('2026-08-31', '16:00') - 20 * 60 * 1000;
  assert.equal(hasSlotPassed('2026-08-31', '16:00', now), true);
  // 40 min before -> outside the grace, still bookable
  const earlier = appointmentInstantUtcMs('2026-08-31', '16:00') - 40 * 60 * 1000;
  assert.equal(hasSlotPassed('2026-08-31', '16:00', earlier), false);
  assert.equal(SLOT_BOOKING_GRACE_MS, 30 * 60 * 1000);
});

test('hasSlotPassed: any slot on a past date has passed; future dates never have', () => {
  const now = Date.parse('2026-08-31T10:22:00Z');
  assert.equal(hasSlotPassed('2026-08-28', '16:00', now), true);
  assert.equal(hasSlotPassed('2026-09-01', '10:00', now), false);
});

test('isDueForReminder is true only inside the [dueAt, dueAt+window) lead-time window', () => {
  const booking = { date: '2026-08-28', slot_time: '10:00' }; // 07:00 UTC
  const twoHours = 2 * 60 * 60 * 1000;
  const fiveMin = 5 * 60 * 1000;
  const dueAt = Date.parse('2026-08-28T05:00:00Z'); // 07:00 - 2h

  assert.equal(isDueForReminder(booking, dueAt - 1, twoHours, fiveMin), false, 'just before the window');
  assert.equal(isDueForReminder(booking, dueAt, twoHours, fiveMin), true, 'exactly at the window start');
  assert.equal(isDueForReminder(booking, dueAt + fiveMin - 1, twoHours, fiveMin), true, 'just inside the window end');
  assert.equal(isDueForReminder(booking, dueAt + fiveMin, twoHours, fiveMin), false, 'exactly at the window end (exclusive)');
});
