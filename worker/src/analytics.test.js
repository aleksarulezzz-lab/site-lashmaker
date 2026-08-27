import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashVisitor, getRangeStats } from './analytics.js';

// Minimal in-memory stand-in for a D1 prepared statement, enough to exercise
// the three queries getRangeStats runs. Rows: [{ date, path, visitor_hash }].
function fakeDb(rows) {
  return {
    prepare(sql) {
      const stmt = {
        sql,
        args: [],
        bind(...args) { stmt.args = args; return stmt; },
        async first() {
          const [from, to] = stmt.args;
          const inRange = rows.filter(r => r.date >= from && r.date <= to);
          return {
            views: inRange.length,
            visitors: new Set(inRange.map(r => r.visitor_hash)).size
          };
        },
        async all() {
          const [from, to] = stmt.args;
          const inRange = rows.filter(r => r.date >= from && r.date <= to);
          if (/GROUP BY path/.test(sql)) {
            const byPath = new Map();
            for (const r of inRange) byPath.set(r.path, (byPath.get(r.path) || 0) + 1);
            const results = [...byPath.entries()]
              .map(([path, views]) => ({ path, views }))
              .sort((a, b) => b.views - a.views);
            return { results };
          }
          const byDate = new Map();
          for (const r of inRange) {
            if (!byDate.has(r.date)) byDate.set(r.date, new Set());
            byDate.get(r.date).add(r.visitor_hash);
          }
          const results = [...byDate.entries()]
            .map(([date, v]) => ({ date, views: inRange.filter(r => r.date === date).length, visitors: v.size }))
            .sort((a, b) => (a.date < b.date ? 1 : -1));
          return { results };
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
  { date: '2026-08-25', path: '/a', visitor_hash: 'v1' },
  { date: '2026-08-25', path: '/a', visitor_hash: 'v1' },
  { date: '2026-08-25', path: '/b', visitor_hash: 'v2' },
  { date: '2026-08-26', path: '/a', visitor_hash: 'v3' },
  { date: '2026-08-27', path: '/a', visitor_hash: 'v1' },
  { date: '2026-08-20', path: '/a', visitor_hash: 'v9' } // outside the window below
];

test('getRangeStats totals views and distinct visitors within the inclusive range', async () => {
  const stats = await getRangeStats(fakeDb(RANGE_ROWS), '2026-08-25', '2026-08-27');
  assert.equal(stats.views, 5);
  assert.equal(stats.visitors, 3); // v1, v2, v3 — the 2026-08-20 row (v9) is excluded
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
  assert.deepEqual(stats, { views: 0, visitors: 0, topPaths: [], byDay: [] });
});
