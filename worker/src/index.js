import { isValidDateFormat, isValidSlotTime, isWorkingDay, getTodayMoscow, addDays, FIXED_SLOTS } from './slots.js';
import { getBookedSlotsInRange, createBooking, getAdminChatId } from './db.js';
import { sendMessage, escapeHtml } from './telegram.js';
import { handleTelegramUpdate } from './bot.js';
import { runReminderSweep } from './reminders.js';
import { hashVisitor, recordPageView, getDailyStats, getRangeStats } from './analytics.js';
import { renderStatsPage } from './statsPage.js';
import { sendEveningStats } from './dailyStats.js';

const EVENING_STATS_CRON = '0 17 * * *';

const ALLOWED_ORIGINS = [
  'https://aleksarulezzz-lab.github.io',
  'https://aleksarulezzz.ru',
  'https://www.aleksarulezzz.ru'
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    // navigator.sendBeacon() (used by the pageview tracker) sends cross-origin
    // requests with credentials mode 'include' by default; without this the
    // browser blocks the response even though no cookies are actually used here.
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

async function handleAvailability(request, env, cors) {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!isValidDateFormat(from) || !isValidDateFormat(to) || from > to) {
    return json({ error: 'invalid_range' }, 400, cors);
  }
  const booked = await getBookedSlotsInRange(env.DB, from, to);
  const days = [];
  let cursor = from;
  while (cursor <= to) {
    const working = isWorkingDay(cursor);
    days.push({
      date: cursor,
      working,
      slots: working
        ? FIXED_SLOTS.map(t => ({ time: t, free: !booked.has(`${cursor}|${t}`) }))
        : []
    });
    const d = new Date(cursor + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return json({ days }, 200, cors);
}

async function handleBook(request, env, cors) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (env.RATE_LIMIT && !(await checkRateLimit(env, `book:${ip}`, 5))) {
    return json({ error: 'rate_limited' }, 429, cors);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400, cors);
  }
  const { date, slot_time, client_name, client_phone, service } = body || {};
  if (!isValidDateFormat(date) || !isWorkingDay(date) || date < getTodayMoscow()) {
    return json({ error: 'invalid_date' }, 400, cors);
  }
  if (!isValidSlotTime(slot_time)) {
    return json({ error: 'invalid_slot' }, 400, cors);
  }
  if (!client_name || String(client_name).trim().length < 2 || String(client_name).length > 100) {
    return json({ error: 'invalid_name' }, 400, cors);
  }
  if (!client_phone || !/^[\d\s\+\-\(\)]{10,18}$/.test(client_phone)) {
    return json({ error: 'invalid_phone' }, 400, cors);
  }
  if (!service || String(service).trim().length < 1 || String(service).length > 200) {
    return json({ error: 'invalid_service' }, 400, cors);
  }
  const result = await createBooking(env.DB, {
    date, slot_time,
    client_name: String(client_name).trim(),
    client_phone: String(client_phone).trim(),
    service: String(service).trim(),
    source: 'site'
  });
  if (!result.ok) {
    return json({ error: 'slot_taken' }, 409, cors);
  }
  const adminChatId = await getAdminChatId(env.DB);
  if (adminChatId) {
    await sendMessage(env, adminChatId,
      `🆕 Новая запись с сайта:\n${escapeHtml(client_name)}, ${escapeHtml(client_phone)}\n${escapeHtml(service)}\n${date} ${slot_time}`);
  }
  const confirmUrl = env.BOT_USERNAME ? `https://t.me/${env.BOT_USERNAME}?start=confirm_${result.confirmToken}` : null;
  return json({ ok: true, id: result.id, confirmUrl }, 200, cors);
}

async function checkRateLimit(env, key, limit) {
  const current = await env.RATE_LIMIT.get(key);
  const count = current ? parseInt(current, 10) : 0;
  if (count >= limit) return false;
  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 600 });
  return true;
}

async function handleTrack(request, env, cors) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (env.RATE_LIMIT && !(await checkRateLimit(env, `track:${ip}`, 30))) {
    return new Response(null, { status: 204, headers: cors });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204, headers: cors });
  }
  const path = typeof body?.path === 'string' && body.path ? body.path.slice(0, 200) : '/';
  const ua = request.headers.get('User-Agent') || 'unknown';
  const date = getTodayMoscow();
  const visitorHash = await hashVisitor(ip, ua, date);
  await recordPageView(env.DB, { date, path, visitorHash });
  return new Response(null, { status: 204, headers: cors });
}

async function handleStats(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!env.STATS_TOKEN || token !== env.STATS_TOKEN) {
    return new Response('Unauthorized', { status: 401 });
  }
  const today = getTodayMoscow();
  const [todayStats, week, twoWeeks, month] = await Promise.all([
    getDailyStats(env.DB, today),
    getRangeStats(env.DB, addDays(today, -6), today),
    getRangeStats(env.DB, addDays(today, -13), today),
    getRangeStats(env.DB, addDays(today, -29), today)
  ]);
  const html = renderStatsPage({ today, todayStats, week, month, byDay: twoWeeks.byDay });
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function handleTelegramWebhook(request, env) {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== env.WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('ok');
  }
  await handleTelegramUpdate(env, update);
  return new Response('ok');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }
    if (url.pathname === '/api/availability' && request.method === 'GET') {
      return handleAvailability(request, env, cors);
    }
    if (url.pathname === '/api/book' && request.method === 'POST') {
      return handleBook(request, env, cors);
    }
    if (url.pathname === '/api/track' && request.method === 'POST') {
      return handleTrack(request, env, cors);
    }
    if (url.pathname === '/api/stats' && request.method === 'GET') {
      return handleStats(request, env);
    }
    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      return handleTelegramWebhook(request, env);
    }
    return json({ error: 'not_found' }, 404, cors);
  },

  async scheduled(event, env, ctx) {
    if (event.cron === EVENING_STATS_CRON) {
      ctx.waitUntil(sendEveningStats(env));
    } else {
      ctx.waitUntil(runReminderSweep(env));
    }
  }
};
