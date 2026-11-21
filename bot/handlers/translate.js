'use strict';
const settings = require('../../config/settings');
const ai = require('../aiClient');
const kb = require('../keyboards');
const common = require('./common');
const tts = require('./tts');

const { BTN } = kb;
const SRC_CYCLE = ['auto', 'uz', 'ru', 'en', 'tr'];

function state(ctx) {
  if (!ctx.session.tr) ctx.session.tr = { src: 'auto', tgt: 'en', pending: null, hint: null, last: null };
  return ctx.session.tr;
}

const PROMPT = (tr) =>
  '🌍 <b>Tarjima</b>\n\nMatn yuboring (yoki audiodan olingan transkripsiyani tarjima qiling).\n' +
  `Hozir: <b>${kb.langName(tr.src)}</b> → <b>${kb.langName(tr.tgt)}</b>\n<i>Maqsad tilini tanlang 👇</i>`;

async function doTranslate(ctx, text, hint) {
  if (!(await common.requireService(ctx, 'translate'))) return;
  const tr = state(ctx);
  text = text.trim();
  if (!text) return;
  if (text.length > settings.limits.maxTextChars) return ctx.reply(`📏 Matn juda uzun. Maksimum: ${settings.limits.maxTextChars} belgi.`);
  await common.runJob(ctx, 'translate', async (progress) => {
    await progress.update('🌍 Tarjima qilinmoqda...');
    const src = tr.src === 'auto' ? hint || 'auto' : tr.src;
    const r = await ai.translate({ text, src, tgt: tr.tgt });
    tr.last = { text: r.text, lang: tr.tgt };
    const rows = [];
    if (kb.TTS_LANGS.includes(tr.tgt)) rows.push([kb.cb('🔊 Ovozga aylantirish', 'tr_say')]);
    const { Markup } = require('telegraf');
    await ctx.reply(
      `🌍 <b>${common.esc(kb.langName(r.src))} → ${common.esc(kb.langName(tr.tgt))}</b>\n\n<code>${common.esc(r.text)}</code>`,
      { parse_mode: 'HTML', ...(rows.length ? Markup.inlineKeyboard(rows) : {}) }
    );
  });
}

async function onText(ctx, text) { return doTranslate(ctx, text, null); }

function register(bot) {
  bot.hears(BTN.translate, async (ctx) => {
    if (!(await common.requireService(ctx, 'translate'))) return;
    ctx.session.mode = 'translate';
    const tr = state(ctx);
    tr.pending = null;
    await ctx.reply('Tarjima qilinadigan matnni yuboring 👇', kb.backMenu());
    await ctx.reply(PROMPT(tr), { parse_mode: 'HTML', ...kb.translateKeyboard(tr) });
  });

  bot.action(/^tr_tgt:(\w+)$/, async (ctx) => {
    const tr = state(ctx);
    if (!kb.TR_LANGS.includes(ctx.match[1])) return ctx.answerCbQuery();
    tr.tgt = ctx.match[1];
    await ctx.answerCbQuery(`→ ${kb.langName(tr.tgt)}`);
    await ctx.editMessageText(PROMPT(tr), { parse_mode: 'HTML', ...kb.translateKeyboard(tr) }).catch(() => {});
    if (tr.pending) {
      const text = tr.pending; const hint = tr.hint;
      tr.pending = null;
      await doTranslate(ctx, text, hint);
    }
  });

  bot.action('tr_src', async (ctx) => {
    const tr = state(ctx);
    tr.src = SRC_CYCLE[(SRC_CYCLE.indexOf(tr.src) + 1) % SRC_CYCLE.length];
    await ctx.answerCbQuery(`Manba: ${kb.langName(tr.src)}`);
    await ctx.editMessageText(PROMPT(tr), { parse_mode: 'HTML', ...kb.translateKeyboard(tr) }).catch(() => {});
  });

  // Transkripsiyani tarjima qilish
  bot.action('stt_tr', async (ctx) => {
    await ctx.answerCbQuery();
    const last = ctx.session.last;
    if (!last || !last.text) return ctx.reply('Matn topilmadi. Avval audio yuboring.');
    const tr = state(ctx);
    ctx.session.mode = 'translate';
    tr.pending = last.text;
    tr.hint = last.language || null;
    await ctx.reply('Qaysi tilga tarjima qilamiz? 👇', { ...kb.translateKeyboard(tr) });
  });

  bot.action('tr_say', async (ctx) => {
    await ctx.answerCbQuery();
    const tr = state(ctx);
    if (!tr.last) return ctx.reply('Tarjima topilmadi.');
    await tts.speak(ctx, tr.last.text, tr.last.lang);
  });
}

module.exports = register;
module.exports.onText = onText;
