# Telegram Booking System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake, client-side-only booking form on `variant-12-baroque-silk-drape.html` with a real booking system: a day/slot picker on the site backed by a shared Cloudflare D1 registry, a Telegram bot that notifies the master of new site bookings and lets her list/create bookings from her phone, and a live GitHub Pages deployment of the site.

**Architecture:** A single Cloudflare Worker (`worker/`) exposes two public HTTP endpoints (`GET /api/availability`, `POST /api/book`) consumed by a new `assets/booking.js` widget on the site, plus a `POST /telegram-webhook` endpoint that receives Telegram updates and drives the bot's commands and a stateful "manual booking" conversation. All three surfaces (site form, availability calendar, bot) read and write the same D1 `bookings` table, so there is exactly one registry. The Worker and the static site are two separate deployables: the Worker ships to Cloudflare via `wrangler`, the site ships to GitHub Pages via a plain `git push`.

**Tech Stack:** Cloudflare Workers + D1 (SQLite), plain ES modules for the Worker (bundled by Wrangler — this project has its own `package.json`/`node_modules` and is NOT subject to the site's file:// / no-bundler constraint), Node's built-in `node:test` runner for Worker-side unit tests, vanilla plain-`<script>` JS for the site widget (matching the existing `assets/quiz.js` / `assets/tryon.js` convention), GitHub Pages for static hosting.

**Spec:** This plan's "What must be built" was fully specified inline by the user during planning (see conversation) rather than a separate spec file — the confirmed requirements are reproduced in Global Constraints below so this plan is self-contained.

## Global Constraints

- Scope is **only** `variant-12-baroque-silk-drape.html`. Do not touch `variant-17-lilac-sky.html` or `variant-18-sicilian-sun.html`.
- Fixed schedule, not duration-based: exactly 3 slots/working day — `10:00`, `13:00`, `16:00`. Working days are Monday–Friday only. Saturday/Sunday have zero slots.
- Timezone: Europe/Moscow, UTC+3, no DST — treated as a fixed +3h offset from UTC everywhere in this system (site, Worker, bot all agree on this).
- Backend: Cloudflare Workers + D1, chosen for its permanent free tier at this scale. Static site: GitHub Pages. Telegram bot: brand new bot via @BotFather.
- Verified local tooling: Node v24.19.0 / npm 11.17.0 / npx 11.17.0 are installed; `wrangler` is **not** installed globally — always invoke it as `npx wrangler`. `gh` CLI and `brew` are **not** installed — GitHub repo creation, push, and Pages setup all go through the GitHub REST API directly via `curl`, authenticated with a user-supplied Personal Access Token (see Task 16), not through `gh` or the web UI. The site directory was initialized as a local git repo before Task 1 (a pre-flight ruling — see ledger — since the SDD execution process needs per-task commits from the start; local `user.name`/`user.email` are already configured on this repo). No global `git user.name`/`user.email` is configured on this machine — only this repo's local config.
- GitHub credentials: the user provides a scoped Personal Access Token (`repo` scope), never her account password (GitHub has not accepted password auth for git operations since August 2021, and sharing an account password is unnecessary and unsafe regardless). The token is used inline in specific `curl`/`git push` command invocations only — it must never be written into `.git/config`, committed to any file, or left embedded in the stored `origin` remote URL.
- The Worker project (`worker/`) is a normal bundled Node/ESM project — use `import`/`export` freely there. This is unrelated to the site's constraint that browser-loaded scripts (`assets/*.js`) stay plain, global, non-module scripts loadable via `file://`; that constraint still applies to `assets/booking.js`.
- Reuse the site's existing CSS custom properties (`--accent`, `--surface`, `--border`, `--ink`, `--ink-soft`, etc.) and existing patterns (`.quiz-opt`, `.filter-btn`, `.form-msg.is-error`'s `#c17a6a`) for any new UI — no new hardcoded colors.
- Every task that depends on a manual step must not be started until that manual step's task is checked off and its output (token, URL, confirmation) has been received.

---

## File Structure

```
site-lashmaker/
├── variant-12-baroque-silk-drape.html   (modify: booking section, schedule text, remove old fake submit JS)
├── assets/
│   └── booking.js                        (new: site-side calendar/slot picker + real submit)
├── worker/                                (new: separate Cloudflare Worker project)
│   ├── package.json
│   ├── wrangler.toml
│   ├── schema.sql
│   ├── .dev.vars                          (local-only secrets, gitignored)
│   ├── .gitignore
│   └── src/
│       ├── slots.js         + slots.test.js
│       ├── db.js
│       ├── telegram.js      + telegram.test.js
│       ├── bot.js           + bot.test.js
│       └── index.js
└── docs/superpowers/plans/2026-08-26-telegram-booking-system.md  (this file)
```

---

### Task 1: Scaffold the Worker project

**Files:**
- Create: `worker/package.json`
- Create: `worker/wrangler.toml`
- Create: `worker/.gitignore`

**Interfaces:**
- Produces: a `worker/` directory where `npx wrangler <cmd>` resolves to the pinned local `wrangler` devDependency, and a `DB` D1 binding name that every later task's code (`env.DB`) relies on.

- [ ] **Step 1: Create the directory and package.json**

```bash
mkdir -p /Users/alexandra/Desktop/site-lashmaker/worker/src
```

`worker/package.json`:
```json
{
  "name": "lashmaker-booking-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --experimental-test-module-mocks --test src/",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^3.90.0"
  }
}
```

- [ ] **Step 2: Create wrangler.toml with a placeholder database_id**

`worker/wrangler.toml`:
```toml
name = "lashmaker-booking"
main = "src/index.js"
compatibility_date = "2024-09-23"

[[d1_databases]]
binding = "DB"
database_name = "lashmaker-bookings"
database_id = "local-placeholder"
```

- [ ] **Step 3: gitignore local-only files**

`worker/.gitignore`:
```
node_modules/
.dev.vars
.wrangler/
```

- [ ] **Step 4: Install dependencies and verify wrangler resolves**

```bash
cd /Users/alexandra/Desktop/site-lashmaker/worker
npm install
npx wrangler --version
```

Expected: prints a `⛅️ wrangler 3.x.x` version line, no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/alexandra/Desktop/site-lashmaker
git add worker/package.json worker/wrangler.toml worker/.gitignore worker/package-lock.json
git commit -m "chore(worker): scaffold Cloudflare Worker project"
```

---

### Task 2: Slot/date logic (`slots.js`) — pure functions, TDD

**Files:**
- Create: `worker/src/slots.js`
- Test: `worker/src/slots.test.js`

**Interfaces:**
- Produces: `FIXED_SLOTS` (array of 3 time strings), `isValidDateFormat(str)`, `isValidSlotTime(str)`, `isWorkingDay(dateStr)`, `addDays(dateStr, n)`, `getTodayMoscow()`, `getTomorrowMoscow()`, `nextWorkingDays(fromDateStr, count)`, `formatDateLabel(dateStr)` — all consumed by `db.js`, `bot.js`, `index.js` in later tasks.

- [ ] **Step 1: Write the failing tests**

`worker/src/slots.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDateFormat, isValidSlotTime, isWorkingDay, addDays,
  nextWorkingDays, formatDateLabel
} from './slots.js';

test('isValidDateFormat accepts well-formed dates', () => {
  assert.equal(isValidDateFormat('2026-08-28'), true);
});

test('isValidDateFormat rejects malformed dates', () => {
  assert.equal(isValidDateFormat('2026-13-40'), false);
  assert.equal(isValidDateFormat('28-08-2026'), false);
  assert.equal(isValidDateFormat('not-a-date'), false);
});

test('isValidSlotTime only accepts the three fixed slots', () => {
  assert.equal(isValidSlotTime('10:00'), true);
  assert.equal(isValidSlotTime('11:00'), false);
});

test('isWorkingDay is true Mon-Fri, false Sat/Sun', () => {
  assert.equal(isWorkingDay('2026-08-28'), true);  // Friday
  assert.equal(isWorkingDay('2026-08-29'), false); // Saturday
  assert.equal(isWorkingDay('2026-08-30'), false); // Sunday
  assert.equal(isWorkingDay('2026-08-31'), true);  // Monday
});

test('addDays advances the calendar date, including month rollover', () => {
  assert.equal(addDays('2026-08-30', 1), '2026-08-31');
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
});

test('nextWorkingDays skips weekends and returns the requested count', () => {
  const days = nextWorkingDays('2026-08-28', 4); // starts Friday
  assert.deepEqual(days, ['2026-08-28', '2026-08-31', '2026-09-01', '2026-09-02']);
});

test('formatDateLabel renders a short Russian weekday + day.month label', () => {
  assert.equal(formatDateLabel('2026-08-28'), 'Пт 28.08');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/alexandra/Desktop/site-lashmaker/worker
npm test
```

Expected: FAIL — `slots.js` does not exist yet.

- [ ] **Step 3: Implement slots.js**

`worker/src/slots.js`:
```js
export const FIXED_SLOTS = ['10:00', '13:00', '16:00'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateFormat(str) {
  if (typeof str !== 'string' || !DATE_RE.test(str)) return false;
  const d = new Date(str + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

export function isValidSlotTime(str) {
  return FIXED_SLOTS.includes(str);
}

export function isWorkingDay(dateStr) {
  const day = new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0=Sun..6=Sat
  return day >= 1 && day <= 5;
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

export function getTodayMoscow() {
  return new Date(Date.now() + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
}

export function getTomorrowMoscow() {
  return addDays(getTodayMoscow(), 1);
}

export function nextWorkingDays(fromDateStr, count) {
  const result = [];
  let cursor = fromDateStr;
  while (result.length < count) {
    if (isWorkingDay(cursor)) result.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return result;
}

const WEEKDAY_LABELS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const label = WEEKDAY_LABELS_RU[d.getUTCDay()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${label} ${day}.${month}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add worker/src/slots.js worker/src/slots.test.js
git commit -m "feat(worker): add slot/date scheduling logic"
```

---

### Task 3: D1 schema

**Files:**
- Create: `worker/schema.sql`

**Interfaces:**
- Produces: tables `bookings`, `config`, `bot_sessions` that every later task's `db.js` functions read/write.

- [ ] **Step 1: Write the schema**

`worker/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  slot_time TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  service TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot_confirmed
  ON bookings(date, slot_time)
  WHERE status = 'confirmed';

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_sessions (
  chat_id INTEGER PRIMARY KEY,
  step TEXT NOT NULL,
  draft_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Apply it to a local D1 database and verify**

```bash
cd /Users/alexandra/Desktop/site-lashmaker/worker
npx wrangler d1 execute lashmaker-bookings --local --file schema.sql
npx wrangler d1 execute lashmaker-bookings --local --command "SELECT name FROM sqlite_master WHERE type='table';"
```

Expected: the second command lists `bookings`, `config`, `bot_sessions` (plus SQLite's internal `sqlite_sequence`).

- [ ] **Step 3: Commit**

```bash
git add worker/schema.sql
git commit -m "feat(worker): add D1 schema for bookings, config, bot_sessions"
```

---

### Task 4: D1 query helpers (`db.js`)

**Files:**
- Create: `worker/src/db.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (takes a raw D1 `db` binding as its first argument).
- Produces: `getBookingsForDate(db, dateStr)`, `getBookedSlotsInRange(db, fromStr, toStr)` (returns a `Set` of `"date|slot_time"` keys), `createBooking(db, {date, slot_time, client_name, client_phone, service, source})` (returns `{ok:true, id}` or `{ok:false, reason:'slot_taken'}`), `getAdminChatId(db)`, `claimAdminChatId(db, chatId)` (returns `true` if this chat now owns admin, `false` if someone else already does), `getSession(db, chatId)`, `setSession(db, chatId, step, draft)`, `clearSession(db, chatId)` — consumed by `index.js` and `bot.js`.

- [ ] **Step 1: Implement db.js**

`worker/src/db.js`:
```js
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
```

- [ ] **Step 2: Verify against the local D1 database with a throwaway script**

```bash
cd /Users/alexandra/Desktop/site-lashmaker/worker
npx wrangler d1 execute lashmaker-bookings --local --command \
  "INSERT INTO bookings (date, slot_time, client_name, client_phone, service, source) VALUES ('2026-08-28','10:00','Тест','+79990000000','Классика','site');"
npx wrangler d1 execute lashmaker-bookings --local --command \
  "INSERT INTO bookings (date, slot_time, client_name, client_phone, service, source) VALUES ('2026-08-28','10:00','Дубликат','+79990000001','Классика','site');"
```

Expected: the second INSERT fails with a UNIQUE constraint error (proves the partial unique index works — a confirmed booking cannot double-book a slot). Clean up the test row before continuing:

```bash
npx wrangler d1 execute lashmaker-bookings --local --command "DELETE FROM bookings WHERE client_name='Тест';"
```

- [ ] **Step 3: Commit**

```bash
git add worker/src/db.js
git commit -m "feat(worker): add D1 query helpers"
```

---

### Task 5: Telegram API helper module (`telegram.js`) — TDD

**Files:**
- Create: `worker/src/telegram.js`
- Test: `worker/src/telegram.test.js`

**Interfaces:**
- Produces: `buildSendMessagePayload(chatId, text, replyMarkup?)`, `buildAnswerCallbackPayload(callbackQueryId, text?)`, `inlineKeyboard(rows)` (pure, unit-tested), and `sendMessage(env, chatId, text, replyMarkup?)`, `answerCallbackQuery(env, callbackQueryId, text?)` (thin `fetch` wrappers using `env.BOT_TOKEN`, not directly unit-tested — exercised in later integration tests). Consumed by `index.js` and `bot.js`.

- [ ] **Step 1: Write the failing tests**

`worker/src/telegram.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSendMessagePayload, buildAnswerCallbackPayload, inlineKeyboard } from './telegram.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/alexandra/Desktop/site-lashmaker/worker
npm test
```

Expected: FAIL — `telegram.js` does not exist yet.

- [ ] **Step 3: Implement telegram.js**

`worker/src/telegram.js`:
```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all 4 new tests pass (plus the 7 from Task 2).

- [ ] **Step 5: Commit**

```bash
git add worker/src/telegram.js worker/src/telegram.test.js
git commit -m "feat(worker): add Telegram Bot API helper module"
```

---

### Task 6: Worker HTTP routes — `/api/availability` and `/api/book`

**Files:**
- Create: `worker/src/index.js`

**Interfaces:**
- Consumes: `isValidDateFormat`, `isValidSlotTime`, `isWorkingDay`, `FIXED_SLOTS` from `slots.js`; `getBookedSlotsInRange`, `createBooking`, `getAdminChatId` from `db.js`; `sendMessage` from `telegram.js`.
- Produces: a `fetch(request, env)` default export — the Worker's entry point, consumed by Wrangler itself and (indirectly) by `index.test` via `wrangler dev`.

- [ ] **Step 1: Implement index.js (availability + book routes only for now; webhook route added in Task 8)**

`worker/src/index.js`:
```js
import { isValidDateFormat, isValidSlotTime, isWorkingDay, FIXED_SLOTS } from './slots.js';
import { getBookedSlotsInRange, createBooking, getAdminChatId } from './db.js';
import { sendMessage } from './telegram.js';

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
    return json({ error: 'not_found' }, 404);
  }
};
```

- [ ] **Step 2: Run it locally and verify with curl**

```bash
cd /Users/alexandra/Desktop/site-lashmaker/worker
npx wrangler dev --local --port 8787 &
sleep 2
curl -s "http://127.0.0.1:8787/api/availability?from=2026-08-24&to=2026-08-26"
```

Expected JSON (Mon 08-24 is fully free, weekend day has `working:false` and empty slots):
```json
{"days":[{"date":"2026-08-24","working":true,"slots":[{"time":"10:00","free":true},{"time":"13:00","free":true},{"time":"16:00","free":true}]},{"date":"2026-08-25","working":true,"slots":[{"time":"10:00","free":true},{"time":"13:00","free":true},{"time":"16:00","free":true}]},{"date":"2026-08-26","working":true,"slots":[{"time":"10:00","free":true},{"time":"13:00","free":true},{"time":"16:00","free":true}]}]}
```

```bash
curl -s -X POST http://127.0.0.1:8787/api/book \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-08-24","slot_time":"10:00","client_name":"Мария","client_phone":"+79991112233","service":"Классика"}'
```

Expected: `{"ok":true,"id":1}` (no admin chat id is claimed yet in local D1, so the Telegram-notify branch is skipped — no network call, no crash).

```bash
curl -s "http://127.0.0.1:8787/api/availability?from=2026-08-24&to=2026-08-24"
```

Expected: the `10:00` slot for `2026-08-24` now shows `"free":false`.

```bash
curl -s -X POST http://127.0.0.1:8787/api/book \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-08-24","slot_time":"10:00","client_name":"Другая","client_phone":"+79991112244","service":"Классика"}'
```

Expected: `{"error":"slot_taken"}` with HTTP 409 (double-booking correctly rejected).

Clean up the test row and stop the dev server:
```bash
npx wrangler d1 execute lashmaker-bookings --local --command "DELETE FROM bookings WHERE client_name='Мария';"
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add worker/src/index.js
git commit -m "feat(worker): add /api/availability and /api/book routes"
```

---

### Task 7: Bot command/flow logic (`bot.js`) — TDD with a fake DB

**Files:**
- Create: `worker/src/bot.js`
- Test: `worker/src/bot.test.js`

**Interfaces:**
- Consumes: `FIXED_SLOTS`, `isValidDateFormat`, `getTodayMoscow`, `getTomorrowMoscow`, `nextWorkingDays`, `formatDateLabel` from `slots.js`; `getBookingsForDate`, `getBookedSlotsInRange`, `createBooking`, `getAdminChatId`, `claimAdminChatId`, `getSession`, `setSession`, `clearSession` from `db.js`; `sendMessage`, `answerCallbackQuery`, `inlineKeyboard` from `telegram.js`.
- Produces: `handleMessage(env, message)`, `handleCallbackQuery(env, callbackQuery)`, `handleTelegramUpdate(env, update)` — consumed by `index.js` in Task 8.

- [ ] **Step 1: Write the failing tests (mocking db.js and telegram.js)**

`worker/src/bot.test.js`:
```js
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
  namedExports: {
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
  namedExports: {
    sendMessage: async (env, chatId, text, replyMarkup) => { sentMessages.push({ chatId, text, replyMarkup }); },
    answerCallbackQuery: async () => {},
    inlineKeyboard: (rows) => ({ inline_keyboard: rows })
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/alexandra/Desktop/site-lashmaker/worker
npm test
```

Expected: FAIL — `bot.js` does not exist yet.

- [ ] **Step 3: Implement bot.js**

`worker/src/bot.js`:
```js
import {
  FIXED_SLOTS, isValidDateFormat, getTodayMoscow, getTomorrowMoscow,
  nextWorkingDays, formatDateLabel
} from './slots.js';
import {
  getBookingsForDate, getBookedSlotsInRange, createBooking,
  getAdminChatId, claimAdminChatId, getSession, setSession, clearSession
} from './db.js';
import { sendMessage, answerCallbackQuery, inlineKeyboard } from './telegram.js';

const HELP_TEXT = [
  'Я бот записи Александры. Вот что я умею:',
  '/today — записи на сегодня',
  '/tomorrow — записи на завтра',
  '/date ГГГГ-ММ-ДД — записи на любую дату',
  '/book — создать новую запись вручную'
].join('\n');

const PHONE_RE = /^[\d\s\+\-\(\)]{10,18}$/;

function formatBookingLine(b) {
  return `• ${b.slot_time} — ${b.client_name}, ${b.client_phone} (${b.service})`;
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
      `✅ Запись создана: ${draft.client_name}, ${draft.client_phone}, ${draft.service} — ${formatDateLabel(draft.date)} ${draft.slot_time}`);
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all 6 new tests pass (plus the 11 from earlier tasks — 17 total).

- [ ] **Step 5: Commit**

```bash
git add worker/src/bot.js worker/src/bot.test.js
git commit -m "feat(worker): add Telegram bot commands and manual-booking flow"
```

---

### Task 8: Wire the Telegram webhook route into `index.js`

**Files:**
- Modify: `worker/src/index.js`
- Create: `worker/.dev.vars` (local-only, gitignored — do not commit)

**Interfaces:**
- Consumes: `handleTelegramUpdate` from `bot.js`.
- Produces: `POST /telegram-webhook` route, guarded by `env.WEBHOOK_SECRET`.

- [ ] **Step 1: Add local-only secrets for dev testing**

`worker/.dev.vars`:
```
BOT_TOKEN=placeholder-token-for-local-dev
WEBHOOK_SECRET=localtestsecret
```

- [ ] **Step 2: Add the webhook route**

In `worker/src/index.js`, add the import and route handler:

```js
import { handleTelegramUpdate } from './bot.js';
```

(add alongside the existing imports at the top of the file)

```js
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
```

(add this function alongside `handleAvailability`/`handleBook`)

In the exported `fetch` handler, add the route before the final `return json({ error: 'not_found' }, 404);`:

```js
    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      return handleTelegramWebhook(request, env);
    }
```

- [ ] **Step 3: Verify locally with curl**

```bash
cd /Users/alexandra/Desktop/site-lashmaker/worker
npx wrangler dev --local --port 8787 &
sleep 2

curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/telegram-webhook \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: wrong-secret" \
  -d '{"message":{"chat":{"id":555},"text":"/start"}}'
```

Expected: `403` (wrong secret rejected).

```bash
curl -s -X POST http://127.0.0.1:8787/telegram-webhook \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: localtestsecret" \
  -d '{"message":{"chat":{"id":555},"text":"/start"}}'

npx wrangler d1 execute lashmaker-bookings --local --command "SELECT * FROM config;"
```

Expected: the curl returns `ok`, and the `config` query shows one row: `admin_chat_id | 555` (the outgoing Telegram `sendMessage` call itself will fail silently against the placeholder token — that's expected and fine at this stage; D1 state is the real signal here, real delivery is verified in Task 13).

```bash
npx wrangler d1 execute lashmaker-bookings --local --command "DELETE FROM config WHERE key='admin_chat_id';"
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add worker/src/index.js
git commit -m "feat(worker): add /telegram-webhook route"
```
(`.dev.vars` is gitignored and intentionally not committed.)

---

### Task 9: Site changes — calendar/slot picker, real submit, schedule text

**Files:**
- Create: `assets/booking.js`
- Modify: `variant-12-baroque-silk-drape.html` (booking form markup, `.booking-info` schedule text, `.contacts-info` schedule text, remove the old fake submit handler, add new CSS rules, add the new `<script src="assets/booking.js?v=1">` tag)

**Interfaces:**
- Consumes: the deployed Worker's `GET /api/availability` and `POST /api/book` (against `http://127.0.0.1:8787` for this task's local testing; updated to the real URL in Task 15).
- Produces: a working booking UI — no other file depends on this one.

- [ ] **Step 1: Replace the booking form markup**

In `variant-12-baroque-silk-drape.html`, find this exact block:

```html
      <form class="booking-form" id="bookingForm">
        <div class="form-grid-2">
          <div class="form-row"><label for="name">Имя</label><input type="text" id="name" name="name" placeholder="Как к вам обращаться" required></div>
          <div class="form-row"><label for="phone">Телефон</label><input type="tel" id="phone" name="phone" placeholder="+7 (___) ___-__-__" required></div>
        </div>
        <div class="form-grid-2">
          <div class="form-row"><label for="date">Желаемая дата</label><input type="date" id="date" name="date" required></div>
          <div class="form-row">
            <label for="service">Услуга</label>
            <select id="service" name="service" required>
              <option value="">Выберите услугу</option>
              <option>Классическое наращивание</option>
              <option>2D объём</option>
              <option>3D–5D объём</option>
              <option>Мега объём</option>
              <option>Ламинирование ресниц</option>
              <option>Коррекция</option>
              <option>Снятие ресниц</option>
              <option>Обучение / консультация</option>
            </select>
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Отправить заявку</button>
        <div class="form-msg" id="formMsg"></div>
      </form>
```

Replace it with:

```html
      <form class="booking-form" id="bookingForm">
        <div class="booking-slots" id="bookingSlots">
          <div class="booking-slots-head">
            <button type="button" class="booking-cal-nav" id="bookingPrevWeek" aria-label="Раньше">‹</button>
            <div class="booking-slots-label" id="bookingSlotsLabel">Выберите дату</div>
            <button type="button" class="booking-cal-nav" id="bookingNextWeek" aria-label="Позже">›</button>
          </div>
          <div class="booking-days" id="bookingDays"></div>
          <div class="booking-times" id="bookingTimes"></div>
        </div>
        <input type="hidden" id="date" name="date" required>
        <input type="hidden" id="slotTime" name="slot_time" required>
        <div class="form-grid-2">
          <div class="form-row"><label for="name">Имя</label><input type="text" id="name" name="name" placeholder="Как к вам обращаться" required></div>
          <div class="form-row"><label for="phone">Телефон</label><input type="tel" id="phone" name="phone" placeholder="+7 (___) ___-__-__" required></div>
        </div>
        <div class="form-row">
          <label for="service">Услуга</label>
          <select id="service" name="service" required>
            <option value="">Выберите услугу</option>
            <option>Классическое наращивание</option>
            <option>2D объём</option>
            <option>3D–5D объём</option>
            <option>Мега объём</option>
            <option>Ламинирование ресниц</option>
            <option>Коррекция</option>
            <option>Снятие ресниц</option>
            <option>Обучение / консультация</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="bookingSubmitBtn" disabled>Отправить заявку</button>
        <div class="form-msg" id="formMsg"></div>
      </form>
      <script src="assets/booking.js?v=1"></script>
```

- [ ] **Step 2: Update the two schedule text locations**

Find:
```html
          <li>🕙 Пн–Сб: 10:00–20:00, Вс — выходной</li>
```
Replace with:
```html
          <li>🕙 Пн–Пт: 10:00, 13:00, 16:00 (Сб–Вс — выходные)</li>
```

Find:
```html
        <div class="contact-item"><div class="contact-icon">🕙</div><div><h4>Часы работы</h4><p>Пн–Сб: 10:00–20:00, Вс — выходной</p></div></div>
```
Replace with:
```html
        <div class="contact-item"><div class="contact-icon">🕙</div><div><h4>Часы работы</h4><p>Пн–Пт: 10:00, 13:00, 16:00</p></div></div>
```

- [ ] **Step 3: Remove the old fake submit handler**

Find this exact block in the inline `<script>` near the bottom of the file:

```js
const dateInput = document.getElementById('date');
dateInput.min = new Date().toISOString().split('T')[0];
const form = document.getElementById('bookingForm');
form.addEventListener('submit', e=>{
  e.preventDefault();
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const phoneRe = /^[\d\s\+\-\(\)]{10,18}$/;
  const msgEl = document.getElementById('formMsg');
  if(name.length < 2){ msgEl.textContent = 'Пожалуйста, укажите имя.'; msgEl.className='form-msg is-error'; return; }
  if(!phoneRe.test(phone)){ msgEl.textContent = 'Проверьте номер телефона.'; msgEl.className='form-msg is-error'; return; }
  msgEl.textContent = 'Спасибо, ' + name + '! Заявка отправлена — я свяжусь с вами для подтверждения записи.';
  msgEl.className = 'form-msg is-success';
  form.reset();
  dateInput.min = new Date().toISOString().split('T')[0];
});
```

Delete it entirely — `assets/booking.js` now owns this behavior.

- [ ] **Step 4: Add CSS for the new widget**

Find this exact block:
```css
  .form-msg{margin-top:16px;font-size:13.5px;font-weight:600;min-height:20px;}
  .form-msg.is-success{color:var(--accent);}
  .form-msg.is-error{color:#c17a6a;}
```

Replace with (keeping the original three rules, adding the new ones after):
```css
  .form-msg{margin-top:16px;font-size:13.5px;font-weight:600;min-height:20px;}
  .form-msg.is-success{color:var(--accent);}
  .form-msg.is-error{color:#c17a6a;}
  .booking-slots{margin-bottom:24px;}
  .booking-slots-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
  .booking-slots-label{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);}
  .booking-cal-nav{width:30px;height:30px;border:1px solid var(--border);background:transparent;color:var(--ink-soft);cursor:pointer;font-size:16px;line-height:1;transition:.2s;}
  .booking-cal-nav:hover{border-color:var(--accent);color:var(--accent);}
  .booking-days{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;}
  .booking-day-btn{padding:10px 14px;border:1px solid var(--border);background:transparent;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer;transition:.2s;white-space:nowrap;}
  .booking-day-btn:hover{border-color:var(--accent);}
  .booking-day-btn.is-selected{border-color:var(--accent);background:rgba(201,162,74,.12);color:var(--accent);}
  .booking-times{display:flex;flex-wrap:wrap;gap:8px;}
  .booking-time-btn{padding:10px 18px;border:1px solid var(--border);background:transparent;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;transition:.2s;}
  .booking-time-btn:hover:not(:disabled){border-color:var(--accent);}
  .booking-time-btn.is-selected{border-color:var(--accent);background:rgba(201,162,74,.12);color:var(--accent);}
  .booking-time-btn.is-booked{opacity:.4;text-decoration:line-through;cursor:not-allowed;}
  .booking-error{color:#c17a6a;font-size:13.5px;margin:0;}
```

- [ ] **Step 5: Implement assets/booking.js**

`assets/booking.js`:
```js
(function(){
  var WORKER_BASE_URL = 'http://127.0.0.1:8787'; // updated to the real deployed Worker URL in a later task

  var FIXED_SLOTS = ['10:00','13:00','16:00'];
  var WEEKDAY_LABELS = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

  function isWorkingDay(dateStr){
    var day = new Date(dateStr + 'T00:00:00Z').getUTCDay();
    return day >= 1 && day <= 5;
  }
  function addDays(dateStr, n){
    var d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0,10);
  }
  function formatDateLabel(dateStr){
    var d = new Date(dateStr + 'T00:00:00Z');
    var day = String(d.getUTCDate()).padStart(2,'0');
    var month = String(d.getUTCMonth()+1).padStart(2,'0');
    return WEEKDAY_LABELS[d.getUTCDay()] + ' ' + day + '.' + month;
  }
  function todayMoscow(){
    return new Date(Date.now() + 3*3600*1000).toISOString().slice(0,10);
  }
  function nextWorkingDays(fromDateStr, count){
    var result = [];
    var cursor = fromDateStr;
    while(result.length < count){
      if(isWorkingDay(cursor)) result.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return result;
  }

  var state = {
    pageStart: todayMoscow(),
    days: [],
    availability: {},
    selectedDate: null,
    selectedTime: null
  };

  var daysEl = document.getElementById('bookingDays');
  var timesEl = document.getElementById('bookingTimes');
  var labelEl = document.getElementById('bookingSlotsLabel');
  var prevBtn = document.getElementById('bookingPrevWeek');
  var nextBtn = document.getElementById('bookingNextWeek');
  var dateHiddenInput = document.getElementById('date');
  var slotHiddenInput = document.getElementById('slotTime');
  var form = document.getElementById('bookingForm');
  var submitBtn = document.getElementById('bookingSubmitBtn');
  var msgEl = document.getElementById('formMsg');

  function setSubmitEnabled(){
    submitBtn.disabled = !(state.selectedDate && state.selectedTime);
  }

  function fetchAvailability(from, to){
    return fetch(WORKER_BASE_URL + '/api/availability?from=' + from + '&to=' + to)
      .then(function(res){
        if(!res.ok) throw new Error('availability_failed');
        return res.json();
      })
      .then(function(data){
        data.days.forEach(function(d){ state.availability[d.date] = d.slots; });
      });
  }

  function renderDays(){
    daysEl.innerHTML = '';
    state.days.forEach(function(date){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'booking-day-btn' + (date === state.selectedDate ? ' is-selected' : '');
      btn.textContent = formatDateLabel(date);
      btn.addEventListener('click', function(){ selectDate(date); });
      daysEl.appendChild(btn);
    });
  }

  function renderTimes(){
    timesEl.innerHTML = '';
    if(!state.selectedDate){ return; }
    var slots = state.availability[state.selectedDate] || [];
    slots.forEach(function(s){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'booking-time-btn' + (s.free ? '' : ' is-booked') + (s.time === state.selectedTime ? ' is-selected' : '');
      btn.textContent = s.free ? s.time : (s.time + ' — занято');
      btn.disabled = !s.free;
      if(s.free){
        btn.addEventListener('click', function(){ selectTime(s.time); });
      }
      timesEl.appendChild(btn);
    });
  }

  function selectDate(date){
    state.selectedDate = date;
    state.selectedTime = null;
    dateHiddenInput.value = date;
    slotHiddenInput.value = '';
    labelEl.textContent = formatDateLabel(date);
    renderDays();
    renderTimes();
    setSubmitEnabled();
  }

  function selectTime(time){
    state.selectedTime = time;
    slotHiddenInput.value = time;
    renderTimes();
    setSubmitEnabled();
  }

  function loadPage(){
    state.days = nextWorkingDays(state.pageStart, 7);
    var from = state.days[0];
    var to = state.days[state.days.length - 1];
    fetchAvailability(from, to).then(function(){
      renderDays();
      renderTimes();
    }).catch(function(){
      daysEl.innerHTML = '';
      timesEl.innerHTML = '<p class="booking-error">Не удалось загрузить расписание. Обновите страницу.</p>';
    });
  }

  prevBtn.addEventListener('click', function(){
    state.pageStart = addDays(state.days[0], -7);
    loadPage();
  });
  nextBtn.addEventListener('click', function(){
    state.pageStart = addDays(state.days[state.days.length - 1], 1);
    loadPage();
  });

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var name = form.name.value.trim();
    var phone = form.phone.value.trim();
    var service = form.service.value;
    var phoneRe = /^[\d\s\+\-\(\)]{10,18}$/;
    if(name.length < 2){ msgEl.textContent = 'Пожалуйста, укажите имя.'; msgEl.className = 'form-msg is-error'; return; }
    if(!phoneRe.test(phone)){ msgEl.textContent = 'Проверьте номер телефона.'; msgEl.className = 'form-msg is-error'; return; }
    if(!service){ msgEl.textContent = 'Выберите услугу.'; msgEl.className = 'form-msg is-error'; return; }
    if(!state.selectedDate || !state.selectedTime){ msgEl.textContent = 'Выберите дату и время записи.'; msgEl.className = 'form-msg is-error'; return; }
    submitBtn.disabled = true;
    fetch(WORKER_BASE_URL + '/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: state.selectedDate,
        slot_time: state.selectedTime,
        client_name: name,
        client_phone: phone,
        service: service
      })
    }).then(function(res){
      if(res.status === 409){ throw new Error('slot_taken'); }
      if(!res.ok){ throw new Error('failed'); }
      return res.json();
    }).then(function(){
      msgEl.textContent = 'Спасибо, ' + name + '! Заявка отправлена — я свяжусь с вами для подтверждения записи.';
      msgEl.className = 'form-msg is-success';
      form.reset();
      state.selectedDate = null;
      state.selectedTime = null;
      state.availability = {};
      loadPage();
    }).catch(function(err){
      if(err.message === 'slot_taken'){
        msgEl.textContent = 'Этот слот только что заняли. Пожалуйста, выберите другое время.';
        loadPage();
      } else {
        msgEl.textContent = 'Не получилось отправить заявку. Проверьте связь с интернетом и попробуйте ещё раз.';
      }
      msgEl.className = 'form-msg is-error';
      setSubmitEnabled();
    });
  });

  loadPage();
})();
```

- [ ] **Step 6: Verify end-to-end locally with Playwright**

```bash
cd /Users/alexandra/Desktop/site-lashmaker/worker
npx wrangler d1 execute lashmaker-bookings --local --command "DELETE FROM bookings;"
npx wrangler dev --local --port 8787 &
cd /Users/alexandra/Desktop/site-lashmaker
python3 -m http.server 8743 &
sleep 2
```

Using the Playwright MCP tools: navigate to `http://localhost:8743/variant-12-baroque-silk-drape.html`, scroll to `#booking`, confirm 7 day buttons render in `#bookingDays` and clicking the first one shows 3 free `.booking-time-btn` buttons in `#bookingTimes`. Click a free time button, fill `#name`/`#phone`/`#service`, submit, and confirm `#formMsg` shows the success text. Then verify the row landed in D1:

```bash
npx wrangler d1 execute lashmaker-bookings --local --command "SELECT date, slot_time, client_name, source FROM bookings;"
```

Expected: one row with `source = 'site'`. Clean up:

```bash
npx wrangler d1 execute lashmaker-bookings --local --command "DELETE FROM bookings;"
kill %1 %2
```

- [ ] **Step 7: Commit**

```bash
cd /Users/alexandra/Desktop/site-lashmaker
git add assets/booking.js variant-12-baroque-silk-drape.html
git commit -m "feat(site): replace fake booking form with real calendar/slot picker"
```

---

### Task 10: MANUAL — Cloudflare account + wrangler login

**Steps (user):**
- [ ] If you don't already have one, create a free account at https://dash.cloudflare.com/sign-up.
- [ ] Tell me once you're logged into the Cloudflare dashboard in your browser, so I can run the login command below and you can complete the authorization prompt it opens.

**Steps (agent, after the user confirms she's logged in):**
- [ ] Run:
```bash
cd /Users/alexandra/Desktop/site-lashmaker/worker
npx wrangler login
```
This opens a browser tab for the user to click "Allow" on. Wait for her confirmation that she clicked Allow, then verify:
```bash
npx wrangler whoami
```
Expected: prints her Cloudflare account email — confirms the CLI is now authenticated for Task 11's deploy.

---

### Task 11: Deploy the Worker to Cloudflare

**Files:**
- Modify: `worker/wrangler.toml` (replace the placeholder `database_id`)

**Interfaces:**
- Produces: a live Worker URL of the form `https://lashmaker-booking.<subdomain>.workers.dev`, consumed by Tasks 13 and 15.

- [ ] **Step 1: Create the real D1 database**

```bash
cd /Users/alexandra/Desktop/site-lashmaker/worker
npx wrangler d1 create lashmaker-bookings
```

Expected output includes a `database_id = "..."` line — copy that UUID.

- [ ] **Step 2: Update wrangler.toml with the real database_id**

Replace `database_id = "local-placeholder"` with the real UUID from Step 1.

- [ ] **Step 3: Apply the schema to the remote database**

```bash
npx wrangler d1 execute lashmaker-bookings --remote --file schema.sql
npx wrangler d1 execute lashmaker-bookings --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
```

Expected: same three tables as the local check in Task 3.

- [ ] **Step 4: Deploy**

```bash
npx wrangler deploy
```

Expected output includes a line like `https://lashmaker-booking.<subdomain>.workers.dev` — this is the Worker's public URL. Note it down for Tasks 13 and 15.

- [ ] **Step 5: Smoke-test the deployed (but not-yet-secreted) endpoints**

```bash
curl -s "https://lashmaker-booking.<subdomain>.workers.dev/api/availability?from=2026-08-24&to=2026-08-24"
```

Expected: same JSON shape as the local test in Task 6, proving the deploy is live and D1-connected (note: `/telegram-webhook` will still 403 until Task 13 sets `WEBHOOK_SECRET` — that's expected).

- [ ] **Step 6: Commit**

```bash
cd /Users/alexandra/Desktop/site-lashmaker
git add worker/wrangler.toml
git commit -m "chore(worker): point wrangler.toml at the real D1 database"
```

---

### Task 12: MANUAL — create the Telegram bot

**Steps (user):**
- [ ] Open a chat with `@BotFather` in Telegram.
- [ ] Send `/newbot`.
- [ ] When asked for a name, send something like `Александра Рулева — Запись` (this is the display name, can be anything).
- [ ] When asked for a username, send something ending in `bot`, e.g. `alexandra_lash_booking_bot` (must be globally unique — BotFather will tell you if it's taken and let you try again).
- [ ] BotFather will reply with a message containing a token that looks like `123456789:AAExampleTokenString`. Copy that whole token and send it to me here in chat.

**What I do once you hand me the token:** nothing yet in this task — it's consumed in Task 13.

---

### Task 13: Set secrets, register the webhook

**Interfaces:**
- Consumes: the bot token from Task 12 and the Worker URL from Task 11.

- [ ] **Step 1: Set the BOT_TOKEN secret (agent runs this, pastes in the token the user provided)**

```bash
cd /Users/alexandra/Desktop/site-lashmaker/worker
npx wrangler secret put BOT_TOKEN
```
(paste the token when prompted)

- [ ] **Step 2: Generate and set a WEBHOOK_SECRET**

```bash
WEBHOOK_SECRET=$(openssl rand -hex 24)
echo "$WEBHOOK_SECRET" | npx wrangler secret put WEBHOOK_SECRET
```

- [ ] **Step 3: Register the webhook with Telegram**

```bash
BOT_TOKEN="<the token from Task 12>"
curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://lashmaker-booking.<subdomain>.workers.dev/telegram-webhook\",\"secret_token\":\"${WEBHOOK_SECRET}\"}"
```

Expected: `{"ok":true,"result":true,"description":"Webhook was set"}`.

- [ ] **Step 4: Verify webhook status**

```bash
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

Expected: `"url"` matches the Worker's `/telegram-webhook` endpoint and `"last_error_message"` is absent.

---

### Task 14: MANUAL — claim admin via /start, smoke-test commands

**Steps (user):**
- [ ] Open your new bot in Telegram (search for the username you chose in Task 12) and send `/start`.
- [ ] Confirm the bot replies with a welcome message and command list.
- [ ] Send `/today` and `/tomorrow` and confirm the bot replies (likely "записей нет" since nothing's booked yet).
- [ ] Tell me it worked (or paste me any error/odd behavior).

**Steps (agent, to independently verify without waiting on Telegram delivery):**
- [ ] Query the remote D1 config table to confirm the chat id was claimed:
```bash
cd /Users/alexandra/Desktop/site-lashmaker/worker
npx wrangler d1 execute lashmaker-bookings --remote --command "SELECT * FROM config;"
```
Expected: one row `admin_chat_id | <her chat id>`.

---

### Task 15: Point the site at the real Worker and re-verify end-to-end

**Files:**
- Modify: `assets/booking.js`

- [ ] **Step 1: Update the base URL**

In `assets/booking.js`, replace:
```js
  var WORKER_BASE_URL = 'http://127.0.0.1:8787'; // updated to the real deployed Worker URL in a later task
```
with:
```js
  var WORKER_BASE_URL = 'https://lashmaker-booking.<subdomain>.workers.dev';
```

- [ ] **Step 2: Full end-to-end test against the live Worker**

```bash
cd /Users/alexandra/Desktop/site-lashmaker
python3 -m http.server 8743 &
sleep 1
```

Using Playwright: open `http://localhost:8743/variant-12-baroque-silk-drape.html`, scroll to `#booking`, pick a free day/time, fill the form, submit, confirm the success message. Then:

```bash
cd worker
npx wrangler d1 execute lashmaker-bookings --remote --command "SELECT date, slot_time, client_name, source FROM bookings ORDER BY id DESC LIMIT 1;"
```

Expected: the new row, `source = 'site'`. Ask the user to confirm she received a Telegram notification for this booking (this is the one piece only she can observe — I cannot receive Telegram messages myself).

Clean up the test booking so it doesn't clutter her real registry:
```bash
npx wrangler d1 execute lashmaker-bookings --remote --command "DELETE FROM bookings WHERE client_name='<the test name used above>';"
cd ..
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add assets/booking.js
git commit -m "chore(site): point booking widget at the deployed Worker"
```

---

### Task 16: MANUAL — create a scoped GitHub Personal Access Token

**Steps (user):**
- [ ] Go to https://github.com/settings/tokens/new (this is the "classic token" creation page).
- [ ] Note: `site-lashmaker deploy`.
- [ ] Expiration: 90 days (or your preference — you can regenerate later if it expires).
- [ ] Scopes: check only **repo** (full control of repositories) — nothing else is needed.
- [ ] Click "Generate token" and copy it immediately — GitHub only shows it once.
- [ ] Send me the token, and your GitHub username.

Note on safety: this token only grants repository access, never your password, email, or account settings, and you can revoke it instantly anytime at https://github.com/settings/tokens without changing your password. I will use it only inline in the specific commands in Task 17 below — I will not commit it to any file or leave it sitting in `.git/config`.

---

### Task 17: Create the repo, push, and enable Pages — via the GitHub API

**Interfaces:**
- Consumes: the token and username from Task 16.
- Produces: a live repository and a GitHub Pages URL, consumed by Task 18's final smoke test.

- [ ] **Step 1: Create the repository via the API**

```bash
GITHUB_TOKEN="<token from Task 16>"
GITHUB_USER="<username from Task 16>"
curl -s -X POST https://api.github.com/user/repos \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -d '{"name":"site-lashmaker","private":false,"description":"Портфолио-сайт мастера по наращиванию ресниц"}'
```

Expected: JSON response containing `"full_name":"<GITHUB_USER>/site-lashmaker"`.

- [ ] **Step 2: Push the existing local history**

(git was already initialized before Task 1, with commits accumulated through every task since — this step just adds the remote and pushes what already exists.)

```bash
cd /Users/alexandra/Desktop/site-lashmaker
git remote add origin "https://github.com/${GITHUB_USER}/site-lashmaker.git"
git branch -M main
git push "https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/site-lashmaker.git" main
```

The token is used only inline in this one `git push` invocation's explicit URL — the stored `origin` remote (added just before, in the line above) stays a clean, token-free HTTPS URL. Verify nothing leaked into the stored config:

```bash
git remote -v
```

Expected: shows `https://github.com/<GITHUB_USER>/site-lashmaker.git` with no token visible.

- [ ] **Step 3: Enable GitHub Pages via the API**

```bash
curl -s -X POST "https://api.github.com/repos/${GITHUB_USER}/site-lashmaker/pages" \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -d '{"source":{"branch":"main","path":"/"}}'
```

Expected: JSON with `"status":"queued"` or similar (build just kicked off).

- [ ] **Step 4: Poll until the Pages build is live**

```bash
curl -s "https://api.github.com/repos/${GITHUB_USER}/site-lashmaker/pages" \
  -H "Authorization: token ${GITHUB_TOKEN}"
```

Expected eventually: `"status":"built"` and `"html_url":"https://<GITHUB_USER>.github.io/site-lashmaker/"`. This can take 1–2 minutes after Step 3 — re-run this command every 20–30 seconds until `status` flips to `built`.

---

### Task 18: Final smoke test on the live GitHub Pages site

**Steps (agent):**
- [ ] Using Playwright, navigate to `https://<GITHUB_USER>.github.io/site-lashmaker/variant-12-baroque-silk-drape.html`, scroll to `#booking`, verify day/time buttons render (confirms the deployed static site can reach the deployed Worker's `/api/availability` across origins — i.e., the CORS headers from Task 6 are working in production, not just on localhost).
- [ ] Report back to the user with the final live URL and a one-paragraph summary of what's now live: real availability calendar, real booking submission, Telegram notifications, and the `/today` / `/tomorrow` / `/date` / `/book` bot commands.

---

## Self-Review

**1. Spec coverage:**
- Site booking → Telegram notification: Task 6 (`handleBook` sends via `sendMessage`) + Task 13 (real token) + Task 15 (verified end-to-end). ✅
- Real calendar of available/booked slots, single registry: Task 3 (schema/unique index), Task 6 (`/api/availability`), Task 9 (site widget). ✅
- Bot commands for today/tomorrow/any date: Task 7 (`/today`, `/tomorrow`, `/date`). ✅
- Master creates a booking via bot, reflected on site: Task 7 (`/book` flow, `source: 'bot'`), same `bookings` table the site's `/api/availability` reads — no separate sync needed since it's one registry. ✅
- Fixed 3 slots, Mon–Fri only: Task 2 (`FIXED_SLOTS`, `isWorkingDay`), enforced in both `index.js` (Task 6) and `bot.js` (Task 7). ✅
- Schedule text on the page updated to match: Task 9, Step 2. ✅
- GitHub Pages deployment: Tasks 16–18 (repo creation, push, and Pages enablement are agent-driven via the GitHub API using a user-supplied scoped token — only generating that token is a manual step). ✅
- Manual/agent step separation, correctly sequenced: Tasks 10, 12, 14, 16 interleave the user-only steps that remain (Cloudflare account, BotFather bot creation, claiming admin via /start, generating a GitHub PAT) immediately before the agent steps that consume their output. ✅

**2. Placeholder scan:** No "TBD"/"handle appropriately" language; all code blocks are complete and runnable; the only bracketed placeholders left (`<subdomain>`, `<repo URL from Task 16>`, `<the token from Task 12>`) are values that literally cannot exist until a prior manual step produces them — each is clearly sourced from a specific earlier task, not a vague fill-in-later.

**3. Type/name consistency check:** `FIXED_SLOTS`, `isValidDateFormat`, `isValidSlotTime`, `isWorkingDay`, `addDays`, `getTodayMoscow`, `getTomorrowMoscow`, `nextWorkingDays`, `formatDateLabel` — defined once in Task 2, imported with identical names in Tasks 6, 7, 9 (site's copy in `booking.js` intentionally duplicates the small working-day/date-label subset since it's a separate plain-script runtime, not importing from the Worker project — this is deliberate, not a drift bug). `getBookingsForDate`, `getBookedSlotsInRange`, `createBooking`, `getAdminChatId`, `claimAdminChatId`, `getSession`, `setSession`, `clearSession` — defined once in Task 4, used identically in Tasks 6, 7, 8. `sendMessage`, `answerCallbackQuery`, `inlineKeyboard` — defined once in Task 5, used identically in Tasks 6, 7. `handleMessage`, `handleCallbackQuery`, `handleTelegramUpdate` — defined once in Task 7, consumed once in Task 8. Confirmed consistent throughout.
