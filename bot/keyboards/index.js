'use strict';
const { Markup } = require('telegraf');
const { EFFECTS, EFFECT_ORDER } = require('../../audio/effects');

const BTN = {
  stt: '🎤 Ovoz → Matn',
  tts: '🔊 Matn → Ovoz',
  changer: '🎭 Voice Changer',
  translate: '🌍 Tarjima',
  summary: '📝 AI Xulosa',
  stats: '📊 Mening statistikalarim',
  invite: '👥 Do‘stlarni taklif qilish',
  about: 'ℹ️ Bot haqida',
  settings: '⚙️ Sozlamalar',
  back: '🔙 Orqaga',
};

const LANGS = {
  uz: '🇺🇿 O‘zbek', ru: '🇷🇺 Rus', en: '🇬🇧 Ingliz', tr: '🇹🇷 Turk', de: '🇩🇪 Nemis', fr: '🇫🇷 Fransuz',
  es: '🇪🇸 Ispan', it: '🇮🇹 Italyan', ar: '🇸🇦 Arab', zh: '🇨🇳 Xitoy', ko: '🇰🇷 Koreys', ja: '🇯🇵 Yapon',
  kk: '🇰🇿 Qozoq', tg: '🇹🇯 Tojik',
};
const TTS_LANGS = ['uz', 'ru', 'en', 'tr', 'de', 'fr', 'es'];
const TR_LANGS = Object.keys(LANGS);
const STT_LANGS = ['auto', 'uz', 'ru', 'en', 'tr'];
const langName = (c) => (c === 'auto' ? '🔎 Avto' : LANGS[c] || String(c || '?').toUpperCase());

const mainMenu = () =>
  Markup.keyboard([
    [BTN.stt, BTN.tts],
    [BTN.changer, BTN.translate],
    [BTN.summary, BTN.stats],
    [BTN.invite, BTN.about],
    [BTN.settings],
  ]).resize();

const backMenu = () => Markup.keyboard([[BTN.back]]).resize();

const cb = (label, data) => Markup.button.callback(label, data);
const chunk = (arr, n) => { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; };

function pitchLabel(p) { return `🎼 Pitch ${p > 0 ? '+' : ''}${p}`; }

function effectsKeyboard(c) {
  const fx = EFFECT_ORDER.map((id) => cb((c.effects.includes(id) ? '✅ ' : '') + EFFECTS[id].label, `fx:${id}`));
  const rows = chunk(fx, 2);
  rows.push([cb('⬇️', 'adj:pitch:down'), cb(pitchLabel(c.pitch), 'adj:pitch:reset'), cb('⬆️', 'adj:pitch:up')]);
  rows.push([cb('⬇️', 'adj:speed:down'), cb(`⏱ Tezlik ×${c.speed.toFixed(1)}`, 'adj:speed:reset'), cb('⬆️', 'adj:speed:up')]);
  rows.push([cb('⬇️', 'adj:vol:down'), cb(`🔊 Balandlik ${c.vol > 0 ? '+' : ''}${c.vol} dB`, 'adj:vol:reset'), cb('⬆️', 'adj:vol:up')]);
  rows.push([cb('✅ Qo‘llash', 'fx_apply'), cb('❌ Bekor qilish', 'fx_cancel')]);
  return Markup.inlineKeyboard(rows);
}

function ttsKeyboard(u) {
  const rows = chunk(TTS_LANGS.map((c) => cb((u.tts_lang === c ? '✅ ' : '') + LANGS[c], `tts:lang:${c}`)), 3);
  rows.push([
    cb((u.tts_gender === 'female' ? '✅ ' : '') + '👩 Ayol', 'tts:gender:female'),
    cb((u.tts_gender === 'male' ? '✅ ' : '') + '👨 Erkak', 'tts:gender:male'),
  ]);
  rows.push([cb('❌ Bekor qilish', 'cancel')]);
  return Markup.inlineKeyboard(rows);
}

function translateKeyboard(tr) {
  const rows = chunk(TR_LANGS.map((c) => cb((tr.tgt === c ? '✅ ' : '') + LANGS[c], `tr_tgt:${c}`)), 3);
  rows.push([cb(`📥 Manba tili: ${langName(tr.src)} 🔄`, 'tr_src')]);
  rows.push([cb('❌ Bekor qilish', 'cancel')]);
  return Markup.inlineKeyboard(rows);
}

function settingsKeyboard(u) {
  const on = (v, x) => (v === x ? '✅ ' : '');
  return Markup.inlineKeyboard([
    [cb('🎤 Ovoz → Matn tili:', 'noop')],
    STT_LANGS.map((c) => cb(on(u.stt_lang, c) + (c === 'auto' ? 'Avto' : c.toUpperCase()), `set:stt_lang:${c}`)),
    [cb('🔊 Matn → Ovoz tili:', 'noop')],
    ...chunk(TTS_LANGS.map((c) => cb(on(u.tts_lang, c) + c.toUpperCase(), `set:tts_lang:${c}`)), 4),
    [cb(on(u.tts_gender, 'female') + '👩 Ayol', 'set:tts_gender:female'), cb(on(u.tts_gender, 'male') + '👨 Erkak', 'set:tts_gender:male')],
    [cb('⬇️', 'set:tts_speed:down'), cb(`⏱ Tezlik ×${Number(u.tts_speed).toFixed(1)}`, 'set:tts_speed:reset'), cb('⬆️', 'set:tts_speed:up')],
    [cb('⬇️', 'set:tts_pitch:down'), cb(pitchLabel(u.tts_pitch), 'set:tts_pitch:reset'), cb('⬆️', 'set:tts_pitch:up')],
    [cb(on(u.tts_format, 'mp3') + 'MP3', 'set:tts_format:mp3'), cb(on(u.tts_format, 'wav') + 'WAV', 'set:tts_format:wav')],
    [cb('✖️ Yopish', 'close')],
  ]);
}

const pickKeyboard = () =>
  Markup.inlineKeyboard([
    [cb('🎤 Matnga aylantirish', 'pick:stt'), cb('🎭 Voice Changer', 'pick:changer')],
    [cb('📝 AI Xulosa', 'pick:summary'), cb('❌ Bekor qilish', 'cancel')],
  ]);

const transcriptKeyboard = () =>
  Markup.inlineKeyboard([
    [cb('✏️ Tahrirlash', 'stt_edit'), cb('📄 TXT fayl', 'stt_txt')],
    [cb('🌍 Tarjima', 'stt_tr'), cb('📝 Xulosa', 'stt_sum')],
  ]);

const cancelKeyboard = () => Markup.inlineKeyboard([[cb('❌ Bekor qilish', 'cancel')]]);

module.exports = {
  BTN, LANGS, TTS_LANGS, TR_LANGS, STT_LANGS, langName, mainMenu, backMenu, effectsKeyboard, ttsKeyboard,
  translateKeyboard, settingsKeyboard, pickKeyboard, transcriptKeyboard, cancelKeyboard, cb,
};
