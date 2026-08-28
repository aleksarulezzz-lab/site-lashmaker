import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteBookingsBefore } from './db.js';

// Minimal D1 stand-in for the one DELETE statement deleteBookingsBefore runs.
function fakeDb(rows) {
  return {
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...a) { stmt.args = a; return stmt; },
        async run() {
          if (/^DELETE FROM bookings WHERE date < /.test(sql)) {
            const [cutoff] = stmt.args;
            const before = rows.length;
            for (let i = rows.length - 1; i >= 0; i--) {
              if (rows[i].date < cutoff) rows.splice(i, 1);
            }
            return { meta: { changes: before - rows.length } };
          }
          return { meta: { changes: 0 } };
        }
      };
      return stmt;
    }
  };
}

test('deleteBookingsBefore removes only rows older than the cutoff and returns the count', async () => {
  const rows = [
    { id: 1, date: '2026-05-01' },
    { id: 2, date: '2026-08-27' },
    { id: 3, date: '2026-08-28' },
    { id: 4, date: '2026-09-10' }
  ];
  const removed = await deleteBookingsBefore(fakeDb(rows), '2026-08-28');
  assert.equal(removed, 2);
  assert.deepEqual(rows.map(r => r.id), [3, 4]);
});

test('deleteBookingsBefore returns 0 when nothing is old enough', async () => {
  const rows = [{ id: 1, date: '2026-09-01' }];
  assert.equal(await deleteBookingsBefore(fakeDb(rows), '2026-08-01'), 0);
  assert.equal(rows.length, 1);
});
