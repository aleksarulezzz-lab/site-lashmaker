import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const sentMessages = [];
let adminChatId = null;
let reportText = 'REPORT';

mock.module('./dailyReport.js', {
  exports: {
    buildDailyReport: async () => reportText
  }
});

mock.module('./db.js', {
  exports: {
    getAdminChatId: async () => adminChatId
  }
});

mock.module('./telegram.js', {
  exports: {
    sendMessage: async (env, chatId, text) => { sentMessages.push({ chatId, text }); }
  }
});

const { sendEveningStats } = await import('./dailyStats.js');
const env = { DB: {} };

test('does nothing when no admin has claimed the bot yet', async () => {
  sentMessages.length = 0;
  adminChatId = null;

  await sendEveningStats(env);

  assert.equal(sentMessages.length, 0);
});

test('sends the built daily report to the admin', async () => {
  sentMessages.length = 0;
  adminChatId = '111';
  reportText = '📊 aleksarulezzz.ru — 27 августа 2026\n…';

  await sendEveningStats(env);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].chatId, '111');
  assert.equal(sentMessages[0].text, reportText);
});
