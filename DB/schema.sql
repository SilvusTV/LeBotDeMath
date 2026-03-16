-- Table: config
-- Stores per-guild key/value configuration.
CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (guild_id, key)
);

-- Table: customCommand
-- Stores custom prefix commands per guild.
CREATE TABLE IF NOT EXISTS customCommand (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  title TEXT NOT NULL,
  command TEXT NOT NULL,
  description TEXT NOT NULL,
  response TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (guild_id, command)
);

-- Table: twitchCommand
-- Stores Twitch commands per guild.
CREATE TABLE IF NOT EXISTS twitchCommand (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  title TEXT NOT NULL,
  command TEXT NOT NULL,
  description TEXT NOT NULL,
  response TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (guild_id, command)
);

-- Table: contentAlert
-- Stores YouTube/Twitch alerts per guild.
CREATE TABLE IF NOT EXISTS contentAlert (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_url TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('youtube', 'twitch')),
  discord_channel_id TEXT NOT NULL,
  mention TEXT NOT NULL DEFAULT '',
  provider_channel_id TEXT,
  provider_channel_name TEXT,
  last_content_id TEXT,
  last_content_url TEXT,
  last_content_type TEXT,
  last_announced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (guild_id, provider, channel_url, discord_channel_id)
);
