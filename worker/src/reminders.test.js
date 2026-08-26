import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { getTodayMoscow } from './slots.js';

const sentMessages = [];
const markedSent = [];
let candidates = [];
let failForChatId = null;

mock.module('./db.js', {
  exports: {
    getPendingReminderCandidates: async () => candidates,
    markReminderSent: async (db, id) => { markedSent.push(id); }
  }
});

mock.module('./telegram.js', {
  exports: {
    sendMessage: async (env, chatId, text) => {
      if (chatId === failForChatId) throw new Error('network error');
      sentMessages.push({ chatId, text });
    },
    escapeHtml: (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
});

const { runReminderSweep } = await import('./reminders.js');
const env = { DB: {} };

test('sends a reminder for a booking exactly at its 2-hour lead time and marks it sent', async () => {
  sentMessages.length = 0; markedSent.length = 0;
  const today = getTodayMoscow();
  const apptMs = Date.parse(`${today}T10:00:00Z`) - 3 * 60 * 60 * 1000; // 10:00 Moscow
  const now = apptMs - 2 * 60 * 60 * 1000; // exactly 2h before
  candidates = [{ id: 5, date: today, slot_time: '10:00', client_name: 'Мария', client_phone: '+79990000000', service: 'Классика', client_chat_id: 777 }];

  const sent = await runReminderSweep(env, now);

  assert.equal(sent, 1);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].chatId, 777);
  assert.match(sentMessages[0].text, /Напоминание/);
  assert.deepEqual(markedSent, [5]);
});

test('does not send a reminder for a booking outside the lead-time window', async () => {
  sentMessages.length = 0; markedSent.length = 0;
  const today = getTodayMoscow();
  const apptMs = Date.parse(`${today}T16:00:00Z`) - 3 * 60 * 60 * 1000; // 16:00 Moscow
  const now = apptMs - 5 * 60 * 60 * 1000; // 5h before, nowhere near the 2h window
  candidates = [{ id: 9, date: today, slot_time: '16:00', client_name: 'Ольга', client_phone: '+79990000001', service: 'Ламинирование', client_chat_id: 888 }];

  const sent = await runReminderSweep(env, now);

  assert.equal(sent, 0);
  assert.equal(sentMessages.length, 0);
  assert.deepEqual(markedSent, []);
});

test('escapes HTML in the service name of the reminder text', async () => {
  sentMessages.length = 0; markedSent.length = 0;
  const today = getTodayMoscow();
  const apptMs = Date.parse(`${today}T13:00:00Z`) - 3 * 60 * 60 * 1000; // 13:00 Moscow
  const now = apptMs - 2 * 60 * 60 * 1000;
  candidates = [{ id: 3, date: today, slot_time: '13:00', client_name: 'Тест', client_phone: '+79990000002', service: '<b>hi</b>', client_chat_id: 111 }];

  await runReminderSweep(env, now);

  assert.match(sentMessages[0].text, /&lt;b&gt;hi&lt;\/b&gt;/);
});

test('one candidate failing to send does not stop reminders for the rest of the batch', async () => {
  sentMessages.length = 0; markedSent.length = 0;
  failForChatId = 111;
  const today = getTodayMoscow();
  // Same date/slot_time on both rows is unrealistic for real bookings (the DB's
  // unique index prevents it) but is fine here: this test only exercises the
  // sweep loop's per-candidate error isolation, not slot uniqueness.
  const apptMs = Date.parse(`${today}T10:00:00Z`) - 3 * 60 * 60 * 1000;
  const now = apptMs - 2 * 60 * 60 * 1000;
  candidates = [
    { id: 1, date: today, slot_time: '10:00', client_name: 'Сбой', client_phone: '+79990000000', service: 'Классика', client_chat_id: 111 },
    { id: 2, date: today, slot_time: '10:00', client_name: 'Успех', client_phone: '+79990000001', service: 'Классика', client_chat_id: 222 }
  ];

  const sent = await runReminderSweep(env, now);

  failForChatId = null;
  assert.equal(sent, 1);
  assert.deepEqual(sentMessages.map(m => m.chatId), [222]);
  assert.deepEqual(markedSent, [2]);
});
