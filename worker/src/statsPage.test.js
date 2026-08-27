import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderStatsPage } from './statsPage.js';

const base = {
  today: '2026-08-27',
  todayStats: { views: 6, visitors: 3, avgDwellSec: 42 },
  week: { views: 40, visitors: 21, avgDwellSec: 55, topPaths: [{ path: '/lashmaker/variant-12-baroque-silk-drape.html', views: 28 }] },
  month: { views: 150, visitors: 70, avgDwellSec: 61 },
  byDay: [
    { date: '2026-08-27', views: 6, visitors: 3 },
    { date: '2026-08-26', views: 9, visitors: 4 }
  ],
  countries: [
    { country: 'RU', views: 30 },
    { country: 'KZ', views: 4 }
  ]
};

test('renders the today / 7-day / 30-day totals and average time', () => {
  const html = renderStatsPage(base);
  assert.match(html, /Сегодня/);
  assert.match(html, />6<span>просмотров/);
  assert.match(html, />40<span>просмотров/);
  assert.match(html, />150<span>просмотров/);
  assert.match(html, /42 сек на сайте/);
  assert.match(html, /61 сек на сайте/);
});

test('renders one row per top path, country and day', () => {
  const html = renderStatsPage(base);
  assert.match(html, /variant-12-baroque-silk-drape\.html<\/td><td>28/);
  assert.match(html, /🇷🇺 RU<\/td><td>30/);
  assert.match(html, /Чт 27\.08<\/td><td>6<\/td><td>3/);
  assert.match(html, /Ср 26\.08<\/td><td>9<\/td><td>4/);
});

test('escapes HTML in a page path so it cannot inject markup', () => {
  const html = renderStatsPage({
    ...base,
    week: { views: 1, visitors: 1, avgDwellSec: 0, topPaths: [{ path: '/<script>evil</script>', views: 1 }] }
  });
  assert.match(html, /&lt;script&gt;evil&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>evil/);
});

test('shows "нет данных" when there are no paths, countries or days', () => {
  const html = renderStatsPage({
    today: '2026-08-27',
    todayStats: { views: 0, visitors: 0, avgDwellSec: 0 },
    week: { views: 0, visitors: 0, avgDwellSec: 0, topPaths: [] },
    month: { views: 0, visitors: 0, avgDwellSec: 0 },
    byDay: [],
    countries: []
  });
  assert.equal((html.match(/нет данных/g) || []).length, 3);
});

test('tolerates missing topPaths / countries arrays', () => {
  const html = renderStatsPage({ ...base, week: { views: 0, visitors: 0, avgDwellSec: 0 }, countries: undefined });
  assert.equal((html.match(/нет данных/g) || []).length, 2);
});
