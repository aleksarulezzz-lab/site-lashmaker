export async function hashVisitor(ip, userAgent, date) {
  const data = new TextEncoder().encode(`${date}|${ip}|${userAgent}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function recordPageView(db, { date, path, visitorHash, viewId = null, country = null, source = null }) {
  await db.prepare(
    `INSERT INTO page_views (date, path, visitor_hash, view_id, country, source) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(date, path, visitorHash, viewId, country, source).run();
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

// Visits grouped by traffic source (utm_source / referring host / 'direct')
// over an inclusive range, busiest first.
export async function getRangeSources(db, fromDate, toDate, limit = 6) {
  const { results } = await db.prepare(
    `SELECT source, COUNT(*) as views FROM page_views
     WHERE date >= ? AND date <= ? AND source IS NOT NULL AND source != ''
     GROUP BY source ORDER BY views DESC LIMIT ?`
  ).bind(fromDate, toDate, limit).all();
  return results || [];
}

export function getDailySources(db, date, limit = 6) {
  return getRangeSources(db, date, date, limit);
}

// Retention: drop pageview rows older than the cutoff so a flood (or just time)
// can't grow the table without bound. Called from the daily cron.
export async function prunePageViews(db, cutoffDate) {
  const res = await db.prepare(
    `DELETE FROM page_views WHERE date < ?`
  ).bind(cutoffDate).run();
  return res?.meta?.changes ?? 0;
}
