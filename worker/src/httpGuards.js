// Origins allowed to talk to this Worker from a browser — used both for CORS
// and for deciding whether an /api/track beacon actually came from the site.
export const ALLOWED_ORIGINS = [
  'https://aleksarulezzz-lab.github.io',
  'https://aleksarulezzz.ru',
  'https://www.aleksarulezzz.ru'
];

// Constant-time string comparison. Compares SHA-256 digests so the loop length
// never depends on the inputs (no length side-channel, no early return).
export async function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// A pageview beacon is trusted only if its Origin (or, failing that, Referer)
// is one of our own pages. Doesn't stop a determined attacker who forges the
// header, but blocks casual curl / bot spam that would poison the stats.
export function beaconSourceAllowed(origin, referer) {
  if (origin) return ALLOWED_ORIGINS.includes(origin);
  if (referer) {
    try {
      return ALLOWED_ORIGINS.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return false;
}
