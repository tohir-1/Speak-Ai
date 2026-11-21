'use strict';
const settings = require('../../config/settings');

/** Sodda sliding-window rate limiter (foydalanuvchi bo'yicha). */
module.exports = () => {
  const { rateLimitMax, rateLimitWindowSec } = settings.limits;
  const windowMs = rateLimitWindowSec * 1000;
  const hits = new Map();
  const warned = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [id, arr] of hits) if (!arr.length || now - arr[arr.length - 1] > windowMs) hits.delete(id);
    for (const [id, t] of warned) if (now - t > windowMs) warned.delete(id);
  }, windowMs).unref();

  return async (ctx, next) => {
    const id = ctx.from && ctx.from.id;
    if (!id) return next();
    const now = Date.now();
    const arr = (hits.get(id) || []).filter((t) => now - t < windowMs);
    if (arr.length >= rateLimitMax) {
      hits.set(id, arr);
      if (!warned.has(id)) {
        warned.set(id, now);
        if (ctx.callbackQuery) await ctx.answerCbQuery('⏳ Juda tez. Biroz kuting.').catch(() => {});
        else await ctx.reply(`⏳ Juda ko‘p so‘rov yubordingiz. Iltimos, ${rateLimitWindowSec} soniyadan keyin urinib ko‘ring.`).catch(() => {});
      }
      return;
    }
    arr.push(now);
    hits.set(id, arr);
    return next();
  };
};
