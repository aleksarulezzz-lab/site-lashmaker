export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildSendMessagePayload(chatId, text, replyMarkup) {
  const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return payload;
}

export function buildAnswerCallbackPayload(callbackQueryId, text) {
  const payload = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;
  return payload;
}

export function inlineKeyboard(rows) {
  return { inline_keyboard: rows };
}

export async function sendMessage(env, chatId, text, replyMarkup) {
  const payload = buildSendMessagePayload(chatId, text, replyMarkup);
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function answerCallbackQuery(env, callbackQueryId, text) {
  const payload = buildAnswerCallbackPayload(callbackQueryId, text);
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
