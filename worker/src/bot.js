import {
  FIXED_SLOTS, isValidDateFormat, getTodayMoscow, getTomorrowMoscow,
  nextWorkingDays, formatDateLabel
} from './slots.js';
import {
  getBookingsForDate, getBookedSlotsInRange, createBooking,
  getAdminChatId, claimAdminChatId, getSession, setSession, clearSession
} from './db.js';
import { sendMessage, answerCallbackQuery, inlineKeyboard, escapeHtml } from './telegram.js';

const HELP_TEXT = [
  'Я бот записи Александры. Вот что я умею:',
  '/today — записи на сегодня',
  '/tomorrow — записи на завтра',
  '/date ГГГГ-ММ-ДД — записи на любую дату',
  '/book — создать новую запись вручную'
].join('\n');

const PHONE_RE = /^[\d\s\+\-\(\)]{10,18}$/;

function formatBookingLine(b) {
  return `• ${b.slot_time} — ${escapeHtml(b.client_name)}, ${escapeHtml(b.client_phone)} (${escapeHtml(b.service)})`;
}

async function replyBookingsForDate(env, chatId, dateStr) {
  const bookings = await getBookingsForDate(env.DB, dateStr);
  const label = formatDateLabel(dateStr);
  if (bookings.length === 0) {
    await sendMessage(env, chatId, `${label}: записей нет.`);
    return;
  }
  const lines = bookings.map(formatBookingLine).join('\n');
  await sendMessage(env, chatId, `${label}:\n${lines}`);
}

async function startBookFlow(env, chatId) {
  const candidates = nextWorkingDays(getTodayMoscow(), 15);
  const from = candidates[0];
  const to = candidates[candidates.length - 1];
  const booked = await getBookedSlotsInRange(env.DB, from, to);
  const withFreeSlot = candidates
    .filter(date => FIXED_SLOTS.some(t => !booked.has(`${date}|${t}`)))
    .slice(0, 10);
  if (withFreeSlot.length === 0) {
    await sendMessage(env, chatId, 'Свободных дат в ближайшее время нет.');
    return;
  }
  const rows = withFreeSlot.map(date => ([{ text: formatDateLabel(date), callback_data: `bd:${date}` }]));
  await setSession(env.DB, chatId, 'await_date', {});
  await sendMessage(env, chatId, 'Выберите дату записи:', inlineKeyboard(rows));
}

async function handleCommand(env, chatId, text) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  if (cmd === '/start') {
    const claimed = await claimAdminChatId(env.DB, chatId);
    if (claimed) {
      await sendMessage(env, chatId, `Готово, бот подключён к вам.\n\n${HELP_TEXT}`);
    } else {
      await sendMessage(env, chatId, 'Этот бот приватный.');
    }
    return;
  }
  const adminChatId = await getAdminChatId(env.DB);
  if (String(chatId) !== adminChatId) {
    await sendMessage(env, chatId, 'Этот бот приватный.');
    return;
  }
  await clearSession(env.DB, chatId);
  if (cmd === '/today') {
    await replyBookingsForDate(env, chatId, getTodayMoscow());
  } else if (cmd === '/tomorrow') {
    await replyBookingsForDate(env, chatId, getTomorrowMoscow());
  } else if (cmd === '/date') {
    const dateStr = rest[0];
    if (!dateStr || !isValidDateFormat(dateStr)) {
      await sendMessage(env, chatId, 'Формат: /date 2026-08-28');
      return;
    }
    await replyBookingsForDate(env, chatId, dateStr);
  } else if (cmd === '/book') {
    await startBookFlow(env, chatId);
  } else {
    await sendMessage(env, chatId, HELP_TEXT);
  }
}

async function handleSessionText(env, chatId, session, text) {
  const value = text.trim();
  if (session.step === 'await_name') {
    if (!value) { await sendMessage(env, chatId, 'Имя не может быть пустым, введите ещё раз:'); return; }
    await setSession(env.DB, chatId, 'await_phone', { ...session.draft, client_name: value });
    await sendMessage(env, chatId, 'Введите телефон клиента:');
    return;
  }
  if (session.step === 'await_phone') {
    if (!PHONE_RE.test(value)) { await sendMessage(env, chatId, 'Похоже на неверный номер, введите ещё раз:'); return; }
    await setSession(env.DB, chatId, 'await_service', { ...session.draft, client_phone: value });
    await sendMessage(env, chatId, 'Введите услугу (например: Классика 1D):');
    return;
  }
  if (session.step === 'await_service') {
    if (!value) { await sendMessage(env, chatId, 'Услуга не может быть пустой, введите ещё раз:'); return; }
    const draft = { ...session.draft, service: value };
    if (draft.date < getTodayMoscow()) {
      await clearSession(env.DB, chatId);
      await sendMessage(env, chatId, 'Эта дата уже прошла (кнопка была из старого сообщения). Начните заново: /book');
      return;
    }
    const result = await createBooking(env.DB, {
      date: draft.date, slot_time: draft.slot_time,
      client_name: draft.client_name, client_phone: draft.client_phone,
      service: draft.service, source: 'bot'
    });
    await clearSession(env.DB, chatId);
    if (!result.ok) {
      await sendMessage(env, chatId, 'Этот слот уже заняли, начните заново: /book');
      return;
    }
    await sendMessage(env, chatId,
      `✅ Запись создана: ${escapeHtml(draft.client_name)}, ${escapeHtml(draft.client_phone)}, ${escapeHtml(draft.service)} — ${formatDateLabel(draft.date)} ${draft.slot_time}`);
  }
}

export async function handleMessage(env, message) {
  const chatId = message.chat.id;
  const text = message.text || '';
  if (text.startsWith('/')) {
    await handleCommand(env, chatId, text);
    return;
  }
  const adminChatId = await getAdminChatId(env.DB);
  if (String(chatId) !== adminChatId) return;
  const session = await getSession(env.DB, chatId);
  if (session) {
    await handleSessionText(env, chatId, session, text);
  } else {
    await sendMessage(env, chatId, HELP_TEXT);
  }
}

export async function handleCallbackQuery(env, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data || '';
  const adminChatId = await getAdminChatId(env.DB);
  if (String(chatId) !== adminChatId) {
    await answerCallbackQuery(env, callbackQuery.id, 'Недоступно');
    return;
  }
  const parts = data.split(':');
  const action = parts[0];
  if (action === 'bd') {
    const date = parts[1];
    const session = await getSession(env.DB, chatId);
    if (!session || session.step !== 'await_date') {
      await answerCallbackQuery(env, callbackQuery.id, 'Сессия истекла, наберите /book');
      return;
    }
    const booked = await getBookedSlotsInRange(env.DB, date, date);
    const free = FIXED_SLOTS.filter(t => !booked.has(`${date}|${t}`));
    if (free.length === 0) {
      await clearSession(env.DB, chatId);
      await answerCallbackQuery(env, callbackQuery.id);
      await sendMessage(env, chatId, 'День уже полностью занят. Наберите /book, чтобы выбрать другую дату.');
      return;
    }
    const rows = free.map(t => {
      const idx = FIXED_SLOTS.indexOf(t);
      return [{ text: t, callback_data: `bs:${date}:${idx}` }];
    });
    await setSession(env.DB, chatId, 'await_slot', { date });
    await answerCallbackQuery(env, callbackQuery.id);
    await sendMessage(env, chatId, `Дата: ${formatDateLabel(date)}. Выберите время:`, inlineKeyboard(rows));
    return;
  }
  if (action === 'bs') {
    const date = parts[1];
    const idx = Number(parts[2]);
    const slot_time = FIXED_SLOTS[idx];
    const session = await getSession(env.DB, chatId);
    if (!session || session.step !== 'await_slot' || session.draft.date !== date || !slot_time) {
      await answerCallbackQuery(env, callbackQuery.id, 'Сессия истекла, наберите /book');
      return;
    }
    const booked = await getBookedSlotsInRange(env.DB, date, date);
    if (booked.has(`${date}|${slot_time}`)) {
      await clearSession(env.DB, chatId);
      await answerCallbackQuery(env, callbackQuery.id, 'Этот слот уже заняли');
      await sendMessage(env, chatId, 'Этот слот уже заняли, начните заново: /book');
      return;
    }
    await setSession(env.DB, chatId, 'await_name', { date, slot_time });
    await answerCallbackQuery(env, callbackQuery.id);
    await sendMessage(env, chatId, 'Введите имя клиента:');
    return;
  }
  await answerCallbackQuery(env, callbackQuery.id);
}

export async function handleTelegramUpdate(env, update) {
  if (update.message) {
    await handleMessage(env, update.message);
  } else if (update.callback_query) {
    await handleCallbackQuery(env, update.callback_query);
  }
}
