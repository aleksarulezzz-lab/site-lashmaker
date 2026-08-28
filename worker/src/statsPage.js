import { formatDateLabel } from './slots.js';
import { flagEmoji, sourceLabel } from './dailyReport.js';

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Pure: builds the self-contained HTML dashboard served at /api/stats.
// `todayStats` / `week` / `month` each look like { views, visitors, avgDwellSec, ... };
// `week.topPaths` is [{ path, views }]; `byDay` is [{ date, views, visitors }] newest first;
// `countries` is [{ country, views }] over the last 7 days.
export function renderStatsPage({ today, todayStats, week, month, byDay, countries, sources }) {
  const card = (title, s) => `
      <div class="card">
        <h2>${esc(title)}</h2>
        <p class="big">${s.views}<span>просмотров</span></p>
        <p class="big">${s.visitors}<span>посетителей</span></p>
        <p class="small">${s.avgDwellSec || 0} сек на сайте</p>
      </div>`;

  const topPaths = (week && week.topPaths) || [];
  const topRows = topPaths.length
    ? topPaths.map(p => `<tr><td>${esc(p.path)}</td><td>${p.views}</td></tr>`).join('')
    : '<tr><td colspan="2" class="empty">нет данных</td></tr>';

  const cc = countries || [];
  const countryRows = cc.length
    ? cc.map(c => `<tr><td>${flagEmoji(c.country)} ${esc(c.country)}</td><td>${c.views}</td></tr>`).join('')
    : '<tr><td colspan="2" class="empty">нет данных</td></tr>';

  const src = sources || [];
  const sourceRows = src.length
    ? src.map(s => `<tr><td>${esc(sourceLabel(s.source))}</td><td>${s.views}</td></tr>`).join('')
    : '<tr><td colspan="2" class="empty">нет данных</td></tr>';

  const days = byDay || [];
  const dayRows = days.length
    ? days.map(d => `<tr><td>${esc(formatDateLabel(d.date))}</td><td>${d.views}</td><td>${d.visitors}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">нет данных</td></tr>';

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Статистика — ${esc(formatDateLabel(today))}</title>
<style>
  :root{color-scheme:light dark;}
  *{box-sizing:border-box;}
  body{margin:0;padding:24px;max-width:760px;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#faf8f5;color:#2a2118;}
  h1{font-size:20px;margin:0 0 4px;}
  .sub{color:#8a7c68;margin:0 0 24px;font-size:13px;}
  .cards{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:28px;}
  .card{flex:1 1 150px;background:#fff;border:1px solid #e8dfd0;border-radius:12px;padding:16px 18px;}
  .card h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#8a7c68;margin:0 0 10px;font-weight:600;}
  .big{font-size:24px;font-weight:700;margin:0 0 2px;display:flex;align-items:baseline;gap:8px;}
  .big span{font-size:12px;font-weight:400;color:#8a7c68;}
  .small{font-size:12px;color:#8a7c68;margin:6px 0 0;}
  h3{font-size:15px;margin:24px 0 8px;}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e8dfd0;border-radius:12px;overflow:hidden;}
  th,td{text-align:left;padding:9px 14px;border-bottom:1px solid #efe7d9;font-size:14px;word-break:break-all;}
  th{background:#f3ece0;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#8a7c68;}
  tr:last-child td{border-bottom:none;}
  td:not(:first-child),th:not(:first-child){text-align:right;white-space:nowrap;width:1%;word-break:normal;}
  .empty{color:#8a7c68;text-align:center;}
  .foot{margin-top:28px;color:#a99b88;font-size:12px;}
  @media(prefers-color-scheme:dark){
    body{background:#16130f;color:#ece5da;}
    .card,table{background:#211c16;border-color:#3a3128;}
    th{background:#2b241c;color:#a99b88;}
    td{border-color:#332c22;}
  }
</style>
</head>
<body>
  <h1>Статистика сайта</h1>
  <p class="sub">${esc(formatDateLabel(today))} · время московское · обновляется в реальном времени</p>
  <div class="cards">
    ${card('Сегодня', todayStats)}
    ${card('7 дней', week)}
    ${card('30 дней', month)}
  </div>
  <h3>Топ страниц за 7 дней</h3>
  <table><thead><tr><th>Страница</th><th>Просмотры</th></tr></thead><tbody>${topRows}</tbody></table>
  <h3>Откуда переходят (7 дней)</h3>
  <table><thead><tr><th>Источник</th><th>Просмотры</th></tr></thead><tbody>${sourceRows}</tbody></table>
  <h3>Откуда приходят (7 дней)</h3>
  <table><thead><tr><th>Страна</th><th>Просмотры</th></tr></thead><tbody>${countryRows}</tbody></table>
  <h3>По дням (2 недели)</h3>
  <table><thead><tr><th>День</th><th>Просмотры</th><th>Посетители</th></tr></thead><tbody>${dayRows}</tbody></table>
  <p class="foot">Данные обезличены: вместо IP хранится дневной хэш, между днями посетитель не отслеживается. Среднее время — приблизительное (сигнал при уходе доходит не всегда).</p>
</body>
</html>`;
}
