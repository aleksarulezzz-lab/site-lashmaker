import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqual, beaconSourceAllowed } from './httpGuards.js';

test('timingSafeEqual is true only for identical strings', async () => {
  assert.equal(await timingSafeEqual('s3cr3t-token', 's3cr3t-token'), true);
  assert.equal(await timingSafeEqual('s3cr3t-token', 's3cr3t-toKen'), false);
  assert.equal(await timingSafeEqual('short', 'a-much-longer-value'), false);
  assert.equal(await timingSafeEqual('x', ''), false);
});

test('timingSafeEqual rejects non-strings (missing token / env var)', async () => {
  assert.equal(await timingSafeEqual(null, 'token'), false);
  assert.equal(await timingSafeEqual('token', undefined), false);
  assert.equal(await timingSafeEqual(undefined, undefined), false);
});

test('beaconSourceAllowed trusts our own Origin', () => {
  assert.equal(beaconSourceAllowed('https://aleksarulezzz.ru', null), true);
  assert.equal(beaconSourceAllowed('https://aleksarulezzz-lab.github.io', null), true);
  assert.equal(beaconSourceAllowed('https://evil.example', null), false);
});

test('beaconSourceAllowed falls back to Referer when there is no Origin', () => {
  assert.equal(beaconSourceAllowed(null, 'https://aleksarulezzz.ru/lashmaker/x.html'), true);
  assert.equal(beaconSourceAllowed(null, 'https://evil.example/x'), false);
  assert.equal(beaconSourceAllowed(null, 'not a url'), false);
});

test('beaconSourceAllowed rejects a request with neither header', () => {
  assert.equal(beaconSourceAllowed(null, null), false);
  assert.equal(beaconSourceAllowed('', ''), false);
});
