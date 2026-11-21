'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../database/db');
const settings = require('../../config/settings');
const broadcastSvc = require('../../utils/broadcast');
const { requireAuth } = require('./auth');

const intId = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = function apiRoutes(telegram) {
  const r = express.Router();
  r.use(requireAuth);

  r.get('/dashboard', (req, res) => res.json(db.dashboardStats(14)));

  /* ---------- Foydalanuvchilar ---------- */
  r.get('/users', (req, res) => res.json(db.listUsers({ q: req.query.q, page: req.query.page, limit: req.query.limit })));

  r.get('/users/:id', (req, res) => {
    const id = intId(req.params.id);
    const u = id && db.userStats(id);
    if (!u) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    res.json({ ...u, referrals: db.referralCount(id) });
  });

  for (const [action, val] of [['block', true], ['unblock', false]]) {
    r.post(`/users/:id/${action}`, (req, res) => {
      const id = intId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Noto‘g‘ri ID' });
      if (val && settings.adminTelegramIds.includes(id)) return res.status(400).json({ error: 'Adminni bloklab bo‘lmaydi' });
      if (!db.setBlocked(id, val)) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
      res.json({ ok: true });
    });
  }

  /* ---------- Broadcast ---------- */
  r.post('/broadcast', async (req, res) => {
    const text = String((req.body && req.body.text) || '').trim();
    if (!text) return res.status(400).json({ error: 'Xabar matni bo‘sh' });
    if (text.length > 4000) return res.status(400).json({ error: 'Xabar 4000 belgidan oshmasin' });
    try {
      // Matn oddiy matn sifatida yuboriladi (HTML escape qilinadi)
      res.json(await broadcastSvc.broadcast(telegram, escHtml(text)));
    } catch (e) { res.status(409).json({ error: e.message }); }
  });
  r.get('/broadcast/status', (req, res) => res.json(broadcastSvc.status()));

  /* ---------- Bot boshqaruvi ---------- */
  r.get('/settings', (req, res) => {
    const services = {};
    for (const s of db.SERVICES) services[s] = db.getSetting(`service_${s}`, '1') === '1';
    res.json({ about_text: db.getSetting('about_text', ''), services });
  });

  r.put('/settings', (req, res) => {
    const b = req.body || {};
    if (typeof b.about_text === 'string') {
      if (b.about_text.length > 3000) return res.status(400).json({ error: 'Matn juda uzun' });
      db.setSetting('about_text', b.about_text);
    }
    if (b.services && typeof b.services === 'object') {
      for (const s of db.SERVICES) if (typeof b.services[s] === 'boolean') db.setSetting(`service_${s}`, b.services[s] ? '1' : '0');
    }
    res.json({ ok: true });
  });

  /* ---------- Adminlar ---------- */
  r.get('/admins', (req, res) => res.json(db.admins.list()));

  r.post('/admins', async (req, res) => {
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    const tg = req.body && req.body.telegram_id ? intId(req.body.telegram_id) : null;
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) return res.status(400).json({ error: 'Login 3–32 belgi: harf, raqam, _ . -' });
    if (password.length < 8) return res.status(400).json({ error: 'Parol kamida 8 belgi bo‘lsin' });
    if (db.admins.byUsername(username)) return res.status(409).json({ error: 'Bunday admin mavjud' });
    const id = db.admins.create(username, await bcrypt.hash(password, 12), tg);
    res.json({ ok: true, id });
  });

  r.delete('/admins/:id', (req, res) => {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Noto‘g‘ri ID' });
    if (id === req.admin.id) return res.status(400).json({ error: 'O‘zingizni o‘chira olmaysiz' });
    if (db.admins.count() <= 1) return res.status(400).json({ error: 'Oxirgi adminni o‘chirib bo‘lmaydi' });
    if (!db.admins.remove(id)) return res.status(404).json({ error: 'Admin topilmadi' });
    res.json({ ok: true });
  });

  r.use((req, res) => res.status(404).json({ error: 'Topilmadi' }));
  return r;
};
