-- Anorak Arcade — leaderboard / playtime data (Cloudflare D1 / SQLite)
-- One row per (device, game). Upserted on every sync. Answers all of:
--   personal time + best score · global time played · per-name high scores
--   most-played games · who plays what & how much (admin)

CREATE TABLE IF NOT EXISTS totals (
  client_id  TEXT    NOT NULL,      -- random uuid stored in the browser (a loose "device")
  game       TEXT    NOT NULL,      -- CINDER | STRATA | CONDUIT | HOMEOSTAT
  name       TEXT    NOT NULL DEFAULT '',   -- whatever they typed (free-text handle); '' = anon
  total_ms   INTEGER NOT NULL DEFAULT 0,
  plays      INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (client_id, game)
);

CREATE INDEX IF NOT EXISTS idx_totals_game_score ON totals(game, best_score DESC);
CREATE INDEX IF NOT EXISTS idx_totals_game       ON totals(game);
CREATE INDEX IF NOT EXISTS idx_totals_updated    ON totals(updated_at DESC);
