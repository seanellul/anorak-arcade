-- Anorak Arcade — identity + score-integrity foundation. Apply once:
--   wrangler d1 execute anorak-arcade --remote --file=migrations/0005_identity_integrity.sql
--
-- This is the bedrock for a competitive arcade with money on the line: every score
-- that can ever touch a payout must be (a) attributable to a verified human and
-- (b) defensible against replay/tamper. Additive only — the anonymous device model
-- and the existing /api/sync path keep working untouched (those rows are 'legacy').

-- ---------------------------------------------------------------------------
-- Provider-agnostic identity. Apple is one of N providers; Google / email /
-- Passkey slot in later with zero migration (just new rows here).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_identities (
  user_id     TEXT    NOT NULL,
  provider    TEXT    NOT NULL,                -- 'apple' | 'google' | 'email' | 'passkey'
  provider_sub TEXT   NOT NULL,                -- the provider's stable subject id
  email       TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_sub)
);
CREATE INDEX IF NOT EXISTS idx_authid_user ON auth_identities(user_id);

-- Backfill the existing Apple accounts so users has a single source of identity.
INSERT OR IGNORE INTO auth_identities (user_id, provider, provider_sub, email, created_at)
SELECT id, 'apple', apple_sub, email, created_at FROM users WHERE apple_sub <> '';

-- ---------------------------------------------------------------------------
-- Richer user profiles. Each ADD COLUMN errors harmlessly if re-applied.
--   handle_lc    -> unique handle key (the @identity; '' until claimed)
--   display_name -> freeform cosmetic name (defaults to handle)
--   verified     -> 1 once signed-in with a claimed unique handle (payout-eligible)
--   privacy      -> 'public' | 'friends' | 'private'
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN handle_lc    TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN display_name TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN country      TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN avatar_seed  TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN verified     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN privacy      TEXT    NOT NULL DEFAULT 'public';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle_lc ON users(handle_lc) WHERE handle_lc <> '';

-- ---------------------------------------------------------------------------
-- Play sessions — the integrity seam. A score is only payout-eligible if it was
-- submitted against a live, server-issued session bound to the game (+ daily seed)
-- and signed with that session's secret. Single-use: one run -> one final score.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS play_sessions (
  id          TEXT    PRIMARY KEY,             -- uuid; the sessionId handed to the client
  user_id     TEXT,                            -- NULL for anonymous play
  client_id   TEXT    NOT NULL,
  game        TEXT    NOT NULL,
  seed        TEXT    NOT NULL DEFAULT '',     -- 'daily-YYYY-MM-DD' for daily runs, else ''
  secret      TEXT    NOT NULL,                -- per-session HMAC secret (random)
  client_version TEXT NOT NULL DEFAULT '',
  started_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER                          -- set when a score is accepted; blocks replay
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON play_sessions(expires_at);

-- ---------------------------------------------------------------------------
-- Score provenance. Every accepted score carries how much we trust it:
--   'verified' -> valid session + signed-in user (the payout-eligible board)
--   'session'  -> valid session, anonymous (tamper-checked but not eligible)
--   'legacy'   -> the old trusted /api/sync path (default; pre-integrity)
--   'flagged'  -> failed a per-game sanity rule (kept for audit, hidden from boards)
-- ---------------------------------------------------------------------------
ALTER TABLE scores ADD COLUMN session_id     TEXT;
ALTER TABLE scores ADD COLUMN integrity      TEXT    NOT NULL DEFAULT 'legacy';
ALTER TABLE scores ADD COLUMN client_version TEXT    NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_scores_integrity ON scores(game, integrity, score DESC);

-- ---------------------------------------------------------------------------
-- Seasons — the core economic primitive. Top-N of a finished season is exactly
-- the set a revenue split would reward. game NULL = an arcade-wide season.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seasons (
  id          TEXT    PRIMARY KEY,
  game        TEXT,                            -- NULL = arcade-wide
  title       TEXT    NOT NULL DEFAULT '',
  starts_at   INTEGER NOT NULL,
  ends_at     INTEGER NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'active', -- 'active' | 'closed'
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seasons_window ON seasons(ends_at DESC);

-- Frozen standings: rank history (climb/fall deltas) + immutable season-end snapshots.
CREATE TABLE IF NOT EXISTS rank_snapshots (
  scope       TEXT    NOT NULL,                -- 'global' | 'season'
  season_id   TEXT    NOT NULL DEFAULT '',     -- '' for rolling global snapshots
  game        TEXT    NOT NULL,
  user_id     TEXT,
  name        TEXT    NOT NULL DEFAULT '',     -- denormalised for anonymous / display
  rank        INTEGER NOT NULL,
  score       INTEGER NOT NULL,
  captured_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snap_lookup ON rank_snapshots(scope, season_id, game, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_snap_user   ON rank_snapshots(user_id, game, captured_at DESC);

-- ---------------------------------------------------------------------------
-- Activity feed — the social heartbeat ("Kai took your #3 in CINDER").
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,                -- whose feed/actor this belongs to
  kind        TEXT    NOT NULL,                -- 'best' | 'overtaken' | 'no1' | 'daily' | 'badge'
  subject_user_id TEXT,                        -- the other player, when relevant
  game        TEXT    NOT NULL DEFAULT '',
  payload     TEXT    NOT NULL DEFAULT '',     -- small JSON blob (score, rank, etc.)
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Moderation backbone — required before money is involved.
-- ---------------------------------------------------------------------------
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
  target_kind TEXT    NOT NULL DEFAULT 'user', -- 'user' | 'score' | 'suggestion'
  reason      TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'open'   -- 'open' | 'reviewed' | 'dismissed'
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Backfill: existing claimed names imply a verified handle for their owners, so
-- the move to user_id as the canonical board key is seamless. Sets handle_lc +
-- display_name on users that already own a unique name via a linked client.
-- ---------------------------------------------------------------------------
UPDATE users SET
  handle_lc    = (SELECT n.name_lc FROM names n WHERE n.user_id = users.id LIMIT 1),
  display_name = (SELECT n.name    FROM names n WHERE n.user_id = users.id LIMIT 1),
  verified     = 1
WHERE EXISTS (SELECT 1 FROM names n WHERE n.user_id = users.id)
  AND handle_lc = '';
