'use strict';
const fs = require('fs');
const settings = require('../config/settings');

class AiError extends Error {
  constructor(message, userMessage) { super(message); this.userMessage = userMessage; }
}

async function call(path, init) {
  const headers = { ...(init.headers || {}) };
  if (settings.ai.token) headers['X-Token'] = settings.ai.token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), settings.ai.timeoutMs);
  let res;
  try {
    res = await fetch(settings.ai.url + path, { ...init, headers, signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new AiError('AI timeout', '⌛ Qayta ishlash juda uzoq davom etdi. Qisqaroq audio/matn yuboring yoki keyinroq urinib ko‘ring.');
    throw new AiError(`AI service ulanmadi: ${e.message}`, '🔌 AI xizmati hozir ishlamayapti. Administrator `ai-service` ni ishga tushirishi kerak.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).detail || ''; } catch { /* ignore */ }
    if (res.status === 503 || res.status === 507) {
      throw new AiError(`AI ${res.status}: ${detail}`, `⚠️ Server resurslari yetarli emas yoki model yuklanmagan. ${detail}`.trim());
    }
    if (res.status === 400 || res.status === 422) throw new AiError(`AI ${res.status}: ${detail}`, `⚠️ ${detail || 'So‘rov qabul qilinmadi.'}`);
    if (res.status === 401) throw new AiError('AI token noto‘g‘ri', '🔐 AI xizmati bilan autentifikatsiya xatosi (AI_SERVICE_TOKEN).');
    throw new AiError(`AI ${res.status}: ${detail}`, '❌ AI xizmatida xatolik yuz berdi. Keyinroq urinib ko‘ring.');
  }
  return res;
}

async function stt(wavPath, language) {
  const form = new FormData();
  form.append('file', new Blob([await fs.promises.readFile(wavPath)], { type: 'audio/wav' }), 'audio.wav');
  if (language) form.append('language', language);
  return (await call('/stt', { method: 'POST', body: form })).json();
}

const jsonPost = (path, body) =>
  call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function tts({ text, lang, gender }) {
  const res = await jsonPost('/tts', { text, lang, gender });
  return { buffer: Buffer.from(await res.arrayBuffer()), engine: res.headers.get('x-engine') || '' };
}
async function translate({ text, src, tgt }) { return (await jsonPost('/translate', { text, src: src || 'auto', tgt })).json(); }
async function summarize({ text, lang }) { return (await jsonPost('/summarize', { text, lang: lang || null })).json(); }
async function health() { return (await call('/health', { method: 'GET' })).json(); }

module.exports = { stt, tts, translate, summarize, health, AiError };
