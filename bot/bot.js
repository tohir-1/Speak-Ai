'use strict';
const { Telegraf, session } = require('telegraf');
const settings = require('../config/settings');
const logger = require('../utils/logger');
const common = require('./handlers/common');

function createBot() {
  const bot = new Telegraf(settings.botToken, {
    handlerTimeout: 15 * 60 * 1000, // og'ir ishlar uchun
    ...(settings.botApiRoot ? { telegram: { apiRoot: settings.botApiRoot } } : {}),
  });

  bot.use(session({ defaultSession: () => ({ mode: null, pending: null, changer: null, last: null, tr: null }) }));
  bot.use(require('./middleware/user')());
  bot.use(require('./middleware/rateLimit')());

  // Tartib muhim: avval buyruqlar va menyu tugmalari, oxirida umumiy media/text routerlar
  require('./handlers/start')(bot);
  require('./handlers/admin')(bot);
  require('./handlers/settings')(bot);
  require('./handlers/referral')(bot);
  require('./handlers/voice')(bot);
  require('./handlers/changer')(bot);
  require('./handlers/tts')(bot);
  require('./handlers/translate')(bot);
  require('./handlers/summary')(bot);
  require('./handlers/media')(bot);
  require('./handlers/text')(bot);

  bot.catch(async (err, ctx) => {
    logger.error(`Bot xatosi (update ${ctx.update && ctx.update.update_id}):`, err);
    try { await ctx.reply(common.friendlyError(err)); } catch { /* ignore */ }
  });

  return bot;
}

module.exports = { createBot };
