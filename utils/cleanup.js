'use strict';
const fs = require('fs');
const path = require('path');
const settings = require('../config/settings');
const logger = require('./logger');

function safeUnlink(...files) {
  for (const f of files.flat()) {
    if (!f) continue;
    fs.promises.unlink(f).catch(() => {});
  }
}

function cleanupOld(ttlMs) {
  let removed = 0;
  let names = [];
  try { names = fs.readdirSync(settings.tempDir); } catch { return 0; }
  const now = Date.now();
  for (const name of names) {
    if (name === '.gitkeep') continue;
    const full = path.join(settings.tempDir, name);
    try {
      const st = fs.statSync(full);
      if (st.isFile() && now - st.mtimeMs > ttlMs) {
        fs.unlinkSync(full);
        removed++;
      }
    } catch { /* ignore */ }
  }
  return removed;
}

function startCleanup() {
  const ttl = settings.tempTtlMinutes * 60 * 1000;
  // Ishga tushganda barcha eski qoldiqlarni tozalaymiz
  const n = cleanupOld(0);
  if (n) logger.info(`Vaqtinchalik fayllar tozalandi: ${n}`);
  const timer = setInterval(() => {
    const r = cleanupOld(ttl);
    if (r) logger.info(`Eskirgan vaqtinchalik fayllar o‘chirildi: ${r}`);
  }, 5 * 60 * 1000);
  timer.unref();
  return timer;
}

module.exports = { safeUnlink, cleanupOld, startCleanup };
