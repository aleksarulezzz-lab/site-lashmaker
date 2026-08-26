import { getTodayMoscow, formatDateLabel } from './slots.js';
import { getDailyStats } from './analytics.js';
import { getAdminChatId } from './db.js';
import { sendMessage, escapeHtml } from './telegram.js';

export async function sendEveningStats(env) {
  const adminChatId = await getAdminChatId(env.DB);
  if (!adminChatId) return;
  const today = getTodayMoscow();
  const stats = await getDailyStats(env.DB, today);
  const topLines = stats.topPaths.length
    ? stats.topPaths.map(p => `  • ${escapeHtml(p.path)} — ${p.views}`).join('\n')
    : '  (нет данных)';
  const text = `📊 Статистика сайта за ${formatDateLabel(today)}:\n` +
    `Просмотры: ${stats.views}\n` +
    `Посетители: ${stats.visitors}\n\n` +
    `Топ страниц:\n${topLines}`;
  await sendMessage(env, adminChatId, text);
}
