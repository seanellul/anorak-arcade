-- Anorak Arcade — competitive layer. Apply once:
--   wrangler d1 execute anorak-arcade --remote --file=migrations/0004_competitive.sql
-- Every run is logged (anonymous or not) so we can rank by time window + daily seed,
-- and display names are globally unique + profanity-screened.

-- One row per submitted score (anonymous included). Powers time-windowed boards.
-- session_id/integrity/client_version support the score-integrity layer (signed,
-- session-bound submissions). integrity: 'legacy' | 'flagged' | 'session' | 'verified'.
CREATE TABLE IF NOT EXISTS scores (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  game           TEXT    NOT NULL,
  name           TEXT    NOT NULL DEFAULT '',   -- canonical (server-resolved) display name; '' = anon
  client_id      TEXT    NOT NULL,
  user_id        TEXT,
  score          INTEGER NOT NULL,
  seed           TEXT    NOT NULL DEFAULT '',   -- '' normal, 'daily-YYYY-MM-DD' for daily runs
  created_at     INTEGER NOT NULL,
  session_id     TEXT,
  integrity      TEXT    NOT NULL DEFAULT 'legacy',
  client_version TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_scores_game_time  ON scores(game, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scores_game_score ON scores(game, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_seed       ON scores(seed, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_integrity  ON scores(game, integrity, score DESC);

-- Server-issued play sessions: a run starts one, the client signs its final score
-- with the session secret, the worker re-checks the HMAC (single-use → anti-replay).
CREATE TABLE IF NOT EXISTS play_sessions (
  id             TEXT    PRIMARY KEY,
  user_id        TEXT,
  client_id      TEXT    NOT NULL,
  game           TEXT    NOT NULL,
  seed           TEXT    NOT NULL DEFAULT '',
  secret         TEXT    NOT NULL,
  client_version TEXT    NOT NULL DEFAULT '',
  started_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,
  consumed_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_psessions_client ON play_sessions(client_id);

-- Globally-unique display names (first-come). name_lc is the uniqueness key.
CREATE TABLE IF NOT EXISTS names (
  name_lc    TEXT    PRIMARY KEY,             -- lowercased
  name       TEXT    NOT NULL,                -- display form
  client_id  TEXT    NOT NULL,
  user_id    TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_names_client ON names(client_id);

-- Awards / unlockables (e.g., daily champion). Granted by the daily-rollover cron (future)
-- or computed live; this is the durable log.
CREATE TABLE IF NOT EXISTS awards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name_lc    TEXT    NOT NULL,
  kind       TEXT    NOT NULL,                -- 'daily_champ' | 'world_no1' | ...
  game       TEXT    NOT NULL DEFAULT '',
  detail     TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_awards_name ON awards(name_lc);

-- ---- backfill from the existing totals so boards aren't empty after switching ----
-- seed the scores log with everyone's all-time best (timestamped at last sync)
INSERT INTO scores (game, name, client_id, user_id, score, seed, created_at)
SELECT game, name, client_id, user_id, best_score, '', updated_at FROM totals WHERE best_score > 0;

-- claim existing names first-come (earliest created_at wins each lowercased name)
INSERT OR IGNORE INTO names (name_lc, name, client_id, created_at)
SELECT LOWER(name), name, client_id, MIN(created_at) FROM totals WHERE name <> '' GROUP BY LOWER(name);
