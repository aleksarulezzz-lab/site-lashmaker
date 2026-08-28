import { isValidDateFormat, isValidSlotTime, isWorkingDay, getTodayMoscow, addDays, FIXED_SLOTS } from './slots.js';
import { getBookedSlotsInRange, createBooking, getAdminChatId, deleteBookingsBefore } from './db.js';
import { sendMessage, escapeHtml } from './telegram.js';
import { handleTelegramUpdate } from './bot.js';
import { runReminderSweep } from './reminders.js';
import { hashVisitor, recordPageView, recordDwell, prunePageViews, getDailyStats, getRangeStats, getRangeCountries } from './analytics.js';
import { renderStatsPage } from './statsPage.js';
import { sendEveningStats } from './dailyStats.js';
import { ALLOWED_ORIGINS, timingSafeEqual, beaconSourceAllowed } from './httpGuards.js';

const EVENING_STATS_CRON = '0 17 * * *';
const MAX_AVAILABILITY_DAYS = 62;   // widest date range /api/availability will serve
const MAX_BOOKING_AHEAD_DAYS = 90;  // furthest ahead a public booking may be made
const PAGEVIEW_RETENTION_DAYS = 180;
const BOOKING_RETENTION_DAYS = 90;

// Background tasks run detached via ctx.waitUntil, so a failure would otherwise
// be silent. Wrap each one: on error, ping the admin in Telegram.
function guardCron(env, label, task) {
  return Promise.resolve(task).catch(async (err) => {
    try {
      const adminChatId = await getAdminChatId(env.DB);
      if (adminChatId) {
        await sendMessage(env, adminChatId,
          `⚠️ Сбой в фоновой задаче «${label}»:\n${escapeHtml(String((err && err.message) || err)).slice(0, 500)}`);
      }
    } catch { /* alerting itself failed — nothing more we can do */ }
  });
}

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
  const spanDays = Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
  if (spanDays > MAX_AVAILABILITY_DAYS) {
    return json({ error: 'range_too_large' }, 400, cors);
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
  // Honeypot: real users never see or fill the hidden "hp" field.
  // Pretend it worked so a bot gets no signal, but create nothing.
  if (typeof body?.hp === 'string' && body.hp.trim() !== '') {
    return json({ ok: true, id: 0, confirmUrl: null }, 200, cors);
  }
  const { date, slot_time, client_name, client_phone, service } = body || {};
  if (!isValidDateFormat(date) || !isWorkingDay(date) || date < getTodayMoscow()) {
    return json({ error: 'invalid_date' }, 400, cors);
  }
  if (date > addDays(getTodayMoscow(), MAX_BOOKING_AHEAD_DAYS)) {
    return json({ error: 'too_far_ahead' }, 400, cors);
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
  const parsed = parseInt(await env.RATE_LIMIT.get(key), 10);
  const count = Number.isNaN(parsed) ? 0 : parsed;
  if (count >= limit) return false;
  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 600 });
  return true;
}

async function handleTrack(request, env, cors) {
  const noContent = () => new Response(null, { status: 204, headers: cors });

  // Only accept beacons that actually came from one of our pages.
  if (!beaconSourceAllowed(request.headers.get('Origin'), request.headers.get('Referer'))) {
    return noContent();
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return noContent();
  }
  const viewId = typeof body?.viewId === 'string' && body.viewId ? body.viewId.slice(0, 64) : null;

  // Follow-up beacon fired when the visitor leaves the page. Not rate-limited:
  // it can only UPDATE a row an earlier (rate-limited) load beacon created.
  const dwellMs = Number(body?.dwellMs);
  if (viewId && Number.isFinite(dwellMs)) {
    await recordDwell(env.DB, { viewId, dwellMs: Math.min(Math.max(Math.round(dwellMs), 0), 30 * 60 * 1000) });
    return noContent();
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (env.RATE_LIMIT && !(await checkRateLimit(env, `track:${ip}`, 40))) {
    return noContent();
  }
  const path = typeof body?.path === 'string' && body.path ? body.path.slice(0, 200) : '/';
  const ua = request.headers.get('User-Agent') || 'unknown';
  const country = request.headers.get('CF-IPCountry') || null;
  const date = getTodayMoscow();
  const visitorHash = await hashVisitor(ip, ua, date);
  await recordPageView(env.DB, { date, path, visitorHash, viewId, country });
  return noContent();
}

async function handleStats(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (env.RATE_LIMIT && !(await checkRateLimit(env, `stats:${ip}`, 20))) {
    return new Response('Too Many Requests', { status: 429 });
  }
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!env.STATS_TOKEN || !(await timingSafeEqual(token, env.STATS_TOKEN))) {
    return new Response('Unauthorized', { status: 401 });
  }
  const today = getTodayMoscow();
  const [todayStats, week, twoWeeks, month, countries] = await Promise.all([
    getDailyStats(env.DB, today),
    getRangeStats(env.DB, addDays(today, -6), today),
    getRangeStats(env.DB, addDays(today, -13), today),
    getRangeStats(env.DB, addDays(today, -29), today),
    getRangeCountries(env.DB, addDays(today, -6), today, 8)
  ]);
  const html = renderStatsPage({ today, todayStats, week, month, byDay: twoWeeks.byDay, countries });
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function handleTelegramWebhook(request, env) {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!env.WEBHOOK_SECRET || !(await timingSafeEqual(secret, env.WEBHOOK_SECRET))) {
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
      ctx.waitUntil(guardCron(env, 'вечерняя статистика', sendEveningStats(env)));
      ctx.waitUntil(guardCron(env, 'очистка pageviews', prunePageViews(env.DB, addDays(getTodayMoscow(), -PAGEVIEW_RETENTION_DAYS))));
      ctx.waitUntil(guardCron(env, 'очистка записей', deleteBookingsBefore(env.DB, addDays(getTodayMoscow(), -BOOKING_RETENTION_DAYS))));
    } else {
      ctx.waitUntil(guardCron(env, 'напоминания', runReminderSweep(env)));
    }
  }
};
