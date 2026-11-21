'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const settings = require('../config/settings');

fs.mkdirSync(path.dirname(settings.dbPath), { recursive: true });
const db = new Database(settings.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const SERVICES = ['stt', 'tts', 'changer', 'translate', 'summary'];
const DEFAULT_SETTINGS = {
  about_text:
    '🎙️ <b>SpeakAI</b> — ovoz va matn bilan ishlovchi aqlli yordamchi.\n\n' +
    '• Ovoz → Matn (Whisper)\n• Matn → Ovoz\n• Voice Changer (12 ta effekt)\n• Tarjima va AI Xulosa\n\n' +
    'Barcha modellar bepul va open-source.',
};
for (const s of SERVICES) DEFAULT_SETTINGS[`service_${s}`] = '1';
const insSetting = db.prepare('INSERT OR IGNORE INTO bot_settings(key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insSetting.run(k, v);

const q = {
  getUser: db.prepare('SELECT * FROM users WHERE id = ?'),
  insUser: db.prepare('INSERT INTO users(id, username, first_name) VALUES (?, ?, ?)'),
  insUsage: db.prepare('INSERT OR IGNORE INTO usage_stats(user_id) VALUES (?)'),
  touchUser: db.prepare("UPDATE users SET username = ?, first_name = ?, last_seen = datetime('now') WHERE id = ?"),
  setBlocked: db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?'),
  insRef: db.prepare('INSERT INTO referrals(referrer_id, referred_id) VALUES (?, ?)'),
  setRefBy: db.prepare('UPDATE users SET referred_by = ? WHERE id = ?'),
  refCount: db.prepare('SELECT COUNT(*) AS c FROM referrals WHERE referrer_id = ?'),
  refRank: db.prepare('SELECT COUNT(*) + 1 AS r FROM (SELECT referrer_id FROM referrals GROUP BY referrer_id HAVING COUNT(*) > ?)'),
  refTop: db.prepare(
    `SELECT r.referrer_id AS id, u.username, u.first_name, COUNT(*) AS c
       FROM referrals r JOIN users u ON u.id = r.referrer_id
      GROUP BY r.referrer_id ORDER BY c DESC, MIN(r.id) ASC LIMIT ?`
  ),
  insJob: db.prepare('INSERT INTO audio_jobs(user_id, type, status, duration_sec, error) VALUES (?, ?, ?, ?, ?)'),
  getSetting: db.prepare('SELECT value FROM bot_settings WHERE key = ?'),
  putSetting: db.prepare('INSERT INTO bot_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  userStats: db.prepare(
    `SELECT u.*, s.stt_count, s.tts_count, s.changer_count, s.translate_count, s.summary_count
       FROM users u LEFT JOIN usage_stats s ON s.user_id = u.id WHERE u.id = ?`
  ),
};

const USAGE_COL = {
  stt: 'stt_count', tts: 'tts_count', changer: 'changer_count',
  translate: 'translate_count', summary: 'summary_count',
};
const incUsage = {};
for (const [t, col] of Object.entries(USAGE_COL)) {
  incUsage[t] = db.prepare(`UPDATE usage_stats SET ${col} = ${col} + 1 WHERE user_id = ?`);
}

const USER_SETTING_COLS = ['stt_lang', 'tts_lang', 'tts_gender', 'tts_speed', 'tts_pitch', 'tts_format'];

function upsertUser(from) {
  const existing = q.getUser.get(from.id);
  if (existing) {
    q.touchUser.run(from.username || null, from.first_name || null, from.id);
    q.insUsage.run(from.id);
    return { user: q.getUser.get(from.id), isNew: false };
  }
  db.transaction(() => {
    q.insUser.run(from.id, from.username || null, from.first_name || null);
    q.insUsage.run(from.id);
  })();
  return { user: q.getUser.get(from.id), isNew: true };
}

function updateUserSetting(id, key, value) {
  if (!USER_SETTING_COLS.includes(key)) throw new Error('Noto‘g‘ri sozlama: ' + key);
  db.prepare(`UPDATE users SET ${key} = ? WHERE id = ?`).run(value, id);
}

/** Referral qayd qilish. Faqat yangi foydalanuvchi uchun chaqiriladi. */
function addReferral(referrerId, referredId) {
  if (!Number.isSafeInteger(referrerId) || referrerId <= 0 || referrerId === referredId) return false;
  if (!q.getUser.get(referrerId)) return false;
  try {
    db.transaction(() => {
      q.insRef.run(referrerId, referredId);
      q.setRefBy.run(referrerId, referredId);
    })();
    return true;
  } catch {
    return false; // UNIQUE / CHECK buzilishi — takror yoki o'zini taklif qilish
  }
}

function logJob({ userId, type, status, durationSec = 0, error = null }) {
  db.transaction(() => {
    q.insJob.run(userId, type, status, durationSec || 0, error ? String(error).slice(0, 500) : null);
    if (status === 'done' && incUsage[type]) incUsage[type].run(userId);
  })();
}

function getSetting(key, def = null) {
  const r = q.getSetting.get(key);
  return r ? r.value : def;
}
function setSetting(key, value) { q.putSetting.run(key, String(value)); }

function allActiveUserIds() {
  return db.prepare('SELECT id FROM users WHERE is_blocked = 0').all().map((r) => r.id);
}

function dayList(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function dashboardStats(days = 14) {
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const totals = one(
    `SELECT COALESCE(SUM(stt_count),0) AS stt, COALESCE(SUM(tts_count),0) AS tts,
            COALESCE(SUM(changer_count),0) AS changer, COALESCE(SUM(translate_count),0) AS translate,
            COALESCE(SUM(summary_count),0) AS summary FROM usage_stats`
  );
  const list = dayList(days);
  const from = list[0];
  const usersByDay = Object.fromEntries(
    db.prepare("SELECT date(created_at) d, COUNT(*) c FROM users WHERE date(created_at) >= ? GROUP BY d").all(from).map((r) => [r.d, r.c])
  );
  const jobsByDay = Object.fromEntries(
    db.prepare("SELECT date(created_at) d, COUNT(*) c FROM audio_jobs WHERE status='done' AND date(created_at) >= ? GROUP BY d").all(from).map((r) => [r.d, r.c])
  );
  return {
    totalUsers: one('SELECT COUNT(*) c FROM users').c,
    todayUsers: one("SELECT COUNT(*) c FROM users WHERE date(created_at) = date('now')").c,
    blockedUsers: one('SELECT COUNT(*) c FROM users WHERE is_blocked = 1').c,
    totalAudio: totals.stt + totals.changer,
    stt: totals.stt, tts: totals.tts, changer: totals.changer,
    translate: totals.translate, summary: totals.summary,
    totalReferrals: one('SELECT COUNT(*) c FROM referrals').c,
    topReferrers: q.refTop.all(5),
    series: { days: list, users: list.map((d) => usersByDay[d] || 0), jobs: list.map((d) => jobsByDay[d] || 0) },
  };
}

function listUsers({ q: search = '', page = 1, limit = 20 } = {}) {
  limit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  page = Math.max(parseInt(page, 10) || 1, 1);
  const where = [];
  const params = [];
  const s = String(search || '').trim().replace(/^@/, '');
  if (s) {
    const like = `%${s.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
    if (/^\d+$/.test(s)) { where.push("(CAST(u.id AS TEXT) LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\')"); params.push(like, like); }
    else { where.push("(u.username LIKE ? ESCAPE '\\' OR u.first_name LIKE ? ESCAPE '\\')"); params.push(like, like); }
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM users u ${w}`).get(...params).c;
  const rows = db.prepare(
    `SELECT u.id, u.username, u.first_name, u.created_at, u.last_seen, u.is_blocked,
            COALESCE(s.stt_count,0) stt, COALESCE(s.tts_count,0) tts, COALESCE(s.changer_count,0) changer,
            (SELECT COUNT(*) FROM referrals r WHERE r.referrer_id = u.id) AS referrals
       FROM users u LEFT JOIN usage_stats s ON s.user_id = u.id ${w}
      ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, (page - 1) * limit);
  return { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), rows };
}

const admins = {
  count: () => db.prepare('SELECT COUNT(*) c FROM admins').get().c,
  byUsername: (u) => db.prepare('SELECT * FROM admins WHERE username = ?').get(u),
  byId: (id) => db.prepare('SELECT * FROM admins WHERE id = ?').get(id),
  list: () => db.prepare('SELECT id, username, telegram_id, created_at FROM admins ORDER BY id').all(),
  create: (username, hash, telegramId = null) =>
    db.prepare('INSERT INTO admins(username, password_hash, telegram_id) VALUES (?, ?, ?)').run(username, hash, telegramId).lastInsertRowid,
  remove: (id) => db.prepare('DELETE FROM admins WHERE id = ?').run(id).changes,
  isTelegramAdmin: (tgId) =>
    settings.adminTelegramIds.includes(tgId) || !!db.prepare('SELECT 1 FROM admins WHERE telegram_id = ?').get(tgId),
};

module.exports = {
  db, SERVICES, upsertUser, getUser: (id) => q.getUser.get(id), userStats: (id) => q.userStats.get(id),
  setBlocked: (id, v) => q.setBlocked.run(v ? 1 : 0, id).changes,
  updateUserSetting, addReferral,
  referralCount: (id) => q.refCount.get(id).c,
  referralRank: (id) => q.refRank.get(q.refCount.get(id).c).r,
  topReferrers: (n = 10) => q.refTop.all(n),
  logJob, getSetting, setSetting, allActiveUserIds, dashboardStats, listUsers, admins,
};
