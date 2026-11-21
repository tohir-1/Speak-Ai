'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const settings = require('../config/settings');

fs.mkdirSync(settings.tempDir, { recursive: true });

function tempPath(ext = '.tmp') {
  return path.join(settings.tempDir, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
}

/** Tashqi dasturni (shell'siz!) ishga tushiradi. */
function run(cmd, args, { timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd}: vaqt tugadi`)); }, timeoutMs);
    p.stdout.on('data', (d) => { out += d; if (out.length > 200000) out = out.slice(-200000); });
    p.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-20000); });
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e.code === 'ENOENT' ? new Error(`${cmd} topilmadi. FFmpeg o‘rnatilganini va PATH ga qo‘shilganini tekshiring.`) : e);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ out, err });
      else reject(new Error(`${cmd} xatosi (${code}): ${err.slice(-400)}`));
    });
  });
}

const ff = (args, opt) => run(settings.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args], opt);

/** Fayl ma'lumotlari: davomiylik va audio oqimi borligi. */
async function probe(file) {
  const { out } = await run(settings.ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], { timeoutMs: 30000 });
  const j = JSON.parse(out || '{}');
  return {
    duration: parseFloat(j.format && j.format.duration) || 0,
    hasAudio: Array.isArray(j.streams) && j.streams.some((s) => s.codec_type === 'audio'),
  };
}

// Whisper uchun: 16 kHz mono WAV
const toWav16k = (input, output) =>
  ff(['-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', output]);

// Voice Changer uchun: 44.1 kHz mono WAV
const normalize44k = (input, output) =>
  ff(['-y', '-i', input, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', output]);

const applyFilter = (input, chain, output) =>
  ff(['-y', '-i', input, '-vn', '-af', chain, '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', output]);

const toMp3 = (input, output) => ff(['-y', '-i', input, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', output]);

// Telegram "voice" xabari uchun OGG/Opus
const toOpusVoice = (input, output) =>
  ff(['-y', '-i', input, '-vn', '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1', '-application', 'voip', output]);

module.exports = { tempPath, run, probe, toWav16k, normalize44k, applyFilter, toMp3, toOpusVoice };
