'use strict';
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const settings = require('../../config/settings');
const db = require('../../database/db');
const logger = require('../../utils/logger');
const processor = require('../../audio/processor');
const { safeUnlink } = require('../../utils/cleanup');
const { AiError } = require('../aiClient');

class UserError extends Error {}

const ALLOWED_EXT = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.oga', '.opus', '.mp4', '.aac', '.flac', '.webm', '.mov', '.mkv', '.amr']);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtDuration = (sec) => {
  sec = Math.round(sec || 0);
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
};

/* ---------- Xizmatlarni yoqish/o'chirish ---------- */
const serviceOn = (name) => db.getSetting(`service_${name}`, '1') === '1';
async function requireService(ctx, name) {
  if (serviceOn(name)) return true;
  await ctx.reply('🚧 Bu xizmat hozircha vaqtincha o‘chirilgan. Keyinroq urinib ko‘ring.');
  return false;
}

/* ---------- Telegram media ---------- */
/** Xabardan audio ma'lumotini oladi. Qo'llab-quvvatlanmasa null qaytaradi. */
function mediaInfo(msg) {
  if (msg.voice) return { file_id: msg.voice.file_id, size: msg.voice.file_size, ext: '.ogg' };
  if (msg.audio) {
    const ext = path.extname(msg.audio.file_name || '').toLowerCase();
    return { file_id: msg.audio.file_id, size: msg.audio.file_size, ext: ALLOWED_EXT.has(ext) ? ext : '.mp3' };
  }
  if (msg.video) return { file_id: msg.video.file_id, size: msg.video.file_size, ext: '.mp4' };
  if (msg.video_note) return { file_id: msg.video_note.file_id, size: msg.video_note.file_size, ext: '.mp4' };
  if (msg.document) {
    const d = msg.document;
    const ext = path.extname(d.file_name || '').toLowerCase();
    const mimeOk = /^(audio|video)\//.test(d.mime_type || '');
    if (!mimeOk && !ALLOWED_EXT.has(ext)) return null;
    return { file_id: d.file_id, size: d.file_size, ext: ALLOWED_EXT.has(ext) ? ext : '.bin' };
  }
  return null;
}

async function downloadMedia(ctx, info) {
  const maxBytes = settings.limits.maxFileMb * 1024 * 1024;
  if (info.size && info.size > maxBytes) {
    throw new UserError(`📦 Fayl juda katta (${(info.size / 1048576).toFixed(1)} MB). Maksimum: ${settings.limits.maxFileMb} MB.`);
  }
  const link = await ctx.telegram.getFileLink(info.file_id);
  const dest = processor.tempPath(info.ext);
  try {
    const res = await fetch(link.href);
    if (!res.ok || !res.body) throw new Error(`Yuklab olishda xato: HTTP ${res.status}`);
    let total = 0;
    const body = Readable.fromWeb(res.body);
    body.on('data', (c) => {
      total += c.length;
      if (total > maxBytes) body.destroy(new UserError(`📦 Fayl juda katta. Maksimum: ${settings.limits.maxFileMb} MB.`));
    });
    await pipeline(body, fs.createWriteStream(dest));
    return dest;
  } catch (e) {
    safeUnlink(dest);
    throw e;
  }
}

/** Fayl haqiqatan audio ekanini va davomiylik limitini tekshiradi. */
async function validateMedia(file) {
  let meta;
  try { meta = await processor.probe(file); } catch (e) {
    if (/topilmadi/.test(e.message)) throw e;
    throw new UserError('❌ Fayl audio sifatida o‘qilmadi. Iltimos, boshqa fayl yuboring.');
  }
  if (!meta.hasAudio) throw new UserError('❌ Faylda audio topilmadi.');
  if (meta.duration > settings.limits.maxDurationSec) {
    throw new UserError(`⏱ Audio juda uzun (${fmtDuration(meta.duration)}). Maksimum: ${fmtDuration(settings.limits.maxDurationSec)}.`);
  }
  return meta;
}

/* ---------- Ishlarni boshqarish (navbat, progress, xatolar) ---------- */
class Semaphore {
  constructor(n) { this.n = n; this.q = []; }
  get busy() { return this.n <= 0; }
  acquire() {
    if (this.n > 0) { this.n--; return Promise.resolve(() => this._release()); }
    return new Promise((res) => this.q.push(() => res(() => this._release())));
  }
  _release() { const next = this.q.shift(); if (next) next(); else this.n++; }
}
const sem = new Semaphore(settings.limits.jobConcurrency);
const busyUsers = new Set();

function friendlyError(err) {
  if (err instanceof UserError) return err.message;
  if (err instanceof AiError) return err.userMessage;
  const m = String(err && err.message);
  if (/file is too big/i.test(m)) return `📦 Fayl Telegram yuklab olish limitidan (20 MB) katta. Kichikroq fayl yuboring.`;
  if (/FFmpeg|ffmpeg|ffprobe/.test(m) && /topilmadi/.test(m)) return '🛠 Serverda FFmpeg o‘rnatilmagan. Administrator bilan bog‘laning.';
  if (/ENOSPC/.test(m)) return '💾 Serverda joy yetarli emas. Keyinroq urinib ko‘ring.';
  if (/ENOMEM|out of memory/i.test(m)) return '🧠 Server xotirasi yetarli emas. Qisqaroq fayl yuboring.';
  return '❌ Kutilmagan xatolik yuz berdi. Iltimos, qayta urinib ko‘ring.';
}

/**
 * Og'ir ishni xavfsiz bajaradi: foydalanuvchiga bitta vaqtda bitta ish, global navbat,
 * progress xabari, xatolarni tushunarli ko'rsatish va statistikaga yozish.
 */
async function runJob(ctx, type, fn, { log = true } = {}) {
  const uid = ctx.from.id;
  if (busyUsers.has(uid)) {
    await ctx.reply('⏳ Oldingi so‘rovingiz hali ishlanmoqda. Iltimos, kuting.');
    return false;
  }
  busyUsers.add(uid);
  let msgId = null;
  const progress = {
    async update(text) {
      try {
        if (msgId === null) msgId = (await ctx.reply(text)).message_id;
        else await ctx.telegram.editMessageText(ctx.chat.id, msgId, undefined, text);
      } catch { /* "message is not modified" va h.k. */ }
    },
    async clear() {
      if (msgId !== null) { await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {}); msgId = null; }
    },
  };
  let release = null;
  try {
    if (sem.busy) await progress.update('⏳ Navbatda turibsiz, tez orada boshlanadi...');
    release = await sem.acquire();
    const result = (await fn(progress)) || {};
    if (log) db.logJob({ userId: uid, type, status: 'done', durationSec: result.durationSec || 0 });
    return true;
  } catch (err) {
    logger.error(`Job xatosi [${type}] user=${uid}:`, err);
    if (log) { try { db.logJob({ userId: uid, type, status: 'failed', error: err.message }); } catch { /* ignore */ } }
    await ctx.reply(friendlyError(err)).catch(() => {});
    return false;
  } finally {
    if (release) release();
    busyUsers.delete(uid);
    await progress.clear();
  }
}

/** 4096 belgidan uzun HTML xabarni qatorlar bo'yicha bo'lib yuboradi. */
async function sendLong(ctx, html, extra = {}) {
  const MAX = 3800;
  const parts = [];
  let cur = '';
  for (const line of String(html).split('\n')) {
    if ((cur + '\n' + line).length > MAX && cur) { parts.push(cur); cur = line; }
    else cur = cur ? cur + '\n' + line : line;
  }
  if (cur) parts.push(cur);
  for (let i = 0; i < parts.length; i++) {
    await ctx.reply(parts[i], { parse_mode: 'HTML', disable_web_page_preview: true, ...(i === parts.length - 1 ? extra : {}) });
  }
}

const getSession = (ctx) => ctx.session;
function resetMode(ctx) { ctx.session.mode = null; if (ctx.session.tr) ctx.session.tr.pending = null; }

module.exports = {
  UserError, esc, fmtDuration, serviceOn, requireService, mediaInfo, downloadMedia, validateMedia,
  runJob, sendLong, getSession, resetMode, friendlyError,
};
