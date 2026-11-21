'use strict';
const settings = require('../../config/settings');
const ai = require('../aiClient');
const kb = require('../keyboards');
const common = require('./common');
const voice = require('./voice');

const { BTN } = kb;
const MIN_CHARS = 80;

const list = (arr) => (arr || []).map((x) => `• ${common.esc(x)}`).join('\n');

function format(s) {
  const out = ['📝 <b>AI Xulosa</b>', ''];
  if (s.topic) out.push('🎯 <b>Asosiy mavzu</b>', common.esc(s.topic), '');
  if (s.key_points && s.key_points.length) out.push('💡 <b>Muhim fikrlar</b>', list(s.key_points), '');
  if (s.facts && s.facts.length) out.push('📌 <b>Muhim ma’lumotlar</b>', list(s.facts), '');
  if (s.conclusion) out.push('✅ <b>Yakuniy xulosa</b>', common.esc(s.conclusion), '');
  if (s.tasks && s.tasks.length) out.push('📋 <b>Bajarilishi kerak bo‘lgan vazifalar</b>', list(s.tasks), '');
  out.push(`<i>Usul: ${s.engine === 'llm' ? 'lokal LLM (Ollama)' : 'extractive (zaxira usul)'}</i>`);
  return out.join('\n');
}

async function summarizeText(ctx, text, lang, progress) {
  if (progress) await progress.update('🧠 Xulosa tayyorlanmoqda...');
  const s = await ai.summarize({ text, lang });
  await common.sendLong(ctx, format(s));
}

async function onText(ctx, text) {
  if (!(await common.requireService(ctx, 'summary'))) return;
  text = text.trim();
  if (text.length < MIN_CHARS) return ctx.reply(`Xulosa uchun matn juda qisqa (kamida ${MIN_CHARS} belgi kerak).`);
  if (text.length > settings.limits.maxTextChars) return ctx.reply(`📏 Matn juda uzun. Maksimum: ${settings.limits.maxTextChars} belgi.`);
  await common.runJob(ctx, 'summary', (progress) => summarizeText(ctx, text, null, progress));
}

async function onAudio(ctx, info) {
  if (!(await common.requireService(ctx, 'summary'))) return;
  if (!(await common.requireService(ctx, 'stt'))) return;
  await common.runJob(ctx, 'summary', async (progress) => {
    const r = await voice.transcribe(ctx, info, progress);
    if (!r.text || r.text.length < MIN_CHARS) {
      await ctx.reply(r.text ? `Audio matni juda qisqa, xulosa shart emas:\n\n<code>${common.esc(r.text)}</code>` : '🤷 Audioda nutq topilmadi.', { parse_mode: 'HTML' });
      return { durationSec: r.duration };
    }
    ctx.session.last = { text: r.text, language: r.language, duration: r.duration };
    await summarizeText(ctx, r.text, r.language, progress);
    return { durationSec: r.duration };
  });
}

function register(bot) {
  bot.hears(BTN.summary, async (ctx) => {
    if (!(await common.requireService(ctx, 'summary'))) return;
    ctx.session.mode = 'summary';
    await ctx.reply(
      '📝 <b>AI Xulosa</b>\n\nUzun matn yoki audio yuboring — men asosiy mavzu, muhim fikrlar, ma’lumotlar, yakuniy xulosa va vazifalarni ajratib beraman.',
      { parse_mode: 'HTML', ...kb.backMenu() }
    );
  });

  bot.action('stt_sum', async (ctx) => {
    await ctx.answerCbQuery();
    const last = ctx.session.last;
    if (!last || !last.text) return ctx.reply('Matn topilmadi. Avval audio yuboring.');
    if (last.text.length < MIN_CHARS) return ctx.reply('Matn xulosa uchun juda qisqa.');
    if (!(await common.requireService(ctx, 'summary'))) return;
    await common.runJob(ctx, 'summary', (progress) => summarizeText(ctx, last.text, last.language, progress));
  });
}

module.exports = register;
module.exports.onText = onText;
module.exports.onAudio = onAudio;
