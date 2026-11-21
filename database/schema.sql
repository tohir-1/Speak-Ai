-- SpeakAI SQLite sxemasi
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY,                -- Telegram ID
  username     TEXT,
  first_name   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen    TEXT NOT NULL DEFAULT (datetime('now')),
  is_blocked   INTEGER NOT NULL DEFAULT 0 CHECK (is_blocked IN (0,1)),
  referred_by  INTEGER,
  stt_lang     TEXT NOT NULL DEFAULT 'auto',
  tts_lang     TEXT NOT NULL DEFAULT 'uz',
  tts_gender   TEXT NOT NULL DEFAULT 'female' CHECK (tts_gender IN ('male','female')),
  tts_speed    REAL NOT NULL DEFAULT 1.0 CHECK (tts_speed BETWEEN 0.5 AND 2.0),
  tts_pitch    INTEGER NOT NULL DEFAULT 0 CHECK (tts_pitch BETWEEN -12 AND 12),
  tts_format   TEXT NOT NULL DEFAULT 'mp3' CHECK (tts_format IN ('mp3','wav'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created  ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_blocked  ON users(is_blocked);

CREATE TABLE IF NOT EXISTS referrals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id  INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, -- bir foydalanuvchi faqat bir marta hisoblanadi
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (referrer_id <> referred_id)                                          -- o'zini o'zi taklif qila olmaydi
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);

CREATE TABLE IF NOT EXISTS admins (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  telegram_id    INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audio_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('stt','tts','changer','translate','summary')),
  status        TEXT NOT NULL CHECK (status IN ('done','failed')),
  duration_sec  REAL NOT NULL DEFAULT 0,
  error         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_user    ON audio_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON audio_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_type    ON audio_jobs(type, status);

CREATE TABLE IF NOT EXISTS usage_stats (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stt_count        INTEGER NOT NULL DEFAULT 0,
  tts_count        INTEGER NOT NULL DEFAULT 0,
  changer_count    INTEGER NOT NULL DEFAULT 0,
  translate_count  INTEGER NOT NULL DEFAULT 0,
  summary_count    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bot_settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
