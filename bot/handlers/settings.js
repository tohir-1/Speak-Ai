'use strict';
const db = require('../../database/db');
const kb = require('../keyboards');
const common = require('./common');

const { BTN } = kb;
const VIEW = (u) => '⚙️ <b>Sozlamalar</b>\n\nOvoz → Matn tili, Matn → Ovoz ovozi, tezligi, balandligi va formatini shu yerda sozlang.\n' +
  `\n<i>Hozirgi: STT=${u.stt_lang}, TTS=${u.tts_lang}, ${u.tts_gender}, ×${Number(u.tts_speed).toFixed(1)}, pitch ${u.tts_pitch}, ${u.tts_format.toUpperCase()}</i>`;

module.exports = function register(bot) {
  bot.hears(BTN.settings, (ctx) => ctx.reply(VIEW(ctx.dbUser), { parse_mode: 'HTML', ...kb.settingsKeyboard(ctx.dbUser) }));

  bot.action(/^set:(\w+):(\w+)$/, async (ctx) => {
    const [, key, val] = ctx.match;
    const u = db.getUser(ctx.from.id);
    try {
      if (key === 'stt_lang' && kb.STT_LANGS.includes(val)) db.updateUserSetting(u.id, key, val);
      else if (key === 'tts_lang' && kb.TTS_LANGS.includes(val)) db.updateUserSetting(u.id, key, val);
      else if (key === 'tts_gender' && ['male', 'female'].includes(val)) db.updateUserSetting(u.id, key, val);
      else if (key === 'tts_format' && ['mp3', 'wav'].includes(val)) db.updateUserSetting(u.id, key, val);
      else if (key === 'tts_speed') {
        const cur = Number(u.tts_speed);
        const next = val === 'up' ? cur + 0.1 : val === 'down' ? cur - 0.1 : 1;
        db.updateUserSetting(u.id, key, Math.min(2, Math.max(0.5, Math.round(next * 10) / 10)));
      } else if (key === 'tts_pitch') {
        const next = val === 'up' ? u.tts_pitch + 1 : val === 'down' ? u.tts_pitch - 1 : 0;
        db.updateUserSetting(u.id, key, Math.min(12, Math.max(-12, next)));
      } else return ctx.answerCbQuery();
    } catch { return ctx.answerCbQuery('Xato'); }
    await ctx.answerCbQuery('✅ Saqlandi');
    const fresh = db.getUser(u.id);
    await ctx.editMessageText(VIEW(fresh), { parse_mode: 'HTML', ...kb.settingsKeyboard(fresh) }).catch(() => {});
  });
};
