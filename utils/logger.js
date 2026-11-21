'use strict';
const fs = require('fs');
const path = require('path');
const settings = require('../config/settings');

fs.mkdirSync(settings.logDir, { recursive: true });
const stream = fs.createWriteStream(path.join(settings.logDir, 'app.log'), { flags: 'a' });

function fmt(args) {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object' && a !== null) {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    })
    .join(' ');
}

function log(level, args) {
  const line = `${new Date().toISOString()} [${level}] ${fmt(args)}`;
  (level === 'ERROR' ? console.error : console.log)(line);
  stream.write(line + '\n');
}

module.exports = {
  info: (...a) => log('INFO', a),
  warn: (...a) => log('WARN', a),
  error: (...a) => log('ERROR', a),
  debug: (...a) => { if (process.env.DEBUG) log('DEBUG', a); },
};
