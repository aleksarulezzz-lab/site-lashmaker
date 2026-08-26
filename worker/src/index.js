import { isValidDateFormat, isValidSlotTime, isWorkingDay, FIXED_SLOTS } from './slots.js';
import { getBookedSlotsInRange, createBooking, getAdminChatId } from './db.js';
import { sendMessage } from './telegram.js';
import { handleTelegramUpdate } from './bot.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

async function handleAvailability(request, env) {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!isValidDateFormat(from) || !isValidDateFormat(to) || from > to) {
    return json({ error: 'invalid_range' }, 400);
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
  return json({ days });
}

async function handleBook(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const { date, slot_time, client_name, client_phone, service } = body || {};
  if (!isValidDateFormat(date) || !isWorkingDay(date)) {
    return json({ error: 'invalid_date' }, 400);
  }
  if (!isValidSlotTime(slot_time)) {
    return json({ error: 'invalid_slot' }, 400);
  }
  if (!client_name || String(client_name).trim().length < 2) {
    return json({ error: 'invalid_name' }, 400);
  }
  if (!client_phone || !/^[\d\s\+\-\(\)]{10,18}$/.test(client_phone)) {
    return json({ error: 'invalid_phone' }, 400);
  }
  if (!service || String(service).trim().length < 1) {
    return json({ error: 'invalid_service' }, 400);
  }
  const result = await createBooking(env.DB, {
    date, slot_time,
    client_name: String(client_name).trim(),
    client_phone: String(client_phone).trim(),
    service: String(service).trim(),
    source: 'site'
  });
  if (!result.ok) {
    return json({ error: 'slot_taken' }, 409);
  }
  const adminChatId = await getAdminChatId(env.DB);
  if (adminChatId) {
    await sendMessage(env, adminChatId,
      `🆕 Новая запись с сайта:\n${client_name}, ${client_phone}\n${service}\n${date} ${slot_time}`);
  }
  return json({ ok: true, id: result.id });
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
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (url.pathname === '/api/availability' && request.method === 'GET') {
      return handleAvailability(request, env);
    }
    if (url.pathname === '/api/book' && request.method === 'POST') {
      return handleBook(request, env);
    }
    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      return handleTelegramWebhook(request, env);
    }
    return json({ error: 'not_found' }, 404);
  }
};
