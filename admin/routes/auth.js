'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const settings = require('../../config/settings');
const db = require('../../database/db');

const COOKIE = 'speakai_admin';
// Foydalanuvchi topilmasa ham bcrypt vaqtini sarflaymiz (timing hujumiga qarshi)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

function requireAuth(req, res, next) {
  try {
    const payload = jwt.verify(req.cookies[COOKIE] || '', settings.admin.jwtSecret);
    const admin = db.admins.byId(payload.id);
    if (!admin) throw new Error('admin o‘chirilgan');
    req.admin = { id: admin.id, username: admin.username };
    return next();
  } catch {
    return res.status(401).json({ error: 'Autentifikatsiya talab qilinadi' });
  }
}

// CSRF'ga qarshi qo'shimcha: o'zgartiruvchi so'rovlar faqat JSON bilan
function requireJson(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type: application/json kerak' });
  }
  next();
}

module.exports = function authRoutes() {
  const r = express.Router();
  r.use(requireJson);

  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Juda ko‘p urinish. 15 daqiqadan keyin qayta urinib ko‘ring.' } });

  r.post('/login', loginLimiter, async (req, res) => {
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    const admin = username ? db.admins.byUsername(username) : null;
    const ok = await bcrypt.compare(password, admin ? admin.password_hash : DUMMY_HASH);
    if (!admin || !ok) return res.status(401).json({ error: 'Login yoki parol noto‘g‘ri' });
    const token = jwt.sign({ id: admin.id }, settings.admin.jwtSecret, { expiresIn: '12h' });
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: settings.admin.cookieSecure, maxAge: 12 * 3600 * 1000, path: '/' });
    res.json({ ok: true, username: admin.username });
  });

  r.post('/logout', (req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });
  r.get('/me', requireAuth, (req, res) => res.json(req.admin));
  r.requireAuth = requireAuth;
  return r;
};
module.exports.requireAuth = requireAuth;
