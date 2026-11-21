'use strict';
const kb = require('../keyboards');
const common = require('./common');
const voice = require('./voice');
const changer = require('./changer');
const summary = require('./summary');

const TYPES = ['voice', 'audio', 'video', 'video_note', 'document'];

function register(bot) {
  // Rejim bo'yicha yo'naltirish
  bot.on(TYPES, async (ctx) => {
    const info = common.mediaInfo(ctx.message);
    if (!info) {
      return ctx.reply('❌ Bu fayl turi qo‘llab-quvvatlanmaydi. MP3, WAV, M4A, OGG, MP4 yoki Telegram voice yuboring.');
    }
    const mode = ctx.session.mode;
    if (mode === 'stt') return voice.handleStt(ctx, info);
    if (mode === 'changer') return changer.onAudio(ctx, info);
    if (mode === 'summary') return summary.onAudio(ctx, info);
    // Rejim tanlanmagan — nima qilishni so'raymiz
    ctx.session.pending = info;
    await ctx.reply('🎧 Audio qabul qilindi. Nima qilamiz?', kb.pickKeyboard());
  });

  bot.action(/^pick:(stt|changer|summary)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const info = ctx.session.pending;
    ctx.session.pending = null;
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});
    if (!info) return ctx.reply('⌛ Audio eskirgan. Iltimos, qayta yuboring.');
    const what = ctx.match[1];
    ctx.session.mode = what;
    if (what === 'stt') return voice.handleStt(ctx, info);
    if (what === 'changer') return changer.onAudio(ctx, info);
    return summary.onAudio(ctx, info);
  });
}

module.exports = register;
