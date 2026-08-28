import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashVisitor, getRangeStats, getRangeCountries, getRangeSources, prunePageViews } from './analytics.js';

// Minimal in-memory stand-in for a D1 prepared statement, enough to exercise
// the queries getRangeStats / getRangeCountries run.
// Rows: [{ date, path, visitor_hash, dwell_ms?, country? }].
function fakeDb(rows) {
  return {
    prepare(sql) {
      const stmt = {
        sql,
        args: [],
        bind(...args) { stmt.args = args; return stmt; },
        async run() {
          if (/^DELETE FROM page_views WHERE date < /.test(sql)) {
            const [cutoff] = stmt.args;
            const before = rows.length;
            for (let i = rows.length - 1; i >= 0; i--) {
              if (rows[i].date < cutoff) rows.splice(i, 1);
            }
            return { meta: { changes: before - rows.length } };
          }
          return { meta: { changes: 0 } };
        },
        async first() {
          const [from, to] = stmt.args;
          const inRange = rows.filter(r => r.date >= from && r.date <= to);
          const dwells = inRange.map(r => r.dwell_ms).filter(v => typeof v === 'number');
          return {
            views: inRange.length,
            visitors: new Set(inRange.map(r => r.visitor_hash)).size,
            avg_dwell_ms: dwells.length ? dwells.reduce((a, b) => a + b, 0) / dwells.length : null
          };
        },
        async all() {
          const [from, to] = stmt.args;
          const inRange = rows.filter(r => r.date >= from && r.date <= to);
          if (/GROUP BY path/.test(sql)) {
            const byPath = new Map();
            for (const r of inRange) byPath.set(r.path, (byPath.get(r.path) || 0) + 1);
            return {
              results: [...byPath.entries()]
                .map(([path, views]) => ({ path, views }))
                .sort((a, b) => b.views - a.views)
            };
          }
          if (/GROUP BY country/.test(sql)) {
            const skip = new Set(['', 'XX', 'T1']);
            const byC = new Map();
            for (const r of inRange) {
              if (r.country == null || skip.has(r.country)) continue;
              byC.set(r.country, (byC.get(r.country) || 0) + 1);
            }
            return {
              results: [...byC.entries()]
                .map(([country, views]) => ({ country, views }))
                .sort((a, b) => b.views - a.views)
            };
          }
          if (/GROUP BY source/.test(sql)) {
            const byS = new Map();
            for (const r of inRange) {
              if (r.source == null || r.source === '') continue;
              byS.set(r.source, (byS.get(r.source) || 0) + 1);
            }
            return {
              results: [...byS.entries()]
                .map(([source, views]) => ({ source, views }))
                .sort((a, b) => b.views - a.views)
            };
          }
          const byDate = new Map();
          for (const r of inRange) {
            if (!byDate.has(r.date)) byDate.set(r.date, new Set());
            byDate.get(r.date).add(r.visitor_hash);
          }
          return {
            results: [...byDate.entries()]
              .map(([date, v]) => ({ date, views: inRange.filter(r => r.date === date).length, visitors: v.size }))
              .sort((a, b) => (a.date < b.date ? 1 : -1))
          };
        }
      };
      return stmt;
    }
  };
}

test('hashVisitor produces a stable 64-char hex hash for the same inputs', async () => {
  const h1 = await hashVisitor('1.2.3.4', 'UA-string', '2026-08-27');
  const h2 = await hashVisitor('1.2.3.4', 'UA-string', '2026-08-27');
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test('hashVisitor changes when the date changes (daily rotation, no cross-day tracking)', async () => {
  const h1 = await hashVisitor('1.2.3.4', 'UA-string', '2026-08-27');
  const h2 = await hashVisitor('1.2.3.4', 'UA-string', '2026-08-28');
  assert.notEqual(h1, h2);
});

test('hashVisitor differs for different IPs on the same day', async () => {
  const h1 = await hashVisitor('1.2.3.4', 'UA', '2026-08-27');
  const h2 = await hashVisitor('5.6.7.8', 'UA', '2026-08-27');
  assert.notEqual(h1, h2);
});

test('hashVisitor differs for different user agents on the same day', async () => {
  const h1 = await hashVisitor('1.2.3.4', 'Chrome', '2026-08-27');
  const h2 = await hashVisitor('1.2.3.4', 'Safari', '2026-08-27');
  assert.notEqual(h1, h2);
});

const RANGE_ROWS = [
  { date: '2026-08-25', path: '/a', visitor_hash: 'v1', dwell_ms: 10000, country: 'RU', source: 'direct' },
  { date: '2026-08-25', path: '/a', visitor_hash: 'v1', dwell_ms: 30000, country: 'RU', source: 'dzen.ru' },
  { date: '2026-08-25', path: '/b', visitor_hash: 'v2', country: 'KZ', source: 'direct' },
  { date: '2026-08-26', path: '/a', visitor_hash: 'v3', country: 'XX', source: 't.me' },
  { date: '2026-08-27', path: '/a', visitor_hash: 'v1', country: 'RU', source: 'direct' },
  { date: '2026-08-20', path: '/a', visitor_hash: 'v9', country: 'RU', source: 'direct' } // outside the window below
];

test('getRangeStats totals views, distinct visitors and average dwell within the inclusive range', async () => {
  const stats = await getRangeStats(fakeDb(RANGE_ROWS), '2026-08-25', '2026-08-27');
  assert.equal(stats.views, 5);
  assert.equal(stats.visitors, 3); // v1, v2, v3 — the 2026-08-20 row (v9) is excluded
  assert.equal(stats.avgDwellSec, 20); // (10000 + 30000) / 2 ms -> 20s
});

test('getRangeStats ranks top paths and breaks views down per day (newest first)', async () => {
  const stats = await getRangeStats(fakeDb(RANGE_ROWS), '2026-08-25', '2026-08-27');
  assert.deepEqual(stats.topPaths, [
    { path: '/a', views: 4 },
    { path: '/b', views: 1 }
  ]);
  assert.deepEqual(stats.byDay.map(d => d.date), ['2026-08-27', '2026-08-26', '2026-08-25']);
  assert.deepEqual(stats.byDay[2], { date: '2026-08-25', views: 3, visitors: 2 });
});

test('getRangeStats returns zeroes and empty lists for a range with no data', async () => {
  const stats = await getRangeStats(fakeDb(RANGE_ROWS), '2026-01-01', '2026-01-31');
  assert.deepEqual(stats, { views: 0, visitors: 0, avgDwellSec: 0, topPaths: [], byDay: [] });
});

test('getRangeCountries ranks countries and drops the XX / T1 placeholders', async () => {
  const countries = await getRangeCountries(fakeDb(RANGE_ROWS), '2026-08-25', '2026-08-27');
  assert.deepEqual(countries, [
    { country: 'RU', views: 3 },
    { country: 'KZ', views: 1 }
  ]);
});

test('getRangeSources ranks traffic sources and ignores empty ones', async () => {
  const sources = await getRangeSources(fakeDb(RANGE_ROWS), '2026-08-25', '2026-08-27');
  assert.deepEqual(sources, [
    { source: 'direct', views: 3 },
    { source: 'dzen.ru', views: 1 },
    { source: 't.me', views: 1 }
  ]);
});

test('prunePageViews deletes only rows older than the cutoff and reports the count', async () => {
  const rows = [...RANGE_ROWS];
  const db = fakeDb(rows);
  const deleted = await prunePageViews(db, '2026-08-25');
  assert.equal(deleted, 1); // only the 2026-08-20 row is older
  assert.equal(rows.some(r => r.date === '2026-08-20'), false);
  assert.equal(rows.length, RANGE_ROWS.length - 1);
});
