'use strict';
const fs = require('fs');
const settings = require('../../config/settings');
const processor = require('../../audio/processor');
const { buildChain, EFFECTS, LIMITS } = require('../../audio/effects');
const { safeUnlink } = require('../../utils/cleanup');
const kb = require('../keyboards');
const common = require('./common');

const { BTN } = kb;

function newState(file, duration) {
  return { file, duration, effects: [], pitch: 0, speed: 1, vol: 0, lastWav: null };
}

/** Sessiyadagi vaqtinchalik fayllarni o'chiradi. */
function drop(ctx) {
  const c = ctx.session && ctx.session.changer;
  if (c) safeUnlink(c.file, c.lastWav);
  if (ctx.session) ctx.session.changer = null;
}

function getState(ctx) {
  const c = ctx.session.changer;
  if (!c || !fs.existsSync(c.file)) return null;
  return c;
}

async function onAudio(ctx, info) {
  if (!(await common.requireService(ctx, 'changer'))) return;
  await common.runJob(ctx, 'changer', async (progress) => {
    await progress.update('📥 Audio yuklab olinmoqda...');
    const src = await common.downloadMedia(ctx, info);
    const wav = processor.tempPath('.wav');
    try {
      const meta = await common.validateMedia(src);
      await progress.update('🎛 Audio tayyorlanmoqda...');
      await processor.normalize44k(src, wav);
      drop(ctx);
      ctx.session.changer = newState(wav, meta.duration);
    } catch (e) {
      safeUnlink(wav);
      throw e;
    } finally {
      safeUnlink(src);
    }
    await ctx.reply(
      '🎭 <b>Voice Changer</b>\n\nAudio qabul qilindi ✅ (asl ovoz saqlanadi).\n' +
      'Effektni tanlang — bir nechtasini birlashtirish mumkin. Pitch, tezlik va balandlikni ham sozlang, so‘ng <b>✅ Qo‘llash</b> ni bosing.\n' +
      '🎚️ <b>Original</b> — asl ovozni qaytaradi.',
      { parse_mode: 'HTML', ...kb.effectsKeyboard(ctx.session.changer) }
    );
  }, { log: false });
}

async function apply(ctx, override) {
  const c = getState(ctx);
  if (!c) return ctx.reply('⌛ Sessiya eskirgan. Audioni qayta yuboring.');
  const params = override || c;
  const chain = buildChain(params);
  await common.runJob(ctx, 'changer', async (progress) => {
    await progress.update('🎭 Effektlar qo‘llanmoqda...');
    const out = processor.tempPath('.wav');
    const mp3 = processor.tempPath('.mp3');
    const ogg = processor.tempPath('.ogg');
    try {
      await processor.applyFilter(c.file, chain, out);
      await processor.toMp3(out, mp3);
      await processor.toOpusVoice(out, ogg);
      const names = override ? '🎚️ Original' : (params.effects.map((id) => EFFECTS[id].label).join(' + ') || 'Faqat sozlamalar');
      await progress.update('📤 Yuborilmoqda...');
      await ctx.replyWithVoice({ source: ogg }, { caption: `🎭 ${names}` });
      await ctx.replyWithAudio({ source: mp3, filename: 'speakai_voice.mp3' }, {
        title: 'SpeakAI Voice', performer: 'SpeakAI',
        ...require('telegraf').Markup.inlineKeyboard([[kb.cb('📥 WAV formatda olish', 'fx_wav')]]),
      });
      safeUnlink(c.lastWav);
      c.lastWav = out;
    } catch (e) {
      safeUnlink(out);
      throw e;
    } finally {
      safeUnlink(mp3, ogg);
    }
    return { durationSec: c.duration };
  });
}

const step = {
  pitch: { key: 'pitch', d: 1, lim: LIMITS.pitch, def: 0, round: (v) => Math.round(v) },
  speed: { key: 'speed', d: 0.1, lim: LIMITS.speed, def: 1, round: (v) => Math.round(v * 10) / 10 },
  vol: { key: 'vol', d: 3, lim: LIMITS.vol, def: 0, round: (v) => Math.round(v) },
};

function register(bot) {
  bot.hears(BTN.changer, async (ctx) => {
    if (!(await common.requireService(ctx, 'changer'))) return;
    ctx.session.mode = 'changer';
    await ctx.reply(
      '🎭 <b>Voice Changer</b>\n\nOvoz o‘zgartirish uchun voice yoki audio fayl yuboring.\n' +
      '12 ta effekt: Robot, Monster, Chipmunk, Deep, Ghost, Radio, Telephone, Slow, Fast, Echo, Reverb, Original.\n\n' +
      '<i>Eslatma: bu effektlar ovoz tembri va ohangini o‘zgartiradi, lekin ovozni boshqa insonnikiga aylantirmaydi.</i>',
      { parse_mode: 'HTML', ...kb.backMenu() }
    );
  });

  bot.action(/^fx:(\w+)$/, async (ctx) => {
    const id = ctx.match[1];
    const c = getState(ctx);
    if (!c) { await ctx.answerCbQuery('Sessiya eskirgan'); return ctx.reply('⌛ Sessiya eskirgan. Audioni qayta yuboring.'); }
    if (id === 'original') {
      await ctx.answerCbQuery('Asl ovoz');
      return apply(ctx, { effects: [], pitch: 0, speed: 1, vol: 0 });
    }
    if (!EFFECTS[id]) return ctx.answerCbQuery();
    c.effects = c.effects.includes(id) ? c.effects.filter((x) => x !== id) : [...c.effects, id];
    await ctx.answerCbQuery(c.effects.includes(id) ? 'Qo‘shildi' : 'Olib tashlandi');
    await ctx.editMessageReplyMarkup(kb.effectsKeyboard(c).reply_markup).catch(() => {});
  });

  bot.action(/^adj:(pitch|speed|vol):(up|down|reset)$/, async (ctx) => {
    const c = getState(ctx);
    if (!c) { await ctx.answerCbQuery('Sessiya eskirgan'); return ctx.reply('⌛ Sessiya eskirgan. Audioni qayta yuboring.'); }
    const s = step[ctx.match[1]];
    const dir = ctx.match[2];
    const next = dir === 'reset' ? s.def : c[s.key] + (dir === 'up' ? s.d : -s.d);
    c[s.key] = s.round(Math.min(s.lim[1], Math.max(s.lim[0], next)));
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(kb.effectsKeyboard(c).reply_markup).catch(() => {});
  });

  bot.action('fx_apply', async (ctx) => {
    await ctx.answerCbQuery();
    const c = getState(ctx);
    if (c && !c.effects.length && !c.pitch && c.speed === 1 && !c.vol) {
      return ctx.reply('Avval kamida bitta effekt tanlang yoki pitch/tezlik/balandlikni o‘zgartiring.');
    }
    return apply(ctx);
  });

  bot.action('fx_wav', async (ctx) => {
    await ctx.answerCbQuery();
    const c = ctx.session.changer;
    if (!c || !c.lastWav || !fs.existsSync(c.lastWav)) return ctx.reply('⌛ Fayl eskirgan. Effektni qayta qo‘llang.');
    await ctx.replyWithDocument({ source: c.lastWav, filename: 'speakai_voice.wav' });
  });

  bot.action('fx_cancel', async (ctx) => {
    await ctx.answerCbQuery('Bekor qilindi');
    drop(ctx);
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});
    await ctx.reply('❌ Bekor qilindi. Yangi audio yuborishingiz mumkin.');
  });
}

module.exports = register;
module.exports.onAudio = onAudio;
module.exports.drop = drop;
