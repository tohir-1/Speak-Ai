'use strict';
const db = require('../../database/db');
const settings = require('../../config/settings');
const kb = require('../keyboards');
const common = require('./common');

module.exports = function register(bot) {
  bot.hears(kb.BTN.invite, async (ctx) => {
    const id = ctx.from.id;
    const link = `https://t.me/${settings.runtime.botUsername}?start=ref_${id}`;
    const count = db.referralCount(id);
    const rank = count > 0 ? `#${db.referralRank(id)}` : '—';
    const top = db.topReferrers(10);
    const board = top.length
      ? top.map((r, i) => `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${common.esc(r.username ? '@' + r.username : r.first_name || r.id)} — <b>${r.c}</b>`).join('\n')
      : 'Hozircha reyting bo‘sh.';
    await ctx.reply(
      '👥 <b>Do‘stlarni taklif qilish</b>\n\n' +
      `Sizning shaxsiy havolangiz:\n<code>${link}</code>\n\n` +
      `✅ Taklif qilganlar: <b>${count}</b>\n🏆 Reytingdagi o‘rningiz: <b>${rank}</b>\n\n` +
      `<b>🏆 Top 10</b>\n${board}`,
      { parse_mode: 'HTML', disable_web_page_preview: true }
    );
  });
};
