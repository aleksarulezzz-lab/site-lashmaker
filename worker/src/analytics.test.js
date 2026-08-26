import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashVisitor } from './analytics.js';

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
