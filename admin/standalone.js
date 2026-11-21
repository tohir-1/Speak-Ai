'use strict';
// Faqat admin panelni (botsiz) ishga tushirish: `npm run admin`
const { Telegram } = require('telegraf');
const settings = require('../config/settings');
const { startCleanup } = require('../utils/cleanup');
const { startAdmin } = require('./server');

try { settings.validate({ needBot: true, needAdmin: true }); } catch (e) {
  console.error('\n❌ ' + e.message + '\n');
  process.exit(1);
}
startCleanup();
startAdmin(new Telegram(settings.botToken)).catch((e) => { console.error(e); process.exit(1); });
