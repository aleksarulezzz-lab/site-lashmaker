import { addDays } from './slots.js';
import { getDailyStats, getDailyCountries, getDailySources } from './analytics.js';
import { escapeHtml } from './telegram.js';

// Pretty labels for the common traffic sources; anything else shows as-is.
const SOURCE_LABELS = {
  direct: 'Прямые заходы',
  'dzen.ru': 'Дзен', 'zen.yandex.ru': 'Дзен',
  't.me': 'Telegram', 'telegram.me': 'Telegram',
  'youtube.com': 'YouTube', 'm.youtube.com': 'YouTube',
  'vk.com': 'VK', 'vk.ru': 'VK',
  'instagram.com': 'Instagram', 'l.instagram.com': 'Instagram',
  'google.com': 'Google', 'yandex.ru': 'Яндекс', 'ya.ru': 'Яндекс'
};

export function sourceLabel(src) {
  return SOURCE_LABELS[src] || src;
}

const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

export function formatLongDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${d.getUTCDate()} ${MONTHS_RU[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ISO 3166-1 alpha-2 -> flag emoji (regional indicator pair). Falls back to a
// white flag for anything that isn't two ASCII letters.
export function flagEmoji(code) {
  const cc = typeof code === 'string' ? code.toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(cc)) return '🏳️';
  const base = 0x1F1E6;
  return String.fromCodePoint(base + cc.charCodeAt(0) - 65, base + cc.charCodeAt(1) - 65);
}

// " (▲ 100%)" / " (▼ 50%)" vs the previous day. Empty when both are zero;
// "(нов.)" when yesterday was zero and today isn't.
export function formatDelta(today, yesterday) {
  if (yesterday === 0) return today > 0 ? ' (нов.)' : '';
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct === 0) return ' (—)';
  return ` (${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%)`;
}

// Long site paths -> just the last segment, like the reference report.
export function shortPath(path) {
  if (typeof path !== 'string' || path === '' || path === '/') return 'главная';
  const seg = path.split('?')[0].replace(/\/+$/, '').split('/').filter(Boolean).pop();
  return seg || 'главная';
}

async function pingSite(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
    return { ok: res.status >= 200 && res.status < 400, ms: Date.now() - started };
  } catch {
    return { ok: false, ms: Date.now() - started };
  }
}

// Builds the Telegram report text for one day. Shared by the 20:00 cron summary
// and the on-demand /stats bot command.
export async function buildDailyReport(env, date) {
  const domain = env.SITE_DOMAIN || 'aleksarulezzz.ru';
  const [today, prev, countries, sources, ping] = await Promise.all([
    getDailyStats(env.DB, date),
    getDailyStats(env.DB, addDays(date, -1)),
    getDailyCountries(env.DB, date),
    getDailySources(env.DB, date),
    pingSite(`https://${domain}/`)
  ]);

  const lines = [
    `📊 ${escapeHtml(domain)} — ${formatLongDate(date)}`,
    '',
    ping.ok ? `🟢 Сайт работает (${ping.ms} мс)` : '🔴 Сайт недоступен',
    '',
    `👥 Посетители: ${today.visitors}${formatDelta(today.visitors, prev.visitors)}`,
    `👁 Просмотры: ${today.views}${formatDelta(today.views, prev.views)}`,
    `⏱ Среднее время на сайте: ${today.avgDwellSec} сек`,
    '',
    '🏠 Откуда приходят'
  ];
  if (countries.length) {
    for (const c of countries) lines.push(`${flagEmoji(c.country)} ${escapeHtml(c.country)}: ${c.views}`);
  } else {
    lines.push('  (нет данных)');
  }
  lines.push('', '🔗 Откуда переходят');
  if (sources.length) {
    for (const s of sources) lines.push(`${escapeHtml(sourceLabel(s.source))}: ${s.views}`);
  } else {
    lines.push('  (нет данных)');
  }
  lines.push('', '🗂 Что смотрят');
  if (today.topPaths.length) {
    for (const p of today.topPaths) lines.push(`${escapeHtml(shortPath(p.path))} — ${p.views}`);
  } else {
    lines.push('  (нет данных)');
  }
  return lines.join('\n');
}
