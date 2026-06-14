-- Anorak Arcade — production reconciliation for migration 0005.
--   wrangler d1 execute anorak-arcade --remote --file=migrations/0006_identity_fixup.sql
--
-- WHY THIS EXISTS: production had drifted — `scores` (session_id/integrity/client_version)
-- and `play_sessions` were added out-of-band before the migration system, so applying the
-- full 0005 failed on a duplicate `scores.session_id` column (and rolled back). This file
-- contains ONLY the objects 0005 still needs to add on top of that drifted state.
-- A FRESH database should apply 0005 (the complete one), NOT this file.
-- Additive only — no DROP/DELETE; safe for the live data (121 totals / 70 scores / 10 names).

-- ---- provider-agnostic identity (Apple is one of N providers) ----
CREATE TABLE IF NOT EXISTS auth_identities (
  user_id      TEXT    NOT NULL,
  provider     TEXT    NOT NULL,
  provider_sub TEXT    NOT NULL,
  email        TEXT    NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_sub)
);
CREATE INDEX IF NOT EXISTS idx_authid_user ON auth_identities(user_id);
INSERT OR IGNORE INTO auth_identities (user_id, provider, provider_sub, email, created_at)
SELECT id, 'apple', apple_sub, email, created_at FROM users WHERE apple_sub <> '';

-- ---- richer user profiles (these columns were missing in prod) ----
ALTER TABLE users ADD COLUMN handle_lc    TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN display_name TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN country      TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN avatar_seed  TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN verified     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN privacy      TEXT    NOT NULL DEFAULT 'public';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle_lc ON users(handle_lc) WHERE handle_lc <> '';

-- ---- expiry index for the (already-present) play_sessions table ----
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON play_sessions(expires_at);

-- ---- seasons + frozen standings ----
CREATE TABLE IF NOT EXISTS seasons (
  id          TEXT    PRIMARY KEY,
  game        TEXT,
  title       TEXT    NOT NULL DEFAULT '',
  starts_at   INTEGER NOT NULL,
  ends_at     INTEGER NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'active',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seasons_window ON seasons(ends_at DESC);

CREATE TABLE IF NOT EXISTS rank_snapshots (
  scope       TEXT    NOT NULL,
  season_id   TEXT    NOT NULL DEFAULT '',
  game        TEXT    NOT NULL,
  user_id     TEXT,
  name        TEXT    NOT NULL DEFAULT '',
  rank        INTEGER NOT NULL,
  score       INTEGER NOT NULL,
  captured_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snap_lookup ON rank_snapshots(scope, season_id, game, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_snap_user   ON rank_snapshots(user_id, game, captured_at DESC);

-- ---- activity feed ----
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,
  kind        TEXT    NOT NULL,
  subject_user_id TEXT,
  game        TEXT    NOT NULL DEFAULT '',
  payload     TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, created_at DESC);

-- ---- moderation backbone ----
CREATE TABLE IF NOT EXISTS blocks (
  user_id    TEXT    NOT NULL,
  blocked_id TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id TEXT    NOT NULL,
  target_id   TEXT,
  target_kind TEXT    NOT NULL DEFAULT 'user',
  reason      TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

-- ---- backfill verified handles for any user that already owns a unique name ----
UPDATE users SET
  handle_lc    = (SELECT n.name_lc FROM names n WHERE n.user_id = users.id LIMIT 1),
  display_name = (SELECT n.name    FROM names n WHERE n.user_id = users.id LIMIT 1),
  verified     = 1
WHERE EXISTS (SELECT 1 FROM names n WHERE n.user_id = users.id)
  AND handle_lc = '';
