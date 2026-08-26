export const FIXED_SLOTS = ['10:00', '13:00', '16:00'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateFormat(str) {
  if (typeof str !== 'string' || !DATE_RE.test(str)) return false;
  const d = new Date(str + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

export function isValidSlotTime(str) {
  return FIXED_SLOTS.includes(str);
}

export function isWorkingDay(dateStr) {
  const day = new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0=Sun..6=Sat
  return day >= 1 && day <= 5;
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

export function getTodayMoscow() {
  return new Date(Date.now() + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
}

export function getTomorrowMoscow() {
  return addDays(getTodayMoscow(), 1);
}

export function nextWorkingDays(fromDateStr, count) {
  const result = [];
  let cursor = fromDateStr;
  while (result.length < count) {
    if (isWorkingDay(cursor)) result.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return result;
}

const WEEKDAY_LABELS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const label = WEEKDAY_LABELS_RU[d.getUTCDay()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${label} ${day}.${month}`;
}

export function appointmentInstantUtcMs(dateStr, slotTime) {
  return Date.parse(`${dateStr}T${slotTime}:00Z`) - MOSCOW_OFFSET_MS;
}

export function isDueForReminder(booking, nowMs, leadMs, windowMs) {
  const dueAt = appointmentInstantUtcMs(booking.date, booking.slot_time) - leadMs;
  return nowMs >= dueAt && nowMs < dueAt + windowMs;
}
