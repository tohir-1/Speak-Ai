'use strict';
const settings = require('../../config/settings');
const processor = require('../../audio/processor');
const { safeUnlink } = require('../../utils/cleanup');
const ai = require('../aiClient');
const kb = require('../keyboards');
const common = require('./common');

const { BTN } = kb;

/** Telegram audiosini yuklab, Whisper orqali matnga aylantiradi (summary ham ishlatadi). */
async function transcribe(ctx, info, progress) {
  await progress.update('📥 Audio yuklab olinmoqda...');
  const src = await common.downloadMedia(ctx, info);
  const wav = processor.tempPath('.wav');
  try {
    const meta = await common.validateMedia(src);
    await progress.update('🎛 Audio tayyorlanmoqda...');
    await processor.toWav16k(src, wav);
    await progress.update('🧠 Ovoz matnga aylantirilmoqda...\n(uzun audiolar ko‘proq vaqt oladi)');
    const lang = ctx.dbUser.stt_lang === 'auto' ? null : ctx.dbUser.stt_lang;
    const r = await ai.stt(wav, lang);
    return { text: (r.text || '').trim(), language: r.language, duration: meta.duration };
  } finally {
    safeUnlink(src, wav);
  }
}

async function sendTranscript(ctx, r) {
  if (!r.text) {
    await ctx.reply('🤷 Audioda aniq nutq topilmadi. Ovoz sifatini yaxshilab qayta yuboring.');
    return;
  }
  const head =
    '🎤 <b>Transkripsiya</b>\n' +
    `🌐 Til: <b>${common.esc(kb.langName(r.language))}</b>\n` +
    `⏱ Davomiylik: <b>${common.fmtDuration(r.duration)}</b>\n` +
    '<i>Model xato qilishi mumkin — kerak bo‘lsa ✏️ Tahrirlash tugmasini bosing.</i>\n\n';
  if (r.text.length <= 3000) {
    await ctx.reply(`${head}<code>${common.esc(r.text)}</code>`, { parse_mode: 'HTML', ...kb.transcriptKeyboard() });
  } else {
    await ctx.reply(`${head}Matn uzun (${r.text.length} belgi), shuning uchun to‘liq matn fayl sifatida yuborildi 👇`, { parse_mode: 'HTML' });
    await ctx.replyWithDocument({ source: Buffer.from(r.text, 'utf8'), filename: 'transcript.txt' }, kb.transcriptKeyboard());
  }
}

async function handleStt(ctx, info) {
  if (!(await common.requireService(ctx, 'stt'))) return;
  await common.runJob(ctx, 'stt', async (progress) => {
    const r = await transcribe(ctx, info, progress);
    ctx.session.last = { text: r.text, language: r.language, duration: r.duration };
    await sendTranscript(ctx, r);
    return { durationSec: r.duration };
  });
}

async function onEditText(ctx, text) {
  if (!ctx.session.last) { ctx.session.mode = 'stt'; return ctx.reply('Tahrirlash uchun avval audio yuboring.'); }
  ctx.session.last.text = text.slice(0, settings.limits.maxTextChars);
  ctx.session.mode = 'stt';
  await ctx.reply('✅ Matn yangilandi:');
  await sendTranscript(ctx, ctx.session.last);
}

function register(bot) {
  bot.hears(BTN.stt, async (ctx) => {
    if (!(await common.requireService(ctx, 'stt'))) return;
    ctx.session.mode = 'stt';
    await ctx.reply(
      '🎤 <b>Ovoz → Matn</b>\n\nVoice, MP3, WAV, M4A, OGG yoki video (MP4) yuboring — men uni matnga aylantiraman.\n' +
      `📏 Limit: ${settings.limits.maxFileMb} MB, ${common.fmtDuration(settings.limits.maxDurationSec)} gacha.\n` +
      '🇺🇿 Eslatma: Whisper o‘zbek tilini qo‘llaydi, lekin aniqligi ingliz/rus tilidan past. Kerak bo‘lsa matnni tahrirlang.',
      { parse_mode: 'HTML', ...kb.backMenu() }
    );
  });

  bot.action('stt_edit', async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.session.last) return ctx.reply('Matn topilmadi. Avval audio yuboring.');
    ctx.session.mode = 'stt_edit';
    await ctx.reply('✏️ Tuzatilgan matnni bitta xabarda yuboring (bekor qilish: 🔙 Orqaga).');
  });

  bot.action('stt_txt', async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.session.last || !ctx.session.last.text) return ctx.reply('Matn topilmadi. Avval audio yuboring.');
    await ctx.replyWithDocument({ source: Buffer.from(ctx.session.last.text, 'utf8'), filename: 'transcript.txt' });
  });
}

module.exports = register;
module.exports.transcribe = transcribe;
module.exports.handleStt = handleStt;
module.exports.onEditText = onEditText;
