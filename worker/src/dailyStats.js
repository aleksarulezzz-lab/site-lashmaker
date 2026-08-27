import { getTodayMoscow } from './slots.js';
import { getAdminChatId } from './db.js';
import { sendMessage } from './telegram.js';
import { buildDailyReport } from './dailyReport.js';

export async function sendEveningStats(env) {
  const adminChatId = await getAdminChatId(env.DB);
  if (!adminChatId) return;
  const text = await buildDailyReport(env, getTodayMoscow());
  await sendMessage(env, adminChatId, text);
}
