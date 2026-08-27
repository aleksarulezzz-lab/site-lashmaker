export async function hashVisitor(ip, userAgent, date) {
  const data = new TextEncoder().encode(`${date}|${ip}|${userAgent}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function recordPageView(db, { date, path, visitorHash, viewId = null, country = null }) {
  await db.prepare(
    `INSERT INTO page_views (date, path, visitor_hash, view_id, country) VALUES (?, ?, ?, ?, ?)`
  ).bind(date, path, visitorHash, viewId, country).run();
}

// Follow-up "page unload" beacon: record how long the visit lasted. Matches the
// row the load beacon created by its client-generated view_id, and only fills
// dwell_ms while it is still NULL so a late/duplicate call can't overwrite it.
export async function recordDwell(db, { viewId, dwellMs }) {
  await db.prepare(
    `UPDATE page_views SET dwell_ms = ? WHERE view_id = ? AND dwell_ms IS NULL`
  ).bind(dwellMs, viewId).run();
}

function secondsFromAvg(avgMs) {
  return avgMs ? Math.round(avgMs / 1000) : 0;
}

export async function getDailyStats(db, date) {
  const totals = await db.prepare(
    `SELECT COUNT(*) as views,
            COUNT(DISTINCT visitor_hash) as visitors,
            AVG(dwell_ms) as avg_dwell_ms
     FROM page_views WHERE date = ?`
  ).bind(date).first();
  const { results: topPaths } = await db.prepare(
    `SELECT path, COUNT(*) as views FROM page_views
     WHERE date = ? GROUP BY path ORDER BY views DESC LIMIT 5`
  ).bind(date).all();
  return {
    views: totals?.views || 0,
    visitors: totals?.visitors || 0,
    avgDwellSec: secondsFromAvg(totals?.avg_dwell_ms),
    topPaths: topPaths || []
  };
}

// Aggregates over an inclusive [fromDate, toDate] range (YYYY-MM-DD strings).
// Returns overall totals, the busiest pages, and a per-day breakdown (newest first).
export async function getRangeStats(db, fromDate, toDate) {
  const totals = await db.prepare(
    `SELECT COUNT(*) as views,
            COUNT(DISTINCT visitor_hash) as visitors,
            AVG(dwell_ms) as avg_dwell_ms
     FROM page_views WHERE date >= ? AND date <= ?`
  ).bind(fromDate, toDate).first();
  const { results: topPaths } = await db.prepare(
    `SELECT path, COUNT(*) as views FROM page_views
     WHERE date >= ? AND date <= ? GROUP BY path ORDER BY views DESC LIMIT 8`
  ).bind(fromDate, toDate).all();
  const { results: byDay } = await db.prepare(
    `SELECT date, COUNT(*) as views, COUNT(DISTINCT visitor_hash) as visitors
     FROM page_views WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date DESC`
  ).bind(fromDate, toDate).all();
  return {
    views: totals?.views || 0,
    visitors: totals?.visitors || 0,
    avgDwellSec: secondsFromAvg(totals?.avg_dwell_ms),
    topPaths: topPaths || [],
    byDay: byDay || []
  };
}

// Visits grouped by country over an inclusive range, busiest first. 'XX'
// (unknown) and 'T1' (Tor) are Cloudflare placeholders and are dropped.
export async function getRangeCountries(db, fromDate, toDate, limit = 6) {
  const { results } = await db.prepare(
    `SELECT country, COUNT(*) as views FROM page_views
     WHERE date >= ? AND date <= ? AND country IS NOT NULL AND country NOT IN ('', 'XX', 'T1')
     GROUP BY country ORDER BY views DESC LIMIT ?`
  ).bind(fromDate, toDate, limit).all();
  return results || [];
}

export function getDailyCountries(db, date, limit = 6) {
  return getRangeCountries(db, date, date, limit);
}
