'use strict';
const fs = require('fs');
const settings = require('../../config/settings');
const db = require('../../database/db');
const processor = require('../../audio/processor');
const { buildChain } = require('../../audio/effects');
const { safeUnlink } = require('../../utils/cleanup');
const ai = require('../aiClient');
const kb = require('../keyboards');
const common = require('./common');

const { BTN } = kb;

const view = (u) =>
  '🔊 <b>Matn → Ovoz</b>\n\nOvozga aylantirmoqchi bo‘lgan matnni yuboring.\n' +
  `📏 Maksimum: ${settings.limits.maxTtsChars} belgi.\n\n` +
  `Til: <b>${kb.LANGS[u.tts_lang]}</b> · Ovoz: <b>${u.tts_gender === 'male' ? 'Erkak' : 'Ayol'}</b> · ×${Number(u.tts_speed).toFixed(1)} · pitch ${u.tts_pitch} · ${u.tts_format.toUpperCase()}\n` +
  '<i>Tezlik, balandlik va format: ⚙️ Sozlamalar. Matn tilini tanlang 👇</i>';

/** Matnni ovozga aylantirib yuboradi. */
async function speak(ctx, text, langOverride) {
  if (!(await common.requireService(ctx, 'tts'))) return;
  text = text.trim();
  if (!text) return;
  if (text.length > settings.limits.maxTtsChars) {
    return ctx.reply(`📏 Matn juda uzun (${text.length}). Maksimum: ${settings.limits.maxTtsChars} belgi.`);
  }
  const u = db.getUser(ctx.from.id);
  const lang = langOverride || u.tts_lang;
  await common.runJob(ctx, 'tts', async (progress) => {
    await progress.update('🧠 Ovoz sintez qilinmoqda...');
    const { buffer, engine } = await ai.tts({ text, lang, gender: u.tts_gender });
    const raw = processor.tempPath('.wav');
    const wav = processor.tempPath('.wav');
    const mp3 = processor.tempPath('.mp3');
    try {
      await fs.promises.writeFile(raw, buffer);
      await progress.update('🎛 Ovoz sozlanmoqda...');
      await processor.applyFilter(raw, buildChain({ pitch: u.tts_pitch, speed: u.tts_speed }), wav);
      await progress.update('📤 Yuborilmoqda...');
      const caption = `🔊 ${kb.LANGS[lang] || lang}${engine ? ' · ' + engine : ''}`;
      if (u.tts_format === 'wav') {
        await ctx.replyWithDocument({ source: wav, filename: 'speakai_tts.wav' }, { caption });
      } else {
        await processor.toMp3(wav, mp3);
        await ctx.replyWithAudio({ source: mp3, filename: 'speakai_tts.mp3' }, { caption, title: 'SpeakAI TTS', performer: 'SpeakAI' });
      }
    } finally {
      safeUnlink(raw, wav, mp3);
    }
  });
}

function register(bot) {
  bot.hears(BTN.tts, async (ctx) => {
    if (!(await common.requireService(ctx, 'tts'))) return;
    ctx.session.mode = 'tts';
    await ctx.reply('Matnni yuboring 👇', kb.backMenu());
    await ctx.reply(view(ctx.dbUser), { parse_mode: 'HTML', ...kb.ttsKeyboard(ctx.dbUser) });
  });

  bot.action(/^tts:(lang|gender):(\w+)$/, async (ctx) => {
    const [, key, val] = ctx.match;
    if (key === 'lang' && kb.TTS_LANGS.includes(val)) db.updateUserSetting(ctx.from.id, 'tts_lang', val);
    else if (key === 'gender' && ['male', 'female'].includes(val)) db.updateUserSetting(ctx.from.id, 'tts_gender', val);
    else return ctx.answerCbQuery();
    await ctx.answerCbQuery('✅');
    const u = db.getUser(ctx.from.id);
    await ctx.editMessageText(view(u), { parse_mode: 'HTML', ...kb.ttsKeyboard(u) }).catch(() => {});
  });
}

module.exports = register;
module.exports.speak = speak;
