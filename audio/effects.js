'use strict';
/**
 * Voice Changer effektlari — hammasi FFmpeg audio filterlari orqali.
 * Kirish audiosi oldindan 44100 Hz ga keltiriladi (chain `aresample=44100` bilan boshlanadi).
 */
const SR = 44100;

/** atempo faqat 0.5–2.0 oralig'ini qabul qiladi, shuning uchun zanjirga bo'lamiz. */
function atempoChain(factor) {
  const parts = [];
  let f = factor;
  while (f > 2.0) { parts.push('atempo=2.0'); f /= 2.0; }
  while (f < 0.5) { parts.push('atempo=0.5'); f /= 0.5; }
  parts.push(`atempo=${f.toFixed(5)}`);
  return parts;
}

/** Tezlikni o'zgartirmasdan ohangni (pitch) semitonlarda o'zgartirish. */
function pitchFilters(semitones) {
  const f = Math.pow(2, semitones / 12);
  return [`asetrate=${Math.round(SR * f)}`, `aresample=${SR}`, ...atempoChain(1 / f)];
}

const EFFECTS = {
  original: { label: '🎚️ Original', filters: () => [] },
  robot: {
    label: '🤖 Robot',
    filters: () => ["afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75"],
  },
  monster: {
    label: '👹 Monster',
    filters: () => [...pitchFilters(-8), 'lowpass=f=3800', 'vibrato=f=6:d=0.25', 'aecho=0.8:0.6:25:0.4'],
  },
  chipmunk: { label: '🐿️ Chipmunk', filters: () => pitchFilters(7) },
  deep: { label: '👨 Deep Voice', filters: () => [...pitchFilters(-4), 'bass=g=6'] },
  ghost: {
    label: '👻 Ghost',
    filters: () => [...pitchFilters(-2), 'vibrato=f=4:d=0.45', 'aecho=0.8:0.9:700|1300:0.4|0.3', 'highpass=f=200'],
  },
  radio: {
    label: '📻 Radio',
    filters: () => ['highpass=f=350', 'lowpass=f=3200', 'acompressor=threshold=0.1:ratio=6:attack=5:release=60', 'volume=1.6'],
  },
  telephone: {
    label: '☎️ Telephone',
    filters: () => ['highpass=f=500', 'lowpass=f=2800', 'acompressor=threshold=0.15:ratio=4', 'volume=1.4'],
  },
  slow: { label: '🐢 Slow', filters: () => atempoChain(0.75) },
  fast: { label: '⚡ Fast', filters: () => atempoChain(1.4) },
  echo: { label: '🌌 Echo', filters: () => ['aecho=0.8:0.88:450|900:0.45|0.3'] },
  reverb: {
    label: '🎵 Reverb',
    filters: () => ['aecho=0.8:0.7:20|45|80|130:0.4|0.32|0.25|0.18', 'lowpass=f=9000'],
  },
};

const EFFECT_ORDER = ['robot', 'monster', 'chipmunk', 'deep', 'ghost', 'radio', 'telephone', 'slow', 'fast', 'echo', 'reverb', 'original'];

const LIMITS = { pitch: [-12, 12], speed: [0.5, 2.0], vol: [-12, 12] };
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/** Effektlar + foydalanuvchi sozlamalaridan bitta FFmpeg `-af` zanjirini quradi. */
function buildChain({ effects = [], pitch = 0, speed = 1, vol = 0 } = {}) {
  pitch = clamp(Math.round(Number(pitch) || 0), LIMITS.pitch);
  speed = clamp(Number(speed) || 1, LIMITS.speed);
  vol = clamp(Number(vol) || 0, LIMITS.vol);
  const f = [`aresample=${SR}`];
  for (const id of effects) {
    const e = EFFECTS[id];
    if (e) f.push(...e.filters());
  }
  if (pitch !== 0) f.push(...pitchFilters(pitch));
  if (Math.abs(speed - 1) > 0.001) f.push(...atempoChain(speed));
  if (vol !== 0) f.push(`volume=${vol}dB`);
  f.push('alimiter=limit=0.95');
  return f.join(',');
}

module.exports = { EFFECTS, EFFECT_ORDER, LIMITS, buildChain, pitchFilters, atempoChain, SR };
