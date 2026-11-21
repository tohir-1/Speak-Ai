'use strict';
const db = require('../../database/db');

/** Faqat shaxsiy chat; foydalanuvchini ro'yxatga oladi; bloklanganlarni to'xtatadi. */
module.exports = () => async (ctx, next) => {
  if (!ctx.from || ctx.from.is_bot) return;
  if (ctx.chat && ctx.chat.type !== 'private') return;
  const { user, isNew } = db.upsertUser(ctx.from);
  ctx.dbUser = user;
  ctx.state.isNew = isNew;
  if (user.is_blocked) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('🚫 Siz bloklangansiz.', { show_alert: true }).catch(() => {});
    else await ctx.reply('🚫 Siz botdan foydalanishdan bloklangansiz.').catch(() => {});
    return;
  }
  return next();
};
