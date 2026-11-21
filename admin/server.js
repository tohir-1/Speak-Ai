'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const settings = require('../config/settings');
const db = require('../database/db');
const logger = require('../utils/logger');

async function bootstrapAdmin() {
  if (db.admins.count() > 0) return;
  const { username, password } = settings.admin;
  if (!password || password.length < 8) {
    logger.warn('Admin yo‘q! .env da ADMIN_PASSWORD (kamida 8 belgi) ni ko‘rsating va qayta ishga tushiring.');
    return;
  }
  db.admins.create(username, await bcrypt.hash(password, 12));
  logger.info(`Birinchi admin yaratildi: ${username}`);
}

async function startAdmin(telegram) {
  settings.validate({ needBot: false, needAdmin: true });
  await bootstrapAdmin();

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
      },
    },
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api', require('./routes/auth')());
  app.use('/api', require('./routes/api')(telegram));
  app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: 0 }));

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    logger.error('Admin xatosi:', err);
    res.status(500).json({ error: 'Server xatosi' });
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(settings.admin.port, settings.admin.host, () => {
      logger.info(`Admin panel: http://${settings.admin.host}:${settings.admin.port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = { startAdmin };
