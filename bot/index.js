'use strict';
const settings = require('../config/settings');
const logger = require('../utils/logger');

try {
  settings.validate({ needBot: true, needAdmin: true });
} catch (e) {
  console.error('\n❌ ' + e.message + '\n\n.env faylini .env.example asosida to‘ldiring.\n');
  process.exit(1);
}

const { startCleanup } = require('../utils/cleanup');
const { createBot } = require('./bot');
const { startAdmin } = require('../admin/server');
const { health } = require('./aiClient');

(async () => {
  startCleanup();
  const bot = createBot();

  const me = await bot.telegram.getMe();
  settings.runtime.botUsername = me.username;
  logger.info(`Bot: @${me.username}`);

  const adminServer = await startAdmin(bot.telegram);

  health()
    .then((h) => logger.info('AI service ulandi:', h))
    .catch(() => logger.warn('AI service hozircha ulanmagan. `ai-service` ni ishga tushiring (README 6-qadam).'));

  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Botni ishga tushirish' },
    { command: 'menu', description: 'Asosiy menyu' },
    { command: 'cancel', description: 'Bekor qilish' },
    { command: 'help', description: 'Yordam' },
  ]).catch(() => {});

  const stop = (sig) => {
    logger.info(`${sig} — to‘xtatilmoqda...`);
    try { bot.stop(sig); } catch { /* ignore */ }
    try { adminServer.close(); } catch { /* ignore */ }
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  // Telegraf 4 da launch() polling to'xtaguncha qaytmaydi, shuning uchun await qilmaymiz
  bot.launch(() => logger.info('SpeakAI bot ishga tushdi ✅')).catch((e) => {
    logger.error('Bot to‘xtadi:', e);
    process.exit(1);
  });
})().catch((e) => {
  logger.error('Ishga tushirishda xato:', e);
  process.exit(1);
});

process.on('unhandledRejection', (r) => logger.error('unhandledRejection:', r));
process.on('uncaughtException', (e) => logger.error('uncaughtException:', e));
