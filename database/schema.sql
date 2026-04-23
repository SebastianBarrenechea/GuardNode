-- WhatsApp Moderation SQLite Schema
-- Auto-run by migrate.js

-- Config table (first-run setup)
CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  admin_phone TEXT NOT NULL UNIQUE,
  group_id TEXT NOT NULL,
  dashboard_user TEXT NOT NULL UNIQUE,
  dashboard_password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Infractions table
CREATE TABLE IF NOT EXISTS infractions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  group_id TEXT NOT NULL,
  content TEXT,
  media_url TEXT,
  type TEXT NOT NULL CHECK(type IN ('text', 'image', 'video', 'gif', 'sticker')),
  reason TEXT,
  confidence INTEGER CHECK(confidence BETWEEN 0 AND 100),
  strike_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_phone_group (phone, group_id),
  INDEX idx_created (created_at)
);

-- Bans table
CREATE TABLE IF NOT EXISTS bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  group_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  trigger_content TEXT,
  media_url TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(phone, group_id),
  INDEX idx_expires (expires_at),
  INDEX idx_phone (phone)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_infractions_phone ON infractions(phone);
CREATE INDEX IF NOT EXISTS idx_infractions_group ON infractions(group_id);

-- Vacuum for optimization
VACUUM;
