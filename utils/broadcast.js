'use strict';
const db = require('../database/db');
const logger = require('./logger');

const state = { running: false, total: 0, sent: 0, failed: 0, startedAt: null, finishedAt: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function status() { return { ...state }; }

/** Barcha bloklanmagan foydalanuvchilarga xabar yuboradi (Telegram limiti: ~25 xabar/soniya). */
async function broadcast(telegram, text) {
  if (state.running) throw new Error('Boshqa broadcast hali tugamagan.');
  const ids = db.allActiveUserIds();
  Object.assign(state, { running: true, total: ids.length, sent: 0, failed: 0, startedAt: new Date().toISOString(), finishedAt: null });
  (async () => {
    for (const id of ids) {
      try {
        await telegram.sendMessage(id, text, { parse_mode: 'HTML', disable_web_page_preview: true });
        state.sent++;
      } catch (err) {
        state.failed++;
        if (err && err.response && err.response.parameters && err.response.parameters.retry_after) {
          await sleep(err.response.parameters.retry_after * 1000);
        }
      }
      await sleep(45);
    }
    state.running = false;
    state.finishedAt = new Date().toISOString();
    logger.info(`Broadcast tugadi: yuborildi=${state.sent}, xato=${state.failed}`);
  })().catch((e) => { state.running = false; logger.error('Broadcast xatosi', e); });
  return status();
}

module.exports = { broadcast, status };
