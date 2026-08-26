import { getTodayMoscow, getTomorrowMoscow, formatDateLabel, isDueForReminder } from './slots.js';
import { getPendingReminderCandidates, markReminderSent } from './db.js';
import { sendMessage, escapeHtml } from './telegram.js';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const WINDOW_MS = 5 * 60 * 1000;

export async function runReminderSweep(env, now = Date.now()) {
  const candidates = await getPendingReminderCandidates(env.DB, [getTodayMoscow(), getTomorrowMoscow()]);
  let sent = 0;
  for (const b of candidates) {
    if (isDueForReminder(b, now, TWO_HOURS_MS, WINDOW_MS)) {
      await sendMessage(env, b.client_chat_id,
        `⏰ Напоминание: у вас запись ${formatDateLabel(b.date)} в ${b.slot_time}\n${escapeHtml(b.service)}\n\nЖдём вас!`);
      await markReminderSent(env.DB, b.id);
      sent++;
    }
  }
  return sent;
}
