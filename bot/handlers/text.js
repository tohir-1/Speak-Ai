'use strict';
const common = require('./common');
const voice = require('./voice');
const tts = require('./tts');
const translate = require('./translate');
const summary = require('./summary');

function register(bot) {
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return ctx.reply('Noma’lum buyruq. /menu ni bosing.');
    switch (ctx.session.mode) {
      case 'tts': return tts.speak(ctx, text);
      case 'translate': return translate.onText(ctx, text);
      case 'summary': return summary.onText(ctx, text);
      case 'stt_edit': return voice.onEditText(ctx, text);
      case 'stt': return ctx.reply('🎤 Menga ovozli xabar yoki audio fayl yuboring. Matnni ovozga aylantirish uchun 🔊 Matn → Ovoz bo‘limiga o‘ting.');
      case 'changer': return ctx.reply('🎭 Menga ovozli xabar yoki audio fayl yuboring.');
      default:
        return ctx.reply('Iltimos, pastdagi menyudan bo‘lim tanlang 👇', require('../keyboards').mainMenu());
    }
  });
}

module.exports = register;
