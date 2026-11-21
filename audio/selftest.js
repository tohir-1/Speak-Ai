'use strict';
// Barcha effektlarni sinab ko'radi: `npm run test:effects`
const fs = require('fs');
const p = require('./processor');
const { EFFECTS, EFFECT_ORDER, buildChain } = require('./effects');
const { safeUnlink } = require('../utils/cleanup');

(async () => {
  const src = p.tempPath('.wav');
  await p.run(require('../config/settings').ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2', '-ar', '44100', '-ac', '1', src]);
  let failed = 0;
  for (const id of EFFECT_ORDER) {
    const out = p.tempPath('.wav');
    try {
      await p.applyFilter(src, buildChain({ effects: [id] }), out);
      const info = await p.probe(out);
      console.log(`✅ ${EFFECTS[id].label.padEnd(18)} ${info.duration.toFixed(2)}s`);
    } catch (e) { failed++; console.log(`❌ ${id}: ${e.message}`); }
    safeUnlink(out);
  }
  const combo = p.tempPath('.wav');
  try {
    await p.applyFilter(src, buildChain({ effects: ['robot', 'echo'], pitch: 3, speed: 1.2, vol: 3 }), combo);
    console.log('✅ Kombinatsiya (robot+echo+pitch+speed+volume)');
  } catch (e) { failed++; console.log('❌ Kombinatsiya:', e.message); }
  safeUnlink(src, combo);
  process.exit(failed ? 1 : 0);
})();
