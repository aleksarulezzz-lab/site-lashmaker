import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const dbState = { adminChatId: null, sessions: new Map(), bookings: [] };
function resetState() {
  dbState.adminChatId = null;
  dbState.sessions = new Map();
  dbState.bookings = [];
}

const sentMessages = [];

mock.module('./db.js', {
  exports: {
    getBookingsForDate: async (db, date) =>
      dbState.bookings.filter(b => b.date === date && b.status === 'confirmed'),
    getBookedSlotsInRange: async (db, from, to) => new Set(
      dbState.bookings
        .filter(b => b.status === 'confirmed' && b.date >= from && b.date <= to)
        .map(b => `${b.date}|${b.slot_time}`)
    ),
    createBooking: async (db, booking) => {
      const key = `${booking.date}|${booking.slot_time}`;
      const taken = dbState.bookings.some(
        b => b.status === 'confirmed' && `${b.date}|${b.slot_time}` === key
      );
      if (taken) return { ok: false, reason: 'slot_taken' };
      dbState.bookings.push({ ...booking, status: 'confirmed' });
      return { ok: true, id: dbState.bookings.length };
    },
    getAdminChatId: async () => dbState.adminChatId,
    claimAdminChatId: async (db, chatId) => {
      if (dbState.adminChatId === null) dbState.adminChatId = String(chatId);
      return dbState.adminChatId === String(chatId);
    },
    getSession: async (db, chatId) => dbState.sessions.get(chatId) || null,
    setSession: async (db, chatId, step, draft) => { dbState.sessions.set(chatId, { step, draft }); },
    clearSession: async (db, chatId) => { dbState.sessions.delete(chatId); }
  }
});

mock.module('./telegram.js', {
  exports: {
    sendMessage: async (env, chatId, text, replyMarkup) => { sentMessages.push({ chatId, text, replyMarkup }); },
    answerCallbackQuery: async () => {},
    inlineKeyboard: (rows) => ({ inline_keyboard: rows }),
    escapeHtml: (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
});

const { handleMessage, handleCallbackQuery } = await import('./bot.js');
const env = { DB: {} };

test('unknown chat before admin claim gets "приватный"', async () => {
  resetState(); sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/today' });
  assert.match(sentMessages[0].text, /приватный/);
});

test('/start claims admin on first use', async () => {
  resetState(); sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/start' });
  assert.equal(dbState.adminChatId, '111');
  assert.match(sentMessages[0].text, /Готово/);
});

test('/start from a second chat does not steal admin', async () => {
  resetState(); sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/start' });
  sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 222 }, text: '/start' });
  assert.equal(dbState.adminChatId, '111');
  assert.match(sentMessages[0].text, /приватный/);
});

test('/date with a malformed date replies with a format hint, not a crash', async () => {
  resetState(); sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/start' });
  sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/date not-a-date' });
  assert.match(sentMessages[0].text, /Формат/);
});

test('/today with no bookings says so', async () => {
  resetState(); sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/start' });
  sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/today' });
  assert.match(sentMessages[0].text, /записей нет/);
});

test('full /book flow: date -> slot -> name -> phone -> service creates a bot-sourced booking', async () => {
  resetState(); sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/start' });
  sentMessages.length = 0;

  await handleMessage(env, { chat: { id: 111 }, text: '/book' });
  const dateButtons = sentMessages[sentMessages.length - 1].replyMarkup.inline_keyboard;
  const firstDateCallback = dateButtons[0][0].callback_data;

  await handleCallbackQuery(env, { id: 'cb1', message: { chat: { id: 111 } }, data: firstDateCallback });
  const timeButtons = sentMessages[sentMessages.length - 1].replyMarkup.inline_keyboard;
  const firstSlotCallback = timeButtons[0][0].callback_data;

  await handleCallbackQuery(env, { id: 'cb2', message: { chat: { id: 111 } }, data: firstSlotCallback });
  await handleMessage(env, { chat: { id: 111 }, text: 'Мария' });
  await handleMessage(env, { chat: { id: 111 }, text: '+79991112233' });
  await handleMessage(env, { chat: { id: 111 }, text: 'Классика' });

  assert.equal(dbState.bookings.length, 1);
  assert.equal(dbState.bookings[0].client_name, 'Мария');
  assert.equal(dbState.bookings[0].source, 'bot');
  assert.match(sentMessages[sentMessages.length - 1].text, /Запись создана/);
});

test('/today escapes HTML in a client name so it cannot inject markup into the Telegram message', async () => {
  resetState(); sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/start' });
  dbState.bookings.push({
    date: '2026-08-31', slot_time: '10:00',
    client_name: '<a href="evil">click</a>', client_phone: '+79990000000',
    service: 'Классика', status: 'confirmed'
  });
  sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/date 2026-08-31' });
  assert.match(sentMessages[0].text, /&lt;a href="evil"&gt;click&lt;\/a&gt;/);
  assert.doesNotMatch(sentMessages[0].text, /<a href="evil">/);
});

test('an interrupting command clears a mid-flow /book session so later free text is not swallowed', async () => {
  resetState(); sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/start' });
  sentMessages.length = 0;

  await handleMessage(env, { chat: { id: 111 }, text: '/book' });
  assert.equal(dbState.sessions.get(111).step, 'await_date');

  await handleMessage(env, { chat: { id: 111 }, text: '/today' });
  assert.equal(dbState.sessions.has(111), false);

  sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: 'Мария' });

  assert.equal(dbState.bookings.length, 0);
  assert.equal(dbState.sessions.has(111), false);
  assert.match(sentMessages[sentMessages.length - 1].text, /умею/);
});
