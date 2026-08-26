import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const sentMessages = [];
let adminChatId = null;
let dailyStats = { views: 0, visitors: 0, topPaths: [] };

mock.module('./analytics.js', {
  exports: {
    getDailyStats: async () => dailyStats
  }
});

mock.module('./db.js', {
  exports: {
    getAdminChatId: async () => adminChatId
  }
});

mock.module('./telegram.js', {
  exports: {
    sendMessage: async (env, chatId, text) => { sentMessages.push({ chatId, text }); },
    escapeHtml: (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
});

const { sendEveningStats } = await import('./dailyStats.js');
const env = { DB: {} };

test('does nothing when no admin has claimed the bot yet', async () => {
  sentMessages.length = 0;
  adminChatId = null;
  dailyStats = { views: 10, visitors: 5, topPaths: [] };

  await sendEveningStats(env);

  assert.equal(sentMessages.length, 0);
});

test('sends a formatted summary with views, visitors, and top pages to the admin', async () => {
  sentMessages.length = 0;
  adminChatId = '111';
  dailyStats = { views: 42, visitors: 17, topPaths: [{ path: '/variant-12-baroque-silk-drape.html', views: 30 }] };

  await sendEveningStats(env);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].chatId, '111');
  assert.match(sentMessages[0].text, /42/);
  assert.match(sentMessages[0].text, /17/);
  assert.match(sentMessages[0].text, /variant-12-baroque-silk-drape\.html/);
});

test('shows a placeholder when there are no page views for the day', async () => {
  sentMessages.length = 0;
  adminChatId = '111';
  dailyStats = { views: 0, visitors: 0, topPaths: [] };

  await sendEveningStats(env);

  assert.match(sentMessages[0].text, /нет данных/);
});

test('escapes HTML in a page path before sending', async () => {
  sentMessages.length = 0;
  adminChatId = '111';
  dailyStats = { views: 1, visitors: 1, topPaths: [{ path: '/<script>evil</script>', views: 1 }] };

  await sendEveningStats(env);

  assert.match(sentMessages[0].text, /&lt;script&gt;/);
  assert.doesNotMatch(sentMessages[0].text, /<script>evil/);
});
