import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

let daily = {};
let countries = [];
let sources = [];
mock.module('./analytics.js', {
  exports: {
    getDailyStats: async (db, date) => daily[date] || { views: 0, visitors: 0, avgDwellSec: 0, topPaths: [] },
    getDailyCountries: async () => countries,
    getDailySources: async () => sources
  }
});

const {
  buildDailyReport, formatLongDate, flagEmoji, formatDelta, shortPath, sourceLabel
} = await import('./dailyReport.js');

test('formatLongDate renders a Russian "D month YYYY" label', () => {
  assert.equal(formatLongDate('2026-08-27'), '27 августа 2026');
  assert.equal(formatLongDate('2026-01-01'), '1 января 2026');
});

test('flagEmoji turns an ISO country code into a flag, with a fallback', () => {
  assert.equal(flagEmoji('RU'), '🇷🇺');
  assert.equal(flagEmoji('by'), '🇧🇾');
  assert.equal(flagEmoji('T1'), '🏳️');
  assert.equal(flagEmoji(null), '🏳️');
});

test('formatDelta compares against the previous day', () => {
  assert.equal(formatDelta(6, 3), ' (▲ 100%)');
  assert.equal(formatDelta(3, 6), ' (▼ 50%)');
  assert.equal(formatDelta(4, 4), ' (—)');
  assert.equal(formatDelta(5, 0), ' (нов.)');
  assert.equal(formatDelta(0, 0), '');
});

test('sourceLabel prettifies known hosts, passes others through', () => {
  assert.equal(sourceLabel('dzen.ru'), 'Дзен');
  assert.equal(sourceLabel('t.me'), 'Telegram');
  assert.equal(sourceLabel('direct'), 'Прямые заходы');
  assert.equal(sourceLabel('example.org'), 'example.org');
});

test('shortPath keeps only the last segment', () => {
  assert.equal(shortPath('/lashmaker/variant-12-baroque-silk-drape.html'), 'variant-12-baroque-silk-drape.html');
  assert.equal(shortPath('/'), 'главная');
  assert.equal(shortPath(''), 'главная');
  assert.equal(shortPath('/lashmaker/'), 'lashmaker');
});

test('buildDailyReport assembles every section with the day-over-day deltas', async () => {
  daily = {
    '2026-08-27': { views: 13, visitors: 6, avgDwellSec: 48, topPaths: [{ path: '/lashmaker/variant-12-baroque-silk-drape.html', views: 8 }, { path: '/', views: 5 }] },
    '2026-08-26': { views: 6, visitors: 3, avgDwellSec: 20, topPaths: [] }
  };
  countries = [{ country: 'RU', views: 9 }, { country: 'KZ', views: 2 }];
  sources = [{ source: 'dzen.ru', views: 7 }, { source: 'direct', views: 4 }];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 200 });
  try {
    const text = await buildDailyReport({ DB: {}, SITE_DOMAIN: 'aleksarulezzz.ru' }, '2026-08-27');
    assert.match(text, /^📊 aleksarulezzz\.ru — 27 августа 2026/);
    assert.match(text, /🟢 Сайт работает \(\d+ мс\)/);
    assert.match(text, /👥 Посетители: 6 \(▲ 100%\)/);
    assert.match(text, /👁 Просмотры: 13 \(▲ 117%\)/);
    assert.match(text, /⏱ Среднее время на сайте: 48 сек/);
    assert.match(text, /🇷🇺 RU: 9/);
    assert.match(text, /🇰🇿 KZ: 2/);
    assert.match(text, /🔗 Откуда переходят/);
    assert.match(text, /Дзен: 7/);
    assert.match(text, /Прямые заходы: 4/);
    assert.match(text, /variant-12-baroque-silk-drape\.html — 8/);
    assert.match(text, /главная — 5/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('buildDailyReport reports a down site and empty sections gracefully', async () => {
  daily = {};
  countries = [];
  sources = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('unreachable'); };
  try {
    const text = await buildDailyReport({ DB: {} }, '2026-08-27');
    assert.match(text, /🔴 Сайт недоступен/);
    assert.match(text, /👥 Посетители: 0/);
    assert.equal((text.match(/\(нет данных\)/g) || []).length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
