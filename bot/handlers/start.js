'use strict';
const db = require('../../database/db');
const settings = require('../../config/settings');
const kb = require('../keyboards');
const common = require('./common');
const changer = require('./changer');

const { BTN } = kb;

const WELCOME = (name) =>
  `👋 Salom, <b>${common.esc(name || 'do‘st')}</b>!\n\n` +
  '🎙️ <b>SpeakAI</b> ga xush kelibsiz. Men quyidagilarni qila olaman:\n\n' +
  '🎤 Ovozni matnga aylantirish\n🔊 Matnni ovozga aylantirish\n🎭 Ovozni o‘zgartirish (12 ta effekt)\n' +
  '🌍 Tarjima\n📝 Uzun matn/audiodan AI xulosa\n\nKerakli bo‘limni pastdagi menyudan tanlang 👇';

function goMain(ctx, text) {
  changer.drop(ctx);
  common.resetMode(ctx);
  return ctx.reply(text || '🏠 Asosiy menyu', { parse_mode: 'HTML', ...kb.mainMenu() });
}

function statsText(ctx) {
  const s = db.userStats(ctx.from.id);
  const refs = db.referralCount(ctx.from.id);
  return (
    '📊 <b>Sizning statistikangiz</b>\n\n' +
    `🆔 ID: <code>${s.id}</code>\n` +
    `👤 Username: ${s.username ? '@' + common.esc(s.username) : '—'}\n` +
    `📅 Ro‘yxatdan o‘tgan: ${common.esc(s.created_at)} (UTC)\n\n` +
    `🎤 Qayta ishlangan audio: <b>${s.stt_count || 0}</b>\n` +
    `🔊 Matndan ovoz: <b>${s.tts_count || 0}</b>\n` +
    `🎭 Voice Changer: <b>${s.changer_count || 0}</b>\n` +
    `🌍 Tarjimalar: <b>${s.translate_count || 0}</b>\n` +
    `📝 Xulosalar: <b>${s.summary_count || 0}</b>\n` +
    `👥 Taklif qilgan do‘stlar: <b>${refs}</b>`
  );
}

module.exports = function register(bot) {
  bot.start(async (ctx) => {
    const payload = (ctx.startPayload || '').trim();
    if (ctx.state.isNew && /^ref_\d+$/.test(payload)) {
      const referrerId = Number(payload.slice(4));
      if (db.addReferral(referrerId, ctx.from.id)) {
        ctx.telegram
          .sendMessage(referrerId, `🎉 Sizning havolangiz orqali yangi foydalanuvchi qo‘shildi! Jami takliflar: <b>${db.referralCount(referrerId)}</b>`, { parse_mode: 'HTML' })
          .catch(() => {});
      }
    }
    await goMain(ctx, WELCOME(ctx.from.first_name));
  });

  bot.command('menu', (ctx) => goMain(ctx));
  bot.command('help', (ctx) => goMain(ctx, WELCOME(ctx.from.first_name)));
  bot.command('cancel', (ctx) => goMain(ctx, '❌ Bekor qilindi.'));
  bot.hears(BTN.back, (ctx) => goMain(ctx));

  bot.hears(BTN.stats, (ctx) => ctx.reply(statsText(ctx), { parse_mode: 'HTML' }));
  bot.hears(BTN.about, (ctx) => ctx.reply(db.getSetting('about_text', 'SpeakAI'), { parse_mode: 'HTML', disable_web_page_preview: true }));

  bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery('Bekor qilindi');
    changer.drop(ctx);
    common.resetMode(ctx);
    ctx.session.pending = null;
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});
    await ctx.reply('❌ Bekor qilindi.', kb.mainMenu());
  });
  bot.action('close', async (ctx) => { await ctx.answerCbQuery(); await ctx.deleteMessage().catch(() => {}); });
  bot.action('noop', (ctx) => ctx.answerCbQuery());
};

module.exports.goMain = goMain;
