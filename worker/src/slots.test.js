import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDateFormat, isValidSlotTime, isWorkingDay, addDays,
  nextWorkingDays, formatDateLabel
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
