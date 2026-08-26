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
