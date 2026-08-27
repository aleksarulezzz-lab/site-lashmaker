export async function hashVisitor(ip, userAgent, date) {
  const data = new TextEncoder().encode(`${date}|${ip}|${userAgent}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function recordPageView(db, { date, path, visitorHash }) {
  await db.prepare(
    `INSERT INTO page_views (date, path, visitor_hash) VALUES (?, ?, ?)`
  ).bind(date, path, visitorHash).run();
}

export async function getDailyStats(db, date) {
  const totals = await db.prepare(
    `SELECT COUNT(*) as views, COUNT(DISTINCT visitor_hash) as visitors
     FROM page_views WHERE date = ?`
  ).bind(date).first();
  const { results: topPaths } = await db.prepare(
    `SELECT path, COUNT(*) as views FROM page_views
     WHERE date = ? GROUP BY path ORDER BY views DESC LIMIT 5`
  ).bind(date).all();
  return {
    views: totals?.views || 0,
    visitors: totals?.visitors || 0,
    topPaths
  };
}

// Aggregates over an inclusive [fromDate, toDate] range (YYYY-MM-DD strings).
// Returns overall totals, the busiest pages, and a per-day breakdown (newest first).
export async function getRangeStats(db, fromDate, toDate) {
  const totals = await db.prepare(
    `SELECT COUNT(*) as views, COUNT(DISTINCT visitor_hash) as visitors
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
    topPaths: topPaths || [],
    byDay: byDay || []
  };
}
