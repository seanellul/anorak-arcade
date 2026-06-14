-- Anorak Arcade — accounts + social backbone (Cloudflare D1 / SQLite)
-- Apply once over the existing DB:
--   wrangler d1 execute anorak-arcade --remote --file=migrations/0002_accounts.sql
-- Additive only: the anonymous device model (totals.client_id) keeps working untouched.

-- Real accounts, keyed by Sign in with Apple's stable subject id.
CREATE TABLE IF NOT EXISTS users (
  id          TEXT    PRIMARY KEY,          -- our uuid
  apple_sub   TEXT    NOT NULL UNIQUE,      -- Apple 'sub' claim (stable per user per app)
  handle      TEXT    NOT NULL DEFAULT '',  -- display name (arcade handle)
  email       TEXT    NOT NULL DEFAULT '',  -- Apple-provided, first auth only (may be a relay)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Attribute totals to a real user once they sign in. Stays NULL for anonymous devices.
ALTER TABLE totals ADD COLUMN user_id TEXT;          -- run once; errors harmlessly if re-applied
CREATE INDEX IF NOT EXISTS idx_totals_user ON totals(user_id);

-- Community game ideas.
CREATE TABLE IF NOT EXISTS suggestions (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  blurb       TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'open',   -- open | planned | shipped | declined
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_suggestions_created ON suggestions(created_at DESC);

-- One vote per user per suggestion (PK enforces it).
CREATE TABLE IF NOT EXISTS votes (
  suggestion_id TEXT    NOT NULL,
  user_id       TEXT    NOT NULL,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (suggestion_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_suggestion ON votes(suggestion_id);

-- Time-boxed challenges on a specific game (optional fixed seed for fairness).
CREATE TABLE IF NOT EXISTS challenges (
  id          TEXT    PRIMARY KEY,
  game        TEXT    NOT NULL,             -- matches leaderboard GAME ids
  title       TEXT    NOT NULL,
  seed        TEXT    NOT NULL DEFAULT '',  -- optional deterministic seed
  starts_at   INTEGER NOT NULL,
  ends_at     INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_challenges_window ON challenges(ends_at DESC);

-- Best score per user per challenge.
CREATE TABLE IF NOT EXISTS challenge_entries (
  challenge_id TEXT    NOT NULL,
  user_id      TEXT    NOT NULL,
  best_score   INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_centries_board ON challenge_entries(challenge_id, best_score DESC);
