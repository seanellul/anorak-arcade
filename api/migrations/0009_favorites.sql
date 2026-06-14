-- Anorak Arcade — global favourites. Apply once:
--   wrangler d1 execute anorak-arcade --remote --file=migrations/0009_favorites.sql
-- One row per (subject, game); subject = user_id when signed in, else client_id.
CREATE TABLE IF NOT EXISTS favorites (
  subject    TEXT    NOT NULL,
  game       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (subject, game)
);
CREATE INDEX IF NOT EXISTS idx_fav_game ON favorites(game);
