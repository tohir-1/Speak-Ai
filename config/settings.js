'use strict';
const path = require('path');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env') });

const num = (v, d) => {
  if (v === undefined || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

const settings = {
  root,
  env: process.env.NODE_ENV || 'development',
  botToken: process.env.BOT_TOKEN || '',
  botApiRoot: process.env.TELEGRAM_API_ROOT || undefined,
  adminTelegramIds: list(process.env.ADMIN_TELEGRAM_IDS).map(Number).filter(Number.isFinite),
  dbPath: path.resolve(root, process.env.DB_PATH || 'database/speakai.sqlite'),
  tempDir: path.join(root, 'audio', 'temp'),
  logDir: path.join(root, 'logs'),
  tempTtlMinutes: num(process.env.TEMP_TTL_MINUTES, 30),
  ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
  ffprobe: process.env.FFPROBE_PATH || 'ffprobe',
  limits: {
    maxFileMb: num(process.env.MAX_FILE_MB, 20),
    maxDurationSec: num(process.env.MAX_DURATION_SEC, 600),
    maxTtsChars: num(process.env.MAX_TTS_CHARS, 1000),
    maxTextChars: num(process.env.MAX_TEXT_CHARS, 8000),
    rateLimitMax: num(process.env.RATE_LIMIT_MAX, 20),
    rateLimitWindowSec: num(process.env.RATE_LIMIT_WINDOW_SEC, 60),
    jobConcurrency: Math.max(1, num(process.env.JOB_CONCURRENCY, 2)),
  },
  ai: {
    url: (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8008').replace(/\/+$/, ''),
    token: process.env.AI_SERVICE_TOKEN || '',
    timeoutMs: num(process.env.AI_TIMEOUT_MS, 600000),
  },
  admin: {
    host: process.env.ADMIN_HOST || '127.0.0.1',
    port: num(process.env.ADMIN_PORT, 3000),
    jwtSecret: process.env.JWT_SECRET || '',
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || '',
    cookieSecure: String(process.env.COOKIE_SECURE).toLowerCase() === 'true',
  },
  runtime: { botUsername: '' },
};

settings.validate = function validate({ needBot = true, needAdmin = true } = {}) {
  const errors = [];
  if (needBot && !settings.botToken) errors.push('BOT_TOKEN .env faylida ko‘rsatilmagan (@BotFather dan oling).');
  if (needAdmin && settings.admin.jwtSecret.length < 32) errors.push('JWT_SECRET kamida 32 belgidan iborat bo‘lishi kerak.');
  if (errors.length) {
    const e = new Error('Konfiguratsiya xatosi:\n - ' + errors.join('\n - '));
    e.isConfigError = true;
    throw e;
  }
};

module.exports = settings;
