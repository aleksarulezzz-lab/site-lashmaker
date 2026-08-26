import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSendMessagePayload, buildAnswerCallbackPayload, inlineKeyboard, escapeHtml } from './telegram.js';

test('escapeHtml neutralizes tag-forming characters so user input cannot inject Telegram HTML markup', () => {
  assert.equal(escapeHtml('<a href="evil">click</a>'), '&lt;a href="evil"&gt;click&lt;/a&gt;');
});

test('escapeHtml escapes bare ampersands', () => {
  assert.equal(escapeHtml('Tom & Jerry'), 'Tom &amp; Jerry');
});

test('buildSendMessagePayload includes chat_id, text and HTML parse mode', () => {
  const payload = buildSendMessagePayload(123, 'hello');
  assert.deepEqual(payload, { chat_id: 123, text: 'hello', parse_mode: 'HTML' });
});

test('buildSendMessagePayload attaches reply_markup when given', () => {
  const kb = inlineKeyboard([[{ text: 'A', callback_data: 'a' }]]);
  const payload = buildSendMessagePayload(123, 'hi', kb);
  assert.deepEqual(payload.reply_markup, kb);
});

test('buildAnswerCallbackPayload requires callback_query_id and optional text', () => {
  assert.deepEqual(buildAnswerCallbackPayload('cbid'), { callback_query_id: 'cbid' });
  assert.deepEqual(buildAnswerCallbackPayload('cbid', 'ok'), { callback_query_id: 'cbid', text: 'ok' });
});

test('inlineKeyboard wraps rows in the Telegram inline_keyboard shape', () => {
  const kb = inlineKeyboard([[{ text: 'X', callback_data: 'x' }]]);
  assert.deepEqual(kb, { inline_keyboard: [[{ text: 'X', callback_data: 'x' }]] });
});
