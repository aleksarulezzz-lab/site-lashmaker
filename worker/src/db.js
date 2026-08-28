export async function getBookingsForDate(db, dateStr) {
  const { results } = await db.prepare(
    `SELECT id, date, slot_time, client_name, client_phone, service, source
     FROM bookings WHERE date = ? AND status = 'confirmed' ORDER BY slot_time`
  ).bind(dateStr).all();
  return results;
}

export async function getBookedSlotsInRange(db, fromStr, toStr) {
  const { results } = await db.prepare(
    `SELECT date, slot_time FROM bookings
     WHERE date >= ? AND date <= ? AND status = 'confirmed'`
  ).bind(fromStr, toStr).all();
  return new Set(results.map(r => `${r.date}|${r.slot_time}`));
}

function generateConfirmToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function createBooking(db, { date, slot_time, client_name, client_phone, service, source }) {
  const confirmToken = generateConfirmToken();
  try {
    const result = await db.prepare(
      `INSERT INTO bookings (date, slot_time, client_name, client_phone, service, status, source, confirm_token)
       VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?)`
    ).bind(date, slot_time, client_name, client_phone, service, source, confirmToken).run();
    return { ok: true, id: result.meta.last_row_id, confirmToken };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return { ok: false, reason: 'slot_taken' };
    }
    throw e;
  }
}

export async function confirmBookingByToken(db, token, chatId) {
  const claim = await db.prepare(
    `UPDATE bookings SET client_chat_id = ?
     WHERE confirm_token = ? AND status = 'confirmed' AND client_chat_id IS NULL`
  ).bind(chatId, token).run();
  if (claim.meta.changes > 0) {
    const row = await db.prepare(
      `SELECT date, slot_time FROM bookings WHERE confirm_token = ?`
    ).bind(token).first();
    return { ok: true, alreadyConfirmed: false, date: row.date, slot_time: row.slot_time };
  }
  const row = await db.prepare(
    `SELECT date, slot_time, client_chat_id FROM bookings WHERE confirm_token = ? AND status = 'confirmed'`
  ).bind(token).first();
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.client_chat_id === chatId) {
    return { ok: true, alreadyConfirmed: true, date: row.date, slot_time: row.slot_time };
  }
  return { ok: false, reason: 'already_claimed' };
}

export async function getPendingReminderCandidates(db, dateStrings) {
  const placeholders = dateStrings.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT id, date, slot_time, client_name, client_phone, service, client_chat_id
     FROM bookings
     WHERE status = 'confirmed' AND client_chat_id IS NOT NULL AND reminder_sent = 0
       AND date IN (${placeholders})`
  ).bind(...dateStrings).all();
  return results;
}

export async function markReminderSent(db, id) {
  await db.prepare(`UPDATE bookings SET reminder_sent = 1 WHERE id = ?`).bind(id).run();
}

// Retention: drop bookings whose date is older than the cutoff. This is a
// demo site — client name + phone shouldn't sit in the DB indefinitely.
export async function deleteBookingsBefore(db, dateStr) {
  const res = await db.prepare(`DELETE FROM bookings WHERE date < ?`).bind(dateStr).run();
  return res?.meta?.changes ?? 0;
}

export async function getAdminChatId(db) {
  const row = await db.prepare(`SELECT value FROM config WHERE key = 'admin_chat_id'`).first();
  return row ? row.value : null;
}

export async function claimAdminChatId(db, chatId) {
  await db.prepare(
    `INSERT INTO config (key, value) VALUES ('admin_chat_id', ?)
     ON CONFLICT(key) DO NOTHING`
  ).bind(String(chatId)).run();
  const current = await getAdminChatId(db);
  return current === String(chatId);
}

export async function getSession(db, chatId) {
  const row = await db.prepare(
    `SELECT step, draft_json FROM bot_sessions WHERE chat_id = ?`
  ).bind(chatId).first();
  if (!row) return null;
  return { step: row.step, draft: JSON.parse(row.draft_json) };
}

export async function setSession(db, chatId, step, draft) {
  await db.prepare(
    `INSERT INTO bot_sessions (chat_id, step, draft_json, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(chat_id) DO UPDATE SET step = excluded.step, draft_json = excluded.draft_json, updated_at = excluded.updated_at`
  ).bind(chatId, step, JSON.stringify(draft)).run();
}

export async function clearSession(db, chatId) {
  await db.prepare(`DELETE FROM bot_sessions WHERE chat_id = ?`).bind(chatId).run();
}
