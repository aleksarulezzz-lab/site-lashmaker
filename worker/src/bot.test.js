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
      const id = dbState.bookings.length + 1;
      const confirmToken = 'tok' + id;
      dbState.bookings.push({ ...booking, id, status: 'confirmed', confirm_token: confirmToken, client_chat_id: null });
      return { ok: true, id, confirmToken };
    },
    confirmBookingByToken: async (db, token, chatId) => {
      const b = dbState.bookings.find(x => x.confirm_token === token && x.status === 'confirmed');
      if (!b) return { ok: false, reason: 'not_found' };
      if (b.client_chat_id) {
        return b.client_chat_id === chatId
          ? { ok: true, alreadyConfirmed: true, date: b.date, slot_time: b.slot_time }
          : { ok: false, reason: 'already_claimed' };
      }
      b.client_chat_id = chatId;
      return { ok: true, alreadyConfirmed: false, date: b.date, slot_time: b.slot_time };
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

let siteReport = 'SITE-REPORT';
mock.module('./dailyReport.js', {
  exports: {
    buildDailyReport: async () => siteReport
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

test('/start confirm_<token> claims the booking for the confirming chat', async () => {
  resetState(); sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/start' });
  dbState.bookings.push({
    date: '2026-08-31', slot_time: '10:00', client_name: 'Мария', client_phone: '+79990000000',
    service: 'Классика', status: 'confirmed', confirm_token: 'abc123', client_chat_id: null
  });
  sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 999 }, text: '/start confirm_abc123' });

  assert.equal(dbState.bookings[0].client_chat_id, 999);
  assert.equal(sentMessages[0].chatId, 999);
  assert.match(sentMessages[0].text, /подтверждена/);
});

test('/start confirm_<token> with an unknown token replies with an error, not a crash', async () => {
  resetState(); sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 999 }, text: '/start confirm_doesnotexist' });
  assert.match(sentMessages[0].text, /недействительна/);
});

test('a second chat cannot hijack an already-confirmed booking', async () => {
  resetState(); sentMessages.length = 0;
  dbState.bookings.push({
    date: '2026-08-31', slot_time: '10:00', client_name: 'Мария', client_phone: '+79990000000',
    service: 'Классика', status: 'confirmed', confirm_token: 'abc123', client_chat_id: 999
  });
  await handleMessage(env, { chat: { id: 555 }, text: '/start confirm_abc123' });

  assert.equal(dbState.bookings[0].client_chat_id, 999);
  assert.match(sentMessages[0].text, /уже была использована/);
});

test('manual /book flow includes a forwardable confirm link when BOT_USERNAME is configured', async () => {
  resetState(); sentMessages.length = 0;
  const envWithBot = { DB: {}, BOT_USERNAME: 'test_lash_bot' };
  await handleMessage(envWithBot, { chat: { id: 111 }, text: '/start' });
  sentMessages.length = 0;

  await handleMessage(envWithBot, { chat: { id: 111 }, text: '/book' });
  const dateButtons = sentMessages[sentMessages.length - 1].replyMarkup.inline_keyboard;
  await handleCallbackQuery(envWithBot, { id: 'cb1', message: { chat: { id: 111 } }, data: dateButtons[0][0].callback_data });
  const timeButtons = sentMessages[sentMessages.length - 1].replyMarkup.inline_keyboard;
  await handleCallbackQuery(envWithBot, { id: 'cb2', message: { chat: { id: 111 } }, data: timeButtons[0][0].callback_data });
  await handleMessage(envWithBot, { chat: { id: 111 }, text: 'Мария' });
  await handleMessage(envWithBot, { chat: { id: 111 }, text: '+79991112233' });
  await handleMessage(envWithBot, { chat: { id: 111 }, text: 'Классика' });

  assert.match(sentMessages[sentMessages.length - 1].text, /https:\/\/t\.me\/test_lash_bot\?start=confirm_tok1/);
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

test('a stale date button from an old message cannot create a past-dated booking', async () => {
  resetState(); sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/start' });
  await handleMessage(env, { chat: { id: 111 }, text: '/book' });

  sentMessages.length = 0;
  await handleCallbackQuery(env, { id: 'cb1', message: { chat: { id: 111 } }, data: 'bd:2020-01-06' });
  assert.match(sentMessages[sentMessages.length - 1].text, /уже прошла/);
  assert.equal(dbState.sessions.has(111), false);

  // any further taps on the stale keyboard lead nowhere
  await handleCallbackQuery(env, { id: 'cb2', message: { chat: { id: 111 } }, data: 'bs:2020-01-06:0' });
  await handleMessage(env, { chat: { id: 111 }, text: 'Мария' });
  await handleMessage(env, { chat: { id: 111 }, text: '+79991112233' });
  await handleMessage(env, { chat: { id: 111 }, text: 'Классика' });

  assert.equal(dbState.bookings.length, 0);
  assert.equal(dbState.sessions.has(111), false);
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

test('/stats sends the current daily report to the admin', async () => {
  resetState(); sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/start' });
  sentMessages.length = 0;
  siteReport = '📊 aleksarulezzz.ru — 27 августа 2026\n👥 Посетители: 6';

  await handleMessage(env, { chat: { id: 111 }, text: '/stats' });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].chatId, 111);
  assert.equal(sentMessages[0].text, siteReport);
});

test('/stats is refused for a non-admin chat', async () => {
  resetState(); sentMessages.length = 0;
  await handleMessage(env, { chat: { id: 111 }, text: '/start' });
  sentMessages.length = 0;

  await handleMessage(env, { chat: { id: 999 }, text: '/stats' });

  assert.match(sentMessages[0].text, /приватный/);
});
