import { isValidDateFormat, isValidSlotTime, isWorkingDay, getTodayMoscow, FIXED_SLOTS } from './slots.js';
import { getBookedSlotsInRange, createBooking, getAdminChatId } from './db.js';
import { sendMessage, escapeHtml } from './telegram.js';
import { handleTelegramUpdate } from './bot.js';

const ALLOWED_ORIGINS = ['https://aleksarulezzz-lab.github.io'];

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
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
  if (env.RATE_LIMIT && !(await checkRateLimit(env, ip))) {
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
  return json({ ok: true, id: result.id }, 200, cors);
}

async function checkRateLimit(env, ip) {
  const key = `book:${ip}`;
  const current = await env.RATE_LIMIT.get(key);
  const count = current ? parseInt(current, 10) : 0;
  if (count >= 5) return false;
  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 600 });
  return true;
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
    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      return handleTelegramWebhook(request, env);
    }
    return json({ error: 'not_found' }, 404, cors);
  }
};
