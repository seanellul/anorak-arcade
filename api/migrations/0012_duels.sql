-- Anorak Arcade — head-to-head duels ("beat my score" on the same seed). Apply once:
--   wrangler d1 execute anorak-arcade --remote --file=migrations/0012_duels.sql
-- A challenger sets a target score on a specific game + seed; the opponent must beat it
-- on that same seed. Auto-resolves when the opponent next plays that game/seed.
CREATE TABLE IF NOT EXISTS duels (
  id                TEXT    PRIMARY KEY,
  game              TEXT    NOT NULL,
  seed              TEXT    NOT NULL,            -- shared seed for fairness
  challenger_id     TEXT    NOT NULL,            -- account
  challenger_name   TEXT    NOT NULL DEFAULT '',
  challenger_score  INTEGER,                     -- their result on the seed (NULL until played)
  opponent_name_lc  TEXT    NOT NULL,            -- who was challenged (by name)
  opponent_id       TEXT,                        -- filled once they have an account / respond
  opponent_score    INTEGER,                     -- their result on the seed
  status            TEXT    NOT NULL DEFAULT 'pending',  -- pending | complete | declined | expired
  winner            TEXT    NOT NULL DEFAULT '', -- challenger | opponent | tie
  created_at        INTEGER NOT NULL,
  resolved_at       INTEGER,
  expires_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_duels_opp ON duels(opponent_name_lc, status);
CREATE INDEX IF NOT EXISTS idx_duels_chal ON duels(challenger_id, created_at DESC);
