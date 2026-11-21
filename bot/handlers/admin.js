'use strict';
const db = require('../../database/db');
const settings = require('../../config/settings');
const broadcastSvc = require('../../utils/broadcast');
const common = require('./common');

const isAdmin = (ctx) => db.admins.isTelegramAdmin(ctx.from.id);

/** Bot ichidagi qisqa admin buyruqlari (to'liq boshqaruv — Web Dashboard). */
function register(bot) {
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const s = db.dashboardStats(1);
    await ctx.reply(
      '👨‍💻 <b>Admin</b>\n\n' +
      `👥 Foydalanuvchilar: <b>${s.totalUsers}</b> (bugun +${s.todayUsers}, bloklangan ${s.blockedUsers})\n` +
      `🎤 STT: ${s.stt} · 🔊 TTS: ${s.tts} · 🎭 Changer: ${s.changer}\n` +
      `🌍 Tarjima: ${s.translate} · 📝 Xulosa: ${s.summary}\n👥 Referrallar: ${s.totalReferrals}\n\n` +
      `🖥 Panel: http://${settings.admin.host}:${settings.admin.port}\n\n` +
      'Buyruqlar:\n<code>/broadcast matn</code>\n<code>/block ID</code>\n<code>/unblock ID</code>',
      { parse_mode: 'HTML' }
    );
  });

  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const text = ctx.message.text.replace(/^\/broadcast(@\w+)?\s*/i, '').trim();
    if (!text) return ctx.reply('Foydalanish: /broadcast Xabar matni');
    try {
      const st = await broadcastSvc.broadcast(ctx.telegram, common.esc(text));
      await ctx.reply(`📣 Yuborish boshlandi: ${st.total} ta foydalanuvchi.`);
    } catch (e) { await ctx.reply(e.message); }
  });

  for (const [cmd, val] of [['block', true], ['unblock', false]]) {
    bot.command(cmd, async (ctx) => {
      if (!isAdmin(ctx)) return;
      const id = Number((ctx.message.text.split(/\s+/)[1] || '').trim());
      if (!Number.isSafeInteger(id) || id <= 0) return ctx.reply(`Foydalanish: /${cmd} TELEGRAM_ID`);
      if (settings.adminTelegramIds.includes(id)) return ctx.reply('Adminni bloklab bo‘lmaydi.');
      const n = db.setBlocked(id, val);
      await ctx.reply(n ? (val ? '🚫 Bloklandi.' : '✅ Blokdan chiqarildi.') : 'Foydalanuvchi topilmadi.');
    });
  }
}

module.exports = register;
