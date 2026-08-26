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

export async function createBooking(db, { date, slot_time, client_name, client_phone, service, source }) {
  try {
    const result = await db.prepare(
      `INSERT INTO bookings (date, slot_time, client_name, client_phone, service, status, source)
       VALUES (?, ?, ?, ?, ?, 'confirmed', ?)`
    ).bind(date, slot_time, client_name, client_phone, service, source).run();
    return { ok: true, id: result.meta.last_row_id };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return { ok: false, reason: 'slot_taken' };
    }
    throw e;
  }
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
